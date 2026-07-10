import * as THREE from '/vendor/three.module.js';
import { GameConnection } from './net.js';
import { getMobileRects, joystickIntent } from './mobile-layout.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8eb7c5);
scene.fog = new THREE.Fog(0x8eb7c5, 90, 190);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 400);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xddeeff, 0x4e5a39, 2.2));
const sun = new THREE.DirectionalLight(0xfff1cf, 2.4);
sun.position.set(-30, 55, 20);
sun.castShadow = true;
scene.add(sun);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 150),
  new THREE.MeshStandardMaterial({ color: 0x577348, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const net = new GameConnection();
const meshes = new Map();
const keys = new Set();
let yaw = 0;
let latest = null;
let inputSeq = 0;
let captureVisual = null;
const resourceMeshes = new Map();
const warehouseMeshes = new Map();
const buildingMeshes = new Map();
const baseMeshes = new Map();
let currentInteraction = null;
let placementPreview = null;
let buildRotation = 0;
const mobileQuery = matchMedia('(pointer: coarse), (max-width: 700px)');
const joystick = { x: 0, forward: 0, sprint: false, pointerId: null, originX: 0, originY: 0 };
let localStance = 'stand';
let stancePendingUntil = 0;
let jumpQueued = false;
let onboardingShown = false;
let cameraMode = 'third';
let lastRejectReason = '—';

function setMobileRect(element, rect) {
  if (!element) return;
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
  element.style.right = 'auto';
  element.style.bottom = 'auto';
  element.style.transform = 'none';
}

function applyMobileLayout() {
  if (!mobileQuery.matches) {
    for (const selector of ['#score-hud', '#player-panel', '#resource-hud', '#capture-hud', '#stance-button', '#objective-hint', '#minimap-wrap', '#mobile-move-zone', '#mobile-actions', '#hotbar-wrap']) {
      const element = document.querySelector(selector);
      for (const property of ['left', 'top', 'width', 'height', 'right', 'bottom', 'transform']) element?.style.removeProperty(property);
    }
    return;
  }
  const rects = getMobileRects(innerWidth, innerHeight);
  setMobileRect(document.querySelector('#score-hud'), rects.score);
  setMobileRect(document.querySelector('#player-panel'), rects.player);
  setMobileRect(document.querySelector('#resource-hud'), rects.resources);
  setMobileRect(document.querySelector('#capture-hud'), rects.capture);
  setMobileRect(document.querySelector('#stance-button'), rects.stance);
  setMobileRect(document.querySelector('#objective-hint'), rects.objective);
  setMobileRect(document.querySelector('#minimap-wrap'), rects.minimap);
  setMobileRect(document.querySelector('#mobile-move-zone'), rects.joystick);
  setMobileRect(document.querySelector('#mobile-actions'), rects.actions);
  setMobileRect(document.querySelector('#hotbar-wrap'), rects.hotbar);
}

function createPlayerMesh(player) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55, 1.1, 4, 8),
    new THREE.MeshStandardMaterial({ color: player.factionColor || 0x8b96a5 })
  );
  body.position.y = 1.15;
  body.castShadow = true;
  group.add(body);
  const hand = new THREE.Group();
  hand.name = 'held-item';
  hand.position.set(0.72, 1.35, 0.05);
  group.add(hand);
  const nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
  nameTag.name = 'name-tag';
  nameTag.position.y = 3.25;
  nameTag.scale.set(4.4, 1.1, 1);
  group.add(nameTag);
  updateNameTag(group, player);
  scene.add(group);
  meshes.set(player.id, group);
  return group;
}

function updateNameTag(group, player) {
  const sprite = group.getObjectByName('name-tag');
  if (!sprite) return;
  const key = `${player.name}|${player.factionColor}`;
  if (sprite.userData.key === key) return;
  sprite.userData.key = key;
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 96;
  const context = canvas.getContext('2d');
  context.fillStyle = '#071019cc';
  context.fillRect(12, 12, 360, 66);
  context.strokeStyle = player.factionColor || '#8b96a5';
  context.lineWidth = 6;
  context.strokeRect(12, 12, 360, 66);
  context.fillStyle = '#ffffff';
  context.font = '700 34px system-ui';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(player.name, 192, 46, 330);
  sprite.material.map?.dispose();
  sprite.material.map = new THREE.CanvasTexture(canvas);
  sprite.material.needsUpdate = true;
}

function renderHeldItem(group, item) {
  const hand = group.getObjectByName('held-item');
  if (!hand) return;
  const nextItemId = item?.id || null;
  if (hand.userData.itemId === nextItemId) return;
  hand.userData.itemId = nextItemId;
  for (const child of [...hand.children]) {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose();
  }
  hand.clear();
  if (!item) return;
  const wood = new THREE.MeshStandardMaterial({ color: 0x71482d, roughness: .9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc7d0d6, metalness: .55, roughness: .35 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b85a, metalness: .3 });
  if (item.id.includes('sword')) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.09, 1.25, .16), metal);
    blade.position.y = -.18; blade.rotation.z = -.25; hand.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(.42, .08, .12), gold);
    guard.position.set(.1, .42, 0); guard.rotation.z = -.25; hand.add(guard);
  } else if (item.id.includes('shield')) {
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(.55, .62, .16, 10), new THREE.MeshStandardMaterial({ color: 0x315d9e, metalness: .2 }));
    shield.rotation.z = Math.PI / 2; shield.position.set(.08, 0, -.25); hand.add(shield);
  } else if (item.id.includes('bow')) {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(.55, .04, 6, 18, Math.PI * 1.5), wood);
    bow.rotation.set(0, Math.PI / 2, -.75); hand.add(bow);
  } else if (item.id.includes('axe') || item.id.includes('pickaxe')) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.15, .08), wood);
    handle.rotation.z = -.28; hand.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(item.id.includes('pickaxe') ? .65 : .42, .17, .14), metal);
    head.position.set(.17, .48, 0); head.rotation.z = -.28; hand.add(head);
  } else if (item.itemType === 'blueprint') {
    const scroll = new THREE.Mesh(new THREE.BoxGeometry(.65, .46, .04), new THREE.MeshStandardMaterial({ color: 0xd5c38a }));
    scroll.rotation.y = .4; hand.add(scroll);
  }
}

