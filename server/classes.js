export const WORLD = Object.freeze({
  minX: -120,
  maxX: 120,
  minZ: -75,
  maxZ: 75,
  groundY: 0
});

export const FACTIONS = Object.freeze({
  ironhold: Object.freeze({
    id: 'ironhold',
    name: 'Ironhold',
    thaiName: 'ไอรอนโฮลด์',
    color: '#3282f6',
    side: 'left',
    spawn: Object.freeze({ x: -80, y: 0, z: 0 })
  }),
  verdant: Object.freeze({
    id: 'verdant',
    name: 'Verdant',
    thaiName: 'เวอร์แดนท์',
    color: '#35b86b',
    side: 'right',
    spawn: Object.freeze({ x: 80, y: 0, z: 0 })
  })
});

export function isFaction(value) {
  return typeof value === 'string' && Object.hasOwn(FACTIONS, value);
}

export const BASIC_PLAYER = Object.freeze({
  maxHp: 100,
  moveSpeed: 7,
  sprintMultiplier: 1.4,
  jumpSpeed: 7
});

export const CLASSES = Object.freeze({
  infantry: Object.freeze({
    id: 'infantry', name: 'Infantry', thaiName: 'ทหารราบ', role: 'แนวหน้า ดาบและโล่',
    maxHp: 130, maxStamina: 110, moveSpeed: 6.6, sprintMultiplier: 1.38, jumpSpeed: 7
  }),
  archer: Object.freeze({
    id: 'archer', name: 'Archer', thaiName: 'พลธนู', role: 'โจมตีระยะไกล',
    maxHp: 85, maxStamina: 105, moveSpeed: 7.2, sprintMultiplier: 1.42, jumpSpeed: 7.2
  }),
  worker: Object.freeze({
    id: 'worker', name: 'Worker', thaiName: 'คนงาน', role: 'เก็บและขนทรัพยากร',
    maxHp: 100, maxStamina: 115, moveSpeed: 6.9, sprintMultiplier: 1.4, jumpSpeed: 7
  }),
  commander: Object.freeze({
    id: 'commander', name: 'Commander', thaiName: 'แม่ทัพ', role: 'สร้างแนวป้องกันและจุดรวมพล',
    maxHp: 115, maxStamina: 105, moveSpeed: 6.7, sprintMultiplier: 1.38, jumpSpeed: 7
  })
});

export function isClass(value) {
  return typeof value === 'string' && Object.hasOwn(CLASSES, value);
}

export const ITEMS = Object.freeze({
  infantry_sword: Object.freeze({
    id: 'infantry_sword', displayName: 'ดาบ', shortLabel: '⚔️ ดาบ',
    classRestrictions: ['infantry'], slot: 1, itemType: 'weapon',
    primaryAction: 'swordSwing', secondaryAction: null, weaponKey: 'infantry_sword'
  }),
  infantry_shield: Object.freeze({
    id: 'infantry_shield', displayName: 'โล่', shortLabel: '🛡️ โล่',
    classRestrictions: ['infantry'], slot: 2, itemType: 'defense',
    primaryAction: null, secondaryAction: 'block'
  }),
  archer_bow: Object.freeze({
    id: 'archer_bow', displayName: 'ธนู', shortLabel: '🏹 ธนู',
    classRestrictions: ['archer'], slot: 1, itemType: 'weapon',
    primaryAction: 'bowShot', secondaryAction: 'drawBow', weaponKey: 'archer_bow'
  }),
  worker_axe: Object.freeze({
    id: 'worker_axe', displayName: 'ขวาน', shortLabel: '🪓 ขวาน',
    classRestrictions: ['worker'], slot: 1, itemType: 'tool',
    primaryAction: 'toolSwing', secondaryAction: null, weaponKey: 'tool_axe', gatherType: 'wood'
  }),
  worker_pickaxe: Object.freeze({
    id: 'worker_pickaxe', displayName: 'พลั่วขุดหิน', shortLabel: '⛏️ พลั่ว',
    classRestrictions: ['worker'], slot: 2, itemType: 'tool',
    primaryAction: 'toolSwing', secondaryAction: null, weaponKey: 'tool_pickaxe', gatherType: 'stone'
  }),
  commander_sword: Object.freeze({
    id: 'commander_sword', displayName: 'ดาบ', shortLabel: '⚔️ ดาบ',
    classRestrictions: ['commander'], slot: 1, itemType: 'weapon',
    primaryAction: 'swordSwing', secondaryAction: null, weaponKey: 'commander_sword'
  }),
  wall_blueprint: Object.freeze({
    id: 'wall_blueprint', displayName: 'แปลนกำแพง', shortLabel: '📜 กำแพง',
    classRestrictions: ['commander'], slot: 2, itemType: 'blueprint',
    primaryAction: 'placeBuilding', secondaryAction: 'rotatePreview',
    buildType: 'wooden_wall', cost: { wood: 20, stone: 0 }
  }),
  rally_blueprint: Object.freeze({
    id: 'rally_blueprint', displayName: 'ธงรวมพล', shortLabel: '🚩 ธง',
    classRestrictions: ['commander'], slot: 3, itemType: 'blueprint',
    primaryAction: 'placeBuilding', secondaryAction: 'rotatePreview',
    buildType: 'rally_flag', cost: { wood: 50, stone: 30 }
  })
});

