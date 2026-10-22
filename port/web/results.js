// Shared by the player and standalone runtime. Pending results survive reloads;
// the server acknowledges each id only after appending it to the local file.
(function () {
  'use strict';
  const PREFIX = 'bt3.result.';
  const pending = new Map();
  let current = null, flushing = false, refreshing = false;
  const get = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
  const name = (key, fallback) => get(key, fallback).normalize('NFC').trim().slice(0, 16) || fallback;
  const id = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() :
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const status = text => {
    const node = document.getElementById('results-status');
    if (node) node.textContent = text;
  };
  function queued() {
    const entries = new Map(pending);
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(PREFIX)) continue;
        try { const result = JSON.parse(localStorage.getItem(key)); entries.set(result.id, result); } catch { /* leave damaged entries alone */ }
      }
    } catch { /* memory queue still works when browser storage is disabled */ }
    return [...entries.values()];
  }
  function enqueue(result) {
    pending.set(result.id, result);
    try { localStorage.setItem(PREFIX + result.id, JSON.stringify(result)); } catch { /* retry from memory */ }
    void flush();
  }
  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      for (const result of queued()) {
        const response = await fetch('/api/results' + location.search, {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(result), keepalive: true,
        });
        if (!response.ok) throw new Error('save failed');
        const saved = await response.json();
        if (saved.id !== result.id) throw new Error('result was not acknowledged');
        pending.delete(result.id);
        try { localStorage.removeItem(PREFIX + result.id); } catch { /* idempotent retry next time */ }
      }
      await refresh();
    } catch {
      status('Results are waiting to save. Reconnect to the game server to retry.');
    } finally { flushing = false; }
  }
  function owner() {
    try { if (window.parent !== window && window.parent.BT3Results) return window.parent.BT3Results; } catch { /* standalone */ }
    return api;
  }
  function start(info) {
    current = null;
    const session = window.BT3Net && window.BT3Net.session;
    // The host writes online results once, using canonical side 0 / side 1,
    // regardless of the joining player's swapped HUD and camera.
    if (info.gameMode < 0 || (session && session.role !== 'host') || (!session && info.cpu.every(Boolean))) return;
    const players = session ? [
      {username: name('bt3.name', 'Player 1'), cpu: false},
      {username: (BT3Net.link.peerName || session.other || 'Player 2').normalize('NFC').trim().slice(0, 16), cpu: false},
    ] : info.cpu.map((cpu, side) => ({cpu,
      username: cpu ? 'CPU' : info.pads[side] === 1 ? name('bt3.name2', 'Player 2') : name('bt3.name', 'Player 1'),
    }));
    current = {id: id(), mode: session ? 'online' : 'local', gameMode: info.gameMode, players};
  }
  function finish(flags, reason, frames) {
    if (!current) return;
    let outcome, winner = null;
    if (flags & 8) outcome = 'aborted';
    else if (flags & 4) outcome = 'draw';
    else if ((flags & 3) === 1 || (flags & 3) === 2) { outcome = 'win'; winner = (flags & 3) === 1 ? 0 : 1; }
    else return; // script transition without a completed result
    const result = {...current, outcome, winner, frames: Math.max(0, frames | 0),
      reason: outcome === 'aborted' ? 'aborted' : reason & 1 ? 'ko' : reason & 2 ? 'time' : 'decision'};
    current = null;
    owner().enqueue(result);
  }
  function disconnect() {
    if (!current) return;
    const result = {...current, outcome: 'aborted', winner: null, frames: 0, reason: 'disconnect'};
    current = null;
    owner().enqueue(result);
  }
  function cell(row, text) {
    const td = document.createElement('td'); td.textContent = text; row.appendChild(td);
  }
  async function refresh() {
    const board = document.getElementById('leaderboard-rows');
    if (!board || refreshing) return;
    refreshing = true;
    try {
      const response = await fetch('/api/leaderboard' + location.search, {cache: 'no-store'});
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      board.replaceChildren();
      data.leaderboard.forEach((player, i) => {
        const row = document.createElement('tr');
        for (const text of [i + 1, player.username, player.wins, player.losses, player.draws, player.played,
          Math.round(player.wins / player.played * 100) + '%']) cell(row, text);
        board.appendChild(row);
      });
      document.getElementById('leaderboard-empty').hidden = data.leaderboard.length > 0;
      const history = document.getElementById('result-history'); history.replaceChildren();
      data.recent.forEach(result => {
        const row = document.createElement('li');
        const match = document.createElement('span');
        match.textContent = result.players.map(player => player.username).join(' vs ');
        const detail = document.createElement('span'); detail.className = 'hint';
        const outcome = result.outcome === 'win' ? result.players[result.winner].username + ' won' :
          result.outcome === 'draw' ? 'Draw' : result.reason === 'disconnect' ? 'Disconnected' : 'Aborted';
        detail.textContent = outcome + ' · ' + (result.mode === 'online' ? 'Online' : 'Local') + ' · ' +
          new Date(result.playedAt).toLocaleString([], {dateStyle: 'short', timeStyle: 'short'});
        row.append(match, detail); history.appendChild(row);
      });
      document.getElementById('history-empty').hidden = data.recent.length > 0;
      document.getElementById('results-total').textContent = data.total + (data.total === 1 ? ' game recorded' : ' games recorded');
      status(queued().length ? 'Results are waiting to save. Reconnect to the game server to retry.' : '');
    } catch { status('Leaderboard unavailable. Start the local game server and refresh to reconnect.'); }
    finally { refreshing = false; }
  }
  const api = window.BT3Results = {start, finish, disconnect, enqueue, flush, refresh};
  function mount() {
    const form = document.getElementById('player-names');
    if (form) {
      const one = document.getElementById('player-one'), two = document.getElementById('player-two');
      const syncNames = () => { one.value = name('bt3.name', 'Player 1'); two.value = name('bt3.name2', 'Player 2'); };
      syncNames();
      addEventListener('storage', event => { if (event.key === 'bt3.name' || event.key === 'bt3.name2') syncNames(); });
      form.addEventListener('submit', event => {
        event.preventDefault();
        const a = one.value.normalize('NFC').trim(), b = two.value.normalize('NFC').trim();
        if (!a || !b || a.toLowerCase() === b.toLowerCase() || /[\u0000-\u001f\u007f]/.test(a + b)) {
          document.getElementById('names-status').textContent = 'Enter two different player names.'; return;
        }
        try {
          localStorage.setItem('bt3.name', a); localStorage.setItem('bt3.name2', b);
          document.getElementById('names-status').textContent = 'Names saved for your next match.';
        } catch { document.getElementById('names-status').textContent = 'Browser storage is unavailable. Enable it to save player names.'; }
      });
      document.getElementById('refresh-results').addEventListener('click', () => void flush());
    }
    if (owner() === api) {
      void flush();
      setInterval(() => { if (!document.hidden) void flush(); }, 15000);
      addEventListener('online', () => void flush());
      addEventListener('pagehide', () => void flush());
    }
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount);
  else mount();
})();
