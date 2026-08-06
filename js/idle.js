/* 海老フライ王国AR v1.0 - キャラクター待機アニメーション管理 */
(function (global) {
  'use strict';

  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var PRESETS = Object.freeze({
    catalog: Object.freeze({ floatMin: 2.8, floatMax: 4.2, floatDistance: 2, sway: false, jump: false }),
    detail: Object.freeze({ floatMin: 3.2, floatMax: 4.2, floatDistance: 3, sway: true, swayMin: 4.2, swayMax: 5.5, swayDistance: 1, swayDegrees: 1, jump: true, jumpMin: 12000, jumpMax: 24000, jumpHeight: 8, jumpDuration: 480 }),
    ar: Object.freeze({ floatMin: 2.8, floatMax: 3.8, floatDistance: 4, sway: true, swayMin: 3.5, swayMax: 4.8, swayDistance: 2, swayDegrees: 1.5, jump: true, jumpMin: 8000, jumpMax: 16000, jumpHeight: 12, jumpDuration: 520 })
  });
  var STYLE_PROPERTIES = Object.freeze([
    '--idle-float-up', '--idle-float-down', '--idle-float-duration', '--idle-float-delay',
    '--idle-sway-left', '--idle-sway-right', '--idle-sway-duration', '--idle-sway-delay',
    '--idle-jump-height', '--idle-jump-duration'
  ]);
  var active = new Map();
  var lifecycleReady = false;
  var motionQuery = null;

  function randomBetween(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function supportsAnimation(element) {
    return !!(element && element.classList && element.style && 'animationName' in element.style);
  }

  function reducedMotion() {
    return !!(motionQuery && motionQuery.matches);
  }

  function isCurrent(record) {
    return !!record && record.running && active.get(record.element) === record;
  }

  function clearTimers(record) {
    record.timers.forEach(function (timer) { global.clearTimeout(timer); });
    record.timers.clear();
  }

  function schedule(record, delay, callback) {
    if (!isCurrent(record) || record.paused) return;
    var timer = global.setTimeout(function () {
      record.timers.delete(timer);
      if (isCurrent(record) && !record.paused) callback();
    }, delay);
    record.timers.add(timer);
  }

  function scheduleJump(record) {
    if (!record.options.jump) return;
    var wait = Math.round(randomBetween(record.options.jumpMin, record.options.jumpMax));
    schedule(record, wait, function () {
      record.jumpElement.classList.add('is-idle-jumping');
      schedule(record, record.options.jumpDuration, function () {
        record.jumpElement.classList.remove('is-idle-jumping');
        scheduleJump(record);
      });
    });
  }

  function configure(element, options) {
    var floatDuration = randomBetween(options.floatMin, options.floatMax);
    element.style.setProperty('--idle-float-up', -options.floatDistance + 'px');
    element.style.setProperty('--idle-float-down', options.floatDistance + 'px');
    element.style.setProperty('--idle-float-duration', floatDuration.toFixed(2) + 's');
    element.style.setProperty('--idle-float-delay', (-Math.random() * floatDuration).toFixed(2) + 's');
    element.classList.toggle('is-idle-sway-enabled', options.sway);
    if (options.sway) {
      var swayDuration = randomBetween(options.swayMin, options.swayMax);
      element.style.setProperty('--idle-sway-left', 'translateX(' + -options.swayDistance + 'px) rotate(' + -options.swayDegrees + 'deg)');
      element.style.setProperty('--idle-sway-right', 'translateX(' + options.swayDistance + 'px) rotate(' + options.swayDegrees + 'deg)');
      element.style.setProperty('--idle-sway-duration', swayDuration.toFixed(2) + 's');
      element.style.setProperty('--idle-sway-delay', (-Math.random() * swayDuration).toFixed(2) + 's');
    }
    if (options.jump) {
      element.style.setProperty('--idle-jump-height', -options.jumpHeight + 'px');
      element.style.setProperty('--idle-jump-duration', options.jumpDuration + 'ms');
    }
  }

  function reset(element) {
    if (!element || !element.classList || !element.style) return;
    element.classList.remove('is-idle-active', 'is-idle-paused', 'is-idle-sway-enabled');
    var jump = element.querySelector && element.querySelector('.character-idle-jump');
    if (jump) jump.classList.remove('is-idle-jumping');
    STYLE_PROPERTIES.forEach(function (name) { element.style.removeProperty(name); });
    if (element.removeAttribute) element.removeAttribute('data-idle-mode');
  }

  /**
   * 追加アセットを必要としないため、安全なno-opとして完了する。
   * @returns {Promise<Array>} 空の読込結果
   */
  function preload() {
    ensureLifecycleListeners();
    return Promise.resolve([]);
  }

  /**
   * 指定した専用ラッパーの待機アニメーションを開始する。
   * @param {HTMLElement} element .character-idle要素
   * @param {{mode?: 'catalog'|'detail'|'ar'}} [options] 表示画面別設定
   * @returns {boolean} 開始要求を受け付けた場合true
   */
  function start(element, options) {
    if (!supportsAnimation(element)) return false;
    stop(element);
    ensureLifecycleListeners();
    reset(element);
    if (reducedMotion()) return false;
    var mode = options && PRESETS[options.mode] ? options.mode : 'catalog';
    var preset = PRESETS[mode];
    var jumpElement = element.querySelector('.character-idle-jump');
    if (!jumpElement) return false;
    var record = {
      element: element,
      jumpElement: jumpElement,
      options: preset,
      running: true,
      paused: false,
      timers: new Set()
    };
    configure(element, preset);
    element.dataset.idleMode = mode;
    element.classList.add('is-idle-active');
    active.set(element, record);
    scheduleJump(record);
    return true;
  }

  /** 指定した要素のtransformとタイマーだけを解除する。 */
  function stop(element) {
    var record = active.get(element);
    if (!record) { reset(element); return false; }
    record.running = false;
    clearTimers(record);
    active.delete(element);
    reset(element);
    return true;
  }

  /** 全待機アニメーションを通常位置で一時停止する。 */
  function pauseAll() {
    active.forEach(function (record) {
      clearTimers(record);
      record.paused = true;
      record.jumpElement.classList.remove('is-idle-jumping');
      record.element.classList.add('is-idle-paused');
    });
  }

  /** 接続中の要素だけを重複タイマーなしで再開する。 */
  function resumeAll() {
    if (reducedMotion()) return;
    Array.from(active.values()).forEach(function (record) {
      if ('isConnected' in record.element && !record.element.isConnected) { stop(record.element); return; }
      if (!record.paused) return;
      record.paused = false;
      record.element.classList.remove('is-idle-paused');
      scheduleJump(record);
    });
  }

  function handleVisibilityChange() {
    if (global.document && global.document.hidden) pauseAll();
    else resumeAll();
  }

  function handlePageHide(event) {
    if (event && event.persisted) pauseAll();
    else destroy();
  }

  function handlePageShow(event) {
    if (event && event.persisted) resumeAll();
  }

  function handleMotionChange() {
    if (reducedMotion()) pauseAll();
    else resumeAll();
  }

  function ensureLifecycleListeners() {
    if (lifecycleReady) return;
    lifecycleReady = true;
    if (typeof global.matchMedia === 'function') motionQuery = global.matchMedia('(prefers-reduced-motion: reduce)');
    if (global.document) global.document.addEventListener('visibilitychange', handleVisibilityChange);
    global.addEventListener('pagehide', handlePageHide);
    global.addEventListener('pageshow', handlePageShow);
    if (motionQuery && typeof motionQuery.addEventListener === 'function') motionQuery.addEventListener('change', handleMotionChange);
    else if (motionQuery && typeof motionQuery.addListener === 'function') motionQuery.addListener(handleMotionChange);
  }

  function removeLifecycleListeners() {
    if (!lifecycleReady) return;
    lifecycleReady = false;
    if (global.document) global.document.removeEventListener('visibilitychange', handleVisibilityChange);
    global.removeEventListener('pagehide', handlePageHide);
    global.removeEventListener('pageshow', handlePageShow);
    if (motionQuery && typeof motionQuery.removeEventListener === 'function') motionQuery.removeEventListener('change', handleMotionChange);
    else if (motionQuery && typeof motionQuery.removeListener === 'function') motionQuery.removeListener(handleMotionChange);
    motionQuery = null;
  }

  /** 全要素のtransform、タイマー、ライフサイクル購読を解除する。 */
  function destroy() {
    Array.from(active.keys()).forEach(stop);
    active.clear();
    removeLifecycleListeners();
  }

  EbiAR.idle = Object.freeze({ preload: preload, start: start, stop: stop, pauseAll: pauseAll, resumeAll: resumeAll, destroy: destroy });
  ensureLifecycleListeners();
})(window);
