/* ============================================================
   吴家村专属小曲《十一笔》
   累计击杀 100 人解锁；填写名称“吴家村”并确认后播放
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
    const controls = document.getElementById('wujia-music-controls');
    if (progress) {
      progress.textContent = unlocked
        ? '已解锁 · 累计击杀 ' + kills + ' 人 · 输入名称“吴家村”并确定播放'
        : '累计击杀 ' + kills + ' / ' + REQUIRED_KILLS + ' · 还差 ' + (REQUIRED_KILLS - kills) + ' 人';
    }
    if (controls) controls.classList.toggle('hidden', !unlocked);
    if (notify && unlocked && !wasUnlocked && typeof DF.toast === 'function') {
      DF.toast('🎉 累计击杀达到 100！吴家村专属小曲《十一笔》已解锁');
    }
    wasUnlocked = unlocked;
    return unlocked;
  }

  async function confirmNameAndPlay() {
    if (!refresh(false)) {
      const remaining = Math.max(0, REQUIRED_KILLS - getKills());
      if (typeof DF.toast === 'function') DF.toast('还需累计击杀 ' + remaining + ' 人，达到 100 人后解锁');
      return;
    }
    const input = document.getElementById('wujia-music-name');
    const name = input ? input.value.trim() : '';
    if (name !== '吴家村') {
      if (typeof DF.toast === 'function') DF.toast('名称不正确，请填写“吴家村”');
      if (input) { input.focus(); input.select(); }
      return;
    }
    const audio = getAudio();
    if (!audio) {
      if (typeof DF.toast === 'function') DF.toast('音乐播放器未初始化，请刷新游戏后重试');
      return;
    }
    authorized = true;
    try {
      await audio.play();
    } catch (err) {
      if (typeof DF.toast === 'function') DF.toast('音乐暂时无法播放，请检查 assets/wujia-village-shiyibi.mp3 音频文件');
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
      if (typeof DF.toast === 'function') DF.toast('请先填写名称“吴家村”，然后点击确定');
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
      controls.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:9px';

      const nameLabel = document.createElement('label');
      nameLabel.textContent = '名称';
      nameLabel.htmlFor = 'wujia-music-name';
      nameLabel.style.cssText = 'font-size:12px;color:#c9b18b';
      const nameInput = document.createElement('input');
      nameInput.id = 'wujia-music-name';
      nameInput.type = 'text';
      nameInput.placeholder = '请输入吴家村';
      nameInput.autocomplete = 'off';
      nameInput.setAttribute('aria-label', '输入名称吴家村');
      nameInput.style.cssText = 'width:132px;min-width:0;padding:7px 9px;border:1px solid #6b512b;border-radius:5px;background:#10150c;color:#fff;font:inherit;user-select:text';
      const confirm = document.createElement('button');
      confirm.id = 'wujia-music-confirm';
      confirm.type = 'button';
      confirm.textContent = '确定';
      confirm.style.cssText = 'padding:7px 13px;border:1px solid #b17a35;border-radius:5px;background:#754313;color:#fff;font:inherit;cursor:pointer';
      const seek = document.createElement('input');
      seek.id = 'wujia-music-seek';
      seek.type = 'range';
      seek.min = '0';
      seek.max = '1000';
      seek.value = '0';
      seek.setAttribute('aria-label', '《十一笔》播放进度');
      seek.style.cssText = 'flex:1 1 150px;min-width:120px;accent-color:#ffb347;cursor:pointer;touch-action:pan-x';
      const clock = document.createElement('span');
      clock.id = 'wujia-music-time';
      clock.textContent = '0:00 / 0:00';
      clock.style.cssText = 'font-size:11px;color:#c9b18b;font-variant-numeric:tabular-nums';

      button.style.cssText = 'position:static;top:auto;right:auto;z-index:auto;padding:7px 11px;font-size:12px;box-shadow:none';
      controls.append(nameLabel, nameInput, confirm, button, seek, clock);
      card.appendChild(controls);

      confirm.addEventListener('click', confirmNameAndPlay);
      nameInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') confirmNameAndPlay();
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

  return { init, refresh, toggle, confirmNameAndPlay, requiredKills: REQUIRED_KILLS };
})();

DF.WujiaMusic.init();