function updateHotbar(self, predictedSlot = null) {
  const selected = predictedSlot ?? self?.equippedSlot;
  for (const button of document.querySelectorAll('.hotbar-slot')) {
    const slot = Number(button.dataset.slot);
    const item = self?.loadout?.find((entry) => entry.slot === slot);
    button.disabled = !item;
    button.textContent = item ? `${slot} · ${item.shortLabel}` : `${slot} · —`;
    button.classList.toggle('selected', slot === selected);
  }
  const equipped = self?.loadout?.find((item) => item.slot === selected) || self?.equippedItem;
  document.querySelector('#equipped-label').textContent = `ถือ: ${equipped?.displayName || '—'}`;
}

function selectSlot(slot) {
  const self = latest?.players.find((p) => p.id === net.id);
  const item = self?.loadout?.find((entry) => entry.slot === slot);
  if (!item) return;
  updateHotbar(self, slot);
  const mesh = meshes.get(net.id);
  if (mesh) renderHeldItem(mesh, item);
  net.send('selectItem', { slot });
}

function showFeedback(text, color = '#fff') {
  const node = document.querySelector('#combat-feedback');
  node.textContent = text;
  node.style.color = color;
  node.classList.add('show');
  clearTimeout(showFeedback.timer);
  showFeedback.timer = setTimeout(() => node.classList.remove('show'), 420);
}

function aimedTarget(self) {
  const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const entities = [
    ...(latest?.players || []).filter((player) => player.id !== self.id && player.alive),
    ...(latest?.buildings || [])
  ];
  return entities
    .map((entity) => {
      const dx = entity.position.x - self.position.x;
      const dz = entity.position.z - self.position.z;
      const distance = Math.hypot(dx, dz) || 1;
      return { entity, distance, dot: (forward.x * dx + forward.z * dz) / distance };
    })
    .filter((entry) => entry.dot > .9 && entry.distance < 60)
    .sort((a, b) => b.dot - a.dot || a.distance - b.distance)[0]?.entity || null;
}

function primaryAction() {
  const self = latest?.players.find((player) => player.id === net.id);
  if (!self?.alive || !self.equippedItem) return;
  if (self.equippedItem.itemType === 'blueprint') {
    confirmBuild(self);
    return;
  }
  const target = aimedTarget(self);
  if (target?.faction === self.faction) {
    showFeedback('ฝ่ายเดียวกัน', '#8ec5ff');
    return;
  }
  net.send('primary', { targetId: target?.id || null });
}

function secondaryAction(active) {
  const self = latest?.players.find((player) => player.id === net.id);
  if (!self?.alive || !self.equippedItem?.secondaryAction) return;
  if (self.equippedItem.itemType === 'blueprint') {
    if (active) {
      buildRotation = (buildRotation + Math.PI / 2) % (Math.PI * 2);
      showFeedback('หมุนแบบก่อสร้าง', '#b9e7c5');
    }
    return;
  }
  net.send('secondary', { active });
}

function addTracer({ from, to }) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(from.x, from.y, from.z),
    new THREE.Vector3(to.x, to.y, to.z)
  ]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffe28a, transparent: true, opacity: .95 }));
  scene.add(line);
  setTimeout(() => {
    scene.remove(line);
    geometry.dispose();
    line.material.dispose();
  }, 160);
}

function updateCapturePoint(point) {
  if (!captureVisual) {
    captureVisual = new THREE.Group();
    const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x929aa4, emissive: 0x20242a, transparent: true, opacity: .7 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(point.radius - .35, point.radius, 64), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .04;
    ring.name = 'capture-ring';
    captureVisual.add(ring);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 8, 8), new THREE.MeshStandardMaterial({ color: 0x665443 }));
    pole.position.y = 4;
    captureVisual.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.65, .08), new THREE.MeshStandardMaterial({ color: 0x929aa4, side: THREE.DoubleSide }));
    flag.position.set(1.6, 6.8, 0);
    flag.name = 'capture-flag';
    captureVisual.add(flag);
    scene.add(captureVisual);
  }
  captureVisual.position.set(point.position.x, point.position.y, point.position.z);
  const color = point.contested && point.status === 'contested'
    ? '#ef8b37'
    : point.ownerFaction === 'ironhold'
      ? '#3282f6'
      : point.ownerFaction === 'verdant'
        ? '#35b86b'
        : point.capturingFaction === 'ironhold'
          ? '#3282f6'
          : point.capturingFaction === 'verdant' ? '#35b86b' : '#929aa4';
  captureVisual.getObjectByName('capture-ring').material.color.set(color);
  captureVisual.getObjectByName('capture-flag').material.color.set(color);
  const owner = point.ownerFaction === 'ironhold' ? 'Ironhold' : point.ownerFaction === 'verdant' ? 'Verdant' : 'เป็นกลาง';
  const labels = { contested: 'กำลังแย่งชิง — หยุดความคืบหน้า', paused: 'ไม่มีผู้เล่นในพื้นที่', capturing: `${point.capturingFaction === 'ironhold' ? 'Ironhold' : 'Verdant'} กำลังยึด`, owned: `${owner} ครองป้อม`, defending: 'ฝ่ายเจ้าของกำลังต้านการยึด', reversing: 'กำลังพลิกการยึด' };
  document.querySelector('#capture-title').textContent = `Central Fort · ${owner}`;
  const bar = document.querySelector('#capture-progress');
  bar.style.width = `${point.progress}%`;
  bar.style.background = color;
  document.querySelector('#capture-status').textContent = `${labels[point.status] || 'เข้าสู่วงกลางเพื่อยึดป้อม'} · 🔵${point.occupants.ironhold} / 🟢${point.occupants.verdant}`;
}

