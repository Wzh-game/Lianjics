/* ============================================================
   载具系统 v1（三角洲行动风格皮卡/轻型突击车）
   - 每张地图固定出生点（随地图缓存进出场景）
   - 靠近按 F 上车；F 下车（右侧门）；WASD 驾驶，A/D 转向
   - 鼠标视角独立（车内环视）；方向键油门时速度显示 km/h
   - 碰撞：圆形载具 vs 世界 AABB/圆形碰撞（经 DF.collideMove）
   - 单人/房主可驾驶；联机客人暂不可驾驶（房间主机权威，v1 限制）
   ============================================================ */
(function () {
  'use strict';
  if (typeof DF === 'undefined') return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------- 车辆模型（低多边形风格） ---------------- */
  DF.makeVehicle = function () {
    const T_ = T;
    const g = new T.Group();
    const olive = new T_.MeshStandardMaterial({ color: 0x46512f, roughness: 0.72, metalness: 0.18, flatShading: true });
    const oliveD = new T_.MeshStandardMaterial({ color: 0x323b22, roughness: 0.8, metalness: 0.12, flatShading: true });
    const glass = new T_.MeshStandardMaterial({ color: 0x1d2f38, roughness: 0.22, metalness: 0.65 });
    const dark = new T_.MeshStandardMaterial({ color: 0x1c1f18, roughness: 0.6, metalness: 0.35 });
    const tire = new T_.MeshStandardMaterial({ color: 0x141512, roughness: 0.95 });
    const rim = new T_.MeshStandardMaterial({ color: 0x8f8a76, roughness: 0.35, metalness: 0.7 });
    const light = new T_.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf8a, emissiveIntensity: 0.55 });
    const tail = new T_.MeshStandardMaterial({ color: 0xff4433, emissive: 0x881111, emissiveIntensity: 0.8 });

    const add = (geo, mat, x, y, z) => {
      const m = new T_.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // 底盘（车头朝 -Z）
    add(new T_.BoxGeometry(2.0, 0.52, 4.15), olive, 0, 0.78, 0);
    // 车头（机舱盖）
    add(new T_.BoxGeometry(1.86, 0.34, 1.05), olive, 0, 1.10, -1.52);
    // 驾驶室
    add(new T_.BoxGeometry(1.88, 0.66, 1.95), olive, 0, 1.32, -0.42);
    // 挡风玻璃（前倾）
    const ws = add(new T_.BoxGeometry(1.68, 0.46, 0.07), glass, 0, 1.42, -1.38);
    ws.rotation.x = 0.32;
    // 车顶
    add(new T_.BoxGeometry(1.98, 0.12, 2.0), oliveD, 0, 1.70, -0.42);
    // 车厢（开放式）前壁
    add(new T_.BoxGeometry(1.9, 0.34, 0.1), oliveD, 0, 1.20, 0.66);
    // 车厢侧壁
    add(new T_.BoxGeometry(0.1, 0.34, 1.5), oliveD, -0.92, 1.20, 1.38);
    add(new T_.BoxGeometry(0.1, 0.34, 1.5), oliveD, 0.92, 1.20, 1.38);
    // 车厢后壁
    add(new T_.BoxGeometry(1.9, 0.34, 0.1), oliveD, 0, 1.20, 2.10);
    // 防撞保险杠（前/后）
    add(new T_.BoxGeometry(2.06, 0.22, 0.16), dark, 0, 0.66, -2.16);
    add(new T_.BoxGeometry(2.06, 0.22, 0.16), dark, 0, 0.66, 2.16);
    // 车顶机枪架（无武器，外观点）
    add(new T_.BoxGeometry(0.34, 0.1, 0.34), dark, 0, 1.80, -0.15);
    // 天线
    const ant = add(new T_.CylinderGeometry(0.02, 0.02, 1.35, 6), dark, 0.82, 2.35, 0.45);
    ant.castShadow = false;
    // 大灯 ×2 / 尾灯 ×2
    add(new T_.BoxGeometry(0.34, 0.12, 0.06), light, -0.62, 0.98, -2.085).castShadow = false;
    add(new T_.BoxGeometry(0.34, 0.12, 0.06), light, 0.62, 0.98, -2.085).castShadow = false;
    add(new T_.BoxGeometry(0.30, 0.10, 0.06), tail, -0.62, 0.98, 2.085).castShadow = false;
    add(new T_.BoxGeometry(0.30, 0.10, 0.06), tail, 0.62, 0.98, 2.085).castShadow = false;

    // 车轮（前轮可视转向）
    const wheels = [];
    const frontAxle = [];
    const wheelDefs = [
      { x: -1.02, z: -1.32, front: true }, { x: 1.02, z: -1.32, front: true },
      { x: -1.02, z: 1.34, front: false }, { x: 1.02, z: 1.34, front: false }
    ];
    wheelDefs.forEach(d => {
      const pivot = new T_.Group();          // 转向（yaw）
      pivot.position.set(d.x, 0.46, d.z);
      const spinner = new T_.Group();        // 滚动（绕轴 x）
      const w = new T_.Mesh(new T_.CylinderGeometry(0.46, 0.46, 0.34, 14), tire);
      w.rotation.z = Math.PI / 2;
      w.castShadow = true;
      const rimM = new T_.Mesh(new T_.CylinderGeometry(0.2, 0.2, 0.36, 10), rim);
      rimM.rotation.z = Math.PI / 2;
      spinner.add(w, rimM);
      pivot.add(spinner);
      g.add(pivot);
      wheels.push(spinner);
      if (d.front) frontAxle.push(pivot);
    });
    // 备胎
    const spare = new T_.Mesh(new T_.CylinderGeometry(0.4, 0.4, 0.24, 12), tire);
    spare.position.set(0, 1.32, 2.18); spare.rotation.x = Math.PI / 2; spare.castShadow = true;
    g.add(spare);

    g.userData = { wheels, frontAxle, wheelSpin: 0 };
    return g;
  };

  /* ---------------- 每张地图的出生点 ---------------- */
  const SPAWNS = {
    base: [[16, 10]],
    outpost: [[13, -15]],
    oilfield: [[15, 9]],
    urban: [[-15, 11]],
    harbor: [[19, 7]],
    frontier: [[12, 15], [4, -1132]]
  };

  const MAXV = 23, ACC = 10.5, REV = 8.5, R_ACC = 7.5;

  DF.spawnMapVehicles = function (scene, mapId) {
    DF.worldVehicles = [];
    const spots = SPAWNS[mapId] || [];
    spots.forEach(([sx, sz], i) => {
      // 出生点自动避让静态碰撞（推出半径取 2.2m，保证出生不被卡住）
      const pv = { x: sx, y: 0, z: sz };
      DF.collideMove(pv, 2.2);
      const x = pv.x, z = pv.z;
      const mesh = DF.makeVehicle();
      const heading = i === 0 ? Math.PI * 0.12 : 0;
      mesh.position.set(x, 0, z);
      mesh.rotation.y = heading;
      scene.add(mesh);
      const v = {
        id: 'veh' + i, mesh, x, z, y: 0, heading, speed: 0,
        radius: 1.8, occupied: false
      };
      mesh.userData.vehicle = v;
      DF.worldVehicles.push(v);
    });
    DF.vehicles = DF.worldVehicles.slice();
  };

  /* 地图缓存包装：applyMap 会在切换地图时恢复/隐藏载具 */
  DF.applyVehiclesCache = function (entry, isNew) {
    if (!entry) return;
    if (isNew && DF.worldVehicles) entry.vehicles = DF.worldVehicles.slice();
    DF.vehicles = entry.vehicles ? entry.vehicles.slice() : [];
  };

  /* ---------------- 上/下车 ---------------- */
  DF.nearestVehicle = function (me, maxD) {
    if (!DF.vehicles) return null;
    let best = null, bd = maxD || 2.6;
    for (const v of DF.vehicles) {
      const d = Math.hypot(me.pos.x - v.x, me.pos.z - v.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  };

  DF.enterVehicle = function (v) {
    const me = DF.players.get(DF.myId);
    if (!me || !me.alive) return;
    if (DF.mode === 'guest') { DF.toast('联机时载具仅房主可驾驶'); return; }
    if (v.occupied) { DF.toast('载具已被占用'); return; }
    v.occupied = true;
    DF.driveVehicle = v;
    me.yaw = v.heading;
    me.vel.set(0, 0, 0);
    me.sprint = false; me.crouch = false;
    DF.toast('已上车 — WASD 驾驶 / A·D 转向 / F 下车');
  };

  DF.exitVehicle = function (silent) {
    const v = DF.driveVehicle;
    if (!v) return;
    const me = DF.players.get(DF.myId);
    v.occupied = false;
    v.speed = 0;
    // 右侧下车
    const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
    const rx = -fz, rz = fx;
    const p = { x: v.x + rx * 2.6, y: 0, z: v.z + rz * 2.6 };
    DF.collideMove(p, CFG.radius);
    if (me) {
      me.pos.set(p.x, 0, p.z);
      me.vel.set(0, 0, 0);
      me.vy = 0;
    }
    DF.driveVehicle = null;
    if (!silent) DF.toast('已下车');
  };

  /* ---------------- 驾驶物理 + 相机占位 ----------------
     在 applyMovement 原位替换：旋转方向盘并沿车头方向推进。 */
  DF.driveVehicleUpdate = function (p, input, dt) {
    const v = DF.driveVehicle;
    if (!v) { DF.applyMovement(p, input, dt); return; }
    if (!p.alive) { DF.exitVehicle(true); p.vel.set(0, 0, 0); return; }
    p.sprint = false; p.crouch = false;
    const throttle = clamp(input.f || 0, -1, 1);
    // 油门 / 刹车 / 倒车
    if (throttle > 0) v.speed += ACC * throttle * dt;
    else if (throttle < 0) {
      if (v.speed > 0.6) v.speed += R_ACC * throttle * dt;      // 制动
      else v.speed += ACC * 0.68 * throttle * dt;                // 倒车
    } else {
      v.speed *= Math.max(0, 1 - 1.65 * dt);                      // 滑行阻尼
      if (Math.abs(v.speed) < 0.15) v.speed = 0;
    }
    v.speed = clamp(v.speed, -REV, MAXV);
    // 转向（低速不转、倒车镜像）
    const grip = clamp(Math.abs(v.speed) / 6.5, 0, 1);
    const dir = v.speed >= 0 ? 1 : -1;
    v.heading -= (input.s || 0) * 1.55 * grip * dir * dt;
    // 位移 + 碰撞
    const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
    v.x += fx * v.speed * dt;
    v.z += fz * v.speed * dt;
    const preX = v.x, preZ = v.z;
    const pv = { x: v.x, y: 0, z: v.z };
    DF.collideMove(pv, v.radius);
    const impact = Math.hypot(pv.x - preX, pv.z - preZ);
    v.x = pv.x; v.z = pv.z;
    // 同步车体与玩家实体
    v.mesh.position.set(v.x, 0, v.z);
    v.mesh.rotation.y = v.heading;   // 模型车头 -Z，与玩家 yaw 约定一致
    p.pos.set(v.x, 0, v.z);
    p.vel.set(fx * v.speed, 0, fz * v.speed);
    p.vy = 0; p.onGround = true;
    p.sprint = false;
    // 撞击减速
    if (impact > 0.02) v.speed *= (1 - clamp(impact * 1.4, 0.18, 0.5));
    // 车轮滚动 + 前轮转向可视
    const ud = v.mesh.userData;
    ud.wheelSpin += (v.speed / 0.46) * dt;
    ud.wheels.forEach(w => { w.rotation.x = ud.wheelSpin; });
    const steerVis = clamp(input.s || 0, -1, 1) * 0.42;
    ud.frontAxle.forEach(w => { w.rotation.y = lerp(w.rotation.y, -steerVis, Math.min(1, dt * 10)); });
  };

  /* ---------------- 每帧：提示 HUD / 车与人的挤压 ---------------- */
  let hintEl = null;
  function getHint() {
    if (hintEl) return hintEl;
    const hud = document.getElementById('hud');
    if (!hud) return null;
    hintEl = document.createElement('div');
    hintEl.id = 'vehicle-hint';
    hintEl.style.cssText = 'position:absolute;left:50%;bottom:118px;transform:translateX(-50%);' +
      'background:rgba(10,14,8,.78);border:1px solid #4a5a38;border-left:3px solid #ff8c1a;' +
      'color:#ffe9b0;font-size:13px;letter-spacing:2px;padding:7px 16px;display:none;white-space:nowrap;z-index:5;';
    hud.appendChild(hintEl);
    return hintEl;
  }

  DF.updateVehicles = function (dt) {
    if (!DF.vehicles) return;
    const me = DF.players.get(DF.myId);
    // 玩家-车体挤压（未驾驶时）
    if (me && me.alive && !DF.driveVehicle) {
      for (const v of DF.vehicles) {
        const dx = me.pos.x - v.x, dz = me.pos.z - v.z;
        const rr = v.radius + CFG.radius * 0.6;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          me.pos.x = v.x + (dx / d) * rr;
          me.pos.z = v.z + (dz / d) * rr;
        }
      }
    }
    // 提示条
    const hint = getHint();
    if (hint) {
      if (DF.driveVehicle) {
        const kmh = Math.round(Math.abs(DF.driveVehicle.speed) * 3.6);
        hint.textContent = `🚗 ${kmh} km/h · F 下车`;
        hint.style.display = 'block';
      } else if (me && me.alive && DF.matchRunning && !DF.paused) {
        const nv = DF.nearestVehicle(me, 2.6);
        if (nv) {
          hint.textContent = '按 F 上车 · 突击车';
          hint.style.display = 'block';
        } else {
          hint.style.display = 'none';
        }
      } else {
        hint.style.display = 'none';
      }
    }
  };
})();
