/* ============================================================
   三角洲行动 · 网页版  —— 主程序：渲染 / 输入 / HUD / 流程
   ============================================================ */

DF.gameRunning = false;
DF.matchRunning = false;
DF.matchOver = false;
DF.matchTime = 0;
DF.deadOverlayShown = false;
DF.localDeathLock = false;
DF.nickname = '';

/* ---------------- 简易音效（WebAudio 合成） ---------------- */
DF.Audio = {
  ctx: null, muted: false,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
  },
  noise(dur, vol, filterHz, type) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = filterHz || 1200;
    const g = ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start();
  },
  shot() { this.noise(0.13, 0.32, 2200, 'lowpass'); this.thump(90, 0.15, 0.12); },
  enemyShot() { this.noise(0.10, 0.10, 900, 'lowpass'); },
  thump(freq, vol, dur) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + (dur || 0.1));
    g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (dur || 0.1));
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (dur || 0.1) + 0.02);
  },
  hit(head) { this.thump(head ? 1400 : 900, 0.14, 0.07); },
  kill() { this.thump(560, 0.18, 0.10); setTimeout(() => this.thump(840, 0.16, 0.12), 80); },
  reload() { this.noise(0.05, 0.14, 2600, 'bandpass'); setTimeout(() => this.noise(0.06, 0.14, 1800, 'bandpass'), 260); },
  hurt() { this.thump(140, 0.22, 0.18); },
  empty() { this.thump(1800, 0.07, 0.03); }
};

/* ---------------- 背景音乐：GitHub Pages 同目录文件 ---------------- */
DF.Music = {
  audio: new Audio(), tracks: ['1.mp3', '2.mp3'], failed: new Set(),
  current: '', started: false, playToken: 0, externalPriority: false,
  init() {
    this.audio.volume = 0.35;
    this.audio.preload = 'none';
    this.audio.addEventListener('ended', () => { if (this.started && !this.externalPriority) this.playRandom(); });
    this.audio.addEventListener('error', () => this.failCurrent(this.playToken));
    // 浏览器通常禁止无交互的有声自动播放，首次点击、触摸或按键时启动。
    const unlock = () => {
      if (!this.externalPriority && !this.started && this.failed.size < this.tracks.length) this.playRandom();
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('touchstart', unlock, { capture: true, passive: true });
    document.addEventListener('keydown', unlock, true);
  },
  pauseForExternal() {
    this.externalPriority = true;
    this.playToken++;
    this.started = false;
    this.audio.pause();
  },
  resumeAfterExternal() {
    if (!this.externalPriority) return;
    this.externalPriority = false;
    if (this.failed.size < this.tracks.length) this.playRandom();
  },
  failCurrent(token) {
    if (this.externalPriority || token !== this.playToken || !this.current || this.failed.has(this.current)) return;
    this.failed.add(this.current);
    this.started = false;
    if (this.failed.size < this.tracks.length) this.playRandom();
  },
  playRandom() {
    if (this.externalPriority) return;
    const available = this.tracks.filter(name => !this.failed.has(name));
    if (!available.length) return;
    this.current = available[Math.floor(Math.random() * available.length)];
    const token = ++this.playToken;
    this.started = true;
    this.audio.src = this.current;
    const playing = this.audio.play();
    if (playing && playing.catch) playing.catch(err => {
      if (token !== this.playToken || this.externalPriority) return;
      if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) this.started = false;
      else this.failCurrent(token);
    });
  }
};

/* ---------------- 初始化 ---------------- */
DF.init = function () {
  const container = document.getElementById('gl');
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  DF.maxPixelRatio = 1.75;
  DF.renderScale = 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, DF.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  container.appendChild(renderer.domElement);
  DF.renderer = renderer;

  const scene = new T.Scene();
  DF.scene = scene;
  const camera = new T.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 2600);   // 远平面需盖住开放大地图的天空球与远山
  camera.position.set(0, CFG.eye, 0);
  scene.add(camera);
  DF.camera = camera;

  // 保存地图对象与静态碰撞，切换地图时不影响角色、相机或撤离物资。
  const beforeWorld = new Set(scene.children);
  DF.initWorld(scene, 'base');
  DF.mapId = 'base';
  DF.mapCache = { base: {
    objects: scene.children.filter(o => !beforeWorld.has(o)),
    meshes: DF.worldMeshes.slice(), colliders: DF.colliders.slice(),
    obstacleMeta: DF.obstacleMeta.slice(), spawns: DF.spawns.slice(), sun: DF.sun,
    vehicles: DF.worldVehicles ? DF.worldVehicles.slice() : [],
    fog: DF.scene.fog && DF.scene.fog.clone(), background: DF.scene.background && DF.scene.background.clone(), half: CFG.mapHalf
  } };
  DF.Profile.load();
  DF.buildExtractionWorld(scene);
  DF.lootColliders = DF.colliders.slice(DF.mapCache.base.colliders.length);
  DF.createEffects(scene);
  DF.createViewModel(camera);
  DF.spawnMenuActor(scene);
  DF.net = new DF.Net();

  // 输入状态
  DF.input = {
    keys: {}, mdx: 0, mdy: 0, fire: false, ads: false, jump: false,
    locked: false, sens: 0.0023, reload: false, sprint: false, crouch: false,
    f: 0, s: 0, shotThisFrame: false
  };
  DF.camKick = { pitch: 0, yaw: 0 };
  DF.bobT = 0;

  DF.bindInput();
  DF.bindUI();
  DF.perf = { frames: 0, t0: performance.now(), fps: 60, level: 2, checks: 0 };
  if (DF.isTouchDevice()) {
    DF.setTouchMode(true, false);
    // 移动端默认降低一点负载，避免开局卡顿
    DF.maxPixelRatio = 1.5;
    DF.applyRenderScale(1);
  }
  DF.updateRosterUI();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    DF.applyRenderScale(DF.renderScale || 1);
    if (DF.updateRotateHint) DF.updateRotateHint();
  });

  // 名字
  let saved = '';
  try { saved = localStorage.getItem('df_nick') || ''; } catch (e) { }
  DF.nickname = saved || ('特种兵' + rndInt(10, 99));
  document.getElementById('name-input').value = DF.nickname;

  DF.lastFrame = performance.now();
  requestAnimationFrame(DF.loop);
};

/* ============================================================
   输入绑定
   ============================================================ */
DF.bindInput = function () {
  const cv = DF.renderer.domElement;
  const I = DF.input;

  const onKey = (e, down) => {
    const k = e.code;
    if (DF.chatOpen) {
      if (e.key === 'Escape' && down) DF.closeChat();
      return;
    }
    if (k === 'KeyW') I.keys.w = down;
    if (k === 'KeyA') I.keys.a = down;
    if (k === 'KeyS') I.keys.s = down;
    if (k === 'KeyD') I.keys.d = down;
    if (k === 'ShiftLeft' || k === 'ShiftRight') I.keys.shift = down;
    if (k === 'ControlLeft' || k === 'KeyC') I.keys.ctrl = down;
    if (k === 'Space') { if (down) I.jumpQueued = true; I.keys.space = down; e.preventDefault(); }
    if (k === 'KeyR' && down) I.reload = true;
    if (k === 'Tab') {
      e.preventDefault();
      if (down) { if (DF.matchRunning && !DF.lootOpen) DF.openLootUI(null); else DF.showScoreboard(true); }
      else if (!DF.lootOpen) DF.showScoreboard(false);
    }
    if (k === 'KeyF' && down) { DF.tryInteract && DF.tryInteract(); }
    if (k === 'KeyT' && down && DF.matchRunning) { DF.openChat(); }
    if (k === 'KeyM' && down) { DF.Audio.muted = !DF.Audio.muted; DF.Music.audio.muted = DF.Audio.muted; DF.toast(DF.Audio.muted ? '已静音' : '声音已开启'); }
    if (k === 'Escape' && down) { if (document.pointerLockElement) document.exitPointerLock(); }
  };
  window.addEventListener('keydown', e => onKey(e, true));
  window.addEventListener('keyup', e => onKey(e, false));

  // 鼠标
  document.addEventListener('mousemove', e => {
    if (I.locked) {
      I.mdx += e.movementX || 0;
      I.mdy += e.movementY || 0;
    } else if (DF.dragLook && I.holding) {
      // 无法锁定指针时的兜底：按住左键拖动转视角
      I.mdx += e.movementX || 0;
      I.mdy += e.movementY || 0;
    }
  });
  document.addEventListener('pointerlockerror', () => {
    if (DF.dragLook) return;
    DF.dragLook = true;
    DF.toast('当前环境无法锁定鼠标：按住左键拖动即可转动视角');
  });
  cv.addEventListener('mousedown', e => {
    if (!DF.matchRunning) return;
    I.holding = true;
    if (!I.locked && !DF.dragLook) {
      try { cv.requestPointerLock(); } catch (er) { DF.dragLook = true; }
      // 300ms 后仍未锁定 → 启用拖拽模式
      setTimeout(() => { if (!I.locked) DF.dragLook = true; }, 350);
      return;
    }
    if (e.button === 0) { I.fire = true; }
    if (e.button === 2) { I.ads = true; }
  });
  window.addEventListener('mouseup', e => {
    I.holding = false;
    if (e.button === 0) I.fire = false;
    if (e.button === 2) I.ads = false;
  });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    I.locked = document.pointerLockElement === cv;
    if (DF.touch.enabled) return;              // 触屏不依赖指针锁定
    // 打开背包/拾取面板或正在结算时不弹暂停菜单
    if (DF.lootOpen || DF.raidResultShown || DF.matchOver) return;
    if (!I.locked && DF.matchRunning) DF.showPause(true);
    else if (I.locked) DF.showPause(false);
  });

  // 窗口失焦
  window.addEventListener('blur', () => { I.fire = false; I.ads = false; I.keys = {}; });

  // 聊天输入
  const ci = document.getElementById('chatinput');
  ci.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const v = ci.value.trim();
      if (v) { DF.net && DF.net.sendChat(v); if (!DF.net || !DF.net.role) DF.M.onChat(DF.nickname, v, '#ffb347', true); }
      DF.closeChat();
    } else if (e.key === 'Escape') DF.closeChat();
  });

  // 触屏
  DF.bindTouch();
};

DF.openChat = function () {
  DF.chatOpen = true;
  document.getElementById('chatwrap').classList.remove('hidden');
  const ci = document.getElementById('chatinput');
  ci.value = ''; ci.focus();
  I_unlock();
};
DF.closeChat = function () {
  DF.chatOpen = false;
  document.getElementById('chatwrap').classList.add('hidden');
  document.getElementById('chatinput').blur();
  const cv = DF.renderer.domElement;
  if (DF.matchRunning && !DF.matchOver && !DF.touch.enabled) DF.requestPointerLockSafe(cv);
};
function I_unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