function updateRoundHud(round, serverTime) {
  document.querySelector('#iron-score').textContent = round.scores.ironhold;
  document.querySelector('#verdant-score').textContent = round.scores.verdant;
  document.querySelector('#iron-score-bar').style.width = `${round.scores.ironhold / round.targetScore * 100}%`;
  document.querySelector('#verdant-score-bar').style.width = `${round.scores.verdant / round.targetScore * 100}%`;
  document.querySelector('#round-label').textContent = `ROUND ${round.number} · เป้าหมาย ${round.targetScore}`;
  const overlay = document.querySelector('#victory-overlay');
  overlay.hidden = round.state !== 'victory';
  if (round.state === 'victory') {
    const winner = round.winningFaction === 'ironhold' ? 'IRONHOLD' : 'VERDANT';
    document.querySelector('#victory-faction').textContent = winner;
    document.querySelector('#victory-faction').style.color = round.winningFaction === 'ironhold' ? '#65a5ff' : '#5ddd8d';
    document.querySelector('#victory-final-score').textContent = `${round.scores.ironhold} – ${round.scores.verdant}`;
    const seconds = Math.max(0, Math.ceil((round.resetAt - serverTime) / 1000));
    document.querySelector('#victory-countdown').textContent = `เริ่มรอบใหม่ใน ${seconds} วินาที`;
  }
}

function syncBases(factions) {
  for (const faction of Object.values(factions || {})) {
    if (baseMeshes.has(faction.id)) continue;
    const group = new THREE.Group();
    const color = new THREE.Color(faction.color);
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(10, 12, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x4a4b49, roughness: 1 }));
    platform.position.y = .6; platform.receiveShadow = true; group.add(platform);
    for (const z of [-6, 6]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.5, 7, 8), new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 1 }));
      tower.position.set(0, 3.5, z); tower.castShadow = true; group.add(tower);
      const banner = new THREE.Mesh(new THREE.BoxGeometry(.15, 3, 2), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .2 }));
      banner.position.set(faction.id === 'ironhold' ? 2.15 : -2.15, 4.5, z); group.add(banner);
    }
    group.position.set(faction.spawn.x, faction.spawn.y, faction.spawn.z);
    group.userData = { factionBase: faction.id, serverSpawn: { ...faction.spawn } };
    scene.add(group);
    baseMeshes.set(faction.id, group);
  }
}

function drawMinimap(state) {
  const canvas = document.querySelector('#minimap');
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const map = (position) => ({
    x: (position.x + 120) / 240 * width,
    y: (position.z + 75) / 150 * height
  });
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#263a28'; context.fillRect(0, 0, width, height);
  context.fillStyle = '#214d2a99'; context.fillRect(width * .32, height * .06, width * .36, height * .25);
  context.fillStyle = '#6b665f99'; context.fillRect(width * .32, height * .69, width * .36, height * .25);
  context.strokeStyle = '#ffffff12'; context.lineWidth = 2;
  context.beginPath(); context.moveTo(width / 2, 0); context.lineTo(width / 2, height); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke();

  for (const faction of Object.values(state.factions || {})) {
    const point = map(faction.spawn);
    context.fillStyle = faction.color;
    context.fillRect(point.x - 9, point.y - 9, 18, 18);
  }
  for (const warehouse of state.warehouses || []) {
    const point = map(warehouse.position);
    context.strokeStyle = warehouse.faction === 'ironhold' ? '#65a5ff' : '#62dd91';
    context.strokeRect(point.x - 5, point.y - 5, 10, 10);
  }
  const fort = state.capturePoints?.[0];
  if (fort) {
    const point = map(fort.position);
    context.fillStyle = fort.ownerFaction === 'ironhold' ? '#3282f6' : fort.ownerFaction === 'verdant' ? '#35b86b' : fort.contested ? '#ef8b37' : '#a0a8b1';
    context.beginPath(); context.arc(point.x, point.y, 8, 0, Math.PI * 2); context.fill();
  }
  for (const building of state.buildings || []) {
    const point = map(building.position);
    context.fillStyle = building.faction === 'ironhold' ? '#65a5ff' : '#62dd91';
    if (building.type === 'rally_flag') {
      context.beginPath(); context.moveTo(point.x, point.y - 7); context.lineTo(point.x + 7, point.y + 6); context.lineTo(point.x - 7, point.y + 6); context.closePath(); context.fill();
    } else context.fillRect(point.x - 5, point.y - 2, 10, 4);
  }
  for (const player of state.players || []) {
    if (!player.alive || !player.faction) continue;
    const point = map(player.position);
    context.fillStyle = player.factionColor;
    context.beginPath(); context.arc(point.x, point.y, player.id === net.id ? 5 : 3.5, 0, Math.PI * 2); context.fill();
    if (player.id === net.id) { context.strokeStyle = '#fff'; context.lineWidth = 2; context.stroke(); }
  }
  document.querySelector('#online-count').textContent = `${state.players.length} ONLINE`;
}

