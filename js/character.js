/* 海老フライ王国AR v1.0 - キャラクター図鑑・出現・取得エンジン */
(function (global) {
  'use strict';

  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var MAX_LEVEL = EbiAR.config.gameplay.maxLevel;
  var CHARACTER_MAX_LEVEL = 10;
  var DEFAULT_NAME = 'エビフライ見習い';
  var RARITIES = Object.freeze({
    common:    { key: 'common',    name: 'ノーマル',  rank: 1, color: '#7b8a8b', spawnWeight: 55 },
    uncommon:  { key: 'uncommon',  name: 'レア',      rank: 2, color: '#3c9d67', spawnWeight: 25 },
    rare:      { key: 'rare',      name: 'スーパーレア', rank: 3, color: '#3687d6', spawnWeight: 12 },
    epic:      { key: 'epic',      name: 'エピック',  rank: 4, color: '#8b54c7', spawnWeight: 6 },
    legendary: { key: 'legendary', name: 'レジェンド', rank: 5, color: '#d58a16', spawnWeight: 2 }
  });

  // spots.js のIDを唯一の出現エリア定義とする。座標・公開状態・ガイドはspots.jsで一元管理する。
  var AREA_IDS = Object.freeze({
    townHall: 'hino-machikado-kanno', oldTown: 'omi-hino-merchant-museum', station: 'hino-machikado-kanno',
    culture: 'umamioka-watamuki-shrine', park: 'hamada', riverside: 'wakakusa-spring',
    foothill: 'nakano-castle-ruins', west: 'gamo-ujisato-statue', east: 'kishitsu-shrine', south: 'hamada'
  });

  function definition(id, name, rarity, appearanceArea, description, points) {
    return Object.freeze({
      id: id, name: name, rarity: rarity, appearanceArea: appearanceArea,
      description: description, miniGuide: '',
      // 既存の model / image / sound は維持。AR描画側は arModel を利用できる。
      model: 'models/' + id + '.glb', image: 'images/characters/' + id + '.webp', sound: 'sounds/characters/' + id + '.mp3',
      arModel: Object.freeze({ src: 'models/' + id + '.glb', scale: rarity === 'legendary' ? 1.25 : rarity === 'epic' ? 1.1 : 1, animation: 'idle', placement: 'ground', shadow: true }),
      acquisitionPoints: points
    });
  }

  // すべて本作オリジナルのキャラクターです。素材ファイル名は assets 配下と一致させます。
  var CHARACTERS = Object.freeze([
    definition('ebi-maru', 'えびまる', 'common', AREA_IDS.townHall, '王国の使者を夢見る、まっすぐな海老フライ。', 10),
    definition('cabbage-kun', 'キャベツくん', 'common', AREA_IDS.oldTown, '衣の相棒を探して町を歩く、さわやかなキャベツ。', 10),
    definition('lemon-pyon', 'レモンぴょん', 'common', AREA_IDS.park, '酸っぱいひらめきで旅人を応援する案内役。', 10),
    definition('tart-chan', 'タルタルちゃん', 'common', AREA_IDS.park, 'ピクニックが大好きな、ふんわりタルタル。', 10),
    definition('koromo-pon', 'ころもポン', 'common', AREA_IDS.south, 'カリッと元気な衣の精。道案内はゆっくり確実に。', 10),
    definition('hino-bito', 'ひのびと', 'uncommon', AREA_IDS.oldTown, '日野の景色と昔話が好きな小さな旅人。', 20),
    definition('machi-akari', 'まちあかり', 'uncommon', AREA_IDS.culture, '夕暮れの町並みをやさしく照らすランタンの精。', 20),
    definition('kaze-ebi', 'かぜえび', 'uncommon', AREA_IDS.west, '田園を渡る風に乗って現れる、軽やかな海老フライ。', 20),
    definition('midori-furai', 'みどりフライ', 'uncommon', AREA_IDS.park, '緑を守るため、落とし物を見つけるのが得意。', 20),
    definition('kawa-taruto', 'かわタルト', 'uncommon', AREA_IDS.riverside, '水面のきらめきを集めるタルトの精。', 20),
    definition('shonin-ebi', '商人えび', 'rare', AREA_IDS.oldTown, '旅先の出会いを大切にする、勉強熱心な商人海老。', 40),
    definition('rail-furai', 'レールフライ', 'rare', AREA_IDS.station, '列車の音を聞くと元気になる、旅好きの海老フライ。', 40),
    definition('yamamori', 'やまもり', 'rare', AREA_IDS.foothill, '山の安全を見守る、頼れる森の番人。', 40),
    definition('mizube-queen', 'みずべクイーン', 'rare', AREA_IDS.riverside, '水辺の生き物に詳しい、気品ある女王。', 40),
    definition('festival-ebi', 'まつりえび', 'rare', AREA_IDS.culture, 'にぎやかな音が大好きな、お祭り気分の海老フライ。', 40),
    definition('castle-crisp', 'しろカリスプ', 'epic', AREA_IDS.culture, '歴史を語り継ぐ、黄金色の守り手。', 70),
    definition('satoyama-knight', '里山ナイト', 'epic', AREA_IDS.foothill, '自然と人の暮らしの調和を守る騎士。', 70),
    definition('hino-gold', '日野ゴールド', 'epic', AREA_IDS.west, '夕日に照らされる田園で輝く、幸運の海老フライ。', 70),
    definition('king-furai', 'フライ王', 'legendary', AREA_IDS.foothill, '王国を治める伝説の海老フライ。礼儀正しい冒険者を待っている。', 120),
    definition('queen-tartar', 'タルタル女王', 'legendary', AREA_IDS.east, '日野町の旅を見守る王国の女王。出会えたら大きな幸運。', 120)
  ]);
  var byId = {};
  CHARACTERS.forEach(function (item) { byId[item.id] = item; });

  function isSafeId(value) { return typeof value === 'string' && /^[a-z0-9_-]{1,64}$/i.test(value); }
  function uniqueCharacterIds(value) {
    return Array.isArray(value) ? value.filter(function (id, index, array) { return !!byId[id] && array.indexOf(id) === index; }) : [];
  }
  function sanitizeName(name) { return String(name || '').trim().replace(/[<>]/g, '').slice(0, 16) || DEFAULT_NAME; }
  function now() { return new Date().toISOString(); }

  function requiredExperience(level) {
    if (level >= MAX_LEVEL) return 0;
    return Math.floor(100 * Math.pow(level, 1.35));
  }
  function requiredCharacterPoints(level) {
    if (level >= CHARACTER_MAX_LEVEL) return 0;
    return 20 * level;
  }
  function normalizeRecord(record) {
    record = record || {};
    return { level: Math.max(1, Math.min(CHARACTER_MAX_LEVEL, Number(record.level) || 1)), points: Math.max(0, Math.floor(Number(record.points) || 0)), acquiredAt: record.acquiredAt || now(), updatedAt: now() };
  }
  function normalizeRecords(records, ids) {
    var result = {};
    (records && typeof records === 'object' ? Object.keys(records) : []).forEach(function (id) {
      if (ids.indexOf(id) >= 0) result[id] = normalizeRecord(records[id]);
    });
    ids.forEach(function (id) { if (!result[id]) result[id] = normalizeRecord(); });
    return result;
  }

  function create(initial) {
    initial = initial || {};
    var discovered = uniqueCharacterIds(initial.discoveredEbi);
    return {
      name: sanitizeName(initial.name), level: Math.max(1, Math.min(MAX_LEVEL, Number(initial.level) || 1)),
      experience: Math.max(0, Math.floor(Number(initial.experience) || 0)),
      points: Math.max(0, Math.floor(Number(initial.points) || 0)),
      coins: Math.max(0, Math.floor(Number(initial.coins) || EbiAR.config.gameplay.startingCoins)),
      title: typeof initial.title === 'string' ? initial.title.slice(0, 32) : '日野町の旅人',
      coupons: Array.isArray(initial.coupons) ? initial.coupons.filter(isSafeId) : [],
      titles: Array.isArray(initial.titles) ? initial.titles.map(function (title) { return String(title).slice(0, 32); }).filter(Boolean) : [],
      discoveredEbi: discovered, characterRecords: normalizeRecords(initial.characterRecords, discovered),
      visitedSpots: Array.isArray(initial.visitedSpots) ? initial.visitedSpots.filter(isSafeId) : [],
      createdAt: initial.createdAt || now(), updatedAt: now()
    };
  }
  function touch(character) { character.updatedAt = now(); EbiAR.events.emit('character:updated', character); }
  function grantExperience(character, amount) {
    if (!character || Number(amount) <= 0) return { character: character, levelsGained: 0 };
    var gained = 0; character.experience += Math.floor(Number(amount));
    while (character.level < MAX_LEVEL && character.experience >= requiredExperience(character.level)) { character.experience -= requiredExperience(character.level); character.level += 1; gained += 1; }
    if (character.level >= MAX_LEVEL) character.experience = 0;
    touch(character); if (gained) EbiAR.events.emit('character:levelup', { character: character, levelsGained: gained });
    return { character: character, levelsGained: gained };
  }
  function addUnique(character, property, id) {
    if (!character || !isSafeId(id) || !Array.isArray(character[property]) || character[property].indexOf(id) >= 0) return false;
    character[property].push(id); touch(character); return true;
  }
  function distanceMeters(a, b) {
    if (EbiAR.gps && EbiAR.gps.distanceMeters) return EbiAR.gps.distanceMeters(a, b);
    var rad = Math.PI / 180, dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
    var sinLat = Math.sin(dLat / 2), sinLon = Math.sin(dLon / 2);
    var h = sinLat * sinLat + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * sinLon * sinLon;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function resolveAppearanceSpot(definition) {
    if (!definition || typeof definition.appearanceArea !== 'string' || !EbiAR.spots || typeof EbiAR.spots.get !== 'function') return null;
    return EbiAR.spots.get(definition.appearanceArea);
  }
  function canAppear(definition, position) {
    if (!definition || !position || !Number.isFinite(Number(position.latitude)) || !Number.isFinite(Number(position.longitude))) return false;
    var spot = resolveAppearanceSpot(definition);
    if (!spot) return false;
    if (EbiAR.spots && typeof EbiAR.spots.isWithin === 'function') return EbiAR.spots.isWithin(spot, position);
    return distanceMeters(position, spot) <= spot.radiusMeters;
  }
  function matches(definition, query) {
    query = String(query || '').trim().toLocaleLowerCase('ja-JP');
    if (!query) return true;
    var spot = resolveAppearanceSpot(definition);
    return [definition.id, definition.name, definition.rarity, RARITIES[definition.rarity].name, definition.description, definition.appearanceArea, spot ? spot.name : ''].join(' ').toLocaleLowerCase('ja-JP').indexOf(query) >= 0;
  }
  function catalogEntry(definition, character, position) {
    var acquired = !!character && character.discoveredEbi.indexOf(definition.id) >= 0;
    var spot = resolveAppearanceSpot(definition);
    return Object.assign({}, definition, {
      appearanceSpot: spot,
      miniGuide: spot ? spot.guide : definition.miniGuide,
      rarityInfo: RARITIES[definition.rarity], isAcquired: acquired, isUnacquired: !acquired,
      canAppearHere: canAppear(definition, position), record: acquired ? Object.assign({}, character.characterRecords[definition.id]) : null
    });
  }
  function list(character, options) {
    options = options || {};
    var rarity = options.rarity;
    return CHARACTERS.filter(function (item) { return (!rarity || item.rarity === rarity) && matches(item, options.query); })
      .filter(function (item) { return options.unacquiredOnly !== true || !character || character.discoveredEbi.indexOf(item.id) < 0; })
      .map(function (item) { return catalogEntry(item, character, options.position); });
  }
  function chooseRandom(items, random) {
    var total = items.reduce(function (sum, item) { return sum + RARITIES[item.rarity].spawnWeight; }, 0);
    var cursor = (random || Math.random)() * total;
    return items.find(function (item) { cursor -= RARITIES[item.rarity].spawnWeight; return cursor < 0; }) || null;
  }
  function spawnRandom(character, position, options) {
    options = options || {};
    var candidates = CHARACTERS.filter(function (item) { return canAppear(item, position) && (options.includeAcquired || !character || character.discoveredEbi.indexOf(item.id) < 0); });
    var selected = chooseRandom(candidates, options.random);
    return selected ? catalogEntry(selected, character, position) : null;
  }
  function acquire(character, id, position) {
    var definition = byId[id];
    if (!character || !definition) return { ok: false, reason: 'unknown_character' };
    if (character.discoveredEbi.indexOf(id) >= 0) return { ok: false, reason: 'already_acquired', character: catalogEntry(definition, character, position) };
    if (!canAppear(definition, position)) return { ok: false, reason: 'outside_spawn_area' };
    character.discoveredEbi.push(id);
    character.characterRecords = character.characterRecords || {};
    character.characterRecords[id] = normalizeRecord();
    var pointResult = grantCharacterPoints(character, id, definition.acquisitionPoints);
    var result = { ok: true, character: catalogEntry(definition, character, position), pointsAwarded: definition.acquisitionPoints, levelsGained: pointResult.levelsGained };
    EbiAR.events.emit('character:acquired', result);
    return result;
  }
  function grantCharacterPoints(character, id, amount) {
    if (!character || !byId[id] || character.discoveredEbi.indexOf(id) < 0 || Number(amount) <= 0) return { ok: false, reason: 'character_not_acquired' };
    var record = character.characterRecords[id] || (character.characterRecords[id] = normalizeRecord());
    var levelsGained = 0; record.points += Math.floor(Number(amount));
    while (record.level < CHARACTER_MAX_LEVEL && record.points >= requiredCharacterPoints(record.level)) { record.points -= requiredCharacterPoints(record.level); record.level += 1; levelsGained += 1; }
    if (record.level >= CHARACTER_MAX_LEVEL) record.points = 0;
    record.updatedAt = now(); touch(character);
    return { ok: true, record: Object.assign({}, record), levelsGained: levelsGained };
  }
  function collectionStats(character) {
    var acquired = character && Array.isArray(character.discoveredEbi) ? uniqueCharacterIds(character.discoveredEbi).length : 0;
    return { total: CHARACTERS.length, acquired: acquired, unacquired: CHARACTERS.length - acquired, completionRate: Number((acquired / CHARACTERS.length * 100).toFixed(1)), isComplete: acquired === CHARACTERS.length };
  }

  EbiAR.character = Object.freeze({
    rarities: RARITIES, areas: AREA_IDS, catalog: CHARACTERS,
    create: create, sanitizeName: sanitizeName, requiredExperience: requiredExperience, grantExperience: grantExperience,
    requiredCharacterPoints: requiredCharacterPoints, getById: function (id) { return byId[id] || null; },
    search: function (character, query, options) { options = options || {}; options.query = query; return list(character, options); },
    list: list, getCatalogEntry: function (character, id, position) { return byId[id] ? catalogEntry(byId[id], character, position) : null; },
    canAppear: canAppear, spawnRandom: spawnRandom, acquire: acquire, grantCharacterPoints: grantCharacterPoints,
    collectionStats: collectionStats, completionRate: function (character) { return collectionStats(character).completionRate; },
    discover: function (character, id) { if (!byId[id] || !character || character.discoveredEbi.indexOf(id) >= 0) return false; character.discoveredEbi.push(id); character.characterRecords = character.characterRecords || {}; character.characterRecords[id] = normalizeRecord(); touch(character); return true; },
    visit: function (character, spotId) { return addUnique(character, 'visitedSpots', spotId); }
  });
})(window);
