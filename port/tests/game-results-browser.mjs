// UI and runtime integration in Chromium; the renderer is stubbed, storage and
// file-backed result endpoints are real. No disc assets or real history touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createResultStore, handleResults} from '../web/results.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt3-results-browser-'));
const file = path.join(dir, 'games.jsonl'), store = createResultStore(file);
const root = new URL('../web/', import.meta.url);
let offline = false;
const runtime = `
window.FS = {mkdir(){}, mount(){}, syncfs(read, cb){cb();}};
window.IDBFS = {};
Module.webDiscIndex = async () => 1;
Module.callMain = async () => { window.testStarted = true; };
Module.onRuntimeInitialized();`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://test');
  if (offline && url.pathname === '/api/results') return res.writeHead(503).end();
  if (handleResults(req, res, url, store)) return;
  const pages = {'/': 'player.html', '/game.html': 'shell.html', '/results.js': 'results.js', '/net.css': 'net.css'};
  if (pages[url.pathname]) return res.writeHead(200, {'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html'}).end(fs.readFileSync(new URL(pages[url.pathname], root)));
  if (/bt3-(jspi|async)\.js$/.test(url.pathname)) return res.writeHead(200, {'Content-Type': 'text/javascript'}).end(runtime);
  if (url.pathname === '/net.js') return res.writeHead(200, {'Content-Type': 'text/javascript'}).end('');
  res.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(base + '/?pick=1');
  await page.locator('#results-total').filter({hasText: '0 games recorded'}).waitFor();
  await page.locator('#player-one').fill('Goku');
  await page.locator('#player-two').fill('Vegeta');
  await page.getByRole('button', {name: 'Save names'}).click();
  await page.locator('#names-status').filter({hasText: 'Names saved'}).waitFor();
  const frame = page.frames().find(frame => frame.url().includes('/game.html'));
  await frame.locator('#iso').setInputFiles({name: 'test.iso', mimeType: 'application/octet-stream', buffer: Buffer.from([1,2,3,4])});
  await frame.waitForFunction(() => window.testStarted);
  const finish = (flags, reason = 1) => frame.evaluate(({flags, reason}) => {
    BT3Results.start({gameMode: 0, cpu: [false, false], pads: [0, 1]});
    BT3Results.finish(flags, reason, 900);
  }, {flags, reason});
  await finish(2);
  await page.locator('#result-history li').filter({hasText: 'Vegeta won'}).waitFor();
  assert.equal(await page.locator('#leaderboard-rows tr').first().locator('td').nth(1).textContent(), 'Vegeta');
  await finish(4, 2);
  await page.locator('#result-history li').filter({hasText: 'Draw'}).waitFor();
  offline = true;
  await finish(1);
  await page.locator('#results-status').filter({hasText: 'waiting to save'}).waitFor();
  assert.equal(store.snapshot().total, 2);
  offline = false;
  await page.reload();
  await page.locator('#results-total').filter({hasText: '3 games recorded'}).waitFor();
  assert.equal(await page.locator('#player-one').inputValue(), 'Goku', 'names survive reload');
  assert.equal(createResultStore(file).snapshot().total, 3, 'persisted records survive a fresh store');
  const newerFrame = page.frames().find(frame => frame.url().includes('/game.html'));
  await newerFrame.evaluate(() => {
    BT3Results.start({gameMode: 0, cpu: [false, true], pads: [0, 1]});
    BT3Results.finish(8, 0, 100);
  });
  await page.locator('#result-history li').filter({hasText: 'Aborted'}).waitFor();
  assert.equal(store.snapshot().leaderboard.find(row => row.username === 'Goku').played, 3, 'aborts do not count');
  // Treat names as text, never markup.
  await page.locator('#player-one').fill('<img src=x>');
  await page.getByRole('button', {name: 'Save names'}).click();
  await newerFrame.evaluate(() => {
    BT3Results.start({gameMode: 0, cpu: [false, true], pads: [0, 1]});
    BT3Results.finish(1, 1, 100);
  });
  await page.locator('#leaderboard-rows td').filter({hasText: '<img src=x>'}).waitFor();
  assert.equal(await page.locator('.standings img').count(), 0);
  await page.setViewportSize({width: 375, height: 812});
  await page.locator('#leaderboard-title').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile has no page overflow');
  if (process.env.BT3_TEST_SCREENSHOT) await page.screenshot({path: process.env.BT3_TEST_SCREENSHOT, fullPage: true});
  assert.deepEqual(errors, []);
  console.log('PASS: Chromium names, iframe capture, winner/draw/abort display, persisted history, offline reload retry, text escaping and mobile layout (renderer stubbed)');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dir, {recursive: true, force: true});
}
