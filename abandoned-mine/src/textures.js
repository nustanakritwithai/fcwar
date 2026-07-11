// Procedural PBR texture generation.
//
// จุดเรียนรู้: วัสดุ PBR หนึ่งชิ้นประกอบด้วยหลาย "map" ที่ทำงานร่วมกัน
//   - Base Color (albedo)  : สีพื้นผิว ไม่มีแสง/เงา (AO บางส่วน bake ลงไปได้)
//   - Normal map           : รายละเอียดนูน-บุ๋มระดับพิกเซล โดยไม่เพิ่ม triangle
//   - Roughness map        : ความด้าน/มันวาว (three.js อ่านจาก G channel)
//   - Metallic             : ที่นี่ใช้เป็นค่าคงที่ต่อวัสดุ (พอสำหรับ mobile)
// เราสร้างทุก map จาก "height field" เดียวกัน จึงสอดคล้องกันโดยธรรมชาติ
// และใช้ noise แบบ period-wrapped เพื่อให้ texture ต่อกันแบบไร้รอยต่อ (tileable)

import * as THREE from 'three';

// Deterministic hash noise — same seed, same texture, every load.
function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t) => t * t * (3 - 2 * t);

// Value noise wrapped at `period` cells so the result tiles seamlessly.
function vnoise(x, y, period, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const w = (i) => ((i % period) + period) % period;
  const a = hash2(w(ix), w(iy), seed);
  const b = hash2(w(ix + 1), w(iy), seed);
  const c = hash2(w(ix), w(iy + 1), seed);
  const d = hash2(w(ix + 1), w(iy + 1), seed);
  const sx = smooth(fx), sy = smooth(fy);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Fractal Brownian Motion: layered noise = natural-looking surfaces.
export function fbm(x, y, seed, octaves = 4, basePeriod = 8) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * freq, y * freq, basePeriod * freq, seed + i * 101);
    amp *= 0.5;
    freq *= 2;
  }
  return sum; // ~0..1
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// painter(u, v, out) fills out = { h, r, g, b, rough } for each pixel.
// u,v ใน [0,1). คืน { map, normalMap, roughnessMap } พร้อมใช้กับ MeshStandardMaterial
export function bakePBRMaps(size, painter, { normalStrength = 1.5, repeat = 1 } = {}) {
  const height = new Float32Array(size * size);
  const albedo = makeCanvas(size);
  const rough = makeCanvas(size);
  const normal = makeCanvas(size);
  const aCtx = albedo.getContext('2d');
  const rCtx = rough.getContext('2d');
  const nCtx = normal.getContext('2d');
  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const nImg = nCtx.createImageData(size, size);
  const out = { h: 0, r: 0, g: 0, b: 0, rough: 0.8 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      painter(x / size, y / size, out);
      const i = (y * size + x) * 4;
      height[y * size + x] = out.h;
      aImg.data[i] = out.r; aImg.data[i + 1] = out.g; aImg.data[i + 2] = out.b; aImg.data[i + 3] = 255;
      const rv = Math.max(0, Math.min(1, out.rough)) * 255;
      rImg.data[i] = rv; rImg.data[i + 1] = rv; rImg.data[i + 2] = rv; rImg.data[i + 3] = 255;
    }
  }

  // Derive tangent-space normal map from the height field (Sobel-ish).
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + ((x - 1 + size) % size)];
      const r2 = height[y * size + ((x + 1) % size)];
      const u = height[((y - 1 + size) % size) * size + x];
      const d = height[((y + 1) % size) * size + x];
      let nx = (l - r2) * normalStrength;
      let ny = (u - d) * normalStrength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len;
      const i = (y * size + x) * 4;
      nImg.data[i] = (nx * 0.5 + 0.5) * 255;
      nImg.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      nImg.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      nImg.data[i + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);

  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; // albedo เท่านั้นที่เป็น sRGB
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(albedo, true), roughnessMap: tex(rough, false), normalMap: tex(normal, false) };
}
