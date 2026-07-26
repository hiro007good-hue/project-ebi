/* GPS取得・距離計算・位置情報の品質判定 */
(function (global) {
  'use strict';
  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var watchId = null;
  var lastPosition = null;
  var activeSpotIds = {};
  var latestNearbySpots = [];

  function toRadians(value) { return value * Math.PI / 180; }

  function distanceMeters(from, to) {
    if (!from || !to || !isFinite(from.latitude) || !isFinite(to.latitude)) return Infinity;
    var earthRadius = 6371000;
    var dLat = toRadians(to.latitude - from.latitude);
    var dLng = toRadians(to.longitude - from.longitude);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function normalize(position) {
    var coords = position.coords;
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : Infinity,
      altitude: coords.altitude,
      heading: coords.heading,
      speed: coords.speed,
      timestamp: position.timestamp || Date.now()
    };
  }

  function statusFor(point) {
    var config = EbiAR.config;
    var distanceFromTown = distanceMeters(point, config.map.townCenter);
    if (point.accuracy > config.gps.minAccuracyMeters) return 'low_accuracy';
    if (distanceFromTown > config.map.playableRadiusMeters) return 'outside_area';
    return 'ready';
  }

  /* spots.js は gps.js の後に読み込まれてもよい。存在する時だけ連携する。 */
  function getNearbySpots(point) {
    if (!EbiAR.spots || typeof EbiAR.spots.findNearby !== 'function') return [];
    try {
      return EbiAR.spots.findNearby(point).filter(function (spot) { return spot.isNearby; });
    } catch (error) {
      console.error('[EbiAR GPS] spot lookup failed', error);
      return [];
    }
  }

  function emitSpotLeft(id, point, reason) {
    var spot = activeSpotIds[id];
    if (!spot) return;
    delete activeSpotIds[id];
    EbiAR.events.emit('gps:spot-left', { spot: spot, position: point || lastPosition, reason: reason || 'left_radius' });
  }

  function updateSpotState(point, status) {
    if (status !== 'ready') {
      Object.keys(activeSpotIds).forEach(function (id) { emitSpotLeft(id, point, 'gps_' + status); });
      latestNearbySpots = [];
      EbiAR.events.emit('gps:spots-updated', { position: point, status: status, nearbySpots: [], activeSpots: [] });
      return [];
    }

    var nearby = getNearbySpots(point);
    var nearbyById = {};
    nearby.forEach(function (spot) { nearbyById[spot.id] = spot; });
    Object.keys(activeSpotIds).forEach(function (id) {
      if (!nearbyById[id]) emitSpotLeft(id, point, 'left_radius');
    });
    nearby.forEach(function (spot) {
      if (activeSpotIds[spot.id]) {
        activeSpotIds[spot.id] = spot;
        return;
      }
      activeSpotIds[spot.id] = spot;
      // AR/UIはこのイベントでモデル候補・ガイド・出現キャラクターを取得できる。
      EbiAR.events.emit('gps:spot-arrived', { spot: spot, position: point, distanceMeters: spot.distanceMeters });
    });
    latestNearbySpots = nearby;
    EbiAR.events.emit('gps:spots-updated', {
      position: point,
      status: status,
      nearbySpots: nearby.slice(),
      activeSpots: Object.keys(activeSpotIds).map(function (id) { return activeSpotIds[id]; })
    });
    return nearby;
  }

  function publish(position) {
    var point = normalize(position);
    var moved = !lastPosition || distanceMeters(lastPosition, point) >= EbiAR.config.gps.updateDistanceMeters;
    lastPosition = point;
    if (!moved) return;
    var status = statusFor(point);
    EbiAR.events.emit('gps:update', { position: point, status: status });
    updateSpotState(point, status);
  }

  function publishError(error) {
    var messages = {
      1: '位置情報の利用が許可されていません。端末の設定から許可してください。',
      2: '現在地を取得できませんでした。屋外など電波の良い場所でお試しください。',
      3: '位置情報の取得がタイムアウトしました。'
    };
    var payload = { code: error.code || 0, message: messages[error.code] || '位置情報で予期しないエラーが発生しました。' };
    EbiAR.events.emit('gps:error', payload);
  }

  function options() {
    var gps = EbiAR.config.gps;
    return { enableHighAccuracy: gps.enableHighAccuracy, timeout: gps.timeoutMs, maximumAge: gps.maximumAgeMs };
  }

  function start() {
    if (!('geolocation' in navigator)) {
      publishError({ code: 0 });
      return false;
    }
    if (watchId !== null) return true;
    navigator.geolocation.getCurrentPosition(publish, publishError, options());
    watchId = navigator.geolocation.watchPosition(publish, publishError, options());
    EbiAR.events.emit('gps:started');
    return true;
  }

  function stop() {
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    Object.keys(activeSpotIds).forEach(function (id) { emitSpotLeft(id, lastPosition, 'stopped'); });
    latestNearbySpots = [];
    EbiAR.events.emit('gps:stopped');
  }

  function getPermission() {
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve('prompt');
    return navigator.permissions.query({ name: 'geolocation' }).then(function (result) {
      return result.state;
    }).catch(function () { return 'prompt'; });
  }

  EbiAR.gps = Object.freeze({
    start: start,
    stop: stop,
    getPermission: getPermission,
    getLastPosition: function () { return lastPosition; },
    getNearbySpots: function () { return latestNearbySpots.slice(); },
    getActiveSpots: function () { return Object.keys(activeSpotIds).map(function (id) { return activeSpotIds[id]; }); },
    refreshSpots: function () {
      if (!lastPosition) return [];
      return updateSpotState(lastPosition, statusFor(lastPosition));
    },
    distanceMeters: distanceMeters,
    statusFor: statusFor
  });
})(window);
