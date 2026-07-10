import assert from 'node:assert/strict';
import test from 'node:test';
import { RESOURCE_RULES } from '../server/classes.js';
import { GameRoom } from '../server/room.js';

class FakeSocket {
  constructor() { this.readyState = 1; this.sent = []; }
  send(raw) { this.sent.push(JSON.parse(raw)); }
}

function setup() {
  let time = 1_000;
  const room = new GameRoom({ now: () => time });
  const add = (faction = 'ironhold', classId = 'worker') => {
    const socket = new FakeSocket();
    const player = room.addClient(socket);
    room.selectFaction(player, faction);
    room.selectClass(player, classId);
    socket.sent.length = 0;
    return { player, socket };
  };
  return {
    room, add,
    setTime(value) { time = value; },
    advance(ms) { time += ms; return time; }
  };
}

test('resource snapshots are stable server-backed visible tree and rock nodes', () => {
  const { room } = setup();
  const nodes = room.snapshot().resourceNodes;
  const tree = nodes.find((node) => node.type === 'tree');
  const rock = nodes.find((node) => node.type === 'rock');
  for (const node of [tree, rock]) {
    assert.ok(node.id);
    assert.ok(Number.isFinite(node.position.x));
    assert.ok(Number.isFinite(node.position.z));
    assert.ok(node.amount > 0);
    assert.ok(node.maxAmount >= node.amount);
    assert.ok(node.interactRadius > 0);
    assert.ok(node.requiredTool);
  }
  assert.equal(tree.resource, 'wood');
  assert.equal(rock.resource, 'stone');
});

test('Worker axe gathers visible tree wood and reduces the same node amount', () => {
  const { room, add } = setup();
  const { player } = add();
  const node = [...room.resourceNodes.values()].find((entry) => entry.type === 'tree');
  player.position = { x: node.position.x + 2, y: 0, z: node.position.z };
  const before = node.amount;
  assert.equal(room.gatherResource(player, node.id), true);
  assert.equal(node.amount, before - RESOURCE_RULES.gatherAmount);
  assert.equal(player.inventory.wood, RESOURCE_RULES.gatherAmount);
  assert.equal(player.inventory.stone, 0);
});

test('Worker pickaxe gathers visible rock stone', () => {
  const { room, add } = setup();
  const { player } = add();
  const node = [...room.resourceNodes.values()].find((entry) => entry.type === 'rock');
  room.selectItem(player, 2);
  player.position = { x: node.position.x, y: 0, z: node.position.z + 2 };
  assert.equal(room.gatherResource(player, node.id), true);
  assert.equal(player.inventory.stone, RESOURCE_RULES.gatherAmount);
});

test('wrong tool rejects nearby gather while too-far rejects only a truly far player', () => {
  const { room, add } = setup();
  const { player, socket } = add();
  const tree = [...room.resourceNodes.values()].find((entry) => entry.type === 'tree');
  player.position = { ...tree.position };
  room.selectItem(player, 2);
  assert.equal(room.gatherResource(player, tree.id), false);
  assert.equal(socket.sent.at(-1).reason, 'wrong_tool');
  room.selectItem(player, 1);
  player.position = { x: tree.position.x + tree.interactRadius + 2, y: 0, z: tree.position.z };
  assert.equal(room.gatherResource(player, tree.id), false);
  assert.equal(socket.sent.at(-1).reason, 'too_far');
  assert.ok(socket.sent.at(-1).distance > tree.interactRadius);
});

test('own warehouse deposit transfers inventory and enemy warehouse rejects', () => {
  const { room, add } = setup();
  const { player, socket } = add('ironhold');
  const own = room.warehouses.find((warehouse) => warehouse.faction === 'ironhold');
  const enemy = room.warehouses.find((warehouse) => warehouse.faction === 'verdant');
  player.inventory.wood = 6;
  player.inventory.stone = 4;
  player.position = { ...enemy.position };
  assert.equal(room.depositResources(player, enemy.id), false);
  assert.equal(socket.sent.at(-1).reason, 'enemy_warehouse');
  const before = { ...room.factionResources.ironhold };
  player.position = { ...own.position };
  assert.equal(room.depositResources(player, own.id), true);
  assert.equal(room.factionResources.ironhold.wood, before.wood + 6);
  assert.equal(room.factionResources.ironhold.stone, before.stone + 4);
  assert.equal(player.inventory.wood + player.inventory.stone, 0);
  assert.equal(player.gold, 20);
});

