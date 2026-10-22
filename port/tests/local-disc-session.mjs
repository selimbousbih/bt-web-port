// Run the actual player/shell startup code in fresh frame contexts, as net.js does on navigation.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const player = read('../web/player.html');
const shell = read('../web/shell.html');
const net = read('../web/net.js');
const playerInit = player.slice(player.lastIndexOf('<script>') + 8, player.indexOf('  const active ='));
const discHelpers = shell.slice(shell.indexOf('  // ---- the disc ----'), shell.indexOf('  // Reads of the network kinds:'));
const boot = shell.slice(shell.indexOf('  const go = (disc)'), shell.indexOf('  // the program itself'));
const parent = {};
const nodes = new Map();
const node = id => nodes.get(id) || (nodes.set(id, {classList: {add() {}, remove() {}}, addEventListener() {}}), nodes.get(id));
vm.runInNewContext(playerInit, {File, window: parent, document: {getElementById: node}, location: {search: '?k=test&pick=1', hash: ''}});
function frame(search, embedded = true) {
  const elements = new Map(), started = [], probes = [];
  const get = id => {
    if (!elements.has(id)) elements.set(id, {hidden: false, listeners: {}, classList: {add() {}, remove() {}}, addEventListener(t, f) {this.listeners[t] = f;}});
    return elements.get(id);
  };
  const window = {};
  window.parent = embedded ? parent : window;
  const context = vm.createContext({window, Q: new URLSearchParams(search), Uint8Array,
    Module: {ready: true}, $: get, audioUnlock() {}, say() {}, start: d => started.push(d),
    pieceDisc: async () => {probes.push('pieces'); return {size: 100};},
    httpDisc: async () => {probes.push('http'); return {size: 100};}, location: {hostname: 'localhost'}});
  vm.runInContext(discHelpers + '\n' + boot, context);
  return {context, elements, started, probes};
}
// Local-only mode must not even probe or prefetch the server ISO.
const initial = frame('?k=test&pick=1');
const file = new File([Uint8Array.of(1, 2, 3, 4)], 'game-super.iso');
initial.elements.get('iso').listeners.change({target: {files: [file]}});
assert.equal(initial.started.length, 1);
// Use the real match-entry URL transition from net.js.
const goStart = net.indexOf('  function go(role, room, rules, vs)');
const goEnd = net.indexOf('\n  // ---', goStart);
let matchURL;
vm.runInNewContext(net.slice(goStart, goEnd) + "\ngo('host', 'TEST', '768', 'Friend');", {
  URL, location: {href: 'https://example.test/game.html?k=test&pick=1', replace: u => {matchURL = new URL(u);}},
  setTimeout: fn => fn(),
});
const match = frame(matchURL.search);
assert.equal(match.started.length, 1, 'entering a match must reuse the selected ISO');
assert.equal(initial.probes.length, 0, 'local selection must skip all remote disc reads');
assert.deepEqual(Array.from(await match.started[0].readAt(1, 2)), [2, 3]);
assert.equal(match.probes.length, 0);
// Use the real leave transition, including its disconnect message.
let leaveURL;
const leaveStart = net.indexOf('  function leave(why)');
vm.runInNewContext(net.slice(leaveStart, net.indexOf('\n  // ---', leaveStart)) + "\nleave('The room connection was lost. Please reconnect.');", {
  URL, window: {}, Link: {close() {}}, location: {href: matchURL.href, replace: u => {leaveURL = new URL(u);}},
});
assert.ok(leaveURL.searchParams.get('netmsg'));
const menu = frame(leaveURL.search);
assert.equal(menu.started.length, 1, 'returning from a match must reuse the ISO');
assert.equal(menu.probes.length, 0);
assert.deepEqual(Array.from(await menu.started[0].readAt(0, 4)), [1, 2, 3, 4]);
const standalone = frame('?pick=1', false);
assert.equal(standalone.started.length, 0, 'a standalone page still offers manual selection');
assert.equal(standalone.elements.get('pickLabel').hidden, false);
// A new outer page loses the File reference by design; no ISO is copied to browser storage.
parent.BT3LocalDisc.file = null;
assert.equal(frame('?pick=1').started.length, 0);
const served = frame('');
await new Promise(resolve => setImmediate(resolve));
assert.equal(served.started.length, 1, 'default server-disc startup still works');
console.log('PASS: local-only reads, ISO reuse entering/leaving matches, standalone selection, fresh page, server-disc startup');
