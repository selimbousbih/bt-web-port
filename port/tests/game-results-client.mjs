// Exercise the runtime's public bridge and retry queue with real browser scripts.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../web/results.js', import.meta.url), 'utf8');
const values = new Map([['bt3.name', 'Goku'], ['bt3.name2', 'Vegeta']]);
const localStorage = {getItem: key => values.get(key) ?? null, setItem: (key, v) => values.set(key, v),
  removeItem: key => values.delete(key), key: i => [...values.keys()][i], get length() {return values.size;}};
let seq = 0, available = true;
const saved = [], info = {gameMode: 0, cpu: [false, false], pads: [0, 1]};
function runtime(session = null, parent = null) {
  const listeners = {};
  const window = {BT3Net: {session, link: {peerName: 'Piccolo'}}};
  window.parent = parent || window;
  vm.runInNewContext(source, {window, BT3Net: window.BT3Net, localStorage,
    crypto: {randomUUID: () => 'result-' + String(++seq).padStart(5, '0')},
    location: {search: ''}, document: {readyState: 'loading', getElementById: () => null},
    addEventListener: (key, fn) => {listeners[key] = fn;}, setInterval() {},
    fetch: async (url, opts) => {
      if (!available) throw new Error('offline');
      const result = JSON.parse(opts.body);
      saved.push(result); return {ok: true, json: async () => result};
    },
  });
  return {api: window.BT3Results, window, mount: () => listeners.DOMContentLoaded()};
}
const settle = () => new Promise(resolve => setImmediate(resolve));
let client = runtime();
client.api.start(info);
values.set('bt3.name', 'Changed'); // mid-match edits must not relabel a match
client.api.finish(2, 1, 600);
client.api.finish(2, 1, 600);
await settle();
assert.equal(saved.length, 1, 'a battle is reported once');
assert.equal(saved[0].players[0].username, 'Goku');
assert.equal(saved[0].players[1].username, 'Vegeta');
assert.equal(saved[0].winner, 1);
assert.equal(saved[0].reason, 'ko');
values.set('bt3.name', 'Goku');
client.api.start({...info, gameMode: -1}); client.api.finish(1, 1, 100);
client.api.start({...info, cpu: [true, true]}); client.api.finish(1, 1, 100);
await settle();
assert.equal(saved.length, 1, 'demos, replays and CPU-only matches are ignored');
client.api.start({...info, cpu: [false, true]}); client.api.finish(4, 2, 1800);
await settle();
assert.equal(saved.at(-1).outcome, 'draw');
assert.equal(saved.at(-1).winner, null);
assert.equal(saved.at(-1).players[1].cpu, true);
client.api.start(info); client.api.finish(8, 0, 100);
await settle();
assert.equal(saved.at(-1).outcome, 'aborted');
const join = runtime({role: 'join'});
join.api.start(info); join.api.finish(2, 1, 100);
await settle();
assert.equal(saved.length, 3, 'joiner does not duplicate host results');
const host = runtime({role: 'host'});
host.api.start({...info, cpu: [true, true]}); host.api.finish(2, 2, 100);
await settle();
assert.equal(saved.at(-1).mode, 'online');
assert.equal(saved.at(-1).players[1].username, 'Piccolo');
assert.ok(saved.at(-1).players.every(player => !player.cpu));
host.api.start(info); host.api.disconnect(); host.api.disconnect();
await settle();
assert.equal(saved.at(-1).reason, 'disconnect');
assert.equal(saved.length, 5);
available = false;
client.api.start(info); client.api.finish(1, 1, 500);
await settle();
assert.equal([...values.keys()].filter(key => key.startsWith('bt3.result.')).length, 1);
client = runtime(); // fresh page uses the saved pending record
available = true;
await client.api.flush();
assert.equal(saved.length, 6);
assert.equal([...values.keys()].filter(key => key.startsWith('bt3.result.')).length, 0);
const embedded = runtime(null, client.window);
embedded.api.start({...info, pads: [1, 0]}); embedded.api.finish(1, 1, 100);
await settle();
assert.equal(saved.at(-1).players[0].username, 'Vegeta', 'local names follow pad assignment');
assert.equal(saved.length, 7, 'embedded runtime delegates saving to surviving parent');
console.log('PASS: winner mapping, name snapshots, duplicate prevention, draws, aborts, CPU exclusion, online host ownership, disconnects, offline retry and frame delegation');
