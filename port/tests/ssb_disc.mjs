// node port/tests/ssb_disc.mjs game-ssb.iso
// Uses the real browser indexer with a range reader and an in-memory filesystem.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const fd = fs.openSync(process.argv[2], 'r');
const files = new Map();
const Module = { webDisc: { readAt: async (offset, length) => {
    const bytes = new Uint8Array(length);
    assert.equal(fs.readSync(fd, bytes, 0, length, offset), length);
    return bytes;
} } };
const context = vm.createContext({ Module, crypto: webcrypto, FS: {
    mkdirTree() {}, writeFile(path, bytes) { files.set(path, bytes); }, unlink(path) { files.delete(path); }
} });
vm.runInContext(fs.readFileSync(new URL('../web/web_pre.js', import.meta.url), 'utf8'), context);
await Module.webDiscIndex();
assert.equal(Module.webSsbDlc, true);
for (const [slot, size] of [[0,760576],[4,775424],[8,936512],[12,580608],[16,78170],
                          [26,697856],[30,697856],[34,954880],[38,679168],[42,86547]]) {
    const path = `pzs3us2/${100000 + slot}.bin`;
    assert.equal(Module.webIndex[path][1], size);
    assert.equal(await Module.webDiscEnsure('/gamedata/' + path), 1);
    assert.equal(files.get('/gamedata/' + path).length, size);
}
assert.equal(Module.webIndex['pzs3us2/100001.bin'], undefined); // empty costume slot
const common = '/gamedata/pzs3us1/00001.bin';
await Module.webDiscEnsure(common);
const params = files.get(common);
for (const id of [165,166]) {
    const view = new DataView(params.buffer, params.byteOffset + 70080 + id * 16, 16);
    assert.deepEqual([0,4,8,12].map(o => view.getUint32(o, true)), [50000,40000,100000,6]);
}
// The original voice archive entry must retain its disc mapping.
const voice = Module.webIndex['pzs3us1/03038.bin'];
assert.equal(voice[1], 267648);
assert.notEqual(voice[0], Module.webIndex['pzs3us2/100000.bin'][0]);
fs.closeSync(fd);
console.log('SSB disc mappings, model variants, portraits and parameters passed');
