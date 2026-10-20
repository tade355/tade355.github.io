"""Full backup of the live ERP to a JSON file kept OUTSIDE this public repository.

    ERP_PW=... python tools/backup_erp.py ~/emagrims-backups          # writes emagrims-erp-backup-<date>.json
    ERP_PW=... python tools/backup_erp.py ~/emagrims-backups --keep 12 # also keep only the newest 12 files

Every table in erp/js/store.js is read in pages (PostgREST returns at most 1000 rows per request), with line
items inside their parent rows, in the same shape the ERP's own "Download Backup" button writes. Run it
weekly (cron or a scheduled task on a private machine). Never point it at a folder inside the repository:
the data is private and the repository is public.
"""
import json, re, sys, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from erp_rest import get_all, ROOT  # noqa: E402

CONFIG = (ROOT / 'erp/js/store.js').read_text()
TABLES = re.findall(r"^\s+(\w+): \{ table: '(\w+)'(?:, prefix: '[^']*')?(?:, child: \{ key: '(\w+)', table: '(\w+)', fk: '(\w+)' \})?", CONFIG, re.M)


def camel(k):
    return re.sub(r'_([a-z0-9])', lambda m: m.group(1).upper(), k)


def camel_row(row, child=None):
    out = {camel(k): v for k, v in row.items() if not (child and k == child[1])}
    if child:
        key, table = child[0], child[1]
        out[key] = [{camel(k): v for k, v in c.items() if k not in ('id', 'sort_order', child[2])}
                    for c in sorted(row.get(table) or [], key=lambda c: c.get('sort_order') or 0)]
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        raise SystemExit(__doc__)
    folder = Path(args[0]).expanduser().resolve()
    if ROOT in folder.parents or folder == ROOT:
        raise SystemExit('Refusing to write a backup inside the repository (it is public). Choose a folder outside it.')
    folder.mkdir(parents=True, exist_ok=True)
    snapshot, counts = {}, {}
    for key, table, ckey, ctable, cfk in TABLES:
        child = (ckey, ctable, cfk) if ckey else None
        select = f'*,{ctable}(*)' if child else '*'
        rows = get_all(f'/rest/v1/{table}?select={select}&order=id')
        snapshot[key] = [camel_row(r, child) for r in rows]
        counts[key] = len(rows)
    out = folder / f'emagrims-erp-backup-{datetime.date.today().isoformat()}.json'
    out.write_text(json.dumps(snapshot, indent=2, default=str))
    print(f'wrote {out} ({out.stat().st_size // 1024} KB): ' + ', '.join(f'{k} {v}' for k, v in counts.items() if v))
    if '--keep' in sys.argv:
        keep = int(sys.argv[sys.argv.index('--keep') + 1])
        old = sorted(folder.glob('emagrims-erp-backup-*.json'))[:-keep]
        for f in old:
            f.unlink()
            print('removed', f.name)


if __name__ == '__main__':
    main()
