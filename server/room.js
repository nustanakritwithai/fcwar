import {
  AUTHORITY, BASIC_PLAYER, BUILDING_RULES, CLASSES, COMBAT, FACTIONS, OBJECTIVES, RESOURCE_RULES,
  ROUND_RULES, STAMINA, WAREHOUSES, WORLD,
  createLoadout, isClass, isFaction
} from './classes.js';
import { clamp, encode, safeNumber } from './protocol.js';

export const TICK_RATE = 20;

export class GameRoom {
  constructor({ now = () => Date.now(), devMode = false } = {}) {
    this.now = now;
    this.devMode = devMode;
    this.players = new Map();
    this.sockets = new Map();
    this.nextPlayerId = 1;
    this.tickTimer = null;
    this.lastTickAt = this.now();
    this.capturePoint = this.createCapturePoint();
    this.round = this.createRoundState(1);
    this.resourceNodes = this.createResourceNodes();
    this.warehouses = WAREHOUSES.map((warehouse) => ({ ...warehouse, position: { ...warehouse.position } }));
    this.factionResources = this.createFactionResources();
    this.buildings = new Map();
    this.rallyFlags = { ironhold: null, verdant: null };
    this.nextBuildingId = 1;
  }

  createFactionResources() {
    return {
      ironhold: { ...RESOURCE_RULES.startingFactionResources },
      verdant: { ...RESOURCE_RULES.startingFactionResources }
    };
  }

  createResourceNodes() {
    const at = this.now();
    const treePositions = [
      [-25, -36], [-15, -42], [-4, -36], [8, -43], [21, -35],
      [-31, -51], [-18, -57], [-2, -51], [14, -58], [29, -49]
    ];
    const rockPositions = [
      [-27, 36], [-14, 43], [-2, 36], [11, 44], [25, 35],
      [-31, 52], [-17, 57], [0, 51], [16, 58], [30, 50]
    ];
    const nodes = new Map();
    treePositions.forEach(([x, z], index) => {
      const id = `tree_${String(index + 1).padStart(2, '0')}`;
      nodes.set(id, {
        id, type: 'tree', resource: 'wood', position: { x, y: 0, z },
        amount: 12, maxAmount: 12, interactRadius: 3.8, requiredTool: 'axe',
        regenAmount: RESOURCE_RULES.regenAmount, regenEveryMs: RESOURCE_RULES.regenEveryMs,
        nextRegenAt: at + RESOURCE_RULES.regenDelayMs
      });
    });
    rockPositions.forEach(([x, z], index) => {
      const id = `rock_${String(index + 1).padStart(2, '0')}`;
      nodes.set(id, {
        id, type: 'rock', resource: 'stone', position: { x, y: 0, z },
        amount: 12, maxAmount: 12, interactRadius: 3.8, requiredTool: 'pickaxe',
        regenAmount: RESOURCE_RULES.regenAmount, regenEveryMs: RESOURCE_RULES.regenEveryMs,
        nextRegenAt: at + RESOURCE_RULES.regenDelayMs
      });
    });
    return nodes;
  }

  createRoundState(number) {
    const at = this.now();
    return {
      number,
      state: 'active',
      startedAt: at,
      lastScoreAt: at,
      scores: { ironhold: 0, verdant: 0 },
      targetScore: ROUND_RULES.targetScore,
      winningFaction: null,
      wonAt: 0,
      resetAt: 0
    };
  }

  createCapturePoint() {
    return {
      ...OBJECTIVES.centralFort,
      position: { ...OBJECTIVES.centralFort.position },
      ownerFaction: null,
      capturingFaction: null,
      progress: 0,
      contested: false,
      status: 'neutral',
      occupants: { ironhold: 0, verdant: 0 }
    };
  }

  addClient(socket) {
    const id = `p${this.nextPlayerId++}`;
    const player = {
      id,
      name: `Player ${id.slice(1)}`,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      faction: null,
      classId: null,
      loadout: [],
      equippedSlot: null,
      equippedItem: null,
      selectionStage: 'faction',
      hp: BASIC_PLAYER.maxHp,
      maxHp: BASIC_PLAYER.maxHp,
      stamina: 100,
      maxStamina: 100,
      alive: false,
      input: { x: 0, z: 0, yaw: 0, sprint: false, jump: false },
      stance: 'stand',
      inputRate: { windowStartedAt: this.now(), count: 0 },
      lastInputSeq: -1,
      velocityY: 0,
      respawnAt: 0,
      nextAttackAt: 0,
      pendingActions: [],
      blocking: false,
      bowDrawStartedAt: 0,
      lastStaminaSpendAt: 0,
      kills: 0,
      deaths: 0,
      gold: 0,
      level: 1,
      contribution: 0,
      inventory: { wood: 0, stone: 0, capacity: RESOURCE_RULES.carryCapacity },
      nextGatherAt: 0,
      nextBuildAt: 0,
      lastRespawnLocation: 'base'
    };
    this.players.set(id, player);
    this.sockets.set(id, socket);
    this.send(id, 'welcome', { id, tickRate: TICK_RATE });
    this.broadcastSnapshot();
    return player;
  }

  removeClient(id) {
    this.players.delete(id);
    this.sockets.delete(id);
    this.broadcast('playerLeft', { id });
  }

