// Keep a release's module graph consistent when browsers cache older JS files.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'../erp');
const version = process.argv[2];
if (!version || !/^[a-zA-Z0-9._-]+$/.test(version)) throw new Error('Supply a release version using letters, numbers, dots, underscores or hyphens.');
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
  const file = path.join(dir,entry.name);
  if(entry.isDirectory())walk(file); else if(entry.name.endsWith('.js')&&!entry.name.endsWith('.test.js'))files.push('./'+path.relative(root,file).split(path.sep).join('/'));
} }
walk(path.join(root,'js'));
const imports = Object.fromEntries(files.sort().map(file=>[file,`${file}?release=${version}`]));
const index = path.join(root,'index.html');
let html = fs.readFileSync(index,'utf8').replace(/\s*<script type="importmap" id="releaseModules">[\s\S]*?<\/script>/,'');
html = html.replace(/\s*<meta name="emagrims-release" content="[^"]*">/,'');
html = html.replace('<title>',`<meta name="emagrims-release" content="${version}">\n  <title>`);
html = html.replace('<script type="module" src="js/main.js"></script>',`<script type="importmap" id="releaseModules">${JSON.stringify({imports})}</script>\n  <script type="module" src="js/main.js"></script>`);
fs.writeFileSync(index,html);
console.log(`Versioned ${files.length} runtime modules for ${version}.`);
