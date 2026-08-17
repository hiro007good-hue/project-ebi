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
  var seContextFailed = false;
  var currentBgmEntry = null;
  var subscriptions = [];
  var gestureHandler = null;
  var buttonHandler = null;
  var visibilityHandler = null;
  var tracePointerHandler = null;
  var tracePanel = null;
  var traceOutput = null;
  var traceDirectButton = null;
  var traceDirectHandler = null;
  var traceStyle = null;
  var traceSourceSequence = 0;
  var traceBufferSequence = 0;
  var traceLines = [];
  var traceState = {
    initialized: false,
    contextConstructor: 'NOT_CREATED', contextCount: 0, contextState: 'NOT_CREATED', contextSampleRate: null,
    baseLatency: null, destinationChannels: null,
    bufferStatus: 'NOT_LOADED', fetchStarted: false, fetchSucceeded: false, decodeStarted: false, decodeSucceeded: false,
    bufferId: null, bufferDuration: null, bufferSampleRate: null, bufferChannels: null, bufferLength: null, bufferCacheHits: 0,
    playCalls: 0, lastPlayAt: '-', resolvedKey: '-', resolvedUrl: '-',
    sourceId: null, sourceCreated: false, gainCreated: false, sourceConnected: false, destinationConnected: false,
    computedGain: null, startAt: null, endedAt: null,
    errorStage: '-', errorName: '-', errorMessage: '-', directResult: 'NOT_RUN',
    bufferWriter: '-', bufferSubsystem: '-', bufferRetryCount: 0,
    lastSeError: null, lastBgmError: null, lastClickError: null
  };
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
  function webAudioConstructor() { return global.AudioContext || global.webkitAudioContext; }
  function canUseWebAudio() { return typeof webAudioConstructor() === 'function' && typeof global.fetch === 'function'; }
  function emit(name, detail) { if (EbiAR.events) EbiAR.events.emit(name, detail); }
  function traceTimestamp() {
    var date = new Date();
    function pad(value, length) { return String(value).padStart(length, '0'); }
    return pad(date.getHours(), 2) + ':' + pad(date.getMinutes(), 2) + ':' + pad(date.getSeconds(), 2) + '.' + pad(date.getMilliseconds(), 3);
  }
  function traceContext() {
    if (!seAudioContext) return;
    traceState.contextState = seAudioContext.state || 'unknown';
    traceState.contextSampleRate = Number(seAudioContext.sampleRate) || null;
    traceState.baseLatency = Number.isFinite(Number(seAudioContext.baseLatency)) ? Number(seAudioContext.baseLatency) : null;
    traceState.destinationChannels = seAudioContext.destination && Number(seAudioContext.destination.channelCount) || null;
  }
  function traceValue(value) { return value === null || value === undefined ? '-' : String(value); }
  function renderTrace() {
    if (!traceOutput) return;
    traceContext();
    var computedGain = channelEnabled('se') ? channelVolume('se') : 0;
    traceOutput.textContent = [
      'AudioManager',
      ' initialized=' + traceState.initialized + ' unlocked=' + unlocked,
      ' context=' + traceState.contextConstructor + ' count=' + traceState.contextCount + ' state=' + traceState.contextState,
      ' sampleRate=' + traceValue(traceState.contextSampleRate) + ' baseLatency=' + traceValue(traceState.baseLatency) + ' destination.channelCount=' + traceValue(traceState.destinationChannels),
      ' seEnabled=' + settings.seEnabled + ' seVolume=' + settings.seVolume + ' masterVolume=' + masterVolume + ' computedGain=' + computedGain,
      '',
      'se_click.mp3',
      ' buffer=' + traceState.bufferStatus + ' bufferId=' + traceValue(traceState.bufferId) + ' cacheHits=' + traceState.bufferCacheHits,
      ' retryCount=' + traceState.bufferRetryCount + ' writer=' + traceState.bufferWriter + ' subsystem=' + traceState.bufferSubsystem,
      ' fetch=' + (traceState.fetchStarted ? (traceState.fetchSucceeded ? 'SUCCESS' : 'STARTED') : 'NOT_STARTED') + ' decode=' + (traceState.decodeStarted ? (traceState.decodeSucceeded ? 'SUCCESS' : 'STARTED') : 'NOT_STARTED'),
      ' duration=' + traceValue(traceState.bufferDuration) + ' sampleRate=' + traceValue(traceState.bufferSampleRate) + ' channels=' + traceValue(traceState.bufferChannels) + ' length=' + traceValue(traceState.bufferLength),
      '',
      'Playback',
      ' calls=' + traceState.playCalls + ' last=' + traceState.lastPlayAt,
      ' key=' + traceState.resolvedKey + ' url=' + traceState.resolvedUrl,
      ' sourceId=' + traceValue(traceState.sourceId) + ' source=' + traceState.sourceCreated + ' gainNode=' + traceState.gainCreated,
      ' source->gain=' + (traceState.sourceConnected ? 'connected' : 'not connected') + ' gain->destination=' + (traceState.destinationConnected ? 'connected' : 'not connected'),
      ' gain=' + traceValue(traceState.computedGain) + ' start=' + traceValue(traceState.startAt) + ' ended=' + traceValue(traceState.endedAt),
      ' directTest=' + traceState.directResult,
      '',
      'Last audio:error',
      ' stage=' + traceState.errorStage + ' name=' + traceState.errorName,
      ' message=' + traceState.errorMessage,
      '',
      'Last se_click error',
      formatTraceError(traceState.lastClickError),
      'Last SE error',
      formatTraceError(traceState.lastSeError),
      'Last BGM error',
      formatTraceError(traceState.lastBgmError),
      '',
      'Timeline',
      traceLines.length ? traceLines.join('\n') : '(waiting)'
    ].join('\n');
  }
  function trace(message) {
    traceLines.push('[' + traceTimestamp() + '] ' + message);
    if (traceLines.length > 80) traceLines.shift();
    renderTrace();
  }
  function formatTraceError(record) {
    return record ? ' key=' + record.key + ' url=' + record.url + ' stage=' + record.stage + ' name=' + record.name + '\n message=' + record.message : ' (none)';
  }
  function audioChannel(id) {
    var seKeys = Object.keys(assets.se);
    for (var seIndex = 0; seIndex < seKeys.length; seIndex += 1) {
      if (seKeys[seIndex] === id || assets.se[seKeys[seIndex]] === id) return 'se';
    }
    var bgmKeys = Object.keys(assets.bgm);
    for (var bgmIndex = 0; bgmIndex < bgmKeys.length; bgmIndex += 1) {
      if (bgmKeys[bgmIndex] === id || assets.bgm[bgmKeys[bgmIndex]] === id) return 'bgm';
    }
    return null;
  }
  function errorRecord(id, error, stage) {
    var channel = audioChannel(id);
    var url = channel === 'se' && assets.se[id] || channel === 'bgm' && assets.bgm[id] || id;
    var key = channel === 'se' ? seKeyForSource(url) : id;
    return {
      key: key,
      url: url,
      stage: stage || id || 'unknown',
      name: error && error.name || 'Error',
      message: error && error.message || String(error || 'unknown error')
    };
  }
  function traceError(stage, error) {
    traceState.errorStage = stage || 'unknown';
    traceState.errorName = error && error.name || 'Error';
    traceState.errorMessage = error && error.message || String(error || 'unknown error');
    trace('ERROR ' + traceState.errorStage + ': ' + traceState.errorName + ' ' + traceState.errorMessage);
  }
  function audioError(id, error, stage) {
    var channel = audioChannel(id);
    var record = errorRecord(id, error, stage);
    if (channel === 'se') {
      traceState.lastSeError = record;
      if (isTraceClickSource(id) || id === 'button-tap' || id === 'buttonTap') traceState.lastClickError = record;
    } else if (channel === 'bgm') {
      traceState.lastBgmError = record;
    }
    traceError(stage || id || 'unknown', error);
    emit('audio:error', { id: id, error: error, stage: stage || id || 'unknown' });
  }
  function channelVolume(channel) { return masterVolume * (channel === 'bgm' ? settings.bgmVolume : settings.seVolume); }
  function channelEnabled(channel) { return channel === 'bgm' ? settings.bgmEnabled : settings.seEnabled; }
  function isTraceClickSource(source) { return source === assets.se['button-tap']; }

  function installTracePanel() {
    if (!global.document || !global.document.body || tracePanel) return;
    traceStyle = global.document.createElement('style');
    traceStyle.id = 'audio-runtime-trace-style';
    traceStyle.textContent = '#audio-runtime-trace{position:fixed;right:8px;bottom:max(8px,env(safe-area-inset-bottom));z-index:12000;width:min(390px,calc(100vw - 16px));max-height:46vh;overflow:auto;border:1px solid #334155;border-radius:8px;background:#0f172eeF;color:#e2e8f0;box-shadow:0 4px 18px #0007;font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace}#audio-runtime-trace>summary{cursor:pointer;padding:8px 10px;font:700 12px/1.3 system-ui,sans-serif;touch-action:manipulation}#audio-runtime-trace .audio-trace-body{padding:0 10px 10px}#audio-runtime-trace button{width:100%;min-height:40px;margin:4px 0 8px;border:0;border-radius:6px;background:#f59e0b;color:#111827;font:700 13px system-ui,sans-serif;touch-action:manipulation}#audio-runtime-trace pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}';
    tracePanel = global.document.createElement('details');
    tracePanel.id = 'audio-runtime-trace';
    var summary = global.document.createElement('summary');
    summary.textContent = 'Audio-4 Runtime Trace';
    var body = global.document.createElement('div');
    body.className = 'audio-trace-body';
    traceDirectButton = global.document.createElement('button');
    traceDirectButton.type = 'button';
    traceDirectButton.textContent = 'SEを直接鳴らす';
    traceOutput = global.document.createElement('pre');
    body.append(traceDirectButton, traceOutput);
    tracePanel.append(summary, body);
    global.document.head.appendChild(traceStyle);
    global.document.body.appendChild(tracePanel);
    tracePointerHandler = function (event) {
      var target = event.target && event.target.closest && event.target.closest('[data-action="start"]');
      if (!target) return;
      traceLines = [];
      tracePanel.open = true;
      trace('pointerdown: adventure start');
    };
    traceDirectHandler = function () {
      traceState.directResult = 'REQUESTED';
      trace('direct SE test requested');
      unlock().then(function (ready) {
        if (!ready) return false;
        return playSe('button-tap');
      }).then(function (played) {
        traceState.directResult = played ? 'PLAYED' : 'NOT_PLAYED';
        trace('direct SE test result = ' + traceState.directResult);
      }, function (error) {
        traceState.directResult = 'ERROR';
        audioError('button-tap', error, 'direct-test');
      });
    };
    traceDirectButton.addEventListener('click', traceDirectHandler);
    global.document.addEventListener('pointerdown', tracePointerHandler, true);
    traceState.initialized = true;
    trace('AudioManager initialized');
  }

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
    if (seAudioContext) { traceContext(); return seAudioContext; }
    if (seContextFailed || !canUseWebAudio()) return seAudioContext;
    var Constructor = webAudioConstructor();
    try {
      seAudioContext = new Constructor();
      traceState.contextConstructor = global.webkitAudioContext && Constructor === global.webkitAudioContext ? 'webkitAudioContext' : 'AudioContext';
      traceState.contextCount += 1;
      traceContext();
      trace('AudioContext created (' + traceState.contextConstructor + '), count = ' + traceState.contextCount + ', state = ' + traceState.contextState);
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
  function seKeyForSource(source) {
    var keys = Object.keys(assets.se);
    for (var index = 0; index < keys.length; index += 1) {
      if (assets.se[keys[index]] === source) return keys[index];
    }
    return 'unknown';
  }
  function setSeBufferState(entry, nextState, writer, error) {
    var previousState = entry.state || 'NOT_LOADED';
    entry.state = nextState;
    if (isTraceClickSource(entry.source)) {
      traceState.bufferStatus = nextState;
      traceState.bufferWriter = writer;
      traceState.bufferSubsystem = 'webaudio';
      traceState.bufferRetryCount = entry.retryCount;
    }
    var message = 'SE buffer state change:'
      + ' soundKey=' + seKeyForSource(entry.source)
      + ' URL=' + entry.source
      + ' oldState=' + previousState
      + ' newState=' + nextState
      + ' writer=' + writer
      + ' subsystem=webaudio'
      + ' error.name=' + (error && error.name || '-')
      + ' error.message=' + (error && error.message || '-')
      + ' retryCount=' + entry.retryCount;
    trace(message);
  }
  function loadSeBuffer(source, options) {
    options = options || {};
    var existing = seBufferEntries.get(source);
    if (existing) {
      if (isTraceClickSource(source)) {
        traceState.bufferCacheHits += 1;
        traceState.bufferStatus = existing.state;
        trace('se_click buffer cache hit = ' + existing.state + ', bufferId = ' + traceValue(existing.bufferId));
      }
      if (existing.state !== 'ERROR' || !options.retryError || existing.retryCount >= 1) return existing;
      existing.retryCount += 1;
      existing.buffer = null;
      existing.bufferId = null;
      existing.cancelled = false;
      if (isTraceClickSource(source)) {
        traceState.fetchStarted = false;
        traceState.fetchSucceeded = false;
        traceState.decodeStarted = false;
        traceState.decodeSucceeded = false;
      }
      setSeBufferState(existing, 'RETRY', 'loadSeBuffer', existing.lastError);
      return startSeBufferLoad(existing);
    }
    var entry = { source: source, state: 'NOT_LOADED', buffer: null, bufferId: null, promise: null, controller: null, cancelled: false, errorStage: 'context', lastError: null, retryCount: 0 };
    seBufferEntries.set(source, entry);
    setSeBufferState(entry, 'LOADING', 'loadSeBuffer');
    return startSeBufferLoad(entry);
  }
  function startSeBufferLoad(entry) {
    var source = entry.source;
    if (entry.state === 'RETRY') setSeBufferState(entry, 'LOADING', 'startSeBufferLoad');
    var controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
    entry.controller = controller;
    var context = getSeAudioContext();
    if (!context) {
      entry.lastError = new Error('audio_context_unavailable');
      setSeBufferState(entry, 'ERROR', 'startSeBufferLoad', entry.lastError);
      entry.promise = Promise.resolve(null);
      return entry;
    }
    entry.promise = Promise.resolve().then(function () {
      entry.errorStage = 'fetch';
      if (isTraceClickSource(source)) {
        traceState.fetchStarted = true;
        trace('se_click fetch started');
      }
      var fetchOptions = { credentials: 'same-origin' };
      if (controller) fetchOptions.signal = controller.signal;
      return global.fetch(source, fetchOptions);
    }).then(function (response) {
      if (!response || !response.ok) throw new Error('audio_fetch_failed_' + (response && response.status || 0));
      if (isTraceClickSource(source)) {
        traceState.fetchSucceeded = true;
        trace('se_click fetch succeeded, HTTP ' + response.status);
      }
      entry.errorStage = 'array-buffer';
      return response.arrayBuffer();
    }).then(function (arrayBuffer) {
      if (entry.cancelled || destroyed) return null;
      entry.errorStage = 'decode';
      if (isTraceClickSource(source)) {
        traceState.decodeStarted = true;
        trace('se_click decode started, bytes = ' + arrayBuffer.byteLength);
      }
      return decodeAudioBuffer(context, arrayBuffer);
    }).then(function (buffer) {
      if (!buffer || entry.cancelled || destroyed) return null;
      entry.buffer = buffer;
      entry.bufferId = ++traceBufferSequence;
      entry.lastError = null;
      setSeBufferState(entry, 'READY', 'loadSeBuffer');
      if (isTraceClickSource(source)) {
        traceState.decodeSucceeded = true;
        traceState.bufferId = entry.bufferId;
        traceState.bufferDuration = buffer.duration;
        traceState.bufferSampleRate = buffer.sampleRate;
        traceState.bufferChannels = buffer.numberOfChannels;
        traceState.bufferLength = buffer.length;
        trace('se_click decode succeeded, buffer = READY, bufferId = ' + entry.bufferId);
      }
      return buffer;
    }).catch(function (error) {
      entry.lastError = error;
      setSeBufferState(entry, 'ERROR', 'loadSeBuffer', error);
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
    renderTrace();
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
    if (!canUseAudio() && !canUseWebAudio()) return Promise.resolve(false);
    var context = getSeAudioContext();
    trace('audio unlock requested, state before resume = ' + (context ? context.state : 'unavailable'));
    if (!context) {
      unlocked = false;
      trace('unlock failure: AudioContext unavailable');
      return Promise.resolve(false);
    }
    if (context.state === 'running') {
      unlocked = true;
      traceContext();
      trace('unlock success: AudioContext already running');
      primeClickSeBuffer();
      resumePendingBgm();
      return Promise.resolve(true);
    }
    unlocked = false;
    if (seUnlockPromise) {
      trace('unlockPromise reused');
      return seUnlockPromise;
    }
    if (typeof context.resume !== 'function') {
      trace('unlock failure: AudioContext.resume unavailable, state after resume = ' + context.state);
      return Promise.resolve(false);
    }
    trace('resume requested, state before resume = ' + context.state);
    var resumeResult;
    try { resumeResult = context.resume(); }
    catch (error) {
      trace('unlock failure: resume threw, state after resume = ' + context.state);
      audioError('audio-context', error, 'context-resume');
      return Promise.resolve(false);
    }
    var activePromise = Promise.resolve(resumeResult).then(function () {
      trace('resume Promise resolved');
      traceContext();
      trace('state after resume = ' + context.state);
      unlocked = context.state === 'running';
      trace(unlocked ? 'unlock success: AudioContext running' : 'unlock failure: AudioContext ' + context.state);
      if (unlocked) {
        primeClickSeBuffer();
        resumePendingBgm();
      }
      return unlocked;
    }, function (error) {
      unlocked = false;
      traceContext();
      trace('unlock failure: resume rejected, state after resume = ' + context.state);
      audioError('audio-context', error, 'context-resume');
      return false;
    });
    seUnlockPromise = activePromise;
    activePromise.then(function () {
      if (seUnlockPromise === activePromise) seUnlockPromise = null;
    });
    return activePromise;
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
    var traced = isTraceClickSource(entry.source);
    if (traced) {
      traceState.bufferStatus = entry.state;
      trace('se_click buffer = ' + entry.state + ', bufferId = ' + traceValue(entry.bufferId));
    }
    if (entry.state !== 'READY' || !entry.buffer || !channelEnabled('se') || seGainValue(volumeScale) <= 0 || destroyed) return Promise.resolve(false);
    var context = getSeAudioContext();
    if (!context || context.state !== 'running' || !unlocked || !channelEnabled('se') || seGainValue(volumeScale) <= 0 || destroyed) return Promise.resolve(false);
    return Promise.resolve().then(function () {
      if (context.state !== 'running' || !unlocked || !channelEnabled('se') || seGainValue(volumeScale) <= 0 || destroyed) return false;
      var source;
      var gain;
      var playback;
      try {
        if (traced) {
          traceState.sourceId = ++traceSourceSequence;
          traceState.sourceCreated = false;
          traceState.gainCreated = false;
          traceState.sourceConnected = false;
          traceState.destinationConnected = false;
          traceState.computedGain = seGainValue(volumeScale);
          traceState.startAt = null;
          traceState.endedAt = null;
          trace('pre-play seEnabled=' + settings.seEnabled + ' seVolume=' + settings.seVolume + ' masterVolume=' + masterVolume + ' computedGain=' + traceState.computedGain);
        }
        source = context.createBufferSource();
        if (traced) { traceState.sourceCreated = true; trace('source #' + traceState.sourceId + ' created'); }
        gain = context.createGain();
        if (traced) { traceState.gainCreated = true; trace('GainNode created'); }
        source.buffer = entry.buffer;
        gain.gain.value = seGainValue(volumeScale);
        source.connect(gain);
        if (traced) { traceState.sourceConnected = true; trace('source -> gain: connected'); }
        gain.connect(context.destination);
        if (traced) { traceState.destinationConnected = true; trace('gain -> destination: connected'); }
        playback = { source: source, gain: gain, volumeScale: volumeScale, traceSourceId: traced ? traceState.sourceId : null };
        activeSe.add(playback);
        source.onended = function () {
          if (playback.traceSourceId) {
            traceState.endedAt = traceTimestamp();
            trace('source #' + playback.traceSourceId + ' ended');
          }
          releaseSe(playback);
        };
        source.start(0);
        if (traced) {
          traceState.startAt = traceTimestamp();
          trace('source #' + traceState.sourceId + '.start(0)');
        }
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
    if (id === 'button-tap' || source && isTraceClickSource(source)) {
      traceState.playCalls += 1;
      traceState.lastPlayAt = traceTimestamp();
      traceState.resolvedKey = id;
      traceState.resolvedUrl = source || 'NOT_RESOLVED';
      traceState.computedGain = channelEnabled('se') ? channelVolume('se') * (options.volume === undefined ? 1 : clamp(options.volume, 1)) : 0;
      trace("playSe('" + id + "') requested (#" + traceState.playCalls + '), URL = ' + traceState.resolvedUrl);
    }
    if (!source || !canUseWebAudio() || !channelEnabled('se') || channelVolume('se') <= 0 || destroyed) return Promise.resolve(false);
    var context = getSeAudioContext();
    trace("playSe('" + id + "') start: context.state = " + (context ? context.state : 'unavailable') + ', unlocked = ' + unlocked);
    if (!context || context.state !== 'running' || !unlocked) {
      if (unlocked) {
        unlocked = false;
        trace('playSe actual context.state takes priority; treated as locked');
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
      trace("playSe('" + id + "') initial load failed; explicit request starts one retry");
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
    renderTrace();
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
      var handler = gestureHandler;
      unlock().then(function (ready) {
        if (!ready || gestureHandler !== handler) return;
        global.document.removeEventListener('pointerdown', handler, true);
        global.document.removeEventListener('keydown', handler, true);
        gestureHandler = null;
      });
    };
    buttonHandler = function (event) {
      if (!event.target.closest) return;
      var control = event.target.closest('button,[data-action]');
      if (!control || control.closest('#ar-capture,#ar-photo,#ar-search,[data-achievement-claim],#audio-runtime-trace')) return;
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
    seUnlockPromise = null;
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
    if (global.document && tracePointerHandler) global.document.removeEventListener('pointerdown', tracePointerHandler, true);
    if (traceDirectButton && traceDirectHandler) traceDirectButton.removeEventListener('click', traceDirectHandler);
    if (tracePanel) tracePanel.remove();
    if (traceStyle) traceStyle.remove();
    gestureHandler = null; buttonHandler = null; visibilityHandler = null; tracePointerHandler = null;
    tracePanel = null; traceOutput = null; traceDirectButton = null; traceDirectHandler = null; traceStyle = null;
    traceLines = [];
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
  installTracePanel();
  installGestureUnlock();
  installLifecycle();
})(window);
