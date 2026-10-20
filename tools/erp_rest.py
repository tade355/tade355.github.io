"""REST helper for the live Emagrims ERP (Supabase PostgREST).

Reads the project URL and anon key from erp/js/supabaseClient.js and logs in as
the ERP user with the password in the ERP_PW environment variable.

    from erp_rest import get, get_all, req, nid, ins, upd
    rows = get('/rest/v1/fund_requests?status=eq.Pending&select=id,date,description')
"""
import json, os, re, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_src = (ROOT / 'erp/js/supabaseClient.js').read_text()
URL = re.search(r"https://[a-z0-9]+\.supabase\.co", _src).group(0)
KEY = re.search(r'eyJ[A-Za-z0-9._-]+', _src).group(0)
USER = os.environ.get('ERP_USER', 'olumide')


def _login():
    body = json.dumps({'email': f'{USER}@emagrims-erp.app', 'password': os.environ['ERP_PW']}).encode()
    r = urllib.request.Request(URL + '/auth/v1/token?grant_type=password', data=body,
                               headers={'apikey': KEY, 'Content-Type': 'application/json'}, method='POST')
    return json.load(urllib.request.urlopen(r))['access_token']


TOKEN = _login()


def req(method, path, body=None, prefer=None):
    headers = {'apikey': KEY, 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'}
    if prefer:
        headers['Prefer'] = prefer
    r = urllib.request.Request(URL + path, data=json.dumps(body).encode() if body is not None else None,
                               headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as f:
            text = f.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{e.code} {e.read().decode()[:600]}')


def get(path):
    return req('GET', path)


def get_all(path, page=1000):
    """Every row of a query. PostgREST returns at most 1000 rows per request, so read in pages
    (the path must not already contain limit or offset). Add an order for a stable paging,
    e.g. '/rest/v1/operations?select=*&order=id'."""
    rows, offset = [], 0
    sep = '&' if '?' in path else '?'
    while True:
        chunk = get(f'{path}{sep}limit={page}&offset={offset}')
        rows.extend(chunk)
        if len(chunk) < page:
            return rows
        offset += page


def ins(table, row):
    """Insert one row and return it."""
    return req('POST', f'/rest/v1/{table}', row, 'return=representation')[0]


def upd(table, record_id, patch):
    req('PATCH', f'/rest/v1/{table}?id=eq.{record_id}', patch)


def nid(prefix, table):
    """Next record id such as FR-115.

    The server counter (rpc next_record_id, parameter p_prefix) can lag behind
    the highest id already in the table, so keep drawing until it is ahead.
    """
    highest = max(int(x['id'].split('-')[-1]) for x in get(f'/rest/v1/{table}?select=id'))
    for _ in range(500):
        value = req('POST', '/rest/v1/rpc/next_record_id', {'p_prefix': prefix})
        number = int(str(value).split('-')[-1])
        if number > highest:
            return value if isinstance(value, str) else f'{prefix}-{number}'
    raise SystemExit('id counter did not advance')
