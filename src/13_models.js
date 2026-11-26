/* ============================================================
   3D 模型工厂（程序化 · 零外部资源）
   —— 9 种战利品 + 4 种搜索容器的精细低多边形模型
   —— DF.Models.loot(key)  /  DF.Models.container(type)
   —— DF.Models.thumb(key) 离屏渲染成 dataURL，供 UI 当图标用
   ============================================================ */
(function () {
  'use strict';
  const T = window.THREE;
  if (!T) return;

  /* ---------------- 材质缓存 ---------------- */
  const matCache = {};
  function mat(color, rough, metal, opts) {
    opts = opts || {};
    const key = [color, rough, metal, opts.emissive || 0, opts.emissiveIntensity || 1, opts.opacity == null ? 1 : opts.opacity].join('|');
    if (matCache[key]) return matCache[key];
    const m = new T.MeshStandardMaterial({
      // r128 未启用色彩管理：把 sRGB 十六进制转成线性，避免整体发灰发白
      color: new T.Color(color).convertSRGBToLinear(),
      roughness: rough,
      metalness: metal,
      emissive: opts.emissive ? new T.Color(opts.emissive).convertSRGBToLinear() : 0x000000,
      emissiveIntensity: opts.emissiveIntensity == null ? 1 : opts.emissiveIntensity,
      transparent: (opts.opacity == null ? 1 : opts.opacity) < 1,
      opacity: opts.opacity == null ? 1 : opts.opacity,
      side: opts.double ? T.DoubleSide : T.FrontSide
    });
    matCache[key] = m;
    return m;
  }
  const C = {
    steel: 0x8b939a, steelDark: 0x414a50, gunmetal: 0x2b3136,
    olive: 0x4d5436, oliveDark: 0x333a24, tan: 0x8a7f63,
    wood: 0x7a5530, woodDark: 0x513618,
    white: 0xd9dcd2, red: 0xb4372c, gold: 0xd8ab4a,
    glass: 0x9fd8e8, green: 0x4a7a3a, black: 0x1b1e20,
    pcb: 0x1d3a2a, copper: 0xb4743a, yellow: 0xd8b83a
  };
  const B = (w, h, d) => new T.BoxGeometry(w, h, d);
  const CY = (r, h, seg) => new T.CylinderGeometry(r, r, h, seg || 14);
  const SP = (r, a, b, c, d, e, f) => new T.SphereGeometry(r, a || 16, b || 12, c, d, e, f);
  const TO = (r, t, seg) => new T.TorusGeometry(r, t, 8, seg || 20);

  function put(g, geo, material, x, y, z, rx, ry, rz) {
    const m = new T.Mesh(geo, material);
    m.position.set(x || 0, y || 0, z || 0);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }
  function group() {
    const g = new T.Group();
    g.userData.mats = [];
    return g;
  }

  /* ============================================================
     战利品模型（尺寸约 0.25~0.45m，原点居中）
     ============================================================ */
  const LOOT_BUILDERS = {

    /* 5.56 弹药箱 */
    ammo(g) {
      const body = mat(C.olive, 0.72, 0.35), dark = mat(C.oliveDark, 0.8, 0.3);
      const steel = mat(C.steel, 0.45, 0.85), brass = mat(C.gold, 0.35, 0.95);
      put(g, B(0.34, 0.15, 0.20), body, 0, 0.075, 0);                 // 箱体
      put(g, B(0.355, 0.025, 0.215), dark, 0, 0.158, 0);              // 盖
      put(g, B(0.355, 0.012, 0.215), dark, 0, 0.012, 0);              // 底沿
      [-0.13, 0.13].forEach(x => {                                    // 锁扣
        put(g, B(0.03, 0.05, 0.012), steel, x, 0.115, 0.107);
        put(g, B(0.03, 0.05, 0.012), steel, x, 0.115, -0.107);
      });
      put(g, B(0.10, 0.016, 0.016), steel, 0, 0.185, 0);              // 提手
      [-0.035, 0, 0.035].forEach((x, i) => {                          // 弹链
        put(g, CY(0.011, 0.075, 8), brass, 0.09 + i * 0.001, 0.185, x, Math.PI / 2);
      });
      put(g, B(0.13, 0.045, 0.004), mat(C.white, 0.85, 0.05), -0.09, 0.09, 0.101); // 标签
      put(g, B(0.03, 0.03, 0.005), mat(C.red, 0.8, 0.05), 0.13, 0.09, 0.101);
    },

    /* 急救绷带（卷） */
    meds(g) {
      const cloth = mat(C.white, 0.92, 0.02), pouch = mat(C.green, 0.8, 0.1);
      const red = mat(C.red, 0.7, 0.05);
      const roll = put(g, CY(0.058, 0.13, 18), cloth, -0.04, 0.058, 0, 0, 0, Math.PI / 2);
      roll.rotation.z = Math.PI / 2;
      put(g, CY(0.024, 0.132, 12), mat(0xe6e8dd, 0.9, 0.02), -0.04, 0.058, 0, 0, 0, Math.PI / 2);
      for (let i = 0; i < 3; i++) {                                   // 缠绕纹
        put(g, TO(0.060, 0.004, 16), mat(0xc9ccc2, 0.95, 0.02), -0.04 + (i - 1) * 0.038, 0.058, 0, 0, Math.PI / 2, 0);
      }
      // 急救包
      put(g, B(0.16, 0.10, 0.11), pouch, 0.16, 0.05, 0);
      put(g, B(0.17, 0.022, 0.12), mat(0x3d4a30, 0.85, 0.1), 0.16, 0.105, 0);
      put(g, B(0.075, 0.022, 0.004), red, 0.16, 0.055, 0.057);        // 红十字
      put(g, B(0.022, 0.075, 0.004), red, 0.16, 0.055, 0.057);
      put(g, B(0.055, 0.012, 0.012), mat(C.black, 0.8, 0.2), 0.16, 0.122, 0); // 提手
    },

    /* 战术医疗箱（S2 新增） */
    medkit(g) {
      const shell = mat(0xd7dbcf, 0.82, 0.05), shell2 = mat(0xb9bfb2, 0.86, 0.05);
      const red = mat(0xb4372c, 0.72, 0.05), latch = mat(0x8b939a, 0.4, 0.85);
      const band = mat(0x3f6f36, 0.8, 0.05), dark = mat(0x23262a, 0.9, 0.05);
      put(g, B(0.30, 0.17, 0.20), shell, 0, 0.085, 0);                 // 箱体
      put(g, B(0.312, 0.03, 0.212), shell2, 0, 0.183, 0);              // 箱盖
      put(g, B(0.312, 0.014, 0.212), shell2, 0, 0.010, 0);             // 底沿
      put(g, B(0.302, 0.044, 0.206), band, 0, 0.085, 0);               // 绿色识别腰线
      put(g, B(0.118, 0.034, 0.006), red, 0, 0.098, -0.103);           // 正面红十字
      put(g, B(0.034, 0.118, 0.006), red, 0, 0.098, -0.103);
      put(g, B(0.118, 0.034, 0.006), red, 0, 0.098, 0.103);            // 背面十字
      put(g, B(0.034, 0.118, 0.006), red, 0, 0.098, 0.103);
      put(g, B(0.115, 0.016, 0.018), dark, 0, 0.214, 0);               // 提手
      put(g, B(0.014, 0.028, 0.018), dark, -0.055, 0.200, 0);
      put(g, B(0.014, 0.028, 0.018), dark, 0.055, 0.200, 0);
      [-0.085, 0.085].forEach(x => {                                   // 锁扣 ×2
        put(g, B(0.036, 0.052, 0.014), latch, x, 0.168, -0.104);
        put(g, B(0.036, 0.052, 0.014), latch, x, 0.168, 0.104);
      });
      put(g, B(0.006, 0.058, 0.10), mat(C.white, 0.9, 0.02), 0.152, 0.092, 0);  // 侧面标签
      put(g, B(0.008, 0.022, 0.022), red, 0.154, 0.092, 0);
      put(g, B(0.006, 0.012, 0.15), mat(C.steelDark, 0.6, 0.5), -0.152, 0.15, 0); // 铰链
    },

    /* 加密公文包（S2 新增） */
    case(g) {
      const shell = mat(0x1f2226, 0.52, 0.48), edge = mat(0x6d757c, 0.35, 0.9);
      const grip = mat(0x2b2f34, 0.7, 0.3), brass = mat(C.gold, 0.35, 0.95);
      const seal = mat(0xc2531f, 0.75, 0.1), label = mat(0xd9dcd2, 0.9, 0.02);
      put(g, B(0.34, 0.26, 0.09), shell, 0, 0.145, 0);                  // 硬壳箱体（立放）
      put(g, B(0.346, 0.013, 0.096), edge, 0, 0.268, 0);                // 上包边
      put(g, B(0.346, 0.013, 0.096), edge, 0, 0.018, 0);                // 下包边
      [-0.172, 0.172].forEach(x => put(g, B(0.013, 0.26, 0.096), edge, x, 0.145, 0));
      put(g, B(0.34, 0.013, 0.098), edge, 0, 0.205, 0);                 // 开合缝
      put(g, B(0.10, 0.016, 0.022), grip, 0, 0.302, 0);                 // 提手
      put(g, B(0.014, 0.03, 0.022), grip, -0.045, 0.286, 0);
      put(g, B(0.014, 0.03, 0.022), grip, 0.045, 0.286, 0);
      [-0.055, 0.055].forEach(x => put(g, CY(0.024, 0.016, 14), brass, x, 0.24, -0.052, Math.PI / 2)); // 密码转盘
      put(g, B(0.052, 0.032, 0.014), edge, 0, 0.208, -0.051);           // 锁扣
      put(g, B(0.10, 0.055, 0.004), label, -0.085, 0.115, -0.047);      // 正面标签
      put(g, B(0.075, 0.008, 0.005), mat(C.black, 0.85, 0.05), -0.085, 0.128, -0.049);
      put(g, B(0.075, 0.008, 0.005), mat(C.black, 0.85, 0.05), -0.085, 0.104, -0.049);
      put(g, B(0.052, 0.105, 0.006), seal, 0.105, 0.145, -0.049);       // 一次性封条
      put(g, B(0.052, 0.022, 0.008), brass, 0.105, 0.192, -0.05);       // 铅封
      put(g, B(0.29, 0.018, 0.022), seal, 0, 0.246, 0.05);              // 顶部赛季识别条
      // 背面同款细节（模型在局内会旋转，两面都要有东西看）
      [-0.055, 0.055].forEach(x => put(g, CY(0.024, 0.016, 14), brass, x, 0.24, 0.052, Math.PI / 2));
      put(g, B(0.052, 0.032, 0.014), edge, 0, 0.208, 0.051);
      put(g, B(0.10, 0.055, 0.004), label, 0.085, 0.115, 0.047);
      put(g, B(0.075, 0.008, 0.005), mat(C.black, 0.85, 0.05), 0.085, 0.128, 0.049);
      put(g, B(0.075, 0.008, 0.005), mat(C.black, 0.85, 0.05), 0.085, 0.104, 0.049);
      put(g, B(0.052, 0.105, 0.006), seal, -0.105, 0.145, 0.049);
      put(g, B(0.052, 0.022, 0.008), brass, -0.105, 0.192, 0.05);
    },

    /* 战术头盔 */
    helmet(g) {
      const shell = mat(0x39452a, 0.85, 0.12), shell2 = mat(0x2d3722, 0.88, 0.1);
      const pad = mat(0x15181a, 0.95, 0.03), rail = mat(0x5a6166, 0.45, 0.75);
      const strap = mat(0x22271e, 0.95, 0.05), brass = mat(0x8a7a4a, 0.5, 0.6);
      // 盔壳（半球 + 压扁）
      const dome = put(g, SP(0.125, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), shell, 0, 0.048, 0);
      dome.scale.set(1.0, 0.92, 1.06);
      // 盔沿（下缘一圈加厚）
      const rim = put(g, TO(0.123, 0.017, 26), shell2, 0, 0.048, 0, Math.PI / 2);
      rim.scale.set(1.0, 1.06, 0.55);
      put(g, CY(0.122, 0.05, 26), pad, 0, 0.026, 0).scale.set(1.0, 1.0, 1.06);   // 内衬阴影
      // 前檐
      put(g, B(0.11, 0.014, 0.045), shell2, 0, 0.062, 0.115, -0.3);
      // NVG 底座 + 支架
      put(g, B(0.062, 0.022, 0.05), rail, 0, 0.128, 0.072, -0.18);
      put(g, B(0.03, 0.05, 0.026), rail, 0, 0.152, 0.058);
      put(g, CY(0.014, 0.03, 10), brass, 0, 0.178, 0.05, Math.PI / 2);
      // 顶部魔术贴 / 线缆扣
      put(g, B(0.07, 0.008, 0.05), pad, 0, 0.163, -0.01);
      put(g, B(0.026, 0.008, 0.026), pad, 0, 0.163, -0.055);
      // 侧轨
      [-1, 1].forEach(sd => {
        put(g, B(0.014, 0.026, 0.085), rail, sd * 0.118, 0.072, 0.0);
        put(g, B(0.016, 0.016, 0.016), rail, sd * 0.122, 0.072, -0.035);
        // 下颌带
        put(g, B(0.013, 0.105, 0.014), strap, sd * 0.082, 0.0, 0.062, 0.34, 0, sd * 0.22);
        put(g, B(0.013, 0.095, 0.014), strap, sd * 0.070, -0.005, -0.045, -0.3, 0, sd * 0.2);
      });
      put(g, B(0.055, 0.02, 0.016), pad, 0, -0.036, 0.078);   // 下巴扣
      put(g, B(0.10, 0.026, 0.02), pad, 0, 0.012, 0.098, 0.18); // 护颚垫
    },

    /* 防弹衣 */
    vest(g) {
      const cloth = mat(0x36422a, 0.92, 0.06), cloth2 = mat(0x2b3522, 0.92, 0.06);
      const strap = mat(0x1b1f18, 0.95, 0.04), buckle = mat(0x5c6367, 0.45, 0.8);
      const plate = mat(0x2f3826, 0.9, 0.1);
      // 前后主体（上宽下窄，做成背心轮廓）
      const front = put(g, B(0.29, 0.30, 0.055), cloth, 0, 0.215, 0.052);
      front.scale.set(1, 1, 1);
      put(g, B(0.25, 0.10, 0.05), cloth, 0, 0.325, 0.052);       // 胸口加高
      put(g, B(0.28, 0.26, 0.055), cloth, 0, 0.205, -0.052);     // 背面
      // 侧围
      [-1, 1].forEach(sd => put(g, B(0.05, 0.22, 0.10), cloth2, sd * 0.145, 0.20, 0));
      // 前插板口袋
      put(g, B(0.20, 0.16, 0.02), plate, 0, 0.235, 0.088);
      put(g, B(0.205, 0.014, 0.024), cloth2, 0, 0.152, 0.088);
      // MOLLE 织带
      for (let i = 0; i < 4; i++) {
        put(g, B(0.19, 0.008, 0.006), cloth2, 0, 0.196 + i * 0.032, 0.081);
      }
      // 三个弹匣包（下腹）
      [-0.085, 0, 0.085].forEach(x => {
        put(g, B(0.072, 0.105, 0.045), cloth2, x, 0.115, 0.094);
        put(g, B(0.074, 0.016, 0.048), mat(0x232b1c, 0.95, 0.05), x, 0.168, 0.094);
        put(g, B(0.02, 0.03, 0.046), strap, x, 0.135, 0.098);
      });
      // 电台包 / 医疗包
      put(g, B(0.07, 0.10, 0.045), cloth2, 0.115, 0.30, 0.075, 0, 0, -0.12);
      put(g, B(0.055, 0.05, 0.04), cloth2, -0.115, 0.31, 0.07);
      // 肩带 + 快拆扣
      [-1, 1].forEach(sd => {
        put(g, B(0.058, 0.16, 0.05), strap, sd * 0.095, 0.40, 0.02, 0.12, 0, sd * 0.06);
        put(g, B(0.062, 0.03, 0.054), buckle, sd * 0.095, 0.335, 0.045);
        put(g, B(0.058, 0.10, 0.05), strap, sd * 0.095, 0.40, -0.03, -0.1, 0, sd * 0.05);
      });
      // 腰封
      put(g, B(0.31, 0.038, 0.125), strap, 0, 0.045, 0);
      put(g, B(0.045, 0.045, 0.045), buckle, 0, 0.045, 0.072);
      put(g, B(0.06, 0.055, 0.04), cloth2, -0.135, 0.055, 0.06);   // 腰包
      // 领口
      put(g, B(0.12, 0.03, 0.10), cloth2, 0, 0.372, 0);
    },

    /* 全息瞄准镜 */
    optic(g) {
      const body = mat(0x24282b, 0.5, 0.65), metal = mat(0x616a70, 0.35, 0.9);
      const hood = mat(0x1b1f21, 0.55, 0.6);
      const glass = mat(0x8fd0e8, 0.08, 0.25, { emissive: 0x2f6f88, emissiveIntensity: 0.85, opacity: 0.7 });
      const red = mat(0xff3b2f, 0.3, 0.1, { emissive: 0xff3b2f, emissiveIntensity: 1.6 });
      // 皮卡汀尼底座
      put(g, B(0.062, 0.022, 0.115), metal, 0, 0.011, 0);
      for (let i = 0; i < 4; i++) put(g, B(0.066, 0.008, 0.012), metal, 0, 0.004, -0.042 + i * 0.028);
      put(g, B(0.085, 0.018, 0.06), metal, 0, 0.030, 0.0);        // 夹具
      put(g, B(0.012, 0.026, 0.012), metal, 0.045, 0.030, 0.01);  // 锁紧杆
      // 镜体（前后短管 + 中段方体）
      put(g, B(0.072, 0.058, 0.072), body, 0, 0.072, 0);
      put(g, CY(0.030, 0.045, 16), hood, 0, 0.072, 0.056, Math.PI / 2);
      put(g, CY(0.026, 0.030, 16), hood, 0, 0.072, -0.045, Math.PI / 2);
      // 前遮光罩 + 镜片
      put(g, TO(0.032, 0.0055, 20), metal, 0, 0.072, 0.079);
      put(g, TO(0.029, 0.0045, 20), metal, 0, 0.072, 0.062);
      const lens = put(g, new T.CircleGeometry(0.030, 22), glass, 0, 0.072, 0.057);
      lens.material.side = T.DoubleSide;
      put(g, new T.CircleGeometry(0.024, 20), glass, 0, 0.072, -0.060); // 目镜
      // 红点
      const dot = put(g, new T.CircleGeometry(0.0032, 10), red, 0, 0.072, 0.0565);
      dot.material.side = T.DoubleSide;
      // 顶部导轨 + 电池仓 + 侧旋钮
      put(g, B(0.048, 0.008, 0.07), metal, 0, 0.104, 0);
      put(g, CY(0.011, 0.016, 10), metal, 0, 0.114, -0.018);
      put(g, CY(0.012, 0.014, 12), metal, 0.042, 0.072, 0, 0, 0, Math.PI / 2);
      put(g, CY(0.010, 0.014, 12), metal, -0.042, 0.072, 0, 0, 0, Math.PI / 2);
      // 状态灯
      put(g, B(0.012, 0.008, 0.006), red, 0.026, 0.098, 0.032);
    },

    /* 显卡 */
    gpu(g) {
      const pcb = mat(C.pcb, 0.7, 0.15), shroud = mat(0x23262a, 0.6, 0.5);
      const fin = mat(0xb9c0c6, 0.35, 0.9), fan = mat(0x15181a, 0.7, 0.3);
      put(g, B(0.26, 0.105, 0.012), pcb, 0, 0.052, -0.026);            // PCB
      put(g, B(0.245, 0.095, 0.03), shroud, 0, 0.052, -0.006);         // 外罩
      [-0.062, 0.062].forEach(x => {                                   // 双风扇
        put(g, CY(0.040, 0.012, 20), fan, x, 0.052, 0.011, Math.PI / 2);
        put(g, TO(0.040, 0.005, 20), mat(0x3a4046, 0.5, 0.6), x, 0.052, 0.014);
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2;
          put(g, B(0.034, 0.006, 0.004), mat(0x2a2f33, 0.6, 0.4), x + Math.cos(a) * 0.018, 0.052 + Math.sin(a) * 0.018, 0.017, 0, 0, a);
        }
      });
      for (let i = 0; i < 6; i++) {                                    // 散热鳍片
        put(g, B(0.20, 0.004, 0.016), fin, 0, 0.11 + i * 0.006, -0.02);
      }
      put(g, B(0.20, 0.008, 0.028), fin, 0, 0.145, -0.02);
      put(g, B(0.022, 0.075, 0.016), fin, 0.132, 0.05, -0.012);        // 挡板
      put(g, B(0.016, 0.008, 0.05), mat(C.gold, 0.35, 0.95), -0.118, 0.016, -0.026); // 金手指
      put(g, B(0.026, 0.016, 0.02), mat(0x141618, 0.7, 0.2), 0.085, 0.108, 0.004);   // 供电接口
      put(g, B(0.05, 0.024, 0.004), mat(0x2e6a4a, 0.7, 0.2), -0.06, 0.085, 0.009);
    },

    /* 金条 */
    gold(g) {
      const gold = mat(0xe0a832, 0.34, 0.82, { emissive: 0x7a4a0a, emissiveIntensity: 0.30 });
      const goldDark = mat(0xa87c22, 0.42, 0.8, { emissive: 0x4a2c04, emissiveIntensity: 0.25 });
      const bar = (w, h, d, x, y, z, r) => {
        const m = put(g, B(w, h, d), gold, x, y, z, 0, r || 0, 0);
        // 倒角
        put(g, B(w * 0.94, h * 0.35, d * 0.94), goldDark, x, y + h * 0.62, z, 0, r || 0, 0);
        return m;
      };
      bar(0.20, 0.055, 0.095, 0, 0.030, 0);
      bar(0.17, 0.048, 0.082, 0.005, 0.083, 0.008, 0.08);
      put(g, B(0.075, 0.006, 0.035), goldDark, 0, 0.059, 0);           // 钢印
      put(g, B(0.05, 0.006, 0.022), mat(0xf0cf80, 0.16, 1.0), 0, 0.0595, 0);
    },

    /* 情报硬盘 */
    intel(g) {
      const shell = mat(0x484f55, 0.5, 0.75), top = mat(0x5c646a, 0.45, 0.8);
      const label = mat(0xe2e2d8, 0.85, 0.02), red = mat(C.red, 0.75, 0.05);
      put(g, B(0.145, 0.022, 0.10), shell, 0, 0.011, 0);               // 盘体
      put(g, B(0.145, 0.004, 0.10), top, 0, 0.024, 0);
      put(g, B(0.10, 0.002, 0.058), label, -0.012, 0.0275, 0.006);     // 标签
      put(g, B(0.075, 0.0015, 0.007), red, -0.012, 0.0285, 0.012);
      put(g, B(0.06, 0.0015, 0.005), mat(0x2b5a8a, 0.8, 0.05), -0.012, 0.0285, -0.004);
      put(g, B(0.03, 0.008, 0.055), mat(C.gold, 0.35, 0.95), 0.066, 0.011, 0); // 接口
      [-0.02, 0.02].forEach(z => put(g, B(0.05, 0.006, 0.004), mat(0x2a2e32, 0.6, 0.6), 0.062, 0.011, z));
      put(g, CY(0.013, 0.004, 12), mat(C.steel, 0.3, 0.9), -0.035, 0.028, 0.022); // 螺丝
    },

    /* 机密核心 */
    core(g) {
      const cage = mat(0x39424a, 0.35, 0.9), cageDark = mat(0x22282d, 0.4, 0.85);
      const glowShell = new T.MeshBasicMaterial({ color: new T.Color(0xff8a2a).convertSRGBToLinear(), transparent: true, opacity: 0.55 });
      const glowCore = new T.MeshBasicMaterial({ color: new T.Color(0xffd48a).convertSRGBToLinear() });
      const glowRing = new T.MeshBasicMaterial({ color: new T.Color(0xffa94a).convertSRGBToLinear(), transparent: true, opacity: 0.65, side: T.DoubleSide });
      put(g, CY(0.078, 0.024, 18), cageDark, 0, 0.012, 0);              // 底盘
      put(g, CY(0.088, 0.014, 18), cage, 0, 0.030, 0);
      for (let i = 0; i < 8; i++) {                                      // 底盘格栅
        const a = i / 8 * Math.PI * 2;
        put(g, B(0.016, 0.006, 0.016), cage, Math.cos(a) * 0.062, 0.038, Math.sin(a) * 0.062);
      }
      // 能量柱（外发光壳 + 内芯）
      put(g, CY(0.050, 0.145, 18), glowShell, 0, 0.108, 0);
      put(g, CY(0.026, 0.155, 16), glowCore, 0, 0.110, 0);
      for (let i = 0; i < 3; i++) {                                      // 三个能量环
        put(g, TO(0.050, 0.006, 22), glowRing, 0, 0.055 + i * 0.05, 0, Math.PI / 2);
      }
      // 护笼立柱
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + 0.2;
        put(g, B(0.011, 0.165, 0.011), cage, Math.cos(a) * 0.062, 0.105, Math.sin(a) * 0.062);
      }
      put(g, TO(0.064, 0.008, 20), cage, 0, 0.048, 0, Math.PI / 2);
      put(g, TO(0.064, 0.008, 20), cage, 0, 0.162, 0, Math.PI / 2);
      put(g, CY(0.056, 0.018, 18), cageDark, 0, 0.180, 0);               // 顶盖
      put(g, CY(0.014, 0.028, 12), glowCore, 0, 0.202, 0);               // 指示灯
      put(g, new T.TorusGeometry(0.104, 0.005, 6, 26), glowRing, 0, 0.108, 0, Math.PI / 2); // 外光环
      // 散热片
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.22;
        put(g, B(0.006, 0.10, 0.03), cage, Math.cos(a) * 0.072, 0.19, Math.sin(a) * 0.072, 0, 0, 0);
      }
    }
  };

  /* ============================================================
     容器模型（底面对齐 y=0，尺寸贴合 CONTAINER_TYPES.size）
     ============================================================ */
  const CONTAINER_BUILDERS = {
    /* 木箱：木板 + 铁包角 + 印字 */
    crate(g, w, h, d) {
      const wood = mat(C.wood, 0.88, 0.06), woodDark = mat(C.woodDark, 0.9, 0.05);
      const iron = mat(0x4a4f52, 0.55, 0.75), stencil = mat(0xc9c2a6, 0.9, 0.02);
      put(g, B(w * 0.98, h * 0.92, d * 0.98), wood, 0, h * 0.46, 0);
      for (let i = 0; i < 3; i++) {                                   // 侧面木板分缝
        put(g, B(w * 1.005, h * 0.012, d * 0.02), woodDark, 0, h * (0.18 + i * 0.28), d * 0.5);
        put(g, B(w * 1.005, h * 0.012, d * 0.02), woodDark, 0, h * (0.18 + i * 0.28), -d * 0.5);
        put(g, B(w * 0.02, h * 0.012, d * 1.005), woodDark, w * 0.5, h * (0.18 + i * 0.28), 0);
        put(g, B(w * 0.02, h * 0.012, d * 1.005), woodDark, -w * 0.5, h * (0.18 + i * 0.28), 0);
      }
      put(g, B(w * 1.02, h * 0.06, d * 1.02), woodDark, 0, h * 0.95, 0);      // 盖板
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {           // 铁包角
        put(g, B(w * 0.09, h * 0.34, d * 0.09), iron, sx * w * 0.455, h * 0.17, sz * d * 0.455);
        put(g, B(w * 0.09, h * 0.34, d * 0.09), iron, sx * w * 0.455, h * 0.79, sz * d * 0.455);
      });
      put(g, B(w * 0.34, h * 0.05, d * 0.006), stencil, 0, h * 0.62, d * 0.492);  // 印字
      put(g, B(w * 0.22, h * 0.03, d * 0.006), stencil, 0, h * 0.52, d * 0.492);
      put(g, B(w * 1.005, h * 0.03, d * 1.005), iron, 0, h * 0.30, 0);        // 束带
    },

    /* 储物柜：双门 + 百叶 + 把手 */
    locker(g, w, h, d) {
      const body = mat(0x46565f, 0.72, 0.35), door = mat(0x50626c, 0.68, 0.4);
      const dark = mat(0x2b353c, 0.7, 0.4), steel = mat(0xa8b0b6, 0.4, 0.9);
      put(g, B(w, h, d * 0.92), body, 0, h / 2, -d * 0.04);
      [-1, 1].forEach(s => {                                          // 双门
        put(g, B(w * 0.47, h * 0.94, d * 0.06), door, s * w * 0.245, h / 2, d * 0.44);
        for (let i = 0; i < 4; i++) {                                 // 百叶
          put(g, B(w * 0.34, h * 0.014, d * 0.02), dark, s * w * 0.245, h * (0.78 + i * 0.035), d * 0.47);
          put(g, B(w * 0.34, h * 0.014, d * 0.02), dark, s * w * 0.245, h * (0.14 + i * 0.035), d * 0.47);
        }
        put(g, B(w * 0.035, h * 0.16, d * 0.04), steel, s * w * 0.06, h * 0.52, d * 0.47);  // 把手
        put(g, B(w * 0.05, h * 0.05, d * 0.03), steel, s * w * 0.06, h * 0.62, d * 0.465);  // 锁
      });
      put(g, B(w * 1.02, h * 0.02, d * 1.0), dark, 0, h - h * 0.01, -d * 0.04); // 顶盖
      put(g, B(w * 1.02, h * 0.03, d * 1.0), dark, 0, h * 0.015, -d * 0.04);    // 底沿
      put(g, B(w * 0.02, h * 0.9, d * 0.03), dark, 0, h / 2, d * 0.455);        // 中缝
    },

    /* 保险箱：门 + 转盘 + 铰链 + 脚 */
    safe(g, w, h, d) {
      const body = mat(0x6a5526, 0.55, 0.62), door = mat(0x7d652c, 0.45, 0.7);
      const steel = mat(0xd0c090, 0.25, 0.95), dark = mat(0x3d3318, 0.6, 0.5);
      put(g, B(w, h * 0.98, d), body, 0, h * 0.49, 0);
      put(g, B(w * 0.92, h * 0.86, d * 0.07), door, 0, h * 0.52, d * 0.47);      // 门
      put(g, B(w * 0.84, h * 0.78, d * 0.02), dark, 0, h * 0.52, d * 0.505);     // 门缝阴影
      const dial = put(g, CY(0.10, 0.05, 18), steel, 0, h * 0.58, d * 0.52);     // 转盘
      dial.rotation.x = Math.PI / 2;
      put(g, CY(0.028, 0.06, 12), steel, 0, h * 0.58, d * 0.545, Math.PI / 2);
      for (let i = 0; i < 8; i++) {                                             // 刻度
        const a = i / 8 * Math.PI * 2;
        put(g, B(0.008, 0.018, 0.006), dark, Math.sin(a) * 0.082, h * 0.58 + Math.cos(a) * 0.082, d * 0.53);
      }
      put(g, B(w * 0.30, 0.026, 0.03), steel, 0, h * 0.30, d * 0.52);           // 拉手
      put(g, B(0.026, h * 0.10, 0.03), steel, -w * 0.15, h * 0.30, d * 0.52);
      put(g, B(0.026, h * 0.10, 0.03), steel, w * 0.15, h * 0.30, d * 0.52);
      [-1, 1].forEach(s => {                                                    // 铰链
        put(g, B(0.05, h * 0.16, d * 0.10), steel, s * w * 0.46, h * 0.78, d * 0.44);
        put(g, B(0.05, h * 0.16, d * 0.10), steel, s * w * 0.46, h * 0.26, d * 0.44);
      });
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) =>                // 地脚
        put(g, B(w * 0.10, h * 0.03, d * 0.10), dark, sx * w * 0.38, h * 0.015, sz * d * 0.38)
      );
      put(g, B(w * 0.34, h * 0.09, d * 0.006), mat(0xd8cba0, 0.7, 0.1), 0, h * 0.80, d * 0.505); // 铭牌
    },

    /* 空投箱：钢箱 + 黄带 + 信号灯 + 伞 + 烟雾 */
    airdrop(g, w, h, d) {
      const body = mat(0x5a3a2a, 0.68, 0.45), band = mat(0xd8b83a, 0.7, 0.35);
      const dark = mat(0x2e2019, 0.8, 0.3), steel = mat(0x9aa2a8, 0.4, 0.85);
      put(g, B(w, h * 0.96, d), body, 0, h * 0.48, 0);
      put(g, B(w * 1.01, h * 0.10, d * 1.01), band, 0, h * 0.30, 0);
      put(g, B(w * 1.01, h * 0.10, d * 1.01), band, 0, h * 0.72, 0);
      put(g, B(w * 0.10, h * 1.0, d * 1.01), band, 0, h * 0.5, 0);
      put(g, B(w * 1.01, h * 0.10, d * 0.10), band, 0, h * 0.5, 0);
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) =>
        put(g, B(w * 0.10, h * 0.16, d * 0.10), steel, sx * w * 0.44, h * 0.90, sz * d * 0.44)
      );
      put(g, B(w * 0.9, h * 0.06, d * 0.9), dark, 0, h * 0.99, 0);              // 盖
      put(g, CY(0.05, 0.05, 12), steel, 0, h * 1.04, 0);                         // 信号灯座
      put(g, CY(0.045, 0.05, 12), mat(0xff5a2a, 0.3, 0.1, { emissive: 0xff4a1a, emissiveIntensity: 1.8 }), 0, h * 1.09, 0);
      // 降落伞（半透明布面 + 绳索）
      const canopy = put(g, SP(w * 0.85, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd8cfa6, 0.95, 0.02, { double: true }), 0, h + 1.5, 0);
      canopy.scale.y = 0.55;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, r = w * 0.8;
        const x1 = Math.cos(a) * r, z1 = Math.sin(a) * r;
        const rope = put(g, new T.CylinderGeometry(0.006, 0.006, 1, 4),
          mat(0x9a9480, 0.9, 0.05), x1 * 0.55, h + 0.85, z1 * 0.55);
        rope.lookAt(new T.Vector3(0, h + 0.5, 0));
        rope.rotation.x += Math.PI / 2;
      }
      // 烟雾
      const smoke = put(g, new T.ConeGeometry(w * 0.32, 1.4, 10, 1, true),
        new T.MeshBasicMaterial({ color: 0xffcf9a, transparent: true, opacity: 0.13, depthWrite: false, side: T.DoubleSide }), 0, h + 0.75, 0);
      smoke.castShadow = false;
    }
  };

  /* ============================================================
     静态合批：把同材质的零件合并成一个几何体，降低 draw call
     （37 个容器 × 25 个零件 → 每个容器 3~6 个 mesh）
     ============================================================ */
  function mergeStatic(root) {
    try {
      root.updateMatrixWorld(true);
      const meshes = [];
      root.traverse(o => { if (o.isMesh) meshes.push(o); });
      if (meshes.length < 2) return root;
      const invRoot = new T.Matrix4().copy(root.matrixWorld).invert();
      const relM = new T.Matrix4();
      const buckets = new Map();
      meshes.forEach(m => {
        let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        relM.multiplyMatrices(invRoot, m.matrixWorld);
        geo.applyMatrix4(relM);
        const key = m.material.uuid + '|' + (m.material.transparent ? 't' : 'o');
        if (!buckets.has(key)) buckets.set(key, { mat: m.material, list: [] });
        buckets.get(key).list.push(geo);
      });
      meshes.forEach(m => { if (m.parent) m.parent.remove(m); m.geometry.dispose(); });
      buckets.forEach(({ mat, list }) => {
        let total = 0;
        list.forEach(g2 => { total += g2.attributes.position.count; });
        const pos = new Float32Array(total * 3);
        const nor = new Float32Array(total * 3);
        const uv = new Float32Array(total * 2);
        let off = 0;
        list.forEach(g2 => {
          const p2 = g2.attributes.position, n2 = g2.attributes.normal, u2 = g2.attributes.uv;
          pos.set(p2.array, off * 3);
          if (n2) nor.set(n2.array, off * 3);
          if (u2) uv.set(u2.array, off * 2);
          off += p2.count;
          g2.dispose();
        });
        const merged = new T.BufferGeometry();
        merged.setAttribute('position', new T.BufferAttribute(pos, 3));
        merged.setAttribute('normal', new T.BufferAttribute(nor, 3));
        merged.setAttribute('uv', new T.BufferAttribute(uv, 2));
        merged.computeBoundingSphere();
        const mesh = new T.Mesh(merged, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
      });
      return root;
    } catch (e) {
      return root;
    }
  }

  /* ============================================================
     对外接口
     ============================================================ */
  const Models = {
    loot(key) {
      const g = group();
      const build = LOOT_BUILDERS[key] || LOOT_BUILDERS.ammo;
      build(g);
      mergeStatic(g);
      g.userData.lootKey = key;
      return g;
    },
    container(type, w, h, d) {
      const g = group();
      const build = CONTAINER_BUILDERS[type] || CONTAINER_BUILDERS.crate;
      build(g, w || 1, h || 1, d || 1);
      mergeStatic(g);
      g.userData.containerType = type;
      return g;
    },
    merge: mergeStatic,
    hasContainer: t => !!CONTAINER_BUILDERS[t],
    hasLoot: k => !!LOOT_BUILDERS[k],
    keys: () => Object.keys(LOOT_BUILDERS)
  };

  /* ---------------- 离屏渲染（缩略图 / 模型展示图） ---------------- */
  let tr = null, tScene = null, tCam = null, dynamicLights = [];
  const thumbCache = {};

  function ensureStage() {
    if (tr) return true;
    try {
      const canvas = document.createElement('canvas');
      tr = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      tr.setPixelRatio(2);
      tr.shadowMap.enabled = false;
      tr.outputEncoding = T.sRGBEncoding;
      tr.toneMapping = T.ACESFilmicToneMapping;
      tr.toneMappingExposure = 0.92;
      tScene = new T.Scene();
      tCam = new T.PerspectiveCamera(30, 1, 0.01, 20);
      tScene.add(new T.AmbientLight(0xffffff, 0.30));
      tScene.add(new T.HemisphereLight(0xcfdcf0, 0x24261f, 0.42));
      const key1 = new T.DirectionalLight(0xfff2d8, 1.25); key1.position.set(2.2, 3, 2.6); tScene.add(key1);
      const rim = new T.DirectionalLight(0x9fc8ff, 0.75); rim.position.set(-2.4, 1.4, -1.8); tScene.add(rim);
      const fill = new T.DirectionalLight(0xffffff, 0.28); fill.position.set(0, -2, 1); tScene.add(fill);
      // 摄影棚环境贴图（金属/高光材质靠它才有反射，否则发黑）
      try {
        const pmrem = new T.PMREMGenerator(tr);
        const env = new T.Scene();
        env.add(new T.Mesh(new T.SphereGeometry(12, 20, 14),
          new T.MeshBasicMaterial({ color: 0x39424c, side: T.BackSide })));
        const panel = (color, x, y, z, size) => {
          const pl = new T.Mesh(new T.PlaneGeometry(size, size),
            new T.MeshBasicMaterial({ color: color, side: T.DoubleSide }));
          pl.position.set(x, y, z); pl.lookAt(0, 0, 0); env.add(pl);
        };
        panel(0xdfe4ea, 3, 6, 4, 8);
        panel(0x8fb0d8, -6, 2, 3, 7);
        panel(0xc09a6a, 0, -5, -6, 7);
        panel(0xb8c2cc, 0, 6, -4, 6);
        const envRT = pmrem.fromScene(env, 0.05);
        tScene.environment = envRT.texture;
        pmrem.dispose();
      } catch (e) { /* 环境贴图失败不影响主流程 */ }
      return true;
    } catch (e) {
      tr = null;
      return false;
    }
  }

  /** 把任意模型组渲染成 dataURL（自动居中 + 按包围盒取景） */
  Models.renderGroup = function (model, size, opts) {
    size = size || 96;
    opts = opts || {};
    if (!ensureStage()) return '';
    try {
      tr.setSize(size, size, false);
      const box = new T.Box3().setFromObject(model);
      const c = box.getCenter(new T.Vector3());
      const sz = box.getSize(new T.Vector3());
      model.position.sub(c);
      tScene.add(model);
      const radius = Math.max(sz.x, sz.y, sz.z) * 0.5;
      const fov = tCam.fov * Math.PI / 180;
      const dist = (radius / Math.tan(fov / 2)) * (opts.zoom || 1.6);
      const az = opts.azimuth == null ? 0.62 : opts.azimuth;
      const el = opts.elevation == null ? 0.5 : opts.elevation;
      tCam.position.set(Math.sin(az) * dist * Math.cos(el), Math.sin(el) * dist * 1.15 + radius * 0.15, Math.cos(az) * dist * Math.cos(el));
      tCam.lookAt(0, opts.lookY || 0, 0);
      tr.render(tScene, tCam);
      const url = tr.domElement.toDataURL('image/png');
      tScene.remove(model);
      return url;
    } catch (e) {
      return '';
    }
  };

  Models.thumb = function (key, size) {
    size = size || 96;
    const cacheKey = key + '@' + size;
    if (thumbCache[cacheKey] != null) return thumbCache[cacheKey];
    const g = Models.loot(key);
    const url = Models.renderGroup(g, size, { zoom: 1.55 });
    Models.dispose(g);
    thumbCache[cacheKey] = url;
    return url;
  };
  Models.thumbContainer = function (type, size) {
    size = size || 160;
    const cacheKey = 'cont:' + type + '@' + size;
    if (thumbCache[cacheKey] != null) return thumbCache[cacheKey];
    const g = Models.container(type, 1, 1, 1);
    const url = Models.renderGroup(g, size, { zoom: 1.75, elevation: 0.42 });
    Models.dispose(g);
    thumbCache[cacheKey] = url;
    return url;
  };
  Models.dispose = function (g) {
    if (!g) return;
    g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  };

  DF.Models = Models;
})();
