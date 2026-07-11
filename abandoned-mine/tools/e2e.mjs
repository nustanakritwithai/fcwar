// End-to-end playthrough: แบต → ไฟฉาย → เครื่องปั่นไฟ → แร่ 3 → กลับหาด → ชนะ
// วิธีรัน: ติดตั้ง playwright ก่อน (npm i -D playwright && npx playwright install chromium)
// แล้วเปิดเซิร์ฟเวอร์ (npm run mine) จากนั้น: OUT=/tmp node abandoned-mine/tools/e2e.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:3001/abandoned-mine/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('#btn-start');
await page.waitForTimeout(300);

const tp = (x, z) => page.evaluate(([x, z]) => window.__dbg.player.teleport(x, z), [x, z]);
const state = () => page.evaluate(() => {
  const g = window.__dbg.game;
  return { phase: g.phase, bat: g.hasBattery, gen: g.generatorOn, ores: g.ores, oxy: +g.oxygen.toFixed(1) };
});
const step = async (label, x, z, keys = ['e']) => {
  await tp(x, z);
  await page.waitForTimeout(400); // ให้เฟรมอัปเดต prompt
  for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(250); }
  console.log(label, JSON.stringify(await state()));
};

await step('เก็บแบต     ', 0.5, 1.5);
await page.keyboard.press('f'); // เปิดไฟฉาย
await page.waitForTimeout(300);
console.log('ไฟฉาย       ', await page.evaluate(() => window.__dbg.game.flashlightOn));
await page.screenshot({ path: process.env.OUT + '/e2e-flashlight.png' });

await step('เครื่องปั่นไฟ', -19, -10.5);
await page.waitForTimeout(400);
await page.screenshot({ path: process.env.OUT + '/e2e-generator.png' });

await step('แร่ 1       ', 20, -13);
await step('แร่ 2       ', -4.5, -32.5);
await page.screenshot({ path: process.env.OUT + '/e2e-deep.png' });
await step('แร่ 3       ', 5, -30);

// อยู่ในเหมืองสักพัก — ออกซิเจนต้องลด
await page.waitForTimeout(3000);
console.log('ในเหมือง 3 วิ', JSON.stringify(await state()));

// กลับชายหาด → ต้องชนะ
await tp(0, 14);
await page.waitForTimeout(1200);
console.log('กลับหาด     ', JSON.stringify(await state()));
const winVisible = await page.evaluate(() => document.getElementById('win-screen').style.display);
console.log('หน้าจอชนะ   ', winVisible);
await page.screenshot({ path: process.env.OUT + '/e2e-win.png' });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
