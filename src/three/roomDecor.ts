import * as THREE from 'three';
import { FONT_BRUSH, canvasTex, inkLandscape, lam, mulberry32, place, seal } from './paint';

/** 门后房间的装饰：荷塘、木平台、牌坊、瀑布、渡亭、香炉、博古架、古琴、山水横幅 */

// ---------- 荷塘 ----------
/** 一片荷：浮叶、挺出水面的荷叶、荷花。坐标原点在水面 */
export function lotusPatch(seed: number, n: number, rx: number, rz: number) {
  const grp = new THREE.Group();
  const rnd = mulberry32(seed);
  const leafMat = lam(0x5a6e48, { side: THREE.DoubleSide });
  const stemMat = lam(0x4a5a3c);
  const flowerMat = lam(0xe58a9a);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd());
    const x = Math.cos(a) * rx * d;
    const z = Math.sin(a) * rz * d;
    const r = 0.25 + rnd() * 0.3;
    const kind = rnd();
    if (kind < 0.6) {
      const pad = place(new THREE.Mesh(new THREE.CircleGeometry(r, 20, 0.3, Math.PI * 2 - 0.3), leafMat), x, 0.01, z, grp);
      pad.rotation.set(-Math.PI / 2, 0, rnd() * 6);
    } else {
      const h = 0.4 + rnd() * 0.6;
      place(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, h, 5), stemMat), x, h / 2, z, grp);
      if (kind < 0.85) {
        const leaf = place(new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 20), leafMat), x, h, z, grp);
        leaf.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 0.8, 0, rnd() * 6);
      } else {
        const bud = place(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), flowerMat), x, h + 0.05, z, grp);
        bud.scale.set(1, 1.35, 1);
      }
    }
  }
  return grp;
}

// ---------- 木平台 ----------
export function woodenDeck(w: number, d: number) {
  const grp = new THREE.Group();
  const n = Math.round(d / 0.3);
  const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(w, 0.06, 0.27), lam(0x8d867b), n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) planks.setMatrixAt(i, m.makeTranslation(0, 0, -d / 2 + 0.15 + i * 0.3));
  grp.add(planks);
  const post = new THREE.CylinderGeometry(0.07, 0.08, 1.2, 8);
  const dark = lam(0x3a3632);
  for (let x = -w / 2 + 0.2; x <= w / 2; x += 1.6) {
    for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) place(new THREE.Mesh(post, dark), x, -0.6, z, grp);
  }
  for (const z of [-d / 2, d / 2]) place(new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.08), dark), 0, -0.04, z, grp);
  return grp;
}

// ---------- 牌坊 ----------
export function paifang(text: string) {
  const grp = new THREE.Group();
  const stone = lam(0xb5b0a6);
  const dark = lam(0x3a3632);
  for (const s of [-1, 1]) {
    place(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.6), stone), s * 1.45, 0.22, 0, grp);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.3, 0.3), stone), s * 1.45, 1.65, 0, grp);
  }
  place(new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.28, 0.34), stone), 0, 2.35, 0, grp);
  place(new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.32, 0.38), stone), 0, 3.15, 0, grp);
  const tex = canvasTex(512, 168, (c, w, h) => {
    c.fillStyle = '#2d2824';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#6d655c';
    c.lineWidth = 6;
    c.strokeRect(10, 10, w - 20, h - 20);
    c.font = `${text.length > 3 ? 92 : 108}px ${FONT_BRUSH}`;
    c.fillStyle = '#efe6cf';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 6);
  });
  for (const z of [0.18, -0.18]) {
    const plaque = place(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.49), lam(0xffffff, { map: tex })), 0, 2.75, z, grp);
    if (z < 0) plaque.rotation.y = Math.PI;
  }
  // 小坡顶
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.45, 0);
  roofShape.lineTo(0.45, 0);
  roofShape.lineTo(0, 0.42);
  roofShape.closePath();
  const roof = place(new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 4.2, bevelEnabled: false }), lam(0x4a4642)), -2.1, 3.31, 0, grp);
  roof.rotation.y = Math.PI / 2;
  place(new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.12, 0.14), dark), 0, 3.75, 0, grp);
  for (const s of [-1, 1]) {
    const tip = place(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.12), dark), s * 2.15, 3.38, 0, grp);
    tip.rotation.z = s * 0.4;
  }
  return grp;
}

