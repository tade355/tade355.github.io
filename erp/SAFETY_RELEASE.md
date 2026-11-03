# Browser safety release — 3 November 2026

This release requires no database migration and changes no business records.

- Keeps historical diesel collections when later receipts are added.
- Leaves unconfirmed delivery destinations unassigned.
- Preserves cached rows on failed reads and blocks incomplete reports/exports.
- Adds backup count manifests and read-only validation; disables destructive browser replacement.
- Skips existing generated IDs, checks transient version-read failures and reloads saved server results.
- Keeps payroll day fractions precise and excludes scheduled maintenance from the repair signal.
- Adds an application reload path for failed page loads.

Database authorization, audit activation, checked transactional saves, payment dates,
cash/commitment reporting and linked advance settlement are in the separate integrity
release. Existing database write compatibility remains in place until that migration.

Rollback: revert this release commit and redeploy. Business records need no restoration
for a code rollback. Keep the pre-release data export/source bundle privately; never
publish data backups in this repository or CI artifacts.