function updatePlayerGuidance(self, serverTime) {
  const hints = {
    infantry: 'ไปยึด Central Fort · ดาบบุก โล่กันด้านหน้า',
    archer: 'ไปยึด Central Fort · ง้างธนูก่อนปล่อยยิง',
    worker: 'เก็บไม้/หินด้วยเครื่องมือที่ถูก แล้วฝากคลังฝ่าย',
    commander: 'ใช้ทรัพยากรฝ่ายสร้างกำแพงและธงรวมพล'
  };
  document.querySelector('#objective-text').textContent = hints[self.classId] || 'เลือกฝ่ายและคลาสเพื่อเริ่ม';
  const death = document.querySelector('#death-overlay');
  death.hidden = self.alive || Boolean(self.selectionStage);
  if (!self.alive && !self.selectionStage) {
    const seconds = Math.max(0, Math.ceil((self.respawnAt - serverTime) / 1000));
    document.querySelector('#respawn-countdown').textContent = `เกิดใหม่ใน ${seconds} วินาที`;
    document.querySelector('#respawn-location').textContent = `จุดเกิด: ${self.respawnLocation === 'rally_flag' ? 'ธงรวมพล' : 'ฐานฝ่าย'}`;
  }
}

function updateDevDebug(self) {
  const node = document.querySelector('#dev-debug');
  node.hidden = !latest?.devMode;
  if (!latest?.devMode || !self) return;
  const nearest = latest.resourceNodes
    ?.map((entry) => ({ entry, distance: Math.hypot(entry.position.x - self.position.x, entry.position.z - self.position.z) }))
    .sort((a, b) => a.distance - b.distance)[0];
  node.textContent = nearest
    ? `DEV · nearest ${nearest.entry.id} / ${nearest.entry.type} · ${nearest.distance.toFixed(2)}m · reject ${lastRejectReason}`
    : `DEV · no resource nodes · reject ${lastRejectReason}`;
}

function addKillFeed(event) {
  const feed = document.querySelector('#kill-feed');
  const victim = latest?.players.find((player) => player.id === event.playerId)?.name || event.playerId;
  const killer = latest?.players.find((player) => player.id === event.killerId)?.name || 'สนามรบ';
  const entry = document.createElement('div');
  entry.className = 'kill-entry';
  entry.textContent = `${killer} ⚔ ${victim}`;
  feed.prepend(entry);
  while (feed.children.length > 4) feed.lastElementChild.remove();
  setTimeout(() => entry.remove(), 5_000);
}

function showOnboarding() {
  onboardingShown = true;
  document.querySelector('#onboarding').hidden = false;
  document.exitPointerLock?.();
}

function createResourceMesh(node) {
  const group = new THREE.Group();
  group.userData = {
    resourceNodeId: node.id,
    resourceType: node.type,
    gatherToolRequired: node.requiredTool,
    serverPosition: { ...node.position }
  };
  if (node.type === 'tree') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.38, .52, 3.2, 7), new THREE.MeshStandardMaterial({ color: 0x6b442b, roughness: 1 }));
    trunk.position.y = 1.6; trunk.castShadow = true; group.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.1, 4.6, 8), new THREE.MeshStandardMaterial({ color: 0x2f6d3b, roughness: 1 }));
    crown.position.y = 4.6; crown.castShadow = true; group.add(crown);
  } else {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.55, 0), new THREE.MeshStandardMaterial({ color: 0x74797d, roughness: .95 }));
    rock.scale.set(1.25, .8, 1); rock.position.y = 1; rock.rotation.set(.12, .4, .08); rock.castShadow = true; group.add(rock);
  }
  group.position.set(node.position.x, node.position.y, node.position.z);
  scene.add(group);
  resourceMeshes.set(node.id, group);
  return group;
}

function syncResourceNodes(nodes) {
  const ids = new Set(nodes.map((node) => node.id));
  for (const [id, mesh] of resourceMeshes) {
    if (!ids.has(id)) { scene.remove(mesh); resourceMeshes.delete(id); }
  }
  for (const node of nodes) {
    const mesh = resourceMeshes.get(node.id) || createResourceMesh(node);
    mesh.position.set(node.position.x, node.position.y, node.position.z);
    mesh.userData.amount = node.amount;
    const ratio = node.amount / node.maxAmount;
    if (node.type === 'tree') mesh.scale.set(1, .35 + ratio * .65, 1);
    else mesh.scale.setScalar(.45 + ratio * .55);
    mesh.visible = true;
  }
}

function createWarehouseMesh(warehouse) {
  const group = new THREE.Group();
  const factionColor = warehouse.faction === 'ironhold' ? 0x3282f6 : 0x35b86b;
  const base = new THREE.Mesh(new THREE.BoxGeometry(8, .7, 7), new THREE.MeshStandardMaterial({ color: 0x534738 }));
  base.position.y = .35; base.castShadow = true; group.add(base);
  for (const [x, z] of [[-2, -1.7], [0, -1.5], [2, -1.7], [-1, 1.3], [1.2, 1.4]]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x855e35, roughness: 1 }));
    crate.position.set(x, 1.15, z); crate.castShadow = true; group.add(crate);
  }
  const marker = new THREE.Mesh(new THREE.BoxGeometry(5.8, .18, .18), new THREE.MeshStandardMaterial({ color: factionColor, emissive: factionColor, emissiveIntensity: .25 }));
  marker.position.y = 2.2; group.add(marker);
  group.position.set(warehouse.position.x, warehouse.position.y, warehouse.position.z);
  group.userData = { warehouseId: warehouse.id, faction: warehouse.faction, interactRadius: warehouse.interactRadius };
  scene.add(group);
  warehouseMeshes.set(warehouse.id, group);
  return group;
}

