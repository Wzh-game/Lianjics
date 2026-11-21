/* ============================================================
   三角洲行动 · 网页版  —— 实体：角色 / 枪械 / 特效 / 命中 / AI
   ============================================================ */

/* ---------------- 几何辅助：射线 vs 球 / 胶囊 ---------------- */
const _v1 = new T.Vector3(), _v2 = new T.Vector3(), _v3 = new T.Vector3(), _v4 = new T.Vector3();

function raySphere(origin, dir, center, radius) {
  _v1.subVectors(center, origin);
  const tca = _v1.dot(dir);
  const d2 = _v1.lengthSq() - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return -1;
  const thc = Math.sqrt(r2 - d2);
  let t = tca - thc;
  if (t < 0) t = tca + thc;
  return t >= 0 ? t : -1;
}
// 竖直胶囊（轴 Y）：圆柱侧面 + 上下球冠，取最近的有效交点
function rayCapsuleY(origin, dir, base, height, radius) {
  const topY = base.y + height;
  const r2 = radius * radius;
  let best = -1;

  // --- 圆柱侧面（无限圆柱，再按 y 范围裁剪） ---
  const rx = origin.x - base.x;
  const rz = origin.z - base.z;
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a > 1e-9) {
    const b = 2 * (rx * dir.x + rz * dir.z);
    const c = rx * rx + rz * rz - r2;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const inv = 1 / (2 * a);
      const t0 = (-b - sq) * inv;
      const t1 = (-b + sq) * inv;
      [t0, t1].forEach(t => {
        if (t < 0) return;
        const y = origin.y + dir.y * t;
        if (y >= base.y - 1e-4 && y <= topY + 1e-4) {
          if (best < 0 || t < best) best = t;
        }
      });
    }
  }

  // --- 上下球冠 ---
  const sphere = (cy) => {
    const ox = origin.x - base.x, oy = origin.y - cy, oz = origin.z - base.z;
    const b = 2 * (ox * dir.x + oy * dir.y + oz * dir.z);
    const c = ox * ox + oy * oy + oz * oz - r2;
    const disc = b * b - 4 * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    const t = (-b - sq) / 2;
    return t >= 0 ? t : ((-b + sq) / 2 >= 0 ? (-b + sq) / 2 : -1);
  };
  const tb = sphere(base.y);
  if (tb >= 0 && (best < 0 || tb < best)) best = tb;
  const tt = sphere(topY);
  if (tt >= 0 && (best < 0 || tt < best)) best = tt;

  return best;
}

/* ---------------- 角色模型 ---------------- */
DF.makeCharacter = function (colorHex) {
  const g = new T.Group();
  const mats = {
    uniform: new T.MeshStandardMaterial({ color: new T.Color(colorHex), roughness: 0.85 }),
    vest: new T.MeshStandardMaterial({ color: 0x33392c, roughness: 0.9 }),
    skin: new T.MeshStandardMaterial({ color: 0xb08a63, roughness: 0.8 }),
    helmet: new T.MeshStandardMaterial({ color: 0x3d4732, roughness: 0.7 }),
    black: new T.MeshStandardMaterial({ color: 0x1d211a, roughness: 0.6 })
  };
  // 躯干
  const torso = new T.Mesh(new T.BoxGeometry(0.56, 0.66, 0.34), mats.uniform);
  torso.position.y = 1.16; torso.castShadow = true; torso.userData.part = 'body';
  g.add(torso);
  // 战术背心
  const vest = new T.Mesh(new T.BoxGeometry(0.60, 0.44, 0.38), mats.vest);
  vest.position.y = 1.20; vest.castShadow = true; vest.userData.part = 'body';
  g.add(vest);
  // 头
  const head = new T.Mesh(new T.BoxGeometry(0.26, 0.28, 0.27), mats.skin);
  head.position.y = 1.64; head.castShadow = true; head.userData.part = 'head';
  g.add(head);
  // 头盔
  const helmet = new T.Mesh(new T.SphereGeometry(0.185, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), mats.helmet);
  helmet.position.y = 1.70; helmet.castShadow = true; helmet.userData.part = 'head';
  g.add(helmet);
  // 腿
  const legL = new T.Mesh(new T.BoxGeometry(0.19, 0.78, 0.22), mats.uniform);
  legL.position.set(-0.16, 0.44, 0); legL.castShadow = true; legL.userData.part = 'leg';
  const legR = legL.clone(); legR.position.x = 0.16; legR.userData.part = 'leg';
  g.add(legL, legR);
  // 手臂
  const armL = new T.Mesh(new T.BoxGeometry(0.16, 0.52, 0.18), mats.uniform);
  armL.position.set(-0.36, 1.22, 0); armL.castShadow = true; armL.userData.part = 'body';
  const armR = armL.clone(); armR.position.x = 0.36; armR.userData.part = 'body';
  g.add(armL, armR);
  // 手持枪
  const gun = new T.Group();
  const gRec = new T.Mesh(new T.BoxGeometry(0.09, 0.12, 0.62), mats.black);
  gRec.position.set(0, 0, -0.16);
  const gBar = new T.Mesh(new T.CylinderGeometry(0.028, 0.028, 0.42, 8), mats.black);
  gBar.rotation.x = Math.PI / 2; gBar.position.set(0, 0.015, -0.62);
  const gMag = new T.Mesh(new T.BoxGeometry(0.07, 0.2, 0.11), mats.vest);
  gMag.position.set(0, -0.13, -0.14);
  gun.add(gRec, gBar, gMag);
  gun.position.set(0.3, 1.22, -0.42);
  gun.userData.part = 'body';
  g.add(gun);
  // 名牌
  const label = DF.makeNameSprite('', '#ffffff');
  label.position.y = 2.06;
  g.add(label);

  g.userData = { mats, legL, legR, armL, armR, head, torso, gun, label, walkPhase: 0 };
  return g;
};

