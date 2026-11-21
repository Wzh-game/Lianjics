/* ============================================================
   吴家村专属小曲《十一笔》
   累计击杀 100 人解锁；档案数据持久化，点击按钮后播放（兼容 iOS 音频手势限制）
   ============================================================ */
DF.WujiaMusic = (() => {
  const REQUIRED_KILLS = 100;
  let wasUnlocked = false;
  let initialized = false;

  const getKills = () => Math.max(0, Math.floor(Number(DF.Profile && DF.Profile.data && DF.Profile.data.kills) || 0));
  const getAudio = () => document.getElementById('wujia-village-track');
  const getButton = () => document.getElementById('wujia-music-btn');

  function refresh(notify) {
    const kills = getKills();
    const unlocked = kills >= REQUIRED_KILLS;
    const progress = document.getElementById('wujia-music-progress');
    const button = getButton();
    if (progress) {
      progress.textContent = unlocked
        ? '已解锁 · 累计击杀 ' + kills + ' 人'
        : '累计击杀 ' + kills + ' / ' + REQUIRED_KILLS + ' · 还差 ' + (REQUIRED_KILLS - kills) + ' 人';
    }
    if (button) {
      button.classList.toggle('hidden', !unlocked);
      button.disabled = !unlocked;
    }
    if (notify && unlocked && !wasUnlocked && typeof DF.toast === 'function') {
      DF.toast('🎉 累计击杀达到 100！吴家村专属小曲《十一笔》已解锁');
    }
    wasUnlocked = unlocked;
    return unlocked;
  }

  async function toggle() {
    if (!refresh(false)) return;
    const audio = getAudio();
    const button = getButton();
    if (!audio || !button) return;

    // 正在播放时再次点击即可暂停；每次开始播放前输入专属口令。
    if (!audio.paused) {
      audio.pause();
      return;
    }

    const password = window.prompt('吴家村专属小曲《十一笔》\\n请输入播放口令：');
    if (password === null) return;
    if (password.trim() !== '老鼠') {
      if (typeof DF.toast === 'function') DF.toast('口令不正确，无法播放《十一笔》');
      return;
    }

    try {
      await audio.play();
    } catch (err) {
      if (typeof DF.toast === 'function') DF.toast('音乐暂时无法播放，请检查音频文件或再次点击');
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    const button = getButton();
    const audio = getAudio();
    if (button) button.addEventListener('click', toggle);
    if (audio && button) {
      audio.addEventListener('play', () => {
        button.textContent = 'Ⅱ 暂停《十一笔》';
        button.classList.add('playing');
      });
      audio.addEventListener('pause', () => {
        button.textContent = '🎵 播放《十一笔》';
        button.classList.remove('playing');
      });
      audio.addEventListener('error', () => {
        if (!audio.paused) audio.pause();
        DF.toast('《十一笔》音频文件未找到，请确认 assets/wujia-village-shiyibi.mp3 已上传');
      });
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

  return { init, refresh, toggle, requiredKills: REQUIRED_KILLS };
})();

DF.WujiaMusic.init();