function syncWarehouses(warehouses) {
  for (const warehouse of warehouses) {
    const mesh = warehouseMeshes.get(warehouse.id) || createWarehouseMesh(warehouse);
    mesh.position.set(warehouse.position.x, warehouse.position.y, warehouse.position.z);
  }
}

function makeBuildingMesh(type, color, preview = false) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: .88,
    transparent: preview,
    opacity: preview ? .55 : 1
  });
  const accent = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: preview ? .12 : .25,
    transparent: preview,
    opacity: preview ? .55 : 1
  });
  if (type === 'wooden_wall') {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, .75), material);
    wall.position.y = 1.6; wall.castShadow = !preview; group.add(wall);
    for (const x of [-2.65, 0, 2.65]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.38, 4, 1), accent);
      post.position.set(x, 2, 0); post.castShadow = !preview; group.add(post);
    }
  } else {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.4, .45, 8), material);
    base.position.y = .22; group.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.1, .14, 5.8, 8), new THREE.MeshStandardMaterial({ color: 0x6c5136, transparent: preview, opacity: preview ? .55 : 1 }));
    pole.position.y = 3; group.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.35, .08), accent);
    flag.position.set(1.25, 5.1, 0); group.add(flag);
  }
  group.userData.previewMaterials = preview
    ? group.children.map((child) => child.material)
    : [];
  return group;
}

function syncBuildings(buildings) {
  const ids = new Set(buildings.map((building) => building.id));
  for (const [id, mesh] of buildingMeshes) {
    if (!ids.has(id)) { scene.remove(mesh); buildingMeshes.delete(id); }
  }
  for (const building of buildings) {
    const color = building.faction === 'ironhold' ? 0x3282f6 : 0x35b86b;
    const mesh = buildingMeshes.get(building.id) || makeBuildingMesh(building.type, color);
    if (!buildingMeshes.has(building.id)) {
      scene.add(mesh);
      buildingMeshes.set(building.id, mesh);
    }
    mesh.position.set(building.position.x, building.position.y, building.position.z);
    mesh.rotation.y = building.rotation;
    mesh.userData = { buildingId: building.id, faction: building.faction, type: building.type, hp: building.hp };
  }
}

function approximateBuildValid(self, item, position) {
  const radius = item.buildType === 'wooden_wall' ? 3.1 : 1.8;
  const distance = Math.hypot(position.x - self.position.x, position.z - self.position.z);
  if (distance > 9 || Math.abs(position.x) + radius > 120 || Math.abs(position.z) + radius > 75) return false;
  const stock = latest.factionResources?.[self.faction];
  if (!stock || stock.wood < item.cost.wood || stock.stone < item.cost.stone) return false;
  if (item.buildType === 'rally_flag' && latest.rallyFlags?.[self.faction]) return false;
  const point = latest.capturePoints?.[0];
  if (point && Math.hypot(position.x - point.position.x, position.z - point.position.z) < point.radius + radius + 1) return false;
  if (latest.warehouses?.some((entry) => Math.hypot(position.x - entry.position.x, position.z - entry.position.z) < entry.interactRadius + radius)) return false;
  if (latest.resourceNodes?.some((entry) => Math.hypot(position.x - entry.position.x, position.z - entry.position.z) < 2.1 + radius)) return false;
  if (latest.buildings?.some((entry) => Math.hypot(position.x - entry.position.x, position.z - entry.position.z) < entry.collisionRadius + radius + .4)) return false;
  return true;
}

function updatePlacementPreview(self) {
  const item = self?.equippedItem;
  if (!self?.alive || item?.itemType !== 'blueprint') {
    if (placementPreview) { scene.remove(placementPreview); placementPreview = null; }
    return null;
  }
  if (!placementPreview || placementPreview.userData.buildType !== item.buildType) {
    if (placementPreview) scene.remove(placementPreview);
    placementPreview = makeBuildingMesh(item.buildType, 0x43df78, true);
    placementPreview.userData.buildType = item.buildType;
    scene.add(placementPreview);
  }
  const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const position = {
    x: self.position.x + forward.x * 6.5,
    y: 0,
    z: self.position.z + forward.z * 6.5
  };
  const valid = approximateBuildValid(self, item, position);
  placementPreview.position.set(position.x, 0, position.z);
  placementPreview.rotation.y = yaw + buildRotation;
  placementPreview.userData.position = position;
  placementPreview.userData.valid = valid;
  for (const material of placementPreview.userData.previewMaterials) {
    material.color.set(valid ? '#43df78' : '#e24b42');
    if ('emissive' in material) material.emissive.set(valid ? '#164e2a' : '#5b1714');
  }
  return placementPreview;
}

function confirmBuild(self) {
  const preview = updatePlacementPreview(self);
  if (!preview) return;
  net.send('build', {
    buildType: self.equippedItem.buildType,
    position: { ...preview.userData.position },
    rotation: preview.rotation.y
  });
}

