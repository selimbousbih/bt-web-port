// One JSON object per line, outside the served web directory. The local server is
// the only writer; append and fsync before acknowledging a result to the browser.
import fs from 'node:fs';
import path from 'node:path';

export function validateResult(value) {
  const bad = () => { throw new Error('Invalid game result'); };
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' ||
      !/^[\w-]{8,100}$/.test(value.id) || !['local', 'online'].includes(value.mode) ||
      !Number.isInteger(value.gameMode) || value.gameMode < 0 || value.gameMode > 9 ||
      !Array.isArray(value.players) || value.players.length !== 2) bad();
  const players = value.players.map(player => {
    if (!player || typeof player.username !== 'string' || typeof player.cpu !== 'boolean') bad();
    const username = player.username.normalize('NFC').trim();
    if (!username || username.length > 16 || /[\u0000-\u001f\u007f]/.test(username)) bad();
    return {username, cpu: player.cpu};
  });
  if (players.every(player => player.cpu)) bad();
  if (!['win', 'draw', 'aborted'].includes(value.outcome) ||
      (value.outcome === 'win' ? ![0, 1].includes(value.winner) : value.winner !== null) ||
      !['ko', 'time', 'decision', 'aborted', 'disconnect'].includes(value.reason) ||
      !Number.isInteger(value.frames) || value.frames < 0 || value.frames > 100000000) bad();
  return {id: value.id, mode: value.mode, gameMode: value.gameMode, players,
    outcome: value.outcome, winner: value.winner, reason: value.reason, frames: value.frames};
}

export function createResultStore(file) {
  const results = [], ids = new Map();
  fs.mkdirSync(path.dirname(file), {recursive: true});
  if (fs.existsSync(file)) {
    const data = fs.readFileSync(file, 'utf8');
    for (const [index, line] of data.split('\n').entries()) {
      if (!line.trim()) continue;
      try {
        const saved = JSON.parse(line);
        const result = {...validateResult(saved), playedAt: saved.playedAt};
        if (typeof result.playedAt !== 'string' || !Number.isFinite(Date.parse(result.playedAt))) throw new Error();
        if (!ids.has(result.id)) { results.push(result); ids.set(result.id, result); }
      } catch { throw new Error(`Cannot read game results: ${file}, line ${index + 1}`); }
    }
    // A valid final record without a newline must stay separate from the next append.
    if (data && !data.endsWith('\n')) fs.appendFileSync(file, '\n');
  }
  fs.closeSync(fs.openSync(file, 'a', 0o600));
  return {
    append(value) {
      const clean = validateResult(value);
      if (ids.has(clean.id)) return {result: ids.get(clean.id), created: false};
      const result = {...clean, playedAt: new Date().toISOString()};
      const fd = fs.openSync(file, 'a', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(result) + '\n'); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      results.push(result); ids.set(result.id, result);
      return {result, created: true};
    },
    snapshot() {
      const users = new Map();
      for (const result of results) {
        if (result.outcome === 'aborted') continue;
        result.players.forEach((player, side) => {
          if (player.cpu) return;
          const key = player.username.toLowerCase();
          if (!users.has(key)) users.set(key, {username: player.username, played: 0, wins: 0, losses: 0, draws: 0});
          const row = users.get(key);
          row.played++;
          if (result.outcome === 'draw') row.draws++;
          else if (result.winner === side) row.wins++;
          else row.losses++;
        });
      }
      const leaderboard = [...users.values()].sort((a, b) => b.wins - a.wins ||
        (b.wins / b.played) - (a.wins / a.played) || a.username.localeCompare(b.username));
      return {leaderboard, recent: results.slice(-20).reverse(), total: results.length};
    },
  };
}

export function handleResults(req, res, url, store) {
  if (!['/api/results', '/api/leaderboard'].includes(url.pathname)) return false;
  const json = (status, body) => res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  }).end(JSON.stringify(body));
  if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
    json(200, store.snapshot()); return true;
  }
  if (url.pathname !== '/api/results' || req.method !== 'POST') {
    res.setHeader('Allow', url.pathname === '/api/results' ? 'POST' : 'GET');
    json(405, {error: 'Method not allowed'}); return true;
  }
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
    json(415, {error: 'Expected application/json'}); return true;
  }
  let chunks = [], size = 0, rejected = false;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > 8192) {
      if (!rejected) json(413, {error: 'Game result is too large'});
      rejected = true; chunks = []; return;
    }
    if (!rejected) chunks.push(chunk);
  });
  req.on('end', () => {
    if (rejected) return;
    let value;
    try { value = validateResult(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch { json(400, {error: 'Invalid game result'}); return; }
    try { const saved = store.append(value); json(saved.created ? 201 : 200, saved.result); }
    catch (error) { console.error(`Saving game result: ${error.message}`); json(500, {error: 'Could not save game result'}); }
  });
  return true;
}
