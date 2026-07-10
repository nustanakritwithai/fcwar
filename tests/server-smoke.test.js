import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';

function nextMessage(ws, type, predicate = () => true, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);
    const handler = (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type !== type || !predicate(message)) return;
      clearTimeout(timer);
      ws.off('message', handler);
      resolve(message);
    };
    ws.on('message', handler);
  });
}

test('server starts, healthz responds, and two clients share snapshots', async (t) => {
  const game = createGameServer({ port: 0 });
  const address = await game.listen();
  t.after(() => game.close());
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${base}/healthz`).then((res) => res.json());
  assert.equal(health.ok, true);

  const a = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  const aWelcome = await nextMessage(a, 'welcome');
  const b = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  const bWelcome = await nextMessage(b, 'welcome');
  assert.notEqual(aWelcome.id, bWelcome.id);
  const snapshot = await nextMessage(a, 'snapshot');
  assert.equal(snapshot.state.players.length, 2);
  assert.deepEqual(
    new Set(snapshot.state.players.map((p) => p.id)),
    new Set([aWelcome.id, bWelcome.id])
  );
  a.close();
  b.close();
});

test('two WebSocket clients select, spawn, move, attack, die and respawn without crash', async (t) => {
  const game = createGameServer({ port: 0 });
  const address = await game.listen();
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${address.port}/ws`;
  const a = new WebSocket(url);
  const aWelcome = await nextMessage(a, 'welcome');
  const b = new WebSocket(url);
  const bWelcome = await nextMessage(b, 'welcome');
  t.after(() => { a.close(); b.close(); });

  let pending = nextMessage(a, 'factionSelected');
  a.send(JSON.stringify({ type: 'selectFaction', faction: 'ironhold' }));
  await pending;
  pending = nextMessage(a, 'classSelected');
  a.send(JSON.stringify({ type: 'selectClass', classId: 'infantry' }));
  await pending;

  pending = nextMessage(b, 'factionSelected');
  b.send(JSON.stringify({ type: 'selectFaction', faction: 'verdant' }));
  await pending;
  pending = nextMessage(b, 'classSelected');
  b.send(JSON.stringify({ type: 'selectClass', classId: 'archer' }));
  await pending;

  const ready = await nextMessage(a, 'snapshot', (message) => {
    const ids = new Set(message.state.players.filter((player) => player.alive).map((player) => player.id));
    return ids.has(aWelcome.id) && ids.has(bWelcome.id);
  });
  const left = ready.state.players.find((player) => player.id === aWelcome.id);
  const right = ready.state.players.find((player) => player.id === bWelcome.id);
  assert.ok(left.position.x < 0 && right.position.x > 0);
  assert.equal(left.equippedItem.id, 'infantry_sword');
  assert.equal(right.equippedItem.id, 'archer_bow');

  pending = nextMessage(a, 'selectReject');
  a.send(JSON.stringify({ type: 'selectItem', slot: 99 }));
  assert.equal((await pending).reason, 'invalid_slot');

  const startX = game.room.players.get(aWelcome.id).position.x;
  pending = nextMessage(a, 'snapshot', (message) => {
    const player = message.state.players.find((entry) => entry.id === aWelcome.id);
    return player?.position.x > startX && Math.abs(player.yaw - 1.2) < .01;
  });
  a.send(JSON.stringify({ type: 'input', seq: 1, moveX: 1, moveZ: 0, yaw: 1.2 }));
  await pending;

  const attacker = game.room.players.get(aWelcome.id);
  const victim = game.room.players.get(bWelcome.id);
  attacker.position = { x: 0, y: 0, z: 0 };
  attacker.yaw = Math.PI / 2;
  attacker.input = { x: 0, z: 0, yaw: Math.PI / 2, sprint: false, jump: false };
  victim.position = { x: 2.4, y: 0, z: 0 };
  victim.hp = 30;
  pending = nextMessage(a, 'deathEvent', (message) => message.playerId === bWelcome.id, 2000);
  a.send(JSON.stringify({ type: 'primary', targetId: bWelcome.id }));
  const death = await pending;
  assert.equal(death.killerId, aWelcome.id);
  assert.equal(victim.alive, false);

  pending = nextMessage(b, 'movementReject');
  b.send(JSON.stringify({ type: 'input', seq: 1, moveX: -1, yaw: 0 }));
  assert.equal((await pending).reason, 'dead_player');

  const respawned = await nextMessage(b, 'snapshot', (message) => {
    const player = message.state.players.find((entry) => entry.id === bWelcome.id);
    return player?.alive && player.hp === player.maxHp && player.lastRespawnLocation === 'base';
  }, 4500);
  assert.ok(respawned.state.players.find((player) => player.id === bWelcome.id).position.x > 0);
  const health = await fetch(`http://127.0.0.1:${address.port}/healthz`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.players, 2);
});