/* ============================================================
   触控适配（手机 / 平板）
   ============================================================ */
DF.touch = {
  enabled: false, active: false, f: 0, s: 0,
  lookId: null, lookX: 0, lookY: 0,
  joyId: null, joyCx: 0, joyCy: 0, mag: 0,
  sprintHeld: false, crouchHeld: false, adsHeld: false,
  fireHeld: false,
  sens: (parseFloat((() => { try { return localStorage.getItem('df_tsens') || '2.15'; } catch (e) { return '2.15'; } })()) || 2.15),
  adsSens: 0.62
};

DF.setTouchSens = function (v) {
  DF.touch.sens = clamp(v, 1.2, 3.4);
  try { localStorage.setItem('df_tsens', String(DF.touch.sens)); } catch (e) { }
  const lab = document.getElementById('sens-val');
  if (lab) lab.textContent = (DF.touch.sens / 2.15).toFixed(2) + '×';
};

DF.isTouchDevice = function () {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
  const mt = navigator.maxTouchPoints || 0;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Tablet|PlayBook|Silk|Kindle|Opera Mini|IEMobile/i.test(navigator.userAgent || '');
  // 触屏笔记本（有精确指针 + 少量触点）仍按鼠标处理
  if (mobileUA && mt > 0) return true;
  if (mt > 1 && !(window.matchMedia && window.matchMedia('(pointer: fine)').matches)) return true;
  return false;
};

DF.setTouchMode = function (on, showHint) {
  if (DF.touch.enabled === on) return;
  DF.touch.enabled = on;
  if (on) {
    document.body.classList.add('touchmode');
    document.getElementById('touchui').classList.remove('hidden');
    const opt = document.getElementById('touch-opt');
    if (opt) opt.classList.remove('hidden');
    const sr = document.getElementById('sens-range');
    if (sr) sr.value = DF.touch.sens;
    DF.setTouchSens(DF.touch.sens);
    DF.renderer.domElement.style.touchAction = 'none';
    if (showHint) DF.showTouchHint();
    DF.updateRotateHint();
  } else {
    document.body.classList.remove('touchmode');
    document.getElementById('touchui').classList.add('hidden');
  }
};

DF.showTouchHint = function () {
  const el = document.getElementById('touchhint');
  if (!el) return;
  el.classList.add('on');
  clearTimeout(DF._touchHintT);
  DF._touchHintT = setTimeout(() => el.classList.remove('on'), 5200);
};

DF.updateRotateHint = function () {
  const portrait = window.innerHeight > window.innerWidth;
  const need = DF.touch.enabled && portrait && DF.matchRunning;
  const el = document.getElementById('rotatehint');
  if (!el) return;
  if (need) {
    el.style.display = 'flex';
    DF.input.fire = false;
    DF.input.ads = false;
    DF.touch.f = 0; DF.touch.s = 0; DF.touch.fireHeld = false;
    DF.touch.joyId = null;
    if (DF.touch.enabled) {
      const knob = document.getElementById('joyknob');
      if (knob) knob.style.transform = '';
    }
  } else {
    el.style.display = 'none';
  }
};

DF.tryFullscreenLandscape = async function () {
  try {
    const el = document.documentElement;
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape').catch(() => { });
    }
  } catch (e) { /* 桌面浏览器/不支持时静默 */ }
  DF.updateRotateHint();
};

DF.bindTouch = function () {
  if (!DF.isTouchDevice()) return;
  DF.setTouchMode(true, false);
  const T_ = DF.touch;
  const joy = document.getElementById('joy');
  const knob = document.getElementById('joyknob');
  const zone = document.getElementById('joyzone');
  const sprintBar = document.getElementById('sprintbar');
  const sprintFill = sprintBar.querySelector('i');

  /* ---------- 左侧摇杆：整个左下区域都能起手指，动态居中 ---------- */
  const setStick = (cx, cy) => {
    const dx = cx - T_.joyCx, dy = cy - T_.joyCy;
    const L = Math.hypot(dx, dy);
    const max = 58;
    const k = L > max ? max / L : 1;
    const x = dx * k, y = dy * k;
    knob.style.transform = `translate(${x}px,${y}px)`;
    // 死区
    const dead = 7;
    let nx = 0, ny = 0;
    if (L > dead) {
      const nx0 = x / max, ny0 = y / max;
      const m = Math.min(1, (L - dead) / (max - dead));
      const nl = Math.hypot(nx0, ny0) || 1;
      nx = (nx0 / nl) * m * Math.min(1, L / max * 1.25);
      ny = (ny0 / nl) * m * Math.min(1, L / max * 1.25);
    }
    T_.f = clamp(-ny, -1, 1);
    T_.s = clamp(nx, -1, 1);
    // 推到底 → 自动疾跑
    T_.mag = clamp(L / max, 0, 1);
    sprintBar.classList.toggle('on', T_.mag > 0.55);
    sprintFill.style.width = Math.round(T_.mag * 100) + '%';
  };
  const resetStick = () => {
    knob.style.transform = '';
    T_.f = 0; T_.s = 0; T_.mag = 0;
    joy.classList.remove('active');
    sprintBar.classList.remove('on');
    sprintFill.style.width = '0%';
  };

  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    if (T_.joyId !== null) return;
    const t = e.changedTouches[0];
    T_.joyId = t.identifier;
    // 摇杆跟随手指出现（更符合手机操作习惯）
    const r = joy.getBoundingClientRect();
    const fixedCx = r.left + r.width / 2, fixedCy = r.top + r.height / 2;
    const dist = Math.hypot(t.clientX - fixedCx, t.clientY - fixedCy);
    if (dist > 130) {
      joy.style.left = Math.max(18, Math.min(t.clientX - 66, window.innerWidth * 0.34)) + 'px';
      joy.style.bottom = Math.max(18, Math.min(window.innerHeight - t.clientY - 66, window.innerHeight * 0.42)) + 'px';
      const r2 = joy.getBoundingClientRect();
      T_.joyCx = r2.left + r2.width / 2; T_.joyCy = r2.top + r2.height / 2;
    } else {
      T_.joyCx = fixedCx; T_.joyCy = fixedCy;
    }
    joy.classList.add('active');
    setStick(t.clientX, t.clientY);
  }, { passive: false });

  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === T_.joyId) setStick(t.clientX, t.clientY);
    }
  }, { passive: false });

  const endJoy = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === T_.joyId) { T_.joyId = null; resetStick(); }
    }
  };
  zone.addEventListener('touchend', endJoy);
  zone.addEventListener('touchcancel', endJoy);

  /* ---------- 右半屏：滑动转视角（带触控加速度） ---------- */
  const canvas = DF.renderer.domElement;
  canvas.addEventListener('touchstart', e => {
    if (!DF.matchRunning) return;
    for (const t of e.changedTouches) {
      if (T_.lookId === null && t.clientX > window.innerWidth * 0.24) {
        T_.lookId = t.identifier; T_.lookX = t.clientX; T_.lookY = t.clientY;
      }
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', e => {
    if (!DF.matchRunning) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== T_.lookId) continue;
      const dx = t.clientX - T_.lookX;
      const dy = t.clientY - T_.lookY;
      T_.lookX = t.clientX; T_.lookY = t.clientY;
      // 严格线性：位移多少就转多少，不做任何加速度/曲线处理
      // 此处 dx/dy 为屏幕像素，下方统一换算为弧度（0.0034 rad/px）
      DF.input.tdx = (DF.input.tdx || 0) + dx;
      DF.input.tdy = (DF.input.tdy || 0) + dy;
    }
  }, { passive: true });

  const endLook = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === T_.lookId) T_.lookId = null;
    }
  };
  canvas.addEventListener('touchend', endLook);
  canvas.addEventListener('touchcancel', endLook);

  /* ---------- 技能按钮 ---------- */
  const btn = (id, onDown, onUp) => {
    const el = document.getElementById(id);
    if (!el) return;
    const press = e => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('active');
      onDown && onDown();
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (er) { } }
    };
    const release = e => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('active');
      onUp && onUp();
    };
    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('touchend', release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
  };

  btn('t-fire',
    () => { T_.fireHeld = true; DF.input.fire = true; },
    () => { T_.fireHeld = false; DF.input.fire = false; });
  btn('t-ads',
    () => { T_.adsHeld = !T_.adsHeld; DF.input.ads = T_.adsHeld; document.getElementById('t-ads').classList.toggle('active', T_.adsHeld); },
    () => { document.getElementById('t-ads').classList.toggle('active', T_.adsHeld); });
  btn('t-jump', () => { DF.input.jumpQueued = true; });
  btn('t-reload', () => { DF.input.reload = true; });
  btn('t-crouch', () => { T_.crouchHeld = !T_.crouchHeld; });
  btn('t-sprint', () => { T_.sprintHeld = !T_.sprintHeld; });
  btn('t-interact', () => {
    if (DF.matchRunning && !DF.paused && !DF.lootOpen) DF.tryInteract();
  });
  btn('t-bag', () => {
    const me = DF.players.get(DF.myId);
    if (DF.matchRunning && !DF.paused && me && me.alive && !me.searching && !DF.lootOpen) DF.openLootUI(null);
  });
  btn('t-menu', () => {
    T_.fireHeld = false; DF.input.fire = false;
    DF.showPause(true);
  });

  // 按钮常亮状态同步
  const syncToggles = () => {
    const b = document.getElementById('t-ads');
    if (b && T_.adsHeld) b.classList.add('active');
    const c = document.getElementById('t-crouch');
    if (c) c.classList.toggle('active', T_.crouchHeld);
    const sp = document.getElementById('t-sprint');
    if (sp) sp.classList.toggle('active', T_.sprintHeld);
  };
  DF._syncTouchToggles = syncToggles;

  // 首次触摸即认为进入触屏模式（覆盖检测误判）
  document.addEventListener('touchstart', function once(e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (!DF.touch.enabled) DF.setTouchMode(true, true);
    document.removeEventListener('touchstart', once);
  }, { passive: true });

  // 阻止移动端双指缩放 / 长按菜单
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  document.addEventListener('contextmenu', e => {
    if (DF.touch.enabled) e.preventDefault();
  });

  window.addEventListener('orientationchange', () => setTimeout(DF.updateRotateHint, 260));
  window.addEventListener('resize', () => DF.updateRotateHint());

  document.getElementById('btn-force-landscape').addEventListener('click', DF.tryFullscreenLandscape);
};