function findContextInteraction(self) {
  if (!self?.alive) return null;
  const carried = self.inventory.wood + self.inventory.stone;
  const warehouse = latest.warehouses
    ?.map((entry) => ({ entry, distance: Math.hypot(entry.position.x - self.position.x, entry.position.z - self.position.z) }))
    .filter(({ entry, distance }) => distance <= entry.interactRadius)
    .sort((a, b) => a.distance - b.distance)[0]?.entry;
  if (warehouse) {
    if (warehouse.faction !== self.faction) return { enabled: false, label: 'คลังฝ่ายตรงข้าม' };
    if (carried <= 0) return { enabled: false, label: 'ไม่มีทรัพยากรให้ฝาก' };
    return { enabled: true, type: 'deposit', targetId: warehouse.id, label: 'ใช้/E: ฝากเข้าคลังฝ่าย' };
  }
  const nearest = latest.resourceNodes
    ?.filter((node) => node.amount > 0)
    .map((node) => ({ node, distance: Math.hypot(node.position.x - self.position.x, node.position.z - self.position.z) }))
    .filter(({ node, distance }) => distance <= node.interactRadius + .25)
    .sort((a, b) => a.distance - b.distance)[0]?.node;
  if (!nearest) return null;
  if (self.classId !== 'worker') return { enabled: false, label: 'คนงานเท่านั้นที่เก็บได้' };
  const correct = nearest.requiredTool === 'axe' ? self.equippedItem?.id === 'worker_axe' : self.equippedItem?.id === 'worker_pickaxe';
  if (!correct) return { enabled: false, label: nearest.requiredTool === 'axe' ? 'ต้องถือขวาน' : 'ต้องถือพลั่วขุดหิน' };
  return {
    enabled: true,
    type: 'gather',
    targetId: nearest.id,
    label: nearest.resource === 'wood' ? 'ใช้/E: เก็บไม้' : 'ใช้/E: เก็บหิน'
  };
}

function updateContextAction(self) {
  const mobileAction = document.querySelector('#mobile-action');
  if (self?.equippedItem?.itemType === 'blueprint') {
    currentInteraction = null;
    const prompt = document.querySelector('#action-prompt');
    prompt.hidden = false;
    prompt.classList.toggle('disabled', !placementPreview?.userData.valid);
    prompt.textContent = 'ยิง/คลิก: วาง · รอง/คลิกขวา: หมุน';
    mobileAction.disabled = false;
    mobileAction.style.visibility = 'visible';
    mobileAction.textContent = 'วาง';
    return;
  }
  currentInteraction = findContextInteraction(self);
  const prompt = document.querySelector('#action-prompt');
  prompt.hidden = !currentInteraction;
  mobileAction.disabled = !currentInteraction?.enabled;
  mobileAction.style.visibility = currentInteraction ? 'visible' : 'hidden';
  mobileAction.textContent = currentInteraction?.type === 'gather'
    ? (currentInteraction.label.includes('ไม้') ? 'เก็บไม้' : 'เก็บหิน')
    : currentInteraction?.type === 'deposit' ? 'ฝาก' : 'ใช้';
  if (!currentInteraction) return;
  prompt.textContent = currentInteraction.label;
  prompt.classList.toggle('disabled', !currentInteraction.enabled);
}

function performContextAction() {
  if (!currentInteraction?.enabled) return;
  if (currentInteraction.type === 'gather') net.send('gather', { nodeId: currentInteraction.targetId });
  if (currentInteraction.type === 'deposit') net.send('deposit', { warehouseId: currentInteraction.targetId });
}
window.performContextAction = performContextAction;

function updateStanceButton() {
  const nextLabel = localStance === 'stand' ? 'ย่อ' : localStance === 'crouch' ? 'หมอบ' : 'ยืน';
  document.querySelector('#stance-button').textContent = nextLabel;
}

function cycleStance() {
  localStance = localStance === 'stand' ? 'crouch' : localStance === 'crouch' ? 'prone' : 'stand';
  stancePendingUntil = performance.now() + 450;
  updateStanceButton();
}

function setupMobileControls() {
  const zone = document.querySelector('#mobile-move-zone');
  const base = document.querySelector('#joystick-base');
  const knob = document.querySelector('#joystick-knob');
  const resetJoystick = () => {
    joystick.x = 0; joystick.forward = 0; joystick.sprint = false; joystick.pointerId = null;
    knob.style.transform = 'translate(-50%,-50%)';
    base.style.display = 'none';
  };
  zone.addEventListener('pointerdown', (event) => {
    if (!mobileQuery.matches || joystick.pointerId !== null) return;
    event.preventDefault();
    joystick.pointerId = event.pointerId;
    joystick.originX = event.clientX;
    joystick.originY = event.clientY;
    const rect = zone.getBoundingClientRect();
    base.style.left = `${event.clientX - rect.left}px`;
    base.style.top = `${event.clientY - rect.top}px`;
    base.style.display = 'block';
    zone.setPointerCapture(event.pointerId);
  });
  zone.addEventListener('pointermove', (event) => {
    if (event.pointerId !== joystick.pointerId) return;
    event.preventDefault();
    const intent = joystickIntent(event.clientX - joystick.originX, event.clientY - joystick.originY);
    joystick.x = intent.x;
    joystick.forward = intent.forward;
    joystick.sprint = intent.sprint;
    knob.style.transform = `translate(-50%,-50%) translate(${intent.x * 58}px,${-intent.forward * 58}px)`;
  });
  zone.addEventListener('pointerup', resetJoystick);
  zone.addEventListener('pointercancel', resetJoystick);

  const fire = document.querySelector('#mobile-fire');
  const aim = document.querySelector('#mobile-aim');
  fire.addEventListener('pointerdown', (event) => { event.preventDefault(); primaryAction(); });
  aim.addEventListener('pointerdown', (event) => { event.preventDefault(); secondaryAction(true); });
  aim.addEventListener('pointerup', (event) => { event.preventDefault(); secondaryAction(false); });
  aim.addEventListener('pointercancel', () => secondaryAction(false));
  document.querySelector('#mobile-jump').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    jumpQueued = true;
  });
  document.querySelector('#mobile-action').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const self = latest?.players.find((player) => player.id === net.id);
    if (self?.equippedItem?.itemType === 'blueprint') confirmBuild(self);
    else performContextAction();
  });
  document.querySelector('#stance-button').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    cycleStance();
  });
  updateStanceButton();
  applyMobileLayout();
}