DF.makeNameSprite = function (text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.font = 'bold 34px "Microsoft YaHei",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.85)';
  g.strokeText(text, 128, 34);
  g.fillStyle = color || '#fff';
  g.fillText(text, 128, 34);
  const tex = new T.CanvasTexture(c);
  const spr = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(1.7, 0.42, 1);
  spr.userData.redraw = function (t, col) {
    const g2 = c.getContext('2d');
    g2.clearRect(0, 0, 256, 64);
    g2.font = 'bold 34px "Microsoft YaHei",sans-serif';
    g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.lineWidth = 6; g2.strokeStyle = 'rgba(0,0,0,.85)';
    g2.strokeText(t, 128, 34);
    g2.fillStyle = col || '#fff';
    g2.fillText(t, 128, 34);
    tex.needsUpdate = true;
  };
  return spr;
};

/* ---------------- 创建玩家实体 ---------------- */
let __pid = 0;
DF.createPlayer = function (opt) {
  const id = opt.id || ('p' + (++__pid));
  const color = opt.color || CFG.colors[rndInt(0, CFG.colors.length - 1)];
  const p = {
    id, name: opt.name || ('Operator-' + id), isBot: !!opt.isBot, isLocal: !!opt.isLocal,
    color,
    pos: new T.Vector3(0, 0, 0), vel: new T.Vector3(), vy: 0,
    yaw: 0, pitch: 0, onGround: true, crouch: false, sprint: false, ads: false,
    hp: CFG.maxHp, alive: true, ammo: CFG.mag, reserve: 90,
    reloading: false, reloadEnd: 0, lastFire: 0, nextFire: 0,
    kills: 0, deaths: 0, shots: 0, hits: 0,
    respawnAt: 0, killedBy: '', lastDamageTime: 0, lastAttacker: '',
    walkPhase: 0, aimT: 0, deathT: 0,
    input: { f: 0, s: 0, jump: false, fire: false, ads: false, reload: false, sprint: false },
    aimYaw: 0, aimPitch: 0,           // 机器人瞄准
    botState: 'roam', botTarget: new T.Vector3(), botNextThink: 0, botStrafe: 0
  };
  if (opt.spawn) { p.pos.copy(opt.spawn); }
  if (DF.initInventory) DF.initInventory(p);
  return p;
};

/* ---------------- 玩家网格挂载 ---------------- */
DF.attachMesh = function (p, scene) {
  if (p.mesh) return;
  const m = DF.makeCharacter(p.color);
  m.userData.label.userData.redraw(p.name, p.id === DF.myId ? '#ffd27a' : '#e8ecdd');
  scene.add(m);
  p.mesh = m;
  p.mesh.position.copy(p.pos);
};

DF.detachMesh = function (p, scene) {
  if (!p.mesh) return;
  scene.remove(p.mesh);
  p.mesh.traverse(o => {
    if (o.geometry) o.geometry.dispose();
  });
  p.mesh = null;
};

