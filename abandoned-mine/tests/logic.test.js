// ทดสอบกติกาเกมล้วน ๆ (Phase 2: gameplay loop ต้องเล่นจบได้ก่อนใส่กราฟิก)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, updateGame, collectItem, toggleFlashlight,
  startGenerator, setCheckpoint, respawn, objectiveText, TUNING,
} from '../src/logic.js';

const inMine = { insideMine: true, running: false, onBeach: false };
const onBeach = { insideMine: false, running: false, onBeach: true };

test('ออกซิเจนลดในเหมือง และเติมคืนบนชายหาด', () => {
  const g = createGame();
  updateGame(g, 10, inMine);
  assert.ok(g.oxygen < TUNING.oxygenMax);
  const after = g.oxygen;
  updateGame(g, 10, onBeach);
  assert.ok(g.oxygen > after);
});

test('วิ่งเปลืองออกซิเจนกว่าเดิน', () => {
  const walk = createGame(), run = createGame();
  updateGame(walk, 10, inMine);
  updateGame(run, 10, { ...inMine, running: true });
  assert.ok(run.oxygen < walk.oxygen);
});

test('เครื่องปั่นไฟช่วยลดอัตราการใช้ออกซิเจน', () => {
  const off = createGame(), on = createGame();
  startGenerator(on);
  updateGame(off, 10, inMine);
  updateGame(on, 10, inMine);
  assert.ok(on.oxygen > off.oxygen);
});

test('ออกซิเจนหมด = ตาย และฟื้นที่ checkpoint ได้', () => {
  const g = createGame();
  updateGame(g, 1000, inMine);
  assert.equal(g.phase, 'dead');
  assert.equal(g.deaths, 1);
  assert.ok(respawn(g));
  assert.equal(g.phase, 'play');
  assert.equal(g.oxygen, TUNING.respawnOxygen);
});

test('ไฟฉายต้องมีแบตก่อน และแบตหมดแล้วดับเอง', () => {
  const g = createGame();
  assert.equal(toggleFlashlight(g), false);
  collectItem(g, 'battery');
  assert.equal(g.batteryCharge, TUNING.batteryCharge);
  assert.ok(toggleFlashlight(g));
  assert.ok(g.flashlightOn);
  updateGame(g, 10000, onBeach);
  assert.equal(g.flashlightOn, false);
  assert.equal(g.batteryCharge, 0);
});

test('gameplay loop จบเกมได้: แบต → เครื่องปั่นไฟ → แร่ 3 → ออกชายหาด = ชนะ', () => {
  const g = createGame();
  collectItem(g, 'battery');
  startGenerator(g);
  collectItem(g, 'ore'); collectItem(g, 'ore');
  updateGame(g, 1, onBeach);
  assert.equal(g.phase, 'play', 'แร่ยังไม่ครบต้องยังไม่ชนะ');
  collectItem(g, 'ore');
  updateGame(g, 1, inMine);
  assert.equal(g.phase, 'play', 'แร่ครบแต่ยังอยู่ในเหมืองต้องยังไม่ชนะ');
  updateGame(g, 1, onBeach);
  assert.equal(g.phase, 'win');
});

test('checkpoint บันทึกตำแหน่ง', () => {
  const g = createGame();
  setCheckpoint(g, 0, -12);
  assert.deepEqual(g.checkpoint, { x: 0, z: -12 });
});

test('ข้อความภารกิจไล่ตามลำดับ', () => {
  const g = createGame();
  assert.match(objectiveText(g), /แบตเตอรี่/);
  collectItem(g, 'battery');
  assert.match(objectiveText(g), /เครื่องปั่นไฟ/);
  startGenerator(g);
  assert.match(objectiveText(g), /เก็บแร่/);
  g.ores = 3;
  assert.match(objectiveText(g), /ชายหาด/);
});