/* ============================================================
   界面绑定
   ============================================================ */
DF.bindUI = function () {
  const $ = id => document.getElementById(id);
  $('name-input').addEventListener('input', e => {
    DF.nickname = (e.target.value || '特种兵').slice(0, 12);
    try { localStorage.setItem('df_nick', DF.nickname); } catch (er) { }
  });

  DF.Music.init();

  $('btn-single').onclick = () => { DF.Audio.init(); DF.startSolo(); };
  $('btn-er-next').onclick = () => { DF.hide('extractResult'); DF.restartMatch(); };
  $('btn-er-menu').onclick = () => { DF.hide('extractResult'); DF.quitToMenu(); };
  const cl = $('btn-close-loot'); if (cl) cl.onclick = () => DF.closeLootUI();
  const clTop = $('btn-close-loot-top'); if (clTop) clTop.onclick = () => DF.closeLootUI();
  $('btn-host').onclick = () => { DF.Audio.init(); DF.openHostPanel(); };
  $('btn-guest').onclick = () => { DF.Audio.init(); DF.show('signal-guest'); };
  $('btn-host-back').onclick = () => { DF.cleanupNet(); DF.show('menu'); };
  $('btn-guest-back').onclick = () => { DF.cleanupNet(); DF.show('menu'); };
  $('btn-lobby-leave').onclick = () => { DF.cleanupNet(); DF.show('menu'); };
  $('btn-add-slot').onclick = () => DF.addHostSlot();
  $('btn-start-host').onclick = () => DF.hostStartMatch();
  $('btn-guest-gen').onclick = () => DF.guestGenerateAnswer();
  $('btn-copy-answer').onclick = () => DF.copyText($('guest-answer').value);
  $('btn-resume').onclick = () => {
    if (!DF.touch.enabled) DF.requestPointerLockSafe(DF.renderer.domElement);
    DF.showPause(false);
    if (DF.touch.enabled) DF.showHUD(true);
  };
  $('btn-quit').onclick = () => { DF.quitToMenu(); };
  $('btn-again').onclick = () => { DF.hide('endscreen'); DF.restartMatch(); };
  $('btn-end-menu').onclick = () => { DF.hide('endscreen'); DF.quitToMenu(); };

  const sr = $('sens-range');
  if (sr) {
    sr.addEventListener('input', e => DF.setTouchSens(parseFloat(e.target.value)));
  }
  $('bot-count').onchange = () => { if (DF.net && DF.net.role === 'host') DF.net.hostBroadcast({ t: 'sys', m: '房间设置已更新' }); };
};

DF.updateRosterUI = function () { DF.updateHostPlayers && DF.updateHostPlayers(); };

DF.show = function (id) {
  ['menu', 'signal-host', 'signal-guest', 'lobby', 'pause', 'endscreen'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.add('hidden');
  });
  if (id) document.getElementById(id).classList.remove('hidden');
};
DF.hide = function (id) { document.getElementById(id).classList.add('hidden'); };

DF.showPause = function (on) {
  DF.paused = !!on;
  if (on) {
    DF.input.fire = false; DF.input.ads = false;
    DF.input.mdx = 0; DF.input.mdy = 0; DF.input.tdx = 0; DF.input.tdy = 0;
    if (DF.touch) { DF.touch.f = 0; DF.touch.s = 0; DF.touch.fireHeld = false; }
  }
  if (on) {
    DF.hide('hud');
    document.getElementById('pause-note').textContent = DF.touch.enabled
      ? '左摇杆移动（推到底疾跑）· 右半屏滑动转视角 · 右下角按钮开火'
      : DF.dragLook
        ? '当前环境无法锁定鼠标：点击继续后，按住左键拖动即可转动视角'
        : '点击继续后重新锁定鼠标视角（Esc 再次暂停）';
    DF.show('pause');
  } else {
    DF.hide('pause');
    if (DF.matchRunning) DF.showHUD(true);
  }
};
DF.showHUD = function (on) {
  const h = document.getElementById('hud');
  if (on) h.classList.remove('hidden'); else h.classList.add('hidden');
};

DF.toast = function (msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(DF._toastT);
  DF._toastT = setTimeout(() => el.classList.remove('show'), 2200);
};

DF.copyText = function (txt) {
  if (!txt) return;
  const done = () => DF.toast('已复制到剪贴板');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done).catch(() => DF._fallbackCopy(txt, done));
  } else DF._fallbackCopy(txt, done);
};
DF._fallbackCopy = function (txt, cb) {
  const ta = document.createElement('textarea');
  ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); cb(); } catch (e) { DF.toast('复制失败，请手动选择复制'); }
  document.body.removeChild(ta);
};

/* ============================================================
   房间：房主
   ============================================================ */
DF.openHostPanel = function () {
  document.getElementById('host-map-select').value = document.getElementById('map-select').value;
  DF.show('signal-host');
  DF.mode = 'host';
  const slotsEl = document.getElementById('slots');
  slotsEl.innerHTML = '';
  DF.net.role = 'host';
  DF.updateHostPlayers();
  DF.renderProfile && DF.renderProfile();
};

DF.addHostSlot = async function () {
  const slotsEl = document.getElementById('slots');
  const idx = slotsEl.children.length + 1;
  const wrap = document.createElement('div');
  wrap.className = 'slot';
  wrap.innerHTML = `
    <h3>玩家 ${idx} · 邀请码</h3>
    <div class="st">状态：<span class="stt">正在生成邀请码…（收集网络候选）</span></div>
    <textarea readonly placeholder="邀请码生成中…"></textarea>
    <div class="row"><button class="btn small copy-offer">📋 复制邀请码</button></div>
    <label class="lab">粘贴对方的回复码</label>
    <textarea class="ansbox" placeholder="把对方发回的回复码粘贴到这里…"></textarea>
    <div class="row"><button class="btn small primary acc-btn">完成连接</button></div>`;
  slotsEl.appendChild(wrap);

  const stt = wrap.querySelector('.stt');
  const offerBox = wrap.querySelectorAll('textarea')[0];
  const ansBox = wrap.querySelector('.ansbox');
  const accBtn = wrap.querySelector('.acc-btn');

  try {
    const slot = await DF.net.createSlot();
    slot.dom = wrap;
    slot.onState = (st) => {
      if (st === 'connected') { stt.textContent = '已连接 ✓ 等待对方握手…'; stt.classList.add('ok'); DF.updateHostPlayers(); }
      else if (st === 'accepted') { stt.textContent = '回复码已接收，正在建立 P2P 连接…'; }
      else if (st === 'failed') { stt.textContent = '连接失败（NAT 穿透失败）：请双方换网络或使用 VPN 后重试'; }
      else if (st === 'disconnected') { stt.textContent = '连接中断'; }
      else if (st === 'closed') { stt.textContent = '通道已关闭'; }
      else { stt.textContent = '状态：' + st; }
    };
    const code = await DF.net.slotOfferCode(slot);
    offerBox.value = code;
    wrap.querySelector('.copy-offer').onclick = () => DF.copyText(code);
    stt.textContent = '邀请码已生成，复制发给朋友；对方返回回复码后粘贴到下方';
    accBtn.onclick = async () => {
      const v = ansBox.value.trim();
      if (!v) return DF.toast('请先粘贴对方的回复码');
      accBtn.disabled = true;
      try {
        await DF.net.acceptAnswer(slot, v);
        DF.toast('已接收回复码，正在 P2P 连接…');
        if (slot.player) {
          DF.hide('signal-host');
          DF.beginNextMatch();
        }
      } catch (e) {
        DF.toast(e.message || '连接失败');
        accBtn.disabled = false;
      }
    };
    DF.updateHostPlayers();
  } catch (e) {
    stt.textContent = '生成失败：' + e.message;
    console.error(e);
  }
};

DF.updateHostPlayers = function () {
  const ul = document.getElementById('host-plist');
  if (!ul) return;
  const n = DF.net ? DF.net.clients.size : 0;
  let html = `<li><span>${escapeHtml(DF.nickname)} <span class="hosttag">房主</span></span><span>已就绪</span></li>`;
  DF.net.clients.forEach(slot => {
    if (slot.player) html += `<li><span>${escapeHtml(slot.player.name)}</span><span>已连接</span></li>`;
  });
  if (DF.net.slots.filter(s => !s.player).length) {
    html += `<li><span style="color:#9aa78a">等待 ${DF.net.slots.filter(s => !s.player).length} 名玩家握手…</span><span></span></li>`;
  }
  ul.innerHTML = html;
  const startBtn = document.getElementById('btn-start-host');
  startBtn.disabled = false;
  startBtn.textContent = n > 0 ? `▶ 开始战斗（${n + 1} 名真人）` : '▶ 开始战斗（仅 AI 对战）';
};

/* ============================================================
   房间：客人
   ============================================================ */
DF.guestGenerateAnswer = async function () {
  const $ = id => document.getElementById(id);
  const code = $('guest-offer').value.trim();
  if (!code) return DF.toast('请先粘贴房主的邀请码');
  $('guest-status').textContent = '状态：正在生成回复码，请稍候…';
  DF.nickname = $('name-input').value.trim() || DF.nickname;
  try {
    const ans = await DF.net.connectAsGuest(code, DF.nickname);
    $('guest-answer').value = ans;
    $('guest-status').textContent = '状态：回复码已生成！请复制发给房主，然后等待连接。';
    DF.copyText(ans);
  } catch (e) {
    console.error(e);
    $('guest-status').textContent = '状态：出错 — ' + (e.message || e);
  }
};

/* 网络事件回调 */
DF.M.onConnected = function () {
  DF.show('lobby');
  DF.toast('已连接到房主');
};
DF.M.onGuestStart = function (m) {
  DF.applyMap(m.map || 'base');
  DF.resetRaidWorld();
  DF.mode = 'guest';
  DF.myId = DF.net.myPlayerId || DF.myId;
  const me = DF.players.get(DF.myId);
  if (me) { me.alive = true; me.hp = CFG.maxHp; }
  DF.matchTime = 0;
  DF.beginPlay();
  DF.showHUD(true);
};

DF.M.onWelcome = function (m) {
  DF.mode = 'guest';
  DF.myPlayerId = m.id;
  DF.hide('signal-guest');
  DF.hide('lobby');
  DF.show(null);
};
DF.M.onNetError = function (msg) {
  DF.toast(msg);
  console.error('[NET]', msg);
};
DF.M.onDisconnected = function () {
  DF.toast('与房主的连接已断开');
  DF.quitToMenu();
};
DF.M.onRtt = function (rtt) {
  DF.ping = Math.round(rtt);
};