/* 依据状态更新角色动画 */
DF.updateCharacter = function (p, dt) {
  const m = p.mesh;
  if (!m) return;
  m.position.set(p.pos.x, p.pos.y, p.pos.z);
  const targetPitch = p.pitch;
  // 统一约定：前方向量 = (-sin(yaw), 0, -cos(yaw))；模型本地 -Z 为前 → rotation.y = yaw
  m.rotation.y = p.yaw;
  const ud = m.userData;
  // 腿部走路摆动
  const speed = Math.hypot(p.vel.x, p.vel.z);
  ud.walkPhase += dt * (speed * 2.4);
  const swing = Math.sin(ud.walkPhase) * Math.min(0.7, speed * 0.1);
  ud.legL.rotation.x = swing;
  ud.legR.rotation.x = -swing;
  ud.armL.rotation.x = -swing * 0.5;
  ud.armR.rotation.x = swing * 0.35 - 0.5;
  // 蹲下
  const crouchY = p.crouch ? -0.34 : 0;
  m.position.y = p.pos.y + crouchY * -1;
  // 死亡倒地
  if (!p.alive) {
    m.rotation.z = lerp(m.rotation.z, Math.PI / 2, Math.min(1, dt * 7));
    m.position.y = p.pos.y + 0.25;
  } else {
    m.rotation.z = lerp(m.rotation.z, 0, Math.min(1, dt * 7));
  }
  // 枪口朝向俯仰
  ud.gun.rotation.x = clamp(p.pitch * 0.85, -0.9, 0.9);
  ud.label.visible = p.alive && p.id !== DF.myId;
};

/* ============================================================
   第一人称视图模型
   ============================================================ */
