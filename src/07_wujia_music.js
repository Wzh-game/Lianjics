/* ============================================================
   吴家村专属小曲《十一笔》
   累计击杀 100 人解锁；双击进度条输入口令“老鼠”后播放
   ============================================================ */
DF.WujiaMusic = (() => {
  const REQUIRED_KILLS = 100;
  let wasUnlocked = false;
  let initialized = false;
  let authorized = false;

  const getKills = () => Math.max(0, Math.floor(Number(DF.Profile && DF.Profile.data && DF.Profile.data.kills) || 0));
  const getAudio = () => document.getElementById('wujia-village-track');
  const getButton = () => document.getElementById('wujia-music-btn');

  const formatTime = value => {
    if (!Number.isFinite(value)) return '0:00';
    const seconds = Math.max(0, Math.floor(value));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  };

  function refresh(notify) {
    const kills = getKills();
    const unlocked = kills >= REQUIRED_KILLS;
    const progress = document.getElementById('wujia-music-progress');
    const button = getButton();
    const controls = document.getElementById('wujia-music-controls');
    if (progress) {
      progress.textContent = unlocked
        ? '已解锁 · 累计击杀 ' + kills + ' 人 · 双击下方进度条输入口令播放'
        : '累计击杀 ' + kills + ' / ' + REQUIRED_KILLS + ' · 还差 ' + (REQUIRED_KILLS - kills) + ' 人';
    }
    if (button) {
      button.classList.toggle('hidden', !unlocked);
      button.disabled = !unlocked;
    }
    if (controls) controls.classList.toggle('hidden', !unlocked);
    if (notify && unlocked && !wasUnlocked && typeof DF.toast === 'function') {
      DF.toast('🎉 累计击杀达到 100！吴家村专属小曲《十一笔》已解锁');
    }
    wasUnlocked = unlocked;
    return unlocked;
  }

  async function requestPlayback() {
    if (!refresh(false)) return;
    const audio = getAudio();
    if (!audio) return;
    const password = window.prompt('吴家村专属小曲《十一笔》\\n请输入播放口令：');
    if (password === null) return;
    if (password.trim() !== '老鼠') {
      if (typeof DF.toast === 'function') DF.toast('口令不正确，无法播放《十一笔》');
      return;
    }
    authorized = true;
    try {
      await audio.play();
    } catch (err) {
      if (typeof DF.toast === 'function') DF.toast('音乐暂时无法播放，请检查音频文件是否已上传');
    }
  }

  async function toggle() {
    if (!refresh(false)) return;
    const audio = getAudio();
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (!authorized) {
      if (typeof DF.toast === 'function') DF.toast('请双击下方进度条，并输入口令“老鼠”');
      return;
    }
    try {
      await audio.play();
    } catch (err) {
      if (typeof DF.toast === 'function') DF.toast('音乐暂时无法播放，请检查音频文件是否已上传');
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    const button = getButton();
    const audio = getAudio();
    const card = document.getElementById('wujia-music-card');
    if (card && button && audio) {
      const controls = document.createElement('div');
      controls.id = 'wujia-music-controls';
      controls.className = 'hidden';
      controls.style.cssText = 'display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:9px';
      const seek = document.createElement('input');
      seek.id = 'wujia-music-seek';
      seek.type = 'range';
      seek.min = '0';
      seek.max = '1000';
      seek.value = '0';
      seek.setAttribute('aria-label', '《十一笔》播放进度；双击输入口令播放');
      seek.style.cssText = 'flex:1 1 180px;min-width:150px;accent-color:#ffb347;cursor:pointer;touch-action:pan-x';
      const clock = document.createElement('span');
      clock.id = 'wujia-music-time';
      clock.textContent = '0:00 / 0:00';
      clock.style.cssText = 'font-size:11px;color:#c9b18b;font-variant-numeric:tabular-nums';
      button.style.cssText = 'position:static;top:auto;right:auto;z-index:auto;padding:7px 11px;font-size:12px;box-shadow:none';
      controls.appendChild(button);
      controls.appendChild(seek);
      controls.appendChild(clock);
      card.appendChild(controls);

      // 桌面端监听 dblclick；iPad/iPhone 上额外识别 380ms 内同一区域的双击。
      let lastSeekTap = 0;
      let lastSeekPoint = null;
      let suppressNativeDblClickUntil = 0;
      seek.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
        const now = Date.now();
        const point = { x: event.clientX, y: event.clientY };
        const closeToLast = lastSeekPoint &&
          Math.hypot(point.x - lastSeekPoint.x, point.y - lastSeekPoint.y) <= 38;
        if (lastSeekTap && now - lastSeekTap <= 380 && closeToLast) {
          event.preventDefault();
          lastSeekTap = 0;
          lastSeekPoint = null;
          suppressNativeDblClickUntil = now + 500;
          requestPlayback();
          return;
        }
        lastSeekTap = now;
        lastSeekPoint = point;
      });
      seek.addEventListener('dblclick', event => {
        event.preventDefault();
        if (Date.now() < suppressNativeDblClickUntil) return;
        requestPlayback();
      });
      seek.addEventListener('input', () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
        }
      });
      const updateTimeline = () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        if (document.activeElement !== seek) {
          seek.value = duration > 0 ? String(Math.round(audio.currentTime / duration * 1000)) : '0';
        }
        clock.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(duration);
      };
      audio.addEventListener('timeupdate', updateTimeline);
      audio.addEventListener('loadedmetadata', updateTimeline);
      audio.addEventListener('durationchange', updateTimeline);
      button.addEventListener('click', toggle);
      audio.addEventListener('play', () => {
        button.textContent = 'Ⅱ 暂停《十一笔》';
        button.classList.add('playing');
      });
      audio.addEventListener('pause', () => {
        button.textContent = '🎵 播放《十一笔》';
        button.classList.remove('playing');
      });
      audio.addEventListener('ended', () => {
        button.textContent = '🎵 播放《十一笔》';
        button.classList.remove('playing');
      });
      audio.addEventListener('error', () => {
        if (!audio.paused) audio.pause();
        if (typeof DF.toast === 'function') DF.toast('《十一笔》音频文件未找到，请确认 assets/wujia-village-shiyibi.mp3 已上传');
      });
      updateTimeline();
    }

    // 战术档案在每局结算时累计本局击杀；包装原方法，避免改变既有资产结算逻辑。
    if (DF.Profile && !DF.Profile._wujiaMusicWrapped) {
      const load = DF.Profile.load.bind(DF.Profile);
      const addExtraction = DF.Profile.addExtraction.bind(DF.Profile);
      const addDeath = DF.Profile.addDeath.bind(DF.Profile);
      DF.Profile.load = function () {
        const result = load(...arguments);
        refresh(false);
        return result;
      };
      DF.Profile.addExtraction = function () {
        const result = addExtraction(...arguments);
        refresh(true);
        return result;
      };
      DF.Profile.addDeath = function () {
        const result = addDeath(...arguments);
        refresh(true);
        return result;
      };
      DF.Profile._wujiaMusicWrapped = true;
    }
    refresh(false);
  }

  return { init, refresh, toggle, requestPlayback, requiredKills: REQUIRED_KILLS };
})();

DF.WujiaMusic.init();
