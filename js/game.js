/* ゲーム進行の中核。UI / AR描画には依存しない。 */
(function (global) {
  'use strict';
  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.character || !EbiAR.gps) {
    throw new Error('config.js、character.js、gps.js を先に読み込んでください。');
  }

  // 正式な設置座標は現地確認・許諾後にこの配列へ登録する。
  var spots = [
    { id: 'hino-start', spotId: 'hino-machikado-kanno', name: '王国のはじまり', rewardXp: 30, rewardCoins: 10, type: 'landmark' }
  ];
  var state = null;
  var unsubscribeGps = null;
  var unsubscribeGpsError = null;

  function safeNumber(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function createState(saved) {
    saved = saved || {};
    return {
      schemaVersion: EbiAR.config.storage.schemaVersion,
      character: EbiAR.character.create(saved.character),
      collectedSpotIds: Array.isArray(saved.collectedSpotIds) ? saved.collectedSpotIds.filter(validSpotId) : [],
      activeSpotId: null,
      gpsStatus: 'idle',
      lastPosition: null,
      startedAt: saved.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function validSpotId(id) {
    return typeof id === 'string' && spots.some(function (spot) { return spot.id === id; });
  }

  function snapshot() {
    if (!state) return null;
    return JSON.parse(JSON.stringify(state));
  }

  function emitState() {
    if (!state) return;
    state.updatedAt = new Date().toISOString();
    EbiAR.events.emit('game:state', snapshot());
  }

  // GPS座標はspots.jsに集約する。latitude/longitudeを持つ旧形式も読み取り専用で受け付ける。
  function resolveSpotLocation(spot) {
    if (spot && spot.spotId && EbiAR.spots && typeof EbiAR.spots.getById === 'function') return EbiAR.spots.getById(spot.spotId);
    if (spot && Number.isFinite(Number(spot.latitude)) && Number.isFinite(Number(spot.longitude))) return spot;
    return null;
  }

  function availableSpots(position) {
    if (!position) return [];
    var radius = EbiAR.config.gameplay.collectionRadiusMeters;
    return spots.map(function (spot) {
      var location = resolveSpotLocation(spot);
      var distance = location ? EbiAR.gps.distanceMeters(position, location) : Infinity;
      return Object.assign({}, spot, location ? { latitude: location.latitude, longitude: location.longitude } : {}, {
        distanceMeters: Math.round(distance),
        isCollected: state.collectedSpotIds.indexOf(spot.id) >= 0,
        isNearby: distance <= radius
      });
    });
  }

  function handleGps(update) {
    if (!state) return;
    state.lastPosition = update.position;
    state.gpsStatus = update.status;
    if (update.status !== 'ready') {
      state.activeSpotId = null;
      emitState();
      return;
    }
    var nearby = availableSpots(update.position).filter(function (spot) { return spot.isNearby && !spot.isCollected; });
    state.activeSpotId = nearby.length ? nearby[0].id : null;
    emitState();
    if (state.activeSpotId) EbiAR.events.emit('game:spot-nearby', nearby[0]);
  }

  function initialize(savedState) {
    state = createState(savedState);
    if (unsubscribeGps) unsubscribeGps();
    if (unsubscribeGpsError) unsubscribeGpsError();
    unsubscribeGps = EbiAR.events.on('gps:update', handleGps);
    unsubscribeGpsError = EbiAR.events.on('gps:error', function () {
      if (!state) return;
      state.gpsStatus = 'error';
      emitState();
    });
    emitState();
    return snapshot();
  }

  function collectSpot(spotId) {
    if (!state) throw new Error('game.initialize() を先に呼び出してください。');
    if (state.gpsStatus !== 'ready') return { ok: false, reason: 'gps_unavailable' };
    var spot = availableSpots(state.lastPosition).filter(function (candidate) { return candidate.id === spotId; })[0];
    if (!spot) return { ok: false, reason: 'unknown_spot' };
    if (spot.isCollected) return { ok: false, reason: 'already_collected' };
    if (!spot.isNearby) return { ok: false, reason: 'too_far' };

    state.collectedSpotIds.push(spot.id);
    EbiAR.character.visit(state.character, spot.id);
    state.character.coins += safeNumber(spot.rewardCoins, 0);
    var experience = EbiAR.character.grantExperience(state.character, safeNumber(spot.rewardXp, 0));
    state.activeSpotId = null;
    emitState();
    var result = { ok: true, spot: spot, levelsGained: experience.levelsGained, state: snapshot() };
    EbiAR.events.emit('game:spot-collected', result);
    return result;
  }

  // AR・将来のイベント画面からも同じ取得ルールを利用できる入口。
  function acquireCharacter(characterId) {
    if (!state) throw new Error('game.initialize() を先に呼び出してください。');
    if (state.gpsStatus !== 'ready' || !state.lastPosition) return { ok: false, reason: 'gps_unavailable' };
    var result = EbiAR.character.acquire(state.character, characterId, state.lastPosition);
    if (!result.ok) return result;
    var definition = EbiAR.character.getById(characterId);
    var experience = EbiAR.character.grantExperience(state.character, definition ? definition.acquisitionPoints : 0);
    emitState();
    result.experienceAwarded = definition ? definition.acquisitionPoints : 0;
    result.playerLevelsGained = experience.levelsGained;
    result.state = snapshot();
    EbiAR.events.emit('game:character-acquired', result);
    return result;
  }

  /**
   * Quest / Achievement の報酬をゲーム状態へ安全に反映する。
   * @param {'points'|'experience'|'coins'|'coupon'|'title'} type
   * @param {number|string} value
   * @returns {boolean}
   */
  function grantReward(type, value) {
    if (!state || !state.character) return false;
    var character = state.character;
    if (type === 'points') {
      var points = Math.max(0, Math.floor(Number(value) || 0));
      if (!points) return false;
      character.points = safeNumber(character.points, 0) + points;
      EbiAR.events.emit('game:points-changed', { points: character.points, gained: points });
    } else if (type === 'experience') {
      if (Number(value) <= 0) return false;
      EbiAR.character.grantExperience(character, value);
    } else if (type === 'coins') {
      var coins = Math.max(0, Math.floor(Number(value) || 0));
      if (!coins) return false;
      character.coins = safeNumber(character.coins, 0) + coins;
    } else if (type === 'coupon') {
      if (typeof value !== 'string' || !value || character.coupons.indexOf(value) >= 0) return false;
      character.coupons.push(value);
      EbiAR.events.emit('coupon:acquired', { id: value });
    } else if (type === 'title') {
      value = String(value || '').slice(0, 32);
      if (!value || character.titles.indexOf(value) >= 0) return false;
      character.titles.push(value);
    } else {
      return false;
    }
    emitState();
    return true;
  }

  /**
   * Quest / Achievement を現在のゲーム状態と報酬APIへ接続する。
   * @returns {boolean}
   */
  function connectSystems() {
    if (!state) return false;
    var requireReward = function (type, value) {
      if (!grantReward(type, value)) throw new Error('Reward could not be applied: ' + type);
      return true;
    };
    var rewardAdapter = {
      addPoints: function (value) { return requireReward('points', value); },
      addExperience: function (value) { return requireReward('experience', value); },
      addCoins: function (value) { return requireReward('coins', value); },
      addCoupon: function (value) { return requireReward('coupon', value); },
      addTitle: function (value) { return requireReward('title', value); },
      unlockAchievement: function (id) { return EbiAR.Achievement && EbiAR.Achievement.unlock(id); }
    };
    var stateProvider = function (condition) {
      var character = state.character;
      if (!condition) return 0;
      if (condition.type === 'game_start') return 0;
      if (condition.type === 'level') return character.level;
      if (condition.type === 'points') return character.points;
      if (condition.type === 'collection' || condition.type === 'character_count') return character.discoveredEbi.length;
      if (condition.type === 'spot_count') return character.visitedSpots.length;
      if (condition.type === 'quest_count') {
        return EbiAR.Quest && EbiAR.Quest.getClaimed ? EbiAR.Quest.getClaimed().length : 0;
      }
      return 0;
    };
    if (EbiAR.Quest && typeof EbiAR.Quest.configure === 'function') {
      EbiAR.Quest.configure({ rewardAdapter: rewardAdapter, stateProvider: stateProvider });
    }
    if (EbiAR.Achievement && typeof EbiAR.Achievement.configure === 'function') {
      EbiAR.Achievement.configure({ rewardAdapter: rewardAdapter, stateProvider: stateProvider });
    }
    return true;
  }

  function setSpots(nextSpots) {
    if (!Array.isArray(nextSpots)) throw new TypeError('spots は配列で指定してください。');
    var ids = {};
    nextSpots.forEach(function (spot) {
      if (!spot || !/^[a-z0-9_-]{1,64}$/i.test(spot.id || '') || ids[spot.id] || !resolveSpotLocation(spot)) {
        throw new TypeError('スポット定義が不正です。');
      }
      ids[spot.id] = true;
    });
    spots = nextSpots.map(function (spot) { return Object.assign({}, spot); });
    if (state) state.collectedSpotIds = state.collectedSpotIds.filter(validSpotId);
    emitState();
  }

  EbiAR.game = Object.freeze({
    initialize: initialize,
    startGps: EbiAR.gps.start,
    stopGps: EbiAR.gps.stop,
    getState: snapshot,
    getSpots: function () { return availableSpots(state && state.lastPosition); },
    collectSpot: collectSpot,
    acquireCharacter: acquireCharacter,
    grantReward: grantReward,
    connectSystems: connectSystems,
    setSpots: setSpots,
    exportSave: snapshot
  });
})(window);