DF.createViewModel = function (camera) {
  const vm = new T.Group();
  const M = {
    body: new T.MeshStandardMaterial({ color: 0x24282a, roughness: 0.55, metalness: 0.65 }),
    body2: new T.MeshStandardMaterial({ color: 0x30363a, roughness: 0.6, metalness: 0.5 }),
    tan: new T.MeshStandardMaterial({ color: 0x8a7f63, roughness: 0.85 }),
    glove: new T.MeshStandardMaterial({ color: 0x2b2f24, roughness: 0.95 }),
    glass: new T.MeshStandardMaterial({ color: 0x18313a, metalness: 0.9, roughness: 0.1 }),
    dot: new T.MeshBasicMaterial({ color: 0xff3b2f })
  };
  const add = (geo, mat, x, y, z) => {
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    vm.add(mesh);
    return mesh;
  };
  // 机匣
  const recv = add(new T.BoxGeometry(0.075, 0.10, 0.40), M.body, 0, 0, -0.12);
  // 上导轨
  const rail = add(new T.BoxGeometry(0.055, 0.025, 0.52), M.body2, 0, 0.062, -0.18);
  // 护木
  const hand = add(new T.BoxGeometry(0.068, 0.078, 0.34), M.tan, 0, -0.002, -0.44);
  // 散热孔
  for (let i = 0; i < 5; i++) add(new T.BoxGeometry(0.072, 0.012, 0.022), M.body, 0, 0.012, -0.30 - i * 0.055);
  // 枪管
  const barrel = add(new T.CylinderGeometry(0.014, 0.014, 0.34, 10), M.body, 0, 0.012, -0.72);
  barrel.rotation.x = Math.PI / 2;
  // 消焰器
  const mz = add(new T.CylinderGeometry(0.021, 0.024, 0.09, 10), M.body2, 0, 0.012, -0.90);
  mz.rotation.x = Math.PI / 2;
  // 弹匣
  const mag = add(new T.BoxGeometry(0.05, 0.16, 0.075), M.body2, 0, -0.125, -0.10);
  mag.rotation.x = -0.12;
  // 握把
  const grip = add(new T.BoxGeometry(0.05, 0.15, 0.07), M.body, 0, -0.12, 0.06);
  grip.rotation.x = 0.28;
  // 枪托
  const stock = add(new T.BoxGeometry(0.05, 0.085, 0.24), M.body2, 0, -0.005, 0.20);
  // 瞄具座
  add(new T.BoxGeometry(0.05, 0.03, 0.10), M.body2, 0, 0.088, -0.06);
  // 红点镜外壳（细环结构）
  const scope = add(new T.TorusGeometry(0.030, 0.0065, 8, 18), M.body, 0, 0.128, -0.085);
  const scope2 = add(new T.TorusGeometry(0.030, 0.0065, 8, 18), M.body2, 0, 0.128, -0.028);
  const scopeBase = add(new T.BoxGeometry(0.026, 0.055, 0.09), M.body2, 0, 0.10, -0.056);
  const lens = add(new T.CircleGeometry(0.029, 18), M.glass, 0, 0.128, -0.028);
  lens.material = new T.MeshBasicMaterial({ color: 0x8fd0e0, transparent: true, opacity: 0.16 });
  const redDot = add(new T.CircleGeometry(0.0032, 10), M.dot, 0, 0.128, -0.026);
  // 手部
  const handR = add(new T.BoxGeometry(0.095, 0.125, 0.14), M.glove, 0.005, -0.14, 0.055);
  const armR = add(new T.BoxGeometry(0.072, 0.072, 0.24), M.tan, 0.022, -0.185, 0.20);
  armR.rotation.x = 0.5;
  const handL = add(new T.BoxGeometry(0.10, 0.115, 0.155), M.glove, -0.015, -0.062, -0.42);
  const armL = add(new T.BoxGeometry(0.070, 0.070, 0.28), M.tan, -0.062, -0.125, -0.26);
  armL.rotation.set(0.30, 0.26, 0);

  // 枪口位置（局部）
  const muzzle = new T.Object3D();
  muzzle.position.set(0, 0.012, -0.95);
  vm.add(muzzle);

  // 枪口火光
  const flashMat = new T.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
  const flash = new T.Mesh(new T.ConeGeometry(0.075, 0.24, 6), flashMat);
  flash.rotation.x = -Math.PI / 2;
  flash.position.set(0, 0.012, -1.02);
  vm.add(flash);
  // 火光的十字片
  const flash2 = new T.Mesh(new T.PlaneGeometry(0.3, 0.18), flashMat);
  flash2.position.set(0, 0.012, -0.99);
  vm.add(flash2);

  const flashLight = new T.PointLight(0xffc070, 0, 14, 2);
  flashLight.position.set(0, 0.0, -1.0);
  vm.add(flashLight);

  vm.userData = { muzzle, flash, flash2, flashLight, mag, redDot, scope, lens, barrel };
  // ADS 时隐藏手与手臂，避免遮挡中心视野
  vm.userData.adsHide = [handL, handR, armL, armR, mag, grip, stock, recv, rail];
  vm.userData.adsKeep = [hand];
  // 基础位置（腰射）
  vm.scale.setScalar(0.62);
  const SC = 0.62;
  vm.userData.hipPos = new T.Vector3(0.255, -0.205, -0.46);
  vm.userData.adsPos = new T.Vector3(0.0, -0.128 * SC, -0.30);
  vm.userData.hipRot = 0.075;
  vm.rotation.y = vm.userData.hipRot;
  vm.position.copy(vm.userData.hipPos);

  camera.add(vm);
  DF.viewModel = vm;
  return vm;
};

