// Bootstrap + game loop + ระบบคุณภาพ + ตัววัดประสิทธิภาพ
//
// งบประมาณ (อุปกรณ์ Android ระดับกลาง): เป้า 45 FPS ไม่ต่ำกว่า 30
// - Draw calls < 60, triangles < 150k (ฉากนี้จริง ~35 calls / ~40k tris)
// - ไฟ real-time: แดด 1 + ไฟฉาย 1 + หลอดไฟ 5 (point, ไม่มีเงา)
// - เงา: แดดอย่างเดียว (Low = อบครั้งเดียวแบบ baked), ไฟฉายมีเงาเฉพาะ High
import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { buildWorld } from './world.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createHUD } from './hud.js';
import {
  createGame, updateGame, collectItem, toggleFlashlight,
  startGenerator, setCheckpoint, respawn,
} from './logic.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,                 // มือถือ: ปิด MSAA แล้วคุมด้วย pixelRatio แทน
  powerPreference: 'high-performance',
});
renderer.toneMapping = THREE.ACESFilmicToneMapping; // หัวใจของลุค "สมจริง"
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 160);

const M = createMaterials();
const world = buildWorld(scene, M);
const player = createPlayer(scene, M);
const input = createInput(canvas);
const hud = createHUD();
let game = createGame();
let quality = 'medium';
let started = false;

player.teleport(world.spawn.x, world.spawn.z);

// ---------- ระบบคุณภาพ Low / Medium / High ----------
const QUALITY = {
  low: { pixelRatioCap: 1.0, shadowSize: 1024, bakedShadows: true },
  medium: { pixelRatioCap: 1.5, shadowSize: 1536, bakedShadows: false },
  high: { pixelRatioCap: 2.0, shadowSize: 2048, bakedShadows: false },
};

function applyQuality(q) {
  quality = q;
  const cfg = QUALITY[q];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, cfg.pixelRatioCap));
  world.sun.shadow.mapSize.set(cfg.shadowSize, cfg.shadowSize);
  if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
  // Low = "baked" เงาแดด: เรนเดอร์ shadow map ครั้งเดียวแล้วหยุดอัปเดต
  renderer.shadowMap.autoUpdate = !cfg.bakedShadows;
  renderer.shadowMap.needsUpdate = true;
  player.setFlashlight(game.flashlightOn, quality);
  for (const b of document.querySelectorAll('#quality-row button')) {
    b.classList.toggle('on', b.dataset.q === q);
  }
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// ---------- เมนู ----------
for (const b of document.querySelectorAll('#quality-row button')) {
  b.addEventListener('click', () => applyQuality(b.dataset.q));
}
document.getElementById('btn-start').addEventListener('click', () => {
  document.getElementById('start-screen').style.display = 'none';
  started = true;
});
document.getElementById('btn-respawn').addEventListener('click', () => {
  respawn(game);
  player.teleport(game.checkpoint.x, game.checkpoint.z);
  player.setFlashlight(false, quality);
  hud.hideEnd();
});
document.getElementById('btn-restart').addEventListener('click', () => restartAll());
document.getElementById('btn-restart-lose').addEventListener('click', () => restartAll());
document.getElementById('btn-stats').addEventListener('click', () => {
  const s = document.getElementById('stats');
  s.style.display = s.style.display === 'none' ? 'block' : 'none';
});

function restartAll() { location.reload(); } // prototype: reload = reset ฉากทั้งหมดชัวร์สุด

applyQuality('medium');

// debug handle สำหรับเทสต์อัตโนมัติ (ไม่กระทบเกม)
window.__dbg = { player, get game() { return game; }, world };

