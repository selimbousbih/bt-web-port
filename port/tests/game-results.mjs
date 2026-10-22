// File persistence and the real HTTP handlers, without game assets.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createResultStore, handleResults} from '../web/results.mjs';
import worker from '../../cloudflare/src/worker.js';

const result = (id, winner = 0, extra = {}) => ({id, mode: 'local', gameMode: 0,
  players: [{username: 'Goku', cpu: false}, {username: 'Vegeta', cpu: false}],
  outcome: winner === null ? 'draw' : 'win', winner, reason: 'ko', frames: 900, ...extra});

test('results survive restart; retries, draws, CPUs, aborts and ranking', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt3-results-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'games.jsonl');
  let store = createResultStore(file);
  assert.deepEqual(store.snapshot(), {leaderboard: [], recent: [], total: 0});
  assert.equal(store.append(result('match-0001')).created, true);
  assert.equal(store.append(result('match-0001')).created, false);
  store.append(result('match-0002', 1));
  store.append(result('match-0003', null, {reason: 'time'}));
  store.append(result('match-0004', null, {outcome: 'aborted', reason: 'disconnect'}));
  store.append(result('match-0005', 0, {players: [{username: 'goku', cpu: false}, {username: 'CPU', cpu: true}]}));
  const before = store.snapshot();
  assert.equal(before.total, 5);
  assert.deepEqual(before.leaderboard, [
    {username: 'Goku', wins: 2, losses: 1, draws: 1, played: 4},
    {username: 'Vegeta', wins: 1, losses: 1, draws: 1, played: 3},
  ]);
  store = createResultStore(file);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(store.append(result('match-0001')).created, false, 'retries after server restart must be idempotent');
  assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length, 5);
  for (let i = 6; i <= 28; i++) store.append(result('match-' + String(i).padStart(4, '0')));
  assert.equal(store.snapshot().total, 28);
  assert.equal(store.snapshot().recent.length, 20);
  assert.equal(store.snapshot().recent[0].id, 'match-0028');
  assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length, 28, 'full history is retained');
});

test('invalid/corrupt input is rejected without destroying existing results', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt3-results-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'games.jsonl'), store = createResultStore(file);
  for (const value of [null, {}, result('../escape'), result('match-0001', 2),
    result('match-0001', null, {outcome: 'win'}), result('match-0001', 1, {frames: -1}),
    result('match-0001', 0, {players: [{username: 'bad\nname', cpu: false}, {username: 'CPU', cpu: true}]})]) {
    assert.throws(() => store.append(value));
  }
  assert.equal(store.snapshot().total, 0);
  fs.writeFileSync(file, JSON.stringify({...result('match-0001'), playedAt: new Date().toISOString()}));
  createResultStore(file).append(result('match-0002'));
  assert.equal(createResultStore(file).snapshot().total, 2, 'missing final newline is handled');
  fs.appendFileSync(file, '{broken');
  assert.throws(() => createResultStore(file), /line 3/);
  assert.ok(fs.readFileSync(file, 'utf8').endsWith('{broken'));
});

test('HTTP endpoints persist once, validate requests and return standings', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt3-results-http-'));
  const store = createResultStore(path.join(dir, 'games.jsonl'));
  const server = http.createServer((req, res) => {
    if (!handleResults(req, res, new URL(req.url, 'http://test'), store)) res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, {recursive: true, force: true}); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = body => fetch(base + '/api/results', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const unicode = result('match-http', 1, {players: [{username: '悟空', cpu: false}, {username: 'Végéta', cpu: false}]});
  assert.equal((await post(unicode)).status, 201);
  assert.equal((await post(unicode)).status, 200);
  const response = await fetch(base + '/api/leaderboard');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.total, 1);
  assert.equal(data.leaderboard[0].username, 'Végéta');
  assert.equal(data.recent[0].players[0].username, '悟空');
  assert.equal((await post(result('match-bad', 3))).status, 400);
  assert.equal((await fetch(base + '/api/results', {method: 'POST', body: '{}'})).status, 415);
  assert.equal((await post({padding: 'a'.repeat(9000)})).status, 413);
  assert.equal((await fetch(base + '/api/results')).status, 405);
  assert.equal((await fetch(base + '/api/leaderboard', {method: 'POST'})).status, 405);
  const env = {BT3_KEY: 'test-key', ASSETS: {fetch: req => {
    const url = new URL(req.url);
    return fetch(base + url.pathname + url.search, req);
  }}};
  assert.equal((await worker.fetch(new Request('http://game.test/api/leaderboard'), env)).status, 403);
  const tunnelResult = await worker.fetch(new Request('http://game.test/api/leaderboard?k=test-key'), env);
  assert.equal(tunnelResult.status, 200, 'authenticated tunnel traffic reaches the local file-backed API');
  assert.equal((await tunnelResult.json()).total, 1);
  assert.equal(store.snapshot().total, 1);
});
