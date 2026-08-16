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
      characterDiscovery: 'sounds/se_discover.mp3',
      'character-discovery': 'sounds/se_discover.mp3',
      captureSuccess: 'sounds/se_capture.mp3',
      'capture-success': 'sounds/se_capture.mp3',
      achievementUnlock: 'sounds/se_levelup.mp3',
      'achievement-unlock': 'sounds/se_levelup.mp3',
      levelUp: 'sounds/se_levelup.mp3',
      'level-up': 'sounds/se_levelup.mp3',
      pointEarned: 'sounds/se_point.mp3',
      'point-earned': 'sounds/se_point.mp3',
      buttonTap: 'sounds/se_click.mp3',
      'button-tap': 'sounds/se_click.mp3',
      'discover-hino-gold': 'sounds/ch_golden_ebi.mp3',
      'discover-castle-crisp': 'sounds/ch_honoo_shogun_ebi.mp3',
      'discover-yamamori': 'sounds/ch_ninja_ebi.mp3',
      'discover-satoyama-knight': 'sounds/ch_ryujin_ebi.mp3',
      'discover-queen-tartar': 'sounds/ch_niji_ebi.mp3',
      spotArrived: 'sounds/se-spot-arrived.mp3',
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
  var seEntries = new Map();
  var seEntryByAudio = new WeakMap();
  var currentBgmEntry = null;
  var subscriptions = [];
  var gestureHandler = null;
  var buttonHandler = null;
  var visibilityHandler = null;
  var lastPlayedAt = new Map();
  var SPECIAL_DISCOVERY_SE = Object.freeze({
    'hino-gold': 'discover-hino-gold',
    'castle-crisp': 'discover-castle-crisp',
    'yamamori': 'discover-yamamori',
    'satoyama-knight': 'discover-satoyama-knight',
    'queen-tartar': 'discover-queen-tartar'
  });

  function clamp(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
  }
  function canUseAudio() { return typeof global.Audio === 'function'; }
  function emit(name, detail) { if (EbiAR.events) EbiAR.events.emit(name, detail); }
  function audioError(id, error) { emit('audio:error', { id: id, error: error }); }
  function channelVolume(channel) { return masterVolume * (channel === 'bgm' ? settings.bgmVolume : settings.seVolume); }
  function channelEnabled(channel) { return channel === 'bgm' ? settings.bgmEnabled : settings.seEnabled; }

  function mediaLoadError(audio) {
    var error = new Error(audio && audio.error && audio.error.message || 'audio_load_failed');
    if (audio && audio.error) error.code = audio.error.code;
    return error;
  }

  /** 初回要求時だけ明示loadし、全要求で同じREADY判定を共有する。 */
  function createAudioEntry(source, loop) {
    if (!canUseAudio() || !source) return null;
    var audio;
    try { audio = new global.Audio(); }
    catch (error) { audioError(source, error); return null; }
    var entry = { audio: audio, source: source, state: 'LOADING', ready: null, cancel: null, pendingPlay: null };
    entry.ready = new Promise(function (resolve) {
      var settled = false;
      function cleanup() {
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('abort', onError);
      }
      function settle(ready, error) {
        if (settled) return;
        settled = true;
        entry.state = ready ? 'READY' : 'ERROR';
        cleanup();
        if (error) audioError(source, error);
        resolve(ready);
      }
      function onCanPlay() {
        if (!audio.error && audio.readyState >= 3) settle(true);
      }
      function onError() { settle(false, mediaLoadError(audio)); }
      entry.cancel = function () { settle(false); };
      audio.addEventListener('canplay', onCanPlay);
      audio.addEventListener('error', onError);
      audio.addEventListener('abort', onError);
      audio.preload = 'auto';
      audio.loop = !!loop;
      audio.src = source;
      try {
        audio.load();
        if (!audio.error && audio.readyState >= 3) settle(true);
      } catch (error) {
        settle(false, error);
      }
    });
    return entry;
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
  function releaseSe(audio, discard) {
    if (!audio) return;
    clearFade(audio);
    activeSe.delete(audio);
    if (!discard && seEntryByAudio.has(audio)) {
      try { audio.currentTime = 0; } catch (error) { /* READY音源は次回要求で再利用する。 */ }
      return;
    }
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
    if (currentBgmId === id && currentBgm && currentBgmEntry) {
      return currentBgmEntry.ready.then(function (ready) {
        return ready && currentBgmEntry && currentBgmEntry.state === 'READY' ? attemptPlay(currentBgm, id) : false;
      });
    }
    stopBgm();
    currentBgmEntry = createAudioEntry(source, true);
    currentBgm = currentBgmEntry && currentBgmEntry.audio;
    currentBgmId = id;
    if (!currentBgm) return Promise.resolve(false);
    var requestedEntry = currentBgmEntry;
    return requestedEntry.ready.then(function (ready) {
      if (!ready || currentBgmEntry !== requestedEntry || !settings.bgmEnabled || global.document?.hidden || destroyed) return false;
      currentBgm.volume = options.fadeMs ? 0 : channelVolume('bgm');
      return attemptPlay(currentBgm, id);
    }).then(function (played) {
      if (played && options.fadeMs) return fade(currentBgm, channelVolume('bgm'), options.fadeMs).then(function () { return true; });
      return played;
    });
  }
  function stopBgm() {
    if (!currentBgm) { currentBgmId = null; return false; }
    clearFade(currentBgm);
    if (currentBgmEntry && currentBgmEntry.cancel) currentBgmEntry.cancel();
    try { currentBgm.pause(); currentBgm.currentTime = 0; }
    catch (error) { /* 停止失敗はゲームへ影響させない。 */ }
    try { currentBgm.removeAttribute('src'); currentBgm.load(); } catch (error) { /* 解放失敗はゲームへ影響させない。 */ }
    currentBgm = null;
    currentBgmEntry = null;
    currentBgmId = null;
    resumeBgmOnVisible = false;
    return true;
  }
  function playReadySe(entry, id, options) {
    var audio = entry.audio;
    if (entry.state !== 'READY' || !channelEnabled('se') || destroyed) return Promise.resolve(false);
    try { audio.currentTime = 0; } catch (error) { audioError(id, error); return Promise.resolve(false); }
    audio.volume = clamp(options.volume, channelVolume('se'));
    activeSe.add(audio);
    return attemptPlay(audio, id).then(function (played) { if (!played) releaseSe(audio); return played; });
  }

  /** SEを初回要求時だけloadし、READY後は同じAudio要素を再利用する。 */
  function playSe(id, options) {
    options = options || {};
    var source = assets.se[id];
    if (!source || !canUseAudio() || !unlocked || !channelEnabled('se') || destroyed) return Promise.resolve(false);
    var cooldownKey = String(options.cooldownKey || id);
    var cooldownMs = Math.max(0, Number(options.cooldownMs) || 0);
    var timestamp = Date.now();
    if (cooldownMs && timestamp - (lastPlayedAt.get(cooldownKey) || 0) < cooldownMs) return Promise.resolve(false);
    lastPlayedAt.set(cooldownKey, timestamp);
    var entry = seEntries.get(source);
    if (!entry) {
      entry = createAudioEntry(source, false);
      if (!entry) return Promise.resolve(false);
      entry.endedHandler = function () { releaseSe(entry.audio); };
      entry.audio.addEventListener('ended', entry.endedHandler);
      seEntries.set(source, entry);
      seEntryByAudio.set(entry.audio, entry);
    }
    if (entry.state === 'ERROR') return Promise.resolve(false);
    if (entry.state === 'READY') return playReadySe(entry, id, options);
    if (entry.pendingPlay) return entry.pendingPlay;
    entry.pendingPlay = entry.ready.then(function (ready) {
      return ready ? playReadySe(entry, id, options) : false;
    }).then(function (played) {
      entry.pendingPlay = null;
      return played;
    }, function (error) {
      entry.pendingPlay = null;
      audioError(id, error);
      return false;
    });
    return entry.pendingPlay;
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

  function discoverySe(detail) {
    var id = detail && detail.character && detail.character.id;
    return SPECIAL_DISCOVERY_SE[id] || 'character-discovery';
  }

  /** EventBusのゲームイベントを各SEへ一度だけ接続する。 */
  function connectEvents() {
    if (!EbiAR.events || subscriptions.length) return;
    subscriptions.push(EbiAR.events.on('ar:discovered', function (detail) { playSe(discoverySe(detail), { cooldownKey: 'character-discovery', cooldownMs: 250 }); }));
    subscriptions.push(EbiAR.events.on('ar:captured', function () { playSe('capture-success'); }));
    subscriptions.push(EbiAR.events.on('achievement:unlock', function () { playSe('achievement-unlock', { cooldownKey: 'level-achievement', cooldownMs: 600 }); }));
    subscriptions.push(EbiAR.events.on('game:points-changed', function () { playSe('point-earned', { cooldownKey: 'point-earned', cooldownMs: 180 }); }));
    subscriptions.push(EbiAR.events.on('gps:spot-arrived', function () { playSe('spotArrived'); }));
    subscriptions.push(EbiAR.events.on('character:levelup', function () { playSe('level-up', { cooldownKey: 'level-achievement', cooldownMs: 600 }); }));
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
      if (!event.target.closest) return;
      var control = event.target.closest('button,[data-action]');
      if (!control || control.closest('#ar-capture,#ar-photo,#ar-search,[data-achievement-claim]')) return;
      if (!unlocked) unlock();
      playSe('button-tap');
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
    seEntries.forEach(function (entry) {
      if (entry.cancel) entry.cancel();
      if (entry.endedHandler) entry.audio.removeEventListener('ended', entry.endedHandler);
      try { entry.audio.pause(); } finally { releaseSe(entry.audio, true); }
    });
    seEntries.clear();
    if (global.document && gestureHandler) {
      global.document.removeEventListener('pointerdown', gestureHandler, true);
      global.document.removeEventListener('keydown', gestureHandler, true);
    }
    if (global.document && buttonHandler) global.document.removeEventListener('click', buttonHandler, true);
    if (global.document && visibilityHandler) global.document.removeEventListener('visibilitychange', visibilityHandler);
    gestureHandler = null; buttonHandler = null; visibilityHandler = null;
    lastPlayedAt.clear();
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
