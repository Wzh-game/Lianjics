/* ============================================================
   吴家村专属小曲《十一笔》
   双击主菜单标题「三角洲行动」播放/暂停；无等级、击杀数或名称限制。
   桌面端支持鼠标双击，iPad/手机支持双击（双击）标题。
   ============================================================ */
DF.WujiaMusic = (() => {
  let initialized = false;
  let toggling = false;
  let lastTouchAt = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let lastTouchToggleAt = 0;

  const getAudio = () => document.getElementById('wujia-village-track');
  const getTitle = () => document.querySelector('#menu h1.logo');

  function notify(message) {
    if (typeof DF.toast === 'function') DF.toast(message);
  }

  async function toggle() {
    if (toggling) return;
    const audio = getAudio();
    if (!audio) {
      notify('找不到《十一笔》音频文件，请刷新游戏后重试');
      return;
    }

    toggling = true;
    try {
      if (audio.paused) {
        // 吴家村歌曲拥有当前播放优先权：暂停游戏背景音乐，阻止其自动抢播。
        if (DF.Music && typeof DF.Music.pauseForExternal === 'function') DF.Music.pauseForExternal();
        try {
          await audio.play();
          notify('🎵 正在播放吴家村专属小曲《十一笔》');
        } catch (playError) {
          if (DF.Music && typeof DF.Music.resumeAfterExternal === 'function') DF.Music.resumeAfterExternal();
          throw playError;
        }
      } else {
        audio.pause();
        // 用户暂停吴家村歌曲后，恢复游戏原有背景音乐。
        if (DF.Music && typeof DF.Music.resumeAfterExternal === 'function') DF.Music.resumeAfterExternal();
        notify('已暂停《十一笔》，游戏背景音乐已恢复');
      }
    } catch (error) {
      notify('《十一笔》播放失败，请检查网络或音频文件');
    } finally {
      toggling = false;
    }
  }

  function init() {
    if (initialized) return;
    const title = getTitle();
    const audio = getAudio();
    if (!title || !audio) {
      document.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }
    initialized = true;

    // 移除此前错误添加的名称输入框、击杀解锁提示和进度条界面。
    const oldCard = document.getElementById('wujia-music-card');
    if (oldCard) oldCard.classList.add('hidden');

    title.style.cursor = 'pointer';
    title.style.touchAction = 'manipulation';
    title.setAttribute('title', '双击播放 / 暂停吴家村专属小曲《十一笔》');
    title.setAttribute('aria-label', '三角洲行动，双击播放或暂停吴家村专属小曲《十一笔》');

    // 桌面浏览器：鼠标双击。
    title.addEventListener('dblclick', event => {
      // iOS 触摸双击后部分浏览器还会合成 dblclick，避免重复切换。
      if (Date.now() - lastTouchToggleAt < 700) return;
      event.preventDefault();
      toggle();
    });

    // iPad / 手机：两次短间隔触摸标题视为双击。
    title.addEventListener('pointerup', event => {
      if (event.pointerType !== 'touch') return;
      const now = Date.now();
      const dx = event.clientX - lastTouchX;
      const dy = event.clientY - lastTouchY;
      const isSecondTap = now - lastTouchAt > 0 &&
        now - lastTouchAt < 420 &&
        dx * dx + dy * dy < 40 * 40;

      if (isSecondTap) {
        event.preventDefault();
        lastTouchToggleAt = now;
        lastTouchAt = 0;
        toggle();
      } else {
        lastTouchAt = now;
        lastTouchX = event.clientX;
        lastTouchY = event.clientY;
      }
    }, { passive: false });

    audio.addEventListener('error', () => {
      notify('音频加载失败：assets/wujia-village-shiyibi.mp3');
    });
  }

  return { init, toggle };
})();

DF.WujiaMusic.init();
