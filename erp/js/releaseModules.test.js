import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { versionHtml } from '../../tools/version_modules.cjs';

const files = ['./js/store.js', './js/main.js', './js/views/fundRequests.js'];
const fixture = '<html><head><title>ERP</title></head><body><script type="module" src="js/main.js?release=old"></script></body></html>';
const readMap = html => JSON.parse(html.match(/<script type="importmap" id="releaseModules">([\s\S]*?)<\/script>/)[1]).imports;

test('releasing an already-versioned page replaces the entry point and every module URL', () => {
  const first = versionHtml(fixture, files, 'release-a');
  const second = versionHtml(first, files, 'release-b');
  assert.equal((second.match(/type="importmap"/g) || []).length, 1);
  assert.equal((second.match(/name="emagrims-release"/g) || []).length, 1);
  assert.match(second, /src="js\/main\.js\?release=release-b"/);
  for (const file of files) assert.equal(readMap(second)[file], `${file}?release=release-b`);
  assert.equal(versionHtml(second, files, 'release-b'), second);
  assert.ok(!second.includes('release-a'));
});

test('release refuses missing or duplicate app entries instead of silently publishing a stale map', () => {
  assert.throws(() => versionHtml('<html></html>', files, 'v1'), /exactly one/);
  assert.throws(() => versionHtml(fixture + fixture, files, 'v1'), /exactly one/);
});

test('the shipped data loader and entry point use the current release address', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const release = html.match(/name="emagrims-release" content="([^"]+)"/)[1];
  const map = readMap(html);
  for (const [file, url] of Object.entries(map)) assert.equal(url, `${file}?release=${release}`, file);
  assert.ok(html.includes(`src="js/main.js?release=${release}"`));
});
