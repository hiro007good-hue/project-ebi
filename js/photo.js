/* 海老フライ王国AR v1.0 - AR写真・端末共有管理 */
(function (global) {
  'use strict';

  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var OUTPUT_WIDTH = 1080;
  var OUTPUT_HEIGHT = 1350;
  var MIME_TYPE = 'image/png';
  var modal = null;
  var previewImage = null;
  var statusElement = null;
  var current = null;
  var busy = false;
  var initialized = false;
  var previousFocus = null;
  var flashRoot = null;
  var flashTimer = null;

  function emit(name, detail) {
    if (EbiAR.events) EbiAR.events.emit('photo:' + name, detail);
  }

  function safeId(value) {
    return /^[a-z0-9-]+$/.test(String(value || '')) ? String(value) : 'character';
  }

  function pad(value) { return String(value).padStart(2, '0'); }

  function filename(characterId, date) {
    date = date || new Date();
    var stamp = date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + '-' + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
    return 'project-ebi-' + safeId(characterId) + '-' + stamp + '.png';
  }

  function setStatus(message, isError) {
    if (!statusElement) return;
    statusElement.textContent = message || '';
    statusElement.classList.toggle('is-error', !!isError);
  }

  function revokeCurrentUrl() {
    if (current && current.url) global.URL.revokeObjectURL(current.url);
    if (current) current.url = null;
  }

  function isIOS() {
    var navigator = global.navigator || {};
    return /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function canShareFiles(file) {
    if (!global.navigator || typeof global.navigator.share !== 'function' || typeof global.File !== 'function') return false;
    if (typeof global.navigator.canShare !== 'function') return false;
    try { return global.navigator.canShare({ files: [file] }); }
    catch (error) { return false; }
  }

  function ensureCanvas(width, height) {
    if (!global.document || typeof global.document.createElement !== 'function') throw new Error('写真を作成できる環境ではありません。');
    var canvas = global.document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    var context = canvas.getContext && canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('写真用Canvasを作成できませんでした。');
    context.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in context) context.imageSmoothingQuality = 'high';
    return { canvas: canvas, context: context };
  }

  function drawCover(context, source, sourceWidth, sourceHeight, x, y, width, height) {
    if (!sourceWidth || !sourceHeight) throw new Error('カメラフレームを取得できませんでした。');
    var sourceRatio = sourceWidth / sourceHeight;
    var targetRatio = width / height;
    var sx = 0, sy = 0, sw = sourceWidth, sh = sourceHeight;
    if (sourceRatio > targetRatio) { sw = sourceHeight * targetRatio; sx = (sourceWidth - sw) / 2; }
    else { sh = sourceWidth / targetRatio; sy = (sourceHeight - sh) / 2; }
    context.drawImage(source, sx, sy, sw, sh, x, y, width, height);
  }

  function drawFallbackBackground(context, width, height) {
    var gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#75c99a'); gradient.addColorStop(0.58, '#bfe7c7'); gradient.addColorStop(1, '#fff0ca');
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(255,255,255,.13)';
    for (var index = 0; index < 7; index += 1) {
      context.beginPath();
      context.arc(width * (0.08 + index * 0.15), height * (0.18 + (index % 3) * 0.12), width * 0.05, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawBrand(context) {
    var bandHeight = 132;
    var gradient = context.createLinearGradient(0, OUTPUT_HEIGHT - bandHeight, 0, OUTPUT_HEIGHT);
    gradient.addColorStop(0, 'rgba(20,12,7,0)'); gradient.addColorStop(0.38, 'rgba(20,12,7,.68)'); gradient.addColorStop(1, 'rgba(20,12,7,.88)');
    context.fillStyle = gradient; context.fillRect(0, OUTPUT_HEIGHT - bandHeight, OUTPUT_WIDTH, bandHeight);
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#fffaf0';
    context.font = '700 42px sans-serif'; context.fillText('海老フライ王国AR', OUTPUT_WIDTH / 2, OUTPUT_HEIGHT - 70);
    context.font = '500 25px sans-serif'; context.fillStyle = '#ffe4bd'; context.fillText('～日野町大冒険～', OUTPUT_WIDTH / 2, OUTPUT_HEIGHT - 29);
  }

  function drawSurfaceToOutput(context, surface) {
    context.fillStyle = '#1b120b'; context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    var sourceRatio = surface.width / surface.height;
    var targetRatio = OUTPUT_WIDTH / OUTPUT_HEIGHT;
    // 横長画面は風景を切り過ぎないようレターボックス、縦画面は4:5へ中央トリミングする。
    if (sourceRatio > 1) {
      var containedHeight = Math.round(OUTPUT_WIDTH / sourceRatio);
      context.drawImage(surface, 0, Math.round((OUTPUT_HEIGHT - containedHeight) / 2), OUTPUT_WIDTH, containedHeight);
    } else {
      var sx = 0, sy = 0, sw = surface.width, sh = surface.height;
      if (sourceRatio > targetRatio) { sw = surface.height * targetRatio; sx = (surface.width - sw) / 2; }
      else { sh = surface.width / targetRatio; sy = (surface.height - sh) / 2; }
      context.drawImage(surface, sx, sy, sw, sh, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    }
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('写真データの生成に失敗しました。')); return; }
          resolve(blob);
        }, MIME_TYPE);
      } catch (error) { reject(new Error('写真データの生成に失敗しました。'));
      }
    });
  }

  function flash(root) {
    if (!root || !root.classList || (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    if (flashTimer) global.clearTimeout(flashTimer);
    if (flashRoot && flashRoot !== root) flashRoot.classList.remove('is-photo-flashing');
    flashRoot = root; root.classList.add('is-photo-flashing');
    flashTimer = global.setTimeout(function () { if (flashRoot) flashRoot.classList.remove('is-photo-flashing'); flashTimer = null; }, 140);
  }

  function buildPhoto(options) {
    var rootRect = options.root && options.root.getBoundingClientRect ? options.root.getBoundingClientRect() : null;
    if (!rootRect || rootRect.width <= 0 || rootRect.height <= 0) throw new Error('AR画面のサイズを取得できませんでした。');
    var surfaceWidth = OUTPUT_WIDTH;
    var surfaceHeight = Math.max(608, Math.min(2160, Math.round(surfaceWidth * rootRect.height / rootRect.width)));
    var surfacePair = ensureCanvas(surfaceWidth, surfaceHeight);
    var surface = surfacePair.canvas, surfaceContext = surfacePair.context;

    if (options.mode === 'camera' && options.video && options.video.readyState >= 2 && options.video.videoWidth && options.video.videoHeight) {
      drawCover(surfaceContext, options.video, options.video.videoWidth, options.video.videoHeight, 0, 0, surfaceWidth, surfaceHeight);
    } else {
      drawFallbackBackground(surfaceContext, surfaceWidth, surfaceHeight);
    }

    var characterRect = options.characterImage && options.characterImage.getBoundingClientRect ? options.characterImage.getBoundingClientRect() : null;
    var drawable = options.characterImage && !options.characterImage.hidden && options.characterImage.complete && options.characterImage.naturalWidth > 0;
    if (!characterRect || characterRect.width <= 0 || characterRect.height <= 0) {
      characterRect = options.characterFallback && options.characterFallback.getBoundingClientRect ? options.characterFallback.getBoundingClientRect() : null;
    }
    if (characterRect && characterRect.width > 0 && characterRect.height > 0) {
      var x = (characterRect.left - rootRect.left) / rootRect.width * surfaceWidth;
      var y = (characterRect.top - rootRect.top) / rootRect.height * surfaceHeight;
      var width = characterRect.width / rootRect.width * surfaceWidth;
      var height = characterRect.height / rootRect.height * surfaceHeight;
      if (drawable) surfaceContext.drawImage(options.characterImage, x, y, width, height);
      else {
        surfaceContext.textAlign = 'center'; surfaceContext.textBaseline = 'middle'; surfaceContext.font = Math.max(80, Math.round(width * 0.55)) + 'px sans-serif';
        surfaceContext.fillText('🦐', x + width / 2, y + height / 2);
      }
    } else throw new Error('キャラクター画像の位置を取得できませんでした。');

    var outputPair = ensureCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
    drawSurfaceToOutput(outputPair.context, surface);
    drawBrand(outputPair.context);
    return outputPair.canvas;
  }

  function handleKeydown(event) {
    if (!modal || modal.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    var focusable = Array.from(modal.querySelectorAll('button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && global.document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && global.document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function handleClick(event) {
    if (event.target === modal) { close(); return; }
    var button = event.target.closest && event.target.closest('[data-photo-action]');
    if (!button) return;
    var action = button.dataset.photoAction;
    if (action === 'share') share();
    else if (action === 'download') download();
    else if (action === 'retake') retake();
    else if (action === 'close') close();
  }

  function handleVisibility() {
    if (!global.document.hidden || !flashRoot) return;
    flashRoot.classList.remove('is-photo-flashing');
    if (flashTimer) global.clearTimeout(flashTimer);
    flashTimer = null; flashRoot = null;
  }

  /** 写真プレビュー用DOMとライフサイクルリスナーを一度だけ初期化する。 */
  function initialize() {
    if (initialized) return true;
    if (!global.document || !global.document.body) return false;
    modal = global.document.createElement('section');
    modal.id = 'photo-preview'; modal.className = 'photo-preview'; modal.hidden = true;
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'photo-preview-title');
    modal.innerHTML = '<article class="photo-preview-panel"><header><h2 id="photo-preview-title">AR写真プレビュー</h2><button type="button" class="photo-preview-close" data-photo-action="close" aria-label="写真プレビューを閉じる">×</button></header><div class="photo-preview-image-wrap"><img id="photo-preview-image" alt="キャラクターと撮影したAR写真"></div><p id="photo-preview-status" class="photo-preview-status" aria-live="polite"></p><div class="photo-preview-actions"><button type="button" data-photo-action="share">共有する</button><button type="button" data-photo-action="download">保存する</button><button type="button" data-photo-action="retake" class="photo-secondary">撮り直す</button><button type="button" data-photo-action="close" class="photo-secondary">閉じる</button></div></article>';
    global.document.body.appendChild(modal);
    previewImage = modal.querySelector('#photo-preview-image');
    statusElement = modal.querySelector('#photo-preview-status');
    modal.addEventListener('click', handleClick);
    global.document.addEventListener('keydown', handleKeydown);
    global.document.addEventListener('visibilitychange', handleVisibility);
    global.addEventListener('pagehide', close);
    initialized = true;
    return true;
  }

  /** 現在のAR表示を端末内Canvasで1080×1350 PNGへ合成する。 */
  async function capture(options) {
    options = options || {};
    if (busy) return null;
    if (!initialize()) throw new Error('写真プレビューを準備できませんでした。');
    busy = true;
    var trigger = options.trigger;
    if (trigger) trigger.disabled = true;
    flash(options.root);
    try {
      var canvas = buildPhoto(options);
      var blob = await canvasToBlob(canvas);
      var metadata = {
        characterId: safeId(options.characterId),
        characterName: String(options.characterName || 'キャラクター'),
        mode: options.mode === 'camera' ? 'camera' : 'fallback',
        width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, mimeType: MIME_TYPE,
        filename: filename(options.characterId),
        title: '海老フライ王国AR ～日野町大冒険～',
        text: '日野町でキャラクターを見つけたよ！\n#海老フライ王国AR #日野町大冒険'
      };
      showPreview(blob, metadata, trigger);
      emit('captured', { metadata: Object.assign({}, metadata), size: blob.size });
      return Object.freeze({
        blob: blob, url: current && current.url, filename: metadata.filename,
        metadata: Object.freeze(Object.assign({}, metadata)),
        download: download, share: share
      });
    } catch (error) {
      setStatus(error && error.message ? error.message : '写真の作成に失敗しました。', true);
      emit('error', { action: 'capture', error: error });
      throw error;
    } finally {
      busy = false;
      if (trigger) trigger.disabled = false;
    }
  }

  /** 生成済みBlobを単一のプレビューモーダルへ表示する。 */
  function showPreview(blob, metadata, focusTarget) {
    if (!blob || !initialize()) return false;
    revokeCurrentUrl();
    previousFocus = focusTarget || global.document.activeElement;
    current = { blob: blob, metadata: Object.assign({}, metadata || {}), url: global.URL.createObjectURL(blob) };
    previewImage.src = current.url;
    modal.hidden = false;
    global.document.body.classList.add('is-photo-preview-open');
    setStatus(isIOS() ? '共有するか、保存時に表示される画像を長押しして写真へ保存できます。' : '写真は端末内で作成されました。共有または保存を選んでください。');
    var closeButton = modal.querySelector('.photo-preview-close');
    if (closeButton) closeButton.focus();
    emit('preview-open', { metadata: Object.assign({}, current.metadata) });
    return true;
  }

  /** Web Share APIで画像ファイルをOS共有シートへ渡す。 */
  async function share() {
    if (!current) return false;
    var file;
    try { file = new global.File([current.blob], current.metadata.filename, { type: MIME_TYPE }); }
    catch (error) { setStatus('このブラウザは写真ファイルの共有に対応していません。保存するをご利用ください。'); return false; }
    if (!canShareFiles(file)) { setStatus('写真共有に対応していません。保存後にSNSアプリから投稿してください。'); return false; }
    try {
      await global.navigator.share({ files: [file], title: current.metadata.title, text: current.metadata.text });
      setStatus('共有先を選択しました。'); emit('shared', { metadata: Object.assign({}, current.metadata) }); return true;
    } catch (error) {
      if (error && error.name === 'AbortError') return false;
      setStatus('共有できませんでした。保存するをご利用ください。', true); emit('error', { action: 'share', error: error }); return false;
    }
  }

  /** Blob URLを利用して端末保存を開始する。 */
  function download() {
    if (!current) return false;
    try {
      if (isIOS()) {
        var opened = global.open(current.url, '_blank', 'noopener');
        setStatus('表示された画像を長押しして「写真に保存」を選んでください。');
        return !!opened;
      }
      var link = global.document.createElement('a');
      link.href = current.url; link.download = current.metadata.filename; link.rel = 'noopener';
      global.document.body.appendChild(link); link.click(); link.remove();
      setStatus('写真の保存を開始しました。'); emit('downloaded', { metadata: Object.assign({}, current.metadata) }); return true;
    } catch (error) {
      setStatus('写真を保存できませんでした。共有する、または画像の長押し保存をお試しください。', true); emit('error', { action: 'download', error: error }); return false;
    }
  }

  function hidePreview(action) {
    if (!modal || modal.hidden) return false;
    modal.hidden = true;
    global.document.body.classList.remove('is-photo-preview-open');
    if (previewImage) previewImage.removeAttribute('src');
    revokeCurrentUrl(); current = null;
    if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
    previousFocus = null; setStatus(''); emit(action, {}); return true;
  }

  /** プレビューを閉じ、撮影ボタンへ戻る。 */
  function retake() { return hidePreview('retake'); }
  /** プレビューを閉じ、Blob URLを解放する。 */
  function close() { return hidePreview('preview-close'); }

  /** PhotoManagerが登録したDOM・URL・リスナーをすべて破棄する。 */
  function destroy() {
    if (!initialized) return;
    close();
    if (flashTimer) global.clearTimeout(flashTimer);
    if (flashRoot) flashRoot.classList.remove('is-photo-flashing');
    flashTimer = null; flashRoot = null;
    modal.removeEventListener('click', handleClick);
    global.document.removeEventListener('keydown', handleKeydown);
    global.document.removeEventListener('visibilitychange', handleVisibility);
    global.removeEventListener('pagehide', close);
    global.document.body.classList.remove('is-photo-preview-open');
    modal.remove(); modal = null; previewImage = null; statusElement = null; initialized = false;
  }

  EbiAR.photo = Object.freeze({ initialize: initialize, capture: capture, showPreview: showPreview, share: share, download: download, retake: retake, close: close, destroy: destroy });
})(window);