/* ---------------- 特效系统 ---------------- */
DF.createEffects = function (scene) {
  const FX = { tracerPool: [], impactPool: [], sparks: [], debris: [], bloods: [], muzzleT: 0 };
  // 曳光弹
  const tracerGeo = new T.CylinderGeometry(0.009, 0.009, 1, 5, 1, true);
  tracerGeo.translate(0, 0.5, 0);
  for (let i = 0; i < 40; i++) {
    const mat = new T.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
    const mesh = new T.Mesh(tracerGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    FX.tracerPool.push({ mesh, life: 0, max: 0.07 });
  }
  // 弹着点
  const impGeo = new T.CircleGeometry(0.10, 10);
  for (let i = 0; i < 30; i++) {
    const mat = new T.MeshBasicMaterial({ color: 0x2a2418, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide });
    const mesh = new T.Mesh(impGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    FX.impactPool.push({ mesh, life: 0, max: 1.6 });
  }
  // 血雾粒子
  const bGeo = new T.SphereGeometry(0.05, 5, 4);
  for (let i = 0; i < 60; i++) {
    const mat = new T.MeshBasicMaterial({ color: 0xb01c14, transparent: true, opacity: 0 });
    const mesh = new T.Mesh(bGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    FX.bloods.push({ mesh, life: 0, max: 0.5, vel: new T.Vector3() });
  }
  // 火花
  for (let i = 0; i < 40; i++) {
    const mat = new T.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
    const mesh = new T.Mesh(new T.SphereGeometry(0.022, 4, 3), mat);
    mesh.visible = false;
    scene.add(mesh);
    FX.sparks.push({ mesh, life: 0, max: 0.28, vel: new T.Vector3() });
  }

  FX.tracer = function (from, to, color) {
    const t = FX.tracerPool.find(x => x.life <= 0);
    if (!t) return;
    const dir = _v1.subVectors(to, from);
    const len = dir.length();
    if (len < 0.2) return;
    t.mesh.position.copy(from);
    t.mesh.quaternion.setFromUnitVectors(_v2.set(0, 1, 0), dir.normalize());
    t.mesh.scale.set(1, len, 1);
    t.mesh.material.color.set(color || 0xffd88a);
    t.mesh.material.opacity = 0.55;
    t.mesh.visible = true;
    t.life = t.max;
  };
  FX.impact = function (point, normal) {
    const p = FX.impactPool.find(x => x.life <= 0);
    if (p) {
      p.mesh.position.copy(point).addScaledVector(normal, 0.012);
      p.mesh.lookAt(_v1.copy(point).add(normal));
      p.mesh.material.opacity = 0.85;
      p.mesh.visible = true;
      p.life = p.max;
    }
    for (let i = 0; i < 4; i++) {
      const s = FX.sparks.find(x => x.life <= 0);
      if (!s) break;
      s.mesh.position.copy(point);
      s.vel.set(rnd(-2, 2), rnd(0.5, 3.5), rnd(-2, 2)).addScaledVector(normal, 1.5);
      s.mesh.material.opacity = 1;
      s.mesh.visible = true;
      s.life = s.max;
    }
  };
  FX.blood = function (point) {
    for (let i = 0; i < 7; i++) {
      const b = FX.bloods.find(x => x.life <= 0);
      if (!b) break;
      b.mesh.position.copy(point);
      b.vel.set(rnd(-2.2, 2.2), rnd(-0.5, 2.6), rnd(-2.2, 2.2));
      b.mesh.material.opacity = 0.9;
      b.mesh.visible = true;
      b.life = b.max;
      b.mesh.scale.setScalar(rnd(0.6, 1.6));
    }
  };
  FX.flash = function () {
    const vm = DF.viewModel;
    if (!vm) return;
    vm.userData.flash.material.opacity = 1;
    vm.userData.flash2.material.opacity = 0.9;
    vm.userData.flashLight.intensity = 3.2;
    vm.userData.flash.rotation.z = Math.random() * 3;
    vm.userData.flash.scale.setScalar(rnd(0.75, 1.25));
    FX.muzzleT = 0.055;
  };
  FX.update = function (dt) {
    for (const t of FX.tracerPool) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / t.max) * 0.55;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (const p of FX.impactPool) {
      if (p.life > 0) {
        p.life -= dt;
        p.mesh.material.opacity = Math.max(0, p.life / p.max) * 0.85;
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
    for (const s of FX.sparks) {
      if (s.life > 0) {
        s.life -= dt;
        s.vel.y -= 9 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        s.mesh.material.opacity = Math.max(0, s.life / s.max);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
    for (const b of FX.bloods) {
      if (b.life > 0) {
        b.life -= dt;
        b.vel.y -= 9 * dt;
        b.mesh.position.addScaledVector(b.vel, dt);
        b.mesh.material.opacity = Math.max(0, b.life / b.max) * 0.9;
        if (b.life <= 0) b.mesh.visible = false;
      }
    }
    if (FX.muzzleT > 0) {
      FX.muzzleT -= dt;
      const vm = DF.viewModel;
      if (vm) {
        if (FX.muzzleT <= 0) {
          vm.userData.flash.material.opacity = 0;
          vm.userData.flash2.material.opacity = 0;
          vm.userData.flashLight.intensity = 0;
        } else {
          vm.userData.flashLight.intensity = FX.muzzleT * 58;
        }
      }
    }
  };
  DF.fx = FX;
  return FX;
};

/* ============================================================
   命中判定（房主权威）
   ============================================================ */
DF.traceShot = function (origin, dir, maxDist, shooterId) {
  // 所有场景几何（包括地面）都必须正常阻挡射线
  const wh = DF.raycastWorld(origin, dir, maxDist);
  let best = { hit: false, dist: maxDist, type: 'none' };
  if (wh) {
    best.hit = true; best.type = 'world'; best.dist = wh.distance;
    best.point = wh.point.clone();
    best.normal = wh.face ? wh.face.normal.clone().transformDirection(wh.object.matrixWorld) : new T.Vector3(0, 1, 0);
    best.worldObject = wh.object;
  }
  const maxD = best.hit ? best.dist : maxDist;
  DF.players.forEach(p => {
    if (!p.alive || p.id === shooterId) return;
    // ---- 三段命中盒（贴合角色模型实际尺寸） ----
    // 站立：脚 0 → 腿顶 0.83 → 躯干顶 1.49 → 头顶 1.75
    const ck = p.crouch ? 0.70 : 1;              // 蹲下时整体压低
    const legTop = p.pos.y + 0.83 * ck;
    const chestTop = p.pos.y + 1.40 * ck;
    const headY = p.pos.y + 1.66 * ck;           // 头部中心
    const headR = 0.17;

    let bestPart = null, bestT = Infinity;
    const within = (t) => t >= 0 && t < maxD && t < best.dist;

    // 头（球体）
    const tHead = raySphere(origin, dir, _v3.set(p.pos.x, headY, p.pos.z), headR);
    if (within(tHead)) { bestPart = 'head'; bestT = tHead; }

    // 躯干（胶囊：腿顶 → 胸部顶端）
    const tb = rayCapsuleY(origin, dir, _v4.set(p.pos.x, legTop, p.pos.z), Math.max(0.2, chestTop - legTop), 0.29);
    // 头部优先：只要射线确实穿过头球，就判爆头（避免被躯干胶囊的球冠抢占）
    if (bestPart === 'head') {
      // 保持 head
    } else if (within(tb) && tb < bestT) { bestPart = 'body'; bestT = tb; }

    // 腿（胶囊：从地面下方开始，确保与地面相接的腿部也能命中）
    const legBase = p.pos.y - 0.10;
    const tl = rayCapsuleY(origin, dir, _v4.set(p.pos.x, legBase, p.pos.z),
      Math.max(0.30, legTop - legBase), 0.27);
    if (within(tl) && tl < bestT) { bestPart = 'leg'; bestT = tl; }

    if (bestPart) {
      best = {
        hit: true, type: 'player', part: bestPart, dist: bestT, player: p,
        point: origin.clone().addScaledVector(dir, bestT), normal: dir.clone().negate()
      };
    }
  });
  return best;
};

/* ============================================================
   机器人 AI
   ============================================================ */
DF.updateBot = function (bot, dt) {
  if (!bot.alive) return;
  const t = DF.time;
  if (t > bot.botNextThink) {
    bot.botNextThink = t + rnd(0.35, 0.9);
    // 找最近的活着的敌人
    let nearest = null, nd = 1e9;
    DF.players.forEach(p => {
      if (!p.alive || p.id === bot.id) return;
      const d = p.pos.distanceTo(bot.pos);
      if (d < nd) { nd = d; nearest = p; }
    });
    if (nearest && nd < 62) {
      bot.botTargetPlayer = nearest.id;
      bot.botState = nd < 40 ? 'attack' : 'chase';
    } else {
      bot.botState = 'roam';
      if (!bot.botTarget || bot.pos.distanceTo(bot.botTarget) < 4 || Math.random() < 0.25) {
        const s = DF.spawns[rndInt(0, DF.spawns.length - 1)];
        bot.botTarget.set(s.x + rnd(-12, 12), 0, s.z + rnd(-12, 12));
      }
    }
    if (Math.random() < 0.4) bot.botStrafe = rnd(-1, 1);
  }
  const target = DF.players.get(bot.botTargetPlayer);
  let aimPos = null;
  if ((bot.botState === 'attack' || bot.botState === 'chase') && target && target.alive) {
    aimPos = target.pos;
    // 瞄准（带误差/延迟）
    const eye = _v1.set(bot.pos.x, bot.pos.y + 1.62, bot.pos.z);
    const tgt = _v2.set(target.pos.x, target.pos.y + (target.crouch ? 0.9 : 1.35), target.pos.z);
    const toT = tgt.clone().sub(eye);
    const wantYaw = Math.atan2(-toT.x, -toT.z);
    const wantPitch = Math.asin(clamp(toT.y / toT.length(), -1, 1));
    bot.yaw = angLerp(bot.yaw, wantYaw + rnd(-0.045, 0.045), Math.min(1, dt * 4.2));
    bot.pitch = lerp(bot.pitch, wantPitch + rnd(-0.03, 0.03), Math.min(1, dt * 4.2));
    // 距离决定是否开火
    if (bot.botState === 'attack' && DF.time - bot.lastFire > CFG.fireRate * rnd(1.6, 4.5)) {
      if (bot.ammo <= 0) { DF.startReload(bot); }
      else {
        DF.botFire(bot, target);
      }
    }
    if (bot.ammo < 8 && !bot.reloading) DF.startReload(bot);
  } else {
    // 游走
    const to = _v1.subVectors(bot.botTarget, bot.pos); to.y = 0;
    const wantYaw = Math.atan2(-to.x, -to.z);
    bot.yaw = angLerp(bot.yaw, wantYaw, Math.min(1, dt * 2.2));
    bot.pitch = lerp(bot.pitch, 0, Math.min(1, dt));
  }
  // 移动输入
  const dist = aimPos ? bot.pos.distanceTo(aimPos) : bot.pos.distanceTo(bot.botTarget);
  let fwd = 0, side = 0;
  if (bot.botState === 'attack') {
    fwd = dist > 16 ? 1 : (dist < 7 ? -0.6 : 0);
    side = bot.botStrafe;
  } else if (bot.botState === 'chase') {
    fwd = 1; side = bot.botStrafe * 0.5;
  } else {
    fwd = 1;
  }
  // 用 yaw 方向前进
  const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
  const rx = Math.cos(bot.yaw), rz = -Math.sin(bot.yaw);
  bot.input.f = fwd; bot.input.s = side;
  bot.input.jump = false; bot.input.fire = false; bot.input.ads = bot.botState === 'attack' && dist > 12;
  bot.input.sprint = false;
  DF.applyMovement(bot, bot.input, dt);
};

DF.botFire = function (bot, target) {
  const t = DF.time;
  if (t - bot.lastFire < CFG.fireRate) return;
  bot.lastFire = t;
  if (bot.ammo <= 0) { DF.startReload(bot); return; }
  bot.ammo--;
  DF.onShotFired(bot);
  const origin = new T.Vector3(bot.pos.x, bot.pos.y + 1.62, bot.pos.z);
  const dir = new T.Vector3(0, 0, -1).applyEuler(new T.Euler(bot.pitch, bot.yaw, 0, 'YXZ'));
  // 命中率随距离衰减
  const d = origin.distanceTo(target.pos);
  const err = 0.004 + d * 0.0016 + (bot.input.sprint ? 0.02 : 0);
  dir.x += rnd(-err, err); dir.y += rnd(-err, err) * 0.7; dir.z += rnd(-err, err);
  dir.normalize();
  DF.hostShoot(bot, origin, dir, true);
};

/* ============================================================
   射击结算（房主权威执行）
   ============================================================ */
DF.hostShoot = function (shooter, origin, dir, isBot) {
  DF.fx.tracer(origin.clone().addScaledVector(dir, 0.6), origin.clone().addScaledVector(dir, 60), shooter.id === DF.myId ? 0xffe0a0 : 0xffb060);
  const res = DF.traceShot(origin, dir, 140, shooter.id);
  if (!res.hit) return;
  if (res.type === 'world') {
    DF.fx.impact(res.point, res.normal);
    DF.net && DF.net.hostBroadcastFx({ t: 'imp', p: [res.point.x, res.point.y, res.point.z], n: [res.normal.x, res.normal.y, res.normal.z] });
    return;
  }
  const victim = res.player;
  DF.fx.blood(res.point);
  DF.net && DF.net.hostBroadcastFx({ t: 'bld', p: [res.point.x, res.point.y, res.point.z] });
  const dmg = res.part === 'head' ? CFG.dmgHead : (res.part === 'leg' ? CFG.dmgLeg : CFG.dmgBody);
  DF.hostDamage(victim.id, dmg, shooter.id, res.part);
};

DF.hostDamage = function (victimId, dmg, attackerId, part) {
  const v = DF.players.get(victimId);
  if (!v || !v.alive) return;
  const att = DF.players.get(attackerId);
  if (att) att.hits += 1;
  // 护甲在权威伤害入口统一结算，腿部护甲效果略低。
  const armor = Math.max(0, Math.min(0.55, v.armor || 0));
  dmg = Math.max(1, Math.round(dmg * (1 - armor * (part === 'leg' ? 0.9 : 1))));
  v.hp -= dmg;
  v.lastDamageTime = DF.time;
  v.lastAttacker = attackerId;
  if (v.hp <= 0) {
    v.hp = 0;
    v.alive = false;
    v.deaths++;
    v.respawnAt = DF.time + CFG.respawnTime;
    if (att && att.id !== v.id) {
      att.kills++;
      if (att.kills >= CFG.killTarget) DF.M.gameEnd && DF.M.gameEnd(att.id);
    }
    DF.onKill(att, v, part);
    if (v.isLocal) DF.M.onLocalDeath && DF.M.onLocalDeath(attackerId);
  } else {
    DF.M.onDamage && DF.M.onDamage(v, att, dmg, part);
  }
  // 广播
  DF.net && DF.net.hostBroadcast({ t: 'hp', id: v.id, hp: v.hp, by: attackerId, part });
};

DF.onKill = function (att, v, part) {
  const kn = att ? att.name : '环境';
  const txt = `<b style="color:${att ? att.color : '#999'}">${escapeHtml(kn)}</b> <span class="hs">[${part === 'head' ? '爆头' : part === 'leg' ? '腿部' : '击杀'}]</span> <b style="color:${v.color}">${escapeHtml(v.name)}</b>`;
  DF.pushKillfeed(txt);
  DF.M.onKillLocal && DF.M.onKillLocal(att, v, part);
  DF.net && DF.net.hostBroadcast({ t: 'kf', a: kn, ac: att ? att.color : '#999', v: v.name, vc: v.color, part });
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
DF.escapeHtml = escapeHtml;

/* ============================================================
   移动物理（房主与本地共用）
   ============================================================ */
DF.applyMovement = function (p, input, dt) {
  if (!p.alive) { p.vel.set(0, 0, 0); return; }
  const sprinting = input.sprint && input.f > 0.5 && !input.ads;
  p.sprint = sprinting;
  p.crouch = !!input.crouch;
  p.ads = !!input.ads;
  let speed = p.crouch ? CFG.crouchSpeed : (p.ads ? CFG.adsSpeed : (sprinting ? CFG.sprint : CFG.walk));
  // 方向
  const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
  let mx = (-s * input.f) + (c * input.s);
  let mz = (-c * input.f) + (-s * input.s);
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const targetVx = mx * speed, targetVz = mz * speed;
  const accel = p.onGround ? 15 : 4.5;
  p.vel.x = lerp(p.vel.x, targetVx, Math.min(1, accel * dt));
  p.vel.z = lerp(p.vel.z, targetVz, Math.min(1, accel * dt));
  // 跳跃/重力
  if (input.jump && p.onGround) {
    p.vy = CFG.jumpV; p.onGround = false;
  }
  p.vy -= CFG.gravity * dt;
  // 位移
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;
  p.pos.y += p.vy * dt;
  // 落地
  if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.onGround = true; }
  // 站立在低矮物体上
  let standY = 0;
  for (let i = 0; i < DF.colliders.length; i++) {
    const cd = DF.colliders[i];
    if (cd.maxy > 1.4) continue; // 只允许踩上矮物体
    if (p.pos.x > cd.minx - 0.25 && p.pos.x < cd.maxx + 0.25 &&
        p.pos.z > cd.minz - 0.25 && p.pos.z < cd.maxz + 0.25 &&
        cd.maxy <= p.pos.y + 0.35 && cd.maxy > standY) {
      standY = cd.maxy;
    }
  }
  if (p.pos.y < standY) { p.pos.y = standY; p.vy = 0; p.onGround = true; }
  DF.collideMove(p.pos, CFG.radius);
  // 安全网：掉出地图
  if (p.pos.y < -20) { p.pos.set(0, 0, 0); p.vy = 0; }
};

DF.regenTick = function (dt) {
  DF.players.forEach(p => {
    if (!p.alive || p.hp >= CFG.maxHp) return;
    if (DF.time - (p.lastDamageTime || 0) < 7.5) return;
    p.hp = Math.min(CFG.maxHp, p.hp + 9 * dt);
  });
};

DF.startReload = function (p) {
  if (p.reloading || p.ammo >= CFG.mag || p.reserve <= 0) return;
  p.reloading = true;
  p.reloadEnd = DF.time + CFG.reloadTime;
  DF.net && DF.net.hostBroadcast({ t: 'rl', id: p.id });
};
DF.finishReload = function (p) {
  if (!p.reloading) return;
  p.reloading = false;
  const need = CFG.mag - p.ammo;
  const take = Math.min(need, p.reserve);
  p.ammo += take; p.reserve -= take;
  DF.net && DF.net.hostBroadcast({ t: 'sa', id: p.id, ammo: p.ammo, res: p.reserve });
};
