Third-party libraries served from this folder so the ERP does not depend on a CDN being up.

- `supabase-js.min.js`: @supabase/supabase-js 2.110.3 (MIT), bundled with esbuild (`createClient` export only).
- `emailjs.min.js`: @emailjs/browser 4.4.1, bundled with esbuild (default export).
- `exceljs.min.js`, `xlsx.core.min.js`, `pdf.min.js`, `pdf.worker.min.js`: unchanged.

To rebuild a bundle: `npm i <package>@<version> esbuild`, then `npx esbuild entry.mjs --bundle --format=esm --platform=browser --target=es2022 --minify --outfile=<name>`.
