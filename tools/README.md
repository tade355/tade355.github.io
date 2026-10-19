# Operations tools

Scripts used to run the ERP day to day. None of them contain credentials.

Set these in your shell (or the Codex environment secrets) before running any of them:

    ERP_PW=<the olumide login password>      # never commit it
    ERP_USER=olumide                         # optional, default olumide
    CHROMIUM_PATH=/path/to/chromium          # optional, only if Playwright cannot find a browser

| Script | What it does |
|---|---|
| `erp_rest.py` | Python helper for reading and writing the live Supabase tables (login, `get`, `req`, `nid`, `ins`, `upd`). Import it from your own scripts. |
| `dashboard_download.cjs` | Logs in to the live ERP, opens the Daily Operations Dashboard for a date, ticks the dozers that are active tomorrow, and saves the downloadable HTML. |
| `screenshot_page.cjs` | Logs in and saves a full-page screenshot of any ERP page or tab. |
| `import_upload.cjs` | Runs an Excel file through the Data Import page (preview, or import with `go`). |
| `midejab_tracker.py` | Appends collections and payments to the Midejab Excel tracker and extends its totals. |
| `build_ago_planner.py` | Example workbook builder for the AGO planner (planner sheet, missing-diesel sheet, dozer variance sheet). Copy and edit the data block at the top for each day. |

Install once: `npm i playwright-core` (needs a Chromium), `pip install openpyxl`. LibreOffice (`soffice`) plus `pdftoppm` turn a workbook into a picture.
