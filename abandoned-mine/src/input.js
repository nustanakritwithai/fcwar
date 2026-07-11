// Input: คีย์บอร์ด + เมาส์ (เดสก์ท็อป) และ virtual joystick + ปุ่มสัมผัส (มือถือ)
// state ที่ระบบอื่นอ่าน: moveX, moveZ (-1..1), running, และ event แบบกดครั้งเดียว

export function createInput(canvas) {
  const S = {
    moveX: 0, moveZ: 0,
    running: false,
    lookDX: 0, lookDY: 0,      // สะสมต่อเฟรม แล้ว main ล้างทิ้ง
    jumpPressed: false,
    interactPressed: false,
    flashlightPressed: false,
    touchMode: false,
  };

  // ---------- keyboard ----------
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') S.jumpPressed = true;
    if (e.code === 'KeyE') S.interactPressed = true;
    if (e.code === 'KeyF') S.flashlightPressed = true;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  function pollKeyboard() {
    let x = 0, z = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (x || z || !S.touchMode) {
      const len = Math.hypot(x, z) || 1;
      S.moveX = x / len; S.moveZ = z / len;
      S.running = keys.has('ShiftLeft') || keys.has('ShiftRight') || S.runLatch;
    }
  }

  // ---------- mouse look (ลากเพื่อหมุนกล้อง) ----------
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    S.lookDX += e.clientX - lastX; S.lookDY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  });

  // ---------- touch: โซนซ้าย = joystick, โซนขวา = หมุนกล้อง ----------
  const stick = document.getElementById('stick');
  const stickKnob = document.getElementById('stick-knob');
  let stickTouch = null, lookTouch = null, stickCX = 0, stickCY = 0;
  const STICK_R = 60;

  function onTouchStart(e) {
    S.touchMode = true;
    document.body.classList.add('touch');
    for (const t of e.changedTouches) {
      if (t.target.closest('.tbtn') || t.target.closest('#menus')) continue;
      if (t.clientX < window.innerWidth * 0.45 && stickTouch === null) {
        stickTouch = t.identifier; stickCX = t.clientX; stickCY = t.clientY;
        stick.style.display = 'block';
        stick.style.left = `${stickCX - STICK_R}px`; stick.style.top = `${stickCY - STICK_R}px`;
      } else if (lookTouch === null) {
        lookTouch = t.identifier; lastX = t.clientX; lastY = t.clientY;
      }
    }
    if (e.target === canvas) e.preventDefault();
  }
  function onTouchMove(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === stickTouch) {
        let dx = t.clientX - stickCX, dy = t.clientY - stickCY;
        const len = Math.hypot(dx, dy);
        if (len > STICK_R) { dx *= STICK_R / len; dy *= STICK_R / len; }
        stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        S.moveX = dx / STICK_R; S.moveZ = dy / STICK_R;
        // ดันสุดขอบ = วิ่ง (ตามแบบเกมมือถือทั่วไป)
        S.running = len > STICK_R * 0.9 || S.runLatch;
      } else if (t.identifier === lookTouch) {
        S.lookDX += t.clientX - lastX; S.lookDY += t.clientY - lastY;
        lastX = t.clientX; lastY = t.clientY;
      }
    }
    if (e.target === canvas) e.preventDefault();
  }
  function onTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === stickTouch) {
        stickTouch = null; S.moveX = 0; S.moveZ = 0; S.running = S.runLatch;
        stick.style.display = 'none';
        stickKnob.style.transform = 'translate(0px, 0px)';
      }
      if (t.identifier === lookTouch) lookTouch = null;
    }
  }
  window.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);
  window.addEventListener('touchcancel', onTouchEnd);

  // ---------- ปุ่มสัมผัส ----------
  S.runLatch = false;
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); fn(); });
  };
  bind('btn-jump', () => { S.jumpPressed = true; });
  bind('btn-interact', () => { S.interactPressed = true; });
  bind('btn-flash', () => { S.flashlightPressed = true; });
  bind('btn-run', () => {
    S.runLatch = !S.runLatch;
    document.getElementById('btn-run').classList.toggle('on', S.runLatch);
  });

  S.update = pollKeyboard;
  S.consumeFrame = () => {
    S.jumpPressed = false; S.interactPressed = false; S.flashlightPressed = false;
    S.lookDX = 0; S.lookDY = 0;
  };
  return S;
}
