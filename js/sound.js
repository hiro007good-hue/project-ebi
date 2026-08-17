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
  var seBufferEntries = new Map();
  var seAudioContext = null;
  var seUnlockPromise = null;
  var seUnlockAttempt = null;
  var activationSequence = 0;
  var currentActivationId = 0;
  var seContextFailed = false;
  var currentBgmEntry = null;
  var subscriptions = [];
  var gestureHandler = null;
  var buttonHandler = null;
  var visibilityHandler = null;
  var lastPlayedAt = new Map();
  var RESUME_STALL_MS = 1000;
  var RESUME_STATE_POLL_MS = 50;
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
  function webAudioConstructor() { return global.AudioContext || global.webkitAudioContext; }
  function canUseWebAudio() { return typeof webAudioConstructor() === 'function' && typeof global.fetch === 'function'; }
  function emit(name, detail) { if (EbiAR.events) EbiAR.events.emit(name, detail); }
  function audioError(id, error, stage) {
    emit('audio:error', { id: id, error: error, stage: stage || id || 'unknown' });
  }
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
  function releaseSe(playback) {
    if (!playback) return;
    activeSe.delete(playback);
    playback.source.onended = null;
    try { playback.source.disconnect(); } catch (error) { /* 解放失敗はゲームへ影響させない。 */ }
    try { playback.gain.disconnect(); } catch (error) { /* 解放失敗はゲームへ影響させない。 */ }
  }
  function stopSe(playback) {
    if (!playback) return;
    try { playback.source.stop(0); } catch (error) { /* 停止済みSourceは無視する。 */ }
    releaseSe(playback);
  }
  function seGainValue(volumeScale) {
    return channelEnabled('se') ? channelVolume('se') * clamp(volumeScale, 1) : 0;
  }
  function updateActiveSeGains() {
    activeSe.forEach(function (playback) {
      try { playback.gain.gain.value = seGainValue(playback.volumeScale); }
      catch (error) { audioError('se-gain', error); }
    });
  }
  function getSeAudioContext() {
    if (seAudioContext) return seAudioContext;
    if (seContextFailed || !canUseWebAudio()) return seAudioContext;
    var Constructor = webAudioConstructor();
    try {
      seAudioContext = new Constructor();
    }
    catch (error) { seContextFailed = true; audioError('audio-context', error, 'context-constructor'); }
    return seAudioContext;
  }
  function decodeAudioBuffer(context, arrayBuffer) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      function succeed(buffer) { if (!settled) { settled = true; resolve(buffer); } }
      function fail(error) { if (!settled) { settled = true; reject(error); } }
      var result;
      try { result = context.decodeAudioData(arrayBuffer, succeed, fail); }
      catch (error) { fail(error); return; }
      if (result && typeof result.then === 'function') result.then(succeed, fail);
    });
  }
  function setSeBufferState(entry, nextState) { entry.state = nextState; }
  function loadSeBuffer(source, options) {
    options = options || {};
    var existing = seBufferEntries.get(source);
    if (existing) {
      if (existing.state !== 'ERROR' || !options.retryError || existing.retryCount >= 1) return existing;
      existing.retryCount += 1;
      existing.buffer = null;
      existing.cancelled = false;
      setSeBufferState(existing, 'RETRY');
      return startSeBufferLoad(existing);
    }
    var entry = { source: source, state: 'NOT_LOADED', buffer: null, promise: null, controller: null, cancelled: false, errorStage: 'context', retryCount: 0 };
    seBufferEntries.set(source, entry);
    setSeBufferState(entry, 'LOADING');
    return startSeBufferLoad(entry);
  }
  function startSeBufferLoad(entry) {
    var source = entry.source;
    if (entry.state === 'RETRY') setSeBufferState(entry, 'LOADING');
    var controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
    entry.controller = controller;
    var context = getSeAudioContext();
    if (!context) {
      setSeBufferState(entry, 'ERROR');
      entry.promise = Promise.resolve(null);
      return entry;
    }
    entry.promise = Promise.resolve().then(function () {
      entry.errorStage = 'fetch';
      var fetchOptions = { credentials: 'same-origin' };
      if (controller) fetchOptions.signal = controller.signal;
      return global.fetch(source, fetchOptions);
    }).then(function (response) {
      if (!response || !response.ok) throw new Error('audio_fetch_failed_' + (response && response.status || 0));
      entry.errorStage = 'array-buffer';
      return response.arrayBuffer();
    }).then(function (arrayBuffer) {
      if (entry.cancelled || destroyed) return null;
      entry.errorStage = 'decode';
      return decodeAudioBuffer(context, arrayBuffer);
    }).then(function (buffer) {
      if (!buffer || entry.cancelled || destroyed) return null;
      entry.buffer = buffer;
      setSeBufferState(entry, 'READY');
      return buffer;
    }).catch(function (error) {
      setSeBufferState(entry, 'ERROR');
      if (!entry.cancelled && !destroyed) audioError(source, error, entry.errorStage);
      return null;
    });
    return entry;
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
    if (!settings.seEnabled) activeSe.forEach(stopSe);
    else updateActiveSeGains();
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

  function beginUserActivation() {
    var activationId = ++activationSequence;
    currentActivationId = activationId;
    Promise.resolve().then(function () {
      if (currentActivationId === activationId) currentActivationId = 0;
    });
    return activationId;
  }

  function activationPulse(context) {
    var source;
    var gain;
    var cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      try { if (source) source.disconnect(); } catch (error) { /* pulse cleanup失敗はunlockを妨げない。 */ }
      try { if (gain) gain.disconnect(); } catch (error) { /* pulse cleanup失敗はunlockを妨げない。 */ }
    }
    try {
      source = context.createBufferSource();
      gain = context.createGain();
      source.buffer = context.createBuffer(1, 1, Number(context.sampleRate) || 44100);
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(context.destination);
      source.onended = cleanup;
      source.start(0);
      return cleanup;
    } catch (error) {
      try { if (source) source.disconnect(); } catch (disconnectError) { /* cleanup失敗は無視する。 */ }
      try { if (gain) gain.disconnect(); } catch (disconnectError) { /* cleanup失敗は無視する。 */ }
      return null;
    }
  }

  function completeUnlockAttempt(attempt, success) {
    if (!attempt || attempt.completed) return;
    attempt.completed = true;
    if (attempt.pollTimer) global.clearInterval(attempt.pollTimer);
    if (attempt.stallTimer) global.clearTimeout(attempt.stallTimer);
    if (attempt.pulseCleanup) attempt.pulseCleanup();
    success = !!success && attempt.context.state === 'running';
    unlocked = success;
    if (seUnlockAttempt === attempt) {
      seUnlockAttempt = null;
      seUnlockPromise = null;
    }
    if (success) {
      primeClickSeBuffer();
      resumePendingBgm();
    }
    attempt.resolve(success);
  }

  /** iPhone Safari/PWAのユーザー操作内で再生制限を解除する。 */
  function unlock() {
    if (!canUseAudio() && !canUseWebAudio()) return Promise.resolve(false);
    var context = getSeAudioContext();
    var activationId = currentActivationId;
    if (!context) {
      unlocked = false;
      return Promise.resolve(false);
    }
    if (context.state === 'running') {
      if (seUnlockAttempt) {
        var pendingPromise = seUnlockPromise;
        completeUnlockAttempt(seUnlockAttempt, true);
        return pendingPromise;
      }
      unlocked = true;
      primeClickSeBuffer();
      resumePendingBgm();
      return Promise.resolve(true);
    }
    unlocked = false;
    if (seUnlockAttempt && !seUnlockAttempt.completed) {
      var elapsed = Date.now() - seUnlockAttempt.startedAt;
      var staleActivation = activationId && seUnlockAttempt.activationId && activationId !== seUnlockAttempt.activationId;
      if (staleActivation || elapsed >= RESUME_STALL_MS) {
        completeUnlockAttempt(seUnlockAttempt, false);
      } else {
        return seUnlockPromise;
      }
    }
    if (typeof context.resume !== 'function') {
      return Promise.resolve(false);
    }
    var attempt = { activationId: activationId, context: context, startedAt: Date.now(), completed: false, pollTimer: null, stallTimer: null, pulseCleanup: null, resolve: null, promise: null };
    attempt.promise = new Promise(function (resolve) { attempt.resolve = resolve; });
    seUnlockAttempt = attempt;
    seUnlockPromise = attempt.promise;
    var resumeResult;
    try {
      resumeResult = context.resume();
      attempt.pulseCleanup = activationPulse(context);
    } catch (error) {
      audioError('audio-context', error, 'context-resume');
      completeUnlockAttempt(attempt, false);
      return attempt.promise;
    }
    if (context.state === 'running') completeUnlockAttempt(attempt, true);
    if (!attempt.completed) {
      attempt.pollTimer = global.setInterval(function () {
        if (context.state === 'running') completeUnlockAttempt(attempt, true);
      }, RESUME_STATE_POLL_MS);
      attempt.stallTimer = global.setTimeout(function () {
        if (context.state === 'running') {
          completeUnlockAttempt(attempt, true);
          return;
        }
        completeUnlockAttempt(attempt, false);
      }, RESUME_STALL_MS);
    }
    Promise.resolve(resumeResult).then(function () {
      if (attempt.completed) return;
      completeUnlockAttempt(attempt, context.state === 'running');
    }, function (error) {
      if (attempt.completed) return;
      audioError('audio-context', error, 'context-resume');
      completeUnlockAttempt(attempt, false);
    });
    return attempt.promise;
  }

  function resumePendingBgm() {
    if (!pendingBgmId || !settings.bgmEnabled) return;
    var id = pendingBgmId;
    pendingBgmId = null;
    playBgm(id).catch(function (error) { audioError(id, error, 'bgm-resume'); });
  }

  function primeClickSeBuffer() {
    var source = assets.se['button-tap'];
    if (source) loadSeBuffer(source);
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
  function playDecodedSe(entry, id, options) {
    var volumeScale = options.volume === undefined ? 1 : clamp(options.volume, 1);
    if (entry.state !== 'READY' || !entry.buffer || !channelEnabled('se') || seGainValue(volumeScale) <= 0 || destroyed) return Promise.resolve(false);
    var context = getSeAudioContext();
    if (!context || context.state !== 'running' || !unlocked || !channelEnabled('se') || seGainValue(volumeScale) <= 0 || destroyed) return Promise.resolve(false);
    return Promise.resolve().then(function () {
      if (context.state !== 'running' || !unlocked || !channelEnabled('se') || seGainValue(volumeScale) <= 0 || destroyed) return false;
      var source;
      var gain;
      var playback;
      try {
        source = context.createBufferSource();
        gain = context.createGain();
        source.buffer = entry.buffer;
        gain.gain.value = seGainValue(volumeScale);
        source.connect(gain);
        gain.connect(context.destination);
        playback = { source: source, gain: gain, volumeScale: volumeScale };
        activeSe.add(playback);
        source.onended = function () { releaseSe(playback); };
        source.start(0);
        emit('audio:played', { id: id });
        return true;
      } catch (error) {
        if (playback) releaseSe(playback);
        else {
          try { if (source) source.disconnect(); } catch (disconnectError) { /* 初期化途中の解放失敗は無視する。 */ }
          try { if (gain) gain.disconnect(); } catch (disconnectError) { /* 初期化途中の解放失敗は無視する。 */ }
        }
        audioError(id, error, 'source-playback');
        return false;
      }
    });
  }

  /** SEはdecode済みAudioBufferを再利用し、再生ごとにSource/Gainを生成する。 */
  function playSe(id, options) {
    options = options || {};
    var source = assets.se[id];
    if (!source || !canUseWebAudio() || !channelEnabled('se') || channelVolume('se') <= 0 || destroyed) return Promise.resolve(false);
    var context = getSeAudioContext();
    if (!context || context.state !== 'running' || !unlocked) {
      if (unlocked) {
        unlocked = false;
      }
      return unlock().then(function (ready) {
        return ready ? playReadySe(id, options, source) : false;
      });
    }
    return playReadySe(id, options, source);
  }

  function playReadySe(id, options, source) {
    var cooldownKey = String(options.cooldownKey || id);
    var cooldownMs = Math.max(0, Number(options.cooldownMs) || 0);
    var timestamp = Date.now();
    if (cooldownMs && timestamp - (lastPlayedAt.get(cooldownKey) || 0) < cooldownMs) return Promise.resolve(false);
    lastPlayedAt.set(cooldownKey, timestamp);
    var entry = loadSeBuffer(source, { retryError: true });
    if (entry.state === 'ERROR') return Promise.resolve(false);
    if (entry.state === 'READY') return playDecodedSe(entry, id, options);
    return entry.promise.then(function (buffer) {
      if (buffer) return playDecodedSe(entry, id, options);
      if (entry.state !== 'ERROR' || entry.retryCount >= 1) return false;
      var retryEntry = loadSeBuffer(source, { retryError: true });
      if (retryEntry.state === 'READY') return playDecodedSe(retryEntry, id, options);
      if (retryEntry.state === 'ERROR') return false;
      return retryEntry.promise.then(function (retryBuffer) {
        return retryBuffer ? playDecodedSe(retryEntry, id, options) : false;
      });
    }, function (error) {
      audioError(id, error, 'buffer-await');
      return false;
    });
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
    if (masterVolume <= 0) activeSe.forEach(stopSe);
    else updateActiveSeGains();
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
      beginUserActivation();
      var handler = gestureHandler;
      unlock().then(function (ready) {
        if (!ready || gestureHandler !== handler) return;
        global.document.removeEventListener('pointerdown', handler, true);
        global.document.removeEventListener('keydown', handler, true);
        gestureHandler = null;
      });
    };
    buttonHandler = function (event) {
      beginUserActivation();
      if (!event.target.closest) return;
      var control = event.target.closest('button,[data-action]');
      if (!control || control.closest('#ar-capture,#ar-photo,#ar-search,[data-achievement-claim]')) return;
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
    activeSe.forEach(stopSe);
    seBufferEntries.forEach(function (entry) {
      entry.cancelled = true;
      entry.buffer = null;
      if (entry.controller) {
        try { entry.controller.abort(); } catch (error) { /* abort失敗はcleanupを妨げない。 */ }
      }
    });
    seBufferEntries.clear();
    if (seUnlockAttempt) completeUnlockAttempt(seUnlockAttempt, false);
    seUnlockAttempt = null;
    seUnlockPromise = null;
    currentActivationId = 0;
    if (seAudioContext && typeof seAudioContext.close === 'function') {
      try { Promise.resolve(seAudioContext.close()).catch(function (error) { audioError('audio-context', error); }); }
      catch (error) { audioError('audio-context', error); }
    }
    seAudioContext = null;
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