/* ============================================================
   战局启动
   ============================================================ */
DF.resetPlayers = function () {
  DF.players.forEach(p => DF.detachMesh(p, DF.scene));
  DF.players.clear();
  DF.matchTime = 0;
  DF.matchOver = false;
  DF.deadOverlayShown = false;
  DF.localDeathLock = false;
  document.getElementById('killfeed').innerHTML = '';
  document.getElementById('chatlog').innerHTML = '';
};

DF.pickSpawn = function () {
  // 选择离其他玩家最远的出生点
  let best = DF.spawns[0], bestD = -1;
  for (const s of DF.spawns) {
    let minD = 1e9;
    DF.players.forEach(p => {
      if (!p.alive) return;
      const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
      if (d < minD) minD = d;
    });
    const score = minD + rnd(0, 12);
    if (score > bestD) { bestD = score; best = s; }
  }
  return new T.Vector3(best.x + rnd(-3, 3), 0, best.z + rnd(-3, 3));
};

DF.spawnPlayer = function (p) {
  if (!p.inv) DF.initInventory(p);
  p.extracted = false; p.raidDead = false;
  p.respawnAt = Infinity;
  const sp = DF.pickSpawn();
  p.pos.copy(sp);
  p.vel.set(0, 0, 0); p.vy = 0; p.onGround = true;
  p.hp = CFG.maxHp; p.alive = true; p.weapon = (p.id === DF.myId && DF.equippedWeapon) ? DF.equippedWeapon() : p.weapon;
  p.ammo = DF.effMag ? DF.effMag(p) : CFG.mag; p.reserve = 90;
  p.reloading = false; p.crouch = false; p.kills = p.kills || 0;
  p.yaw = Math.atan2(-(0 - sp.x), -(0 - sp.z));  // 朝地图中心
  p.pitch = 0;
  DF.collideMove(p.pos, CFG.radius);
  // 安全落位：若仍卡在实体内，向四周寻找空位
  const stuck = () => {
    for (const c of DF.colliders) {
      if (c.circle) {
        if (Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < c.r + CFG.radius * 0.5 && c.maxy > 1.2) return true;
        continue;
      }
      if (p.pos.x > c.minx - CFG.radius * 0.5 && p.pos.x < c.maxx + CFG.radius * 0.5 &&
          p.pos.z > c.minz - CFG.radius * 0.5 && p.pos.z < c.maxz + CFG.radius * 0.5 &&
          c.maxy > 1.2) return true;
    }
    return false;
  };
  if (stuck()) {
    const ox = p.pos.x, oz = p.pos.z;
    outer: for (let r = 2; r <= 22; r += 2) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        p.pos.x = ox + Math.cos(ang) * r;
        p.pos.z = oz + Math.sin(ang) * r;
        DF.collideMove(p.pos, CFG.radius);
        if (!stuck()) break outer;
      }
    }
  }
  if (p.mesh) { p.mesh.rotation.z = 0; }
};

DF.respawn = function (p) {
  DF.spawnPlayer(p);
  DF.net && DF.net.hostBroadcast && DF.net.hostBroadcast({
    t: 'rs', id: p.id, p: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)]
  });
  if (p.isLocal) DF.M.onLocalRespawn();
};

// 地图缓存仅包含场景静态几何；容器和撤离点按地图布局，切换时重建。
DF.applyMap = function (id) {
  const validMaps = ['base', 'outpost', 'oilfield', 'urban', 'harbor', 'frontier'];
  id = validMaps.includes(id) ? id : 'base';
  if (DF.mapId === id) return;
  const old = DF.mapCache[DF.mapId];
  old.objects.forEach(o => DF.scene.remove(o));
  DF.destroyExtractionWorld();
  let entry = DF.mapCache[id];
  if (!entry) {
    const before = new Set(DF.scene.children);
    DF.initWorld(DF.scene, id);
    entry = DF.mapCache[id] = {
      objects: DF.scene.children.filter(o => !before.has(o)),
      meshes: DF.worldMeshes.slice(), colliders: DF.colliders.slice(),
      obstacleMeta: DF.obstacleMeta.slice(), spawns: DF.spawns.slice(), sun: DF.sun,
      vehicles: DF.worldVehicles ? DF.worldVehicles.slice() : [],
      fog: DF.scene.fog && DF.scene.fog.clone(), background: DF.scene.background && DF.scene.background.clone(), half: CFG.mapHalf
    };
  } else {
    entry.objects.forEach(o => DF.scene.add(o));
  }
  DF.vehicles = entry.vehicles ? entry.vehicles.slice() : [];
  DF.scene.fog = entry.fog && entry.fog.clone();
  DF.scene.background = entry.background && entry.background.clone();
  CFG.mapHalf = entry.half || 88;   // 恢复该地图的边界尺寸
  DF.worldMeshes = entry.meshes.slice();
  DF.colliders = entry.colliders.slice();
  DF.obstacleMeta = entry.obstacleMeta.slice();
  DF.spawns = entry.spawns.slice();
  DF.sun = entry.sun;
  DF.mapId = id;   // 先切换地图 id，撤离物资按当前地图布置
  DF.buildExtractionWorld(DF.scene);
  DF.lootColliders = DF.colliders.slice(entry.colliders.length);
  DF.worldMeshes.forEach(m => m.updateMatrixWorld(true));
};

DF.resetRaidWorld = function () {
  if (DF.exitVehicle) DF.exitVehicle(true);
  if (DF.vehicles) DF.vehicles.forEach(v => { v.speed = 0; });
  if (DF.containers) DF.containers.forEach(c => {
    if (c.pendingDrop) { c.mesh.visible = false; c.mark.visible = false; return; }
    c.searched = false; c.searchedBy = null; c.mark.visible = true;
    c.loot = c.loot.map((it, i) => ({ key: rollLootKey(CONTAINER_TYPES[c.type].bonus), id: c.id + '_r' + i }));
  });
  if (DF.airdrop) { DF.airdrop.pendingDrop = true; DF.airdrop.mesh.visible = false; DF.airdrop.mark.visible = false; }
  if (DF.extracts) DF.extracts.forEach(e => { e.open = false; e.progress = 0; e._warned = false; });
  if (DF.searchMarkers) DF.searchMarkers.forEach(m => { m.visible = true; });
  DF.raidResultShown = false;
  DF._exLastT = 0;
  DF._lastSoloTick = 0;
  if (DF.net) DF.net._lastRealTick = 0;
  DF.players.forEach(p => { p.exProgress = {}; p.exStartAt = {}; });
  DF.lootOpen = false;
  document.body.classList.remove('loot-active');
  document.getElementById('lootPanel').classList.add('hidden');
  document.getElementById('extractResult').classList.add('hidden');
};

DF.startSolo = function () {
  DF.mode = 'single';
  DF.applyMap(document.getElementById('map-select').value);
  DF.resetRaidWorld();
  DF.net.role = 'solo';
  DF.myId = 'local';
  DF.resetPlayers();
  const me = DF.createPlayer({ id: 'local', name: DF.nickname, isLocal: true, color: CFG.colors[0] });
  DF.players.set('local', me);
  DF.attachMesh(me, DF.scene);
  DF.spawnPlayer(me);
  const botN = (DF.mapId === 'frontier' ? 12 : 7);   // 开放大地图bot更密集
  for (let i = 0; i < botN; i++) {
    const b = DF.createPlayer({
      id: 'bot' + i, name: CFG.botNames[i % CFG.botNames.length], isBot: true,
      color: CFG.colors[(i + 2) % CFG.colors.length]
    });
    DF.players.set(b.id, b);
    DF.attachMesh(b, DF.scene);
    DF.spawnPlayer(b);
    b.botNextThink = 0;
  }
  DF.beginPlay();
};

DF.beginNextMatch = function () {
  // 房主：确认玩家都已连接后开战
  DF.hostStartMatch(true);
};

DF.hostStartMatch = function (alreadyConnected) {
  DF.applyMap(document.getElementById('host-map-select').value);
  DF.resetRaidWorld();
  const bots = parseInt(document.getElementById('bot-count').value, 10) || 0;
  const humans = DF.net ? DF.net.clients.size : 0;
  DF.mode = 'host';
  DF.net.role = 'host';
  DF.myId = 'local';
  DF.resetPlayers();
  const me = DF.createPlayer({ id: 'local', name: DF.nickname, isLocal: true, color: CFG.colors[0] });
  DF.players.set('local', me);
  DF.attachMesh(me, DF.scene);
  DF.spawnPlayer(me);
  // 已有客户端玩家保留
  DF.net.clients.forEach(slot => {
    if (slot.player) {
      DF.players.set(slot.player.id, slot.player);
      slot.player.alive = true;
      DF.attachMesh(slot.player, DF.scene);
      DF.spawnPlayer(slot.player);
    }
  });
  const botN = Math.max(0, bots - humans);
  for (let i = 0; i < botN; i++) {
    const b = DF.createPlayer({
      id: 'bot' + i, name: CFG.botNames[i % CFG.botNames.length], isBot: true,
      color: CFG.colors[(i + 3) % CFG.colors.length]
    });
    DF.players.set(b.id, b);
    DF.attachMesh(b, DF.scene);
    DF.spawnPlayer(b);
  }
  DF.matchTime = 0;
  DF.net.lastTick = now();
  DF.net.startHost();
  DF.net.hostBroadcast({ t: 'start', map: DF.mapId, roster: DF.net._roster(), kt: CFG.killTarget, tl: CFG.timeLimit });
  DF.hide('signal-host');
  DF.beginPlay();
};

DF.startSoloExtractLoop = function () {
  if (DF._soloExTimer) clearInterval(DF._soloExTimer);
  DF._soloExTimer = setInterval(() => {
    if (DF.mode !== 'single' || !DF.matchRunning || DF.matchOver || DF.paused) return;
    DF.updateExtractionLogic && DF.updateExtractionLogic(0.1);
    DF.checkRaidOver && DF.checkRaidOver();
    if (DF.airdrop && DF.airdrop.pendingDrop && DF.matchTime >= (CFG.airdropAt || 300)) {
      DF.airdrop.pendingDrop = false;
      DF.airdrop.mesh.visible = true;
      DF.airdrop.mark.visible = true;
      DF.pushKillfeed('<span style="color:#ff8c1a">' + (DF.mapId === 'frontier' ? '✈ 空投已投放（吴家村村中心）' : '✈ 空投已投放（地图中央）') + '</span>');
      DF.Audio.warn && DF.Audio.warn();
    }
  }, 100);
};

