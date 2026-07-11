// HUD + เมนู — อ่านสถานะจาก logic.js แล้ววาดลง DOM (ถูกกว่าวาดใน WebGL)
import { objectiveText, TUNING } from './logic.js';

export function createHUD() {
  const $ = (id) => document.getElementById(id);
  const el = {
    oxyFill: $('oxy-fill'), oxyText: $('oxy-text'),
    batFill: $('bat-fill'), batWrap: $('bat-wrap'),
    ore: $('ore-count'), objective: $('objective'),
    toast: $('toast'), prompt: $('interact-prompt'),
    win: $('win-screen'), lose: $('lose-screen'),
    winTime: $('win-time'), stats: $('stats'),
  };
  let toastTimer = 0;

  return {
    toast(msg, secs = 2.5) {
      el.toast.textContent = msg;
      el.toast.style.opacity = '1';
      toastTimer = secs;
    },
    setPrompt(text) {
      el.prompt.style.display = text ? 'block' : 'none';
      if (text) el.prompt.textContent = text;
    },
    update(g, dt) {
      const oxyPct = (g.oxygen / TUNING.oxygenMax) * 100;
      el.oxyFill.style.width = `${oxyPct}%`;
      el.oxyFill.style.background = oxyPct < 25 ? '#e04a3a' : oxyPct < 50 ? '#e0a63a' : '#3ac1e0';
      el.oxyText.textContent = `O₂ ${Math.ceil(g.oxygen)}%`;
      el.batWrap.style.display = g.hasBattery ? 'flex' : 'none';
      el.batFill.style.width = `${g.batteryCharge}%`;
      el.ore.textContent = `⛏ ${g.ores}/${TUNING.oresToWin}`;
      el.objective.textContent = objectiveText(g);
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) el.toast.style.opacity = '0';
      }
    },
    showWin(g) {
      el.winTime.textContent = `ใช้เวลา ${Math.round(g.time)} วินาที · ตาย ${g.deaths} ครั้ง`;
      el.win.style.display = 'flex';
    },
    showLose() { el.lose.style.display = 'flex'; },
    hideEnd() { el.win.style.display = 'none'; el.lose.style.display = 'none'; },
    setStats(text) { el.stats.textContent = text; },
  };
}
