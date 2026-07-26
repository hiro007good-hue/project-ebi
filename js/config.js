/* 海老フライ王国AR - 公開設定
 * 公開前に ASSET_BASE_URL / PRIVACY_POLICY_URL / SUPPORT_URL を確認してください。
 */
(function (global) {
  'use strict';

  var existing = global.EbiAR || {};
  var center = { latitude: 35.0089, longitude: 136.2477 }; // 滋賀県日野町役場付近

  var config = {
    app: {
      id: 'jp.hino.ebifrykingdom.ar',
      name: '海老フライ王国AR ～日野町大冒険～',
      version: '1.0.0',
      locale: 'ja-JP',
      production: true
    },
    map: {
      townCenter: center,
      playableRadiusMeters: 12000,
      defaultZoom: 15
    },
    gps: {
      enableHighAccuracy: true,
      timeoutMs: 15000,
      maximumAgeMs: 5000,
      minAccuracyMeters: 80,
      updateDistanceMeters: 5
    },
    gameplay: {
      encounterRadiusMeters: 35,
      collectionRadiusMeters: 25,
      maxLevel: 50,
      startingCoins: 0,
      dailyResetHour: 4
    },
    storage: {
      key: 'ebi-ar-save-v1',
      schemaVersion: 1
    },
    assets: {
      baseUrl: './',
      imagePath: 'images/',
      modelPath: 'models/',
      soundPath: 'sounds/'
    },
    links: {
      privacyPolicy: '',
      support: ''
    }
  };

  // 画面・各モジュール間で使う軽量イベントバス。
  var listeners = {};
  var events = {
    on: function (name, callback) {
      if (typeof callback !== 'function') return function () {};
      (listeners[name] || (listeners[name] = [])).push(callback);
      return function () { events.off(name, callback); };
    },
    off: function (name, callback) {
      if (!listeners[name]) return;
      listeners[name] = listeners[name].filter(function (fn) { return fn !== callback; });
    },
    emit: function (name, detail) {
      (listeners[name] || []).slice().forEach(function (callback) {
        try { callback(detail); } catch (error) { console.error('[EbiAR event]', name, error); }
      });
    }
  };

  existing.config = Object.freeze(config);
  existing.events = events;
  global.EbiAR = existing;
})(window);