// ---------- ตัววัดประสิทธิภาพ ----------
let fpsAccum = 0, fpsFrames = 0, fpsShown = 0, statTimer = 0;
function updateStats(dt) {
  fpsAccum += dt; fpsFrames += 1; statTimer += dt;
  if (statTimer < 0.5) return;
  fpsShown = Math.round(fpsFrames / fpsAccum);
  fpsAccum = 0; fpsFrames = 0; statTimer = 0;
  const info = renderer.info;
  const mem = performance.memory
    ? ` | JS ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)}MB` : '';
  hud.setStats(
    `FPS ${fpsShown} | calls ${info.render.calls} | tris ${(info.render.triangles / 1000).toFixed(1)}k`
    + ` | geo ${info.memory.geometries} tex ${info.memory.textures}${mem}`,
  );
}

// ---------- interaction ----------
function nearestInteractable() {
  let best = null, bestD = Infinity;
  for (const it of world.interactables) {
    if (it.taken) continue;
    const d = Math.hypot(player.pos.x - it.x, player.pos.z - it.z);
    if (d < it.radius && d < bestD) { best = it; bestD = d; }
  }
  return best;
}

const promptFor = { battery: 'กด E — เก็บแบตเตอรี่', ore: 'กด E — ขุดแร่', generator: 'กด E — สตาร์ทเครื่องปั่นไฟ' };

function handleInteract(it) {
  if (it.type === 'generator') {
    if (startGenerator(game)) {
      it.taken = true;
      world.setGeneratorOn();
      hud.toast('เครื่องปั่นไฟทำงาน! ระบบระบายอากาศช่วยประหยัดออกซิเจน');
    }
    return;
  }
  collectItem(game, it.type);
  it.taken = true;
  it.mesh.visible = false;
  if (it.type === 'battery') {
    hud.toast('ได้แบตเตอรี่! กด F เพื่อเปิดไฟฉาย');
  } else {
    hud.toast(game.ores >= 3 ? 'ได้แร่ครบแล้ว! รีบออกจากเหมือง!' : `ได้แร่เรืองแสง (${game.ores}/3)`);
  }
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let ended = false;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  input.update();

  if (started && game.phase === 'play') {
    player.update(dt, input, world, camera);

    if (input.flashlightPressed) {
      if (toggleFlashlight(game)) player.setFlashlight(game.flashlightOn, quality);
      else hud.toast(game.hasBattery ? 'แบตเตอรี่หมด!' : 'ยังไม่มีแบตเตอรี่');
    }

    const near = nearestInteractable();
    hud.setPrompt(near ? promptFor[near.type] : '');
    if (input.interactPressed && near) handleInteract(near);

    for (const cp of world.checkpoints) {
      if (!cp.active && Math.hypot(player.pos.x - cp.x, player.pos.z - cp.z) < cp.radius) {
        cp.active = true;
        cp.mesh.material.emissive.set(0x33ff88);
        cp.mesh.material.emissiveIntensity = 1.2;
        setCheckpoint(game, cp.x, cp.z);
        hud.toast('บันทึก Checkpoint แล้ว');
      }
    }

    updateGame(game, dt, {
      insideMine: world.isInsideMine(player.pos),
      running: player.running && player.moving,
      onBeach: world.isOnBeach(player.pos),
    });

    if (game.phase === 'dead') { hud.showLose(); player.setFlashlight(false, quality); }
    if (game.phase === 'win' && !ended) { ended = true; hud.showWin(game); }
  }

  // อนิเมชันเบา ๆ: ของเก็บได้หมุน + ผิวน้ำไหล
  const t = clock.elapsedTime;
  for (const it of world.interactables) {
    if (!it.taken && it.spin) { it.mesh.rotation.y = t * 2; it.mesh.position.y = 0.55 + Math.sin(t * 3) * 0.08; }
  }
  M.waterNormal.offset.set(t * 0.02, t * 0.013);

  hud.update(game, dt);
  input.consumeFrame(); // ล้างปุ่มกดครั้งเดียว + delta กล้อง ทุกเฟรม
  renderer.render(scene, camera);
  updateStats(dt);
}
frame();