  handleMessage(id, message) {
    const player = this.players.get(id);
    if (!player) return;
    if (message.type === 'hello' && typeof message.name === 'string') {
      player.name = message.name.trim().slice(0, 24) || player.name;
    }
    if (message.type === 'selectFaction') this.selectFaction(player, message.faction);
    if (message.type === 'selectClass') this.selectClass(player, message.classId);
    if (message.type === 'selectItem') this.selectItem(player, message.slot);
    if (message.type === 'primary') this.requestPrimary(player, message);
    if (message.type === 'secondary') this.requestSecondary(player, Boolean(message.active));
    if (message.type === 'gather') this.gatherResource(player, message.nodeId);
    if (message.type === 'deposit') this.depositResources(player, message.warehouseId);
    if (message.type === 'build') this.placeBuilding(player, message);
    if (message.type === 'input') this.handleInput(player, message);
    if (message.type === 'respawn' && !player.alive && this.now() >= player.respawnAt) {
      this.respawn(player);
    }
  }

  selectFaction(player, factionId) {
    if (!isFaction(factionId)) {
      this.send(player.id, 'selectReject', { selection: 'faction', reason: 'invalid_faction' });
      return false;
    }
    player.faction = factionId;
    player.classId = null;
    player.loadout = [];
    player.equippedSlot = null;
    player.equippedItem = null;
    player.selectionStage = 'class';
    player.position = { ...FACTIONS[factionId].spawn };
    player.yaw = factionId === 'ironhold' ? Math.PI / 2 : -Math.PI / 2;
    player.alive = false;
    this.send(player.id, 'factionSelected', { faction: factionId });
    this.broadcastSnapshot();
    return true;
  }

  selectClass(player, requestedClass) {
    if (!player.faction) {
      this.send(player.id, 'selectReject', { selection: 'class', reason: 'faction_required' });
      return false;
    }
    const fallback = !isClass(requestedClass);
    const classId = fallback ? 'infantry' : requestedClass;
    const definition = CLASSES[classId];
    player.classId = classId;
    player.loadout = createLoadout(classId);
    player.equippedSlot = player.loadout[0].slot;
    player.equippedItem = { ...player.loadout[0] };
    player.selectionStage = null;
    player.maxHp = definition.maxHp;
    player.hp = definition.maxHp;
    player.maxStamina = definition.maxStamina;
    player.stamina = definition.maxStamina;
    player.inventory = { wood: 0, stone: 0, capacity: RESOURCE_RULES.carryCapacity };
    this.respawn(player);
    this.send(player.id, 'classSelected', { classId, fallback });
    this.broadcastSnapshot();
    return true;
  }

  selectItem(player, requestedSlot) {
    if (!player.classId || !Number.isInteger(requestedSlot)) {
      this.send(player.id, 'selectReject', { selection: 'item', reason: 'invalid_slot', slot: requestedSlot });
      return false;
    }
    const item = player.loadout.find((entry) => entry.slot === requestedSlot);
    if (!item || !item.classRestrictions.includes(player.classId)) {
      this.send(player.id, 'selectReject', { selection: 'item', reason: 'invalid_slot', slot: requestedSlot });
      return false;
    }
    player.equippedSlot = item.slot;
    player.equippedItem = { ...item };
    player.blocking = false;
    player.bowDrawStartedAt = 0;
    this.send(player.id, 'itemSelected', { slot: item.slot, item: player.equippedItem });
    this.broadcastSnapshot();
    return true;
  }

  requestPrimary(player, message = {}) {
    const item = player.equippedItem;
    const at = this.now();
    if (!player.alive) return this.rejectAction(player, 'dead_player');
    if (!item?.primaryAction) return this.rejectAction(player, 'no_primary_action');
    if (at < player.nextAttackAt) return this.rejectAction(player, 'cooldown');

    if (item.primaryAction === 'swordSwing' || item.primaryAction === 'toolSwing') {
      const tuning = COMBAT[item.weaponKey];
      if (!tuning) return this.rejectAction(player, 'invalid_weapon');
      if (!this.spendStamina(player, tuning.staminaCost, at)) return this.rejectAction(player, 'not_enough_stamina');
      player.nextAttackAt = at + tuning.cooldownMs;
      player.blocking = false;
      player.pendingActions.push({
        kind: 'melee',
        weaponKey: item.weaponKey,
        targetId: typeof message.targetId === 'string' ? message.targetId : null,
        startedAt: at,
        activeAt: at + tuning.windupMs,
        activeUntil: at + tuning.windupMs + tuning.activeMs,
        recoveryUntil: at + tuning.windupMs + tuning.activeMs + tuning.recoveryMs,
        resolved: false
      });
      this.broadcast('actionEvent', {
        actorId: player.id, action: 'swing', weaponKey: item.weaponKey,
        startedAt: at, activeAt: at + tuning.windupMs
      });
      return true;
    }

    if (item.primaryAction === 'bowShot') return this.shootBow(player, message, at);
    if (item.primaryAction === 'placeBuilding') return Boolean(this.placeBuilding(player, message));
    return this.rejectAction(player, 'unsupported_primary');
  }

