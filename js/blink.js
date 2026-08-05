/* 海老フライ王国AR v1.0 - キャラクターまばたき管理 */
(function (global) {
  'use strict';

  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var MIN_INTERVAL_MS = 3000;
  var MAX_INTERVAL_MS = 6000;
  var CLOSED_DURATION_MS = 120;
  var DOUBLE_BLINK_DELAY_MS = 100;
  var DOUBLE_BLINK_DURATION_MS = 90;
  var DOUBLE_BLINK_RATE = 0.25;
  var active = new Map();
  var preloads = new Map();
  var warnedMissing = new Set();
  var lifecycleReady = false;
  var motionQuery = null;

  function definitionFor(characterId) {
    if (!characterId || !/^[a-z0-9-]+$/.test(characterId)) return null;
    return EbiAR.character && typeof EbiAR.character.getById === 'function'
      ? EbiAR.character.getById(characterId)
      : null;
  }

  function pathsFor(characterId) {
    var definition = definitionFor(characterId);
    var normal = definition && definition.image
      ? definition.image
      : 'images/characters/' + characterId + '.webp';
    var blink = normal.replace(/\.webp(?=([?#]|$))/i, '-blink.webp');
    if (blink === normal) blink = 'images/characters/' + characterId + '-blink.webp';
    return { normal: normal, blink: blink };
  }

  function warnMissing(characterId, path) {
    if (warnedMissing.has(characterId)) return;
    warnedMissing.add(characterId);
    console.warn('[EbiAR Blink] 閉眼画像を読み込めないため通常画像を使用します:', path);
  }

  function loadImage(path) {
    return new Promise(function (resolve) {
      if (typeof global.Image !== 'function') { resolve(false); return; }
      var image = new global.Image();
      var settled = false;
      function finish(loaded) {
        if (settled) return;
        settled = true;
        image.onload = null;
        image.onerror = null;
        resolve(loaded);
      }
      image.decoding = 'async';
      image.onload = function () { finish(true); };
      image.onerror = function () { finish(false); };
      image.src = path;
      if (image.complete && image.naturalWidth > 0) finish(true);
    });
  }

  function preloadCharacter(characterId) {
    if (preloads.has(characterId)) return preloads.get(characterId);
    var paths = pathsFor(characterId);
    var promise = Promise.all([loadImage(paths.normal), loadImage(paths.blink)]).then(function (loaded) {
      var result = Object.freeze({
        characterId: characterId,
        normal: paths.normal,
        blink: paths.blink,
        normalAvailable: loaded[0],
        blinkAvailable: loaded[1]
      });
      if (!result.blinkAvailable) warnMissing(characterId, paths.blink);
      return result;
    });
    preloads.set(characterId, promise);
    return promise;
  }

  /** 通常画像と閉眼画像を起動時に読み込み、結果を返す。 */
  function preload() {
    ensureLifecycleListeners();
    var catalog = EbiAR.character && Array.isArray(EbiAR.character.catalog)
      ? EbiAR.character.catalog
      : [];
    return Promise.all(catalog.map(function (definition) {
      return preloadCharacter(definition.id);
    }));
  }

  function reducedMotion() {
    return !!(motionQuery && motionQuery.matches);
  }

  function isCurrent(record) {
    return !!record && record.running && active.get(record.image) === record;
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

  function show(record, path) {
    if (isCurrent(record) && record.image.src !== path) record.image.src = path;
  }

  function scheduleNext(record) {
    var wait = MIN_INTERVAL_MS + Math.floor(Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS + 1));
    schedule(record, wait, function () {
      show(record, record.blink);
      schedule(record, CLOSED_DURATION_MS, function () {
        show(record, record.normal);
        if (Math.random() >= DOUBLE_BLINK_RATE) { scheduleNext(record); return; }
        schedule(record, DOUBLE_BLINK_DELAY_MS, function () {
          show(record, record.blink);
          schedule(record, DOUBLE_BLINK_DURATION_MS, function () {
            show(record, record.normal);
            scheduleNext(record);
          });
        });
      });
    });
  }

  /**
   * 指定した画像要素のまばたきを開始する。
   * @param {HTMLImageElement} imgElement 表示中の画像要素
   * @param {string} characterId character.jsの既存ID
   * @returns {boolean} 開始要求を受け付けた場合true
   */
  function start(imgElement, characterId) {
    if (!imgElement || typeof imgElement.src !== 'string' || !definitionFor(characterId)) return false;
    stop(imgElement);
    ensureLifecycleListeners();
    if (reducedMotion()) return false;
    var paths = pathsFor(characterId);
    var record = {
      image: imgElement,
      characterId: characterId,
      normal: paths.normal,
      blink: paths.blink,
      running: true,
      paused: false,
      timers: new Set()
    };
    active.set(imgElement, record);
    imgElement.src = paths.normal;
    preloadCharacter(characterId).then(function (result) {
      if (!isCurrent(record) || !result.normalAvailable || !result.blinkAvailable || reducedMotion()) return;
      scheduleNext(record);
    }).catch(function () {
      warnMissing(characterId, paths.blink);
    });
    return true;
  }

  /** 指定した画像要素だけを停止し、通常画像へ戻す。 */
  function stop(imgElement) {
    var record = active.get(imgElement);
    if (!record) return false;
    record.running = false;
    clearTimers(record);
    active.delete(imgElement);
    if (record.image.src !== record.normal) record.image.src = record.normal;
    return true;
  }

  function pauseAll() {
    active.forEach(function (record) {
      clearTimers(record);
      record.paused = true;
      if (record.image.src !== record.normal) record.image.src = record.normal;
    });
  }

  function resumeAll() {
    if (reducedMotion()) return;
    Array.from(active.values()).forEach(function (record) {
      if ('isConnected' in record.image && !record.image.isConnected) { stop(record.image); return; }
      if (!record.paused) return;
      record.paused = false;
      scheduleNext(record);
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

  /** 全画像のタイマーとライフサイクルイベントを解除する。 */
  function destroy() {
    Array.from(active.keys()).forEach(stop);
    active.clear();
    preloads.clear();
    removeLifecycleListeners();
  }

  var BlinkManager = Object.freeze({ preload: preload, start: start, stop: stop, destroy: destroy });
  EbiAR.Blink = BlinkManager;
  ensureLifecycleListeners();
  preload().catch(function (error) { console.warn('[EbiAR Blink] 事前読み込みに失敗しました。', error); });
})(window);