/* 每局启动前清理上一局残留的暂停、输入和结算状态。
   避免移动端触控/键盘状态或旧遮罩让第二局看起来像卡死。 */
DF.resetRoundInputState = function () {
  if (DF.exitVehicle) DF.exitVehicle(true);
  const I = DF.input || (DF.input = {});
  I.keys = {};
  I.fire = false; I.ads = false; I.reload = false;
  I.jumpQueued = false; I.holding = false; I.shotThisFrame = false;
  I.mdx = 0; I.mdy = 0; I.tdx = 0; I.tdy = 0;
  I.locked = false;
  DF.paused = false;
  DF.chatOpen = false;
  DF._dropWarned = false;
  DF.camKick = { pitch: 0, yaw: 0 };
  DF.vmRecoil = 0;
  if (DF.touch) {
    DF.touch.f = 0; DF.touch.s = 0; DF.touch.mag = 0;
    DF.touch.joyId = null; DF.touch.lookId = null;
    DF.touch.sprintHeld = false; DF.touch.crouchHeld = false;
    DF.touch.adsHeld = false; DF.touch.fireHeld = false;
  }
  ['t-fire', 't-ads', 't-crouch', 't-sprint'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  ['pause', 'endscreen', 'respawn', 'scoreboard', 'extractResult', 'chatwrap'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const lootPanel = document.getElementById('lootPanel');
  if (lootPanel) lootPanel.classList.add('hidden');
  document.body.classList.remove('loot-active');
  if (DF.camera) {
    DF.camera.fov = 78;
    DF.camera.updateProjectionMatrix();
  }
};

DF.beginPlay = function () {
  if (DF.menuActor) DF.menuActor.visible = false;
  // 重新开局必须从干净状态开始，不依赖刷新页面清理旧状态。
  if (DF.lootOpen && DF.closeLootUI) DF.closeLootUI();
  DF.resetRoundInputState();
  DF.raidResultShown = false;
  DF.startSoloExtractLoop();
  DF._dropWarned = false;
  DF.matchRunning = true;
  DF.matchOver = false;
  DF.matchTime = 0;
  DF.deadOverlayShown = false;
  DF.localDeathLock = false;
  DF.show(null);
  DF.showHUD(true);
  DF.hide('respawn');
  DF.hide('endscreen');
  if (DF.touch.enabled) {
    DF.showTouchHint();
    DF.updateRotateHint();
    DF.input.fire = false;
    DF.touch.f = 0; DF.touch.s = 0;
  } else {
    DF.requestPointerLockSafe(DF.renderer.domElement);
  }
  const me = DF.players.get(DF.myId);
  if (me) { me.crouch = false; me.ads = false; DF.camKick.pitch = 0; }
  DF.toast(DF.mode === 'guest' ? '进入战场 — 搜物资，找撤离点' : '进入战场 — 搜物资 → 交火 → 从撤离点带走（F 搜索 / Tab 背包）');
  if (DF.extracts) DF.extracts.forEach(e => { e.progress = 0; e._warned = false; });
  DF.raidResultShown = false;
};

DF.quitToMenu = function () {
  if (DF.exitVehicle) DF.exitVehicle(true);
  DF.matchRunning = false;
  DF.matchOver = false;
  DF.showHUD(false);
  DF.hide('respawn');
  DF.hide('scoreboard');
  DF.hide('pause');
  DF.hide('endscreen');
  I_unlock();
  DF.cleanupNet();
  DF.resetPlayers();
  if (DF.menuActor) DF.menuActor.visible = true;
  DF.show('menu');
  DF.updateHostPlayers();
};

DF.cleanupNet = function () {
  if (DF.net) DF.net.leave();
  if (DF.net) DF.net = new DF.Net();
};

DF.restartMatch = function () {
  // 结算页与结束页共用重开入口；先清除上一局状态，再创建新战局。
  DF.resetRoundInputState();
  DF.matchRunning = false;
  DF.matchOver = false;
  DF.hide('extractResult');
  DF.hide('endscreen');
  if (DF.mode === 'single') {
    DF.startSolo();
  } else if (DF.mode === 'host') {
    DF.hostStartMatch(true);
  } else {
    DF.toast('等待房主重新开始…');
  }
};

/* ============================================================
   战局结束
   ============================================================ */
DF.M.gameEnd = function (winnerId, reason) {
  if (DF.matchOver) return;
  if (reason === 'time' || reason === 'allDone') {
    // 撤离模式收尾：仍存活的玩家视为撤离失败（超时）
    const me = DF.players.get(DF.myId);
    if (me && me.alive && !me.extracted) {
      me.alive = false;
      DF.matchOver = true; DF.matchRunning = false;
      I_unlock();
      const lost = DF.bagValue(me);
      const safeKept = DF.safeValue(me);
      DF.Profile.addDeath(me.kills);
      if (safeKept > 0) { DF.Profile.data.bank += safeKept; DF.Profile.save(); }
      DF.showRaidResult(false, {
        killer: reason === 'time' ? '撤离超时' : '撤离失败',
        kills: me.kills, bag: lost, safe: safeKept, lost: lost
      });
      if (DF.net && DF.net.role === 'host') DF.net.hostBroadcast({ t: 'end', id: null, reason });
      return;
    }
    if (me && me.extracted) { DF.matchOver = true; DF.matchRunning = false; return; }
    DF.matchOver = true; DF.matchRunning = false;
    I_unlock();
    if (DF.net && DF.net.role === 'host') DF.net.hostBroadcast({ t: 'end', id: null, reason });
    return;
  }
  DF.matchOver = true;
  DF.matchRunning = false;
  I_unlock();
  DF.showFinal(winnerId, reason);
  if (DF.net && DF.net.role === 'host') DF.net.hostBroadcast({ t: 'end', id: winnerId, reason });
};
DF.M.onRemoteEnd = function (winnerId, reason) { DF.showFinal(winnerId, reason); };

DF.showFinal = function (winnerId, reason) {
  DF.showHUD(false);
  DF.hide('respawn');
  DF.hide('scoreboard');
  const list = DF.getScoreData();
  const winner = list.find(x => x.id === winnerId);
  document.getElementById('end-winner').textContent = winner ? `🏆 ${winner.name} 获胜` : '战斗结束';
  const tb = document.getElementById('end-table');
  tb.innerHTML = '<tr><th>#</th><th>呼号</th><th>击杀</th><th>阵亡</th><th>K/D</th></tr>' +
    list.map((r, i) => `<tr style="${r.id === DF.myId ? 'color:#ffb347' : ''}">
      <td>${i + 1}</td><td>${escapeHtml(r.name)}${r.isBot ? ' <span style="color:#7a8a6a;font-size:11px">AI</span>' : ''}</td>
      <td>${r.kills}</td><td>${r.deaths}</td><td>${(r.kills / Math.max(1, r.deaths)).toFixed(2)}</td></tr>`).join('');
  document.getElementById('end-note').textContent =
    DF.mode === 'guest' ? '房主可重新开始战局。' : '点击「再来一局」立即开始新的战斗。';
  DF.show('endscreen');
};

DF.getScoreData = function () {
  if (DF.mode === 'guest' && DF.net && DF.net.scoreList) {
    return DF.net.scoreList.map(r => ({ id: r[0], name: r[1], color: r[2], kills: r[3], deaths: r[4], isBot: r[5] === 1 }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }
  const arr = [];
  DF.players.forEach(p => arr.push({ id: p.id, name: p.name, color: p.color, kills: p.kills, deaths: p.deaths, isBot: p.isBot }));
  return arr.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
};

/* ============================================================
   HUD
   ============================================================ */
DF.pushKillfeed = function (html) {
  const kf = document.getElementById('killfeed');
  const d = document.createElement('div');
  d.innerHTML = html;
  kf.appendChild(d);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 5200);
  while (kf.children.length > 5) kf.removeChild(kf.firstChild);
};

DF.M.onChat = function (who, msg, color, isSystem) {
  const log = document.getElementById('chatlog');
  const d = document.createElement('div');
  d.innerHTML = `<span class="who" style="color:${isSystem ? '#ffb347' : color}">${escapeHtml(who)}:</span> ${escapeHtml(msg)}`;
  log.appendChild(d);
  while (log.children.length > 6) log.removeChild(log.firstChild);
  setTimeout(() => { if (d.parentNode && log.children.length > 6) d.parentNode.removeChild(d); }, 12000);
};

DF.showScoreboard = function (on) {
  const el = document.getElementById('scoreboard');
  if (!on) { el.classList.add('hidden'); return; }
  const list = DF.getScoreData();
  const tl = DF.getTimeLeft();
  el.innerHTML = `<h2 class="ptitle" style="font-size:18px">战场 <span>计分板</span></h2>
    <div class="sub">剩余时间 ${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')} · 击杀目标 ${CFG.killTarget}</div>
    <table><tr><th>呼号</th><th>击杀</th><th>阵亡</th><th>K/D</th></tr>
    ${list.map(r => `<tr class="${r.id === DF.myId ? 'me' : ''}"><td>${escapeHtml(r.name)}${r.isBot ? ' 🤖' : ''}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${(r.kills / Math.max(1, r.deaths)).toFixed(2)}</td></tr>`).join('')}
    </table>`;
  el.classList.remove('hidden');
};

DF.getTimeLeft = function () {
  if (DF.mode === 'guest' && DF.net && typeof DF.net.timeLeft === 'number') return DF.net.timeLeft;
  return Math.max(0, CFG.timeLimit - DF.matchTime);
};

let _hitT = 0;
DF.vibrate = function (ms) {
  if (!DF.touch.enabled || !navigator.vibrate) return;
  try { navigator.vibrate(ms); } catch (e) { }
};

DF.hitmarker = function (kill) {
  DF.vibrate(kill ? 28 : 10);
  const el = document.getElementById('hitmarker');
  el.classList.toggle('kill', !!kill);
  el.style.opacity = 1;
  clearTimeout(_hitT);
  _hitT = setTimeout(() => { el.style.opacity = 0; }, kill ? 260 : 130);
};

DF.M.onKillLocal = function (att, v, part) {
  if (att && att.id === DF.myId) {
    DF.hitmarker(true);
    DF.Audio.kill();
  }
  if (v.id === DF.myId) {
    // 撤离制：立即结算，不再重生
    DF.M.onLocalRaidDeath && DF.M.onLocalRaidDeath(att ? att.name : '敌人');
  }
};

DF.M.onDamage = function (v, att, dmg, part) {
  // 房主侧：如果受伤的是自己
  if (v.id === DF.myId && att) {
    DF.takeLocalDamage(dmg, att.id, att.yaw);
  }
};

DF.takeLocalDamage = function (dmg, attackerId, attackerYaw) {
  DF.vibrate(45);
  const vg = document.getElementById('vignette');
  vg.style.transition = 'opacity .08s';
  vg.style.opacity = 0.55;
  setTimeout(() => { vg.style.opacity = 0; }, 140);
  DF.Audio.hurt();
  DF.camKick.pitch += rnd(-0.03, 0.03);
  const dir = document.getElementById('dmgdir');
  if (attackerId && DF.players.get(attackerId)) {
    const a = DF.players.get(attackerId);
    const me = DF.players.get(DF.myId);
    const dx = a.pos.x - me.pos.x, dz = a.pos.z - me.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    // 以玩家朝向为基准：右方向 (cos, -sin)，前方向 (-sin, -cos)
    const rightDot = (dx / len) * Math.cos(me.yaw) - (dz / len) * Math.sin(me.yaw);
    const fwdDot = -(dx / len) * Math.sin(me.yaw) - (dz / len) * Math.cos(me.yaw);
    const ang = Math.atan2(rightDot, fwdDot);   // 正=右侧，负=左侧
    dir.style.opacity = 0.95;
    dir.style.transform = `rotate(${ang}rad)`;
    setTimeout(() => { dir.style.opacity = 0; }, 700);
  }
};
DF.M.onLocalDamage = function (dmg, by) { DF.takeLocalDamage(dmg, by); };

DF.M.onLocalDeath = function (byId) {
  if (DF.deadOverlayShown) return;
  DF.deadOverlayShown = true;
  const me = DF.players.get(DF.myId);
  const killer = DF.players.get(byId);
  DF.Audio.thump(110, 0.25, 0.4);
  I_unlock();
  if (!DF.raidResultShown) {
    DF.raidResultShown = true;
    DF.M.onLocalRaidDeath && DF.M.onLocalRaidDeath(killer ? killer.name : '敌人');
  }
};
DF.M.onLocalRespawn = function () {
  DF.deadOverlayShown = false;
  DF.localDeathLock = false;
  document.getElementById('respawn').classList.add('hidden');
  document.getElementById('healthwrap').style.opacity = 1;
  const me = DF.players.get(DF.myId);
  if (me) { DF.camera.position.set(me.pos.x, me.pos.y + CFG.eye, me.pos.z); me.crouch = false; }
  if (DF.matchRunning && !DF.touch.enabled) DF.requestPointerLockSafe(DF.renderer.domElement);
  DF.input.fire = false; DF.touch.fireHeld = false;
  DF.vmRecoil = 0;
};

DF.updateHUD = function () {
  const me = DF.players.get(DF.myId);
  if (!me) return;
  // 生命
  const hp = Math.max(0, Math.round(me.hp));
  document.getElementById('hpnum').innerHTML = `${hp} <small>生命值 HP</small>`;
  const bar = document.getElementById('hpbar');
  bar.style.width = Math.round(clamp(hp / CFG.maxHp, 0, 1) * 100) + '%';
  bar.classList.toggle('low', hp < 35);
  // 弹药
  document.getElementById('ammo').textContent = me.reloading ? '--' : me.ammo;
  document.getElementById('reserve').textContent = '/ ' + me.reserve;
  const hint = document.getElementById('reloadhint');
  if (me.reloading) hint.textContent = '装填中…';
  else if (me.ammo === 0) hint.textContent = me.reserve > 0 ? '按 R 装弹' : '无弹药';
  else if (me.ammo <= 6) hint.textContent = '弹药不足';
  else hint.textContent = '';
  // 时间/赛况
  const tl = DF.getTimeLeft();
  document.getElementById('matchinfo').innerHTML =
    `<b>${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}</b> · 击杀 <b style="color:#ffb347">${me.kills}</b> · 背包 <b style="color:#ffb347">$${(DF.bagValue(me) + DF.safeValue(me)).toLocaleString()}</b>`;
  DF.updateExtractHUD && DF.updateExtractHUD(DF._hudDt || 0.016);
  // 迷你计分
  const sm = document.getElementById('score-mini');
  const top = DF.getScoreData().slice(0, 4);
  sm.innerHTML = top.map((r, i) => `<div class="${r.id === DF.myId ? 'me' : ''}"><span>${i + 1}. ${escapeHtml(r.name)}</span><span>${r.kills}</span></div>`).join('');
  // 阵亡倒计时
  if (!me.alive && me.raidDead) {
    // 已阵亡：结算面板接管
  }
  DF.drawMinimap();
  DF.drawCompass();
};

/* 小地图 */
DF.drawMinimap = function () {
  const cv = document.getElementById('minimap');
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const localView = CFG.mapHalf > 220;   // 开放大地图：以本人为中心 ±160m 局部缩放
  const me = DF.players.get(DF.myId);
  const cx = localView && me ? me.pos.x : 0;
  const cz = localView && me ? me.pos.z : 0;
  const R = localView ? 160 : CFG.mapHalf + 4;
  const sc = W / (R * 2);
  const toX = x => (x - cx + R) * sc;
  const toY = z => (z - cz + R) * sc;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(24,30,20,.9)';
  g.fillRect(0, 0, W, H);
  // 网格（局部缩放时按 50m 一格并标注坐标）
  g.strokeStyle = 'rgba(120,140,100,.15)'; g.lineWidth = 1;
  if (localView) {
    g.font = '8px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    const step = 50;
    for (let gx = Math.floor((cx - R) / step) * step; gx <= cx + R; gx += step) {
      const p = toX(gx);
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, H); g.stroke();
      g.fillStyle = 'rgba(160,180,140,.5)'; g.fillText(String(Math.round(gx)), p + 2, 2);
    }
    for (let gz = Math.floor((cz - R) / step) * step; gz <= cz + R; gz += step) {
      const p = toY(gz);
      g.beginPath(); g.moveTo(0, p); g.lineTo(W, p); g.stroke();
      g.fillStyle = 'rgba(160,180,140,.5)'; g.fillText(String(Math.round(gz)), 2, p + 2);
    }
  } else {
    for (let i = 0; i <= 8; i++) {
      const p = (i / 8) * W;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, H); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(W, p); g.stroke();
    }
  }
  // 障碍
  g.fillStyle = 'rgba(150,170,130,.55)';
  for (const o of DF.obstacleMeta) {
    if (o.h < 0.6) continue;
    if (localView && (o.x + o.w / 2 < cx - R || o.x - o.w / 2 > cx + R || o.z + o.d / 2 < cz - R || o.z - o.d / 2 > cz + R)) continue;
    g.fillRect(toX(o.x - o.w / 2), toY(o.z - o.d / 2), Math.max(1, o.w * sc), Math.max(1, o.d * sc));
  }
  // 未搜索容器
  if (DF.containers) {
    g.fillStyle = 'rgba(255,193,74,.85)';
    for (const c of DF.containers) {
      if (c.searched || c.pendingDrop) continue;
      g.fillRect(toX(c.x) - 1.4, toY(c.z) - 1.4, 2.8, 2.8);
    }
  }
  // 撤离点
  if (DF.extracts) {
    for (const ex of DF.extracts) {
      const x = toX(ex.x), y = toY(ex.z);
      g.strokeStyle = ex.open ? '#7dd069' : 'rgba(150,160,140,.45)';
      g.lineWidth = 1.6;
      g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.stroke();
      g.fillStyle = ex.open ? 'rgba(125,208,105,.35)' : 'rgba(120,130,110,.18)';
      g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.fill();
      g.fillStyle = ex.open ? '#dfffd0' : '#8a927e';
      g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ex.tag, x, y + 0.5);
    }
  }
  // 局部缩放：场外撤离点方向箭头（三角 + 标签 + 距离）
  if (localView) {
    for (const ex of DF.extracts || []) {
      const dx = ex.x - cx, dz = ex.z - cz;
      const dist = Math.hypot(dx, dz);
      if (dist <= R - 12) continue;  // 屏幕内已直接绘制
      const nx = dx / dist, ny = dz / dist;
      const ax = W / 2 + nx * (W / 2 - 12), ay = H / 2 + ny * (H / 2 - 12);
      g.save();
      g.translate(ax, ay);
      g.rotate(Math.atan2(ny, nx) + Math.PI / 2);
      g.fillStyle = ex.open ? '#7dd069' : 'rgba(150,160,140,.7)';
      g.beginPath(); g.moveTo(0, -5); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill();
      g.restore();
      g.fillStyle = ex.open ? '#dfffd0' : '#8a927e';
      g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ex.tag + ' ' + Math.round(dist), ax, ay + (ny >= 0 ? 9 : -9));
    }
  }
  // 玩家
  DF.players.forEach(p => {
    if (!p.alive) return;
    const x = toX(p.pos.x), y = toY(p.pos.z);
    if (p.id === DF.myId) {
      g.save();
      g.translate(x, y); g.rotate(-p.yaw);
      g.fillStyle = '#ffb347';
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
      g.restore();
    } else {
      g.fillStyle = p.isBot ? '#ff6b5e' : '#7fd0ff';
      g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill();
    }
  });
  // 边框刻度
  if (localView) {
    // 北向箭头 + 比例尺
    g.fillStyle = '#ff8c1a'; g.font = 'bold 9px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('N↑', W - 16, 11);
    g.fillStyle = 'rgba(232,236,221,.55)'; g.font = '8px sans-serif';
    g.fillText('±160m', 4, H - 4);
  }
  g.strokeStyle = 'rgba(255,179,71,.5)';
  g.strokeRect(0.5, 0.5, W - 1, H - 1);
};