  requestSecondary(player, active) {
    const item = player.equippedItem;
    const at = this.now();
    if (!player.alive) return this.rejectAction(player, 'dead_player');
    if (item?.secondaryAction === 'block') {
      if (active && player.stamina <= 0) return this.rejectAction(player, 'not_enough_stamina');
      player.blocking = active;
      if (active) player.bowDrawStartedAt = 0;
      this.broadcast('actionEvent', { actorId: player.id, action: active ? 'blockStart' : 'blockEnd' });
      return true;
    }
    if (item?.secondaryAction === 'drawBow') {
      player.blocking = false;
      if (active) {
        if (!player.bowDrawStartedAt) player.bowDrawStartedAt = at;
      } else {
        player.bowDrawStartedAt = 0;
      }
      this.send(player.id, 'bowState', { drawing: active, startedAt: player.bowDrawStartedAt });
      return true;
    }
    return this.rejectAction(player, 'no_secondary_action');
  }

  shootBow(player, message, at) {
    const tuning = COMBAT.archer_bow;
    if (!player.bowDrawStartedAt || at - player.bowDrawStartedAt < tuning.drawMs) {
      return this.rejectAction(player, 'bow_draw_too_short');
    }
    if (!this.spendStamina(player, tuning.staminaCost, at)) return this.rejectAction(player, 'not_enough_stamina');
    player.nextAttackAt = at + tuning.cooldownMs;
    player.bowDrawStartedAt = 0;
    const requestedBuilding = typeof message.targetId === 'string' ? this.buildings.get(message.targetId) : null;
    const buildingTarget = requestedBuilding && this.buildingInArc(player, requestedBuilding, tuning) ? requestedBuilding : null;
    const target = buildingTarget ? null : this.findCombatTarget(player, tuning, message.targetId);
    const from = { x: player.position.x, y: player.position.y + 1.4, z: player.position.z };
    const forward = forwardFromYaw(player.yaw);
    const fallbackEnd = {
      x: from.x + forward.x * tuning.range,
      y: from.y,
      z: from.z + forward.z * tuning.range
    };
    if (buildingTarget) this.damageBuilding(player, buildingTarget, tuning.damage, { source: 'bow' });
    else if (target) this.applyDamage(player, target, tuning.damage, { source: 'bow' });
    this.broadcast('tracer', {
      actorId: player.id,
      from,
      to: buildingTarget
        ? { x: buildingTarget.position.x, y: Math.min(2.2, buildingTarget.size.y * .5), z: buildingTarget.position.z }
        : target ? { x: target.position.x, y: target.position.y + 1.2, z: target.position.z } : fallbackEnd,
      hitId: buildingTarget?.id || target?.id || null
    });
    return true;
  }

  spendStamina(player, amount, at = this.now()) {
    if (player.stamina + 1e-6 < amount) return false;
    player.stamina = Math.max(0, player.stamina - amount);
    player.lastStaminaSpendAt = at;
    return true;
  }

  rejectAction(player, reason) {
    this.send(player.id, 'actionReject', { reason });
    return false;
  }

  processCombat(at) {
    for (const player of this.players.values()) {
      for (const action of player.pendingActions) {
        if (action.resolved || at < action.activeAt) continue;
        action.resolved = true;
        if (at <= action.activeUntil && player.alive) this.resolveMelee(player, action);
      }
      player.pendingActions = player.pendingActions.filter((action) => at <= action.recoveryUntil);
    }
  }

  resolveMelee(attacker, action) {
    const tuning = COMBAT[action.weaponKey];
    const building = action.targetId ? this.buildings.get(action.targetId) : null;
    if (building && this.buildingInArc(attacker, building, tuning)) {
      return this.damageBuilding(attacker, building, tuning.damage, { source: action.weaponKey }).ok;
    }
    const target = this.findCombatTarget(attacker, tuning, action.targetId);
    if (!target) {
      this.broadcast('hitEvent', { attackerId: attacker.id, hit: false, source: action.weaponKey });
      return false;
    }
    return this.applyDamage(attacker, target, tuning.damage, { source: action.weaponKey });
  }

  findCombatTarget(attacker, tuning, requestedId = null) {
    const candidates = requestedId
      ? [this.players.get(requestedId)].filter(Boolean)
      : [...this.players.values()];
    return candidates
      .filter((target) => this.validEnemyInArc(attacker, target, tuning))
      .sort((a, b) => distance2d(attacker.position, a.position) - distance2d(attacker.position, b.position))[0] || null;
  }

