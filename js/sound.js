/* 海老フライ王国AR v1.0 - Audioベースのサウンド管理 */
(function (global) {
  'use strict';

  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var DEFAULT_ASSETS = Object.freeze({
    bgm: Object.freeze({ adventure: 'sounds/bgm-adventure.mp3', title: 'sounds/bgm-title.mp3' }),
    se: Object.freeze({ spotArrived: 'sounds/se-spot-arrived.mp3', characterFound: 'sounds/se-character-found.mp3', levelUp: 'sounds/se-level-up.mp3', couponReceived: 'sounds/se-coupon-received.mp3', button: 'sounds/se-button.mp3' })
  });
  var assets = { bgm: Object.assign({}, DEFAULT_ASSETS.bgm), se: Object.assign({}, DEFAULT_ASSETS.se) };
  var mixer = { master: 1, bgm: 0.65, se: 0.8, muted: false };
  var currentBgm = null;
  var currentBgmId = null;
  var pendingBgmId = null;
  var unlocked = false;
  var fadeTimers = new WeakMap();
  var subscriptions = [];

  function clamp(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
  function canUseAudio() { return typeof global.Audio === 'function'; }
  function emit(name, detail) { if (EbiAR.events) EbiAR.events.emit(name, detail); }
  function effectiveVolume(channel) { return mixer.muted ? 0 : mixer.master * mixer[channel]; }
  function audioError(id, error) { emit('sound:error', { id: id, error: error }); }

  /** Audio要素を生成し、読み込み・再生の失敗をイベントへ通知する。 */
  function createAudio(source, loop) {
    if (!canUseAudio() || !source) return null;
    var audio = new global.Audio(source);
    audio.preload = 'auto';
    audio.loop = !!loop;
    audio.addEventListener('error', function () { audioError(source, new Error('audio_load_failed')); });
    return audio;
  }
  function attemptPlay(audio, id) {
    if (!audio || mixer.muted) return Promise.resolve(false);
    var result;
    try { result = audio.play(); }
    catch (error) { audioError(id, error); return Promise.resolve(false); }
    return Promise.resolve(result).then(function () { emit('sound:played', { id: id }); return true; }).catch(function (error) { audioError(id, error); return false; });
  }
  function clearFade(audio) {
    var timer = fadeTimers.get(audio);
    if (timer) global.clearInterval(timer);
    fadeTimers.delete(audio);
  }

  /**
   * 指定したAudio要素の音量をフェードさせる。
   * @param {HTMLAudioElement} audio 対象Audio
   * @param {number} target 目標音量（0〜1）
   * @param {number} durationMs 所要時間
   * @returns {Promise<boolean>}
   */
  function fade(audio, target, durationMs) {
    if (!audio) return Promise.resolve(false);
    clearFade(audio);
    target = clamp(target);
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
  function refreshVolumes() {
    if (currentBgm) currentBgm.volume = effectiveVolume('bgm');
  }

  /**
   * ユーザー操作内で呼び出す再生解除処理。自動再生制限下ではここまでBGMを保留する。
   * @returns {Promise<boolean>}
   */
  function unlock() {
    if (!canUseAudio()) return Promise.resolve(false);
    unlocked = true;
    if (!pendingBgmId) return Promise.resolve(true);
    var id = pendingBgmId;
    pendingBgmId = null;
    return playBgm(id);
  }

  /** BGMをループ再生する。ユーザー操作前は再生予約だけを行う。 */
  function playBgm(id, options) {
    options = options || {};
    var source = assets.bgm[id];
    if (!source || !canUseAudio()) return Promise.resolve(false);
    if (!unlocked) { pendingBgmId = id; emit('sound:blocked', { id: id, reason: 'user_gesture_required' }); return Promise.resolve(false); }
    if (currentBgmId === id && currentBgm) return attemptPlay(currentBgm, id);
    stopBgm({ fadeMs: options.crossFadeMs || 0 });
    currentBgm = createAudio(source, true);
    currentBgmId = id;
    currentBgm.volume = options.fadeMs ? 0 : effectiveVolume('bgm');
    return attemptPlay(currentBgm, id).then(function (played) {
      if (played && options.fadeMs) return fade(currentBgm, effectiveVolume('bgm'), options.fadeMs).then(function () { return true; });
      return played;
    });
  }
  /** 現在のBGMを停止する。 */
  function stopBgm(options) {
    options = options || {};
    if (!currentBgm) return Promise.resolve(false);
    var audio = currentBgm;
    currentBgm = null;
    currentBgmId = null;
    var finish = function () { clearFade(audio); audio.pause(); audio.currentTime = 0; return true; };
    if (options.fadeMs) return fade(audio, 0, options.fadeMs).then(finish);
    return Promise.resolve(finish());
  }
  /** 効果音を一回再生する。重なったSEも再生できる。 */
  function playSe(id, options) {
    options = options || {};
    var source = assets.se[id];
    if (!source || !canUseAudio() || !unlocked) return Promise.resolve(false);
    var audio = createAudio(source, false);
    if (!audio) return Promise.resolve(false);
    audio.volume = clamp(options.volume == null ? effectiveVolume('se') : options.volume * mixer.master);
    audio.addEventListener('ended', function () { clearFade(audio); audio.src = ''; });
    return attemptPlay(audio, id);
  }

  /** サウンド素材のURLを差し替える。外部CDNへの移行にも使える。 */
  function configure(nextAssets) {
    nextAssets = nextAssets || {};
    if (nextAssets.bgm) assets.bgm = Object.assign({}, assets.bgm, nextAssets.bgm);
    if (nextAssets.se) assets.se = Object.assign({}, assets.se, nextAssets.se);
  }
  function setVolume(channel, value) {
    if (channel !== 'master' && channel !== 'bgm' && channel !== 'se') throw new TypeError('不正な音量チャンネルです。');
    mixer[channel] = clamp(value);
    refreshVolumes();
    emit('sound:volume-changed', Object.assign({}, mixer));
    return mixer[channel];
  }
  function setMuted(value) {
    mixer.muted = value === undefined ? !mixer.muted : !!value;
    refreshVolumes();
    emit('sound:muted-changed', Object.assign({}, mixer));
    return mixer.muted;
  }
  function getState() { return Object.freeze({ currentBgmId: currentBgmId, unlocked: unlocked, pendingBgmId: pendingBgmId, masterVolume: mixer.master, bgmVolume: mixer.bgm, seVolume: mixer.se, muted: mixer.muted }); }

  /** ゲームイベントを標準SEに接続する。何度呼んでも重複購読しない。 */
  function connectEvents() {
    if (!EbiAR.events || subscriptions.length) return;
    subscriptions.push(EbiAR.events.on('gps:spot-arrived', function () { playSe('spotArrived'); }));
    subscriptions.push(EbiAR.events.on('character:acquired', function () { playSe('characterFound'); }));
    subscriptions.push(EbiAR.events.on('character:levelup', function () { playSe('levelUp'); }));
    subscriptions.push(EbiAR.events.on('coupon:acquired', function () { playSe('couponReceived'); }));
  }
  function disconnectEvents() { subscriptions.forEach(function (off) { off(); }); subscriptions = []; }
  function installGestureUnlock() {
    if (!global.document) return;
    var handler = function () { unlock(); global.document.removeEventListener('pointerdown', handler, true); global.document.removeEventListener('keydown', handler, true); };
    global.document.addEventListener('pointerdown', handler, true);
    global.document.addEventListener('keydown', handler, true);
    global.document.addEventListener('click', function (event) { if (event.target.closest && event.target.closest('button,[data-action]')) playSe('button'); }, true);
  }

  EbiAR.sound = Object.freeze({
    configure: configure, unlock: unlock,
    playBgm: playBgm, stopBgm: stopBgm, playSe: playSe, fade: fade,
    setMasterVolume: function (value) { return setVolume('master', value); },
    setBgmVolume: function (value) { return setVolume('bgm', value); },
    setSeVolume: function (value) { return setVolume('se', value); },
    setMuted: setMuted, toggleMuted: function () { return setMuted(); },
    getState: getState, connectEvents: connectEvents, disconnectEvents: disconnectEvents
  });

  connectEvents();
  installGestureUnlock();
})(window);
