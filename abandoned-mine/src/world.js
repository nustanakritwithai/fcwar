// World builder — สร้างฉากเดียวทั้งเกม: ชายหาด → ทางเข้าเหมือง → อุโมงค์หลัก
// → ห้องเครื่อง / จุดขุดแร่ → ห้องลึก แล้วกลับออกทางเดิม
//
// เทคนิค mobile ที่ใช้ในไฟล์นี้ (เทียบกับ Unity URP):
//   - Static Batching  → mergeGeometries() รวมผนัง/เพดานเป็น mesh เดียวต่อวัสดุ
//   - GPU Instancing   → InstancedMesh สำหรับโครงไม้ค้ำอุโมงค์
//   - LOD              → THREE.LOD กับหินชายหาด 3 ระดับ
//   - Baked Lighting   → shadowMap.autoUpdate=false ที่คุณภาพ Low (อบเงาครั้งเดียว)
//   - Occlusion จำลอง  → ใช้เงาแดด + เพดานทำให้ในเหมืองมืดจริง แทน occlusion culling
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CELL = 2; // ตารางเดินขนาด 2 เมตร — ผนังถูกสร้างอัตโนมัติที่ขอบพื้นที่เดินได้

// พื้นที่เดินได้ (x0, x1, z0, z1) — ต้องเป็นเลขคู่ให้ลงตาราง
const ROOMS = {
  tunnelA: [-2, 2, -8, 10],
  junction: [-8, 8, -16, -8],
  westCorr: [-14, -8, -14, -10],
  genRoom: [-24, -14, -18, -6],
  eastCorr: [8, 14, -14, -10],
  oreRoom: [14, 24, -18, -6],
  deepTunnel: [-2, 2, -26, -16],
  deepChamber: [-8, 8, -38, -26],
};

const WALL_H = 4, WALL_T = 0.6;

function cellWalkable(gx, gz) {
  const cx = gx * CELL + 1, cz = gz * CELL + 1;
  for (const [x0, x1, z0, z1] of Object.values(ROOMS)) {
    if (cx > x0 && cx < x1 && cz > z0 && cz < z1) return true;
  }
  return false;
}