DF.drawCompass = function () {
  const cv = document.getElementById('compass');
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const me = DF.players.get(DF.myId);
  if (!me) return;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(10,14,8,.6)';
  g.fillRect(0, 0, W, H);
  const deg = ((-me.yaw * 180 / Math.PI) % 360 + 360) % 360;
  const pxPerDeg = W / 140;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 5) {
    let delta = d - deg;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    if (Math.abs(delta) > 70) continue;
    const x = W / 2 + delta * pxPerDeg;
    const major = d % 45 === 0;
    g.strokeStyle = major ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.32)';
    g.lineWidth = major ? 1.6 : 1;
    g.beginPath(); g.moveTo(x, H - 1); g.lineTo(x, H - (major ? 11 : 6)); g.stroke();
    if (major) {
      const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
      g.fillStyle = d === 0 ? '#ff8c1a' : '#e8ecdd';
      g.font = 'bold 11px sans-serif';
      g.fillText(names[d], x, 8);
    }
  }
  g.fillStyle = '#ff8c1a';
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2 - 4, 5); g.lineTo(W / 2 + 4, 5); g.closePath(); g.fill();
};

/* ============================================================
   射击
   ============================================================ */
DF.onShotFired = function (p) {
  p.shots = (p.shots || 0) + 1;
  // 全局枪声记录：bot 会听声辨位（10 秒内、70m 以内）
  if (!DF.botPings) DF.botPings = [];
  DF.botPings.push({ x: p.pos.x, z: p.pos.z, t: DF.time, id: p.id });
  if (DF.botPings.length > 14) DF.botPings.shift();
};