test('resource nodes regenerate and round reset restores nodes, inventory and faction stock', () => {
  const { room, add, setTime } = setup();
  const { player } = add();
  const tree = [...room.resourceNodes.values()].find((entry) => entry.type === 'tree');
  tree.amount = 3;
  tree.nextRegenAt = 2_000;
  setTime(7_000);
  room.updateResources(7_000);
  assert.ok(tree.amount > 3);
  player.inventory.wood = 20;
  room.factionResources.ironhold.wood = 1;
  const oldNodes = room.resourceNodes;
  room.resetRound(7_000);
  assert.notEqual(room.resourceNodes, oldNodes);
  assert.equal(player.inventory.wood, 0);
  assert.deepEqual(room.factionResources.ironhold, RESOURCE_RULES.startingFactionResources);
  assert.ok([...room.resourceNodes.values()].every((node) => node.amount === node.maxAmount));
});

test('Commander wall blueprint builds at a valid nearby position without false too-far rejection', () => {
  const { room, add } = setup();
  const { player, socket } = add('ironhold', 'commander');
  room.selectItem(player, 2);
  const target = { x: player.position.x + 6, y: 0, z: player.position.z };
  const before = room.factionResources.ironhold.wood;
  const wall = room.placeBuilding(player, { buildType: 'wooden_wall', position: target, rotation: 0 });
  assert.ok(wall);
  assert.equal(wall.type, 'wooden_wall');
  assert.equal(room.factionResources.ironhold.wood, before - 20);
  assert.ok(!socket.sent.some((message) => message.type === 'buildReject' && message.reason === 'too_far'));
  assert.deepEqual(wall.position, target);
});

test('far build rejects only beyond server player distance and wrong role/blueprint rejects clearly', () => {
  const { room, add } = setup();
  const worker = add('ironhold', 'worker');
  assert.equal(room.placeBuilding(worker.player, { position: { x: -74, z: 0 } }), false);
  assert.equal(worker.socket.sent.at(-1).reason, 'commander_required');
  const commander = add('ironhold', 'commander');
  assert.equal(room.placeBuilding(commander.player, { position: { x: -74, z: 0 } }), false);
  assert.equal(commander.socket.sent.at(-1).reason, 'wrong_blueprint');
  room.selectItem(commander.player, 2);
  assert.equal(room.placeBuilding(commander.player, { position: { x: -60, z: 0 } }), false);
  assert.equal(commander.socket.sent.at(-1).reason, 'too_far');
});

test('one Rally Flag per faction, with valid nearby placement and faction cost', () => {
  const { room, add, setTime } = setup();
  const { player, socket } = add('ironhold', 'commander');
  room.selectItem(player, 3);
  const before = { ...room.factionResources.ironhold };
  const rally = room.placeBuilding(player, {
    buildType: 'rally_flag',
    position: { x: player.position.x, y: 0, z: player.position.z - 6.5 },
    rotation: 0
  });
  assert.ok(rally);
  assert.equal(room.rallyFlags.ironhold, rally.id);
  assert.equal(room.factionResources.ironhold.wood, before.wood - 50);
  assert.equal(room.factionResources.ironhold.stone, before.stone - 30);
  setTime(2_000);
  assert.equal(room.placeBuilding(player, {
    buildType: 'rally_flag',
    position: { x: player.position.x - 6, z: player.position.z - 5 }
  }), false);
  assert.equal(socket.sent.at(-1).reason, 'rally_already_exists');
});