export const CLASS_LOADOUTS = Object.freeze({
  infantry: Object.freeze(['infantry_sword', 'infantry_shield']),
  archer: Object.freeze(['archer_bow']),
  worker: Object.freeze(['worker_axe', 'worker_pickaxe']),
  commander: Object.freeze(['commander_sword', 'wall_blueprint', 'rally_blueprint'])
});

export function createLoadout(classId) {
  return (CLASS_LOADOUTS[classId] || CLASS_LOADOUTS.infantry).map((itemId) => ({ ...ITEMS[itemId] }));
}

export const AUTHORITY = Object.freeze({
  maxInputsPerSecond: 45,
  maxPositionHintError: 8,
  maxVerticalHintError: 3,
  maxTickSeconds: 0.1
});

export const STAMINA = Object.freeze({
  regenPerSecond: 18,
  sprintDrainPerSecond: 22,
  blockDrainPerSecond: 13,
  blockHitCost: 9
});

export const COMBAT = Object.freeze({
  infantry_sword: Object.freeze({
    damage: 34, range: 3.15, facingDot: 0.42, staminaCost: 19,
    windupMs: 210, activeMs: 150, recoveryMs: 420, cooldownMs: 780
  }),
  commander_sword: Object.freeze({
    damage: 23, range: 2.9, facingDot: 0.45, staminaCost: 20,
    windupMs: 240, activeMs: 140, recoveryMs: 450, cooldownMs: 850
  }),
  tool_axe: Object.freeze({
    damage: 11, range: 2.55, facingDot: 0.38, staminaCost: 15,
    windupMs: 290, activeMs: 150, recoveryMs: 470, cooldownMs: 920
  }),
  tool_pickaxe: Object.freeze({
    damage: 9, range: 2.45, facingDot: 0.4, staminaCost: 16,
    windupMs: 320, activeMs: 140, recoveryMs: 500, cooldownMs: 980
  }),
  archer_bow: Object.freeze({
    damage: 28, range: 58, facingDot: 0.82, staminaCost: 17,
    drawMs: 650, cooldownMs: 980
  }),
  shield: Object.freeze({ damageReduction: 0.76, frontalDot: 0.2 })
});

export const OBJECTIVES = Object.freeze({
  centralFort: Object.freeze({
    id: 'central_fort',
    name: 'Central Fort',
    position: Object.freeze({ x: 0, y: 0, z: 0 }),
    radius: 15,
    capturePerSecondPerPlayer: 20
  })
});

export const ROUND_RULES = Object.freeze({
  scoreIntervalMs: 10_000,
  scorePerInterval: 10,
  targetScore: 1_000,
  resetDelayMs: 5_000
});

export const RESOURCE_RULES = Object.freeze({
  carryCapacity: 30,
  gatherAmount: 3,
  gatherCooldownMs: 700,
  regenDelayMs: 8_000,
  regenEveryMs: 5_000,
  regenAmount: 1,
  startingFactionResources: Object.freeze({ wood: 160, stone: 100 })
});

export const WAREHOUSES = Object.freeze([
  Object.freeze({
    id: 'ironhold_warehouse', name: 'Ironhold Warehouse', faction: 'ironhold',
    position: Object.freeze({ x: -72, y: 0, z: 14 }), interactRadius: 6
  }),
  Object.freeze({
    id: 'verdant_warehouse', name: 'Verdant Warehouse', faction: 'verdant',
    position: Object.freeze({ x: 72, y: 0, z: 14 }), interactRadius: 6
  })
]);

export const BUILDING_RULES = Object.freeze({
  maxBuildDistance: 9,
  buildCooldownMs: 900,
  wooden_wall: Object.freeze({
    type: 'wooden_wall', name: 'Wooden Wall', maxHp: 180,
    collisionRadius: 3.1, size: Object.freeze({ x: 6, y: 3.4, z: 1 }),
    cost: Object.freeze({ wood: 20, stone: 0 })
  }),
  rally_flag: Object.freeze({
    type: 'rally_flag', name: 'Rally Flag', maxHp: 125,
    collisionRadius: 1.8, size: Object.freeze({ x: 2.5, y: 6, z: 2.5 }),
    cost: Object.freeze({ wood: 50, stone: 30 })
  })
});