DF.tryLocalFire = function () {
  const me = DF.players.get(DF.myId);
  if (!me || !me.alive || DF.matchOver) return;
  const t = DF.time;
  if (me.reloading) return;
  if (t - (me.lastFire || 0) < CFG.fireRate) return;
  if (me.ammo <= 0) {
    DF.Audio.empty();
    me.lastFire = t - CFG.fireRate + 0.25;
    if (me.reserve > 0) DF.requestReload();
    return;
  }
  me.lastFire = t;
  me.ammo--;
  DF.onShotFired(me);
  DF.Audio.shot();
  DF.fx.flash();
  DF.vmRecoil = 1;
  // 后坐力（按枪械改装倍率）
  const kick = (me.ads ? 0.006 : 0.012) * (DF.effRecoil ? DF.effRecoil(me) : 1);
  DF.camKick.pitch += kick * rnd(0.7, 1.3);
  DF.camKick.yaw += kick * rnd(-0.6, 0.6);

  const cam = DF.camera;
  const origin = new T.Vector3();
  cam.getWorldPosition(origin);
  const dir = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  // 弹道散布
  const effSpr = DF.effSpread ? DF.effSpread(me) : 1;
  const effAds = DF.effAdsSpread ? DF.effAdsSpread(me) : 1;
  const effMove = DF.effMoveSpread ? DF.effMoveSpread(me) : 1;
  const spread = me.ads ? CFG.adsSpread * effAds : (me.crouch ? CFG.spread * 0.7 * effSpr : CFG.spread * effSpr + Math.min(0.02, Math.hypot(me.vel.x, me.vel.z) * 0.0035) * effMove);
  dir.x += rnd(-spread, spread);
  dir.y += rnd(-spread, spread) * 0.8;
  dir.z += rnd(-spread, spread);
  dir.normalize();

  if (DF.mode === 'guest') {
    DF.net.sendInput(DF.buildInput(), me.yaw, me.pitch, {
      shot: true,
      o: [+origin.x.toFixed(2), +origin.y.toFixed(2), +origin.z.toFixed(2)],
      d: [+dir.x.toFixed(3), +dir.y.toFixed(3), +dir.z.toFixed(3)]
    });
    // 本地预测子弹视觉
    const hit = DF.traceShot(origin, dir, 140, DF.myId);
    const end = hit.hit ? hit.point : origin.clone().addScaledVector(dir, 140);
    DF.fx.tracer(origin.clone().addScaledVector(dir, 1.2), end, 0xffe0a0);
  } else {
    DF.hostShoot(me, origin, dir, false);
    DF.net && DF.net.hostBroadcastFx && DF.net.hostBroadcastFx({
      t: 'tr', f: [+origin.x.toFixed(2), +origin.y.toFixed(2), +origin.z.toFixed(2)],
      to: [+(origin.x + dir.x * 60).toFixed(1), +(origin.y + dir.y * 60).toFixed(1), +(origin.z + dir.z * 60).toFixed(1)]
    });
  }
};

DF.requestReload = function () {
  const me = DF.players.get(DF.myId);
  const effMag = DF.effMag ? DF.effMag(me) : CFG.mag;
  if (!me || me.reloading || me.ammo === effMag || me.reserve <= 0) return;
  DF.Audio.reload();
  if (DF.mode === 'guest') {
    DF.net._sendRel({ t: 'in', r: 1, f: 0, s: 0, y: me.yaw, p: me.pitch });
    me.reloading = true;
    me.reloadEnd = DF.time + (DF.effReload ? DF.effReload(me) : CFG.reloadTime); // 预测
  } else {
    DF.startReload(me);
    DF.net && DF.net.hostBroadcast({ t: 'rl', id: me.id });
  }
};
DF.M.onLocalDeathMeta = function () { };

/* ============================================================
   本地玩家更新（预测 / 权威）
   ============================================================ */
DF.buildInput = function () {
  const I = DF.input, k = I.keys, T_ = DF.touch;
  if (DF.lootOpen) return { f: 0, s: 0, jump: false, crouch: false, ads: false, sprint: false, fire: false, reload: false };
  const touchOn = T_.enabled && (T_.joyId !== null || Math.abs(T_.f) + Math.abs(T_.s) > 0.02);
  let f = (k.w ? 1 : 0) - (k.s ? 1 : 0);
  let s = (k.d ? 1 : 0) - (k.a ? 1 : 0);
  let sprint = !!(k.shift && f > 0);
  let crouch = !!k.ctrl;
  if (T_.enabled) {
    // 摇杆优先（支持"轻推走 / 推到底跑"）
    if (touchOn) { f = T_.f; s = T_.s; }
    if (T_.sprintHeld && f > 0.25) sprint = true;
    if (T_.mag > 0.88 && f > 0.55) sprint = true;
    if (T_.crouchHeld) crouch = true;
  }
  return {
    f, s,
    jump: !!I.jumpQueued,
    crouch,
    ads: !!I.ads,
    sprint,
    fire: !!I.fire,
    reload: !!I.reload
  };
};

DF.updateLocalPlayer = function (dt) {
  const me = DF.players.get(DF.myId);
  if (!me) return;
  const I = DF.input;
  // 装弹完成
  if (me.reloading && DF.time >= me.reloadEnd) {
    if (DF.mode === 'guest') {
      // 由房主权威计算，这里仅做视觉收尾
      me.reloading = false;
    } else {
      DF.finishReload(me);
    }
  }
  // 视角（鼠标锁定 / 拖拽兜底 / 触控滑动）
  const touchLook = (I.tdx || 0) !== 0 || (I.tdy || 0) !== 0;
  if (I.locked || DF.dragLook || touchLook) {
    const sens = I.sens * (me.ads ? 0.62 : 1);
    me.yaw -= I.mdx * sens;
    me.pitch -= I.mdy * sens;
    // 触控：手指向右 → 视角向右；手指向上 → 视线向上（严格线性）
    const tSens = 0.0034 * (DF.touch.sens / 2.15) * (I.ads ? DF.touch.adsSens : 1);
    me.yaw -= (I.tdx || 0) * tSens;
    me.pitch -= (I.tdy || 0) * tSens;
    I.mdx = 0; I.mdy = 0; I.tdx = 0; I.tdy = 0;
    // 后坐力回正
    me.pitch += DF.camKick.pitch;
    me.yaw += DF.camKick.yaw;
    DF.camKick.pitch *= 0.72;
    DF.camKick.yaw *= 0.72;
    if (Math.abs(DF.camKick.pitch) < 0.0004) DF.camKick.pitch = 0;
    if (Math.abs(DF.camKick.yaw) < 0.0004) DF.camKick.yaw = 0;
    me.pitch = clamp(me.pitch, -1.45, 1.45);
  }
  me.ads = !!I.ads && me.alive;
  if (!me.alive && DF.touch && DF.touch.adsHeld) { DF.touch.adsHeld = false; DF.input.ads = false; }
  if (!me.alive) {
    // 死亡后摄像机缓慢下沉
    DF.camera.position.x = lerp(DF.camera.position.x, me.pos.x, Math.min(1, dt * 6));
    DF.camera.position.z = lerp(DF.camera.position.z, me.pos.z, Math.min(1, dt * 6));
    DF.camera.position.y = lerp(DF.camera.position.y, me.pos.y + 0.55, Math.min(1, dt * 4));
    DF.camera.rotation.set(me.pitch * 0.3, me.yaw, 0.35, 'YXZ');
    return;
  }

  const input = DF.buildInput();
  const moveFn = DF.driveVehicle ? DF.driveVehicleUpdate : DF.applyMovement;
  if (DF.mode === 'guest') {
    DF.applyMovement(me, input, dt);
    DF.net.sendInput(input, me.yaw, me.pitch, null);
  } else {
    moveFn(me, input, dt);
    DF.net && DF.net.role === 'host' && DF.net.hostBroadcast && null;
  }
  I.jumpQueued = false;
  if (I.reload) { DF.requestReload(); I.reload = false; }

  // 开火（全自动）
  DF.fireCd = (DF.fireCd || 0) - dt;
  if (input.fire && DF.fireCd <= 0) {
    DF.tryLocalFire();
    DF.fireCd = CFG.fireRate;
  }

  // 摄像机
  const driving = !!DF.driveVehicle;
  const eye = driving ? 1.92 : (me.crouch ? CFG.crouchEye : CFG.eye);
  const speed = Math.hypot(me.vel.x, me.vel.z);
  DF.bobT += dt * speed * (driving ? 0 : 1.5);
  const bobAmt = (driving ? 0 : Math.min(1, speed / CFG.walk)) * (me.onGround ? 1 : 0) * (me.ads ? 0.35 : 1);
  const bobY = Math.sin(DF.bobT * 2) * 0.028 * bobAmt;
  const bobX = Math.cos(DF.bobT) * 0.022 * bobAmt;
  // 触屏宽屏：相机略微下移抬高视角，使枪身落在画面下缘留白处
  const wideCam = DF.touch.enabled ? clamp((DF.camera.aspect - 1.72) / 0.45, 0, 1) * 0.22 : 0;
  const wantY = me.pos.y + eye + bobY + wideCam * 0.11 + (driving ? Math.sin(DF.time * 9) * Math.min(0.03, Math.abs(DF.driveVehicle.speed) * 0.0022) : 0);
  if (driving) {
    const hv = DF.driveVehicle;
    const hx = -Math.sin(hv.heading), hz = -Math.cos(hv.heading);
    DF.camera.position.lerp(new T.Vector3(me.pos.x + hx * 0.5, wantY, me.pos.z + hz * 0.5), Math.min(1, dt * 22));
  } else {
    DF.camera.position.lerp(new T.Vector3(me.pos.x + bobX * 0.3, wantY, me.pos.z), Math.min(1, dt * 22));
  }
  DF.camera.rotation.set(me.pitch, me.yaw, 0, 'YXZ');

  // 视图模型动画
  const vm = DF.viewModel;
  if (vm) {
    // 超宽屏（手机横屏 2:1 以上）时整体缩小并向中心收，保证枪身完整入画
    const wideK = clamp((DF.camera.aspect - 1.72) / 0.45, 0, 1);
    const hip = vm.userData.hipPos;
    if (wideK > 0 && !me.ads) {
      vm.scale.setScalar(0.62 * (1 - 0.16 * wideK));
    } else {
      vm.scale.setScalar(0.62);
    }
    // 宽屏时抬高枪身并前推（垂直 FOV 不变，低处会被切出画面）
    const tgt = me.ads ? vm.userData.adsPos
      : _v1.set(
          lerp(hip.x, 0.045, wideK),
          lerp(hip.y, -0.10, wideK),
          lerp(hip.z, -0.56, wideK)
        );
    const targetPos = tgt;
    const lk = Math.min(1, dt * (me.ads ? 18 : 12));
    vm.position.lerp(targetPos, lk);
    vm.rotation.y = lerp(vm.rotation.y, me.ads ? 0 : vm.userData.hipRot, lk);
    if (vm.userData.adsHide) {
      const show = !me.ads;
      vm.userData.adsHide.forEach(o => { if (o) o.visible = show; });
    }
    // 枪身后坐
    DF.vmRecoil = Math.max(0, (DF.vmRecoil || 0) - dt * 9);
    vm.position.z += DF.vmRecoil * 0.055;
    vm.rotation.x = DF.vmRecoil * 0.16 + Math.sin(DF.bobT * 2) * 0.006 * bobAmt;
    vm.rotation.z = Math.sin(DF.bobT) * 0.012 * bobAmt;
    vm.rotation.y = me.ads ? 0 : Math.sin(DF.bobT) * 0.008 * bobAmt;
    // 装弹动画
    if (me.reloading) {
      const prog = 1 - clamp((me.reloadEnd - DF.time) / CFG.reloadTime, 0, 1);
      const s = Math.sin(prog * Math.PI);
      vm.rotation.x += s * 0.55;
      vm.position.y -= s * 0.14;
      vm.userData.mag.position.y = -0.14 - s * 0.18;
    } else {
      vm.userData.mag.position.y = -0.14;
    }
    // 准镜透明度
    vm.userData.redDot.material.opacity = 1;
    vm.userData.redDot.visible = true;
    vm.visible = true;
  }
  // 机瞄视野缩放
  const wantFov = me.ads ? 58 : 78;
  if (Math.abs(DF.camera.fov - wantFov) > 0.3) {
    DF.camera.fov = lerp(DF.camera.fov, wantFov, Math.min(1, dt * 12));
    DF.camera.updateProjectionMatrix();
  }
  // 准星
  const ch = document.getElementById('crosshair');
  ch.style.opacity = me.ads ? 0.15 : 1;
  const spreadPx = 6 + (me.ads ? -3 : Math.hypot(me.vel.x, me.vel.z) * (driving ? 0.55 : 1.3));
  ch.style.transform = `translate(-50%,-50%) scale(${1 + spreadPx / 40})`;
};