test('friendly building damage is blocked and enemy can destroy wall and Rally Flag', () => {
  const { room, add, setTime } = setup();
  const commander = add('ironhold', 'commander').player;
  room.selectItem(commander, 2);
  const wall = room.placeBuilding(commander, {
    buildType: 'wooden_wall', position: { x: -74, y: 0, z: 0 }, rotation: 0
  });
  const friend = add('ironhold', 'infantry').player;
  const enemy = add('verdant', 'infantry').player;
  const friendly = room.damageBuilding(friend, wall, 50, { source: 'test' });
  assert.equal(friendly.reason, 'friendly_building_damage_blocked');
  assert.equal(wall.hp, wall.maxHp);
  const hostile = room.damageBuilding(enemy, wall, wall.maxHp, { source: 'test' });
  assert.equal(hostile.ok, true);
  assert.equal(room.buildings.has(wall.id), false);

  room.selectItem(commander, 3);
  setTime(2_000);
  const rally = room.placeBuilding(commander, {
    buildType: 'rally_flag', position: { x: -80, y: 0, z: -6.5 }, rotation: 0
  });
  room.damageBuilding(enemy, rally, rally.maxHp, { source: 'sword' });
  assert.equal(room.buildings.has(rally.id), false);
  assert.equal(room.rallyFlags.ironhold, null);
});

test('Rally Flag becomes respawn point, destruction returns respawn to base', () => {
  const { room, add } = setup();
  const commander = add('ironhold', 'commander').player;
  room.selectItem(commander, 3);
  const rally = room.placeBuilding(commander, {
    buildType: 'rally_flag', position: { x: -80, y: 0, z: -6.5 }, rotation: 0
  });
  const teammate = add('ironhold', 'infantry').player;
  room.kill(teammate);
  room.respawn(teammate);
  assert.equal(teammate.lastRespawnLocation, 'rally_flag');
  assert.equal(teammate.position.x, rally.position.x);
  assert.ok(Math.abs(teammate.position.z - rally.position.z) <= 3.1);
  room.destroyBuilding(rally);
  room.kill(teammate);
  room.respawn(teammate);
  assert.equal(teammate.lastRespawnLocation, 'base');
  assert.equal(teammate.position.x, -80);
});

test('round reset removes temporary buildings and Rally references', () => {
  const { room, add } = setup();
  const commander = add('verdant', 'commander').player;
  room.selectItem(commander, 3);
  room.placeBuilding(commander, {
    buildType: 'rally_flag', position: { x: 80, y: 0, z: 6.5 }, rotation: 0
  });
  assert.equal(room.buildings.size, 1);
  assert.ok(room.rallyFlags.verdant);
  room.resetRound(5_000);
  assert.equal(room.buildings.size, 0);
  assert.deepEqual(room.rallyFlags, { ironhold: null, verdant: null });
});

test('tool combat cooldown does not block the separate gather interaction', () => {
  const { room, add } = setup();
  const worker = add('ironhold', 'worker').player;
  const tree = [...room.resourceNodes.values()].find((node) => node.type === 'tree');
  worker.position = { ...tree.position };
  assert.equal(room.requestPrimary(worker, {}), true);
  assert.equal(room.gatherResource(worker, tree.id), true);
  assert.equal(worker.inventory.wood, RESOURCE_RULES.gatherAmount);
});

test('not-enough-resources reject is explicit and enemy sword action damages a wall', () => {
  const { room, add, setTime } = setup();
  const commander = add('ironhold', 'commander').player;
  room.selectItem(commander, 3);
  room.factionResources.ironhold = { wood: 0, stone: 0 };
  assert.equal(room.placeBuilding(commander, {
    buildType: 'rally_flag', position: { x: -80, y: 0, z: -6.5 }
  }), false);
  const commanderSocket = room.sockets.get(commander.id);
  assert.equal(commanderSocket.sent.at(-1).reason, 'not_enough_resources');

  room.factionResources.ironhold = { wood: 160, stone: 100 };
  room.selectItem(commander, 2);
  const wall = room.placeBuilding(commander, {
    buildType: 'wooden_wall', position: { x: -74, y: 0, z: 0 }, rotation: 0
  });
  const enemy = add('verdant', 'infantry').player;
  enemy.position = { x: -70, y: 0, z: 0 };
  enemy.yaw = -Math.PI / 2;
  enemy.input.yaw = enemy.yaw;
  const before = wall.hp;
  assert.equal(room.requestPrimary(enemy, { targetId: wall.id }), true);
  setTime(1_250);
  room.tick(1_250);
  assert.ok(wall.hp < before);
});
