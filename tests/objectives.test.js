import assert from 'node:assert/strict';
import test from 'node:test';
import { GameRoom } from '../server/room.js';

class FakeSocket {
  constructor() { this.readyState = 1; this.sent = []; }
  send(raw) { this.sent.push(JSON.parse(raw)); }
}

function setup() {
  let time = 1_000;
  const room = new GameRoom({ now: () => time });
  const add = (faction) => {
    const socket = new FakeSocket();
    const player = room.addClient(socket);
    room.selectFaction(player, faction);
    room.selectClass(player, 'infantry');
    socket.sent.length = 0;
    return { player, socket };
  };
  return { room, add, setTime(value) { time = value; } };
}

test('Central Fort capture counts only alive players inside server radius', () => {
  const { room, add } = setup();
  const iron = add('ironhold').player;
  const verdant = add('verdant').player;
  iron.position = { x: 0, y: 0, z: 0 };
  verdant.position = { x: 40, y: 0, z: 0 };
  room.updateCapture(2.5, 3_500);
  assert.equal(room.capturePoint.capturingFaction, 'ironhold');
  assert.equal(room.capturePoint.progress, 50);
  room.updateCapture(2.5, 6_000);
  assert.equal(room.capturePoint.ownerFaction, 'ironhold');
  assert.equal(room.capturePoint.progress, 0);
  assert.equal(room.capturePoint.status, 'owned');
});

test('equal living faction presence contests and pauses capture', () => {
  const { room, add } = setup();
  const iron = add('ironhold').player;
  const verdant = add('verdant').player;
  iron.position = { x: 0, y: 0, z: 0 };
  verdant.position = { x: 1, y: 0, z: 0 };
  room.capturePoint.progress = 35;
  room.capturePoint.capturingFaction = 'ironhold';
  room.updateCapture(2, 3_000);
  assert.equal(room.capturePoint.contested, true);
  assert.equal(room.capturePoint.status, 'contested');
  assert.equal(room.capturePoint.progress, 35);
  room.kill(verdant);
  room.updateCapture(1, 4_000);
  assert.equal(room.capturePoint.contested, false);
  assert.ok(room.capturePoint.progress > 35);
});

test('capture point snapshot exposes stable identity, position, radius and state', () => {
  const { room } = setup();
  const point = room.snapshot().capturePoints[0];
  assert.equal(point.id, 'central_fort');
  assert.equal(point.name, 'Central Fort');
  assert.deepEqual(point.position, { x: 0, y: 0, z: 0 });
  assert.equal(point.radius, 15);
  assert.equal(point.ownerFaction, null);
});

test('Fort owner earns ten score every ten seconds', () => {
  const { room, setTime } = setup();
  room.capturePoint.ownerFaction = 'ironhold';
  setTime(11_000);
  room.updateRound(11_000);
  assert.equal(room.round.scores.ironhold, 10);
  assert.equal(room.round.scores.verdant, 0);
  setTime(31_000);
  room.updateRound(31_000);
  assert.equal(room.round.scores.ironhold, 30);
});

test('first faction to 1000 wins and five-second reset clears round state', () => {
  const { room, add, setTime } = setup();
  const player = add('ironhold').player;
  player.kills = 4;
  player.deaths = 2;
  player.gold = 90;
  room.capturePoint.ownerFaction = 'verdant';
  room.round.scores.verdant = 990;
  setTime(11_000);
  room.updateRound(11_000);
  assert.equal(room.round.state, 'victory');
  assert.equal(room.round.winningFaction, 'verdant');
  assert.equal(room.round.resetAt, 16_000);
  setTime(15_999);
  room.updateRound(15_999);
  assert.equal(room.round.state, 'victory');
  setTime(16_000);
  room.updateRound(16_000);
  assert.equal(room.round.state, 'active');
  assert.deepEqual(room.round.scores, { ironhold: 0, verdant: 0 });
  assert.equal(room.capturePoint.ownerFaction, null);
  assert.equal(player.kills, 0);
  assert.equal(player.deaths, 0);
  assert.equal(player.gold, 0);
  assert.equal(player.alive, true);
  assert.ok(player.position.x < 0);
});