/* ============================================================
   主循环
   ============================================================ */
DF.loop = function (ts) {
  requestAnimationFrame(DF.loop);
  const dtRaw = (ts - DF.lastFrame) / 1000;
  DF.lastFrame = ts;
  const dt = Math.min(0.05, Math.max(0.0001, dtRaw));
  DF.time = now();

  if (!DF.matchRunning) {
    DF.idleCamera(dt);
    DF.updateSkySun();
  DF.renderer.render(DF.scene, DF.camera);
    DF.autoQuality();
    return;
  }

  // 客人：插值远程玩家
  if (DF.mode === 'guest' && DF.net) {
    DF.net.interpolateRemote(dt);
    DF.net.guestPredictExtract && DF.net.guestPredictExtract();
  }

  if (DF.paused) {
    // 暂停时只渲染，不推进本地操作
    DF.players.forEach(p => { if (p.mesh) DF.updateCharacter(p, dt); });
    DF.fx.update(dt);
    DF.updateSkySun();
  DF.renderer.render(DF.scene, DF.camera);
    return;
  }
  DF.updateLocalPlayer(dt);
  if (DF.updateVehicles) DF.updateVehicles(dt);

  // 更新所有角色网格
  DF.players.forEach(p => {
    if (p.mesh) DF.updateCharacter(p, dt);
  });
  // 本地玩家模型隐藏（第一人称）
  const me = DF.players.get(DF.myId);
  if (me && me.mesh) me.mesh.visible = false;

  // 机器人思考（仅房主/单人）
  if (DF.mode !== 'guest') {
    DF.players.forEach(p => {
      if (p.isBot && p.alive) DF.updateBot(p, dt);
    });
  }

  // 客人：长时间收不到快照 → 判定掉线
  if (DF.mode === 'guest' && DF.matchRunning && DF.net && DF.net.lastSnapAt && !DF._dropWarned) {
    if (DF.time - DF.net.lastSnapAt > 8) {
      DF._dropWarned = true;
      DF.toast('与房主的连接已超时，返回主菜单');
      setTimeout(() => DF.quitToMenu(), 1200);
    }
  }
  if (DF.touch.enabled && DF._syncTouchToggles) DF._syncTouchToggles();
  // 搜打撤：世界动画 + 权威逻辑
  DF.updateExtracts && DF.updateExtracts(dt);
  if (DF.mode === 'single' && DF.matchRunning && !DF.paused) {
    const tn = now();
    const realDt = Math.min(2, Math.max(0, tn - (DF._lastSoloTick || tn)));
    DF._lastSoloTick = tn;
    DF.matchTime += realDt;
  }
  // 撤离判定由独立定时器负责（见 startSoloExtractLoop / Net.startHost）
  DF.regenTick(dt);
  DF.fx.update(dt);
  DF._hudDt = dt;
  DF.updateHUD();
  DF.updateSkySun();
  DF.renderer.render(DF.scene, DF.camera);
  DF.autoQuality();
};

/* 自适应画质：帧率过低时逐级降载（避免 <1 的 pixelRatio，部分移动端会黑屏） */
DF.applyRenderScale = function (scale) {
  const r = DF.renderer;
  const w = window.innerWidth, h = window.innerHeight;
  if (scale >= 0.999) {
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, DF.maxPixelRatio || 1.75));
    r.setSize(w, h, true);
    r.domElement.style.width = '';
    r.domElement.style.height = '';
  } else {
    // 内部缓冲按比例缩小，再用 CSS 拉伸铺满（兼容移动端合成）
    r.setPixelRatio(1);
    r.setSize(Math.max(320, Math.floor(w * scale)), Math.max(200, Math.floor(h * scale)), false);
    r.domElement.style.width = '100%';
    r.domElement.style.height = '100%';
  }
  DF.renderScale = scale;
};

DF.setShadowQuality = function (on, size) {
  DF.renderer.shadowMap.enabled = on;
  DF.sun.castShadow = on;
  DF.sun.shadow.mapSize.set(size, size);
  if (DF.sun.shadow.map) { DF.sun.shadow.map.dispose(); DF.sun.shadow.map = null; }
  DF.scene.traverse(o => { if (o.isMesh) o.castShadow = on; });
  DF.renderer.shadowMap.needsUpdate = true;
};

DF.autoQuality = function () {
  const P = DF.perf;
  if (!P || !DF.matchRunning) return;
  P.frames++;
  const el = (performance.now() - P.t0) / 1000;
  if (el < 2) return;
  P.fps = P.frames / el;
  P.frames = 0; P.t0 = performance.now();
  if (P.checks > 6) return;
  if (P.fps < 30 && P.level > 0) {
    P.level--;
    P.checks++;
    if (P.level === 1) {
      DF.setShadowQuality(false, 512);
      DF.applyRenderScale(0.82);
    } else if (P.level === 0) {
      DF.applyRenderScale(0.66);
    }
    if (DF.matchRunning) DF.toast('已自动降低画质以保证流畅');
  }
};

/* 菜单角色「驻村人」：三角洲行动风格大厅的 3D 主角 */
DF.spawnMenuActor = function (scene) {
  const actor = DF.makeCharacter(0x424f2c);
  actor.position.set(0.5, 0, 2.5);
  actor.scale.set(1.18, 1.18, 1.18);
  actor.rotation.y = Math.PI * 0.85;
  if (actor.userData && actor.userData.label) actor.userData.label.visible = false;
  scene.add(actor);
  DF.menuActor = actor;
};

DF.idleCamera = function (dt) {
  // 菜单大厅：围绕驻村人缓慢环绕（Delta Force Key-art 视角）
  DF.idleT = (DF.idleT || 0) + dt * 0.17;
  const ax = 0.5, az = 2.5, ar = 2.35;
  const px = ax + Math.cos(DF.idleT) * ar, pz = az + Math.sin(DF.idleT) * ar;
  DF.camera.position.set(px, 1.34 + Math.sin(DF.idleT * 0.6) * 0.15, pz);
  // 目标点左移，令角色位于画面右侧（Delta Force 主视觉构图）
  const fx = ax - px, fz = az - pz, fl = Math.hypot(fx, fz);
  const rx = -fz / fl, rz = fx / fl;
  const shift = 1.02;
  DF.camera.lookAt(ax - rx * shift, 1.24, az - rz * shift);
  const actor = DF.menuActor;
  if (actor) {
    // 始终面向镜头 + 缓慢呼吸起伏
    actor.rotation.y = Math.atan2(-(DF.camera.position.x - ax), -(DF.camera.position.z - az));
    const ud = actor.userData;
    ud.walkPhase = (ud.walkPhase || 0) + dt * 1.55;
    actor.position.y = Math.sin(ud.walkPhase) * 0.028;
    if (ud.torso) ud.torso.scale.y = 1 + Math.sin(ud.walkPhase) * 0.022;
    actor.rotation.z = Math.sin(ud.walkPhase * 0.5) * 0.012;
  }
  if (DF.viewModel) DF.viewModel.visible = false;
};

/* ---------------- 启动 ---------------- */
window.addEventListener('DOMContentLoaded', () => {
  try { DF.init(); }
  catch (e) {
    console.error(e);
    document.body.innerHTML = '<div style="color:#fff;padding:40px;font-family:sans-serif">初始化失败：' + e.message + '</div>';
  }
});
