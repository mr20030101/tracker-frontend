/**
 * Office Assets — low-poly 3D kit for a virtual office (three.js r128+)
 * Types live in officeAssets.d.ts.
 * Units: 1 = 1 metre. Everything faces +Z. Origin sits on the floor.
 *
 * Usage (ES module):
 *   import * as THREE from 'three';
 *   import { createOfficeAssets } from './office-assets.js';
 *   const A = createOfficeAssets(THREE);
 *   scene.add(A.createDeskPod({ seated: [true, true, false, true] }));
 *   const p = A.createPerson({ gender: 'woman', hair: 'bun', eyes: 'happy', mouth: 'grin' });
 *   scene.add(p);  // then call A.animatePerson(p, time, 'walk') each frame
 */
export function createOfficeAssets(THREE) {
  // ---------- palette ----------
  const C = {
    yellow: 0xf2b705, yellowSoft: 0xf7d774, greyDark: 0x3b3f45, grey: 0x6b7178,
    greyMid: 0x9aa0a6, greyLight: 0xd9dce0, white: 0xf6f7f8, black: 0x1d1f22,
    screen: 0x22262b, wood: 0xd8c3a0, green: 0x4f9a5a, greenDark: 0x3a7a45,
    pot: 0xe9e4da, mouth: 0x6b2a36, blush: 0xf29c9c,
  };
  const SKIN = [0xffe0c7, 0xf5cba7, 0xe0ac82, 0xc68b5e, 0x9c6644, 0x6e4430];
  const HAIR = [0x1f1a17, 0x3b2a1f, 0x6b4a2b, 0xa4743f, 0xd9b36c, 0xb8b8b8, 0x7a2e2e, 0x2d3a5a];
  const SHIRT = [C.yellow, 0x4a6fa5, 0x6b7178, 0xe36b5a, 0x5aa37a, 0xf6f7f8, 0x8e6bbf, 0x2f3338, 0xf0a04b];
  const PANTS = [0x2f3338, 0x3d4f6e, 0x6b7178, 0x8a7a63, 0x1d1f22];

  const HAIR_STYLES = { man: ['short', 'buzz', 'spiky', 'side', 'curly', 'bald'], woman: ['long', 'bob', 'bun', 'ponytail', 'curly', 'side'] };
  const EYES = ['dot', 'happy', 'wide', 'sleepy', 'wink'];
  const MOUTHS = ['smile', 'grin', 'open', 'neutral', 'smirk'];
  const BROWS = ['soft', 'raised', 'focused', 'none'];
  const EXTRAS = ['none', 'glasses', 'blush', 'freckles', 'beard', 'mustache'];

  // ---------- helpers ----------
  const matCache = new Map();
  function mat(color, opts = {}) {
    const key = color + '|' + JSON.stringify(opts);
    if (!matCache.has(key)) {
      matCache.set(key, new THREE.MeshStandardMaterial(Object.assign(
        { color, roughness: 0.75, metalness: 0.02, flatShading: true }, opts)));
    }
    return matCache.get(key);
  }
  function mesh(geo, material, x = 0, y = 0, z = 0) {
    const o = new THREE.Mesh(geo, material);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    return o;
  }
  const box = (w, h, d, c, x, y, z, o) => mesh(new THREE.BoxGeometry(w, h, d), mat(c, o), x, y, z);
  const cyl = (rt, rb, h, c, x, y, z, seg = 16, o) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c, o), x, y, z);
  const sph = (r, c, x, y, z, seg = 16, o) => mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.75 | 0)), mat(c, o), x, y, z);

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  // three r152 replaced texture.encoding with texture.colorSpace; support both.
  function setSRGB(tex) {
    if ('SRGBColorSpace' in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
  }

  // =========================================================
  // FURNITURE
  // =========================================================
  function createDesk({ width = 1.2, depth = 0.7, height = 0.75, top = C.white, frame = C.greyDark } = {}) {
    const g = new THREE.Group(); g.name = 'desk';
    const t = 0.04;
    g.add(box(width, t, depth, top, 0, height - t / 2, 0));
    g.add(box(width - 0.02, 0.012, depth - 0.02, C.yellow, 0, height - t - 0.006, 0)); // yellow edge line
    for (const sx of [-1, 1]) {
      g.add(box(0.05, height - t, depth * 0.85, frame, sx * (width / 2 - 0.06), (height - t) / 2, 0));
      g.add(box(0.07, 0.02, depth * 0.9, frame, sx * (width / 2 - 0.06), 0.01, 0));
    }
    g.add(box(width - 0.16, 0.3, 0.02, frame, 0, height - 0.25, -depth / 2 + 0.08)); // modesty panel
    return g;
  }

  function createChair({ color = C.greyDark, accent = C.yellow, executive = false } = {}) {
    const g = new THREE.Group(); g.name = 'chair';
    // star base + wheels
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = box(0.26, 0.035, 0.05, C.black, Math.cos(a) * 0.13, 0.07, Math.sin(a) * 0.13);
      leg.rotation.y = -a; g.add(leg);
      g.add(sph(0.03, C.black, Math.cos(a) * 0.26, 0.03, Math.sin(a) * 0.26, 8));
    }
    g.add(cyl(0.025, 0.025, 0.3, C.greyMid, 0, 0.23, 0, 10, { metalness: 0.5, roughness: 0.3 }));
    g.add(box(0.48, 0.08, 0.46, color, 0, 0.42, 0));
    g.add(box(0.44, 0.02, 0.42, accent, 0, 0.465, 0));
    const back = new THREE.Group();
    back.add(box(0.44, executive ? 0.72 : 0.5, 0.06, color, 0, executive ? 0.41 : 0.3, 0));
    back.add(box(0.06, 0.2, 0.03, C.black, 0, 0.0, 0.01));
    if (executive) { back.add(box(0.3, 0.16, 0.08, color, 0, 0.84, 0.01)); back.add(box(0.36, 0.5, 0.02, accent, 0, 0.36, 0.035)); }
    back.position.set(0, 0.5, -0.22); back.rotation.x = -0.12; g.add(back);
    for (const sx of [-1, 1]) {
      g.add(box(0.04, 0.18, 0.04, C.black, sx * 0.24, 0.53, 0));
      g.add(box(0.07, 0.03, 0.26, color, sx * 0.24, 0.63, 0.02));
    }
    return g;
  }

  function screenTexture(accent = '#f2b705', seed = 1) {
    const r = rng(seed);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
    const x = cv.getContext('2d');
    x.fillStyle = '#23272d'; x.fillRect(0, 0, 256, 160);
    x.fillStyle = '#2f343b'; x.fillRect(0, 0, 50, 160);
    for (let i = 0; i < 5; i++) { x.fillStyle = i === 1 ? accent : '#4a5058'; x.fillRect(10, 16 + i * 22, 30, 8); }
    x.fillStyle = '#3a4048'; x.fillRect(62, 14, 180, 60);
    x.fillStyle = accent;
    for (let i = 0; i < 9; i++) { const h = 10 + r() * 40; x.fillRect(72 + i * 19, 68 - h, 11, h); }
    for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#5b626b' : '#8b929a'; x.fillRect(62, 86 + i * 16, 60 + r() * 120, 7); }
    const tex = new THREE.CanvasTexture(cv);
    setSRGB(tex);
    return tex;
  }

  function createMonitor({ seed = 1 } = {}) {
    const g = new THREE.Group(); g.name = 'monitor';
    g.add(box(0.26, 0.012, 0.16, C.greyDark, 0, 0.006, 0));
    g.add(box(0.05, 0.22, 0.03, C.greyDark, 0, 0.12, -0.03));
    g.add(box(0.58, 0.35, 0.03, C.black, 0, 0.36, 0));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.32),
      new THREE.MeshBasicMaterial({ map: screenTexture('#f2b705', seed) }));
    scr.position.set(0, 0.36, 0.016); g.add(scr);
    return g;
  }

  function createLaptop({ seed = 2 } = {}) {
    const g = new THREE.Group(); g.name = 'laptop';
    g.add(box(0.34, 0.015, 0.24, C.greyMid, 0, 0.0075, 0, { metalness: 0.4, roughness: 0.35 }));
    g.add(box(0.3, 0.002, 0.12, C.greyDark, 0, 0.016, -0.03));
    const lid = new THREE.Group();
    lid.add(box(0.34, 0.23, 0.01, C.greyMid, 0, 0.115, 0, { metalness: 0.4, roughness: 0.35 }));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), new THREE.MeshBasicMaterial({ map: screenTexture('#f2b705', seed) }));
    scr.position.set(0, 0.118, 0.006); lid.add(scr);
    lid.position.set(0, 0.015, -0.12); lid.rotation.x = -0.25; g.add(lid);
    return g;
  }

  function createKeyboard() {
    const g = new THREE.Group(); g.name = 'keyboard';
    g.add(box(0.42, 0.018, 0.14, C.greyDark, 0, 0.009, 0));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++)
      g.add(box(0.026, 0.008, 0.024, r === 3 && c > 3 && c < 8 ? C.greyMid : C.greyLight, -0.176 + c * 0.032, 0.021, -0.045 + r * 0.03));
    const mouse = sph(0.03, C.greyDark, 0.29, 0.012, 0.02, 10); mouse.scale.set(0.8, 0.45, 1.2);
    g.add(mouse);
    return g;
  }

  function createMug({ color = C.yellow } = {}) {
    const g = new THREE.Group(); g.name = 'mug';
    g.add(cyl(0.04, 0.035, 0.1, color, 0, 0.05, 0, 12));
    g.add(cyl(0.034, 0.034, 0.005, 0x4a2e1f, 0, 0.098, 0, 12));
    const h = mesh(new THREE.TorusGeometry(0.025, 0.008, 6, 12), mat(color), 0.045, 0.05, 0);
    g.add(h); return g;
  }

  function createPlant({ size = 1, seed = 3 } = {}) {
    const r = rng(seed);
    const g = new THREE.Group(); g.name = 'plant';
    g.add(cyl(0.2 * size, 0.15 * size, 0.35 * size, C.pot, 0, 0.175 * size, 0, 10));
    g.add(cyl(0.2 * size, 0.2 * size, 0.03 * size, C.yellow, 0, 0.34 * size, 0, 10));
    for (let i = 0; i < 7; i++) {
      const leaf = mesh(new THREE.ConeGeometry(0.07 * size, 0.5 * size, 5), mat(i % 2 ? C.green : C.greenDark));
      const a = (i / 7) * Math.PI * 2 + r();
      leaf.position.set(Math.cos(a) * 0.07 * size, 0.55 * size, Math.sin(a) * 0.07 * size);
      leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(leaf);
    }
    g.add(mesh(new THREE.IcosahedronGeometry(0.16 * size, 0), mat(C.green), 0, 0.5 * size, 0));
    return g;
  }

  function createSofa({ length = 2, color = C.greyMid, cushion = C.yellowSoft } = {}) {
    const g = new THREE.Group(); g.name = 'sofa';
    g.add(box(length, 0.25, 0.8, color, 0, 0.2, 0));
    g.add(box(length, 0.45, 0.2, color, 0, 0.5, -0.3));
    for (const sx of [-1, 1]) g.add(box(0.18, 0.35, 0.8, color, sx * (length / 2 - 0.09), 0.42, 0));
    const n = Math.max(2, Math.round(length / 0.8));
    const w = (length - 0.4) / n;
    for (let i = 0; i < n; i++) {
      g.add(box(w - 0.03, 0.12, 0.55, C.greyLight, -length / 2 + 0.2 + w * (i + 0.5), 0.38, 0.06));
    }
    const p = box(0.3, 0.28, 0.1, cushion, -length / 2 + 0.38, 0.55, -0.15); p.rotation.set(-0.2, 0.2, 0.1); g.add(p);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.03, 0.02, 0.08, C.black, sx * (length / 2 - 0.1), 0.04, sz * 0.3, 6));
    return g;
  }

  function createCoffeeTable({ radius = 0.5 } = {}) {
    const g = new THREE.Group(); g.name = 'coffee-table';
    g.add(cyl(radius, radius, 0.04, C.wood, 0, 0.42, 0, 24));
    g.add(cyl(0.04, 0.04, 0.4, C.greyDark, 0, 0.2, 0, 8));
    g.add(cyl(0.25, 0.25, 0.02, C.greyDark, 0, 0.01, 0, 16));
    const m = createMug(); m.position.set(0.15, 0.44, 0.05); g.add(m);
    return g;
  }

  function createPantry({ width = 1.6 } = {}) {
    const g = new THREE.Group(); g.name = 'pantry';
    g.add(box(width, 0.9, 0.6, C.white, 0, 0.45, 0));
    g.add(box(width + 0.04, 0.04, 0.64, C.greyDark, 0, 0.92, 0));
    for (let i = 0; i < 3; i++) g.add(box(0.02, 0.2, 0.02, C.greyMid, -width / 2 + width * (i + 0.5) / 3, 0.7, 0.31));
    // coffee machine
    g.add(box(0.3, 0.38, 0.3, C.greyDark, -width / 2 + 0.3, 1.13, -0.05));
    g.add(box(0.26, 0.06, 0.1, C.yellow, -width / 2 + 0.3, 1.25, 0.12));
    const m = createMug({ color: C.white }); m.position.set(-width / 2 + 0.3, 0.94, 0.12); g.add(m);
    for (let i = 0; i < 3; i++) { const mg = createMug({ color: [C.yellow, C.greyMid, C.white][i] }); mg.position.set(0.1 + i * 0.14, 0.94, 0.05); g.add(mg); }
    return g;
  }

  function createDivider({ width = 2.44, color = C.greyLight } = {}) {
    const g = new THREE.Group(); g.name = 'divider';
    g.add(box(width, 0.4, 0.03, color, 0, 0.95, 0));
    g.add(box(width, 0.03, 0.04, C.yellow, 0, 1.16, 0));
    return g;
  }

  /** One seat: desk + computer + keyboard + chair. Person sits on +Z side facing -Z. */
  function createWorkstation({ seed = 1, laptop = false, mug = true, chairColor } = {}) {
    const g = new THREE.Group(); g.name = 'workstation';
    g.add(createDesk());
    const comp = laptop ? createLaptop({ seed }) : createMonitor({ seed });
    comp.position.set(0, 0.75, laptop ? 0.02 : -0.2); g.add(comp);
    if (!laptop) { const k = createKeyboard(); k.position.set(-0.04, 0.75, 0.12); g.add(k); }
    if (mug) { const m = createMug(); m.position.set(0.45, 0.75, -0.05); g.add(m); }
    const ch = createChair({ color: chairColor }); ch.rotation.y = Math.PI; ch.position.set(0, 0, 0.62); g.add(ch);
    g.userData.seat = new THREE.Vector3(0, 0, 0.64); // where a seated person goes
    return g;
  }

  /** 2×2 desk cluster like the floor plan. Returns group with userData.seats (world-local) */
  function createDeskPod({ seed = 1 } = {}) {
    const g = new THREE.Group(); g.name = 'desk-pod';
    const seats = [];
    const spots = [[-0.61, 0.36, 0], [0.61, 0.36, 0], [-0.61, -0.36, Math.PI], [0.61, -0.36, Math.PI]];
    spots.forEach(([x, z, ry], i) => {
      const ws = createWorkstation({ seed: seed * 7 + i, laptop: (seed + i) % 5 === 0 });
      ws.position.set(x, 0, z); ws.rotation.y = ry; g.add(ws);
      const s = ws.userData.seat.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ry).add(new THREE.Vector3(x, 0, z));
      seats.push({ position: s, rotationY: ry + Math.PI });
    });
    g.add(createDivider());
    g.userData.seats = seats;
    return g;
  }


  // =========================================================
  // PRIVATE OFFICE (Admin / Lead)
  // =========================================================
  function createExecDesk({ width = 1.8, depth = 0.85, seed = 9, nameplate = null } = {}) {
    const g = new THREE.Group(); g.name = 'exec-desk';
    const h = 0.76;
    g.add(box(width, 0.05, depth, C.wood, 0, h - 0.025, 0));
    g.add(box(width + 0.02, 0.012, depth + 0.02, C.greyDark, 0, h - 0.056, 0));
    // drawer pedestal (right) + panel leg (left) + modesty panel
    g.add(box(0.46, h - 0.06, depth - 0.08, C.greyDark, width / 2 - 0.27, (h - 0.06) / 2, 0));
    for (let i = 0; i < 3; i++) g.add(box(0.2, 0.02, 0.02, C.yellow, width / 2 - 0.27, 0.16 + i * 0.22, depth / 2 - 0.03));
    g.add(box(0.06, h - 0.06, depth - 0.08, C.greyDark, -width / 2 + 0.05, (h - 0.06) / 2, 0));
    g.add(box(width - 0.1, 0.45, 0.03, C.greyDark, 0, h - 0.3, -depth / 2 + 0.06));
    // two monitors, angled
    for (const s of [-1, 1]) {
      const m = createMonitor({ seed: seed + s }); m.position.set(s * 0.31, h, -0.2); m.rotation.y = -s * 0.22; g.add(m);
    }
    const k = createKeyboard(); k.position.set(-0.05, h, 0.14); g.add(k);
    const mug = createMug(); mug.position.set(width / 2 - 0.3, h, 0.18); g.add(mug);
    // lamp
    const lamp = new THREE.Group();
    lamp.add(cyl(0.07, 0.08, 0.02, C.greyDark, 0, 0.01, 0, 12));
    const arm = cyl(0.012, 0.012, 0.4, C.greyDark, 0, 0.2, 0, 6); arm.rotation.z = 0.25; lamp.add(arm);
    const shade = mesh(new THREE.ConeGeometry(0.08, 0.1, 12, 1, true), mat(C.yellow, { side: THREE.DoubleSide }), -0.07, 0.38, 0);
    shade.rotation.z = -0.5; lamp.add(shade);
    lamp.position.set(-width / 2 + 0.18, h, -0.2); g.add(lamp);
    if (nameplate) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.04), [mat(C.greyDark), mat(C.greyDark), mat(C.greyDark), mat(C.greyDark),
        new THREE.MeshBasicMaterial({ map: labelTexture(nameplate, '#2f3338', '#f2b705', 300, 70) }), mat(C.greyDark)]);
      plate.position.set(width / 2 - 0.25, h + 0.035, -depth / 2 + 0.08); plate.rotation.y = Math.PI; g.add(plate);
    }
    g.userData.seat = new THREE.Vector3(0, 0, 0.72);
    return g;
  }

  function labelTexture(text, bg = '#2f3338', fg = '#ffffff', w = 512, h = 128) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.fillStyle = fg; x.font = `700 ${Math.round(h * 0.5)}px Urbanist, "Segoe UI", system-ui, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2);
    const t = new THREE.CanvasTexture(cv); setSRGB(t); return t;
  }

  function createBookshelf({ width = 1.6, height = 1.9, seed = 5 } = {}) {
    const r = rng(seed);
    const g = new THREE.Group(); g.name = 'bookshelf';
    const d = 0.34, t = 0.04;
    for (const s of [-1, 1]) g.add(box(t, height, d, C.greyDark, s * (width / 2 - t / 2), height / 2, 0));
    g.add(box(width, height, 0.02, C.greyLight, 0, height / 2, -d / 2 + 0.01));
    const shelves = 5;
    for (let i = 0; i < shelves; i++) {
      const y = i * (height - t) / (shelves - 1) + t / 2;
      g.add(box(width - 2 * t, t, d, C.greyDark, 0, y, 0));
      if (i === shelves - 1) break;
      let x = -width / 2 + t + 0.03;
      const gapH = (height - t) / (shelves - 1) - t;
      while (x < width / 2 - t - 0.1) {
        if (r() < 0.12) { // ornament or gap
          if (r() < 0.5) { const pl = createPlant({ size: 0.35, seed: (r() * 99) | 0 }); pl.position.set(x + 0.08, y + t / 2, 0); g.add(pl); }
          x += 0.2; continue;
        }
        const bw = 0.03 + r() * 0.035, bh = gapH * (0.6 + r() * 0.3);
        const col = pick(r, [C.yellow, C.grey, C.greyMid, 0x4a6fa5, 0xe36b5a, 0x5aa37a, C.white, C.greyDark]);
        const b = box(bw, bh, d * 0.75, col, x + bw / 2, y + t / 2 + bh / 2, 0.02);
        if (r() < 0.1) b.rotation.z = 0.2;
        g.add(b); x += bw + 0.004;
      }
    }
    return g;
  }

  function createFilingCabinet({ drawers = 3 } = {}) {
    const g = new THREE.Group(); g.name = 'filing-cabinet';
    const h = drawers * 0.33;
    g.add(box(0.45, h, 0.55, C.greyMid, 0, h / 2, 0, { metalness: 0.3, roughness: 0.5 }));
    for (let i = 0; i < drawers; i++) {
      g.add(box(0.41, 0.3, 0.01, C.greyLight, 0, 0.165 + i * 0.33, 0.28));
      g.add(box(0.14, 0.025, 0.03, C.yellow, 0, 0.26 + i * 0.33, 0.29));
    }
    return g;
  }

  function createWhiteboard({ width = 1.6, height = 0.95 } = {}) {
    const g = new THREE.Group(); g.name = 'whiteboard';
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 300;
    const x = cv.getContext('2d');
    x.fillStyle = '#fbfbfc'; x.fillRect(0, 0, 512, 300);
    x.lineWidth = 6; x.lineCap = 'round';
    x.strokeStyle = '#2f3338'; x.strokeRect(40, 40, 120, 70); x.strokeRect(220, 40, 120, 70); x.strokeRect(130, 180, 120, 70);
    x.strokeStyle = '#f2b705'; x.beginPath(); x.moveTo(160, 75); x.lineTo(220, 75); x.moveTo(100, 110); x.lineTo(160, 180); x.moveTo(280, 110); x.lineTo(230, 180); x.stroke();
    x.strokeStyle = '#6b7178'; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(380, 50 + i * 30); x.lineTo(470 - i * 12, 50 + i * 30); x.stroke(); }
    const tex = new THREE.CanvasTexture(cv); setSRGB(tex);
    g.add(box(width + 0.06, height + 0.06, 0.03, C.greyMid, 0, 0, 0));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
    board.position.z = 0.017; g.add(board);
    g.add(box(width * 0.6, 0.03, 0.08, C.greyMid, 0, -height / 2 - 0.02, 0.04));
    g.add(box(0.12, 0.02, 0.02, C.yellow, -0.2, -height / 2, 0.06));
    return g;
  }

  /** Glass wall along X, centred on origin. door: { at: x-centre, width } leaves an opening. */
  function createGlassWall({ length = 4, height = 2.4, door = null } = {}) {
    const g = new THREE.Group(); g.name = 'glass-wall';
    const glass = mat(0xbfdbe6, { transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.1, metalness: 0.1, flatShading: false });
    const frost = mat(C.yellow, { transparent: true, opacity: 0.55, depthWrite: false });
    const segs = door ? [[-length / 2, door.at - door.width / 2], [door.at + door.width / 2, length / 2]] : [[-length / 2, length / 2]];
    for (const [a, b] of segs) {
      const L = b - a; if (L < 0.02) continue; const cx = (a + b) / 2;
      const pane = mesh(new THREE.BoxGeometry(L, height - 0.1, 0.03), glass, cx, height / 2, 0); pane.castShadow = false; g.add(pane);
      const band = mesh(new THREE.BoxGeometry(L, 0.12, 0.035), frost, cx, 1.15, 0); band.castShadow = false; g.add(band);
      const base = box(L, 0.08, 0.07, C.greyDark, cx, 0.04, 0); g.add(base);
      const col = box(L, 0.1, 0.12, C.greyDark, cx, height, 0); col.userData.collider = false; g.add(col);
      [pane, base].forEach(m => m.userData.collider = true);
      const n = Math.max(1, Math.round(L / 1.3));
      for (let i = 0; i <= n; i++) g.add(box(0.05, height, 0.08, C.greyDark, a + (L * i) / n, height / 2, 0));
    }
    if (door) g.add(box(door.width, 0.1, 0.12, C.greyDark, door.at, height, 0)); // header above door
    return g;
  }

  /**
   * A closed glass office with its own door.
   * variant: 'admin' (filing cabinets, lounge chair) | 'lead' (whiteboard, small meeting table)
   * Door is on the +Z wall. userData.seat = { position, rotationY } for the occupant (local coords),
   * userData.bounds = Box3 (local) for "who is inside" checks. Wall meshes have userData.collider = true.
   */
  function createPrivateOffice({ width = 4.4, depth = 5.6, height = 2.4, title = 'Admin', variant = 'admin', seed = 21, doorAt = 1.0, rug = null } = {}) {
    const g = new THREE.Group(); g.name = 'private-office';
    const hw = width / 2, hd = depth / 2;
    const front = createGlassWall({ length: width, height, door: { at: doorAt, width: 1.05 } }); front.position.z = hd; g.add(front);
    const back = createGlassWall({ length: width, height }); back.position.z = -hd; g.add(back);
    for (const s of [-1, 1]) { const w = createGlassWall({ length: depth, height }); w.rotation.y = Math.PI / 2; w.position.x = s * hw; g.add(w); }
    // floor + rug
    const fl = mesh(new THREE.BoxGeometry(width, 0.02, depth), mat(0xe9e6df, { roughness: 0.95 }), 0, 0.01, 0); fl.castShadow = false; g.add(fl);
    const rg = mesh(new THREE.BoxGeometry(width * 0.62, 0.01, depth * 0.45), mat(rug || (variant === 'lead' ? C.yellowSoft : C.greyLight)), -0.1, 0.025, -0.35);
    rg.castShadow = false; g.add(rg);
    // door sign on the header, both faces
    const signTex = labelTexture(title, '#f2b705', '#1d1f22', 512, 128);
    for (const s of [1, -1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ map: signTex }));
      sign.position.set(doorAt, height - 0.2, hd + s * 0.05); if (s < 0) sign.rotation.y = Math.PI; g.add(sign);
    }
    // desk faces the door, occupant sits with their back to the bookshelf
    const desk = createExecDesk({ seed, nameplate: title });
    desk.rotation.y = Math.PI; desk.position.set(-0.2, 0, -hd + 1.55); g.add(desk);
    const chair = createChair({ executive: true, color: 0x2f3338 }); chair.position.set(-0.2, 0, -hd + 0.83); g.add(chair);
    const shelf = createBookshelf({ width: Math.min(2.2, width - 1.4), seed: seed + 3 }); shelf.position.set(-0.2, 0, -hd + 0.22); g.add(shelf);
    for (const s of [-1, 1]) { const gc = createChair({ color: C.greyMid }); gc.rotation.y = Math.PI; gc.position.set(-0.2 + s * 0.45, 0, -hd + 2.6); g.add(gc); }
    const pl = createPlant({ size: 1.1, seed }); pl.position.set(hw - 0.4, 0, -hd + 0.4); g.add(pl);
    if (variant === 'lead') {
      const wb = createWhiteboard(); wb.rotation.y = Math.PI / 2; wb.position.set(-hw + 0.08, 1.35, 0.5); g.add(wb);
      const tb = createCoffeeTable({ radius: 0.45 }); tb.scale.set(1, 1.7, 1); tb.position.set(-hw + 1.1, 0, hd - 1.2); g.add(tb);
      for (const a of [0.3, 2.4]) { const c = createChair({ color: C.greyMid }); c.position.set(-hw + 1.1 + Math.sin(a) * 0.75, 0, hd - 1.2 + Math.cos(a) * 0.75); c.rotation.y = a + Math.PI; g.add(c); }
    } else {
      for (let i = 0; i < 2; i++) { const fc = createFilingCabinet(); fc.rotation.y = Math.PI / 2; fc.position.set(-hw + 0.35, 0, -hd + 0.7 + i * 0.5); g.add(fc); }
      const sofa = createSofa({ length: 1.6 }); sofa.rotation.y = Math.PI / 2; sofa.position.set(-hw + 0.5, 0, hd - 1.3); g.add(sofa);
    }
    g.userData.seat = { position: new THREE.Vector3(-0.2, 0, -hd + 0.86), rotationY: 0 };
    g.userData.bounds = new THREE.Box3(new THREE.Vector3(-hw, 0, -hd), new THREE.Vector3(hw, height, hd));
    g.userData.title = title;
    return g;
  }

  // =========================================================
  // PEOPLE
  // =========================================================
  const R = 0.17; // head radius

  function onHead(obj, x, y, lift = 0.003) {
    const z = Math.sqrt(Math.max(0, R * R - x * x - y * y));
    const n = new THREE.Vector3(x, y, z).normalize();
    obj.position.copy(n.clone().multiplyScalar(R + lift));
    obj.lookAt(n.clone().multiplyScalar(R * 3));
    return obj;
  }

  function buildFace(head, o) {
    const dark = mat(C.black, { flatShading: false, roughness: 0.4 });
    const ex = 0.058, ey = 0.005;
    const arcGeo = (r, t, arc) => new THREE.TorusGeometry(r, t, 6, 14, arc);

    const eye = (side, kind) => {
      const x = side * ex;
      if (kind === 'happy' || (kind === 'wink' && side > 0)) {
        head.add(onHead(new THREE.Mesh(arcGeo(0.02, 0.006, Math.PI), dark), x, ey - 0.008));
      } else if (kind === 'wide') {
        const w = onHead(new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), mat(0xffffff, { flatShading: false })), x, ey);
        w.scale.set(1, 1.1, 0.35); head.add(w);
        head.add(onHead(new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), dark), x, ey - 0.002, 0.012));
      } else if (kind === 'sleepy') {
        head.add(onHead(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.004), dark), x, ey - 0.004));
      } else {
        const e = onHead(new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), dark), x, ey);
        e.scale.set(1, 1.25, 0.45); head.add(e);
        const s = onHead(new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 5), mat(0xffffff, { flatShading: false })), x + 0.007, ey + 0.01, 0.009);
        head.add(s);
      }
      if (o.lashes && kind !== 'sleepy') {
        const l = onHead(new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.005, 0.004), dark), x + side * 0.024, ey + 0.018, 0.004);
        l.rotateZ(side * 0.6); head.add(l);
      }
    };
    eye(-1, o.eyes); eye(1, o.eyes);

    if (o.brows !== 'none') {
      const tilt = { soft: 0.08, raised: 0.25, focused: -0.3 }[o.brows] || 0;
      const by = o.brows === 'raised' ? 0.068 : 0.055;
      for (const s of [-1, 1]) {
        const b = onHead(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.01, 0.006), mat(o.hairColor)), s * ex, by);
        b.rotateZ(s * tilt); head.add(b);
      }
    }

    const my = -0.07;
    const mMat = mat(C.mouth, { flatShading: false });
    if (o.mouth === 'grin') {
      head.add(onHead(new THREE.Mesh(new THREE.CircleGeometry(0.042, 16, Math.PI, Math.PI), mMat), 0, my + 0.012));
      head.add(onHead(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.002), mat(0xffffff)), 0, my + 0.005, 0.005));
    } else if (o.mouth === 'open') {
      const m = onHead(new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mMat), 0, my); m.scale.set(1, 1.2, 0.35); head.add(m);
    } else if (o.mouth === 'neutral') {
      head.add(onHead(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.009, 0.004), mMat), 0, my));
    } else if (o.mouth === 'smirk') {
      const m = onHead(new THREE.Mesh(arcGeo(0.035, 0.006, Math.PI * 0.55), mMat), 0.012, my + 0.022); m.rotateZ(Math.PI * 1.2); head.add(m);
    } else {
      const m = onHead(new THREE.Mesh(arcGeo(0.035, 0.0065, Math.PI), mMat), 0, my + 0.025); m.rotateZ(Math.PI); head.add(m);
    }

    // nose
    const nose = onHead(new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), mat(o.skin)), 0, -0.03, -0.004);
    nose.scale.set(1, 0.8, 0.9); head.add(nose);

    const ex2 = new Set(Array.isArray(o.extras) ? o.extras : [o.extras]);
    if (ex2.has('glasses')) {
      const fm = mat(C.greyDark, { flatShading: false });
      for (const s of [-1, 1]) head.add(onHead(new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 6, 18), fm), s * ex, ey, 0.012));
      head.add(onHead(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.007, 0.006), fm), 0, ey + 0.008, 0.014));
    }
    if (ex2.has('blush')) {
      for (const s of [-1, 1]) head.add(onHead(new THREE.Mesh(new THREE.CircleGeometry(0.02, 12),
        mat(C.blush, { transparent: true, opacity: 0.75, flatShading: false })), s * 0.1, -0.035));
    }
    if (ex2.has('freckles')) {
      const fr = mat(0x9b6a4a, { flatShading: false });
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++)
        head.add(onHead(new THREE.Mesh(new THREE.CircleGeometry(0.004, 6), fr), s * (0.075 + i * 0.012), -0.03 + (i % 2) * 0.01));
    }
    if (ex2.has('beard')) {
      const bd = mesh(new THREE.SphereGeometry(R * 1.04, 16, 12, Math.PI / 2 - 1.25, 2.5, Math.PI * 0.64, Math.PI * 0.26),
        mat(o.hairColor, { side: THREE.DoubleSide }));
      head.add(bd);
    }
    if (ex2.has('beard') || ex2.has('mustache')) {
      const mu = onHead(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.012), mat(o.hairColor)), 0, -0.05, 0.004);
      head.add(mu);
    }
  }

  function buildHair(head, style, color) {
    const hm = mat(color, { side: THREE.DoubleSide });
    const cap = (tl = 0.42, scale = 1.07) => {
      const c = mesh(new THREE.SphereGeometry(R * scale, 18, 12, 0, Math.PI * 2, 0, Math.PI * tl), hm);
      c.rotation.x = -0.28; return c;
    };
    const backPanel = (h, w = 1.1) => {
      const p = mesh(new THREE.CylinderGeometry(R * w, R * (w + 0.12), h, 16, 1, true, Math.PI * 0.62, Math.PI * 0.76), hm);
      p.position.set(0, -h / 2 + 0.03, -0.01); return p;
    };
    switch (style) {
      case 'bald': return;
      case 'buzz': head.add(cap(0.4, 1.02)); return;
      case 'short': head.add(cap()); return;
      case 'spiky':
        head.add(cap());
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const s = mesh(new THREE.ConeGeometry(0.035, 0.1, 5), hm, Math.cos(a) * 0.08, R + 0.02, Math.sin(a) * 0.08 - 0.02);
          s.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); head.add(s);
        }
        head.add(mesh(new THREE.ConeGeometry(0.04, 0.12, 5), hm, 0, R + 0.05, -0.02));
        return;
      case 'side': {
        head.add(cap());
        const f = mesh(new THREE.SphereGeometry(R * 0.7, 12, 8), hm, 0.06, 0.12, 0.08); f.scale.set(1.2, 0.45, 0.6); f.rotation.z = -0.3;
        head.add(f); return;
      }
      case 'curly':
        head.add(cap(0.45, 1.05));
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2, up = i % 2 ? 0.1 : 0.04;
          head.add(mesh(new THREE.IcosahedronGeometry(0.05, 0), hm, Math.cos(a) * R * 0.95, up + (Math.sin(a) < -0.2 ? -0.02 : 0.03), Math.sin(a) * R * 0.95 - 0.02));
        }
        for (let i = 0; i < 5; i++) head.add(mesh(new THREE.IcosahedronGeometry(0.055, 0), hm, (i - 2) * 0.05, R + 0.015, -0.02 - (i % 2) * 0.04));
        return;
      case 'bob':
        head.add(cap(0.45, 1.09));
        head.add(backPanel(0.2, 1.12));
        return;
      case 'bun':
        head.add(cap(0.45, 1.07));
        head.add(mesh(new THREE.SphereGeometry(0.075, 12, 10), hm, 0, R + 0.02, -0.08));
        return;
      case 'ponytail': {
        head.add(cap(0.45, 1.07));
        head.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), hm, 0, 0.06, -R - 0.02));
        const t = mesh(new THREE.ConeGeometry(0.05, 0.28, 8), hm, 0, -0.08, -R - 0.05); t.rotation.x = Math.PI + 0.25; head.add(t);
        return;
      }
      case 'long':
      default:
        head.add(cap(0.45, 1.09));
        head.add(backPanel(0.42, 1.12));
        for (const s of [-1, 1]) { const st = box(0.05, 0.3, 0.1, color, s * R * 1.02, -0.1, -0.02); st.material = hm; head.add(st); }
        return;
    }
  }

  /**
   * createPerson(options)
   *  gender: 'man' | 'woman'
   *  skin, hairColor, shirt, pants: hex colours (or index into palettes)
   *  hair: 'short'|'buzz'|'spiky'|'side'|'curly'|'bald'|'long'|'bob'|'bun'|'ponytail'
   *  eyes: 'dot'|'happy'|'wide'|'sleepy'|'wink'
   *  mouth: 'smile'|'grin'|'open'|'neutral'|'smirk'
   *  brows: 'soft'|'raised'|'focused'|'none'
   *  extras: 'none'|'glasses'|'blush'|'freckles'|'beard'|'mustache' (or an array)
   *  skirt: boolean, pose: 'stand'|'sit', name: string (adds a floating name tag)
   */
  function createPerson(opts = {}) {
    const o = Object.assign({
      gender: 'man', skin: SKIN[1], hairColor: HAIR[1], shirt: C.yellow, pants: PANTS[0],
      eyes: 'dot', mouth: 'smile', brows: 'soft', extras: 'none', pose: 'stand', skirt: false, name: null,
    }, opts);
    if (!o.hair) o.hair = o.gender === 'woman' ? 'long' : 'short';
    if (o.lashes === undefined) o.lashes = o.gender === 'woman';
    const woman = o.gender === 'woman';

    const root = new THREE.Group(); root.name = 'person';
    const body = new THREE.Group(); root.add(body);
    const skinM = o.skin, shoe = C.black;

    const hipY = 0.82;
    const shoulderW = woman ? 0.19 : 0.21;
    // legs (thigh -> knee -> shin)
    const legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group(); thigh.position.set(s * 0.085, hipY, 0);
      thigh.add(cyl(0.072, 0.065, 0.38, o.pants, 0, -0.19, 0, 10));
      const knee = new THREE.Group(); knee.position.set(0, -0.38, 0);
      knee.add(cyl(0.063, 0.055, 0.38, o.pants, 0, -0.19, 0, 10));
      knee.add(box(0.1, 0.06, 0.18, shoe, 0, -0.41, 0.035));
      thigh.add(knee); body.add(thigh);
      legs.push({ thigh, knee });
    }
    // hips / skirt
    body.add(box(woman ? 0.3 : 0.32, 0.14, 0.19, o.pants, 0, hipY + 0.02, 0));
    let skirt = null;
    if (o.skirt) {
      skirt = cyl(woman ? 0.16 : 0.17, 0.25, 0.36, o.pants, 0, hipY - 0.12, 0, 16);
      body.add(skirt);
    }
    // torso
    const torsoH = 0.5;
    body.add(cyl(woman ? 0.155 : 0.175, woman ? 0.15 : 0.16, torsoH, o.shirt, 0, hipY + 0.08 + torsoH / 2, 0, 16));
    const shoulders = sph(woman ? 0.155 : 0.175, o.shirt, 0, hipY + 0.08 + torsoH, 0, 16);
    shoulders.scale.set(1.12, 0.45, 0.9); body.add(shoulders);
    const collar = mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 14), mat(C.white), 0, hipY + 0.08 + torsoH + 0.05, 0.01);
    collar.rotation.x = Math.PI / 2; body.add(collar);
    body.add(cyl(0.05, 0.055, 0.1, skinM, 0, hipY + torsoH + 0.18, 0, 10));
    // arms
    const arms = [];
    const shoulderY = hipY + 0.08 + torsoH - 0.03;
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * shoulderW, shoulderY, 0);
      arm.add(sph(0.058, o.shirt, 0, 0, 0, 10));
      arm.add(cyl(0.055, 0.05, 0.46, o.shirt, 0, -0.23, 0, 10));
      arm.add(sph(0.05, skinM, 0, -0.49, 0, 10));
      arm.rotation.z = s * 0.08;
      body.add(arm); arms.push(arm);
    }
    // head
    const head = new THREE.Group();
    head.add(sph(R, skinM, 0, 0, 0, 18));
    for (const s of [-1, 1]) { const ear = sph(0.04, skinM, s * R * 0.98, -0.01, -0.01, 8); ear.scale.set(0.5, 1, 0.8); head.add(ear); }
    buildFace(head, o);
    buildHair(head, o.hair, o.hairColor);
    head.position.set(0, hipY + torsoH + 0.38, 0);
    body.add(head);

    root.userData.parts = { body, head, arms, legs, skirt };
    root.userData.options = o;
    setPose(root, o.pose);
    if (o.name) addNameTag(root, o.name, { you: !!o.you });
    return root;
  }

  function setPose(person, pose) {
    const { body, arms, legs, skirt } = person.userData.parts;
    person.userData.pose = pose;
    if (pose === 'sit') {
      body.position.y = -0.33;
      legs.forEach(l => { l.thigh.rotation.x = -Math.PI / 2; l.knee.rotation.x = Math.PI / 2; });
      arms.forEach(a => { a.rotation.x = -1.05; });
      if (skirt) { skirt.scale.set(1, 0.4, 1); skirt.position.y = 0.76; }
    } else {
      body.position.y = 0;
      legs.forEach(l => { l.thigh.rotation.x = 0; l.knee.rotation.x = 0; });
      arms.forEach(a => { a.rotation.x = 0; });
      if (skirt) { skirt.scale.set(1, 1, 1); skirt.position.y = 0.7; }
    }
  }

  /** Call every frame. mode: 'idle' | 'walk' | 'type' | 'wave' */
  function animatePerson(person, t, mode = 'idle') {
    const P = person.userData.parts; if (!P) return;
    if (person.userData.phase === undefined) person.userData.phase = Math.random() * 10;
    const ph = person.userData.phase;
    const tt = t + ph;
    if (mode === 'walk') {
      const s = Math.sin(tt * 9);
      P.legs[0].thigh.rotation.x = s * 0.55; P.legs[1].thigh.rotation.x = -s * 0.55;
      P.legs[0].knee.rotation.x = Math.max(0, -s) * 0.7; P.legs[1].knee.rotation.x = Math.max(0, s) * 0.7;
      P.arms[0].rotation.x = -s * 0.5; P.arms[1].rotation.x = s * 0.5;
      P.body.position.y = Math.abs(Math.cos(tt * 9)) * 0.035;
    } else if (mode === 'type') {
      P.arms[0].rotation.x = -1.05 + Math.sin(tt * 14) * 0.04;
      P.arms[1].rotation.x = -1.05 + Math.cos(tt * 13) * 0.04;
      P.head.rotation.x = 0.06 + Math.sin(tt * 0.7) * 0.04;
      P.head.rotation.y = Math.sin(tt * 0.4) * 0.12;
    } else if (mode === 'wave') {
      P.arms[1].rotation.z = 2.6; P.arms[1].rotation.x = Math.sin(tt * 8) * 0.35;
      P.head.rotation.z = Math.sin(tt * 2) * 0.06;
    } else {
      if (person.userData.pose !== 'sit') {
        P.legs.forEach(l => { l.thigh.rotation.x *= 0.8; l.knee.rotation.x *= 0.8; });
        P.arms.forEach(a => { a.rotation.x *= 0.8; });
        P.body.position.y = Math.sin(tt * 2) * 0.006;
      }
      P.head.rotation.y = Math.sin(tt * 0.6) * 0.15;
      P.arms[1].rotation.z += (0.08 - P.arms[1].rotation.z) * 0.2;
    }
  }

  function addNameTag(obj, text, { you = false } = {}) {
    const cv = document.createElement('canvas'); const ctx = cv.getContext('2d');
    const font = '600 44px Urbanist, "Segoe UI", system-ui, sans-serif';
    ctx.font = font; const w = Math.ceil(ctx.measureText(text).width) + 56;
    cv.width = w; cv.height = 76;
    ctx.font = font;
    ctx.fillStyle = you ? '#f2b705' : 'rgba(40,44,50,.88)';
    const r = 38; ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(r, 76); ctx.arc(r, r, r, Math.PI / 2, Math.PI * 1.5); ctx.fill();
    ctx.fillStyle = you ? '#1d1f22' : '#ffffff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, 40);
    const tex = new THREE.CanvasTexture(cv); setSRGB(tex);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const h = 0.14; sp.scale.set(h * w / 76, h, 1);
    sp.position.y = 2.0; sp.renderOrder = 10; sp.name = 'nametag';
    const old = obj.getObjectByName('nametag'); if (old) obj.remove(old);
    obj.add(sp); return sp;
  }

  /** Random but deterministic character. */
  function randomPersonOptions(seed = Math.random() * 1e9, overrides = {}) {
    const r = rng(seed | 0);
    const gender = r() < 0.5 ? 'woman' : 'man';
    const extrasPool = gender === 'man' ? EXTRAS : EXTRAS.filter(e => e !== 'beard' && e !== 'mustache');
    const extras = r() < 0.55 ? 'none' : pick(r, extrasPool.slice(1));
    return Object.assign({
      gender,
      skin: pick(r, SKIN), hairColor: pick(r, HAIR),
      hair: pick(r, HAIR_STYLES[gender]),
      eyes: pick(r, EYES), mouth: pick(r, MOUTHS), brows: pick(r, BROWS),
      extras, shirt: pick(r, SHIRT), pants: pick(r, PANTS),
      skirt: gender === 'woman' && r() < 0.3,
    }, overrides);
  }

  return {
    colors: C, palettes: { SKIN, HAIR, SHIRT, PANTS }, styles: { HAIR_STYLES, EYES, MOUTHS, BROWS, EXTRAS },
    createDesk, createChair, createMonitor, createLaptop, createKeyboard, createMug, createPlant,
    createSofa, createCoffeeTable, createPantry, createDivider, createWorkstation, createDeskPod,
    createExecDesk, createBookshelf, createFilingCabinet, createWhiteboard, createGlassWall, createPrivateOffice,
    createPerson, setPose, animatePerson, addNameTag, randomPersonOptions,
  };
}