net.addEventListener('welcome', () => {
  document.querySelector('#status').textContent = 'เชื่อมต่อแล้ว';
});
net.addEventListener('snapshot', ({ detail }) => {
  latest = detail.state;
  if (latest.capturePoints?.[0]) updateCapturePoint(latest.capturePoints[0]);
  if (latest.round) updateRoundHud(latest.round, latest.serverTime);
  syncResourceNodes(latest.resourceNodes || []);
  syncWarehouses(latest.warehouses || []);
  syncBuildings(latest.buildings || []);
  syncBases(latest.factions || {});
  drawMinimap(latest);
  const liveIds = new Set(latest.players.map((p) => p.id));
  for (const [id, mesh] of meshes) {
    if (!liveIds.has(id)) {
      scene.remove(mesh);
      meshes.delete(id);
    }
  }
  for (const player of latest.players) {
    const mesh = meshes.get(player.id) || createPlayerMesh(player);
    mesh.children[0].material.color.set(player.factionColor || '#8b96a5');
    mesh.position.set(player.position.x, player.position.y, player.position.z);
    mesh.rotation.y = player.yaw;
    mesh.visible = player.alive;
    const stanceScale = player.stance === 'prone' ? .5 : player.stance === 'crouch' ? .76 : 1;
    mesh.scale.set(1, stanceScale, 1);
    renderHeldItem(mesh, player.equippedItem);
    updateNameTag(mesh, player);
  }
  const self = latest.players.find((p) => p.id === net.id);
  if (self) {
    if (performance.now() >= stancePendingUntil) {
      localStance = self.stance || 'stand';
      updateStanceButton();
    }
    document.querySelector('#faction-select').hidden = self.selectionStage !== 'faction';
    document.querySelector('#class-select').hidden = self.selectionStage !== 'class';
    const badge = document.querySelector('#faction-badge');
    badge.textContent = self.faction ? `${self.faction === 'ironhold' ? '🔵 Ironhold' : '🟢 Verdant'} · ${self.classThaiName || 'เลือกคลาส'}` : 'ยังไม่มีฝ่าย';
    badge.style.background = self.factionColor || '#263241';
    updateHotbar(self);
    updatePlacementPreview(self);
    updateContextAction(self);
    updatePlayerGuidance(self, latest.serverTime);
    updateDevDebug(self);
    const factionStock = latest.factionResources?.[self.faction] || { wood: 0, stone: 0 };
    document.querySelector('#inventory-wood').textContent = self.inventory.wood;
    document.querySelector('#inventory-stone').textContent = `${self.inventory.stone} / ${self.inventory.capacity}`;
    document.querySelector('#faction-wood').textContent = factionStock.wood;
    document.querySelector('#faction-stone').textContent = factionStock.stone;
    const hpRatio = Math.max(0, self.hp / self.maxHp);
    const staminaRatio = Math.max(0, self.stamina / self.maxStamina);
    document.querySelector('#hp-fill').style.width = `${hpRatio * 100}%`;
    document.querySelector('#stamina-fill').style.width = `${staminaRatio * 100}%`;
    document.querySelector('#hp-value').textContent = `${self.hp}/${self.maxHp}`;
    document.querySelector('#stamina-value').textContent = `${Math.round(self.stamina)}/${self.maxStamina}`;
    document.querySelector('#status').textContent =
      `LV.${self.level} · ${self.classThaiName || 'ยังไม่เลือกคลาส'} · 💰${self.gold} · K/D ${self.kills}/${self.deaths}`;
  }
});
net.addEventListener('actionEvent', ({ detail }) => {
  const mesh = meshes.get(detail.actorId);
  if (mesh && detail.action === 'swing') {
    mesh.userData.swingStartedAt = performance.now();
    mesh.userData.swingUntil = performance.now() + 520;
  }
});
net.addEventListener('tracer', ({ detail }) => addTracer(detail));
net.addEventListener('hitEvent', ({ detail }) => {
  if (detail.attackerId === net.id) showFeedback(detail.blocked ? `ป้องกัน ${detail.damage}` : `✦ ${detail.damage}`, detail.blocked ? '#89c8ff' : '#ffe493');
  if (detail.targetId === net.id) document.body.animate([{ filter: 'none' }, { filter: 'sepia(.5) saturate(2) hue-rotate(300deg)' }, { filter: 'none' }], { duration: 220 });
});
net.addEventListener('actionReject', ({ detail }) => {
  lastRejectReason = detail.reason;
  const labels = { cooldown: 'กำลังพักอาวุธ', not_enough_stamina: 'แรงไม่พอ', bow_draw_too_short: 'ต้องง้างธนูก่อน', friendly_fire_blocked: 'ห้ามโจมตีฝ่ายเดียวกัน' };
  if (labels[detail.reason]) showFeedback(labels[detail.reason], '#ffb09f');
});
net.addEventListener('interactionReject', ({ detail }) => {
  lastRejectReason = detail.reason;
  const labels = { wrong_tool: detail.requiredTool === 'axe' ? 'ต้องถือขวาน' : 'ต้องถือพลั่ว', too_far: 'อยู่ไกลเกินไป', inventory_full: 'กระเป๋าเต็ม', cooldown: 'รอจังหวะเก็บ', enemy_warehouse: 'ฝากคลังศัตรูไม่ได้', inventory_empty: 'ไม่มีของให้ฝาก', worker_required: 'ต้องเป็นคนงาน' };
  showFeedback(labels[detail.reason] || 'ใช้ไม่ได้ตอนนี้', '#ffb09f');
});
net.addEventListener('buildReject', ({ detail }) => {
  lastRejectReason = detail.reason;
  const labels = { too_far: 'ไกลจากแม่ทัพเกินไป', overlap: 'พื้นที่ทับวัตถุอื่น', not_enough_resources: 'ทรัพยากรฝ่ายไม่พอ', commander_required: 'ต้องเป็นแม่ทัพ', wrong_blueprint: 'ต้องถือแปลนที่ถูกต้อง', rally_already_exists: 'ฝ่ายนี้มีธงรวมพลแล้ว', build_cooldown: 'รอก่อสร้างสักครู่', out_of_bounds: 'นอกเขตสนาม' };
  showFeedback(labels[detail.reason] || 'สร้างตรงนี้ไม่ได้', '#ff9585');
});
net.addEventListener('buildingPlaced', () => showFeedback('สร้างสำเร็จ', '#85ed9f'));
net.addEventListener('buildingDestroyed', ({ detail }) => {
  if (latest?.buildings?.some((building) => building.id === detail.buildingId)) showFeedback('สิ่งปลูกสร้างถูกทำลาย', '#ff9b79');
});
net.addEventListener('deathEvent', ({ detail }) => addKillFeed(detail));
net.addEventListener('classSelected', () => {
  if (!onboardingShown) showOnboarding();
});
net.connect();
setupMobileControls();
mobileQuery.addEventListener?.('change', applyMobileLayout);

