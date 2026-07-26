/* 海老フライ王国AR v1.0 - 日野町GPSスポットレジストリ
 * 読み込み順: config.js -> gps.js -> spots.js
 * character.js には依存しない。spawnCharacterIds はキャラクター側で照合する。
 */
(function (global) {
  'use strict';

  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var SPOT_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;
  var EVENT_SPOTS = {};

  /** 配列をコピーして凍結し、呼び出し側からの破壊的変更を防ぐ。 */
  function freezeArray(values) { return Object.freeze(values.slice()); }
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function isFiniteCoordinate(value, min, max) {
    return Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;
  }
  function isDateInRange(now, startsAt, endsAt) {
    var time = now instanceof Date ? now.getTime() : new Date(now || Date.now()).getTime();
    if (!Number.isFinite(time)) return false;
    return (!startsAt || time >= Date.parse(startsAt)) && (!endsAt || time <= Date.parse(endsAt));
  }
  /**
   * スポット定義を検証し、公開用の不変データへ正規化する。
   * 旧フィールドも残すため、既存のgps.js / character.jsは変更不要。
   * @param {object} input スポット定義
   * @param {'base'|'event'} source 登録元
   * @returns {Readonly<object>} 正規化済みスポット
   */
  function normalizeSpot(input, source) {
    input = input || {};
    if (!SPOT_ID.test(input.id || '')) throw new TypeError('スポットIDが不正です。');
    if (!String(input.name || '').trim()) throw new TypeError('スポット名を指定してください。');
    if (!isFiniteCoordinate(input.latitude, -90, 90) || !isFiniteCoordinate(input.longitude, -180, 180)) throw new TypeError('緯度または経度が不正です。');
    if (!Number.isFinite(Number(input.radiusMeters)) || Number(input.radiusMeters) < 20 || Number(input.radiusMeters) > 2000) throw new TypeError('GPS半径は20〜2000mで指定してください。');
    if (!Array.isArray(input.spawnCharacterIds)) throw new TypeError('出現キャラクターID一覧は配列で指定してください。');
    var characters = freezeArray(input.characters || input.spawnCharacterIds.filter(function (id, index, all) { return typeof id === 'string' && all.indexOf(id) === index; }));
    return Object.freeze({
      id: input.id,
      name: String(input.name).trim(),
      latitude: Number(input.latitude),
      longitude: Number(input.longitude),
      radiusMeters: Math.round(Number(input.radiusMeters)),
      radius: Math.round(Number(input.radiusMeters)),
      category: String(input.category || 'other'),
      description: String(input.description || ''),
      guide: String(input.guide || ''),
      spawnCharacterIds: characters,
      characters: characters,
      eventOnly: input.eventOnly === true,
      isPublished: input.isPublished === true,
      published: input.isPublished === true,
      publicAccessOnly: input.publicAccessOnly !== false,
      sourceUrl: typeof input.sourceUrl === 'string' ? input.sourceUrl : '',
      photo: typeof input.photo === 'string' ? input.photo : 'images/spots/' + input.id + '.webp',
      icon: typeof input.icon === 'string' ? input.icon : 'images/icons/' + String(input.category || 'other') + '.svg',
      features: Object.freeze(Object.assign({ ar: true, photoSpot: false, stampRally: false, coupon: false, audioGuide: false }, input.features || {})),
      startsAt: input.startsAt || null,
      endsAt: input.endsAt || null,
      source: source
    });
  }

  /* 座標はGPS判定用の公開アクセス可能な周辺地点。施設・境内・私有地への立入りを促すものではありません。 */
  var BASE_SPOTS = Object.freeze([
    normalizeSpot({ id: 'hamada', name: 'えびふらいと抹茶専門店 はま田', latitude: 35.0005, longitude: 136.2380, radiusMeters: 120, category: 'gourmet', description: '明治時代に建てられた古民家で、大きなえびふらいと抹茶を楽しめる店。', guide: '営業日・利用方法を確認し、店舗利用者や近隣の迷惑にならない場所でARを楽しもう。', spawnCharacterIds: ['ebi-maru', 'tart-chan', 'lemon-pyon', 'koromo-pon', 'midori-furai'], eventOnly: false, isPublished: true, sourceUrl: 'https://www.biwako-visitors.jp/spot/detail/30664/' }, 'base'),
    normalizeSpot({ id: 'umamioka-watamuki-shrine', name: '馬見岡綿向神社', latitude: 35.0131, longitude: 136.2496, radiusMeters: 180, category: 'shrine', description: '湖東の大宮として信仰を集め、日野祭の舞台としても知られる神社。', guide: '参拝・祭事を最優先にし、境内の撮影・通行ルールに従おう。', spawnCharacterIds: ['festival-ebi', 'castle-crisp', 'queen-tartar', 'machi-akari'], eventOnly: false, isPublished: true, sourceUrl: 'https://www.biwako-visitors.jp/spot/detail/241/' }, 'base'),
    normalizeSpot({ id: 'omi-hino-merchant-museum', name: '近江日野商人館', latitude: 35.01156, longitude: 136.24769, radiusMeters: 160, category: 'museum', description: '旧山中兵右衞門家住宅を活用し、近江日野商人の歴史と商いを紹介する資料館。', guide: '開館日・入館条件を確認し、展示室ではARを起動しないでください。', spawnCharacterIds: ['shonin-ebi', 'machi-akari', 'hino-bito', 'cabbage-kun'], eventOnly: false, isPublished: true, sourceUrl: 'https://www.town.shiga-hino.lg.jp/0000004865.html' }, 'base'),
    normalizeSpot({ id: 'hino-machikado-kanno', name: '日野まちかど感応館', latitude: 35.0112, longitude: 136.2471, radiusMeters: 160, category: 'tourism', description: '旧薬店を活用した観光交流拠点。薬業資料、観光案内、特産品販売がある。', guide: 'まちなか散策の出発点。館内の案内と営業情報を確認してから歩こう。', spawnCharacterIds: ['ebi-maru', 'machi-akari', 'shonin-ebi', 'rail-furai'], eventOnly: false, isPublished: true, sourceUrl: 'https://www.town.shiga-hino.lg.jp/0000003689.html' }, 'base'),
    normalizeSpot({ id: 'gamo-ujisato-statue', name: '蒲生氏郷公像', latitude: 35.0180, longitude: 136.2320, radiusMeters: 220, category: 'history', description: '日野町ひばり野に建つ、蒲生氏郷公を顕彰する像。', guide: '公園・周辺利用者を優先し、道路上では立ち止まらないでください。', spawnCharacterIds: ['castle-crisp', 'hino-gold', 'king-furai', 'kaze-ebi'], eventOnly: false, isPublished: true, sourceUrl: 'https://hino-kanko.jp/sight/gamouujisato/' }, 'base'),
    normalizeSpot({ id: 'nakano-castle-ruins', name: '中野城跡', latitude: 35.0210, longitude: 136.2710, radiusMeters: 350, category: 'history', description: '蒲生氏の居城として築かれ、日野城とも呼ばれる城跡。', guide: '史跡の保存と安全を最優先に。足元・天候を確認し、立入禁止箇所には入らないでください。', spawnCharacterIds: ['castle-crisp', 'satoyama-knight', 'king-furai', 'yamamori'], eventOnly: false, isPublished: true, sourceUrl: 'https://www.town.shiga-hino.lg.jp/0000004850.html' }, 'base'),
    normalizeSpot({ id: 'wakakusa-spring', name: '若草清水', latitude: 35.0100, longitude: 136.2550, radiusMeters: 130, category: 'water', description: '村井横町の地蔵堂の下にある清水。蒲生氏郷公が茶の湯に用いたと伝わる。', guide: '水場を清潔に保ち、飲用可否は現地表示に従ってください。', spawnCharacterIds: ['lemon-pyon', 'kawa-taruto', 'mizube-queen'], eventOnly: false, isPublished: true, sourceUrl: 'https://hino-kanko.jp/sight/wakakusa/' }, 'base'),
    normalizeSpot({ id: 'shingakuin-temple', name: '信楽院', latitude: 35.0107, longitude: 136.2494, radiusMeters: 160, category: 'temple', description: '蒲生氏郷公ゆかりの寺院。氏郷公の故郷・日野を見守る地として伝えられる。', guide: '参拝者と法要を優先し、静かに行動してください。', spawnCharacterIds: ['hino-bito', 'castle-crisp', 'king-furai'], eventOnly: false, isPublished: true, sourceUrl: 'https://www.town.shiga-hino.lg.jp/0000000236.html' }, 'base'),
    normalizeSpot({ id: 'saimyoji-temple', name: '西明寺', latitude: 35.0058, longitude: 136.2438, radiusMeters: 180, category: 'temple', description: '日野町にある歴史ある寺院。', guide: '寺院の公開範囲・参拝ルールを守り、堂内でのAR利用は控えてください。', spawnCharacterIds: ['machi-akari', 'yamamori', 'satoyama-knight'], eventOnly: false, isPublished: true, sourceUrl: 'https://hino-kanko.jp/' }, 'base'),
    normalizeSpot({ id: 'kishitsu-shrine', name: '鬼室神社', latitude: 35.029883, longitude: 136.284432, radiusMeters: 180, category: 'shrine', description: '百済から渡来した鬼室集斯にまつわる神社。日野町小野にある。', guide: '地域の信仰と交流の場です。参拝の妨げにならないよう、公開エリアで静かに楽しもう。', spawnCharacterIds: ['hino-bito', 'yamamori', 'queen-tartar'], eventOnly: false, isPublished: true, sourceUrl: 'https://hino-kanko.jp/sight/kishitsujinjya/' }, 'base'),
    normalizeSpot({ id: 'omi-hino-furusatokan', name: '近江日野商人ふるさと館', latitude: 35.0240, longitude: 136.2730, radiusMeters: 180, category: 'tourism', description: '旧山中正吉邸を活用した、近江日野商人の暮らしと歴史を伝える施設。', guide: '開館情報を確認し、庭園・建物の保護に配慮して見学しよう。', spawnCharacterIds: ['shonin-ebi', 'hino-bito'], eventOnly: false, isPublished: true, sourceUrl: 'https://hinofurusatokan.jp/guide/' }, 'base'),
    normalizeSpot({ id: 'shomeiji-temple', name: '正明寺', latitude: 35.0146, longitude: 136.2378, radiusMeters: 180, category: 'temple', description: '松尾にある寺院。京都御所の清涼殿を移築したと伝わる本堂で知られる。', guide: '拝観・法要を優先し、堂内でのAR利用は控えてください。', spawnCharacterIds: ['machi-akari', 'yamamori'], eventOnly: false, isPublished: true, sourceUrl: 'https://hino-kanko.jp/sight/syoumeiji/' }, 'base'),
    normalizeSpot({ id: 'kongojoji-temple', name: '金剛定寺', latitude: 35.0380, longitude: 136.2220, radiusMeters: 220, category: 'temple', description: '中山にある、聖徳太子建立の伝承を持つ古寺。', guide: '山寺への道では足元と天候に注意し、公開範囲を守ってください。', spawnCharacterIds: ['yamamori', 'satoyama-knight'], eventOnly: false, isPublished: true, sourceUrl: 'https://hino-kanko.jp/sight/kongojyoji/' }, 'base'),
    normalizeSpot({ id: 'wakamatsu-forest-ruins', name: '若松の森跡', latitude: 35.0135, longitude: 136.2490, radiusMeters: 120, category: 'history', description: '蒲生氏郷が会津の地名「若松」にちなむ由来として伝わる森の跡。', guide: '神社の参道周辺です。通行・参拝を優先し、静かに散策しよう。', spawnCharacterIds: ['festival-ebi', 'hino-gold'], eventOnly: false, isPublished: true, sourceUrl: 'https://hino-kanko.jp/sight/wakamatsu/' }, 'base'),
    normalizeSpot({ id: 'jofukuji-temple', name: '常福寺', latitude: 35.0050, longitude: 136.2520, radiusMeters: 160, category: 'temple', description: '日野町の歴史と信仰を伝える寺院。', guide: '参拝者を優先し、境内の案内表示に従って行動してください。', spawnCharacterIds: ['machi-akari', 'kawa-taruto'], eventOnly: false, isPublished: true, sourceUrl: 'https://hino-kanko.jp/sight/' }, 'base'),
    normalizeSpot({ id: 'murasha-watamuki-shrine', name: '村社綿向神社', latitude: 35.0068, longitude: 136.2572, radiusMeters: 160, category: 'shrine', description: '地域の人々に大切に守られてきた綿向神社。', guide: '地域の祭事・参拝を優先し、敷地内のルールを守りましょう。', spawnCharacterIds: ['festival-ebi', 'queen-tartar'], eventOnly: false, isPublished: true, sourceUrl: 'https://hino-kanko.jp/sight/' }, 'base'),
    normalizeSpot({ id: 'tokumoto-shonin-inscription', name: '徳本上人名号碑', latitude: 35.0118, longitude: 136.2506, radiusMeters: 100, category: 'history', description: '徳本上人の名号を刻む石碑。日野の歴史文化にふれる小さな史跡。', guide: '史跡保護のため、碑に触れたり周囲へ立ち入ったりしないでください。', spawnCharacterIds: ['hino-bito', 'machi-akari'], eventOnly: false, isPublished: true, sourceUrl: 'https://hino-kanko.jp/sight/' }, 'base')
  ]);

  var BASE_BY_ID = {};
  BASE_SPOTS.forEach(function (spot) { BASE_BY_ID[spot.id] = spot; });

  /** @returns {number} 2地点間の直線距離（メートル） */
  function distanceMeters(position, spot) {
    if (EbiAR.gps && typeof EbiAR.gps.distanceMeters === 'function') return EbiAR.gps.distanceMeters(position, spot);
    var rad = Math.PI / 180, dLat = (spot.latitude - position.latitude) * rad, dLon = (spot.longitude - position.longitude) * rad;
    var sinLat = Math.sin(dLat / 2), sinLon = Math.sin(dLon / 2);
    var h = sinLat * sinLat + Math.cos(position.latitude * rad) * Math.cos(spot.latitude * rad) * sinLon * sinLon;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function allSpots() { return BASE_SPOTS.concat(Object.keys(EVENT_SPOTS).map(function (id) { return EVENT_SPOTS[id]; })); }
  function isActive(spot, now, includeUnpublished) {
    return !!spot && (includeUnpublished || spot.isPublished) && isDateInRange(now, spot.startsAt, spot.endsAt);
  }
  /**
   * 公開中のスポットを取得する。
   * @param {{category?: string, eventOnly?: boolean, at?: Date|string, includeUnpublished?: boolean}} [options]
   * @returns {object[]}
   */
  function list(options) {
    options = options || {};
    return allSpots().filter(function (spot) {
      return isActive(spot, options.at, options.includeUnpublished) &&
        (!options.category || spot.category === options.category) &&
        (!options.eventOnly || spot.eventOnly);
    }).map(clone);
  }
  /** @returns {object|null} 指定IDのスポット。非公開・期間外はnull。 */
  function get(id, options) {
    options = options || {};
    var spot = BASE_BY_ID[id] || EVENT_SPOTS[id];
    return isActive(spot, options.at, options.includeUnpublished) ? clone(spot) : null;
  }
  /** @returns {boolean} 指定位置がスポット半径内かどうか。 */
  function isWithin(spot, position) {
    if (!spot || !position || !isFiniteCoordinate(position.latitude, -90, 90) || !isFiniteCoordinate(position.longitude, -180, 180)) return false;
    return distanceMeters(position, spot) <= spot.radiusMeters;
  }
  /**
   * 現在地から半径内の公開スポットを距離順で取得する。
   * @param {{latitude: number, longitude: number}} position 現在地
   * @param {object} [options] listと同じ絞り込み条件
   * @returns {object[]}
   */
  function findNearby(position, options) {
    options = options || {};
    return list(options).map(function (spot) {
      spot.distanceMeters = Math.round(distanceMeters(position, spot));
      spot.isNearby = spot.distanceMeters <= spot.radiusMeters;
      return spot;
    }).filter(function (spot) { return options.includeOutside || spot.isNearby; }).sort(function (a, b) { return a.distanceMeters - b.distanceMeters; });
  }
  /** 現在地に最も近い公開スポットを返す。半径外でも返すため案内表示に利用できる。 */
  function findNearest(position, options) {
    options = Object.assign({}, options || {}, { includeOutside: true });
    var candidates = findNearby(position, options);
    return candidates.length ? candidates[0] : null;
  }
  /** キーワードで名称・ID・カテゴリ・説明・ガイドを検索する。 */
  function search(query, options) {
    var keyword = String(query || '').trim().toLocaleLowerCase('ja-JP');
    return list(options).filter(function (spot) {
      if (!keyword) return true;
      return [spot.id, spot.name, spot.category, spot.description, spot.guide].join(' ').toLocaleLowerCase('ja-JP').indexOf(keyword) !== -1;
    });
  }
  function registerEvent(input) {
    var spot = normalizeSpot(Object.assign({}, input, { eventOnly: true }), 'event');
    if (!spot.startsAt || !spot.endsAt || Date.parse(spot.startsAt) > Date.parse(spot.endsAt)) throw new TypeError('イベントスポットには有効な開始日時・終了日時が必要です。');
    if (BASE_BY_ID[spot.id] || EVENT_SPOTS[spot.id]) throw new Error('同じスポットIDがすでに存在します。');
    EVENT_SPOTS[spot.id] = spot;
    if (EbiAR.events) EbiAR.events.emit('spots:event-registered', clone(spot));
    return clone(spot);
  }
  function unregisterEvent(id) {
    if (!EVENT_SPOTS[id]) return false;
    delete EVENT_SPOTS[id];
    if (EbiAR.events) EbiAR.events.emit('spots:event-unregistered', { id: id });
    return true;
  }

  EbiAR.spots = Object.freeze({
    categories: Object.freeze(['store', 'gourmet', 'shrine', 'temple', 'history', 'tourism', 'nature', 'museum', 'water']),
    list: list, get: get, isWithin: isWithin, findNearby: findNearby,
    // v1互換API
    getById: get, getAll: list, findNearest: findNearest, search: search,
    getCharacters: function (id, options) { var spot = get(id, options); return spot ? spot.characters.slice() : []; },
    getSpawnCharacterIds: function (id, options) { var spot = get(id, options); return spot ? spot.spawnCharacterIds.slice() : []; },
    registerEvent: registerEvent, unregisterEvent: unregisterEvent
  });
})(window);
