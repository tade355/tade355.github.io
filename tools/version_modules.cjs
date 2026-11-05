// Keep a release's module graph consistent when browsers cache older JS files.
const fs = require('node:fs');
const path = require('node:path');
function versionHtml(html, files, version) {
  if (!version || !/^[a-zA-Z0-9._-]+$/.test(version)) throw new Error('Supply a release version using letters, numbers, dots, underscores or hyphens.');
  const entry = /<script\b[^>]*type="module"[^>]*src="(?:\.\/)?js\/main\.js(?:\?[^"]*)?"[^>]*><\/script>/g;
  if ((html.match(entry) || []).length !== 1) throw new Error('Expected exactly one ERP main module entry. No files changed.');
  const imports = Object.fromEntries([...files].sort().map(file => [file, `${file}?release=${version}`]));
  html = html.replace(/\s*<script type="importmap" id="releaseModules">[\s\S]*?<\/script>/g, '');
  html = html.replace(/\s*<meta name="emagrims-release" content="[^"]*">/g, '');
  html = html.replace('<title>', `<meta name="emagrims-release" content="${version}">\n  <title>`);
  return html.replace(entry, `<script type="importmap" id="releaseModules">${JSON.stringify({ imports })}</script>\n  <script type="module" src="js/main.js?release=${version}"></script>`);
}

if (require.main === module) {
  const root = path.resolve(__dirname, '../erp');
  const files = [];
  function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) files.push('./' + path.relative(root, file).split(path.sep).join('/'));
  } }
  walk(path.join(root, 'js'));
  const index = path.join(root, 'index.html');
  fs.writeFileSync(index, versionHtml(fs.readFileSync(index, 'utf8'), files, process.argv[2]));
  console.log(`Versioned ${files.length} runtime modules for ${process.argv[2]}.`);
}

module.exports = { versionHtml };
