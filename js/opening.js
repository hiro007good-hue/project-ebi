/* Project EBI Version 1.0 - Opening Adventure Screen local release candidate */
(function (global) {
  'use strict';

  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var STATES = Object.freeze({
    INITIAL: 'INITIAL',
    LOADING: 'LOADING',
    READY: 'READY',
    EXITING: 'EXITING',
    FINISHED: 'FINISHED'
  });
  var HINTS = Object.freeze([
    '日野町には、まだ見つかっていない海老たちがいる…',
    '黄金えびは特別な場所に現れるらしい…',
    '21体の仲間を探して図鑑を完成させよう！',
    '町を歩いて、いろんな海老を探してみよう！',
    '集めたキャラクターは図鑑で確認できるぞ！',
    '神社や歴史ある町並みに、海老たちの気配がする…',
    '安全を確かめてからARの冒険を楽しもう！'
  ]);
  var DEFAULT_BGM_ID = 'opening-future-2';

  var state = STATES.INITIAL;
  var root = null;
  var app = null;
  var cta = null;
  var status = null;
  var loader = null;
  var art = null;
  var hero = null;
  var onComplete = null;
  var readyTimer = null;
  var hardReadyTimer = null;
  var exitTimer = null;
  var completed = false;
  var visualSettled = false;
  var minimumDelayElapsed = false;
  var appAriaHidden = null;

  function emit(name, detail) {
    if (EbiAR.events) EbiAR.events.emit('opening:' + name, detail || { state: state });
  }

  function reducedMotion() {
    return typeof global.matchMedia === 'function' && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function setState(next) {
    state = next;
    if (root) root.dataset.state = next.toLowerCase();
  }

  function lockBackground() {
    if (!app) return;
    appAriaHidden = app.getAttribute('aria-hidden');
    app.setAttribute('aria-hidden', 'true');
    if ('inert' in app) app.inert = true;
    global.document.body.classList.add('is-opening-visible');
  }

  function unlockBackground() {
    if (app) {
      if ('inert' in app) app.inert = false;
      if (appAriaHidden === null) app.removeAttribute('aria-hidden');
      else app.setAttribute('aria-hidden', appAriaHidden);
    }
    global.document.body.classList.remove('is-opening-visible');
  }

  function chooseHint() {
    return HINTS[Math.floor(Math.random() * HINTS.length)];
  }

  function openingBgmId() {
    return DEFAULT_BGM_ID;
  }

  function markReady() {
    if (state !== STATES.LOADING) return false;
    global.clearTimeout(readyTimer);
    global.clearTimeout(hardReadyTimer);
    setState(STATES.READY);
    if (status) status.textContent = '冒険の準備ができました';
    if (loader) loader.hidden = true;
    if (cta) {
      cta.disabled = false;
      cta.focus({ preventScroll: true });
    }
    emit('ready');
    return true;
  }

  function cleanupListeners() {
    global.clearTimeout(readyTimer);
    global.clearTimeout(hardReadyTimer);
    global.clearTimeout(exitTimer);
    readyTimer = null;
    hardReadyTimer = null;
    exitTimer = null;
    if (cta) cta.removeEventListener('click', handleStart);
    if (art) {
      art.removeEventListener('load', handleArtLoad);
      art.removeEventListener('error', handleArtError);
    }
    if (hero) hero.removeEventListener('error', handleHeroError);
  }

  function focusCurrentInterface() {
    global.requestAnimationFrame(function () {
      var story = global.document.getElementById('story-dialog');
      if (story && !story.hidden) return;
      var firstTitleAction = global.document.querySelector('#screen-title.active button:not([disabled])');
      if (firstTitleAction) firstTitleAction.focus({ preventScroll: true });
    });
  }

  function finish() {
    if (completed) return false;
    completed = true;
    cleanupListeners();
    if (root) root.remove();
    unlockBackground();
    setState(STATES.FINISHED);
    var callback = onComplete;
    onComplete = null;
    root = null;
    cta = null;
    status = null;
    loader = null;
    art = null;
    hero = null;
    if (typeof callback === 'function') callback();
    focusCurrentInterface();
    emit('complete');
    return true;
  }

  function requestOpeningBgm(unlocked) {
    if (!unlocked || !EbiAR.sound || typeof EbiAR.sound.playBgm !== 'function') return Promise.resolve(false);
    var settings = typeof EbiAR.sound.getSettings === 'function' ? EbiAR.sound.getSettings() : null;
    if (!settings || !settings.bgmEnabled || Number(settings.bgmVolume) <= 0) return Promise.resolve(false);
    try {
      var id = openingBgmId();
      if (!id) return Promise.resolve(false);
      return Promise.resolve(EbiAR.sound.playBgm(id, { fadeMs: 800 })).catch(function () { return false; });
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  function beginExit() {
    if (state !== STATES.READY) return false;
    setState(STATES.EXITING);
    if (cta) cta.disabled = true;
    if (status) status.textContent = '王国の扉を開いています…';
    var unlockPromise = Promise.resolve(false);
    if (EbiAR.sound && typeof EbiAR.sound.unlock === 'function') {
      try { unlockPromise = Promise.resolve(EbiAR.sound.unlock()).catch(function () { return false; }); }
      catch (error) { unlockPromise = Promise.resolve(false); }
    }
    unlockPromise.then(requestOpeningBgm).catch(function () { return false; });
    root.classList.add('is-exiting');
    exitTimer = global.setTimeout(finish, reducedMotion() ? 100 : 650);
    return true;
  }

  function handleStart(event) {
    event.preventDefault();
    beginExit();
  }

  function handleHeroError() {
    if (!root || !hero) return;
    hero.hidden = true;
    root.classList.add('has-visual-fallback');
  }

  function settleVisual(useFormalArt) {
    if (visualSettled || !root) return false;
    visualSettled = true;
    if (useFormalArt) root.classList.add('has-opening-art');
    else {
      if (art) art.hidden = true;
      root.classList.add('uses-opening-fallback');
    }
    if (minimumDelayElapsed) markReady();
    return true;
  }

  function handleArtLoad() {
    if (!art || visualSettled) return;
    if (typeof art.decode === 'function') {
      art.decode().then(function () { settleVisual(true); }).catch(function () { settleVisual(false); });
      return;
    }
    settleVisual(true);
  }

  function handleArtError() {
    settleVisual(false);
  }

  /**
   * Opening Screenを一度だけ初期化する。
   * @param {{onComplete?:Function,readyDelayMs?:number,maxWaitMs?:number}} [options]
   * @returns {boolean}
   */
  function initialize(options) {
    options = options || {};
    if (state !== STATES.INITIAL) return false;
    root = global.document.getElementById('opening-screen');
    app = global.document.getElementById('app');
    if (!root) return false;
    cta = root.querySelector('#opening-start');
    status = root.querySelector('#opening-status');
    loader = root.querySelector('.opening-screen__loader');
    art = root.querySelector('.opening-screen__art');
    hero = root.querySelector('.opening-screen__hero');
    if (!cta || !status) return false;
    onComplete = typeof options.onComplete === 'function' ? options.onComplete : null;
    completed = false;
    visualSettled = !art;
    minimumDelayElapsed = false;
    setState(STATES.LOADING);
    root.hidden = false;
    var initialBgmId = openingBgmId();
    if (initialBgmId) root.dataset.bgmId = initialBgmId;
    else root.removeAttribute('data-bgm-id');
    var hint = root.querySelector('#opening-hint');
    if (hint) hint.textContent = chooseHint();
    cta.disabled = true;
    cta.addEventListener('click', handleStart);
    if (art) {
      art.addEventListener('load', handleArtLoad);
      art.addEventListener('error', handleArtError);
      if (art.complete) global.setTimeout(art.naturalWidth > 0 ? handleArtLoad : handleArtError, 0);
    }
    if (hero) hero.addEventListener('error', handleHeroError);
    lockBackground();
    var readyDelay = Math.max(0, Math.min(1500, Number(options.readyDelayMs) || 80));
    var maxWait = Math.max(readyDelay, Math.min(1500, Number(options.maxWaitMs) || 1500));
    readyTimer = global.setTimeout(function () {
      minimumDelayElapsed = true;
      if (visualSettled) markReady();
    }, readyDelay);
    hardReadyTimer = global.setTimeout(function () {
      if (!visualSettled) settleVisual(false);
      markReady();
    }, maxWait);
    emit('start');
    return true;
  }

  function destroy() {
    if (state === STATES.FINISHED || state === STATES.INITIAL) return false;
    completed = true;
    cleanupListeners();
    if (root) root.remove();
    unlockBackground();
    setState(STATES.FINISHED);
    root = null;
    cta = null;
    status = null;
    loader = null;
    art = null;
    hero = null;
    onComplete = null;
    return true;
  }

  EbiAR.Opening = Object.freeze({
    STATES: STATES,
    HINTS: HINTS,
    getBgmId: openingBgmId,
    initialize: initialize,
    markReady: markReady,
    beginExit: beginExit,
    destroy: destroy,
    getState: function () { return state; }
  });
})(window);
