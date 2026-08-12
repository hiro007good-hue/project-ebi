/* 海老フライ王国AR v1.0 - AudioManager */
(function (global) {
  'use strict';

  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var DEFAULT_SETTINGS = Object.freeze({
    bgmEnabled: true,
    seEnabled: true,
    bgmVolume: 0.6,
    seVolume: 0.8
  });
  var DEFAULT_ASSETS = Object.freeze({
    bgm: Object.freeze({
      adventure: 'sounds/bgm-adventure.mp3',
      'adventure-theme': 'sounds/bgm-adventure.mp3'
    }),
    se: Object.freeze({
      characterDiscovery: 'sounds/se-character-found.mp3',
      'character-discovery': 'sounds/se-character-found.mp3',
      captureSuccess: 'sounds/se-capture-success.mp3',
      'capture-success': 'sounds/se-capture-success.mp3',
      cameraShutter: 'sounds/se-camera-shutter.mp3',
      'camera-shutter': 'sounds/se-camera-shutter.mp3',
      achievementUnlock: 'sounds/se-achievement-unlock.mp3',
      'achievement-unlock': 'sounds/se-achievement-unlock.mp3',
      buttonTap: 'sounds/se-button.mp3',
      'button-tap': 'sounds/se-button.mp3',
      spotArrived: 'sounds/se-spot-arrived.mp3',
      levelUp: 'sounds/se-level-up.mp3',
      couponReceived: 'sounds/se-coupon-received.mp3'
    })
  });
  var assets = { bgm: Object.assign({}, DEFAULT_ASSETS.bgm), se: Object.assign({}, DEFAULT_ASSETS.se) };
  var settings = Object.assign({}, DEFAULT_SETTINGS);
  var masterVolume = 1;
  var currentBgm = null;
  var currentBgmId = null;
  var pendingBgmId = null;
  var resumeBgmOnVisible = false;
  var unlocked = false;
  var destroyed = false;
  var fadeTimers = new WeakMap();
  var activeSe = new Set();
  var subscriptions = [];
  var gestureHandler = null;
  var buttonHandler = null;
  var visibilityHandler = null;

  function clamp(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
  }
  function canUseAudio() { return typeof global.Audio === 'function'; }
  function emit(name, detail) { if (EbiAR.events) EbiAR.events.emit(name, detail); }
  function audioError(id, error) { emit('audio:error', { id: id, error: error }); }
  function channelVolume(channel) { return masterVolume * (channel === 'bgm' ? settings.bgmVolume : settings.seVolume); }
  function channelEnabled(channel) { return channel === 'bgm' ? settings.bgmEnabled : settings.seEnabled; }

  /** 必要になった時だけAudio要素を生成する。失敗はゲーム進行へ伝播させない。 */
  function createAudio(source, loop) {
    if (!canUseAudio() || !source) return null;
    var audio;
    try { audio = new global.Audio(); }
    catch (error) { audioError(source, error); return null; }
    audio.preload = 'none';
    audio.loop = !!loop;
    audio.src = source;
    audio.addEventListener('error', function () { audioError(source, new Error('audio_load_failed')); }, { once: true });
    return audio;
  }
  function attemptPlay(audio, id) {
    if (!audio) return Promise.resolve(false);
    var result;
    try { result = audio.play(); }
    catch (error) { audioError(id, error); return Promise.resolve(false); }
    return Promise.resolve(result).then(function () {
      emit('audio:played', { id: id });
      return true;
    }).catch(function (error) {
      audioError(id, error);
      return false;
    });
  }
  function clearFade(audio) {
    var timer = fadeTimers.get(audio);
    if (timer) global.clearInterval(timer);
    fadeTimers.delete(audio);
  }
  function releaseSe(audio) {
    if (!audio) return;
    clearFade(audio);
    activeSe.delete(audio);
    try { audio.removeAttribute('src'); audio.load(); } catch (error) { /* 解放失敗はゲームへ影響させない。 */ }
  }

  /** @returns {{bgmEnabled:boolean,seEnabled:boolean,bgmVolume:number,seVolume:number}} */
  function getSettings() { return Object.freeze(Object.assign({}, settings)); }

  /** 旧Saveに項目がない場合も既定値で安全に補完する。 */
  function normalizeSettings(value) {
    value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      bgmEnabled: typeof value.bgmEnabled === 'boolean' ? value.bgmEnabled : DEFAULT_SETTINGS.bgmEnabled,
      seEnabled: typeof value.seEnabled === 'boolean' ? value.seEnabled : DEFAULT_SETTINGS.seEnabled,
      bgmVolume: clamp(value.bgmVolume, DEFAULT_SETTINGS.bgmVolume),
      seVolume: clamp(value.seVolume, DEFAULT_SETTINGS.seVolume)
    };
  }

  /** @param {object} value Audio設定 */
  function applySettings(value, options) {
    options = options || {};
    settings = normalizeSettings(value);
    if (currentBgm) currentBgm.volume = settings.bgmEnabled ? channelVolume('bgm') : 0;
    if (!settings.bgmEnabled && currentBgm && !currentBgm.paused) currentBgm.pause();
    if (settings.bgmEnabled && options.resume !== false && currentBgm && currentBgm.paused && !global.document?.hidden && unlocked) attemptPlay(currentBgm, currentBgmId);
    if (!settings.seEnabled) activeSe.forEach(function (audio) { try { audio.pause(); } finally { releaseSe(audio); } });
    if (!options.silent) emit('audio:settings-changed', getSettings());
    return getSettings();
  }

  /** 指定したAudio要素をフェードする。 */
  function fade(audio, target, durationMs) {
    if (!audio) return Promise.resolve(false);
    clearFade(audio);
    target = clamp(target, 0);
    durationMs = Math.max(0, Number(durationMs) || 0);
    if (durationMs === 0) { audio.volume = target; return Promise.resolve(true); }
    var start = audio.volume;
    var startedAt = Date.now();
    return new Promise(function (resolve) {
      var timer = global.setInterval(function () {
        var progress = Math.min(1, (Date.now() - startedAt) / durationMs);
        audio.volume = start + (target - start) * progress;
        if (progress >= 1) { clearFade(audio); resolve(true); }
      }, 40);
      fadeTimers.set(audio, timer);
    });
  }

  /** iPhone Safari/PWAのユーザー操作内で再生制限を解除する。 */
  function unlock() {
    if (!canUseAudio()) return Promise.resolve(false);
    unlocked = true;
    if (!pendingBgmId || !settings.bgmEnabled) return Promise.resolve(true);
    var id = pendingBgmId;
    pendingBgmId = null;
    return playBgm(id);
  }

  /** BGMを遅延生成しループ再生する。ユーザー操作前は予約のみ行う。 */
  function playBgm(id, options) {
    options = options || {};
    var source = assets.bgm[id];
    if (!source || !canUseAudio() || destroyed) return Promise.resolve(false);
    if (!settings.bgmEnabled || global.document?.hidden) { pendingBgmId = id; return Promise.resolve(false); }
    if (!unlocked) { pendingBgmId = id; emit('audio:blocked', { id: id, reason: 'user_gesture_required' }); return Promise.resolve(false); }
    if (currentBgmId === id && currentBgm) return attemptPlay(currentBgm, id);
    stopBgm();
    currentBgm = createAudio(source, true);
    currentBgmId = id;
    if (!currentBgm) return Promise.resolve(false);
    currentBgm.volume = options.fadeMs ? 0 : channelVolume('bgm');
    return attemptPlay(currentBgm, id).then(function (played) {
      if (played && options.fadeMs) return fade(currentBgm, channelVolume('bgm'), options.fadeMs).then(function () { return true; });
      return played;
    });
  }
  function stopBgm() {
    if (!currentBgm) { currentBgmId = null; return false; }
    clearFade(currentBgm);
    try { currentBgm.pause(); currentBgm.currentTime = 0; }
    catch (error) { /* 停止失敗はゲームへ影響させない。 */ }
    currentBgm = null;
    currentBgmId = null;
    resumeBgmOnVisible = false;
    return true;
  }
  /** SEを必要時だけ生成する。複数SEの同時再生に対応する。 */
  function playSe(id, options) {
    options = options || {};
    var source = assets.se[id];
    if (!source || !canUseAudio() || !unlocked || !channelEnabled('se') || destroyed) return Promise.resolve(false);
    var audio = createAudio(source, false);
    if (!audio) return Promise.resolve(false);
    audio.volume = clamp(options.volume, channelVolume('se'));
    activeSe.add(audio);
    audio.addEventListener('ended', function () { releaseSe(audio); }, { once: true });
    return attemptPlay(audio, id).then(function (played) { if (!played) releaseSe(audio); return played; });
  }

  function configure(nextAssets) {
    nextAssets = nextAssets || {};
    if (nextAssets.bgm) assets.bgm = Object.assign({}, assets.bgm, nextAssets.bgm);
    if (nextAssets.se) assets.se = Object.assign({}, assets.se, nextAssets.se);
  }
  function setBgmEnabled(value) { return applySettings(Object.assign({}, settings, { bgmEnabled: !!value })); }
  function setSeEnabled(value) { return applySettings(Object.assign({}, settings, { seEnabled: !!value })); }
  function setBgmVolume(value) { return applySettings(Object.assign({}, settings, { bgmVolume: clamp(value, settings.bgmVolume) })); }
  function setSeVolume(value) { return applySettings(Object.assign({}, settings, { seVolume: clamp(value, settings.seVolume) })); }
  function setMasterVolume(value) {
    masterVolume = clamp(value, masterVolume);
    if (currentBgm) currentBgm.volume = settings.bgmEnabled ? channelVolume('bgm') : 0;
    return masterVolume;
  }
  function getState() {
    return Object.freeze(Object.assign({
      currentBgmId: currentBgmId,
      unlocked: unlocked,
      pendingBgmId: pendingBgmId,
      activeSeCount: activeSe.size,
      pausedByVisibility: resumeBgmOnVisible,
      masterVolume: masterVolume,
      muted: !settings.bgmEnabled && !settings.seEnabled
    }, settings));
  }

  /** EventBusのゲームイベントを各SEへ一度だけ接続する。 */
  function connectEvents() {
    if (!EbiAR.events || subscriptions.length) return;
    subscriptions.push(EbiAR.events.on('ar:discovered', function () { playSe('character-discovery'); }));
    subscriptions.push(EbiAR.events.on('ar:captured', function () { playSe('capture-success'); }));
    subscriptions.push(EbiAR.events.on('photo:captured', function () { playSe('camera-shutter'); }));
    subscriptions.push(EbiAR.events.on('achievement:unlock', function () { playSe('achievement-unlock'); }));
    subscriptions.push(EbiAR.events.on('gps:spot-arrived', function () { playSe('spotArrived'); }));
    subscriptions.push(EbiAR.events.on('character:levelup', function () { playSe('levelUp'); }));
    subscriptions.push(EbiAR.events.on('coupon:acquired', function () { playSe('couponReceived'); }));
    subscriptions.push(EbiAR.events.on('save:loaded', function (data) { applySettings(data && data.audioSettings, { silent: true, resume: false }); }));
    subscriptions.push(EbiAR.events.on('save:imported', function (data) { applySettings(data && data.audioSettings, { silent: true }); }));
    subscriptions.push(EbiAR.events.on('save:reset', function () { applySettings(DEFAULT_SETTINGS, { silent: true }); }));
  }
  function disconnectEvents() { subscriptions.forEach(function (off) { off(); }); subscriptions = []; }

  function installLifecycle() {
    if (!global.document || visibilityHandler) return;
    visibilityHandler = function () {
      if (global.document.hidden) {
        if (currentBgm && !currentBgm.paused) { resumeBgmOnVisible = true; currentBgm.pause(); }
        return;
      }
      if (resumeBgmOnVisible && currentBgm && settings.bgmEnabled && unlocked) {
        resumeBgmOnVisible = false;
        attemptPlay(currentBgm, currentBgmId);
      }
    };
    global.document.addEventListener('visibilitychange', visibilityHandler);
  }
  function installGestureUnlock() {
    if (!global.document || gestureHandler) return;
    gestureHandler = function () {
      unlock();
      global.document.removeEventListener('pointerdown', gestureHandler, true);
      global.document.removeEventListener('keydown', gestureHandler, true);
      gestureHandler = null;
    };
    buttonHandler = function (event) {
      if (event.target.closest && event.target.closest('button,[data-action]')) playSe('button-tap');
    };
    global.document.addEventListener('pointerdown', gestureHandler, true);
    global.document.addEventListener('keydown', gestureHandler, true);
    global.document.addEventListener('click', buttonHandler, true);
  }
  function destroy() {
    destroyed = true;
    disconnectEvents();
    stopBgm();
    activeSe.forEach(function (audio) { try { audio.pause(); } finally { releaseSe(audio); } });
    if (global.document && gestureHandler) {
      global.document.removeEventListener('pointerdown', gestureHandler, true);
      global.document.removeEventListener('keydown', gestureHandler, true);
    }
    if (global.document && buttonHandler) global.document.removeEventListener('click', buttonHandler, true);
    if (global.document && visibilityHandler) global.document.removeEventListener('visibilitychange', visibilityHandler);
    gestureHandler = null; buttonHandler = null; visibilityHandler = null;
  }

  var api = Object.freeze({
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    configure: configure,
    unlock: unlock,
    playBgm: playBgm,
    stopBgm: stopBgm,
    playSe: playSe,
    fade: fade,
    applySettings: applySettings,
    getSettings: getSettings,
    setBgmEnabled: setBgmEnabled,
    setSeEnabled: setSeEnabled,
    setBgmVolume: setBgmVolume,
    setSeVolume: setSeVolume,
    setMasterVolume: setMasterVolume,
    setMuted: function (value) {
      var muted = value === undefined ? (settings.bgmEnabled || settings.seEnabled) : !!value;
      applySettings(Object.assign({}, settings, { bgmEnabled: !muted, seEnabled: !muted }));
      return muted;
    },
    toggleMuted: function () { var muted = settings.bgmEnabled || settings.seEnabled; api.setMuted(muted); return muted; },
    getState: getState,
    connectEvents: connectEvents,
    disconnectEvents: disconnectEvents,
    destroy: destroy
  });

  EbiAR.AudioManager = api;
  EbiAR.sound = api;
  connectEvents();
  installGestureUnlock();
  installLifecycle();
})(window);
