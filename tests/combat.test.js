import assert from 'node:assert/strict';
import test from 'node:test';
import { COMBAT } from '../server/classes.js';
import { GameRoom } from '../server/room.js';

class FakeSocket {
  constructor() { this.readyState = 1; this.sent = []; }
  send(raw) { this.sent.push(JSON.parse(raw)); }
}

function combatRoom() {
  let time = 1_000;
  const room = new GameRoom({ now: () => time });
  const add = (faction, classId = 'infantry') => {
    const socket = new FakeSocket();
    const player = room.addClient(socket);
    room.handleMessage(player.id, { type: 'selectFaction', faction });
    room.handleMessage(player.id, { type: 'selectClass', classId });
    socket.sent.length = 0;
    return { player, socket };
  };
  return {
    room,
    add,
    now: () => time,
    advanceTo(value) { time = value; room.tick(value); },
    setTime(value) { time = value; }
  };
}

function facePositiveX(attacker, target, distance = 2) {
  attacker.position = { x: 0, y: 0, z: 0 };
  attacker.yaw = Math.PI / 2;
  target.position = { x: distance, y: 0, z: 0 };
}

test('friendly fire is blocked while enemy damage succeeds', () => {
  const game = combatRoom();
  const attacker = game.add('ironhold').player;
  const friend = game.add('ironhold').player;
  const enemy = game.add('verdant').player;
  facePositiveX(attacker, friend);
  enemy.position = { x: 2, y: 0, z: 0 };
  const friendly = game.room.applyDamage(attacker, friend, 30, { source: 'test' });
  const hostile = game.room.applyDamage(attacker, enemy, 30, { source: 'test' });
  assert.equal(friendly.reason, 'friendly_fire_blocked');
  assert.equal(friend.hp, friend.maxHp);
  assert.equal(hostile.ok, true);
  assert.equal(enemy.hp, enemy.maxHp - 30);
});

test('sword wind-up consumes stamina and hits an enemy in range and cone', () => {
  const game = combatRoom();
  const attacker = game.add('ironhold', 'infantry').player;
  const enemy = game.add('verdant', 'infantry').player;
  facePositiveX(attacker, enemy, 2.4);
  const beforeStamina = attacker.stamina;
  const beforeHp = enemy.hp;
  assert.equal(game.room.requestPrimary(attacker, { targetId: enemy.id }), true);
  assert.equal(attacker.stamina, beforeStamina - COMBAT.infantry_sword.staminaCost);
  assert.equal(enemy.hp, beforeHp, 'damage waits for active hit window');
  game.advanceTo(1_240);
  assert.equal(enemy.hp, beforeHp - COMBAT.infantry_sword.damage);
});

test('sword misses outside range and behind attacker', () => {
  const farGame = combatRoom();
  const farAttacker = farGame.add('ironhold').player;
  const farEnemy = farGame.add('verdant').player;
  facePositiveX(farAttacker, farEnemy, 8);
  farGame.room.requestPrimary(farAttacker, { targetId: farEnemy.id });
  farGame.advanceTo(1_240);
  assert.equal(farEnemy.hp, farEnemy.maxHp);

  const rearGame = combatRoom();
  const rearAttacker = rearGame.add('ironhold').player;
  const rearEnemy = rearGame.add('verdant').player;
  facePositiveX(rearAttacker, rearEnemy, -2);
  rearGame.room.requestPrimary(rearAttacker, { targetId: rearEnemy.id });
  rearGame.advanceTo(1_240);
  assert.equal(rearEnemy.hp, rearEnemy.maxHp);
});

test('shield reduces frontal damage but never back damage', () => {
  const game = combatRoom();
  const defender = game.add('ironhold', 'infantry').player;
  const attacker = game.add('verdant', 'infantry').player;
  game.room.selectItem(defender, 2);
  defender.position = { x: 0, y: 0, z: 0 };
  defender.yaw = Math.PI / 2;
  attacker.position = { x: 2, y: 0, z: 0 };
  game.room.requestSecondary(defender, true);
  const front = game.room.applyDamage(attacker, defender, 40, { source: 'sword' });
  assert.equal(front.blocked, true);
  assert.ok(front.damage < 40);

  defender.hp = defender.maxHp;
  defender.stamina = defender.maxStamina;
  defender.blocking = true;
  attacker.position.x = -2;
  const back = game.room.applyDamage(attacker, defender, 40, { source: 'sword' });
  assert.equal(back.blocked, false);
  assert.equal(back.damage, 40);
});

test('bow rejects snap shots and accepts a drawn, faced enemy shot', () => {
  const game = combatRoom();
  const archer = game.add('ironhold', 'archer');
  const enemy = game.add('verdant', 'infantry').player;
  facePositiveX(archer.player, enemy, 18);
  game.room.requestSecondary(archer.player, true);
  assert.equal(game.room.requestPrimary(archer.player, { targetId: enemy.id }), false);
  assert.equal(archer.socket.sent.at(-1).reason, 'bow_draw_too_short');
  game.setTime(1_700);
  const before = enemy.hp;
  assert.equal(game.room.requestPrimary(archer.player, { targetId: enemy.id }), true);
  assert.equal(enemy.hp, before - COMBAT.archer_bow.damage);
  assert.ok(archer.socket.sent.some((message) => message.type === 'tracer'));
});

test('sprint drains stamina and server regenerates after rest', () => {
  const game = combatRoom();
  const player = game.add('ironhold').player;
  const initial = player.stamina;
  game.room.handleMessage(player.id, { type: 'input', seq: 1, moveX: 1, sprint: true });
  game.advanceTo(1_100);
  assert.ok(player.stamina < initial);
  const drained = player.stamina;
  game.room.handleMessage(player.id, { type: 'input', seq: 2, moveX: 0, sprint: false });
  game.advanceTo(1_700);
  assert.ok(player.stamina > drained);
});

test('Infantry sword is stronger than Commander sword', () => {
  assert.ok(COMBAT.infantry_sword.damage > COMBAT.commander_sword.damage);
});
