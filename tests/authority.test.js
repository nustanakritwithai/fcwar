import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTHORITY, BASIC_PLAYER, WORLD } from '../server/classes.js';
import { GameRoom } from '../server/room.js';

class FakeSocket {
  constructor() { this.readyState = 1; this.sent = []; }
  send(raw) { this.sent.push(JSON.parse(raw)); }
}

function setup() {
  let time = 10_000;
  const room = new GameRoom({ now: () => time });
  const socket = new FakeSocket();
  const player = room.addClient(socket);
  room.handleMessage(player.id, { type: 'selectFaction', faction: 'ironhold' });
  room.handleMessage(player.id, { type: 'selectClass', classId: 'infantry' });
  socket.sent.length = 0;
  return { room, socket, player, setTime: (value) => { time = value; } };
}

test('movement is input-driven and capped by the fixed server tick', () => {
  const { room, player, setTime } = setup();
  const startX = player.position.x;
  room.handleMessage(player.id, { type: 'input', seq: 1, moveX: 99, moveZ: 0, yaw: 0 });
  setTime(10_100);
  room.tick(10_100);
  assert.ok(player.position.x - startX <= BASIC_PLAYER.moveSpeed * AUTHORITY.maxTickSeconds + 1e-6);
  assert.equal(player.position.y, WORLD.groundY);
});

test('teleport and anti-fly position hints are rejected without moving server state', () => {
  const { room, socket, player } = setup();
  const start = { ...player.position };
  room.handleMessage(player.id, {
    type: 'input', seq: 1, moveX: 1, position: { x: 90, y: 0, z: 0 }
  });
  assert.equal(socket.sent.at(-1).reason, 'teleport_rejected');
  room.handleMessage(player.id, {
    type: 'input', seq: 2, moveX: 1, position: { ...start, y: 20 }
  });
  assert.equal(socket.sent.at(-1).reason, 'anti_fly_rejected');
  assert.deepEqual(player.position, start);
});

test('dead players cannot submit movement', () => {
  const { room, socket, player } = setup();
  room.kill(player);
  room.handleMessage(player.id, { type: 'input', seq: 1, moveX: 1 });
  assert.equal(socket.sent.at(-1).reason, 'dead_player');
  assert.equal(player.input.x, 0);
});

test('input packet rate is limited per player', () => {
  const { room, socket, player } = setup();
  for (let seq = 1; seq <= AUTHORITY.maxInputsPerSecond + 1; seq += 1) {
    room.handleMessage(player.id, { type: 'input', seq, moveX: 0 });
  }
  assert.equal(socket.sent.at(-1).reason, 'packet_rate_limit');
});

test('faction selection validates ids and spawns on the correct side', () => {
  let time = 1_000;
  const room = new GameRoom({ now: () => time });
  const leftSocket = new FakeSocket();
  const rightSocket = new FakeSocket();
  const left = room.addClient(leftSocket);
  const right = room.addClient(rightSocket);
  room.handleMessage(left.id, { type: 'selectFaction', faction: 'ironhold' });
  room.handleMessage(right.id, { type: 'selectFaction', faction: 'verdant' });
  assert.ok(left.position.x < 0);
  assert.ok(right.position.x > 0);
  assert.equal(left.faction, 'ironhold');
  assert.equal(right.faction, 'verdant');
  room.handleMessage(right.id, { type: 'selectFaction', faction: 'unknown' });
  assert.equal(rightSocket.sent.at(-1).reason, 'invalid_faction');
});

test('class selection requires faction and invalid classes fall back to infantry', () => {
  const room = new GameRoom({ now: () => 5_000 });
  const socket = new FakeSocket();
  const player = room.addClient(socket);
  room.handleMessage(player.id, { type: 'selectClass', classId: 'archer' });
  assert.equal(socket.sent.at(-1).reason, 'faction_required');
  room.handleMessage(player.id, { type: 'selectFaction', faction: 'verdant' });
  room.handleMessage(player.id, { type: 'selectClass', classId: 'not-a-class' });
  assert.equal(player.classId, 'infantry');
  assert.equal(player.alive, true);
  assert.equal(socket.sent.findLast((message) => message.type === 'classSelected').fallback, true);
});

test('movement cap uses the selected class speed', () => {
  const { room, player, setTime } = setup();
  const startX = player.position.x;
  room.handleMessage(player.id, { type: 'input', seq: 1, moveX: 1, moveZ: 0 });
  setTime(10_100);
  room.tick(10_100);
  assert.ok(player.position.x - startX <= 6.6 * AUTHORITY.maxTickSeconds + 1e-6);
});

test('server loadout snapshot contains equipped item and invalid slot rejects safely', () => {
  const { room, socket, player } = setup();
  const snapshotPlayer = room.snapshot().players.find((entry) => entry.id === player.id);
  assert.equal(snapshotPlayer.equippedSlot, 1);
  assert.equal(snapshotPlayer.equippedItem.id, 'infantry_sword');
  assert.equal(snapshotPlayer.loadout.length, 2);
  room.handleMessage(player.id, { type: 'selectItem', slot: 99 });
  assert.equal(socket.sent.at(-1).type, 'selectReject');
  assert.equal(socket.sent.at(-1).reason, 'invalid_slot');
  assert.equal(player.equippedItem.id, 'infantry_sword');
  room.handleMessage(player.id, { type: 'selectItem', slot: 2 });
  assert.equal(player.equippedItem.id, 'infantry_shield');
});

test('crouch and prone states are server validated movement modifiers', () => {
  const { room, player, setTime } = setup();
  const start = player.position.x;
  room.handleMessage(player.id, { type: 'input', seq: 1, moveX: 1, stance: 'prone', sprint: true });
  setTime(10_100);
  room.tick(10_100);
  const proneDistance = player.position.x - start;
  assert.equal(player.stance, 'prone');
  assert.ok(proneDistance <= 6.6 * .38 * .1 + 1e-6);
  assert.equal(player.stamina, player.maxStamina, 'prone input cannot sprint-drain');
  room.handleMessage(player.id, { type: 'input', seq: 2, moveX: 0, stance: 'flying' });
  assert.equal(player.stance, 'prone');
});

test('development diagnostics flag is opt-in to snapshots', () => {
  assert.equal(new GameRoom().snapshot().devMode, false);
  assert.equal(new GameRoom({ devMode: true }).snapshot().devMode, true);
});
