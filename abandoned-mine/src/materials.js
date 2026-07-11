// Material library — วัสดุหลัก 10 ชนิดตามสเปก ทุกตัวเป็น MeshStandardMaterial (PBR)
// ขนาด texture คุมตามงบมือถือ: ส่วนใหญ่ 512, hero asset (เครื่องปั่นไฟ) 1024
import * as THREE from 'three';
import { bakePBRMaps, fbm } from './textures.js';

const mix = (a, b, t) => a + (b - a) * t;

export function createMaterials() {
  const M = {};

  // --- ทราย: สว่าง ด้านมาก ริ้วคลื่นเล็ก ๆ จาก noise ยืดแกนเดียว
  {
    const maps = bakePBRMaps(512, (u, v, o) => {
      const ripple = fbm(u * 2, v * 14, 11, 3);
      const grain = fbm(u * 24, v * 24, 12, 3);
      o.h = ripple * 0.6 + grain * 0.4;
      const t = o.h;
      o.r = mix(196, 226, t); o.g = mix(174, 205, t); o.b = mix(133, 162, t);
      o.rough = 0.95;
    }, { normalStrength: 2, repeat: 10 });
    M.sand = new THREE.MeshStandardMaterial({ ...maps, metalness: 0, roughness: 1 });
  }

  // --- หินแห้ง: เทาอมน้ำตาล รอยแตกจาก noise ความถี่สูง
  {
    const maps = bakePBRMaps(512, (u, v, o) => {
      const big = fbm(u * 3, v * 3, 21, 5);
      const crack = Math.abs(fbm(u * 6, v * 6, 22, 4) - 0.5) < 0.015 ? 0.55 : 1;
      o.h = big;
      const t = big;
      o.r = mix(78, 128, t) * crack; o.g = mix(70, 118, t) * crack; o.b = mix(62, 105, t) * crack;
      o.rough = 0.92 - big * 0.1;
    }, { normalStrength: 1.8, repeat: 4 });
    M.rockDry = new THREE.MeshStandardMaterial({ ...maps, metalness: 0, roughness: 1 });
  }

  // --- หินเปียก: เข้มกว่า + roughness ต่ำเป็นหย่อม ๆ (จุดเรียนรู้สำคัญ:
  //     "เปียก" ใน PBR คือ albedo เข้มลง + roughness ลดลง ไม่ใช่ใส่ specular เพิ่ม)
  {
    const maps = bakePBRMaps(512, (u, v, o) => {
      const big = fbm(u * 3, v * 3, 31, 5);
      const wet = fbm(u * 2.5, v * 2.5, 32, 3); // หย่อมความเปียก
      o.h = big;
      const t = big;
      const dark = wet > 0.5 ? 0.55 : 1.0;
      o.r = mix(64, 110, t) * dark; o.g = mix(62, 104, t) * dark; o.b = mix(60, 100, t) * dark;
      o.rough = wet > 0.5 ? 0.25 : 0.85;
    }, { normalStrength: 1.8, repeat: 4 });
    M.rockWet = new THREE.MeshStandardMaterial({ ...maps, metalness: 0, roughness: 1 });
  }

  // --- ดิน/โคลนพื้นเหมือง
  {
    const maps = bakePBRMaps(512, (u, v, o) => {
      const clump = fbm(u * 4, v * 4, 41, 5);
      const mud = fbm(u * 2, v * 2, 42, 3);
      o.h = clump;
      const t = clump;
      const wet = mud > 0.55;
      o.r = mix(76, 112, t) * (wet ? 0.6 : 1); o.g = mix(56, 84, t) * (wet ? 0.6 : 1); o.b = mix(42, 60, t) * (wet ? 0.62 : 1);
      o.rough = wet ? 0.35 : 0.95;
    }, { normalStrength: 1.6, repeat: 6 });
    M.dirt = new THREE.MeshStandardMaterial({ ...maps, metalness: 0, roughness: 1 });
  }

  // --- ไม้เก่า: ลายเสี้ยนแนวเดียว + ปมไม้
  {
    const maps = bakePBRMaps(512, (u, v, o) => {
      const grain = fbm(u * 2, v * 30, 51, 4);
      const streak = fbm(u * 1.2, v * 5, 52, 3);
      o.h = grain * 0.7 + streak * 0.3;
      const t = grain;
      o.r = mix(82, 130, t); o.g = mix(60, 96, t); o.b = mix(40, 64, t);
      o.rough = 0.85;
    }, { normalStrength: 2, repeat: 1 });
    M.woodOld = new THREE.MeshStandardMaterial({ ...maps, metalness: 0, roughness: 1 });
  }

  // --- เหล็กสนิม: โลหะที่ "สนิมกิน metalness" — จุดสนิม metalness ต่ำ rough สูง
  {
    const maps = bakePBRMaps(512, (u, v, o) => {
      const rust = fbm(u * 5, v * 5, 61, 4);
      const pit = fbm(u * 18, v * 18, 62, 3);
      const isRust = rust > 0.45;
      o.h = isRust ? pit * 0.5 : 0.8;
      if (isRust) { o.r = mix(96, 150, pit); o.g = mix(46, 74, pit); o.b = mix(26, 40, pit); o.rough = 0.95; }
      else { o.r = 120; o.g = 118; o.b = 115; o.rough = 0.45; }
    }, { normalStrength: 2, repeat: 2 });
    M.metalRust = new THREE.MeshStandardMaterial({ ...maps, metalness: 0.55, roughness: 1 });
  }

  // --- เหล็กทาสี (เครื่องปั่นไฟ = hero asset ใช้ 1024): สีเขียวเครื่องจักร ถลอกเห็นเนื้อเหล็ก
  {
    const maps = bakePBRMaps(1024, (u, v, o) => {
      const wear = fbm(u * 6, v * 6, 71, 4);
      const scratch = fbm(u * 40, v * 2, 72, 3);
      const chipped = wear > 0.62 || scratch > 0.78;
      o.h = chipped ? 0.3 : 0.7;
      if (chipped) { o.r = 130; o.g = 128; o.b = 124; o.rough = 0.4; }
      else {
        const t = fbm(u * 10, v * 10, 73, 3);
        o.r = mix(38, 52, t); o.g = mix(72, 92, t); o.b = mix(48, 62, t); o.rough = 0.55;
      }
    }, { normalStrength: 1.5, repeat: 1 });
    M.metalPainted = new THREE.MeshStandardMaterial({ ...maps, metalness: 0.85, roughness: 1 });
  }

  // --- น้ำตื้น: โปร่งใสชิ้นเดียวในฉาก (งบ transparency จำกัด!) normal เลื่อนใน main loop
  {
    const maps = bakePBRMaps(256, (u, v, o) => {
      o.h = fbm(u * 6, v * 6, 81, 4);
      o.r = 30; o.g = 90; o.b = 110;
      o.rough = 0.08;
    }, { normalStrength: 1.2, repeat: 6 });
    M.water = new THREE.MeshStandardMaterial({
      color: 0x2a7d8c, normalMap: maps.normalMap, metalness: 0, roughness: 0.1,
      transparent: true, opacity: 0.8,
    });
    M.waterNormal = maps.normalMap;
  }

  // --- แร่คริสตัล: emissive เพื่อให้เห็นในความมืด (และสอนเรื่อง emissive ไม่ใช่ light จริง)
  M.oreCrystal = new THREE.MeshStandardMaterial({
    color: 0x69d2ff, emissive: 0x1888cc, emissiveIntensity: 1.6,
    metalness: 0, roughness: 0.25,
  });

  // --- กระจกไฟฉาย
  M.glass = new THREE.MeshStandardMaterial({
    color: 0xfff6c8, emissive: 0xfff2b0, emissiveIntensity: 0, metalness: 0, roughness: 0.1,
  });

  // วัสดุตัวละคร (เรียบ ไม่กิน texture)
  M.cloth = new THREE.MeshStandardMaterial({ color: 0x9a5f2d, roughness: 0.9 });
  M.skin = new THREE.MeshStandardMaterial({ color: 0xd8a577, roughness: 0.8 });
  M.helmet = new THREE.MeshStandardMaterial({ color: 0xc9b23a, roughness: 0.5, metalness: 0.3 });

  return M;
}
