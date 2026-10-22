// node port/tests/local-disc-session-browser.mjs (requires Playwright + Chromium).
// Stub the game engine; exercise the real DOM, File APIs and frame navigations.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../web/', import.meta.url));
const runtime = `
window.FS = {mkdir(){}, mount(){}, syncfs(read, cb){cb();}};
window.IDBFS = {};
Module.webDiscIndex = async () => { window.discBytes = Array.from(await Module.webDisc.readAt(0, 4)); return 1; };
Module.callMain = async () => { window.testStarted = true; };
Module.onRuntimeInitialized();`;
let remoteReads = 0;
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://test').pathname;
  if (p === '/' || p === '/game.html') return res.writeHead(200, {'Content-Type': 'text/html'}).end(fs.readFileSync(root + (p === '/' ? 'player.html' : 'shell.html')));
  if (/bt3-(jspi|async)\.js$/.test(p)) return res.writeHead(200, {'Content-Type': 'text/javascript'}).end(runtime);
  if (p === '/net.js') return res.writeHead(200, {'Content-Type': 'text/javascript'}).end('');
  if (p.startsWith('/disc')) remoteReads++;
  res.writeHead(404).end();
});
(async () => {
 await new Promise(ok => server.listen(0, '127.0.0.1', ok));
 const browser = await chromium.launch({headless: true});
 try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(base + '/?pick=1');
  let frame = page.frames().find(f => f.url().includes('/game.html'));
  await frame.locator('#iso').setInputFiles({name:'game-super.iso', mimeType:'application/octet-stream', buffer:Buffer.from([1,2,3,4])});
  await frame.waitForFunction(() => window.testStarted, null, {timeout: 10000}).catch(async e => {console.log(await frame.evaluate(() => ({status:document.getElementById('status')?.textContent, err:document.getElementById('err')?.textContent, log:Module.log, hasFile:!!parent.BT3LocalDisc.file, pending:!!Module.pendingStart, ready:Module.ready, bytes:window.discBytes})), errors); throw e;});
  assert.equal(await page.evaluate(() => window.BT3LocalDisc.file.name), 'game-super.iso');
  for (const suffix of ['?pick=1&net=host&room=TEST', '?pick=1&nomovie=1&netmsg=Connection+lost']) {
   await frame.goto(base + '/game.html' + suffix);
   await frame.waitForFunction(() => window.testStarted, null, {timeout: 10000}).catch(async e => {console.log(await frame.evaluate(() => ({status:document.getElementById('status')?.textContent, err:document.getElementById('err')?.textContent, log:Module.log, hasFile:!!parent.BT3LocalDisc.file, pending:!!Module.pendingStart, ready:Module.ready, bytes:window.discBytes})), errors); throw e;});
   assert.deepEqual(await frame.evaluate(() => window.discBytes), [1,2,3,4]);
   assert.equal(await frame.locator('#start').count(), 0);
  }
  assert.equal(remoteReads, 0);
  assert.deepEqual(errors, []);
  console.log('PASS: Chromium retains a real selected File through match-entry and disconnect frame reloads; no remote ISO reads or page errors (game runtime stubbed).');
 } finally {await browser.close();}
})().catch(e => {console.error(e); process.exitCode = 1;}).finally(() => server.close());
