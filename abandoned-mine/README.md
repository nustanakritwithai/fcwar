# ⛏ Abandoned Mine — Mobile Realistic PBR Prototype (Three.js)

โปรเจกต์เรียนรู้การทำเกมกราฟิก **PBR สมจริงบนมือถือ** ด้วย Three.js
แยกเป็นอิสระจากเกม Faction War Arena ในโฟลเดอร์อื่นของ repo นี้ทั้งหมด
(ใช้แค่ dependency `three` ร่วมกัน)

เกมสำรวจบุคคลที่สาม เล่นจบใน 5–10 นาที: เริ่มที่ชายหาด → เข้าเหมืองร้าง →
หาแบตเตอรี่ไฟฉาย → สตาร์ทเครื่องปั่นไฟ → เก็บแร่เรืองแสง 3 ก้อน →
กลับออกมาก่อนออกซิเจนหมด

## วิธีรัน

```bash
npm install
npm run mine          # เปิด http://localhost:3001/abandoned-mine/
npm run mine:test     # เทสต์ gameplay logic (node:test, ไม่ต้องใช้เบราว์เซอร์)
npm run mine:check    # เช็ค syntax ทุกไฟล์
```

ทดสอบบนมือถือจริง: ให้โทรศัพท์อยู่ Wi-Fi เดียวกับเครื่อง แล้วเปิด
`http://<ip เครื่องคุณ>:3001/abandoned-mine/` — เกมนี้เป็นเว็บล้วน
ไม่ต้อง build APK ก็วัดประสิทธิภาพบน Android ได้ทันที (เปิดปุ่ม STATS มุมขวาบน)

## ทำไมสเปกต้นแบบ (Unity/URP) ถึงแปลงมาเป็น Three.js แบบนี้

สเปกที่ได้มาเขียนสำหรับ Unity แต่แนวคิดเบื้องหลังเป็นสากล —
ตารางนี้คือ "พจนานุกรม" ที่ใช้แปลง และชี้ว่าแต่ละอย่างอยู่ไฟล์ไหน:

| แนวคิดใน Unity/URP | ใน Three.js (โปรเจกต์นี้) | ดูได้ที่ |
|---|---|---|
| URP Lit material (PBR) | `MeshStandardMaterial` + map/normalMap/roughnessMap/metalness | `src/materials.js` |
| Texture: Base Color, Normal, Roughness | สร้างแบบ procedural จาก height field เดียวกัน, tile ไร้รอยต่อ | `src/textures.js` |
| Static Batching | `mergeGeometries()` รวมผนัง/เพดาน/รางเป็น 1 mesh ต่อวัสดุ | `src/world.js` |
| GPU Instancing | `InstancedMesh` โครงไม้ค้ำอุโมงค์ทุกอัน = 1 draw call | `src/world.js` |
| LOD Group | `THREE.LOD` หินชายหาด 3 ระดับ (สลับตามระยะกล้อง) | `src/world.js` |
| Baked Lighting / Light Probe | คุณภาพ Low ใช้ `shadowMap.autoUpdate=false` = อบเงาแดดครั้งเดียว | `src/main.js` |
| Occlusion Culling | ไม่มี built-in — ใช้การออกแบบแทน: เหมืองมืดสนิท (เงาแดด + เพดานบัง) สิ่งที่มองไม่เห็นแทบไม่มี overdraw | `src/world.js` |
| Frustum Culling | three.js ทำให้อัตโนมัติต่อ mesh (เหตุผลหนึ่งที่ไม่ merge ทั้งฉากเป็นก้อนเดียว) | — |
| Post-processing (ACES tonemap) | `renderer.toneMapping = ACESFilmicToneMapping` — ฟรีเกือบ 100% เพราะทำใน main pass | `src/main.js` |
| Quality Settings | เมนู Low/Medium/High: pixelRatio cap + ขนาด/ชนิด shadow map | `src/main.js` |
| Frame Debugger / Stats | `renderer.info` → FPS, draw calls, triangles, memory บน HUD | `src/main.js` |
| CharacterController + Cinemachine | คอนโทรลเลอร์เอง (วงกลมชน AABB) + กล้อง raycast กันทะลุผนัง | `src/player.js` |

## สิ่งที่อยากให้สังเกตเป็นพิเศษ (บทเรียน PBR)

1. **"เปียก" ใน PBR ไม่ใช่การเพิ่มความมันวาวตรง ๆ** — ดูวัสดุ `rockWet` ใน
   `materials.js`: ความเปียกคือ albedo เข้มลง + roughness ต่ำลงเป็นหย่อม ๆ
