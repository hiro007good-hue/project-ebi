/* 海老フライ王国AR v1.0 - 軽量Web ARエンジン */
(function (global) {
  'use strict';

  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var STATES = Object.freeze({ IDLE: 'idle', REQUESTING: 'requesting_permission', STARTING: 'starting', RUNNING: 'running', CAPTURING: 'capturing', CAPTURED: 'captured', STOPPING: 'stopping', ERROR: 'error' });
  var state = STATES.IDLE;
  var stream = null;
  var characterId = null;
  var capturing = false;
  var mode = 'image';
  var dom = null;
  var listeners = {};
  var gpsConnected = false;

  function emit(name, detail) {
    (listeners[name] || []).slice().forEach(function (handler) { try { handler(detail); } catch (error) { console.error('[EbiAR AR]', error); } });
    if (EbiAR.events) EbiAR.events.emit('ar:' + name, detail);
  }
  function changeState(next, detail) {
    var previous = state;
    state = next;
    emit('statechange', { previous: previous, current: next, detail: detail || null });
  }
  function supportedCamera() { return !!(global.navigator && global.navigator.mediaDevices && typeof global.navigator.mediaDevices.getUserMedia === 'function'); }
  function isLocalhost() { return global.location && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(global.location.hostname); }
  function userMessage(error) {
    if (!error) return 'カメラを使えないため、簡易ARモードで遊べます。';
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'カメラの利用が許可されませんでした。端末の設定を確認してください。';
    if (error.name === 'NotFoundError') return '利用できるカメラが見つかりませんでした。';
    if (error.name === 'NotReadableError') return 'カメラは他のアプリで使用中の可能性があります。';
    return 'カメラを開始できませんでした。簡易ARモードで遊べます。';
  }
  function character() { return EbiAR.character && EbiAR.character.getById ? EbiAR.character.getById(characterId) : null; }
  function byId(id) { return dom && dom.root.querySelector('#' + id); }

  /** 全画面ARオーバーレイを必要になった時だけ作成する。 */
  function ensureDom() {
    if (dom) return dom;
    if (!global.document || !global.document.body) throw new Error('AR画面を作成できません。');
    var root = document.createElement('section'); root.id = 'ebi-ar'; root.className = 'ebi-ar'; root.hidden = true;
    root.innerHTML = '<video id="ar-video" autoplay muted playsinline></video><div id="ar-fallback" class="ar-fallback" hidden></div><header class="ar-header"><button type="button" id="ar-close" class="ar-icon-button" aria-label="ARを閉じる">×</button><div><strong id="ar-spot-name">海老フライ王国AR</strong><span id="ar-mode-label"></span></div></header><div id="ar-character-stage" class="ar-character-stage" role="button" tabindex="0" aria-label="キャラクターをつかまえる"><div id="ar-character-idle" class="character-idle"><div class="character-idle-float"><div class="character-idle-sway"><div class="character-idle-jump"><img id="ar-character-image" alt=""><div id="ar-character-fallback" class="ar-character-fallback" hidden>🦐</div></div></div></div></div></div><aside class="ar-panel"><div><strong id="ar-character-name">キャラクターを探そう</strong><span id="ar-character-rarity"></span></div><p id="ar-message">安全な場所に立ち止まって、画面の中から探そう。</p><div class="ar-actions"><button type="button" id="ar-capture">つかまえる</button><button type="button" id="ar-photo" class="ar-secondary">写真を撮る</button></div></aside><p class="ar-safety">歩きながら画面を操作しないでください。<br>安全な場所に立ち止まって遊びましょう。<br>私有地や立入禁止区域には入らないでください。</p><div id="ar-error" class="ar-error" hidden></div><section id="ar-discovery" class="ar-discovery" hidden><p>スポットで気配を感じる…</p><h2>海老を発見！</h2><strong id="ar-discovery-name"></strong><p id="ar-discovery-rarity"></p><button type="button" id="ar-search">ARで探す</button><button type="button" id="ar-discovery-close" class="ar-secondary">あとで探す</button></section>';
    document.body.appendChild(root);
    dom = { root: root, video: root.querySelector('#ar-video'), fallback: root.querySelector('#ar-fallback'), stage: root.querySelector('#ar-character-stage'), idle: root.querySelector('#ar-character-idle'), image: root.querySelector('#ar-character-image'), characterFallback: root.querySelector('#ar-character-fallback'), capture: root.querySelector('#ar-capture'), photo: root.querySelector('#ar-photo'), close: root.querySelector('#ar-close'), discovery: root.querySelector('#ar-discovery'), search: root.querySelector('#ar-search'), discoveryClose: root.querySelector('#ar-discovery-close') };
    dom.close.addEventListener('click', stop);
    dom.capture.addEventListener('click', capture);
    dom.photo.addEventListener('click', function () { takePhoto().catch(showError); });
    dom.stage.addEventListener('click', capture);
    dom.stage.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); capture(); } });
    document.addEventListener('visibilitychange', function () { if (document.hidden && isRunning()) stop(); });
    dom.search.addEventListener('click', function () { start(characterId); });
    dom.discoveryClose.addEventListener('click', function () { dom.discovery.hidden = true; dom.root.hidden = true; });
    return dom;
  }
  function showError(error) {
    var target = byId('ar-error'); if (!target) return;
    target.textContent = typeof error === 'string' ? error : userMessage(error);
    target.hidden = false;
  }
  function setMessage(message) { var target = byId('ar-message'); if (target) target.textContent = message; }
  function currentSpotName(definition) { var spot = definition && EbiAR.spots && EbiAR.spots.getById ? EbiAR.spots.getById(definition.appearanceArea) : null; return spot ? spot.name : '日野町のスポット'; }
  function playCharacterSounds(definition) {
    if (!EbiAR.sound || !definition) return;
    EbiAR.sound.playSe('spotArrived');
    EbiAR.sound.playSe('characterFound');
    if (definition.sound && EbiAR.sound.configure) {
      EbiAR.sound.configure({ se: { characterVoice: definition.sound, rareCharacter: definition.sound } });
      EbiAR.sound.playSe('characterVoice');
      var rarity = EbiAR.character.rarities && EbiAR.character.rarities[definition.rarity];
      if (rarity && rarity.rank >= 4) EbiAR.sound.playSe('rareCharacter');
    }
  }

  /** キャラクター情報を画像優先でARレイヤーに表示する。 */
  function renderCharacter() {
    var definition = character();
    if (!definition || !dom) return false;
    var rarity = definition.rarityInfo || (EbiAR.character && EbiAR.character.rarities && EbiAR.character.rarities[definition.rarity]);
    byId('ar-spot-name').textContent = currentSpotName(definition);
    byId('ar-character-name').textContent = definition.name;
    byId('ar-character-rarity').textContent = rarity ? rarity.name : definition.rarity;
    dom.image.alt = definition.name;
    dom.image.hidden = false; dom.characterFallback.hidden = true;
    dom.image.onerror = function () {
      dom.image.hidden = true;
      dom.characterFallback.hidden = false;
      if (EbiAR.idle) EbiAR.idle.stop(dom.idle);
    };
    dom.image.src = definition.image || '';
    if (EbiAR.Blink) EbiAR.Blink.start(dom.image, definition.id);
    if (EbiAR.idle) EbiAR.idle.start(dom.idle, { mode: 'ar' });
    dom.stage.classList.remove('is-captured');
    dom.stage.classList.add('is-appearing');
    global.setTimeout(function () { if (dom) dom.stage.classList.remove('is-appearing'); }, 420);
    // v2ではdefinition.arModelをWebXR/WebGLレンダラーへ渡せる。
    mode = definition.arModel && global.navigator && global.navigator.xr ? 'image-ready-for-webxr' : 'image';
    return true;
  }
  /** GPSスポットの候補から未取得キャラクターをランダムに選び、発見画面を開く。 */
  function showDiscovery(spot) {
    if (isRunning() || state === STATES.REQUESTING || state === STATES.STARTING || !spot) return null;
    var gameState = EbiAR.game && EbiAR.game.getState ? EbiAR.game.getState() : null;
    var acquired = gameState && gameState.character && gameState.character.discoveredEbi || [];
    var ids = (spot.characters || spot.spawnCharacterIds || []).filter(function (id) { return acquired.indexOf(id) === -1 && EbiAR.character && EbiAR.character.getById && EbiAR.character.getById(id); });
    if (!ids.length) return null;
    var id = ids[Math.floor(Math.random() * ids.length)];
    setCharacter(id); ensureDom();
    var definition = character(); var rarity = EbiAR.character.rarities && EbiAR.character.rarities[definition.rarity];
    byId('ar-discovery-name').textContent = definition.name;
    byId('ar-discovery-rarity').textContent = rarity ? rarity.name : definition.rarity;
    dom.root.hidden = false; dom.discovery.hidden = false;
    emit('discovered', { character: definition, spot: spot });
    return definition;
  }
  function stopTracks() {
    if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
    stream = null;
    if (dom) { dom.video.pause(); dom.video.srcObject = null; }
  }
  function enterFallback(message) {
    stopTracks();
    mode = 'fallback';
    dom.video.hidden = true; dom.fallback.hidden = false;
    byId('ar-mode-label').textContent = '簡易ARモード';
    setMessage(message || 'カメラなしの簡易ARモードです。キャラクターをタップしてつかまえよう。');
    changeState(STATES.RUNNING, { mode: mode });
    emit('started', { characterId: characterId, mode: mode });
  }

  /**
   * ARを開始する。カメラが使えない場合でも簡易ARモードを開始する。
   * @param {string} nextCharacterId キャラクターID
   * @returns {Promise<boolean>}
   */
  async function start(nextCharacterId) {
    if (nextCharacterId) setCharacter(nextCharacterId);
    if (!character()) { showError('キャラクター情報を読み込めません。'); changeState(STATES.ERROR); return false; }
    ensureDom();
    dom.discovery.hidden = true;
    if (isRunning()) { renderCharacter(); return true; }
    dom.root.hidden = false; byId('ar-error').hidden = true; renderCharacter();
    changeState(STATES.REQUESTING);
    if (!supportedCamera() || (!global.isSecureContext && !isLocalhost())) {
      enterFallback(!supportedCamera() ? 'この端末ではカメラを使えないため、簡易ARモードで遊べます。' : 'カメラはHTTPSまたはlocalhostで利用できます。簡易ARモードで遊べます。');
      return true;
    }
    try {
      changeState(STATES.STARTING);
      stream = await global.navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      dom.video.hidden = false; dom.fallback.hidden = true; dom.video.srcObject = stream;
      await dom.video.play();
      mode = 'camera'; byId('ar-mode-label').textContent = 'カメラAR'; setMessage('キャラクターを見つけたら、タップしてつかまえよう。');
      changeState(STATES.RUNNING, { mode: mode }); emit('started', { characterId: characterId, mode: mode });
      playCharacterSounds(character());
      if (EbiAR.effect) EbiAR.effect.characterAppear(character());
      return true;
    } catch (error) {
      emit('error', { error: error, message: userMessage(error), fallback: true });
      showError(userMessage(error)); enterFallback(userMessage(error));
      return true;
    }
  }
  function isRunning() { return state === STATES.RUNNING || state === STATES.CAPTURING || state === STATES.CAPTURED; }
  /** AR画面とカメラストリームを完全に終了する。 */
  function stop() {
    if (EbiAR.Blink && dom) EbiAR.Blink.stop(dom.image);
    if (EbiAR.idle && dom) EbiAR.idle.stop(dom.idle);
    if (state === STATES.IDLE) { if (dom) { dom.root.hidden = true; dom.discovery.hidden = true; } return; }
    if (state === STATES.STOPPING) return;
    changeState(STATES.STOPPING); stopTracks();
    if (dom) { dom.root.hidden = true; dom.discovery.hidden = true; }
    capturing = false; mode = 'image'; changeState(STATES.IDLE); emit('stopped', { characterId: characterId });
  }
  function setCharacter(id) {
    if (!EbiAR.character || !EbiAR.character.getById || !EbiAR.character.getById(id)) return false;
    characterId = id; if (dom && isRunning()) renderCharacter(); return true;
  }

  /** AR画面上でキャラクターを一度だけ捕獲する。 */
  async function capture() {
    // captured状態では自動終了まで再捕獲を受け付けない。
    if (state !== STATES.RUNNING || capturing || !characterId) return { ok: false, reason: 'not_ready' };
    capturing = true; changeState(STATES.CAPTURING);
    if (EbiAR.idle && dom) EbiAR.idle.stop(dom.idle);
    if (dom) { dom.capture.disabled = true; dom.stage.classList.add('is-capturing'); }
    var result;
    try {
      if (!EbiAR.game || typeof EbiAR.game.acquireCharacter !== 'function') throw new Error('ゲームの捕獲機能を準備できません。');
      result = EbiAR.game.acquireCharacter(characterId);
      if (!result.ok) { setMessage(result.reason === 'already_acquired' ? 'このキャラクターはすでに図鑑にいます。' : 'つかまえられませんでした。GPSの精度を確認してね。'); changeState(STATES.RUNNING); return result; }
      if (dom) dom.stage.classList.add('is-captured');
      if (EbiAR.save) { try { EbiAR.save.saveGame(); } catch (saveError) { emit('error', { error: saveError, message: '捕獲しましたが、保存に失敗しました。' }); } }
      changeState(STATES.CAPTURED, result); emit('captured', result);
      setMessage(result.character.name + ' をつかまえた！');
      global.setTimeout(stop, 1050);
      return result;
    } catch (error) {
      changeState(STATES.ERROR, error); emit('error', { error: error, message: '捕獲処理でエラーが発生しました。' }); showError('捕獲処理でエラーが発生しました。'); return { ok: false, reason: 'capture_error' };
    } finally {
      capturing = false;
      if (dom) { dom.capture.disabled = false; dom.stage.classList.remove('is-capturing'); }
      if (state === STATES.RUNNING && EbiAR.idle && dom) EbiAR.idle.start(dom.idle, { mode: 'ar' });
    }
  }

  /** カメラ映像・キャラクター・タイトルをGPS情報なしでPNG合成する。 */
  function takePhoto() {
    if (!isRunning() || !dom) return Promise.reject(new Error('ARを開始してから写真を撮ってください。'));
    var definition = character(); var width = dom.video.videoWidth || 1080; var height = dom.video.videoHeight || 1440;
    var photo = document.createElement('canvas'); photo.width = width; photo.height = height; var ctx = photo.getContext('2d');
    if (mode === 'camera' && dom.video.readyState >= 2) ctx.drawImage(dom.video, 0, 0, width, height);
    else { var gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, '#75c99a'); gradient.addColorStop(1, '#fff0ca'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height); }
    function complete() {
      ctx.fillStyle = 'rgba(0,0,0,.58)'; ctx.fillRect(0, 0, width, 120); ctx.fillStyle = '#fff'; ctx.font = 'bold 42px sans-serif'; ctx.fillText('海老フライ王国AR ～日野町大冒険～', 32, 52); ctx.font = 'bold 34px sans-serif'; ctx.fillText(definition ? definition.name : '海老フライ', 32, 98);
      return new Promise(function (resolve) { photo.toBlob(function (blob) { if (!blob) { resolve(null); return; } var url = global.URL.createObjectURL(blob); resolve({ blob: blob, url: url, filename: 'ebi-ar-' + Date.now() + '.png', download: function () { var link = document.createElement('a'); link.href = url; link.download = 'ebi-ar-photo.png'; link.click(); }, share: async function () { if (!global.navigator.share || typeof global.File !== 'function') { this.download(); return false; } await global.navigator.share({ title: '海老フライ王国AR', files: [new global.File([blob], 'ebi-ar-photo.png', { type: 'image/png' })] }); return true; } }); }, 'image/png'); });
    }
    if (definition && dom.image && !dom.image.hidden && dom.image.complete && dom.image.naturalWidth) { var size = Math.min(width, height) * .42; ctx.drawImage(dom.image, width / 2 - size / 2, height / 2 - size / 2, size, size); }
    else { ctx.font = '180px sans-serif'; ctx.fillText('🦐', width / 2 - 90, height / 2); }
    return complete();
  }
  function getState() { return Object.freeze({ state: state, characterId: characterId, mode: mode, running: isRunning(), cameraSupported: supportedCamera(), usingCamera: !!stream, canUseWebXR: !!(global.navigator && global.navigator.xr) }); }
  function on(name, handler) { if (typeof handler !== 'function') return function () {}; (listeners[name] || (listeners[name] = [])).push(handler); return function () { off(name, handler); }; }
  function off(name, handler) { if (listeners[name]) listeners[name] = listeners[name].filter(function (candidate) { return candidate !== handler; }); }

  function connectGps() {
    if (gpsConnected || !EbiAR.events) return;
    gpsConnected = true;
    EbiAR.events.on('gps:spot-arrived', function (event) { showDiscovery(event.spot); });
  }

  EbiAR.ar = Object.freeze({ start: start, stop: stop, isSupported: supportedCamera, isRunning: isRunning, capture: capture, setCharacter: setCharacter, takePhoto: takePhoto, getState: getState, on: on, off: off, showDiscovery: showDiscovery, STATES: STATES });
  connectGps();
})(window);