export function buildWorld(scene, M) {
  const colliders = [];      // AABB {x0,x1,z0,z1}
  const camOccluders = [];   // mesh ที่กล้อง raycast เช็คไม่ให้ทะลุผนัง
  const dryGeos = [], wetGeos = [], rustGeos = [], dirtGeos = [];

  const box = (list, w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    list.push(g);
  };
  const addCollider = (x0, x1, z0, z1) => colliders.push({ x0, x1, z0, z1 });

  // ---------- ผนัง + เพดานเหมืองจากตารางเดิน ----------
  for (let gx = -16; gx <= 16; gx++) {
    for (let gz = -20; gz <= 5; gz++) {
      if (!cellWalkable(gx, gz)) continue;
      const x0 = gx * CELL, z0 = gz * CELL;
      const deep = z0 <= -26; // โซนลึกใช้หินเปียก
      const wallList = deep ? wetGeos : dryGeos;
      if (!cellWalkable(gx - 1, gz)) {
        box(wallList, WALL_T, WALL_H, CELL, x0 - WALL_T / 2, WALL_H / 2, z0 + 1);
        addCollider(x0 - WALL_T, x0, z0, z0 + CELL);
      }
      if (!cellWalkable(gx + 1, gz)) {
        box(wallList, WALL_T, WALL_H, CELL, x0 + CELL + WALL_T / 2, WALL_H / 2, z0 + 1);
        addCollider(x0 + CELL, x0 + CELL + WALL_T, z0, z0 + CELL);
      }
      if (!cellWalkable(gx, gz - 1)) {
        box(wallList, CELL + WALL_T * 2, WALL_H, WALL_T, x0 + 1, WALL_H / 2, z0 - WALL_T / 2);
        addCollider(x0, x0 + CELL, z0 - WALL_T, z0);
      }
      // ขอบ z=10 คือปากอุโมงค์เปิดสู่ชายหาด — ห้ามสร้างผนังปิด
      if (!cellWalkable(gx, gz + 1) && (gz + 1) * CELL < 10) {
        box(wallList, CELL + WALL_T * 2, WALL_H, WALL_T, x0 + 1, WALL_H / 2, z0 + CELL + WALL_T / 2);
        addCollider(x0, x0 + CELL, z0 + CELL, z0 + CELL + WALL_T);
      }
      // เพดานเฉพาะในเหมือง (นอกช่วงประตูหน้าผา) — ใช้หินเปียก ให้ความรู้สึกชื้น
      if (z0 + CELL <= 6) {
        const c = new THREE.PlaneGeometry(CELL, CELL);
        c.rotateX(Math.PI / 2); // หันหน้าลง
        c.translate(x0 + 1, WALL_H, z0 + 1);
        wetGeos.push(c);
      }
    }
  }

  // ---------- หน้าผาและทางเข้าเหมือง ----------
  box(dryGeos, 58, 12, 4, -31, 6, 8);   // ผาซ้าย  x[-60,-2]
  box(dryGeos, 58, 12, 4, 31, 6, 8);    // ผาขวา   x[2,60]
  box(dryGeos, 4, 8.5, 4, 0, 7.75, 8);  // ทับหลังเหนือช่องประตู y[3.5,12]
  addCollider(-60, -2, 6, 10);
  addCollider(2, 60, 6, 10);

  // ---------- พื้น ----------
  for (const [x0, x1, z0, z1] of Object.values(ROOMS)) {
    const f = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    f.rotateX(-Math.PI / 2);
    f.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    dirtGeos.push(f);
  }
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), M.sand);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, -0.01, 25);
  sand.receiveShadow = true;
  scene.add(sand);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(80, 14), M.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.14, 39);
  scene.add(water);

  // ขอบเขตชายหาด (collider ล่องหน)
  addCollider(-36, -34, 6, 40);
  addCollider(34, 36, 6, 40);
  addCollider(-36, 36, 37, 40);

  // ---------- รางรถแร่ + รถแร่ (เหล็กสนิม) ----------
  box(rustGeos, 0.12, 0.12, 30, -0.7, 0.1, -12);
  box(rustGeos, 0.12, 0.12, 30, 0.7, 0.1, -12);
  for (let z = -26; z <= 2; z += 2) box(rustGeos, 1.8, 0.08, 0.25, 0, 0.05, z);
  // ตัวรถแร่จอดเสียข้างทางแยก
  box(rustGeos, 1.5, 0.8, 1.0, 5, 0.75, -13);
  box(rustGeos, 1.7, 0.12, 1.2, 5, 0.3, -13);
  addCollider(4.1, 5.9, -13.7, -12.3);

  // ---------- merge เป็น mesh เดียวต่อวัสดุ (Static Batching) ----------
  const addMerged = (geos, mat, { shadow = true } = {}) => {
    if (!geos.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    camOccluders.push(mesh);
    return mesh;
  };
  addMerged(dryGeos, M.rockDry);
  addMerged(wetGeos, M.rockWet);
  addMerged(rustGeos, M.metalRust);
  const dirtMesh = addMerged(dirtGeos, M.dirt, { shadow: false });
  dirtMesh.castShadow = false;

  // ---------- โครงไม้ค้ำอุโมงค์ (GPU Instancing) ----------
  const frameZ = [3, -1, -5, -18, -22];
  const sideFrames = [[-11, -12], [11, -12]]; // ทางเดินซ้าย/ขวา หมุน 90°
  const postGeo = new THREE.BoxGeometry(0.28, 3.6, 0.28);
  postGeo.translate(0, 1.8, 0);
  const beamGeo = new THREE.BoxGeometry(4.4, 0.3, 0.34);
  const posts = new THREE.InstancedMesh(postGeo, M.woodOld, frameZ.length * 2 + sideFrames.length * 2);
  const beams = new THREE.InstancedMesh(beamGeo, M.woodOld, frameZ.length + sideFrames.length);
  const m4 = new THREE.Matrix4();
  let pi = 0, bi = 0;
  for (const z of frameZ) {
    posts.setMatrixAt(pi++, m4.makeTranslation(-1.75, 0, z));
    posts.setMatrixAt(pi++, m4.makeTranslation(1.75, 0, z));
    beams.setMatrixAt(bi++, m4.makeTranslation(0, 3.55, z));
  }
  for (const [x, z] of sideFrames) {
    posts.setMatrixAt(pi++, m4.makeTranslation(x, 0, z - 1.75));
    posts.setMatrixAt(pi++, m4.makeTranslation(x, 0, z + 1.75));
    m4.makeRotationY(Math.PI / 2).setPosition(x, 3.55, z);
    beams.setMatrixAt(bi++, m4);
  }
  posts.castShadow = beams.castShadow = true;
  scene.add(posts, beams);

  // ---------- หินชายหาด (ตัวอย่าง LOD 3 ระดับ) ----------
  const rockPositions = [
    [-14, 14, 1.4], [12, 18, 1.0], [-24, 24, 2.0], [22, 28, 1.6], [-6, 30, 0.9],
    [28, 14, 1.2], [-30, 18, 1.1], [6, 33, 1.3], [18, 33, 0.8], [-19, 32, 1.5],
  ];
  for (const [x, z, s] of rockPositions) {
    const lod = new THREE.LOD();
    for (const [detail, dist] of [[2, 0], [1, 18], [0, 38]]) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, detail), M.rockDry);
      m.castShadow = true;
      lod.addLevel(m, dist);
    }
    lod.position.set(x, s * 0.35, z);
    lod.rotation.y = x * 1.7;
    scene.add(lod);
    addCollider(x - s * 0.8, x + s * 0.8, z - s * 0.8, z + s * 0.8);
  }

  // ---------- เครื่องปั่นไฟ (hero asset — เหล็กทาสี 1024) ----------
  const gen = new THREE.Group();
  const genBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.2), M.metalPainted);
  genBody.position.y = 0.9;
  const genBase = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.25, 1.5), M.metalRust);
  genBase.position.y = 0.12;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 8), M.metalRust);
  pipe.position.set(0.8, 1.9, 0.3);
  const genLightMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2200, emissiveIntensity: 0.8 }));
  genLightMesh.position.set(-0.9, 1.65, 0.4);
  gen.add(genBody, genBase, pipe, genLightMesh);
  gen.position.set(-19, 0, -12);
  gen.traverse((o) => { o.castShadow = true; });
  scene.add(gen);
  addCollider(-20.3, -17.7, -12.8, -11.2);

  // ---------- หลอดไฟในเหมือง (ติดเมื่อเปิดเครื่องปั่นไฟ) ----------
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x554422, emissive: 0xffc873, emissiveIntensity: 0 });
  const lampSpots = [[0, -12], [-19, -11], [19, -12], [0, -32], [0, -1]];
  const lampLights = [];
  for (const [x, z] of lampSpots) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), lampMat);
    bulb.position.set(x, 3.6, z);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), M.metalRust);
    wire.position.set(x, 3.85, z);
    scene.add(bulb, wire);
    const light = new THREE.PointLight(0xffc873, 0, 13, 2); // intensity 0 จนกว่าจะเปิดเครื่อง
    light.position.set(x, 3.4, z);
    scene.add(light);
    lampLights.push(light);
  }

  // ---------- ของเก็บได้ ----------
  const interactables = [];
  const batteryMat = new THREE.MeshStandardMaterial({ color: 0xf2c520, emissive: 0xaa7700, emissiveIntensity: 0.5, roughness: 0.5 });
  const batterySpots = [[1.1, 1.5], [-21.5, -8.5]];
  for (const [x, z] of batterySpots) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.4, 0.24), batteryMat);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), M.metalRust);
    cap.position.y = 0.24;
    b.add(cap);
    b.position.set(x, 0.55, z);
    scene.add(b);
    interactables.push({ type: 'battery', mesh: b, x, z, radius: 1.6, taken: false, spin: true });
  }

  const oreSpots = [[20, -13.5], [-4.5, -33], [5, -30.5]];
  for (const [x, z] of oreSpots) {
    const cluster = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + (i % 2) * 0.14, 0), M.oreCrystal);
      c.position.set(Math.sin(i * 2.4) * 0.4, 0.25 + i * 0.12, Math.cos(i * 2.4) * 0.4);
      c.rotation.set(i, i * 2, 0);
      cluster.add(c);
    }
    cluster.position.set(x, 0, z);
    scene.add(cluster);
    interactables.push({ type: 'ore', mesh: cluster, x, z, radius: 1.8, taken: false });
  }

  interactables.push({ type: 'generator', mesh: gen, x: -19, z: -11, radius: 2.4, taken: false });

  // ---------- checkpoint ----------
  const checkpoints = [];
  const cpMatOff = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x2266ff, emissiveIntensity: 0.4 });
  for (const [x, z] of [[0, 7], [0, -12]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 24), cpMatOff.clone());
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.05, z);
    scene.add(ring);
    checkpoints.push({ x, z, radius: 1.6, mesh: ring, active: false });
  }

  // ---------- แสง ----------
  const hemi = new THREE.HemisphereLight(0x93b4d6, 0x74684f, 0.22);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9b0, 2.2);
  sun.position.set(35, 50, 55);
  sun.castShadow = true;
  sun.shadow.camera.left = -65; sun.shadow.camera.right = 65;
  sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  scene.background = new THREE.Color(0x31404f);
  scene.fog = new THREE.Fog(0x2a3745, 30, 110);

  function setGeneratorOn() {
    lampMat.emissiveIntensity = 2.2;
    genLightMesh.material.emissive.set(0x22ff44);
    for (const l of lampLights) l.intensity = 14;
  }

  return {
    colliders, camOccluders, interactables, checkpoints,
    sun, hemi, water, setGeneratorOn,
    // โซนเกม: ในเหมือง = หลังแนวหน้าผา, ชายหาด = พ้นออกมาแล้ว
    isInsideMine: (p) => p.z < 6,
    isOnBeach: (p) => p.z > 10,
    spawn: { x: 0, z: 16 },
  };
}