2. **ทุก map ต้องมาจากแหล่งเดียวกัน** — `textures.js` สร้าง albedo, normal,
   roughness จาก height field เดียวกัน รอยนูนกับเงาสะท้อนจึงตรงกันเสมอ
   ถ้าซื้อ/โหลด texture มาใช้ ให้เลือกชุดที่มาจาก scan เดียวกันด้วยเหตุผลนี้
3. **ความมืดคือเครื่องมือ optimize** — เกมนี้จำกัดไฟ real-time ตามงบ:
   แดด 1 ดวง (มีเงา) + ไฟฉาย 1 spot (เงาเฉพาะ High) + หลอดไฟ 5 point (ไม่มีเงา)
   ในเหมืองมืดจึงทั้ง "สมจริง" และ "ถูก" พร้อมกัน
4. **Emissive ไม่ใช่แสงจริง** — แร่คริสตัลกับหลอดไฟเรืองแสงด้วย emissive
   (ฟรี ไม่มีต้นทุนไฟ) แล้วเสริม point light เฉพาะจุดที่จำเป็น
5. **Tone mapping คือครึ่งหนึ่งของลุค "สมจริง"** — ลองปิด
   `ACESFilmicToneMapping` ใน `main.js` ดูแล้วเทียบ จะเห็นว่าภาพแบนลงทันที

## งบประมาณประสิทธิภาพ (มือถือ Android ระดับกลาง)

- เป้า 45 FPS ต่ำสุด 30 — ฉากปัจจุบันใช้ ~35–50 draw calls, ~40k triangles
- Texture ส่วนใหญ่ 512, hero asset (เครื่องปั่นไฟ) 1024 — ดู `materials.js`
- โปร่งใสมีชิ้นเดียวทั้งเกม (ผิวน้ำ) — โปร่งใสแพงเพราะ overdraw
- antialias ปิดถาวร คุมความคมด้วย pixelRatio ต่อระดับคุณภาพแทน (ถูกกว่า MSAA)
- เงา real-time: แดดเท่านั้น (Low = อบครั้งเดียว), ไฟฉาย 512px เฉพาะ High

## โครงสร้างโค้ด

```text
abandoned-mine/
  index.html        เชลล์เกม, HUD, ปุ่มสัมผัส, เมนู, import map
  server.js         static server เล็ก ๆ (เสิร์ฟเกม + node_modules/three)
  src/textures.js   สร้าง texture PBR แบบ procedural (albedo/normal/roughness)
  src/materials.js  วัสดุ 10 ชนิด: ทราย หินแห้ง หินเปียก ดิน ไม้เก่า
                    เหล็กสนิม เหล็กทาสี น้ำ แร่คริสตัล กระจกไฟฉาย
  src/world.js      สร้างฉากทั้งหมด + collider + interactable + แสง
  src/player.js     third-person controller + กล้องติดตาม + ไฟฉาย
  src/input.js      คีย์บอร์ด/เมาส์ + virtual joystick + ปุ่มสัมผัส
  src/logic.js      กติกาเกมล้วน ๆ (ออกซิเจน แบต แร่ checkpoint แพ้ชนะ)
  src/hud.js        วาด HUD ลง DOM (ถูกกว่าวาดใน WebGL)
  src/main.js       bootstrap, game loop, ระบบคุณภาพ, ตัววัดประสิทธิภาพ
  tests/logic.test.js   เทสต์ gameplay loop จบเกมได้ (node:test)
  tools/e2e.mjs         เทสต์เล่นจริงในเบราว์เซอร์ด้วย Playwright (ตัวเลือก)
```

## แผนพัฒนาต่อ (Phase ที่เหลือ)

สถานะปัจจุบัน: Phase 1–2 ครบ (greybox+ เล่นจบได้), Phase 3–5 ทำแบบ
procedural แล้วบางส่วน (วัสดุ PBR, แสง, LOD/instancing/merge)

- **Phase 3 ต่อ**: เปลี่ยน primitive เป็นโมเดล glTF จริง (แนะนำ Blender →
  glTF + `KHR_texture_basisu`/KTX2 เพื่อบีบ texture ลง GPU memory)
- **Phase 4 ต่อ**: อบ lightmap จาก Blender ใส่เป็น `lightMap` แทนที่จะพึ่ง
  เงา real-time, เพิ่มอนุภาคฝุ่น/หยดน้ำเบา ๆ
- **Phase 5 ต่อ**: วัดด้วย Chrome DevTools → More tools → Rendering →
  Frame Rendering Stats บนมือถือจริงผ่าน `chrome://inspect`
- **Phase 6**: ห่อเป็นแอปด้วย PWA (เพิ่ม manifest) หรือ Capacitor ถ้าต้องลง Play Store
