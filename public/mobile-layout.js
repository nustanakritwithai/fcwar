export function joystickIntent(dx, dy, radius = 58) {
  const rawMagnitude = Math.hypot(dx, dy);
  const magnitude = Math.min(1, rawMagnitude / radius);
  const scale = rawMagnitude > radius && rawMagnitude > 0 ? radius / rawMagnitude : 1;
  const x = (dx * scale) / radius;
  const forward = (-dy * scale) / radius;
  const forwardShare = rawMagnitude > 0 ? -dy / rawMagnitude : 0;
  return {
    x,
    forward,
    magnitude,
    sprint: magnitude >= .86 && forwardShare >= .72
  };
}

export function getMobileRects(width = 390, height = 844) {
  const side = Math.max(8, Math.min(14, width * .025));
  return {
    score: { x: side, y: 6, width: width - side * 2, height: 54 },
    player: { x: side, y: 66, width: 178, height: 94 },
    resources: { x: width - side - 178, y: 66, width: 178, height: 94 },
    capture: { x: (width - 250) / 2, y: 166, width: 250, height: 58 },
    stance: { x: width - side - 54, y: 232, width: 54, height: 44 },
    objective: { x: side, y: 284, width: 220, height: 54 },
    minimap: { x: width - side - 120, y: 284, width: 120, height: 120 },
    joystick: { x: side, y: height - 272, width: 150, height: 180 },
    actions: { x: width - side - 142, y: height - 272, width: 142, height: 180 },
    hotbar: { x: (width - 238) / 2, y: height - 62, width: 238, height: 54 }
  };
}

export function overlapCount(rects) {
  const values = Array.isArray(rects) ? rects : Object.values(rects);
  let overlaps = 0;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const a = values[i];
      const b = values[j];
      const intersects = a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y;
      if (intersects) overlaps += 1;
    }
  }
  return overlaps;
}
