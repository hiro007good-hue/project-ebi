/* 海老フライ王国AR v1.0 - ローカル保存エンジン */
(function (global) {
  'use strict';

  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var STORAGE_KEY = EbiAR.config.storage.key;
  var BACKUP_KEY = STORAGE_KEY + ':backup';
  var SAVE_VERSION = EbiAR.config.storage.schemaVersion;
  var AUTO_SAVE_INTERVAL_MS = 30000;
  var MAX_GPS_HISTORY = 20;
  var autoSaveTimer = null;
  var gpsHistory = [];
  var preservedData = {};
  var DEFAULT_AUDIO_SETTINGS = Object.freeze({ bgmEnabled: true, seEnabled: true, bgmVolume: 0.6, seVolume: 0.8 });
  var extras = { coupons: [], quest: null, achievement: null, story: null, ending: null, settings: {}, audioSettings: Object.assign({}, DEFAULT_AUDIO_SETTINGS) };

  /** 保存に失敗した際に、呼び出し側が原因を識別できるエラー。 */
  function SaveError(code, message, cause) {
    this.name = 'SaveError';
    this.code = code;
    this.message = message;
    this.cause = cause || null;
    if (Error.captureStackTrace) Error.captureStackTrace(this, SaveError);
  }
  SaveError.prototype = Object.create(Error.prototype);
  SaveError.prototype.constructor = SaveError;

  /** localStorageを安全に取得する。プライベートブラウズ等の例外も扱う。 */
  function storage() {
    try {
      if (!global.localStorage) throw new Error('localStorage is unavailable');
      return global.localStorage;
    } catch (error) {
      throw new SaveError('storage_unavailable', 'このブラウザではゲームデータを保存できません。', error);
    }
  }

  /** FNV-1aによる軽量な改ざん・破損検知用チェックサム（暗号化ではない）。 */
  function checksum(text) {
    var hash = 0x811c9dc5;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  /** JSONとして保存可能な値だけをコピーする。 */
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /** 配列をID文字列の重複なしリストへ正規化する。 */
  function idList(values) {
    if (!Array.isArray(values)) return [];
    return values.filter(function (value, index, array) {
      return typeof value === 'string' && value.length <= 128 && array.indexOf(value) === index;
    });
  }

  /** 保存済みGPS履歴を最大件数に切り詰める。 */
  function normalizeGpsHistory(history) {
    if (!Array.isArray(history)) return [];
    return history.filter(function (item) {
      return item && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)) && Number.isFinite(Number(item.timestamp));
    }).slice(-MAX_GPS_HISTORY).map(function (item) {
      return { latitude: Number(item.latitude), longitude: Number(item.longitude), accuracy: Number(item.accuracy) || null, timestamp: Number(item.timestamp) };
    });
  }

  /** 旧Saveに音声設定がない場合もSave全体を初期化せず既定値だけ補完する。 */
  function normalizeAudioSettings(value) {
    value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    function volume(name) {
      var number = Number(value[name]);
      return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : DEFAULT_AUDIO_SETTINGS[name];
    }
    return {
      bgmEnabled: typeof value.bgmEnabled === 'boolean' ? value.bgmEnabled : DEFAULT_AUDIO_SETTINGS.bgmEnabled,
      seEnabled: typeof value.seEnabled === 'boolean' ? value.seEnabled : DEFAULT_AUDIO_SETTINGS.seEnabled,
      bgmVolume: volume('bgmVolume'),
      seVolume: volume('seVolume')
    };
  }

  /** 実行中のgame.jsから保存対象を収集する。 */
  function collectGameState() {
    var gameState = EbiAR.game && typeof EbiAR.game.exportSave === 'function' ? EbiAR.game.exportSave() : null;
    var character = gameState && gameState.character ? gameState.character : (EbiAR.character && EbiAR.character.create ? EbiAR.character.create() : {});
    return Object.assign({}, clone(preservedData), {
      player: clone(character),
      game: {
        collectedSpotIds: idList(gameState && gameState.collectedSpotIds),
        activeSpotId: gameState && typeof gameState.activeSpotId === 'string' ? gameState.activeSpotId : null,
        startedAt: gameState && gameState.startedAt ? gameState.startedAt : null
      },
      coupons: clone(character.coupons || extras.coupons),
      quest: EbiAR.Quest && typeof EbiAR.Quest.exportState === 'function' ? EbiAR.Quest.exportState() : clone(extras.quest),
      achievement: EbiAR.Achievement && typeof EbiAR.Achievement.exportState === 'function' ? EbiAR.Achievement.exportState() : clone(extras.achievement),
      story: EbiAR.Story && typeof EbiAR.Story.exportState === 'function' ? EbiAR.Story.exportState() : clone(extras.story),
      ending: EbiAR.Ending && typeof EbiAR.Ending.exportState === 'function' ? EbiAR.Ending.exportState() : clone(extras.ending),
      settings: clone(extras.settings),
      audioSettings: EbiAR.sound && typeof EbiAR.sound.getSettings === 'function' ? clone(EbiAR.sound.getSettings()) : clone(extras.audioSettings),
      gpsHistory: normalizeGpsHistory(gpsHistory)
    });
  }

  /**
   * 保存データをアプリ内部の安定形式へ正規化する。
   * @param {object} data 保存データ
   * @returns {object} 正規化済みデータ
   */
  function normalizeData(data) {
    data = data || {};
    var player = EbiAR.character && EbiAR.character.create ? EbiAR.character.create(data.player || data.character) : clone(data.player || data.character || {});
    if (!player.coupons.length && Array.isArray(data.coupons)) player.coupons = idList(data.coupons);
    return Object.assign({}, clone(data), {
      player: player,
      game: {
        collectedSpotIds: idList(data.game && data.game.collectedSpotIds || data.collectedSpotIds),
        activeSpotId: data.game && typeof data.game.activeSpotId === 'string' ? data.game.activeSpotId : null,
        startedAt: data.game && data.game.startedAt ? data.game.startedAt : null
      },
      coupons: Array.isArray(data.coupons) ? clone(data.coupons) : [],
      quest: data.quest && typeof data.quest === 'object' ? clone(data.quest) : null,
      achievement: data.achievement && typeof data.achievement === 'object'
        ? clone(data.achievement)
        : (data.achievements && !Array.isArray(data.achievements) ? clone(data.achievements) : null),
      story: data.story && typeof data.story === 'object' ? clone(data.story) : null,
      ending: data.ending && typeof data.ending === 'object' ? clone(data.ending) : null,
      settings: data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? clone(data.settings) : {},
      audioSettings: normalizeAudioSettings(data.audioSettings),
      gpsHistory: normalizeGpsHistory(data.gpsHistory)
    });
  }

  /** 保存エンベロープを生成する。 */
  function envelope(data) {
    var normalized = normalizeData(data);
    var payload = JSON.stringify(normalized);
    return { version: SAVE_VERSION, savedAt: new Date().toISOString(), checksum: checksum(payload), data: normalized };
  }

  /** 外部データを検証し、必要なら旧形式から移行する。 */
  function parseEnvelope(raw) {
    var candidate;
    try {
      candidate = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      throw new SaveError('invalid_json', 'セーブデータを読み取れません。', error);
    }
    if (!candidate || typeof candidate !== 'object') throw new SaveError('invalid_save', 'セーブデータの形式が不正です。');
    if (candidate.data) {
      if (candidate.version > SAVE_VERSION) throw new SaveError('newer_version', 'このセーブデータは新しいアプリ版で作成されています。');
      var serialized = JSON.stringify(candidate.data);
      if (candidate.checksum && candidate.checksum !== checksum(serialized)) throw new SaveError('checksum_mismatch', 'セーブデータが壊れている可能性があります。');
      return normalizeData(candidate.data);
    }
    // Version 1.0以前のgame.js exportSave()形式を読み込めるようにする。
    return normalizeData(candidate);
  }

  /** メモリ上の追加データを最新のセーブ内容に合わせる。 */
  function applyRuntimeData(data) {
    preservedData = clone(data);
    extras = {
      coupons: clone(data.coupons),
      quest: clone(data.quest),
      achievement: clone(data.achievement),
      story: clone(data.story),
      ending: clone(data.ending),
      settings: clone(data.settings),
      audioSettings: normalizeAudioSettings(data.audioSettings)
    };
    if (EbiAR.sound && typeof EbiAR.sound.applySettings === 'function') EbiAR.sound.applySettings(extras.audioSettings, { silent: true, resume: false });
    gpsHistory = normalizeGpsHistory(data.gpsHistory);
    return clone(data);
  }

  /** 読み込んだプレイヤー状態を実行中のGame Engineへ反映する。 */
  function restoreGameState(data) {
    if (!EbiAR.game || typeof EbiAR.game.initialize !== 'function') return;
    EbiAR.game.initialize({
      character: data.player,
      collectedSpotIds: data.game.collectedSpotIds,
      startedAt: data.game.startedAt
    });
  }

  /**
   * 現在のゲーム状態をlocalStorageへ保存する。
   * @param {object} [overrides] クーポン・実績等の追加または上書きデータ
   * @returns {object} 保存したデータ
   * @throws {SaveError} 保存不能または容量不足の場合
   */
  function saveGame(overrides) {
    var data = collectGameState();
    if (overrides && typeof overrides === 'object') data = Object.assign(data, clone(overrides));
    var packed = envelope(data);
    try {
      storage().setItem(STORAGE_KEY, JSON.stringify(packed));
    } catch (error) {
      throw new SaveError('write_failed', 'ゲームデータを保存できませんでした。空き容量をご確認ください。', error);
    }
    applyRuntimeData(packed.data);
    if (EbiAR.events) EbiAR.events.emit('save:completed', { savedAt: packed.savedAt });
    return clone(packed.data);
  }

  /**
   * localStorageからゲーム状態を復元用に取得する。ゲームへの適用は呼び出し側が行う。
   * @returns {object|null} 保存データ。保存がない場合はnull
   * @throws {SaveError} 破損または読取不能の場合
   */
  function loadGame() {
    var raw;
    try { raw = storage().getItem(STORAGE_KEY); } catch (error) { throw new SaveError('read_failed', 'ゲームデータを読み込めませんでした。', error); }
    if (!raw) return null;
    var data = parseEnvelope(raw);
    applyRuntimeData(data);
    if (EbiAR.events) EbiAR.events.emit('save:loaded', clone(data));
    return clone(data);
  }

  /** 30秒ごとの自動保存、およびページ終了時に利用する保存処理。 */
  function autoSave() {
    try { return saveGame(); }
    catch (error) {
      if (EbiAR.events) EbiAR.events.emit('save:error', { error: error, automatic: true });
      return null;
    }
  }

  /** 現在のセーブデータを完全に削除する。 */
  function resetSave() {
    try {
      storage().removeItem(STORAGE_KEY);
      storage().removeItem(BACKUP_KEY);
    } catch (error) {
      throw new SaveError('reset_failed', 'セーブデータを削除できませんでした。', error);
    }
    gpsHistory = [];
    preservedData = {};
    extras = { coupons: [], quest: null, achievement: null, story: null, ending: null, settings: {}, audioSettings: Object.assign({}, DEFAULT_AUDIO_SETTINGS) };
    if (EbiAR.sound && typeof EbiAR.sound.applySettings === 'function') EbiAR.sound.applySettings(extras.audioSettings, { silent: true });
    restoreGameState(normalizeData({}));
    if (EbiAR.events) EbiAR.events.emit('save:reset');
  }

  /** 現在のセーブを移行可能なJSON文字列として出力する。 */
  function exportSave() {
    var raw;
    try { raw = storage().getItem(STORAGE_KEY); } catch (error) { throw new SaveError('read_failed', 'ゲームデータを読み込めませんでした。', error); }
    return raw || JSON.stringify(envelope(collectGameState()), null, 2);
  }

  /**
   * JSON文字列またはオブジェクトを検証して取り込む。
   * @returns {object} 取り込み済みデータ
   */
  function importSave(source) {
    var data = parseEnvelope(source);
    var packed = envelope(data);
    try { storage().setItem(STORAGE_KEY, JSON.stringify(packed)); }
    catch (error) { throw new SaveError('write_failed', 'セーブデータを取り込めませんでした。', error); }
    applyRuntimeData(packed.data);
    restoreGameState(packed.data);
    if (EbiAR.events) EbiAR.events.emit('save:imported', clone(packed.data));
    if (EbiAR.events) EbiAR.events.emit('save:loaded', clone(packed.data));
    return clone(packed.data);
  }

  /** 現在のセーブを専用バックアップ枠へ複製する。 */
  function backupSave() {
    var raw = exportSave();
    try { storage().setItem(BACKUP_KEY, raw); }
    catch (error) { throw new SaveError('backup_failed', 'バックアップを保存できませんでした。', error); }
    return true;
  }

  /** 専用バックアップを検証し、現在のセーブとして復元する。 */
  function restoreBackup() {
    var raw;
    try { raw = storage().getItem(BACKUP_KEY); } catch (error) { throw new SaveError('read_failed', 'バックアップを読み込めませんでした。', error); }
    if (!raw) throw new SaveError('backup_missing', '復元できるバックアップがありません。');
    return importSave(raw);
  }

  /** GPS更新を最新20件の履歴として記録する。 */
  function recordGps(update) {
    if (!update || !update.position || update.status !== 'ready') return;
    var point = update.position;
    gpsHistory.push({ latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, timestamp: point.timestamp || Date.now() });
    gpsHistory = normalizeGpsHistory(gpsHistory);
  }

  function startAutoSave() {
    if (autoSaveTimer !== null) return;
    autoSaveTimer = global.setInterval(autoSave, AUTO_SAVE_INTERVAL_MS);
    if (EbiAR.events) EbiAR.events.on('gps:update', recordGps);
    global.addEventListener('pagehide', autoSave);
    global.addEventListener('beforeunload', autoSave);
  }

  EbiAR.save = Object.freeze({
    SaveError: SaveError,
    saveGame: saveGame, loadGame: loadGame, autoSave: autoSave, resetSave: resetSave,
    exportSave: exportSave, importSave: importSave, backupSave: backupSave, restoreBackup: restoreBackup,
    getGpsHistory: function () { return clone(gpsHistory); },
    getStorageKey: function () { return STORAGE_KEY; }
  });

  startAutoSave();
})(window);
