// Pure game-state logic — no three.js, no DOM. รันเทสต์ด้วย node:test ได้ตรง ๆ
// จุดเรียนรู้: แยก "กติกาเกม" ออกจาก "การเรนเดอร์" ทำให้ทดสอบ gameplay loop
// ได้ตั้งแต่ Phase 2 โดยไม่ต้องรอกราฟิกเสร็จ

export const TUNING = {
  oxygenMax: 100,
  oxygenDrainWalk: 100 / 150,   // หมดใน ~150 วิ ถ้าเดินในเหมืองตลอด
  runDrainMult: 1.6,            // วิ่งเปลืองออกซิเจน
  generatorDrainMult: 0.55,     // เครื่องปั่นไฟเปิดระบายอากาศ → ผ่อนลง
  oxygenRefill: 25,             // เติมเร็วเมื่ออยู่ชายหาด
  batteryCharge: 100,           // 1 ก้อน = 100 หน่วย
  flashlightDrain: 100 / 240,   // ไฟฉายอยู่ได้ ~4 นาทีต่อก้อน
  oresToWin: 3,
  respawnOxygen: 60,
};

export function createGame() {
  return {
    phase: 'play',            // play | dead | win
    oxygen: TUNING.oxygenMax,
    batteryCharge: 0,
    hasBattery: false,
    flashlightOn: false,
    ores: 0,
    generatorOn: false,
    deaths: 0,
    checkpoint: { x: 0, z: 7 },
    time: 0,
  };
}

// env = { insideMine, running, onBeach }
export function updateGame(g, dt, env) {
  if (g.phase !== 'play') return g;
  g.time += dt;

  if (env.insideMine) {
    let drain = TUNING.oxygenDrainWalk;
    if (env.running) drain *= TUNING.runDrainMult;
    if (g.generatorOn) drain *= TUNING.generatorDrainMult;
    g.oxygen -= drain * dt;
  } else {
    g.oxygen = Math.min(TUNING.oxygenMax, g.oxygen + TUNING.oxygenRefill * dt);
  }

  if (g.flashlightOn) {
    g.batteryCharge -= TUNING.flashlightDrain * dt;
    if (g.batteryCharge <= 0) { g.batteryCharge = 0; g.flashlightOn = false; }
  }

  if (g.oxygen <= 0) { g.oxygen = 0; g.phase = 'dead'; g.deaths += 1; }
  if (g.ores >= TUNING.oresToWin && env.onBeach) g.phase = 'win';
  return g;
}

export function collectItem(g, type) {
  if (type === 'battery') {
    g.hasBattery = true;
    g.batteryCharge = Math.min(TUNING.batteryCharge, g.batteryCharge + TUNING.batteryCharge);
    return true;
  }
  if (type === 'ore') { g.ores += 1; return true; }
  return false;
}

export function toggleFlashlight(g) {
  if (!g.hasBattery || g.batteryCharge <= 0) return false;
  g.flashlightOn = !g.flashlightOn;
  return true;
}

export function startGenerator(g) {
  if (g.generatorOn) return false;
  g.generatorOn = true;
  return true;
}

export function setCheckpoint(g, x, z) { g.checkpoint = { x, z }; }

export function respawn(g) {
  if (g.phase !== 'dead') return false;
  g.phase = 'play';
  g.oxygen = TUNING.respawnOxygen;
  g.flashlightOn = false;
  return true;
}

// ข้อความภารกิจปัจจุบัน — ลำดับตามสเปก: แบต → เครื่องปั่นไฟ → แร่ 3 → ออก
export function objectiveText(g) {
  if (g.phase === 'win') return 'สำเร็จ!';
  if (g.phase === 'dead') return 'ออกซิเจนหมด...';
  if (!g.hasBattery) return 'เข้าไปในเหมือง หาแบตเตอรี่ไฟฉาย';
  if (!g.generatorOn) return 'เปิดไฟฉาย (F) แล้วหาเครื่องปั่นไฟในห้องเครื่องทางซ้าย';
  if (g.ores < TUNING.oresToWin) return `เก็บแร่ให้ครบ (${g.ores}/${TUNING.oresToWin})`;
  return 'ได้แร่ครบแล้ว! รีบกลับออกไปที่ชายหาด!';
}