  validEnemyInArc(attacker, target, tuning) {
    if (!target?.alive || target.id === attacker.id || target.faction === attacker.faction) return false;
    const dx = target.position.x - attacker.position.x;
    const dz = target.position.z - attacker.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= 0 || distance > tuning.range) return false;
    const forward = forwardFromYaw(attacker.yaw);
    return (forward.x * dx + forward.z * dz) / distance >= tuning.facingDot;
  }

  applyDamage(attacker, target, baseDamage, { source = 'unknown' } = {}) {
    if (!attacker?.alive || !target?.alive) return { ok: false, reason: 'invalid_target', damage: 0 };
    if (attacker.faction === target.faction) {
      this.send(attacker.id, 'actionReject', { reason: 'friendly_fire_blocked' });
      return { ok: false, reason: 'friendly_fire_blocked', damage: 0 };
    }
    let damage = baseDamage;
    let blocked = false;
    if (target.blocking && target.equippedItem?.secondaryAction === 'block' && target.stamina > 0) {
      const dx = attacker.position.x - target.position.x;
      const dz = attacker.position.z - target.position.z;
      const distance = Math.hypot(dx, dz) || 1;
      const facing = forwardFromYaw(target.yaw);
      const frontalDot = (facing.x * dx + facing.z * dz) / distance;
      if (frontalDot >= COMBAT.shield.frontalDot) {
        blocked = true;
        damage *= 1 - COMBAT.shield.damageReduction;
        target.stamina = Math.max(0, target.stamina - STAMINA.blockHitCost);
        if (target.stamina <= 0) target.blocking = false;
      }
    }
    damage = Math.max(1, Math.round(damage));
    target.hp = Math.max(0, target.hp - damage);
    this.broadcast('hitEvent', {
      attackerId: attacker.id, targetId: target.id, damage, blocked, source, hit: true
    });
    if (target.hp <= 0) this.kill(target, attacker, source);
    return { ok: true, damage, blocked };
  }

  gatherResource(player, nodeId) {
    const at = this.now();
    const node = this.resourceNodes.get(nodeId);
    if (!player?.alive) return this.rejectInteraction(player, 'gather', 'dead_player', nodeId);
    if (player.classId !== 'worker') return this.rejectInteraction(player, 'gather', 'worker_required', nodeId);
    if (!node) return this.rejectInteraction(player, 'gather', 'node_not_found', nodeId);
    const requiredItem = node.requiredTool === 'axe' ? 'worker_axe' : 'worker_pickaxe';
    if (player.equippedItem?.id !== requiredItem) {
      return this.rejectInteraction(player, 'gather', 'wrong_tool', nodeId, { requiredTool: node.requiredTool });
    }
    const distance = distance2d(player.position, node.position);
    if (distance > node.interactRadius) {
      return this.rejectInteraction(player, 'gather', 'too_far', nodeId, { distance });
    }
    if (at < player.nextGatherAt) return this.rejectInteraction(player, 'gather', 'cooldown', nodeId);
    if (node.amount <= 0) return this.rejectInteraction(player, 'gather', 'node_depleted', nodeId);
    const carried = player.inventory.wood + player.inventory.stone;
    const availableCapacity = player.inventory.capacity - carried;
    if (availableCapacity <= 0) return this.rejectInteraction(player, 'gather', 'inventory_full', nodeId);
    const amount = Math.min(RESOURCE_RULES.gatherAmount, availableCapacity, node.amount);
    node.amount -= amount;
    node.nextRegenAt = at + RESOURCE_RULES.regenDelayMs;
    player.inventory[node.resource] += amount;
    player.nextGatherAt = at + RESOURCE_RULES.gatherCooldownMs;
    player.gold += 1;
    player.contribution += amount;
    this.broadcast('resourceUpdate', {
      nodeId: node.id,
      amount: node.amount,
      playerId: player.id,
      resource: node.resource,
      gathered: amount
    });
    return true;
  }

  depositResources(player, warehouseId) {
    const warehouse = this.warehouses.find((entry) => entry.id === warehouseId);
    if (!player?.alive) return this.rejectInteraction(player, 'deposit', 'dead_player', warehouseId);
    if (!warehouse) return this.rejectInteraction(player, 'deposit', 'warehouse_not_found', warehouseId);
    if (warehouse.faction !== player.faction) {
      return this.rejectInteraction(player, 'deposit', 'enemy_warehouse', warehouseId);
    }
    const distance = distance2d(player.position, warehouse.position);
    if (distance > warehouse.interactRadius) {
      return this.rejectInteraction(player, 'deposit', 'too_far', warehouseId, { distance });
    }
    const wood = player.inventory.wood;
    const stone = player.inventory.stone;
    const total = wood + stone;
    if (total <= 0) return this.rejectInteraction(player, 'deposit', 'inventory_empty', warehouseId);
    this.factionResources[player.faction].wood += wood;
    this.factionResources[player.faction].stone += stone;
    player.inventory.wood = 0;
    player.inventory.stone = 0;
    player.gold += total * 2;
    player.contribution += total;
    this.broadcast('depositEvent', {
      playerId: player.id,
      faction: player.faction,
      warehouseId,
      wood,
      stone,
      factionResources: { ...this.factionResources[player.faction] }
    });
    return true;
  }

  rejectInteraction(player, action, reason, targetId, extra = {}) {
    if (player?.id) this.send(player.id, 'interactionReject', { action, reason, targetId, ...extra });
    return false;
  }

  updateResources(at = this.now()) {
    for (const node of this.resourceNodes.values()) {
      if (node.amount >= node.maxAmount || at < node.nextRegenAt) continue;
      const intervals = Math.floor((at - node.nextRegenAt) / node.regenEveryMs) + 1;
      node.amount = Math.min(node.maxAmount, node.amount + intervals * node.regenAmount);
      node.nextRegenAt += intervals * node.regenEveryMs;
    }
  }

  placeBuilding(player, request = {}) {
    const at = this.now();
    if (!player?.alive) return this.rejectBuild(player, 'dead_player');
    if (player.classId !== 'commander') return this.rejectBuild(player, 'commander_required');
    const item = player.equippedItem;
    if (item?.itemType !== 'blueprint' || !item.buildType) return this.rejectBuild(player, 'wrong_blueprint');
    if (request.buildType && request.buildType !== item.buildType) return this.rejectBuild(player, 'wrong_blueprint');
    const rules = BUILDING_RULES[item.buildType];
    if (!rules) return this.rejectBuild(player, 'wrong_blueprint');
    if (item.buildType === 'rally_flag' && this.rallyFlags[player.faction]) {
      return this.rejectBuild(player, 'rally_already_exists');
    }
    if (at < player.nextBuildAt) return this.rejectBuild(player, 'build_cooldown');
    const position = {
      x: safeNumber(request.position?.x, Number.NaN),
      y: 0,
      z: safeNumber(request.position?.z, Number.NaN)
    };
    if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) return this.rejectBuild(player, 'invalid_position');
    const buildDistance = distance2d(player.position, position);
    if (buildDistance > BUILDING_RULES.maxBuildDistance) {
      return this.rejectBuild(player, 'too_far', { distance: buildDistance, maxDistance: BUILDING_RULES.maxBuildDistance });
    }
    if (
      position.x - rules.collisionRadius < WORLD.minX ||
      position.x + rules.collisionRadius > WORLD.maxX ||
      position.z - rules.collisionRadius < WORLD.minZ ||
      position.z + rules.collisionRadius > WORLD.maxZ
    ) return this.rejectBuild(player, 'out_of_bounds');
    const overlap = this.findBuildOverlap(position, rules.collisionRadius);
    if (overlap) return this.rejectBuild(player, 'overlap', { overlapType: overlap.type, overlapId: overlap.id });
    const stock = this.factionResources[player.faction];
    if (stock.wood < rules.cost.wood || stock.stone < rules.cost.stone) {
      return this.rejectBuild(player, 'not_enough_resources', { cost: { ...rules.cost } });
    }
    stock.wood -= rules.cost.wood;
    stock.stone -= rules.cost.stone;
    const id = `building_${this.nextBuildingId++}`;
    const building = {
      id,
      type: item.buildType,
      name: rules.name,
      faction: player.faction,
      position,
      rotation: normalizeAngle(safeNumber(request.rotation, player.yaw)),
      hp: rules.maxHp,
      maxHp: rules.maxHp,
      collisionRadius: rules.collisionRadius,
      size: { ...rules.size },
      cost: { ...rules.cost },
      createdAt: at,
      ownerPlayerId: player.id
    };
    this.buildings.set(id, building);
    if (building.type === 'rally_flag') this.rallyFlags[player.faction] = id;
    player.nextBuildAt = at + BUILDING_RULES.buildCooldownMs;
    player.contribution += rules.cost.wood + rules.cost.stone;
    this.broadcast('buildingPlaced', { building: this.cloneBuilding(building) });
    return building;
  }

  findBuildOverlap(position, radius) {
    if (distance2d(position, this.capturePoint.position) < this.capturePoint.radius + radius + 1) {
      return { type: 'capture_point', id: this.capturePoint.id };
    }
    for (const warehouse of this.warehouses) {
      if (distance2d(position, warehouse.position) < warehouse.interactRadius + radius) {
        return { type: 'warehouse', id: warehouse.id };
      }
    }
    for (const node of this.resourceNodes.values()) {
      if (distance2d(position, node.position) < 2.1 + radius) return { type: 'resource_node', id: node.id };
    }
    for (const building of this.buildings.values()) {
      if (distance2d(position, building.position) < building.collisionRadius + radius + .4) {
        return { type: 'building', id: building.id };
      }
    }
    for (const player of this.players.values()) {
      if (player.alive && distance2d(position, player.position) < radius + .8) {
        return { type: 'player', id: player.id };
      }
    }
    return null;
  }

  rejectBuild(player, reason, extra = {}) {
    if (player?.id) this.send(player.id, 'buildReject', { reason, ...extra });
    return false;
  }

  damageBuilding(attacker, buildingOrId, baseDamage, { source = 'unknown' } = {}) {
    const building = typeof buildingOrId === 'string' ? this.buildings.get(buildingOrId) : buildingOrId;
    if (!attacker?.alive || !building || !this.buildings.has(building.id)) {
      return { ok: false, reason: 'invalid_building', damage: 0 };
    }
    if (attacker.faction === building.faction) {
      this.send(attacker.id, 'actionReject', { reason: 'friendly_building_damage_blocked' });
      return { ok: false, reason: 'friendly_building_damage_blocked', damage: 0 };
    }
    const damage = Math.max(1, Math.round(baseDamage));
    building.hp = Math.max(0, building.hp - damage);
    this.broadcast('buildingDamaged', { buildingId: building.id, hp: building.hp, damage, attackerId: attacker.id, source });
    if (building.hp <= 0) this.destroyBuilding(building, attacker, source);
    return { ok: true, damage, destroyed: building.hp <= 0 };
  }

  destroyBuilding(buildingOrId, attacker = null, source = 'unknown') {
    const building = typeof buildingOrId === 'string' ? this.buildings.get(buildingOrId) : buildingOrId;
    if (!building || !this.buildings.has(building.id)) return false;
    this.buildings.delete(building.id);
    if (building.type === 'rally_flag' && this.rallyFlags[building.faction] === building.id) {
      this.rallyFlags[building.faction] = null;
    }
    if (attacker) attacker.contribution += 15;
    this.broadcast('buildingDestroyed', { buildingId: building.id, attackerId: attacker?.id || null, source });
    return true;
  }

  buildingInArc(attacker, building, tuning) {
    if (!building) return false;
    const dx = building.position.x - attacker.position.x;
    const dz = building.position.z - attacker.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= 0 || distance > tuning.range + building.collisionRadius * .45) return false;
    const forward = forwardFromYaw(attacker.yaw);
    return (forward.x * dx + forward.z * dz) / distance >= tuning.facingDot;
  }

  cloneBuilding(building) {
    return { ...building, position: { ...building.position }, size: { ...building.size }, cost: { ...building.cost } };
  }

  handleInput(player, message) {
    const at = this.now();
    if (!player.alive) {
      this.send(player.id, 'movementReject', { reason: 'dead_player' });
      return false;
    }
    if (at - player.inputRate.windowStartedAt >= 1000) {
      player.inputRate.windowStartedAt = at;
      player.inputRate.count = 0;
    }
    player.inputRate.count += 1;
    if (player.inputRate.count > AUTHORITY.maxInputsPerSecond) {
      this.send(player.id, 'movementReject', { reason: 'packet_rate_limit' });
      return false;
    }
    const seq = Number.isInteger(message.seq) ? message.seq : player.lastInputSeq + 1;
    if (seq <= player.lastInputSeq) {
      this.send(player.id, 'movementReject', { reason: 'stale_input' });
      return false;
    }
    if (message.position && typeof message.position === 'object') {
      const hintX = safeNumber(message.position.x, player.position.x);
      const hintY = safeNumber(message.position.y, player.position.y);
      const hintZ = safeNumber(message.position.z, player.position.z);
      const horizontalError = Math.hypot(hintX - player.position.x, hintZ - player.position.z);
      if (horizontalError > AUTHORITY.maxPositionHintError) {
        this.send(player.id, 'movementReject', { reason: 'teleport_rejected' });
        return false;
      }
      if (Math.abs(hintY - player.position.y) > AUTHORITY.maxVerticalHintError) {
        this.send(player.id, 'movementReject', { reason: 'anti_fly_rejected' });
        return false;
      }
    }
    player.lastInputSeq = seq;
    player.input.x = clamp(safeNumber(message.moveX), -1, 1);
    player.input.z = clamp(safeNumber(message.moveZ), -1, 1);
    player.input.yaw = normalizeAngle(safeNumber(message.yaw, player.yaw));
    player.input.sprint = Boolean(message.sprint);
    player.input.jump = Boolean(message.jump);
    if (['stand', 'crouch', 'prone'].includes(message.stance)) player.stance = message.stance;
    return true;
  }

  tick(at = this.now()) {
    const dt = Math.min(AUTHORITY.maxTickSeconds, Math.max(0, (at - this.lastTickAt) / 1000));
    this.lastTickAt = at;
    for (const player of this.players.values()) this.updatePlayer(player, dt, at);
    this.processCombat(at);
    this.updateResources(at);
    this.updateCapture(dt, at);
    this.updateRound(at);
    this.broadcastSnapshot();
  }

  updateRound(at = this.now()) {
    if (this.round.state === 'victory') {
      if (at >= this.round.resetAt) this.resetRound(at);
      return;
    }
    if (!this.capturePoint.ownerFaction) {
      if (at - this.round.lastScoreAt >= ROUND_RULES.scoreIntervalMs) this.round.lastScoreAt = at;
      return;
    }
    const elapsed = at - this.round.lastScoreAt;
    if (elapsed < ROUND_RULES.scoreIntervalMs) return;
    const intervals = Math.floor(elapsed / ROUND_RULES.scoreIntervalMs);
    const faction = this.capturePoint.ownerFaction;
    this.round.lastScoreAt += intervals * ROUND_RULES.scoreIntervalMs;
    this.round.scores[faction] = Math.min(
      ROUND_RULES.targetScore,
      this.round.scores[faction] + intervals * ROUND_RULES.scorePerInterval
    );
    this.broadcast('scoreEvent', { faction, score: this.round.scores[faction] });
    if (this.round.scores[faction] >= ROUND_RULES.targetScore) this.finishRound(faction, at);
  }

  finishRound(faction, at = this.now()) {
    if (this.round.state !== 'active' || !isFaction(faction)) return false;
    this.round.state = 'victory';
    this.round.winningFaction = faction;
    this.round.wonAt = at;
    this.round.resetAt = at + ROUND_RULES.resetDelayMs;
    this.broadcast('victoryEvent', {
      winningFaction: faction,
      scores: { ...this.round.scores },
      resetAt: this.round.resetAt
    });
    return true;
  }

  resetRound(at = this.now()) {
    const nextNumber = this.round.number + 1;
    this.capturePoint = this.createCapturePoint();
    this.resourceNodes = this.createResourceNodes();
    this.factionResources = this.createFactionResources();
    this.buildings.clear();
    this.rallyFlags = { ironhold: null, verdant: null };
    this.nextBuildingId = 1;
    this.round = this.createRoundState(nextNumber);
    this.round.startedAt = at;
    this.round.lastScoreAt = at;
    for (const player of this.players.values()) {
      player.kills = 0;
      player.deaths = 0;
      player.gold = 0;
      player.contribution = 0;
      player.inventory = { wood: 0, stone: 0, capacity: RESOURCE_RULES.carryCapacity };
      player.nextGatherAt = 0;
      player.nextBuildAt = 0;
      player.pendingActions = [];
      player.blocking = false;
      player.bowDrawStartedAt = 0;
      if (player.classId) {
        player.loadout = createLoadout(player.classId);
        player.equippedSlot = player.loadout[0].slot;
        player.equippedItem = { ...player.loadout[0] };
        this.respawn(player);
      }
    }
    this.broadcast('roundReset', { roundNumber: nextNumber, at });
  }

  updateCapture(dt, at = this.now()) {
    const point = this.capturePoint;
    const counts = { ironhold: 0, verdant: 0 };
    for (const player of this.players.values()) {
      if (!player.alive || !player.faction) continue;
      if (distance2d(player.position, point.position) <= point.radius) counts[player.faction] += 1;
    }
    point.occupants = counts;
    const difference = counts.ironhold - counts.verdant;
    if (difference === 0) {
      point.contested = true;
      point.status = counts.ironhold > 0 ? 'contested' : 'paused';
      return;
    }
    const leader = difference > 0 ? 'ironhold' : 'verdant';
    const strength = Math.abs(difference);
    point.contested = false;
    if (leader === point.ownerFaction) {
      if (point.progress > 0) {
        point.progress = Math.max(0, point.progress - OBJECTIVES.centralFort.capturePerSecondPerPlayer * strength * dt);
        if (point.progress === 0) point.capturingFaction = null;
      }
      point.status = point.progress > 0 ? 'defending' : 'owned';
      return;
    }
    if (point.capturingFaction && point.capturingFaction !== leader && point.progress > 0) {
      point.progress = Math.max(0, point.progress - OBJECTIVES.centralFort.capturePerSecondPerPlayer * strength * dt);
      point.status = 'reversing';
      if (point.progress === 0) point.capturingFaction = leader;
      return;
    }
    point.capturingFaction = leader;
    point.progress = Math.min(100, point.progress + OBJECTIVES.centralFort.capturePerSecondPerPlayer * strength * dt);
    point.status = 'capturing';
    if (point.progress >= 100) {
      point.ownerFaction = leader;
      point.capturingFaction = null;
      point.progress = 0;
      point.status = 'owned';
      this.broadcast('captureEvent', { pointId: point.id, ownerFaction: leader, at });
    }
  }

  updatePlayer(player, dt, at) {
    if (!player.alive) {
      if (at >= player.respawnAt) this.respawn(player);
      return;
    }
    const inputLength = Math.hypot(player.input.x, player.input.z);
    const nx = inputLength > 1 ? player.input.x / inputLength : player.input.x;
    const nz = inputLength > 1 ? player.input.z / inputLength : player.input.z;
    const stats = player.classId ? CLASSES[player.classId] : BASIC_PLAYER;
    const stanceMultiplier = player.stance === 'prone' ? .38 : player.stance === 'crouch' ? .64 : 1;
    const sprinting = player.stance === 'stand' && player.input.sprint && inputLength > 0.15 && player.stamina > 0 && !player.blocking;
    const speed = stats.moveSpeed * stanceMultiplier * (sprinting ? stats.sprintMultiplier : 1);
    const candidateX = clamp(player.position.x + nx * speed * dt, WORLD.minX, WORLD.maxX);
    if (!this.collidesBuilding(candidateX, player.position.z)) player.position.x = candidateX;
    const candidateZ = clamp(player.position.z + nz * speed * dt, WORLD.minZ, WORLD.maxZ);
    if (!this.collidesBuilding(player.position.x, candidateZ)) player.position.z = candidateZ;
    player.yaw = player.input.yaw;
    if (player.input.jump && player.stance === 'stand' && player.position.y <= WORLD.groundY) player.velocityY = stats.jumpSpeed;
    player.input.jump = false;
    player.velocityY -= 18 * dt;
    player.position.y = Math.max(WORLD.groundY, player.position.y + player.velocityY * dt);
    if (player.position.y === WORLD.groundY && player.velocityY < 0) player.velocityY = 0;
    let draining = false;
    if (sprinting) {
      player.stamina = Math.max(0, player.stamina - STAMINA.sprintDrainPerSecond * dt);
      player.lastStaminaSpendAt = at;
      draining = true;
    }
    if (player.blocking) {
      player.stamina = Math.max(0, player.stamina - STAMINA.blockDrainPerSecond * dt);
      player.lastStaminaSpendAt = at;
      draining = true;
      if (player.stamina <= 0) player.blocking = false;
    }
    if (!draining && at - player.lastStaminaSpendAt >= 450) {
      player.stamina = Math.min(player.maxStamina, player.stamina + STAMINA.regenPerSecond * dt);
    }
  }

  collidesBuilding(x, z) {
    for (const building of this.buildings.values()) {
      if (Math.hypot(x - building.position.x, z - building.position.z) < building.collisionRadius + .55) return true;
    }
    return false;
  }

  kill(player, killer = null, source = 'unknown') {
    player.alive = false;
    player.hp = 0;
    player.respawnAt = this.now() + 3000;
    player.deaths += 1;
    player.blocking = false;
    player.bowDrawStartedAt = 0;
    player.pendingActions = [];
    player.input = { x: 0, z: 0, yaw: player.yaw, sprint: false, jump: false };
    if (killer && killer.id !== player.id && killer.faction !== player.faction) {
      killer.kills += 1;
      killer.gold += 10;
      killer.contribution += 10;
    }
    this.broadcast('deathEvent', {
      playerId: player.id,
      killerId: killer?.id || null,
      source,
      respawnAt: player.respawnAt
    });
  }

  respawn(player) {
    if (!player.faction || !player.classId) return false;
    const rallyId = this.rallyFlags[player.faction];
    const rally = rallyId ? this.buildings.get(rallyId) : null;
    const rallySpawn = rally ? this.findRallySpawn(rally) : null;
    player.position = rallySpawn || { ...FACTIONS[player.faction].spawn };
    player.lastRespawnLocation = rallySpawn ? 'rally_flag' : 'base';
    player.yaw = player.faction === 'ironhold' ? Math.PI / 2 : -Math.PI / 2;
    player.input = { x: 0, z: 0, yaw: player.yaw, sprint: false, jump: false };
    player.hp = player.maxHp;
    player.stamina = player.maxStamina;
    player.alive = true;
    player.velocityY = 0;
    player.blocking = false;
    player.bowDrawStartedAt = 0;
    player.pendingActions = [];
    player.nextAttackAt = 0;
    player.stance = 'stand';
    return true;
  }

  findRallySpawn(rally) {
    for (const [dx, dz] of [[0, 3], [0, -3], [3, 0], [-3, 0], [0, 4.5]]) {
      const x = rally.position.x + dx;
      const z = rally.position.z + dz;
      if (x < WORLD.minX || x > WORLD.maxX || z < WORLD.minZ || z > WORLD.maxZ) continue;
      if (!this.collidesBuilding(x, z)) return { x, y: 0, z };
    }
    return null;
  }

  snapshot() {
    return {
      serverTime: this.now(),
      devMode: this.devMode,
      factions: FACTIONS,
      classes: CLASSES,
      round: {
        ...this.round,
        scores: { ...this.round.scores }
      },
      resourceNodes: [...this.resourceNodes.values()].map((node) => ({
        ...node,
        position: { ...node.position }
      })),
      warehouses: this.warehouses.map((warehouse) => ({
        ...warehouse,
        position: { ...warehouse.position }
      })),
      factionResources: {
        ironhold: { ...this.factionResources.ironhold },
        verdant: { ...this.factionResources.verdant }
      },
      buildings: [...this.buildings.values()].map((building) => this.cloneBuilding(building)),
      rallyFlags: { ...this.rallyFlags },
      capturePoints: [{
        ...this.capturePoint,
        position: { ...this.capturePoint.position },
        occupants: { ...this.capturePoint.occupants }
      }],
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        position: { ...p.position },
        yaw: p.yaw,
        faction: p.faction,
        classId: p.classId,
        className: p.classId ? CLASSES[p.classId].name : null,
        classThaiName: p.classId ? CLASSES[p.classId].thaiName : null,
        loadout: p.loadout.map((item) => ({ ...item })),
        equippedSlot: p.equippedSlot,
        equippedItem: p.equippedItem ? { ...p.equippedItem } : null,
        factionColor: p.faction ? FACTIONS[p.faction].color : '#8b96a5',
        selectionStage: p.selectionStage,
        hp: p.hp,
        maxHp: p.maxHp,
        stamina: Math.round(p.stamina * 10) / 10,
        maxStamina: p.maxStamina,
        blocking: p.blocking,
        bowDrawStartedAt: p.bowDrawStartedAt,
        nextAttackAt: p.nextAttackAt,
        combatAction: p.pendingActions[0] ? { ...p.pendingActions[0] } : null,
        kills: p.kills,
        deaths: p.deaths,
        gold: p.gold,
        level: p.level,
        contribution: p.contribution,
        inventory: { ...p.inventory },
        lastRespawnLocation: p.lastRespawnLocation,
        respawnLocation: p.faction && this.rallyFlags[p.faction] ? 'rally_flag' : 'base',
        stance: p.stance,
        alive: p.alive,
        respawnAt: p.respawnAt,
        lastInputSeq: p.lastInputSeq
      }))
    };
  }

  send(id, type, payload = {}) {
    const socket = this.sockets.get(id);
    if (socket?.readyState === 1) socket.send(encode(type, payload));
  }

  broadcast(type, payload = {}) {
    const data = encode(type, payload);
    for (const socket of this.sockets.values()) if (socket.readyState === 1) socket.send(data);
  }

  broadcastSnapshot() {
    this.broadcast('snapshot', { state: this.snapshot() });
  }

  start() {
    if (!this.tickTimer) this.tickTimer = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  stop() {
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }
}

function normalizeAngle(value) {
  let angle = value % (Math.PI * 2);
  if (angle > Math.PI) angle -= Math.PI * 2;
  if (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function forwardFromYaw(yaw) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

function distance2d(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
