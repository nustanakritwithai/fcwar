// Third-person character controller + follow camera
// - เดิน/วิ่ง/กระโดดสัมพันธ์กับทิศกล้อง (มาตรฐานเกม third-person)
// - ชนผนังแบบวงกลม-ชน-AABB แยกแกน x/z ให้ไถลตามผนังได้
// - กล้อง raycast กันทะลุผนัง (แทน camera collision ของ Cinemachine)
import * as THREE from 'three';

const WALK = 3.2, RUN = 5.6, JUMP_VY = 5.2, GRAVITY = -13;
const RADIUS = 0.42;

export function createPlayer(scene, M) {
  const group = new THREE.Group();

  // ตัวละครประกอบจาก primitive — พอสำหรับ prototype (Phase 3 ค่อยเปลี่ยนเป็นโมเดลจริง)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 10), M.cloth);
  torso.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), M.skin);
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.helmet);
  helmet.position.y = 1.66;
  const mkLimb = (x, y, len) => {
    const limb = new THREE.Group();
    const g = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, len, 4, 8), M.cloth);
    g.position.y = -len / 2;
    limb.add(g);
    limb.position.set(x, y, 0);
    return limb;
  };
  const legL = mkLimb(-0.15, 0.62, 0.45);
  const legR = mkLimb(0.15, 0.62, 0.45);
  const armL = mkLimb(-0.36, 1.35, 0.4);
  const armR = mkLimb(0.36, 1.35, 0.4);

  // ไฟฉายถือในมือขวา + SpotLight (ไฟ real-time ดวงหลักของเกมตามงบ)
  const torch = new THREE.Group();
  const torchBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 8), M.metalPainted);
  torchBody.rotation.x = Math.PI / 2;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), M.glass);
  lens.position.z = 0.125;
  torch.add(torchBody, lens);
  torch.position.set(0.36, 1.15, 0.25);
  torch.visible = false;

  const flashlight = new THREE.SpotLight(0xfff1c4, 0, 26, 0.42, 0.45, 1.6);
  flashlight.position.set(0.36, 1.3, 0.2);
  const flashTarget = new THREE.Object3D();
  flashTarget.position.set(0.2, 0.9, -10);
  flashlight.target = flashTarget;
  flashlight.shadow.mapSize.set(512, 512);
  flashlight.shadow.bias = -0.002;

  group.add(torso, head, helmet, legL, legR, armL, armR, torch, flashlight, flashTarget);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(group);

  const P = {
    group, flashlight, torch,
    pos: new THREE.Vector3(0, 0, 16),
    vy: 0,
    grounded: true,
    yaw: Math.PI,          // ตัวละครหันหน้าเข้าเหมือง (-z)
    camYaw: 0,             // กล้องอยู่ฝั่งทะเล มองเข้าหาเหมือง
    camPitch: 0.28,
    moving: false, running: false,
    walkCycle: 0,
  };

  const ray = new THREE.Raycaster();

  P.update = (dt, input, world, camera) => {
    // ---- หมุนกล้องจาก input ลาก ----
    P.camYaw -= input.lookDX * 0.005;
    P.camPitch = THREE.MathUtils.clamp(P.camPitch + input.lookDY * 0.004, -0.15, 1.1);

    // ---- เคลื่อนที่สัมพัทธ์กล้อง ----
    const mx = input.moveX, mz = input.moveZ;
    P.moving = Math.hypot(mx, mz) > 0.12;
    P.running = P.moving && input.running;
    if (P.moving) {
      const speed = (P.running ? RUN : WALK) * Math.min(1, Math.hypot(mx, mz));
      const sin = Math.sin(P.camYaw), cos = Math.cos(P.camYaw);
      const dx = (mx * cos - mz * sin) * speed * dt;
      const dz = (mz * cos + mx * sin) * speed * dt;
      moveWithCollision(P.pos, dx, dz, world.colliders);
      const targetYaw = Math.atan2(dx, dz);
      let d = targetYaw - P.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      P.yaw += d * Math.min(1, dt * 12);
    }

    // ---- กระโดด/แรงโน้มถ่วง (พื้นราบ y=0 ทั้งฉาก) ----
    if (input.jumpPressed && P.grounded) { P.vy = JUMP_VY; P.grounded = false; }
    P.vy += GRAVITY * dt;
    P.pos.y += P.vy * dt;
    if (P.pos.y <= 0) { P.pos.y = 0; P.vy = 0; P.grounded = true; }

    group.position.copy(P.pos);
    group.rotation.y = P.yaw;

    // ---- อนิเมชันเดินแบบ procedural ----
    P.walkCycle += dt * (P.running ? 11 : 7) * (P.moving ? 1 : 0);
    const swing = P.moving ? Math.sin(P.walkCycle) * (P.running ? 0.7 : 0.45) : 0;
    legL.rotation.x = swing; legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8; armR.rotation.x = swing * 0.8;
    torso.position.y = 1.0 + (P.moving ? Math.abs(Math.cos(P.walkCycle)) * 0.04 : 0);

    // ---- กล้องติดตาม + กันทะลุผนัง ----
    const headPos = new THREE.Vector3(P.pos.x, P.pos.y + 1.6, P.pos.z);
    const dist = 4.4;
    const off = new THREE.Vector3(
      Math.sin(P.camYaw) * Math.cos(P.camPitch),
      Math.sin(P.camPitch),
      Math.cos(P.camYaw) * Math.cos(P.camPitch),
    );
    const desired = headPos.clone().addScaledVector(off, dist);
    ray.set(headPos, off);
    ray.far = dist;
    const hits = ray.intersectObjects(world.camOccluders, false);
    const d = hits.length ? Math.max(0.5, hits[0].distance - 0.25) : dist;
    camera.position.copy(headPos).addScaledVector(off, d);
    camera.lookAt(headPos.x, headPos.y + 0.15, headPos.z);
  };

  P.setFlashlight = (on, quality) => {
    flashlight.intensity = on ? 60 : 0;
    flashlight.castShadow = on && quality === 'high';
    torch.visible = on;
    M.glass.emissiveIntensity = on ? 1.5 : 0;
  };

  P.teleport = (x, z) => { P.pos.set(x, 0, z); P.vy = 0; };

  return P;
}

// ชนแบบวงกลมกับกล่อง AABB — ขยับทีละแกนเพื่อให้ไถลตามผนัง
function moveWithCollision(pos, dx, dz, colliders) {
  pos.x += dx;
  for (const c of colliders) {
    if (pos.x > c.x0 - RADIUS && pos.x < c.x1 + RADIUS && pos.z > c.z0 - RADIUS && pos.z < c.z1 + RADIUS) {
      pos.x = dx > 0 ? c.x0 - RADIUS : c.x1 + RADIUS;
    }
  }
  pos.z += dz;
  for (const c of colliders) {
    if (pos.x > c.x0 - RADIUS && pos.x < c.x1 + RADIUS && pos.z > c.z0 - RADIUS && pos.z < c.z1 + RADIUS) {
      pos.z = dz > 0 ? c.z0 - RADIUS : c.z1 + RADIUS;
    }
  }
}