document.querySelector('#dismiss-onboarding').addEventListener('click', () => {
  document.querySelector('#onboarding').hidden = true;
});
document.querySelector('#help-button').addEventListener('click', showOnboarding);

for (const button of document.querySelectorAll('[data-faction]')) {
  button.addEventListener('click', () => net.send('selectFaction', { faction: button.dataset.faction }));
}
for (const button of document.querySelectorAll('[data-class]')) {
  button.addEventListener('click', () => net.send('selectClass', { classId: button.dataset.class }));
}

addEventListener('keydown', (event) => keys.add(event.code));
addEventListener('keydown', (event) => {
  if (/^Digit[1-5]$/.test(event.code)) selectSlot(Number(event.code.slice(-1)));
  if (event.code === 'KeyE' && !event.repeat) performContextAction();
  if (event.code === 'KeyC' && !event.repeat) cycleStance();
  if (event.code === 'Space' && !event.repeat) jumpQueued = true;
  if (event.code === 'KeyV' && !event.repeat) {
    cameraMode = cameraMode === 'third' ? 'first' : 'third';
    showFeedback(cameraMode === 'first' ? 'มุมมองบุคคลที่หนึ่ง' : 'มุมมองบุคคลที่สาม', '#b9d9ff');
  }
});
addEventListener('keyup', (event) => keys.delete(event.code));
addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === renderer.domElement) yaw -= event.movementX * 0.0025;
});
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock?.());
renderer.domElement.addEventListener('mousedown', (event) => {
  if (event.button === 0 && document.pointerLockElement === renderer.domElement) primaryAction();
  if (event.button === 2) secondaryAction(true);
});
addEventListener('mouseup', (event) => { if (event.button === 2) secondaryAction(false); });
addEventListener('contextmenu', (event) => event.preventDefault());
renderer.domElement.addEventListener('wheel', (event) => {
  const self = latest?.players.find((p) => p.id === net.id);
  if (!self?.loadout?.length) return;
  const index = Math.max(0, self.loadout.findIndex((item) => item.slot === self.equippedSlot));
  const next = (index + (event.deltaY > 0 ? 1 : -1) + self.loadout.length) % self.loadout.length;
  selectSlot(self.loadout[next].slot);
}, { passive: true });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  applyMobileLayout();
});

setInterval(() => {
  const right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + joystick.x;
  const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) + joystick.forward;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  net.send('input', {
    seq: ++inputSeq,
    moveX: right * cos + forward * sin,
    moveZ: -right * sin + forward * cos,
    yaw,
    sprint: keys.has('ShiftLeft') || joystick.sprint,
    jump: jumpQueued,
    stance: localStance
  });
  jumpQueued = false;
}, 50);

function animate() {
  requestAnimationFrame(animate);
  const self = latest?.players.find((p) => p.id === net.id);
  if (self) {
    const stanceHeight = self.stance === 'prone' ? .65 : self.stance === 'crouch' ? 1 : 1.3;
    const target = new THREE.Vector3(self.position.x, self.position.y + stanceHeight, self.position.z);
    const selfMesh = meshes.get(net.id);
    if (selfMesh) selfMesh.visible = self.alive && cameraMode !== 'first';
    if (cameraMode === 'first') {
      camera.position.set(target.x, target.y + .35, target.z);
      camera.lookAt(target.x + Math.sin(yaw) * 12, target.y + .25, target.z + Math.cos(yaw) * 12);
    } else {
      camera.position.set(
        target.x - Math.sin(yaw) * 7,
        target.y + 4.4,
        target.z - Math.cos(yaw) * 7
      );
      camera.lookAt(target);
    }
    updatePlacementPreview(self);
  } else {
    camera.position.set(0, 8, 14);
  }
  const now = performance.now();
  for (const mesh of meshes.values()) {
    const hand = mesh.getObjectByName('held-item');
    if (!hand) continue;
    if (mesh.userData.swingUntil > now) {
      const phase = Math.min(1, (now - mesh.userData.swingStartedAt) / 420);
      hand.rotation.z = Math.sin(phase * Math.PI) * -1.25;
    } else {
      hand.rotation.z *= .72;
    }
  }
  renderer.render(scene, camera);
}
for (const button of document.querySelectorAll('.hotbar-slot')) {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    selectSlot(Number(button.dataset.slot));
  });
}
animate();
