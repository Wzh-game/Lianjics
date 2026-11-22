/* ============================================================
   吴家村专属小曲《十一笔》
   累计击杀 100 人解锁；固定表单填写“吴家村”并确认后播放
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
    if (progress) {
      progress.textContent = unlocked
        ? '已解锁 · 累计击杀 ' + kills + ' 人 · 输入名称“吴家村”并确定播放'
        : '累计击杀 ' + kills + ' / ' + REQUIRED_KILLS + ' · 还差 ' + (REQUIRED_KILLS - kills) + ' 人后解锁';
    }
    if (button) button.classList.toggle('hidden', !(unlocked && authorized));
    if (notify && unlocked && !wasUnlocked && typeof DF.toast === 'function') {
      DF.toast('🎉 累计击杀达到 100！吴家村专属小曲《十一笔》已解锁');
    }
    wasUnlocked = unlocked;
    return unlocked;
  }

  async function confirmNameAndPlay() {
    if (!refresh(false)) {
      const remaining = Math.max(0, REQUIRED_KILLS - getKills());
      if (typeof DF.toast === 'function') DF.toast('吴家村秘曲尚未解锁，还需累计击杀 ' + remaining + ' 人');
      return;
    }
    const input = document.getElementById('wujia-music-name');
    const name = input ? input.value.trim() : '';
    if (name !== '吴家村') {
      if (typeof DF.toast === 'function') DF.toast('名称不正确，请准确填写“吴家村”');
      if (input) { input.focus(); input.select(); }
      return;
    }
    const audio = getAudio();
    if (!audio) {
      if (typeof DF.toast === 'function') DF.toast('找不到音乐播放器，请刷新游戏后重试');
      return;
    }
    try {
      await audio.play();
      authorized = true;
      refresh(false);
      if (typeof DF.toast === 'function') DF.toast('正在播放吴家村专属小曲《十一笔》');
    } catch (err) {
      if (typeof DF.toast === 'function') DF.toast('播放失败：请检查音频文件是否能加载，或稍后重试');
    }
  }

  async function toggle() {
    if (!refresh(false)) return;
    const audio = getAudio();
    if (!audio) return;
    if (!authorized) {
      if (typeof DF.toast === 'function') DF.toast('请先填写名称“吴家村”，再点击确定');
      return;
    }
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch (err) {
      if (typeof DF.toast === 'function') DF.toast('音乐暂时无法播放，请检查音频文件');
    }
  }

  function init() {
    if (initialized) return;
    const input = document.getElementById('wujia-music-name');
    const confirm = document.getElementById('wujia-music-confirm');
    const button = getButton();
    const seek = document.getElementById('wujia-music-seek');
    const clock = document.getElementById('wujia-music-time');
    const audio = getAudio();
    if (!input || !confirm || !button || !seek || !clock || !audio) {
      document.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }
    initialized = true;

    confirm.addEventListener('click', confirmNameAndPlay);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') confirmNameAndPlay();
    });
    button.addEventListener('click', toggle);
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
      if (typeof DF.toast === 'function') DF.toast('音频加载失败：assets/wujia-village-shiyibi.mp3');
    });

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
    updateTimeline();
  }

  return { init, refresh, toggle, confirmNameAndPlay, requiredKills: REQUIRED_KILLS };
})();

DF.WujiaMusic.init();