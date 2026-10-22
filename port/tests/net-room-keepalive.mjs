// Exercise the actual Link handlers without a renderer or game assets.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../web/net.js', import.meta.url), 'utf8');
const start = source.indexOf('  const Link = {');
const end = source.indexOf('\n  // ---', start);
const timers = new Map(); let id = 0;
class Socket {
  readyState = 1; sent = [];
  send(v) { this.sent.push(v); }
  close() { this.readyState = 3; }
}
const context = vm.createContext({WebSocket: Socket, wsUrl: () => '', log() {}, Date, Uint8Array,
  setInterval(fn, ms) { timers.set(++id, {fn, ms}); return id; }, clearInterval(n) { timers.delete(n); },
  setTimeout() { return 1; }, clearTimeout() {}, window: {}});
vm.runInContext(source.slice(start, end) + '\nglobalThis.link = Link;', context);
const link = context.link;
const connected = link.open('TEST', 'host');
link.ws.onopen();
link.dc = {readyState: 'open', close() { this.readyState = 'closed'; }};
link.ready('direct');
await connected;
const ping = [...timers.values()].find(t => t.ms === 15000);
assert.ok(ping, 'room heartbeat exists independently of direct game keepalive');
ping.fn();
assert.equal(JSON.parse(link.ws.sent.at(-1)).t, 'ping');
const events = []; link.onState = e => events.push(e);
await link.ws.onmessage({data: JSON.stringify({t:'left'})});
assert.equal(link.gone, false, 'room socket loss must not end a live direct match');
assert.equal(events.length, 0);
await link.ws.onmessage({data: JSON.stringify({t:'bye'})});
assert.equal(link.gone, true, 'explicit leave still ends the match');
assert.deepEqual(events, ['left']);
link.close();
assert.equal(timers.size, 0, 'all heartbeat timers are cleared');
console.log('PASS: room keepalive, direct-match survival, explicit leave, timer cleanup');
