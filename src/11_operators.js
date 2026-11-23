/* ============================================================
   干员技能系统（Operator Ability Kit）
   - 19 名干员：每名 1 个被动 + 2 个主动技能（Q/E）+ 1 个终极技能（V）
   - 技能全部基于可组合原语实现：爆炸 / 烟雾 / 闪光晕眩 / 标记透视 /
     加速·减速 / 护盾 / 隐身 / 治疗（HoT）/ 布置物（地雷·陷阱·沙袋）/ 随从
   - 单人模式（solo）= 本地权威；房主（host）= 房主权威；
     联机客人（guest）通过 'ab' 消息把技能请求发给房主执行
   - 阵亡/撤离/重开一局时全部战术实体随 resetRaidWorld 清理
   - AI 队友（solo 专属）：2 名友军随从，可呼叫治疗（G）
   ============================================================ */
(function () {
  'use strict';
  if (typeof DF === 'undefined') return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const V3 = () => new T.Vector3();

  /* ============================================================
     干员档案：名称/定位（与大厅一致）+ 技能组
     cd 单位秒；所有技能都有冷却与明确效果（无纯装饰技能）
     ============================================================ */
  const KITS = {
    /* ---------- 突击 ASSAULT ---------- */
    hwolf: {
      cls: '突击', en: 'D-WOLF · 红狼', passive: { id: 'slide', name: '战术滑铲', desc: '疾跑中按 Ctrl 快速滑铲前冲（位移 4.5m），8 秒冷却' },
      abilities: [
        { key: 'Q', id: 'frag3', name: '三联装手炮', icon: '◉', cd: 8, desc: '朝瞄准点抛射三枚高爆榴弹，依次引爆（各 45 伤害）' },
        { key: 'E', id: 'smoke_burst', name: '突破型烟雾弹', icon: '☁', cd: 12, desc: '向瞄准方向投掷短时烟雾弹（半径 3.6m，持续 5 秒）' },
        { key: 'V', id: 'exo', name: '动力外骨骼', icon: '▲', cd: 50, dur: 6, desc: '超载：移动+35%、射速+32%，持续 6 秒；击倒敌人恢复 25 HP' }
      ]
    },
    weilong: {
      cls: '突击', en: 'STRIKER · 威龙', passive: { id: 'soar', name: '动能辅助系统', desc: '使用任何技能后获得 1.5 秒 +25% 移速；坠落伤害免疫' },
      abilities: [
        { key: 'Q', id: 'boost', name: '动力推进', icon: '⇈', cd: 7, desc: '朝指定方向喷气猛冲（6.5m）；击倒敌人冷却清零' },
        { key: 'E', id: 'c4', name: '磁吸炸弹', icon: '◎', cd: 10, desc: '吸附于瞄准表面/敌人的 C4，2.2 秒后引爆（90 伤害）' },
        { key: 'V', id: 'slam', name: '虎蹲炮', icon: '▼', cd: 55, desc: '发射压缩空气弹，落地范围击倒（半径 4.5m，28 伤害+晕眩 2.2 秒）' }
      ]
    },
    wuming: {
      cls: '突击', en: 'GHOST · 无名', passive: { id: 'quiet', name: '无声猎手', desc: '脚步声传播距离大幅缩短（敌人侦测半径 -35%）' },
      abilities: [
        { key: 'Q', id: 'glaive', name: '旋风飞刃', icon: '⋈', cd: 7, desc: '飞刃锁定前方最近敌人，造成 26 伤害并减速 35%（2.5 秒）' },
        { key: 'E', id: 'flashbang', name: '战术闪光弹', icon: '✦', cd: 9, desc: '接触爆炸的闪光弹：半径 4m 内敌人晕眩 2.4 秒并致盲' },
        { key: 'V', id: 'cloak', name: '暗影步', icon: '◌', cd: 45, dur: 5, desc: '声波与侦察干扰器：隐身 5 秒（小地图隐藏，开火即破隐）' }
      ]
    },
    jfeng: {
      cls: '突击', en: 'ZEPHYR · 疾风', passive: { id: 'adrenal', name: '爆发型辅助脊椎', desc: '受击瞬间获得 1.5 秒 +12% 移速（可叠加刷新）' },
      abilities: [
        { key: 'Q', id: 'roll', name: '战术翻滚', icon: '⤿', cd: 7, desc: '朝 8 方向快速位移 5m；击倒敌人冷却清零' },
        { key: 'E', id: 'emp_cone', name: '钻墙电刺', icon: '⌁', cd: 11, desc: '穿透墙体放电：前方 13m 扇形内敌人晕眩 2 秒+22 伤害+4 秒命中率大跌' },
        { key: 'V', id: 'anchor', name: '紧急回避装置', icon: '⚓', cd: 60, desc: '锚定当前位置；再次激活或受到致命伤时强制拉回（1 次）' }
      ]
    },
    yehuo: {
      cls: '突击', en: 'WILDFIRE · 野火', passive: { id: 'tenacity', name: '愈战愈强', desc: '击倒敌人后 4 秒内移速+换弹+20%；低血量（<35%）时同样生效' },
      abilities: [
        { key: 'Q', id: 'frag', name: '高爆手雷', icon: '●', cd: 8, desc: '投掷延时破片手雷（55 伤害，半径 2.8m）' },
        { key: 'E', id: 'ring_smoke', name: '双向烟雾发射器', icon: '❉', cd: 12, desc: '自身周围四向喷射烟幕（4 团烟雾，持续 6 秒）' },
        { key: 'V', id: 'shield_bash', name: '盾式破障器', icon: '⬢', cd: 50, desc: '展开盾牌向前冲锋 7m：撞击敌人（+35 伤害）并获得正面 75 点护盾 1.8 秒' }
      ]
    },
    bullot: {
      cls: '突击', en: 'BULLET · 莽兽', passive: { id: 'tough', name: '坚韧', desc: '生命上限 +25；被击中时 10% 概率不中断疾跑' },
      abilities: [
        { key: 'Q', id: 'frag', name: '破片手雷', icon: '●', cd: 8, desc: '投掷延时破片手雷（55 伤害，半径 2.8m）' },
        { key: 'E', id: 'bash_mini', name: '重装冲锋', icon: '⬢', cd: 12, desc: '4m 猛冲并获得正面 40 点护盾 1.5 秒' },
        { key: 'V', id: 'ironwall', name: '不动如山', icon: '▮', cd: 50, dur: 5, desc: '全身卸力：受到的伤害 -55%，持续 5 秒' }
      ]
    },
    /* ---------- 支援 SUPPORT ---------- */
    fengyi: {
      cls: '支援', en: 'SHEPHERD · 蜂医', passive: { id: 'revive', name: '高效救援', desc: 'G 呼叫治疗冷却 25s→12s、治疗量 30→45；周围队友可见其治疗光环' },
      abilities: [
        { key: 'Q', id: 'smoke', name: '蜂巢科技烟雾弹', icon: '☁', cd: 10, desc: '普通烟雾弹（半径 3.6m，持续 8 秒）' },
        { key: 'E', id: 'smoke_line', name: '烟幕无人机', icon: '≡', cd: 14, desc: '指挥无人机前飞释放烟雾走廊（3 团烟雾排列，持续 8 秒）' },
        { key: 'V', id: 'stim_pistol', name: '激素枪', icon: '✚', cd: 45, desc: '发射追踪治疗飞镖：11m 内全体友军恢复 30 HP（持续 4 秒）并解除减速/晕眩/致盲' }
      ]
    },
    gu: {
      cls: '支援', en: 'TOX · 蛊', passive: { id: 'fielddress', name: '高效治疗', desc: '你施放的治疗效果 +30%；周围队友受伤恢复间隔缩短' },
      abilities: [
        { key: 'Q', id: 'adrenaline', name: '肾上腺素激活', icon: '↑', cd: 12, desc: '10m 内全体友军：后坐力 -30%、换弹 -25%，持续 5 秒' },
        { key: 'E', id: 'toxic_smoke', name: '致盲毒雾', icon: '☁', cd: 12, desc: '遮蔽视野的毒雾（半径 3.6m，7 秒）：敌人减速 35% 并命中率大跌' },
        { key: 'V', id: 'swarm', name: '「流荧」集群', icon: '⌘', cd: 60, desc: '穿透掩体的无人机群：14m 内全体敌人被标记 6 秒并受到 +25% 伤害' }
      ]
    },
    'dié': {
      cls: '支援', en: 'VLINDER · 蝶', passive: { id: 'vitals', name: '生命体征监测', desc: '队友跌破 30% 血量时获得 3 秒 30% 伤害减免' },
      abilities: [
        { key: 'Q', id: 'nano_dust', name: '纳米医疗粉尘', icon: '✧', cd: 10, desc: '医疗无人机跟踪：最近的友军（无友军则自己）恢复 30 HP（5 秒）' },
        { key: 'E', id: 'rc_smoke', name: '遥控烟雾弹', icon: '☁', cd: 9, desc: '长按瞄准投掷的精准烟雾弹（20m 落点，半径 3m，7 秒）' },
        { key: 'V', id: 'rescue_swarm', name: '蝶式救援无人机群', icon: '✚', cd: 70, desc: '全图呼救：无论距离多远，全体友军恢复 45 HP（3 秒）并解除负面状态' }
      ]
    },
    lrying: {
      cls: '支援', en: 'WANDERER · 旅人', passive: { id: 'tracker', name: '求生专家', desc: '你造成的伤害会让敌人被全队标记 4 秒' },
      abilities: [
        { key: 'Q', id: 'stim_gas', name: '气雾针剂枪', icon: '◍', cd: 11, desc: '发射气雾针剂：命中区域 4 秒，敌人每秒 10 伤害、友军每秒 8 治疗' },
        { key: 'E', id: 'sting_smoke', name: '刺激性烟雾', icon: '☁', cd: 10, desc: '带干扰的战术烟雾（半径 3.4m，7 秒）：敌人减速 40%' },
        { key: 'V', id: 'dog', name: '军犬协同·四叶', icon: '♞', cd: 55, dur: 12, desc: '召唤军犬「四叶」12 秒：扑向最近敌人撕咬（45 伤害+晕眩 1.2 秒）并标记' }
      ]
    },
    /* ---------- 工程 ENGINEER ---------- */
    myang: {
      cls: '工程', en: 'WARDEN · 牧羊人', passive: { id: 'damp', name: '减振防御', desc: '受到的爆炸伤害 -65%' },
      abilities: [
        { key: 'Q', id: 'pulse', name: '声波脉冲', icon: '◉', cd: 8, desc: '定向声波：前方 7m 扇形内敌人晕眩 1.4 秒' },
        { key: 'E', id: 'jammer', name: '干扰装置', icon: '⌁', cd: 14, desc: '部署信号干扰区（半径 10m，5 秒）：敌人命中率大跌' },
        { key: 'V', id: 'sonic', name: '声波震慑', icon: '◎', cd: 55, desc: '无人机压制 26m 内全体敌人：晕眩 3.2 秒并造成 18 伤害（穿透掩体）' }
      ]
    },
    wululu: {
      cls: '工程', en: 'URIAL · 乌鲁鲁', passive: { id: 'veteran', name: '久经沙场', desc: '免疫减速与毒雾干扰（烟雾减速对你无效）' },
      abilities: [
        { key: 'Q', id: 'sandbags', name: '即时工事', icon: '▦', cd: 12, desc: '快速架设 3 袋沙袋阵地（阻挡视线与移动，持续 45 秒）' },
        { key: 'E', id: 'mine', name: '近炸地雷', icon: '◆', cd: 10, desc: '脚边布设地雷，1.2 秒后启动（半径 1.4m，75 伤害+晕眩 1 秒，最多 3 枚）' },
        { key: 'V', id: 'loiter', name: '巡飞弹', icon: '➤', cd: 60, desc: '图像制导导弹：锁定瞄准线附近的敌人追踪攻击（85 伤害，半径 2.6m）' }
      ]
    },
    shendan: {
      cls: '工程', en: 'DEEPBLUE · 深蓝', passive: { id: 'backshield', name: '后方防护', desc: '来自背后 120° 扇形的伤害 -50%（自动背盾）' },
      abilities: [
        { key: 'Q', id: 'shield', name: '便携盾牌', icon: '⬡', cd: 16, desc: '举起能量盾：正面 120° 吸收 80 伤害，持续 4 秒' },
        { key: 'E', id: 'bash', name: '盾击', icon: '⬢', cd: 8, desc: '盾牌猛击前冲 3m：路径上敌人晕眩 1.2 秒+15 伤害' },
        { key: 'V', id: 'bombsuit', name: '防爆套装', icon: '▮', cd: 55, dur: 6, desc: '展开全身防爆盾：6 秒内吸收 130 伤害（全向，移速 -15%）' }
      ]
    },
    byte: {
      cls: '工程', en: 'BIT · 比特', passive: { id: 'trapper', name: '防守尖兵', desc: '站在你布置的陷阱 5m 内：据枪散布 -35%' },
      abilities: [
        { key: 'Q', id: 'snare', name: '寻猎陷阱', icon: '◫', cd: 9, desc: '布置捕网陷阱（最多 3 个）：敌人踩中被困 2.2 秒' },
        { key: 'E', id: 'spider', name: '机械蜘蛛', icon: '✳', cd: 14, dur: 10, desc: '部署机械蜘蛛 10 秒：自动射击 9m 内最近敌人（9 伤害/0.9 秒）' },
        { key: 'V', id: 'web_all', name: '寻猎蜘蛛', icon: '✜', cd: 50, desc: '捕网禁锢 13m 内全体敌人 3 秒并施加 30 伤害（穿透掩体）' }
      ]
    },
    yedan: {
      cls: '工程', en: 'CRYOGEN · 液氮', passive: { id: 'frostbite', name: '霜化反应', desc: '你的减速效果可叠加：3 层附着将敌人冻结 2 秒' },
      abilities: [
        { key: 'Q', id: 'frost_bolt', name: '冷凝瓶', icon: '❄', cd: 6, desc: '发射冷凝瓶：命中最近敌人（14m）22 伤害并附着 1 层低温（减速 40%）' },
        { key: 'E', id: 'frost_field', name: '霜化领域', icon: '◍', cd: 13, desc: '低温领域覆盖 4.2m，持续 5 秒：领域内敌人减速 55%' },
        { key: 'V', id: 'frost_volley', name: '连发冷凝榴弹', icon: '✣', cd: 50, desc: '连发三枚冷凝榴弹（各 15 伤害+2 层低温），落点成片冰封' }
      ]
    },
    /* ---------- 侦察 RECON ---------- */
    luna: {
      cls: '侦察', en: 'LUNA · 露娜', passive: { id: 'track', name: '敌情追踪', desc: '你造成伤害会为全队标记目标 4 秒' },
      abilities: [
        { key: 'Q', id: 'smoke_arrow', name: '烟幕箭', icon: '☁', cd: 10, desc: '射出烟幕箭：落点生成烟雾（半径 2.8m，6 秒）' },
        { key: 'E', id: 'power_shot', name: '猎杀箭', icon: '➶', cd: 9, desc: '蓄力 6 秒：下一箭/下一枪伤害 +60% 并标记敌人 5 秒' },
        { key: 'V', id: 'recon_arrow', name: '侦察箭矢', icon: '◎', cd: 45, desc: '高亮雷达箭：26m 内全体敌人被标记 6 秒（穿透掩体、小地图可见）' }
      ]
    },
    haozhao: {
      cls: '侦察', en: 'RAZOR · 骇爪', passive: { id: 'silent', name: '隐匿消声', desc: '静步更安静：敌人侦测半径 -28%' },
      abilities: [
        { key: 'Q', id: 'ghost_step', name: '静默步', icon: '◌', cd: 10, dur: 5, desc: '5 秒内脚步几乎无声（敌人侦测半径 -50%）' },
        { key: 'E', id: 'trace', name: '信号追踪', icon: '⌁', cd: 12, desc: '破译最近敌人的信号：标记 5 秒并显示其方位指示 3 秒' },
        { key: 'V', id: 'sigint', name: '信号破译器', icon: '⌘', cd: 55, desc: '扫描 18m 内敌人 6 秒：透视追踪 + 每 2 秒一次方位ping（穿透掩体）' }
      ]
    },
    yinyi: {
      cls: '侦察', en: 'SILVERWING · 银翼', passive: { id: 'footprint', name: '踪迹探查', desc: '22m 内移动的敌人会被自动标记（每次刷新 1.5 秒）' },
      abilities: [
        { key: 'Q', id: 'cone_scan', name: '战术扫描', icon: '◭', cd: 12, desc: '扇形扫描 20m/60°：锥内敌人被标记 5 秒' },
        { key: 'E', id: 'falcon', name: '猎鹰无人机', icon: '✈', cd: 16, dur: 12, desc: '猎鹰伴飞 12 秒：自动标记其视野（10m）内敌人 4 秒' },
        { key: 'V', id: 'eagle_eye', name: '全域猎鹰', icon: '◎', cd: 65, desc: '全域扫描 34m（穿透掩体）：全体敌人标记 8 秒，全队共享' }
      ]
    },
    huixiang: {
      cls: '侦察', en: 'ECHO · 回响', passive: { id: 'echo_sense', name: '声波感知', desc: '受击时显示攻击者方位 1.5 秒；你伤害过的敌人被标记 3 秒' },
      abilities: [
        { key: 'Q', id: 'listen', name: '听风辨位', icon: '◉', cd: 8, desc: '听声辨位：显示最近 2 名敌人的方位箭头 3 秒（30m）' },
        { key: 'E', id: 'sound_trap', name: '声波陷阱', icon: '◍', cd: 10, desc: '布置声波陷阱：踩中敌人被标记 5 秒并减速 50%（3 秒）' },
        { key: 'V', id: 'sonar', name: '高级声呐', icon: '◎', cd: 55, desc: '穿墙声呐 12 秒：全图敌人标记，每次开火都会在你耳边 ping 一次' }
      ]
    }
  };
  DF.operatorKits = KITS;
  DF.kitOf = function (entity) {
    if (!entity) return null;
    const id = entity.opId || (entity.id === DF.myId ? DF.selectedOperator() : null);
    return id ? KITS[id] : null;
  };
  DF.selectedOperator = function () {
    try { return localStorage.getItem('df_operator') || 'hwolf'; } catch (e) { return 'hwolf'; }
  };
  DF.entityMaxHpBonus = function (e) {
    const kit = DF.kitOf(e);
    return (kit && kit.passive.id === 'tough') ? 25 : 0;
  };

  const meOf = () => DF.players.get(DF.myId);
  const nowT = () => DF.time;
  DF.maxHpOf = function (p) {
    if (!p) return CFG.maxHp;
    return (p.maxHp || CFG.maxHp) + (DF.entityMaxHpBonus ? DF.entityMaxHpBonus(p) : 0);
  };
  /* ============================================================
     战术实体：延迟调用 / 烟雾 / 地雷·陷阱 / 随从 / HoT
     ============================================================ */
  DF.delayed = DF.delayed || [];        // {t, fn}
  DF.smokes = DF.smokes || [];          // {x,y,z,r,until,mesh,sting,heal,dmg}
  DF.devices = DF.devices || [];        // {type:'mine'|'snare'|'sound', x,y,z,r,armedAt,until,mesh,dmg,root,...}
  DF.pets = DF.pets || [];              // {type:'dog'|'spider', ...}
  DF.hots = DF.hots || [];              // {id, rate, until, src, cleanse}
  DF.sandbags = DF.sandbags || [];      // 沙袋工事（可清理）

  const sceneOf = () => DF.scene;
  const dispose = m => { if (!m) return; if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); };

  function spawnDelayed(delay, fn) { DF.delayed.push({ t: nowT() + delay, fn }); }

  function smokeBlocking() { return DF.smokes.length > 0; }
  DF.smokeBlocks = function (x1, z1, x2, z2) {
    if (!DF.smokes.length) return false;
    const t = nowT();
    for (const s of DF.smokes) {
      if (s.until < t) continue;
      // 线段 vs 圆
      const dx = x2 - x1, dz = z2 - z1;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) continue;
      let u = ((s.x - x1) * dx + (s.z - z1) * dz) / len2;
      u = clamp(u, 0, 1);
      const px = x1 + u * dx, pz = z1 + u * dz;
      if (Math.hypot(px - s.x, pz - s.z) < s.r) return true;
    }
    return false;
  };
  DF.trapCover = function (p) {
    if (!p) return false;
    const t = nowT();
    for (const d of DF.devices) {
      if (d.type === 'snare' && d.until > t && Math.hypot(d.x - p.pos.x, d.z - p.pos.z) <= 5.2) return true;
    }
    return false;
  };
  DF.pointInSmoke = function (x, z) {
    const t = nowT();
    for (const s of DF.smokes) if (s.until >= t && Math.hypot(x - s.x, z - s.z) < s.r) return s;
    return null;
  };

  /* ---------- 烟雾 ---------- */
  function spawnSmoke(x, y, z, r, dur, opts) {
    opts = opts || {};
    const geo = new T.SphereGeometry(r, 12, 9);
    const mat = new T.MeshLambertMaterial({ color: opts.color || 0xd8d2bd, transparent: true, opacity: 0.5, depthWrite: false });
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set(x, (y || 0) + r * 0.42, z);
    mesh.scale.y = 0.72;
    sceneOf().add(mesh);
    // 内圈团块，让烟看起来有体积
    const inner = new T.Mesh(new T.SphereGeometry(r * 0.55, 8, 6), new T.MeshLambertMaterial({ color: 0xc4bda6, transparent: true, opacity: 0.55, depthWrite: false }));
    inner.position.set(x, (y || 0) + r * 0.5, z);
    inner.scale.y = 0.8;
    sceneOf().add(inner);
    DF.smokes.push({ x, y: 0, z, r, until: nowT() + dur, mesh, inner, sting: !!opts.sting, heal: opts.heal || 0, dmg: opts.dmg || 0, ownerId: opts.ownerId || null });
  }

  /* ---------- 爆炸 ---------- */
  const rayAABB = (ox, oy, oz, dx, dy, dz, maxD, box) => {
    // Slab 法：返回 [tmin, tmax] 或 null
    const inv = [1 / (dx || 1e-9), 1 / (dy || 1e-9), 1 / (dz || 1e-9)];
    let t0 = 0, t1 = maxD;
    const axes = [
      [box.minx, box.maxx, ox, inv[0]],
      [box.miny, box.maxy, oy, inv[1]],
      [box.minz, box.maxz, oz, inv[2]]
    ];
    for (const [mn, mx, o, iv] of axes) {
      let ta = (mn - o) * iv, tb = (mx - o) * iv;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    return { tmin: t0, tmax: t1 };
  };
  DF.segmentBlocked = function (ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return false;
    const nx = dx / len, ny = dy / len, nz = dz / len;
    const list = DF.colliders || [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.circle) continue;   // 圆柱碰撞体忽略（罕见）
      const hit = rayAABB(ax, ay, az, nx, ny, nz, len, c);
      if (hit && hit.tmax > 0.5 && hit.tmin < len - 0.5) return true;
    }
    return false;
  };

  function explosionDamage(x, y, z, r, baseDmg, attackerId, opts) {
    opts = opts || {};
    const t = nowT();
    DF.players.forEach(p => {
      if (!p.alive || p.id === attackerId) return;
      const d = Math.hypot(p.pos.x - x, (p.pos.y + 1.0) - y, p.pos.z - z);
      if (d > r) return;
      if (opts.ignoreLOS !== true && DF.segmentBlocked(x, y + 0.6, z, p.pos.x, p.pos.y + 1.2, p.pos.z)) return;
      let dmg = Math.round(baseDmg * (1 - (d / r) * 0.65));
      const kit = DF.kitOf(p);
      if (kit && kit.passive.id === 'damp') dmg = Math.round(dmg * 0.35);   // 牧羊人减振
      dmg = Math.max(4, dmg);
      if (DF._predictFx) { p.hp = Math.max(1, p.hp - 0); /* 客人预测不造成权威伤害 */ }
      else DF.hostDamage(p.id, dmg, attackerId, 'body');
      if (opts.stun) { p.stunUntil = Math.max(p.stunUntil || 0, t + opts.stun); p.botStrafe = 0; }
      if (opts.slow) p.slowUntil = Math.max(p.slowUntil || 0, t + opts.slow);
    });
  }

  DF.fxExplosion = function (x, y, z, scale) {
    scale = scale || 1;
    const scene = sceneOf();
    // 火球
    const ball = new T.Mesh(new T.SphereGeometry(0.9 * scale, 10, 8),
      new T.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false }));
    ball.position.set(x, y + 0.8 * scale, z);
    scene.add(ball);
    // 冲击环
    const ring = new T.Mesh(new T.TorusGeometry(0.5 * scale, 0.12 * scale, 6, 24),
      new T.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
    ring.position.set(x, y + 0.35 * scale, z);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    // 光
    const light = new T.PointLight(0xffa040, 4.2, 18 * scale, 2);
    light.position.set(x, y + 1.2, z);
    scene.add(light);
    // 碎片
    for (let i = 0; i < 10; i++) {
      const shard = new T.Mesh(new T.BoxGeometry(0.12 * scale, 0.12 * scale, 0.12 * scale),
        new T.MeshStandardMaterial({ color: 0x4a4a44, roughness: 0.9 }));
      shard.position.set(x, y + 0.7, z);
      shard.userData.vel = new T.Vector3((Math.random() - 0.5) * 9, 4 + Math.random() * 5, (Math.random() - 0.5) * 9);
      shard.userData.life = 1.4;
      scene.add(shard);
      DF._shards = DF._shards || [];
      DF._shards.push(shard);
    }
    DF._flashBalls = DF._flashBalls || [];
    DF._flashBalls.push({ mesh: ball, ring, light, t: 0 });
    if (DF.Audio && DF.Audio.boom) DF.Audio.boom();
    // 相机震撼（近距离）
    const me = meOf();
    if (me) { const d = me.pos.distanceTo(new T.Vector3(x, y, z)); if (d < 22) DF.camKick && (DF.camKick.pitch += (0.012 + (22 - d) * 0.0012)); }
  };

  function delayedExplosion(delay, x, y, z, dmg, r, attackerId, opts) {
    spawnDelayed(delay, () => {
      explosionDamage(x, y, z, r, dmg, attackerId, opts);
      DF.fxExplosion(x, y, z, r / 2.6);
    });
  }

  /* ---------- 治疗 HoT ---------- */
  function applyHot(targetId, rate, dur, opts) {
    opts = opts || {};
    DF.hots.push({ id: targetId, rate, until: nowT() + dur, src: opts.src || null, cleanse: !!opts.cleanse, power: opts.power || 1 });
    if (opts.cleanse) {
      const p = DF.players.get(targetId);
      if (p) { p.slowUntil = 0; p.stunUntil = 0; p.blindUntil = 0; }
    }
  }
  function healAmountOf(srcId) {
    const src = srcId ? DF.players.get(srcId) : null;
    const kit = src ? DF.kitOf(src) : null;
    return (kit && kit.passive.id === 'fielddress') ? 1.3 : 1;
  }

  /* ---------- 标记 ---------- */
  function markEntities(pred, dur) {
    const t = nowT();
    DF.players.forEach(p => { if (pred(p)) p.markedUntil = Math.max(p.markedUntil || 0, t + dur); });
  }
  const isBotEntity = p => p.isBot && p.alive;

  /* ---------- 友军（AI 队友） ---------- */
  const ALLY_NAMES = [['断牙', 'assault'], ['洛溪', 'support']];
  DF.spawnAllies = function (count) {
    const n = count || 2;
    const colors = ['#7fd0ff', '#8affc1'];
    const me = meOf();
    for (let i = 0; i < n; i++) {
      const id = 'ally' + i;
      if (DF.players.get(id)) continue;
      const def = ALLY_NAMES[i % ALLY_NAMES.length];
      const a = DF.createPlayer({ id, name: '队员·' + def[0], isAlly: true, color: colors[i] });
      a.armor = 0.3;
      a.maxHp = 120;
      a.hp = 120;
      a.weapon = { gun: 'm4a1', atts: [0, 0, 0, 0, 0] };
      a.allySlot = i;
      a.allyRole = def[1];
      a.healCdUntil = 0;
      a.thinkAt = 0;
      a.botTargetPlayer = null;
      DF.players.set(id, a);
      DF.attachMesh(a, DF.scene);
      DF.spawnPlayer(a);
      if (me && me.pos) {
        // 出生在玩家身后两侧（避免挡视野），并做墙体推开
        const baseA = (me.yaw || 0) + (i === 0 ? -0.6 : 0.6);
        a.pos.set(me.pos.x + Math.sin(baseA) * 2.7, 0, me.pos.z + Math.cos(baseA) * 2.7);
        if (DF.collideMove) DF.collideMove(a.pos, 0.4);
      }
    }
  };
  DF.alliesAlive = function () { return DF.players.size ? Array.from(DF.players.values()).filter(p => p.isAlly && p.alive) : []; };

  DF.updateAlly = function (a, dt) {
    if (!a.alive) return;
    const t = nowT();
    const me = meOf();
    // 治疗请求的目标（可能是房主或联机客人）
    const healTarget = a.healRequest ? DF.players.get(a.healRequestFrom || DF.myId) : null;
    // 思考节流
    if (t > a.thinkAt) {
      a.thinkAt = t + 0.4;
      // 找最近的 bot
      let nb = null, nd = 1e9;
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive) return;
        const d = p.pos.distanceTo(a.pos);
        if (d < nd) { nd = d; nb = p; }
      });
      a.botTargetPlayer = nb ? nb.id : null;
      a.botDist = nd;
      // 治疗请求：靠近目标
      if (a.healRequest) {
        if (!healTarget || !healTarget.alive) { a.healRequest = false; a.healRequestFrom = null; }
        else {
          const d = healTarget.pos.distanceTo(a.pos);
          if (d <= 3.2) {
            applyHot(healTarget.id, 12, 2.5, { src: a.id });
            if (healTarget.id === DF.myId) {
              DF.toast && DF.toast('队员·' + a.name.replace('队员·', '') + ' 为你包扎（+30）');
              if (DF.Audio && DF.Audio.loot) DF.Audio.loot();
            }
            a.healRequest = false;
            a.healRequestFrom = null;
            a.healCdUntil = t + ALLY_HEAL_CD;
          }
        }
      }
    }
    // 行为：治疗请求优先 → 交战 → 跟随
    let moveTarget = null, sprint = false, wantFire = false;
    if (a.healRequest && healTarget && healTarget.alive) { moveTarget = healTarget.pos; sprint = true; }
    else if (a.botTargetPlayer) {
      const bot = DF.players.get(a.botTargetPlayer);
      if (bot && bot.alive) {
        const d = bot.pos.distanceTo(a.pos);
        if (d > 17) moveTarget = bot.pos;
        else if (d < 6.5) { moveTarget = null; a.input.f = -0.7; a.input.s = a.allySlot ? 0.8 : -0.8; }
        wantFire = d < 38;
        // 面向目标
        const toT = bot.pos.clone().sub(a.pos);
        a.yaw = Math.atan2(-toT.x, -toT.z);
        a.pitch = clamp(Math.atan2(1.1 - 1.35, d), -0.5, 0.35);
        if (wantFire && t - a.lastFire > 0.33) {
          a.lastFire = t;
          a.ammo = (a.ammo || 30) - 1;
          if (a.ammo <= 0) a.ammo = 30;
          const origin = new T.Vector3(a.pos.x, a.pos.y + 1.62, a.pos.z);
          const dir = new T.Vector3(0, 0, -1).applyEuler(new T.Euler(a.pitch, a.yaw, 0, 'YXZ'));
          const err = 0.012 + d * 0.0021;
          dir.x += (Math.random() - 0.5) * err * 2;
          dir.y += (Math.random() - 0.5) * err;
          dir.z += (Math.random() - 0.5) * err * 2;
          dir.normalize();
          DF.hostShoot(a, origin, dir, false);
        }
      }
    }
    a.input.f = 0; a.input.s = 0; a.input.sprint = false;
    if (!moveTarget && !a.healRequest && me && me.alive) {
      // 跟随：环绕玩家后侧
      const ang = (a.allySlot || 0) * 2.4 + 2.5;
      moveTarget = { x: me.pos.x + Math.sin(ang + Math.PI) * 2.6, y: 0, z: me.pos.z + Math.cos(ang + Math.PI) * 2.6 };
      const d = Math.hypot(moveTarget.x - a.pos.x, moveTarget.z - a.pos.z);
      sprint = d > 7;
      if (d < 2.1) moveTarget = null;
    }
    if (moveTarget) {
      const dx = moveTarget.x - a.pos.x, dz = moveTarget.z - a.pos.z;
      const wantYaw = Math.atan2(-dx, -dz);
      a.yaw = angLerpA(a.yaw, wantYaw, Math.min(1, dt * 3.2));
      a.input.f = 1; a.input.s = 0; a.input.sprint = sprint;
    } else if (!moveTarget && !wantFire) { a.input.f = 0; a.input.s = 0; }
    else if (!moveTarget && wantFire && a.botTargetPlayer) {
      const bot = DF.players.get(a.botTargetPlayer);
      if (bot) { const d = bot.pos.distanceTo(a.pos); if (d < 6.5) a.input.f = -0.6; else if (d > 17) a.input.f = 1; }
    }
    a.input.jump = false; a.input.ads = false;
    DF.applyMovement(a, a.input, dt);
  };
  const angLerpA = (a, b, t) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  const ALLY_HEAL_CD = 25;
  const supportCd = (k) => { k = k === undefined ? DF.kitOf(meOf()) : k; return (k && k.cls === '支援') ? 12 : 25; };
  const supportPower = (k) => { k = k === undefined ? DF.kitOf(meOf()) : k; return (k && k.cls === '支援') ? 1.5 : 1; };

  DF.callSquadHeal = function (caller) {
    if (!DF.matchRunning || DF.matchOver) return;
    const t = nowT();
    const me = caller || meOf();
    // 客人：转发给房主结算（AI 队友在房主侧）
    if (!caller && DF.mode === 'guest' && DF.net && DF.net.sendHeal) { DF.net.sendHeal(); DF.toast && DF.toast('已呼叫 AI 队员前来包扎'); return; }
    const callerKit = caller ? DF.kitOf(caller) : DF.kitOf(me);
    if (DF._squadHealCd && t < DF._squadHealCd) { if (!caller || caller.isLocal) DF.toast && DF.toast('治疗呼叫冷却中 ' + Math.ceil(DF._squadHealCd - t) + 's'); return; }
    if (!me || !me.alive) return;
    const capHp = DF.maxHpOf ? DF.maxHpOf(me) : CFG.maxHp;
    if (me.hp >= capHp) { DF.toast && DF.toast('生命值已满'); return; }
    const allies = DF.alliesAlive();
    if (!allies.length) { if (!caller || caller.isLocal) DF.toast && DF.toast('队员已全灭，无法呼叫治疗'); return; }
    // 最近的队友响应
    let best = null, bd = 1e9;
    for (const a of allies) { const d = a.pos.distanceTo(me.pos); if (d < bd) { bd = d; best = a; } }
    DF._squadHealCd = t + supportCd(callerKit);
    if (bd <= 14) {
      const amt = 30 * supportPower(callerKit);
      applyHot(me.id, amt / 2.5, 2.5, { src: best.id });
      if (!caller || caller.isLocal) { DF.toast && DF.toast('队员·' + best.name.replace('队员·', '') + ' 开始治疗你（+' + Math.round(amt) + '）'); if (DF.Audio && DF.Audio.loot) DF.Audio.loot(); }
    } else {
      best.healRequest = true;
      best.healRequestFrom = me.id;
      DF.toast && DF.toast('已呼叫队员·' + best.name.replace('队员·', '') + '，他正赶来包扎你');
    }
  };

  /* ============================================================
     技能执行器（房主权威 / 单人本地执行；客人经 'ab' 中继给房主）
     ============================================================ */
  const aimPoint = (me, maxDist) => {
    const d = aimDir(me);
    const dist = maxDist || 18;
    const p = me.pos.clone().addScaledVector(d, dist);
    // 落点压到地面附近（手雷/烟雾）
    return p;
  };
  function aimDir(me) {
    return new T.Vector3(0, 0, -1).applyEuler(new T.Euler(me.pitch || 0, me.yaw || 0, 0, 'YXZ'));
  }
  const groundOf = p => ({ x: p.x, y: 0, z: p.z });

  const EXEC = {
    frag3(me) {
      const p = aimPoint(me, 13);
      for (let i = 0; i < 3; i++) {
        const jitter = i === 1 ? 2.2 : i === 2 ? -2.0 : 0;
        delayedExplosion(0.55 + i * 0.28, p.x + jitter, Math.max(0, p.y), p.z + jitter * 0.4, 45, 2.5, me.id, { stun: 0.6 });
      }
    },
    smoke_burst(me) { const p = aimPoint(me, 26); spawnSmoke(p.x, 0, p.z, 3.6, 5); },
    exo(me) {
      me.hasteUntil = Math.max(me.hasteUntil || 0, nowT() + 6); me.hasteMul = 1.35;
      me.fireRateUntil = Math.max(me.fireRateUntil || 0, nowT() + 6); me.fireRateMul = 0.68;
      me.exoUntil = nowT() + 6;
    },
    boost(me) { dashEntity(me, 6.5); me._killResetCd = 0; me.weilongBoost = true; },
    c4(me) { const p = aimPoint(me, 16); placeBomb(me, p.x, Math.max(0, p.y), p.z); },
    slam(me) { const p = aimPoint(me, 17); delayedExplosion(0.35, p.x, 0, p.z, 28, 4.5, me.id, { stun: 2.2 }); },
    glaive(me) {
      const dir = aimDir(me);
      const t = nowT();
      let best = null, bd = 1e9;
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive) return;
        const to = p.pos.clone().sub(me.pos); const d = to.length();
        if (d > 16) return;
        to.normalize();
        if (to.dot(dir) < 0.5) return;
        if (d < bd) { bd = d; best = p; }
      });
      if (best) {
        hitEntity(best.id, 26, me.id);
        best.slowUntil = Math.max(best.slowUntil || 0, t + 2.5);
        best.slowMul = 0.65;
        markEntities(p => p.id === best.id, 2.5);
      } else {
        DF.toast && DF.toast('旋风飞刃没有锁定目标');
      }
    },
    flashbang(me) { const p = aimPoint(me, 12); spawnFlash(p.x, p.z, 4, 2.4, me.id); },
    cloak(me) { me.invisibleUntil = nowT() + 5; markLocal(); },
    roll(me) { dashEntity(me, 5); me._killResetCd = 0; me.jfengRoll = true; },
    emp_cone(me) {
      const dir = aimDir(me); const t = nowT(); let n = 0;
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive) return;
        const to = p.pos.clone().sub(me.pos); to.y = 0; const d = to.length();
        if (d > 13) return;
        to.normalize(); if (to.dot(new T.Vector3(dir.x, 0, dir.z).normalize()) < 0.72) return;
        p.stunUntil = Math.max(p.stunUntil || 0, t + 2.0);
        p.accDebuffUntil = Math.max(p.accDebuffUntil || 0, t + 4);
        hitEntity(p.id, 22, me.id); n++;
      });
      if (n === 0) DF.toast && DF.toast('钻墙电刺没有穿透到敌人');
    },
    anchor(me) { if (me.anchorActive && !me.anchorUsed) { me.anchorTeleport = true; } else { me.anchorPos = me.pos.clone(); me.anchorActive = true; me.anchorUsed = false; DF.toast && DF.toast('紧急回避锚点已部署（V 再次激活拉回）'); } },
    frag(me) { const p = aimPoint(me, 10); delayedExplosion(1.35, p.x, Math.max(0, p.y), p.z, 55, 2.8, me.id, { stun: 0.8 }); },
    ring_smoke(me) { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; spawnSmoke(me.pos.x + Math.sin(a) * 4.2, 0, me.pos.z + Math.cos(a) * 4.2, 2.3, 6); } },
    shield_bash(me) { dashEntity(me, 7); me.shieldUntil = Math.max(me.shieldUntil || 0, nowT() + 1.8); me.shieldAmount = Math.max(me.shieldAmount || 0, 75); me.shieldArc = 120; me.shieldYaw = me.yaw; },
    ironwall(me) { me.ironwallUntil = nowT() + 5; },
    smoke(me) { const p = aimPoint(me, 14); spawnSmoke(p.x, 0, p.z, 3.6, 8); },
    smoke_line(me) { const d = aimDir(me); for (let i = 0; i < 3; i++) { const dist = 7 + i * 4.6; spawnSmoke(me.pos.x + d.x * dist, 0, me.pos.z + d.z * dist, 2.6, 8); } },
    stim_pistol(me) {
      const t = nowT(); let n = 0;
      DF.players.forEach(p => {
        if (!p.alive) return;
        if (p.isBot) return;
        if (p.pos.distanceTo(me.pos) <= 11) { applyHot(p.id, 7.5, 4, { src: me.id, cleanse: true }); n++; }
      });
      DF.toast && DF.toast(n ? '激素枪命中 ' + n + ' 名友军' : '范围内没有友军');
    },
    nano_dust(me) {
      let best = null, bd = 1e9;
      DF.players.forEach(p => { if (p.isBot || !p.alive || p.id === me.id) return; const d = p.pos.distanceTo(me.pos); if (d < bd) { bd = d; best = p; } });
      const t = best || me;
      applyHot(t.id, 6, 5, { src: me.id });
      DF.toast && DF.toast('纳米医疗粉尘已给「' + (t.id === me.id ? '你自己' : t.name) + '」注射');
    },
    rc_smoke(me) { const p = aimPoint(me, 20); spawnSmoke(p.x, 0, p.z, 3.0, 7); },
    rescue_swarm(me) {
      let n = 0;
      DF.players.forEach(p => { if (p.isBot || !p.alive) return; applyHot(p.id, 15, 3, { src: me.id, cleanse: true }); n++; });
      DF.toast && DF.toast('蝶式救援无人机群已触达 ' + n + ' 名友军');
    },
    stim_gas(me) { const p = aimPoint(me, 14); spawnZone(p.x, p.z, 3.4, 4, { dmg: 10, heal: 8, ownerId: me.id }); },
    sting_smoke(me) { const p = aimPoint(me, 14); spawnSmoke(p.x, 0, p.z, 3.4, 7, { sting: true }); },
    dog(me) { spawnPet('dog', me, 12); },
    adrenaline(me) {
      const t = nowT();
      DF.players.forEach(p => {
        if (p.isBot || !p.alive) return;
        if (p.pos.distanceTo(me.pos) <= 10) { p.recoilBoostUntil = t + 5; p.recoilMul = 0.7; p.reloadBoostUntil = t + 5; p.reloadMul = 0.75; }
      });
      DF.toast && DF.toast('肾上腺素已注射周围友军');
    },
    toxic_smoke(me) { const p = aimPoint(me, 15); spawnSmoke(p.x, 0, p.z, 3.6, 7, { sting: true, color: 0xa8b37a }); },
    swarm(me) {
      const t = nowT(); let n = 0;
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive) return;
        if (p.pos.distanceTo(me.pos) <= 14) { p.markedUntil = t + 6; p.vulnUntil = t + 6; n++; }
      });
      DF.toast && DF.toast('「流荧」集群锁定了 ' + n + ' 个目标');
    },
    pulse(me) {
      const dir = aimDir(me); const t = nowT(); let n = 0;
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive) return;
        const to = p.pos.clone().sub(me.pos); to.y = 0; const d = to.length();
        if (d > 7) return;
        to.normalize(); if (to.dot(new T.Vector3(dir.x, 0, dir.z).normalize()) < 0.5) return;
        p.stunUntil = Math.max(p.stunUntil || 0, t + 1.4); n++;
      });
      if (n === 0) DF.toast && DF.toast('声波脉冲没有命中任何敌人');
    },
    jammer(me) { spawnZone(me.pos.x, me.pos.z, 10, 5, { jam: true, color: 0x8ab4d8 }); },
    sonic(me) {
      const t = nowT(); let n = 0;
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive) return;
        if (p.pos.distanceTo(me.pos) <= 26) { p.stunUntil = Math.max(p.stunUntil || 0, t + 3.2); hitEntity(p.id, 18, me.id); n++; }
      });
      DF.toast && DF.toast('声波震慑命中 ' + n + ' 个目标');
    },
    sandbags(me) {
      const dir = aimDir(me);
      for (let i = -1; i <= 1; i++) {
        const perp = new T.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(i * 2.3);
        const bx = me.pos.x + dir.x * 2.6 + perp.x, bz = me.pos.z + dir.z * 2.6 + perp.z;
        spawnSandbag(bx, bz, Math.atan2(dir.x, dir.z));
      }
    },
    mine(me) { placeDevice('mine', me, { dmg: 75, stun: 1.0, radius: 1.4, armed: 1.2 }); },
    loiter(me) {
      const dir = aimDir(me);
      let best = null, bd = 1e9;
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive) return;
        const to = p.pos.clone().sub(me.pos); const d = to.length();
        if (d > 40) return;
        to.y = 0; to.normalize(); if (to.dot(new T.Vector3(dir.x, 0, dir.z).normalize()) < 0.88) return;
        if (d < bd) { bd = d; best = p; }
      });
      if (best) {
        spawnDelayed(0.6, () => {
          const t = nowT();
          explosionDamage(best.pos.x, 0, best.pos.z, 2.6, 85, me.id, { stun: 1.2 });
          DF.fxExplosion(best.pos.x, 0, best.pos.z, 1.15);
        });
        DF.toast && DF.toast('巡飞弹已锁定目标');
      } else {
        const p = aimPoint(me, 22);
        delayedExplosion(0.7, p.x, 0, p.z, 70, 2.6, me.id, { stun: 1.0 });
        DF.toast && DF.toast('巡飞弹按坐标投送');
      }
    },
    shield(me) { me.shieldUntil = nowT() + 4; me.shieldAmount = Math.max(me.shieldAmount || 0, 80); me.shieldArc = 120; me.shieldYaw = me.yaw; },
    bash(me) { dashEntity(me, 3); bashPath(me, 1.6, 1.2, 15); },
    bombsuit(me) { me.shieldUntil = nowT() + 6; me.shieldAmount = Math.max(me.shieldAmount || 0, 130); me.shieldArc = 360; me.shieldYaw = me.yaw; me.cumbersomeUntil = nowT() + 6; },
    snare(me) { placeDevice('snare', me, { root: 2.2, radius: 1.3, armed: 0.5, maxActive: 3 }); },
    spider(me) { spawnPet('spider', me, 10); },
    web_all(me) {
      const t = nowT(); let n = 0;
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive) return;
        if (p.pos.distanceTo(me.pos) <= 13) { p.stunUntil = Math.max(p.stunUntil || 0, t + 3.0); hitEntity(p.id, 30, me.id); n++; }
      });
      DF.toast && DF.toast('寻猎捕网禁锢了 ' + n + ' 个目标');
    },
    frost_bolt(me) {
      const t = nowT(); const dir = aimDir(me);
      let best = null, bd = 1e9;
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive) return;
        const to = p.pos.clone().sub(me.pos); const d = to.length();
        if (d > 14) return;
        to.y = 0; to.normalize(); if (to.dot(new T.Vector3(dir.x, 0, dir.z).normalize()) < 0.45) return;
        if (d < bd) { bd = d; best = p; }
      });
      if (best) { applyFrost(best, 1, me.id); hitEntity(best.id, 22, me.id); }
      else DF.toast && DF.toast('没有敌人在冷凝瓶射程内');
    },
    frost_field(me) { const p = aimPoint(me, 13); spawnZone(p.x, p.z, 4.2, 5, { frost: true, color: 0x9fd0e8 }); },
    frost_volley(me) {
      const p = aimPoint(me, 14);
      for (let i = 0; i < 3; i++) {
        spawnDelayed(0.4 + i * 0.22, () => {
          explosionDamage(p.x + (i - 1) * 1.8, 0, p.z + (i - 1) * 1.2, 2.2, 15, me.id, {});
          DF.fxExplosion(p.x + (i - 1) * 1.8, 0, p.z + (i - 1) * 1.2, 0.55);
          DF.players.forEach(q => { if (!q.isBot || !q.alive) return; if (q.pos.distanceTo(new T.Vector3(p.x + (i - 1) * 1.8, 0, p.z + (i - 1) * 1.2)) <= 2.4) applyFrost(q, 2, me.id); });
        });
      }
    },
    smoke_arrow(me) { const p = aimPoint(me, 25); spawnSmoke(p.x, 0, p.z, 2.8, 6); },
    power_shot(me) { me.powerShotUntil = nowT() + 6; },
    recon_arrow(me) { markEntities(p => isBotEntity(p) && p.pos.distanceTo(me.pos) <= 26, 6); DF.toast && DF.toast('侦察箭矢高亮了周围敌人'); },
    ghost_step(me) { me.ghostUntil = nowT() + 5; },
    trace(me) {
      let best = null, bd = 1e9; const dir = aimDir(me);
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive) return;
        const to = p.pos.clone().sub(me.pos); const d = to.length();
        if (d > 22) return;
        if (d < bd) { bd = d; best = p; }
      });
      if (best) { best.markedUntil = nowT() + 5; me.trackDirUntil = nowT() + 3; me.trackTarget = best.id; DF.toast && DF.toast('信号锁定：' + best.name); }
      else DF.toast && DF.toast('没有可追踪的敌人');
    },
    sigint(me) { markEntities(p => isBotEntity(p) && p.pos.distanceTo(me.pos) <= 18, 6); me.sigintUntil = nowT() + 6; },
    cone_scan(me) {
      const dir = aimDir(me); const t = nowT(); let n = 0;
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive) return;
        const to = p.pos.clone().sub(me.pos); to.y = 0; const d = to.length();
        if (d > 20) return;
        to.normalize(); if (to.dot(new T.Vector3(dir.x, 0, dir.z).normalize()) < 0.866) return;
        p.markedUntil = t + 5; n++;
      });
      DF.toast && DF.toast('扫描到 ' + n + ' 个目标');
    },
    falcon(me) { spawnPet('falcon', me, 12); },
    eagle_eye(me) { markEntities(p => isBotEntity(p) && p.pos.distanceTo(me.pos) <= 34, 8); },
    listen(me) {
      const list = [];
      DF.players.forEach(p => { if (p.isBot && p.alive) list.push(p); });
      list.sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos));
      me.listenUntil = nowT() + 3;
      me.listenTargets = list.slice(0, 2).map(p => p.id);
      DF.toast && DF.toast(list.length ? '已标注最近 ' + Math.min(2, list.length) + ' 名敌人方位' : '附近听不到敌人');
    },
    sound_trap(me) { placeDevice('sound', me, { root: 0, slow: 3, slowMul: 0.5, radius: 1.3, armed: 0.5, reveal: 5 }); },
    sonar(me) { me.sonarUntil = nowT() + 12; markEntities(isBotEntity, 12); },
    bash_mini(me) { dashEntity(me, 4); me.shieldUntil = Math.max(me.shieldUntil || 0, nowT() + 1.5); me.shieldAmount = Math.max(me.shieldAmount || 0, 40); me.shieldArc = 120; me.shieldYaw = me.yaw; }
  };

  function dashEntity(me, dist) {
    const dir = aimDir(me);
    const step = 0.5;
    let moved = 0;
    for (let i = 0; i < Math.floor(dist / step); i++) {
      const nx = me.pos.x + dir.x * step, nz = me.pos.z + dir.z * step;
      // 粗略墙碰撞：被推开则停止
      let blocked = false;
      const list = DF.colliders || [];
      for (let j = 0; j < list.length; j++) {
        const c = list[j];
        if (c.circle) { if (Math.hypot(nx - c.x, nz - c.z) < c.r + 0.35) { blocked = true; break; } continue; }
        if (nx > c.minx - 0.35 && nx < c.maxx + 0.35 && nz > c.minz - 0.35 && nz < c.maxz + 0.35 && me.pos.y + 1.0 > (c.miny || 0) && me.pos.y + 1.0 < (c.maxy || 99)) { blocked = true; break; }
      }
      if (blocked) break;
      me.pos.x = nx; me.pos.z = nz; moved += step;
    }
    me.vel.x = dir.x * 6; me.vel.z = dir.z * 6;
    return moved;
  }
  function bashPath(me, radius, stun, dmg) {
    const t = nowT();
    const dir = aimDir(me);
    DF.players.forEach(p => {
      if (!p.isBot || !p.alive) return;
      const to = p.pos.clone().sub(me.pos); to.y = 0; const d = to.length();
      if (d > 4.5) return;
      to.normalize(); if (to.dot(new T.Vector3(dir.x, 0, dir.z).normalize()) < 0.6) return;
      p.stunUntil = Math.max(p.stunUntil || 0, t + stun); hitEntity(p.id, dmg, me.id);
    });
  }
  function hitEntity(victimId, dmg, attackerId) {
    if (DF._predictFx) return;   // 客人本地预演：不同步权威伤害，房主结算
    // 统一走权威伤害（含护甲/击杀结算）
    DF.hostDamage(victimId, dmg, attackerId, 'body');
  }
  function spawnFlash(x, z, r, stun, attackerId) {
    const t = nowT();
    DF.players.forEach(p => {
      if (!p.alive) return;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d > r) return;
      if (p.isBot) { p.stunUntil = Math.max(p.stunUntil || 0, t + stun); p.accDebuffUntil = Math.max(p.accDebuffUntil || 0, t + stun + 0.6); }
      else { p.flashUntil = t + 1.3; }
    });
    const flash = new T.PointLight(0xffffff, 3.5, 14, 2);
    flash.position.set(x, 1.5, z);
    sceneOf().add(flash);
    spawnDelayed(0.25, () => { sceneOf().remove(flash); flash.dispose && flash.dispose(); });
  }
  function placeBomb(me, x, y, z) {
    const mesh = new T.Mesh(new T.BoxGeometry(0.3, 0.2, 0.42), new T.MeshStandardMaterial({ color: 0x8a2c1e, roughness: 0.6, emissive: 0x400000 }));
    mesh.position.set(x, Math.max(0.35, y), z);
    sceneOf().add(mesh);
    DF._c4s = DF._c4s || [];
    DF._c4s.push({ mesh, t: 2.2, x, y: Math.max(0.35, y), z, attackerId: me.id });
  }
  function placeDevice(type, me, opts) {
    const dir = aimDir(me);
    const px = me.pos.x + dir.x * 1.9, pz = me.pos.z + dir.z * 1.9;
    // 限制同类最大数量
    const same = DF.devices.filter(d => d.type === type);
    if (opts.maxActive && same.length >= opts.maxActive) { const old = same[0]; removeDevice(old); }
    const color = type === 'mine' ? 0x5a5a34 : (type === 'snare' ? 0x3a4a5a : 0x3a5a44);
    const mesh = new T.Mesh(new T.CylinderGeometry(0.22, 0.28, 0.12, 8), new T.MeshStandardMaterial({ color, roughness: 0.6, emissive: type === 'mine' ? 0x331100 : 0x001133, emissiveIntensity: 0.7 }));
    mesh.position.set(px, 0.08, pz);
    sceneOf().add(mesh);
    DF.devices.push({ type, x: px, y: 0, z: pz, r: opts.radius || 1.3, armedAt: nowT() + (opts.armed || 0.8), until: nowT() + 90, mesh, dmg: opts.dmg || 0, root: opts.root || 0, slow: opts.slow || 0, slowMul: opts.slowMul || 1, reveal: opts.reveal || 0, ownerId: me.id });
  }
  function removeDevice(d) {
    if (d.mesh) { sceneOf().remove(d.mesh); dispose(d.mesh); }
    const i = DF.devices.indexOf(d); if (i >= 0) DF.devices.splice(i, 1);
  }
  function spawnZone(x, z, r, dur, opts) {
    const color = opts.color || 0xaab37a;
    const mesh = new T.Mesh(new T.CylinderGeometry(r, r, 0.5, 16, 1, true),
      new T.MeshLambertMaterial({ color, transparent: true, opacity: 0.4, side: T.DoubleSide, depthWrite: false }));
    mesh.position.set(x, 0.25, z);
    sceneOf().add(mesh);
    DF.zones = DF.zones || [];
    DF.zones.push({ x, z, r, until: nowT() + dur, mesh, dmg: opts.dmg || 0, heal: opts.heal || 0, jam: !!opts.jam, frost: !!opts.frost, ownerId: opts.ownerId || null });
  }
  function applyFrost(p, stacks, srcId) {
    const t = nowT();
    p.frostStacks = (p.frostStacks || 0) + stacks;
    if (p.frostStacks >= 3) { p.stunUntil = Math.max(p.stunUntil || 0, t + 2.0); p.frostStacks = 0; }
    p.slowUntil = Math.max(p.slowUntil || 0, t + 2.5);
    p.slowMul = Math.min(p.slowMul || 1, p.frostStacks >= 2 ? 0.5 : 0.6);
  }
  function spawnPet(type, owner, dur) {
    const geo = type === 'dog'
      ? new T.BoxGeometry(0.5, 0.42, 0.9)
      : type === 'falcon' ? new T.ConeGeometry(0.22, 0.6, 6)
      : new T.BoxGeometry(0.34, 0.22, 0.34);
    const mat = new T.MeshStandardMaterial({ color: type === 'dog' ? 0x5a4a34 : type === 'falcon' ? 0x6a6a72 : 0x2c3438, roughness: 0.8, emissive: type === 'spider' ? 0x113344 : 0x000000, emissiveIntensity: 0.8 });
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set(owner.pos.x + 1, 0.4, owner.pos.z + 1);
    sceneOf().add(mesh);
    DF.pets.push({ type, ownerId: owner.id, until: nowT() + dur, mesh, atkCd: 0, mode: 'follow' });
  }
  function spawnSandbag(x, z, rotY) {
    const geo = new T.BoxGeometry(2.3, 1.15, 1.0);
    const mat = new T.MeshStandardMaterial({ color: 0x9a8a5e, roughness: 0.95 });
    const mesh = new T.Mesh(geo, mat);
    // 绕 Y 旋转包围盒（轴对齐近似：仅 45° 内的朝向直接互换长宽）
    const swap = Math.abs(Math.sin(rotY)) > 0.7;
    const w = swap ? 1.0 : 2.3, d = swap ? 2.3 : 1.0;
    mesh.position.set(x, 0.575, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    sceneOf().add(mesh);
    mesh.userData.solid = true;
    DF.worldMeshes.push(mesh);
    DF.colliders.push({ minx: x - w / 2, maxx: x + w / 2, miny: 0, maxy: 1.15, minz: z - d / 2, maxz: z + d / 2 });
    DF.obstacleMeta.push({ x, z, w, d, h: 1.15 });
    DF.sandbags.push(mesh);
    spawnDelayed(45, () => removeSandbag(mesh));
  }
  function removeSandbag(mesh) {
    const scene = sceneOf();
    scene.remove(mesh); dispose(mesh);
    const i = DF.sandbags.indexOf(mesh); if (i >= 0) DF.sandbags.splice(i, 1);
    // 从 colliders / worldMeshes / obstacleMeta 中移除对应项
    const p = mesh.position;
    const ri = DF.colliders.findIndex(c => !c.circle && Math.abs((c.minx + c.maxx) / 2 - p.x) < 0.01 && Math.abs((c.minz + c.maxz) / 2 - p.z) < 0.01 && Math.abs((c.maxy || 0) - 1.15) < 0.01);
    if (ri >= 0) DF.colliders.splice(ri, 1);
    const mi = DF.worldMeshes.indexOf(mesh); if (mi >= 0) DF.worldMeshes.splice(mi, 1);
    const oi = DF.obstacleMeta.findIndex(o => Math.abs(o.x - p.x) < 0.01 && Math.abs(o.z - p.z) < 0.01 && Math.abs(o.h - 1.15) < 0.01);
    if (oi >= 0) DF.obstacleMeta.splice(oi, 1);
  }
  function markLocal() { /* 占位：隐身不需要本地特殊 UI，突破音效除外 */ }

  /* ============================================================
     使用技能：冷却 / 执行 / 提示
     ============================================================ */
  DF.abilityState = function () {
    const me = meOf();
    const kit = DF.kitOf(me);
    return {
      op: DF.selectedOperator(),
      kit,
      cds: me ? [0, 0, 0].map((_, i) => Math.max(0, (me._abCd && me._abCd[i]) ? me._abCd[i] - nowT() : 0)) : [0, 0, 0],
      squadCd: Math.max(0, (DF._squadHealCd || 0) - nowT())
    };
  };

  const validKitId = id => (typeof id === 'string' && DF.operatorKits && DF.operatorKits[id]) ? id : null;

  DF.execAbilityFor = function (me, slot, fromNet) {
    if (!me || !me.alive) return false;
    const kit = DF.kitOf(me);
    if (!kit) return false;
    const ab = kit.abilities[slot];
    if (!ab) return false;
    const exec = EXEC[ab.id];
    if (!exec) { if (!fromNet) DF.toast && DF.toast(ab.name + ' 暂不可用'); return false; }
    const t = nowT();
    const cds = me._abCd || (me._abCd = [0, 0, 0]);
    if (fromNet) {   // 房主代客人：权威冷却防刷
      if (t < cds[slot]) return false;
      cds[slot] = t + ab.cd;
    }
    try { exec(me); } catch (e) { console.error('ability error', ab.id, e); if (!fromNet) DF.toast && DF.toast('技能释放失败'); return false; }
    // 威龙·动能辅助系统：使用任何技能后 1.5 秒 +25% 移速
    if (kit.passive.id === 'soar') { me.hasteUntil = Math.max(me.hasteUntil || 0, t + 1.5); me.hasteMul = 1.25; }
    if (kit.passive.id === 'quiet') { me.quietUntil = t + 1.0; }
    return true;
  };

  DF.useAbility = function (slot) {
    if (!DF.matchRunning || DF.matchOver) return;
    const me = meOf();
    if (!me || !me.alive) return;
    const kit = DF.kitOf(me);
    if (!kit) return;
    const ab = kit.abilities[slot];
    if (!ab) return;
    const cds = me._abCd || (me._abCd = [0, 0, 0]);
    const t = nowT();
    if (t < cds[slot]) { DF.toast && DF.toast(ab.name + ' 冷却中 ' + Math.ceil(cds[slot] - t) + 's'); return; }
    // 客人：转发房主权威结算，同时本地预演（不造成伤害，只播表现）
    if (DF.mode === 'guest' && DF.net && DF.net.sendAbility) {
      DF.net.sendAbility(slot, aimDir(me));
      cds[slot] = t + ab.cd;
      DF.toast && DF.toast(ab.name + ' 已发送');
      pulseHud(slot);
      DF._predictFx = true;
      try { DF.execAbilityFor(me, slot, false); } finally { DF._predictFx = false; }
      return;
    }
    const ok = DF.execAbilityFor(me, slot, false);
    if (!ok) return;
    cds[slot] = t + ab.cd;
    pulseHud(slot);
  };

  function pulseHud(slot) {
    const el = document.querySelector('#abilbar .abil[data-slot="' + slot + '"]');
    if (el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  }

  /* ============================================================
     每帧系统更新：延迟调用 / HoT / 烟雾 / 区域 / 装置 / 随从 / 沙袋到期
     ============================================================ */
  DF.updateOperatorSystems = function (dt) {
    const t = nowT();
    // 延迟调用
    if (DF.delayed.length) {
      const due = [];
      for (let i = DF.delayed.length - 1; i >= 0; i--) if (DF.delayed[i].t <= t) { due.push(DF.delayed[i]); DF.delayed.splice(i, 1); }
      due.forEach(d => { try { d.fn(); } catch (e) { console.error(e); } });
    }
    // C4
    if (DF._c4s) {
      for (let i = DF._c4s.length - 1; i >= 0; i--) {
        const c = DF._c4s[i];
        c.t -= dt;
        c.mesh.material.emissiveIntensity = (Math.sin(t * (6 + (2.2 - c.t) * 18)) * 0.5 + 0.5) * 1.6;
        if (c.t <= 0) {
          explosionDamage(c.x, c.y, c.z, 3.6, 90, c.attackerId, { stun: 1.0 });
          DF.fxExplosion(c.x, 0, c.z, 1.4);
          sceneOf().remove(c.mesh); dispose(c.mesh);
          DF._c4s.splice(i, 1);
        }
      }
    }
    // 爆炸光球/碎片
    if (DF._flashBalls) {
      for (let i = DF._flashBalls.length - 1; i >= 0; i--) {
        const f = DF._flashBalls[i];
        f.t += dt;
        const k = f.t / 0.5;
        if (k >= 1) { sceneOf().remove(f.mesh); sceneOf().remove(f.ring); sceneOf().remove(f.light); dispose(f.mesh); dispose(f.ring); DF._flashBalls.splice(i, 1); continue; }
        f.mesh.scale.setScalar(1 + k * 2.6);
        f.mesh.material.opacity = 0.95 * (1 - k);
        f.ring.scale.setScalar(1 + k * 5.2);
        f.ring.material.opacity = 0.9 * (1 - k);
        f.light.intensity = 4.2 * (1 - k);
      }
    }
    if (DF._shards) {
      for (let i = DF._shards.length - 1; i >= 0; i--) {
        const s = DF._shards[i];
        s.userData.life -= dt;
        if (s.userData.life <= 0) { sceneOf().remove(s); dispose(s); DF._shards.splice(i, 1); continue; }
        s.userData.vel.y -= 9.5 * dt;
        s.position.addScaledVector(s.userData.vel, dt);
        if (s.position.y < 0.06) { s.position.y = 0.06; s.userData.vel.y *= -0.4; s.userData.vel.x *= 0.7; s.userData.vel.z *= 0.7; }
      }
    }
    // 疾风·紧急回避装置：再次激活拉回锚点
    DF.players.forEach(p => {
      if (!p.anchorTeleport) return;
      p.anchorTeleport = false;
      if (!p.anchorPos) return;
      p.pos.copy(p.anchorPos);
      if (p.vel) p.vel.set(0, 0, 0);
      p.vy = 0; p.anchorActive = false; p.anchorUsed = true;
      if (p.id === DF.myId) DF.toast && DF.toast('⚓ 已回到锚点');
      DF.net && DF.net.hostBroadcast({ t: 'rs', id: p.id, p: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)] });
    });
    // 银翼·踪迹探查：22m 内移动的敌人自动标记
    const lp = meOf();
    const lk2 = lp ? DF.kitOf(lp) : null;
    if (lk2 && lk2.passive.id === 'footprint') {
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive) return;
        if (Math.hypot(p.vel.x, p.vel.z) > 1.2 && p.pos.distanceTo(lp.pos) <= 22) p.markedUntil = t + 1.5;
      });
    }
    // HoT
    for (let i = DF.hots.length - 1; i >= 0; i--) {
      const h = DF.hots[i];
      if (h.until < t) { DF.hots.splice(i, 1); continue; }
      const p = DF.players.get(h.id);
      if (!p || !p.alive) { DF.hots.splice(i, 1); continue; }
      const src = h.src ? DF.players.get(h.src) : null;
      const mul = healAmountOf(h.src);
      p.hp = Math.min(DF.maxHpOf(p), p.hp + h.rate * mul * dt);
    }
    // 烟雾：生命周期 + 持续治疗/伤害（气雾针剂）
    for (let i = DF.smokes.length - 1; i >= 0; i--) {
      const s = DF.smokes[i];
      if (s.until < t) { sceneOf().remove(s.mesh); sceneOf().remove(s.inner); dispose(s.mesh); dispose(s.inner); DF.smokes.splice(i, 1); continue; }
      const remain = s.until - t;
      if (remain < 1.2) { const k = remain / 1.2; s.mesh.material.opacity = 0.5 * k; s.inner.material.opacity = 0.55 * k; }
      if (s.heal > 0 || s.dmg > 0) {
        DF.players.forEach(p => {
          if (!p.alive) return;
          const inside = Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r;
          if (!inside) return;
          if (p.isBot && s.dmg > 0) { p._zoneAcc = (p._zoneAcc || 0) + s.dmg * dt; const d = Math.floor(p._zoneAcc); if (d >= 1) { p._zoneAcc -= d; if (!DF._predictFx) DF.hostDamage(p.id, d, s.ownerId, 'body'); } }
          else if (s.heal > 0) p.hp = Math.min(DF.maxHpOf(p), p.hp + s.heal * dt);
        });
      }
    }
    // 区域（毒雾/干扰/霜化/气雾）
    if (DF.zones) {
      for (let i = DF.zones.length - 1; i >= 0; i--) {
        const z = DF.zones[i];
        if (z.until < t) { sceneOf().remove(z.mesh); dispose(z.mesh); DF.zones.splice(i, 1); continue; }
        z.mesh.rotation.y += dt * 0.8;
        DF.players.forEach(p => {
          if (!p.alive) return;
          const d = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
          if (d > z.r) return;
          if (z.frost) { if (p.isBot) { p.slowUntil = Math.max(p.slowUntil || 0, t + 0.6); p.slowMul = Math.min(p.slowMul || 1, 0.45); } }
          else if (z.jam) { if (p.isBot) p.accDebuffUntil = Math.max(p.accDebuffUntil || 0, t + 0.6); }
          else if (z.dmg > 0 && p.isBot) { p._zoneAcc = (p._zoneAcc || 0) + z.dmg * dt; const d = Math.floor(p._zoneAcc); if (d >= 1) { p._zoneAcc -= d; if (!DF._predictFx) DF.hostDamage(p.id, d, z.ownerId, 'body'); } }
          else if (z.heal > 0 && !p.isBot) p.hp = Math.min(DF.maxHpOf(p), p.hp + z.heal * dt);
        });
      }
    }
    // 装置（地雷/捕网/声波陷阱）
    for (let i = DF.devices.length - 1; i >= 0; i--) {
      const d = DF.devices[i];
      if (d.until < t) { removeDevice(d); continue; }
      const armed = t >= d.armedAt;
      if (armed && d.mesh) d.mesh.material.emissiveIntensity = 0.8 + Math.sin(t * 5) * 0.6;
      if (!armed) continue;
      let triggered = null;
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive || triggered) return;
        if (Math.hypot(p.pos.x - d.x, p.pos.z - d.z) <= d.r) triggered = p;
      });
      if (!triggered) continue;
      if (d.type === 'mine') {
        explosionDamage(d.x, 0, d.z, 2.2, d.dmg, d.ownerId, { stun: d.stun || 0 });
        DF.fxExplosion(d.x, 0, d.z, 0.9);
      } else if (d.type === 'snare') {
        triggered.stunUntil = Math.max(triggered.stunUntil || 0, t + (d.root || 2.2));
        triggered.markedUntil = Math.max(triggered.markedUntil || 0, t + 3);
        DF.toast && DF.toast('捕网命中了 ' + triggered.name);
      } else if (d.type === 'sound') {
        triggered.markedUntil = Math.max(triggered.markedUntil || 0, t + (d.reveal || 5));
        triggered.slowUntil = Math.max(triggered.slowUntil || 0, t + (d.slow || 0));
        triggered.slowMul = d.slowMul || 1;
      }
      removeDevice(d);
    }
    // 随从
    for (let i = DF.pets.length - 1; i >= 0; i--) {
      const pet = DF.pets[i];
      if (pet.until < t) { sceneOf().remove(pet.mesh); dispose(pet.mesh); DF.pets.splice(i, 1); continue; }
      const owner = DF.players.get(pet.ownerId);
      if (!owner || !owner.alive) { sceneOf().remove(pet.mesh); dispose(pet.mesh); DF.pets.splice(i, 1); continue; }
      pet.atkCd -= dt;
      // 找最近敌人
      let nb = null, nd = 1e9;
      DF.players.forEach(p => {
        if (!p.isBot || !p.alive) return;
        const dd = p.pos.distanceTo(pet.mesh.position);
        if (dd < nd) { nd = dd; nb = p; }
      });
      const tgtPos = nb ? nb.pos : owner.pos;
      const tp = new T.Vector3(tgtPos.x, pet.type === 'spider' ? 0.35 : 0.45, tgtPos.z);
      const to = tp.clone().sub(pet.mesh.position); to.y = 0;
      const dist = to.length();
      const keep = pet.type === 'spider' ? 6.5 : (nb ? 0.9 : 2.2);
      if (dist > keep) {
        to.normalize();
        const spd = pet.type === 'dog' ? 7.6 : (pet.type === 'falcon' ? 9.0 : 8.4);
        pet.mesh.position.addScaledVector(to, spd * dt);
        pet.mesh.rotation.y = Math.atan2(to.x, to.z);
      }
      pet.mesh.position.y = pet.type === 'falcon' ? 1.6 + Math.sin(t * 2.2) * 0.25 : (pet.type === 'dog' ? 0.42 : 0.3);
      if (nb) {
        const range = pet.type === 'spider' ? 9 : 1.6;
        if (nd <= range && pet.atkCd <= 0) {
          pet.atkCd = pet.type === 'spider' ? 0.9 : 1.3;
          if (pet.type === 'dog') {
            hitEntity(nb.id, 45, pet.ownerId);
            nb.stunUntil = Math.max(nb.stunUntil || 0, t + 1.2);
            nb.markedUntil = Math.max(nb.markedUntil || 0, t + 3);
          } else if (pet.type === 'spider') {
            hitEntity(nb.id, 9, pet.ownerId);
          } else if (pet.type === 'falcon') {
            nb.markedUntil = Math.max(nb.markedUntil || 0, t + 4);
          }
        }
      }
    }
    // 队伍 HoT 呼叫冷却显示由 HUD 层处理
    // 沙袋到期由 spawnDelayed 处理
  };

  /* ============================================================
     HUD：技能栏 + 小队面板 + 标记透视层 + 闪白
     ============================================================ */
  DF.buildAbilityHud = function () {
    const hud = document.getElementById('hud');
    if (!hud || document.getElementById('abilbar')) return;
    const kit = () => DF.kitOf(meOf());
    const bar = document.createElement('div');
    bar.id = 'abilbar';
    bar.innerHTML = `
      <div class="abil" data-slot="0" data-key="Q"><div class="key">Q</div><div class="icon">?</div><div class="cd"></div><div class="nm"></div></div>
      <div class="abil" data-slot="1" data-key="E"><div class="key">E</div><div class="icon">?</div><div class="cd"></div><div class="nm"></div></div>
      <div class="abil ult" data-slot="2" data-key="V"><div class="key">V</div><div class="icon">?</div><div class="cd"></div><div class="nm"></div></div>
      <div class="passive"><div class="tag">被动</div><div class="pnm"></div></div>`;
    hud.appendChild(bar);
    const squad = document.createElement('div');
    squad.id = 'squadwrap';
    squad.innerHTML = `<div class="sqtitle">AI 队员 <span id="squad-heal-hint">G · 呼叫治疗</span></div>
      <div class="allyrow" id="ally0"><span class="an"></span><div class="abar"><i></i></div></div>
      <div class="allyrow" id="ally1"><span class="an"></span><div class="abar"><i></i></div></div>`;
    hud.appendChild(squad);
    const marks = document.createElement('div');
    marks.id = 'marklayer';
    hud.appendChild(marks);
    const flash = document.createElement('div');
    flash.id = 'flashfx';
    hud.appendChild(flash);
    const arrows = document.createElement('div');
    arrows.id = 'trike';
    hud.appendChild(arrows);
  };

  DF.refreshAbilityHudStatic = function () {
    const me = meOf();
    const kit = DF.kitOf(me);
    const bar = document.getElementById('abilbar');
    if (!bar || !kit) return;
    bar.querySelectorAll('.abil').forEach(el => {
      const slot = +el.getAttribute('data-slot');
      const ab = kit.abilities[slot];
      el.querySelector('.icon').textContent = ab.icon;
      el.querySelector('.nm').textContent = ab.name;
      el.setAttribute('title', ab.desc);
      el.classList.toggle('ult', ab.key === 'V');
    });
    const pnm = bar.querySelector('.passive .pnm');
    if (pnm) { pnm.textContent = kit.passive.name; pnm.parentElement.setAttribute('title', kit.passive.desc); }
  };

  DF.updateAbilityHud = function () {
    const me = meOf();
    const bar = document.getElementById('abilbar');
    if (!bar || !me) return;
    const t = nowT();
    bar.querySelectorAll('.abil').forEach(el => {
      const slot = +el.getAttribute('data-slot');
      const kit = DF.kitOf(me);
      if (!kit) return;
      const ab = kit.abilities[slot];
      const cdEnd = (me._abCd && me._abCd[slot]) ? me._abCd[slot] : 0;
      const remain = Math.max(0, cdEnd - t);
      const cdEl = el.querySelector('.cd');
      if (remain <= 0) { el.classList.remove('oncd'); cdEl.textContent = ''; cdEl.style.background = ''; }
      else { el.classList.add('oncd'); cdEl.textContent = Math.ceil(remain); cdEl.style.background = `conic-gradient(rgba(10,14,8,.78) ${remain / ab.cd * 360}deg, transparent 0deg)`; }
    });
    // 小队面板
    const squad = document.getElementById('squadwrap');
    if (squad) {
      const allies = [DF.players.get('ally0'), DF.players.get('ally1')];
      let any = false;
      allies.forEach((a, i) => {
        const row = document.getElementById('ally' + i);
        if (!row) return;
        if (!a) { row.style.display = 'none'; return; }
        any = true;
        row.style.display = 'flex';
        row.querySelector('.an').textContent = a.name.replace('队员·', '') + (a.alive ? '' : '（阵亡）');
        const barEl = row.querySelector('.abar i');
        barEl.style.width = a.alive ? Math.round(clamp(a.hp / 120, 0, 1) * 100) + '%' : '0%';
        row.classList.toggle('dead', !a.alive);
      });
      squad.style.display = any ? 'block' : 'none';
      const hint = document.getElementById('squad-heal-hint');
      if (hint) {
        const cd = Math.max(0, (DF._squadHealCd || 0) - t);
        hint.textContent = cd > 0 ? 'G · 呼叫治疗 ' + Math.ceil(cd) + 's' : 'G · 呼叫治疗';
        hint.classList.toggle('ready', cd <= 0);
      }
    }
    // 标记透视层
    const layer = document.getElementById('marklayer');
    if (layer) {
      let html = '';
      const cam = DF.camera;
      if (cam) {
        DF.players.forEach(p => {
          if (!p.isBot || !p.alive || !(p.markedUntil > t)) return;
          const v = p.pos.clone(); v.y = p.pos.y + 1.9;
          v.project(cam);
          if (v.z > 1 || v.x < -1.15 || v.x > 1.15 || v.y < -1.1 || v.y > 1.1) return;
          const left = (v.x * 0.5 + 0.5) * 100, top = (-v.y * 0.5 + 0.5) * 100;
          const d = Math.round(me.pos.distanceTo(p.pos));
          html += `<div class="mark" style="left:${left}%;top:${top}%"><i>◆</i><span>${d}m</span></div>`;
        });
      }
      layer.innerHTML = html;
    }
    // 声源指示（听风/回响/骇爪）
    const tri = document.getElementById('trike');
    if (tri) {
      let html = '';
      const cam = DF.camera;
      const me2 = meOf();
      if (cam && me2) {
        const list = [];
        if (me2.listenUntil > t && me2.listenTargets) {
          for (const id of me2.listenTargets) { const p = DF.players.get(id); if (p && p.alive) list.push(p); }
        } else if (me2.trackDirUntil > t && me2.trackTarget) {
          const p = DF.players.get(me2.trackTarget); if (p && p.alive) list.push(p);
        } else if (me2.sigintUntil > t) {
          let best = null, bd = 1e9;
          DF.players.forEach(p => { if (!p.isBot || !p.alive) return; const d = p.pos.distanceTo(me2.pos); if (d < bd) { bd = d; best = p; } });
          if (best) list.push(best);
        }
        for (const p of list) {
          const v = p.pos.clone(); v.y = p.pos.y + 1.2; v.project(cam);
          if (v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1) continue;   // 屏幕内已有模型
          const dir = p.pos.clone().sub(me2.pos);
          const ang = Math.atan2(dir.x, -dir.z) - me2.yaw;
          const ax = Math.sin(ang), ay = -Math.cos(ang);
          // 简单屏幕边缘指示条
          const cx = 50 + ax * 46, cy = 50 - ay * 40;
          html += `<div class="triArrow" style="left:${clamp(cx, 4, 96)}%;top:${clamp(cy, 6, 92)}%;transform:translate(-50%,-50%) rotate(${Math.atan2(ax, -ay)}rad)">➤</div>`;
        }
      }
      tri.innerHTML = html;
    }
    // 闪白
    const flash = document.getElementById('flashfx');
    if (flash) flash.style.opacity = (me.flashUntil && me.flashUntil > t) ? String(clamp((me.flashUntil - t) / 1.3, 0, 1) * 0.92) : '0';
  };

  /* ============================================================
     HUD 构建 + 输入 + 主循环钩子 + 重置清理
     ============================================================ */
  // 构建 HUD（DOMContentLoaded）
  window.addEventListener('DOMContentLoaded', () => {
    DF.buildAbilityHud();
    DF.refreshAbilityHudStatic();
  });

  // 专用按键监听（不依赖主输入系统，避免与 Tab/F 冲突）
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (DF.chatOpen || DF.lootOpen) return;
    if (!DF.matchRunning || DF.matchOver) return;
    const k = e.code;
    if (k === 'KeyQ') { e.preventDefault(); DF.useAbility(0); }
    else if (k === 'KeyE') { e.preventDefault(); DF.useAbility(1); }
    else if (k === 'KeyV') { e.preventDefault(); DF.useAbility(2); }
    else if (k === 'KeyG') { e.preventDefault(); DF.callSquadHeal(); }
    else if (k === 'ControlLeft' || k === 'KeyC') {
      // 红狼被动：疾跑中滑铲
      const me = meOf();
      const kit = DF.kitOf(me);
      if (me && me.alive && kit && kit.passive.id === 'slide' && me.sprint) {
        const t = nowT();
        if (!DF._slideCd || t >= DF._slideCd) { DF._slideCd = t + 8; dashEntity(me, 4.5); DF.toast && DF.toast('战术滑铲！'); }
      }
    }
  });

  // 主循环：每帧推进技能系统 + HUD
  const _regen = DF.regenTick;
  DF.regenTick = function (dt) {
    if (_regen) _regen(dt);
    if (DF.matchRunning && !DF.matchOver) {
      DF.updateOperatorSystems(dt);
      // 友军队友（solo only）
      if (DF.mode === 'single') {
        DF.players.forEach(p => { if (p.isAlly && p.alive) DF.updateAlly(p, dt); });
      }
      DF.updateAbilityHud();
    }
  };

  // 进入对局时刷新静态 HUD（干员可能刚换）
  const _begin = DF.beginPlay;
  DF.beginPlay = function () {
    const r = _begin ? _begin.apply(this, arguments) : undefined;
    DF.refreshAbilityHudStatic();
    return r;
  };

  // 重开一局 / 切换地图：清理全部战术实体
  const clearTactical = () => {
    const scene = sceneOf();
    const rm = (mesh) => { if (mesh) { scene.remove(mesh); dispose(mesh); } };
    DF.delayed.length = 0;
    if (DF._c4s) { DF._c4s.forEach(c => rm(c.mesh)); DF._c4s.length = 0; }
    if (DF._flashBalls) { DF._flashBalls.forEach(f => { rm(f.mesh); rm(f.ring); rm(f.light); }); DF._flashBalls.length = 0; }
    if (DF._shards) { DF._shards.forEach(rm); DF._shards.length = 0; }
    DF.smokes.forEach(s => { rm(s.mesh); rm(s.inner); }); DF.smokes.length = 0;
    DF.devices.forEach(d => rm(d.mesh)); DF.devices.length = 0;
    if (DF.zones) { DF.zones.forEach(z => rm(z.mesh)); DF.zones.length = 0; }
    DF.pets.forEach(p => rm(p.mesh)); DF.pets.length = 0;
    DF.sandbags.slice().forEach(removeSandbag);
    DF.hots.length = 0;
    DF._squadHealCd = 0;
  };
  const _reset = DF.resetRaidWorld;
  DF.resetRaidWorld = function () {
    clearTactical();
    return _reset ? _reset.apply(this, arguments) : undefined;
  };
})();