// ---------- 瀑布 ----------
export function waterfallTex() {
  return canvasTex(256, 768, (g, w, h) => {
    const rnd = mulberry32(5);
    // 两侧崖壁
    for (const side of [0, 1]) {
      g.fillStyle = 'rgba(30,30,30,0.85)';
      g.beginPath();
      const x0 = side ? w : 0;
      g.moveTo(x0, 0);
      for (let y = 0; y <= h; y += 24) g.lineTo(side ? w - 30 - rnd() * 30 : 30 + rnd() * 30, y);
      g.lineTo(x0, h);
      g.closePath();
      g.fill();
    }
    // 水流：细长的竖线
    g.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      const x = 70 + rnd() * (w - 140);
      g.strokeStyle = `rgba(30,30,30,${0.3 + rnd() * 0.4})`;
      g.lineWidth = 1 + rnd() * 1.5;
      g.beginPath();
      const y0 = rnd() * 80;
      g.moveTo(x, y0);
      g.quadraticCurveTo(x + (rnd() - 0.5) * 10, h * 0.5, x + (rnd() - 0.5) * 16, h * (0.75 + rnd() * 0.2));
      g.stroke();
    }
    // 底部水雾
    const gr = g.createLinearGradient(0, h * 0.7, 0, h);
    gr.addColorStop(0, 'rgba(240,236,228,0)');
    gr.addColorStop(1, 'rgba(240,236,228,0.95)');
    g.fillStyle = gr;
    g.fillRect(0, h * 0.7, w, h * 0.3);
  });
}

// ---------- 渡亭（四柱方亭） ----------
export function kiosk(text: string) {
  const grp = new THREE.Group();
  const dark = lam(0x34302c);
  for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.5, 8), dark), x * 0.95, 1.25, z * 0.95, grp);
  }
  for (const s of [-1, 1]) {
    place(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 0.12), dark), 0, 2.45, s * 0.95, grp);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 2.1), dark), s * 0.95, 2.45, 0, grp);
  }
  const roof = place(new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.1, 4), lam(0x4a4642)), 0, 3.05, 0, grp);
  roof.rotation.y = Math.PI / 4;
  place(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), lam(0x4a4642)), 0, 3.65, 0, grp);
  const tex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#2d2824';
    c.fillRect(0, 0, w, h);
    c.font = `92px ${FONT_BRUSH}`;
    c.fillStyle = '#efe6cf';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 6);
  });
  place(new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), lam(0xffffff, { map: tex })), 0, 2.2, 1.02, grp);
  // 亭内长凳
  place(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.36), dark), 0, 0.45, -0.7, grp);
  return grp;
}

