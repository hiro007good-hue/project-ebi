/* Project EBI - Safari/PWA Service Worker diagnostic (?swDiag=1 only) */
(function (global) {
  'use strict';

  var enabled = false;
  try { enabled = new global.URLSearchParams(global.location.search).get('swDiag') === '1'; }
  catch (error) { enabled = false; }
  if (!enabled || !global.document || global.document.getElementById('sw-diagnostic')) return;

  var latestResult = null;
  var panel = global.document.createElement('aside');
  panel.id = 'sw-diagnostic';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Safari Service Worker診断');
  panel.style.cssText = 'position:fixed;z-index:2147483646;top:8px;left:8px;right:8px;max-height:52vh;overflow:auto;padding:10px;border:2px solid #58d6ff;border-radius:8px;background:rgba(3,15,25,.94);color:#e8faff;font:12px/1.45 monospace;text-align:left;box-shadow:0 4px 18px rgba(0,0,0,.45);';

  var header = global.document.createElement('div');
  header.style.cssText = 'position:sticky;z-index:1;top:-10px;margin:-10px -10px 8px;padding:10px;background:#071c2b;border-bottom:1px solid #58d6ff;';
  var title = global.document.createElement('strong');
  title.textContent = 'Safari SW / Range診断';
  title.style.cssText = 'display:block;margin-bottom:7px;font:700 14px sans-serif;';
  var controls = global.document.createElement('div');
  controls.style.cssText = 'display:flex;gap:7px;flex-wrap:wrap;';
  var output = global.document.createElement('pre');
  output.id = 'sw-diagnostic-output';
  output.setAttribute('aria-live', 'polite');
  output.style.cssText = 'margin:0;white-space:pre-wrap;overflow-wrap:anywhere;';

  function makeButton(label, action) {
    var button = global.document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = 'min-height:40px;padding:7px 11px;border:1px solid #58d6ff;border-radius:6px;background:#11384f;color:#fff;font:600 13px sans-serif;touch-action:manipulation;';
    button.addEventListener('click', action);
    controls.appendChild(button);
    return button;
  }

  function workerInfo(worker) {
    return worker ? { scriptURL: worker.scriptURL || '', state: worker.state || '' } : null;
  }

  function standaloneState() {
    var mediaStandalone = false;
    try { mediaStandalone = !!(global.matchMedia && global.matchMedia('(display-mode: standalone)').matches); }
    catch (error) { mediaStandalone = false; }
    return { displayModeStandalone: mediaStandalone, navigatorStandalone: global.navigator.standalone === true };
  }

  function show(value) {
    latestResult = value;
    output.textContent = JSON.stringify(value, null, 2);
  }

  async function readState() {
    var supported = 'serviceWorker' in global.navigator;
    var state = {
      checkedAt: new Date().toISOString(),
      pageUrl: global.location.href,
      userAgent: global.navigator.userAgent,
      visibilityState: global.document.visibilityState,
      serviceWorkerSupported: supported,
      standalone: standaloneState(),
      controller: supported ? workerInfo(global.navigator.serviceWorker.controller) : null,
      registration: null,
      cacheNames: []
    };
    if (supported) {
      try {
        var registration = await global.navigator.serviceWorker.getRegistration('./');
        state.registration = registration ? {
          scope: registration.scope,
          updateViaCache: registration.updateViaCache || '',
          active: workerInfo(registration.active),
          waiting: workerInfo(registration.waiting),
          installing: workerInfo(registration.installing)
        } : null;
      } catch (error) {
        state.registrationError = { name: error.name || '', message: error.message || String(error) };
      }
    }
    if ('caches' in global) {
      try { state.cacheNames = await global.caches.keys(); }
      catch (error) { state.cacheError = { name: error.name || '', message: error.message || String(error) }; }
    }
    show(state);
    return state;
  }

  function responseInfo(response, bodyLength) {
    return {
      status: response.status,
      statusText: response.statusText,
      type: response.type,
      url: response.url,
      contentRange: response.headers.get('Content-Range'),
      acceptRanges: response.headers.get('Accept-Ranges'),
      contentLength: response.headers.get('Content-Length'),
      contentType: response.headers.get('Content-Type'),
      bodyLength: bodyLength
    };
  }

  async function runRangeDiagnostic(button) {
    button.disabled = true;
    show({ status: 'RUNNING', message: '通常取得後、同じURLへRange: bytes=0-1023を送信しています…' });
    var state = await readState();
    var probeUrl = new global.URL('./sounds/bgm-opening-future-2.mp3', global.document.baseURI);
    probeUrl.searchParams.set('swRangeDiag', String(Date.now()));
    try {
      var normal = await global.fetch(probeUrl.href);
      var normalBytes = await normal.arrayBuffer();
      var ranged = await global.fetch(probeUrl.href, { headers: { Range: 'bytes=0-1023' } });
      var rangedBytes = await ranged.arrayBuffer();
      var correctRange = ranged.status === 206 &&
        ranged.headers.get('Content-Range') === 'bytes 0-1023/8857391' &&
        Number(ranged.headers.get('Content-Length')) === 1024 &&
        rangedBytes.byteLength === 1024;
      var diagnosticStatus = !state.controller
        ? 'NO_SERVICE_WORKER_CONTROLLER'
        : (correctRange ? 'RANGE_FIX_ACTIVE' : 'RANGE_FIX_NOT_ACTIVE');
      var result = {
        status: diagnosticStatus,
        checkedAt: new Date().toISOString(),
        requestedRange: 'bytes=0-1023',
        probeUrl: probeUrl.href,
        controller: state.controller,
        registration: state.registration,
        normalResponse: responseInfo(normal, normalBytes.byteLength),
        rangeResponse: responseInfo(ranged, rangedBytes.byteLength)
      };
      show(result);
    } catch (error) {
      show({
        status: 'RANGE_DIAGNOSTIC_ERROR',
        checkedAt: new Date().toISOString(),
        controller: state.controller,
        registration: state.registration,
        error: { name: error.name || '', message: error.message || String(error) }
      });
    } finally {
      button.disabled = false;
    }
  }

  var refreshButton = makeButton('SW状態を再取得', function () { readState(); });
  var rangeButton = makeButton('Range診断を実行', function () { runRangeDiagnostic(rangeButton); });
  makeButton('結果をコピー', function () {
    if (!latestResult || !global.navigator.clipboard || !global.navigator.clipboard.writeText) return;
    global.navigator.clipboard.writeText(JSON.stringify(latestResult, null, 2)).catch(function () { return false; });
  });
  header.appendChild(title);
  header.appendChild(controls);
  panel.appendChild(header);
  panel.appendChild(output);
  global.document.body.appendChild(panel);

  if ('serviceWorker' in global.navigator) {
    global.navigator.serviceWorker.addEventListener('controllerchange', function () { readState(); });
  }
  readState();
}(window));