// ---------- 香炉 + 青烟 ----------
export function incenseBurner() {
  const grp = new THREE.Group();
  const bronze = lam(0x4a4036);
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.22, 20), bronze), 0, 0.42, 0, grp);
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20), bronze), 0, 0.53, 0, grp);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.32, 6), bronze), Math.cos(a) * 0.13, 0.16, Math.sin(a) * 0.13, grp);
  }
  for (const s of [-1, 1]) {
    const ear = place(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), bronze), s * 0.15, 0.57, 0, grp);
    ear.rotation.y = Math.PI / 2;
  }
  // 青烟：贴图竖直方向可无缝循环，往上滚动；另一张不动的渐变当透明度遮罩，让烟越高越淡
  const smoke = canvasTex(128, 512, (g, w, h) => {
    g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = `rgba(60,60,60,${0.5 - k * 0.12})`;
      g.lineWidth = 3 - k * 0.6;
      g.beginPath();
      for (let y = 0; y <= h; y += 4) {
        const x = w / 2 + Math.sin((y / h) * Math.PI * 2 * 2 + k) * (12 + k * 8) + Math.sin((y / h) * Math.PI * 2 * 3) * 6;
        if (y) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
  });
  smoke.wrapT = THREE.RepeatWrapping;
  const fade = canvasTex(4, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#000');
    gr.addColorStop(0.6, '#888');
    gr.addColorStop(1, '#fff');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  fade.colorSpace = THREE.NoColorSpace;
  const plume = place(
    new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 2.0),
      new THREE.MeshBasicMaterial({ map: smoke, alphaMap: fade, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    ),
    0, 1.55, 0, grp,
  );
  return {
    group: grp,
    update(t: number) {
      smoke.offset.y = -t * 0.08;
      plume.rotation.y = Math.sin(t * 0.3) * 0.3;
    },
  };
}

// ---------- 博古架 ----------
export function bookshelf() {
  const grp = new THREE.Group();
  const wood = lam(0x4a4036);
  const W = 1.6;
  const H = 2.4;
  const D = 0.36;
  // 外框与背板
  place(new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.03), lam(0xc2bbaf)), 0, H / 2, -D / 2, grp);
  for (const s of [-1, 1]) place(new THREE.Mesh(new THREE.BoxGeometry(0.05, H, D), wood), s * (W / 2), H / 2, 0, grp);
  for (const y of [0.03, H]) place(new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, 0.05, D), wood), 0, y, 0, grp);
  // 错落的隔板（博古架的特点）
  const shelves: [number, number, number][] = [
    [-0.4, 0.6, 0.8], [0.4, 0.75, 0.8], [-0.4, 1.3, 0.8], [0.4, 1.45, 0.8], [-0.4, 1.95, 0.8], [0.4, 2.0, 0.8],
  ];
  for (const [x, y, w] of shelves) place(new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, D), wood), x, y, 0, grp);
  for (const [x, y0, y1] of [[0, 0.03, 0.75], [0, 1.3, 1.45], [0, 1.95, 2.4]]) {
    place(new THREE.Mesh(new THREE.BoxGeometry(0.04, y1 - y0, D), wood), x, (y0 + y1) / 2, 0, grp);
  }
  // 书：一摞摞平放和竖放
  const rnd = mulberry32(13);
  const bookColors = [0x6b5f52, 0x8a7d6c, 0x4a4036, 0xa39684];
  const book = (x: number, y: number, w: number, h: number, flat: boolean) => {
    const b = place(new THREE.Mesh(new THREE.BoxGeometry(flat ? w : 0.05, flat ? 0.05 : h, 0.24), lam(bookColors[(rnd() * 4) | 0])), x, y, 0.02, grp);
    return b;
  };
  for (let i = 0; i < 4; i++) book(-0.55, 0.08 + i * 0.055, 0.32, 0, true);
  for (let i = 0; i < 6; i++) book(0.12 + i * 0.06, 0.78 + 0.13, 0, 0.26 + rnd() * 0.06, false);
  for (let i = 0; i < 3; i++) book(-0.5, 1.33 + i * 0.055, 0.3, 0, true);
  // 花瓶、卷轴、小盆景、香盒
  const vase = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.06, 0), new THREE.Vector2(0.09, 0.08), new THREE.Vector2(0.07, 0.2), new THREE.Vector2(0.035, 0.27), new THREE.Vector2(0.05, 0.32), new THREE.Vector2(0, 0.32),
  ], 18);
  place(new THREE.Mesh(vase, lam(0xd8d2c4)), 0.45, 0.08, 0, grp);
  place(new THREE.Mesh(vase, lam(0x6f7a74)), -0.25, 1.98, 0, grp).scale.setScalar(1.1);
  place(new THREE.Mesh(vase, lam(0xb8281d)), 0.55, 1.48, 0, grp).scale.setScalar(0.8);
  for (let i = 0; i < 3; i++) {
    const roll = place(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10), lam(0xe8e2d4)), 0.25 + i * 0.07, 1.5 + (i % 2) * 0.07, 0, grp);
    roll.rotation.z = Math.PI / 2;
  }
  place(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.16), lam(0x4a4036)), -0.45, 0.66, 0, grp);
  place(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), lam(0x8a847a)), 0.35, 2.07, 0, grp);
  return grp;
}

// ---------- 古琴（放在琴桌上） ----------
export function guqin() {
  const grp = new THREE.Group();
  const wood = lam(0x3b332c);
  place(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.42), wood), 0, 0.62, 0, grp);
  for (const [x, z] of [[-0.62, -0.16], [0.62, -0.16], [-0.62, 0.16], [0.62, 0.16]]) {
    place(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), wood), x, 0.3, z, grp);
  }
  const tex = canvasTex(512, 96, (c, w, h) => {
    c.fillStyle = '#2a2420';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(230,224,210,0.85)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const y = 18 + i * 10;
      c.beginPath();
      c.moveTo(20, y);
      c.lineTo(w - 10, y);
      c.stroke();
    }
    c.fillStyle = '#e8e2d4';
    for (let i = 0; i < 13; i++) {
      c.beginPath();
      c.arc(60 + i * 30, h - 8, 3, 0, 7);
      c.fill();
    }
  });
  const body = place(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 0.2), [wood, wood, lam(0xffffff, { map: tex }), wood, wood, wood]), 0, 0.67, 0, grp);
  body.rotation.y = 0.05;
  return grp;
}

// ---------- 山水横幅 ----------
export function landscapeScrollTex(seed: number) {
  return canvasTex(1024, 300, (g, w, h) => {
    g.fillStyle = '#c4ccc6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4efe1';
    g.fillRect(40, 24, w - 80, h - 48);
    inkLandscape(g, 60, 30, w - 120, h - 56, seed, true);
    seal(g, w - 110, 50, 40, '印', seed);
  });
}
