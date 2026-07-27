/* 海老フライ王国AR v1.0 - UI画面管理 */
(function (global) {
  'use strict';

  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var root = null;
  var currentScreen = 'loading';
  var currentCharacterId = null;
  var unsubscribe = [];
  var settings = { sound: true, vibration: true, highContrast: false };
  var timers = {};

  /** HTMLとして解釈せず、安全なテキストノードを生成する。 */
  function text(value) { return document.createTextNode(value == null ? '' : String(value)); }
  function byId(id) { return root ? root.querySelector('#' + id) : null; }
  function setText(id, value) { var element = byId(id); if (element) element.textContent = value == null ? '' : String(value); }
  function safeNumber(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }

  /** UI単体でも最低限のスマホ対応表示を行うためのスコープ済みスタイル。 */
  function injectStyles() {
    if (document.getElementById('ebi-ui-styles')) return;
    var style = document.createElement('style');
    style.id = 'ebi-ui-styles';
    style.textContent = [
      '.ebi-ui{--ebi:#e85d24;--ink:#282018;--paper:#fffaf2;--line:#ead9c4;min-height:100svh;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Noto Sans JP",sans-serif}',
      '.ebi-ui *{box-sizing:border-box}.ebi-ui button,.ebi-ui input{font:inherit}.ebi-ui button{cursor:pointer;border:0;border-radius:12px;padding:.7rem 1rem;background:var(--ebi);color:#fff;font-weight:700}.ebi-ui button.secondary{background:#fff;color:var(--ink);border:1px solid var(--line)}',
      '.ebi-ui .screen{display:none;min-height:100svh;padding:20px;animation:ebi-fade .22s ease}.ebi-ui .screen.active{display:flex;flex-direction:column}.ebi-ui .center{align-items:center;justify-content:center;text-align:center;gap:18px}.ebi-ui .title{font-size:clamp(1.8rem,7vw,3rem);line-height:1.18;margin:0;color:var(--ebi)}',
      '.ebi-ui .hud{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:rgba(255,250,242,.94);padding:8px 0;border-bottom:1px solid var(--line)}.ebi-ui .stat{padding:7px;text-align:center;font-size:.78rem}.ebi-ui .stat strong{display:block;font-size:1rem}',
      '.ebi-ui .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:auto;padding-top:20px}.ebi-ui .panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;margin:12px 0;box-shadow:0 2px 12px #5d34130d}',
      '.ebi-ui .catalog{display:grid;grid-template-columns:repeat(auto-fill,minmax(135px,1fr));gap:10px}.character-card{text-align:left;background:#fff!important;color:var(--ink)!important;border:1px solid var(--line)!important;min-height:120px}.character-card.locked{opacity:.58;filter:grayscale(1)}.rarity{font-size:.74rem;color:var(--ebi)}',
      '.ebi-ui .toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.toolbar input{flex:1;min-width:160px;padding:.65rem;border:1px solid var(--line);border-radius:10px}.back{align-self:flex-start;background:transparent!important;color:var(--ink)!important;padding:4px!important}',
      '.ebi-ui .message{position:fixed;z-index:10;left:50%;bottom:20px;transform:translateX(-50%);width:min(92vw,520px);background:#30251d;color:#fff;padding:14px 16px;border-radius:14px;box-shadow:0 8px 30px #0004}.message[hidden]{display:none}.spinner{width:42px;height:42px;border:5px solid #f3d3c1;border-top-color:var(--ebi);border-radius:50%;animation:ebi-spin .8s linear infinite}',
      '.ebi-ui .fade-out{opacity:0;transition:opacity .2s ease;pointer-events:none}.ebi-ui .fade-in{animation:ebi-fade .25s ease}@keyframes ebi-spin{to{transform:rotate(360deg)}}@keyframes ebi-fade{from{opacity:0}to{opacity:1}}',
      '@media (min-width:700px){#ebi-ui .screen{max-width:820px;margin:auto;padding:28px}.actions{max-width:520px;width:100%;align-self:center}}@media (prefers-reduced-motion:reduce){#ebi-ui *{animation-duration:.01ms!important;transition-duration:.01ms!important}}'
    ].join('');
    document.head.appendChild(style);
  }

  /** 画面の共通骨格を生成する。 */
  function build() {
    root.innerHTML = '';
    root.classList.add('ebi-ui');
    root.appendChild(createLoading());
    root.appendChild(createTitle());
    root.appendChild(createGame());
    root.appendChild(createCatalog());
    root.appendChild(createCharacterDetail());
    root.appendChild(createQuest());
    root.appendChild(createAchievement());
    root.appendChild(createCoupons());
    root.appendChild(createSettings());
    var message = document.createElement('div'); message.id = 'ui-message'; message.className = 'message'; message.hidden = true; root.appendChild(message);
    root.addEventListener('click', handleClick);
    root.addEventListener('change', handleChange);
  }
  function screen(id, className) { var element = document.createElement('section'); element.id = id; element.className = 'screen ' + (className || ''); return element; }
  function button(label, action, className) { var element = document.createElement('button'); element.type = 'button'; element.dataset.action = action; element.className = className || ''; element.textContent = label; return element; }
  function createLoading() { var el = screen('screen-loading', 'center active'); var spinner = document.createElement('div'); spinner.className = 'spinner'; spinner.setAttribute('aria-label', '読み込み中'); el.append(spinner, Object.assign(document.createElement('p'), { id: 'loading-text', textContent: '王国への道を準備しています…' })); return el; }
  function createTitle() { var el = screen('screen-title', 'center'); var heading = document.createElement('h1'); heading.className = 'title'; heading.textContent = '海老フライ王国AR'; var sub = document.createElement('p'); sub.textContent = '～日野町大冒険～'; el.append(heading, sub, button('冒険をはじめる', 'start'), button('図鑑を見る', 'catalog', 'secondary')); return el; }
  function createGame() {
    var el = screen('screen-game');
    var hud = document.createElement('header'); hud.className = 'hud';
    [['ポイント','hud-points'], ['レベル','hud-level'], ['現在地','hud-location']].forEach(function (item) { var stat = document.createElement('div'); stat.className = 'stat'; stat.append(text(item[0]), Object.assign(document.createElement('strong'), { id: item[1], textContent: '-' })); hud.appendChild(stat); });
    var title = document.createElement('h2'); title.textContent = '日野町を冒険中'; var spot = document.createElement('article'); spot.id = 'spot-panel'; spot.className = 'panel'; spot.append(Object.assign(document.createElement('h3'), { id: 'spot-name', textContent: '現在地を取得しています' }), Object.assign(document.createElement('p'), { id: 'spot-description', textContent: 'GPSを許可すると近くのスポットが表示されます。' }), Object.assign(document.createElement('p'), { id: 'spot-guide', textContent: '' }));
    var actions = document.createElement('nav'); actions.className = 'actions'; [['図鑑','catalog'], ['クエスト','quest'], ['実績','achievement'], ['クーポン','coupons'], ['設定','settings'], ['タイトルへ','title']].forEach(function (item) { actions.appendChild(button(item[0], item[1], item[1] === 'title' ? 'secondary' : '')); }); el.append(hud, title, spot, actions); return el;
  }
  function createCatalog() { var el = screen('screen-catalog'); el.append(button('← 戻る', 'game', 'back')); var heading = document.createElement('h2'); heading.textContent = '海老フライ図鑑'; var toolbar = document.createElement('div'); toolbar.className = 'toolbar'; var input = document.createElement('input'); input.id = 'catalog-search'; input.type = 'search'; input.placeholder = '名前・レア度・スポットを検索'; input.setAttribute('aria-label', '図鑑を検索'); toolbar.append(input); var rate = document.createElement('p'); rate.id = 'catalog-rate'; var list = document.createElement('div'); list.id = 'catalog-list'; list.className = 'catalog'; el.append(heading, toolbar, rate, list); return el; }
  function createCharacterDetail() { var el = screen('screen-character'); el.append(button('← 図鑑へ', 'catalog', 'back')); var panel = document.createElement('article'); panel.className = 'panel'; panel.id = 'character-detail'; el.append(panel); return el; }
  function createQuest() { var el = screen('screen-quest'); el.append(button('← 戻る', 'game', 'back')); var content = document.createElement('div'); content.id = 'quest-root'; el.append(content); return el; }
  function createAchievement() { var el = screen('screen-achievement'); el.append(button('← 戻る', 'game', 'back')); var content = document.createElement('div'); content.id = 'achievement-root'; el.append(content); return el; }
  function createCoupons() { var el = screen('screen-coupons'); el.append(button('← 戻る', 'game', 'back')); var heading = document.createElement('h2'); heading.textContent = 'クーポン'; var list = document.createElement('div'); list.id = 'coupon-list'; list.className = 'panel'; el.append(heading, list); return el; }
  function createSettings() { var el = screen('screen-settings'); el.append(button('← 戻る', 'game', 'back')); var heading = document.createElement('h2'); heading.textContent = '設定'; var panel = document.createElement('div'); panel.className = 'panel'; [['sound','効果音'], ['vibration','バイブレーション'], ['highContrast','高コントラスト表示']].forEach(function (item) { var label = document.createElement('label'); var input = document.createElement('input'); input.type = 'checkbox'; input.dataset.setting = item[0]; input.checked = settings[item[0]]; label.append(input, text(' ' + item[1])); panel.appendChild(label); panel.appendChild(document.createElement('br')); }); el.append(heading, panel); return el; }

  /** 指定画面をフェード付きで表示する。 */
  function showScreen(name) {
    var next = byId('screen-' + name);
    if (!next) return false;
    var previous = byId('screen-' + currentScreen);
    if (previous && previous !== next) { previous.classList.remove('active'); previous.classList.add('fade-out'); }
    next.classList.remove('fade-out'); next.classList.add('active', 'fade-in');
    global.setTimeout(function () { next.classList.remove('fade-in'); if (previous) previous.classList.remove('fade-out'); }, 250);
    currentScreen = name;
    if (name === 'catalog') renderCatalog();
    if (name === 'coupons') renderCoupons();
    if (name === 'quest' && EbiAR.Quest) EbiAR.Quest.refresh();
    if (name === 'achievement' && EbiAR.Achievement) EbiAR.Achievement.refresh();
    return true;
  }
  function fadeIn(name) { return showScreen(name); }
  function fadeOut(callback) { root.classList.add('fade-out'); global.setTimeout(function () { root.classList.remove('fade-out'); if (typeof callback === 'function') callback(); }, 220); }
  function setLoading(isLoading, message) { setText('loading-text', message || '王国への道を準備しています…'); if (isLoading) showScreen('loading'); }
  function showMessage(message, duration) { var el = byId('ui-message'); if (!el) return; el.textContent = message; el.hidden = false; global.clearTimeout(timers.message); timers.message = global.setTimeout(function () { el.hidden = true; }, duration || 3500); }

  /** HUDにgame.jsの状態を反映する。 */
  function updateHud(state) {
    if (!state) return;
    var player = state.character || state.player || {};
    setText('hud-points', safeNumber(player.points).toLocaleString());
    setText('hud-level', 'Lv.' + (safeNumber(player.level) || 1));
  }
  function updateLocation(update) {
    if (!update || !update.position) return;
    var accuracy = Math.round(safeNumber(update.position.accuracy));
    setText('hud-location', update.status === 'ready' ? '精度±' + accuracy + 'm' : '取得中');
  }
  function renderSpot(spot) {
    if (!spot) return;
    setText('spot-name', spot.name || '近くのスポット');
    setText('spot-description', spot.description || 'スポットに到着しました。');
    setText('spot-guide', spot.guide || '周囲の安全に注意して楽しもう。');
  }
  function characterState() { var game = EbiAR.game && EbiAR.game.getState ? EbiAR.game.getState() : null; return game && game.character ? game.character : null; }
  function renderCatalog() {
    var list = byId('catalog-list'); if (!list) return;
    list.replaceChildren();
    var player = characterState();
    var query = byId('catalog-search') ? byId('catalog-search').value : '';
    var entries = EbiAR.character && EbiAR.character.search ? EbiAR.character.search(player, query) : [];
    var stats = EbiAR.character && EbiAR.character.collectionStats ? EbiAR.character.collectionStats(player) : null;
    setText('catalog-rate', stats ? '完成率 ' + stats.completionRate + '%（' + stats.acquired + ' / ' + stats.total + '）' : '図鑑を準備中です');
    entries.forEach(function (entry) { var card = button('', 'character'); card.classList.add('character-card'); if (!entry.isAcquired) card.classList.add('locked'); card.dataset.characterId = entry.id; var name = document.createElement('strong'); name.textContent = entry.isAcquired ? entry.name : '？？？'; var rarity = document.createElement('span'); rarity.className = 'rarity'; rarity.textContent = entry.rarityInfo ? entry.rarityInfo.name : ''; card.append(name, document.createElement('br'), rarity); list.appendChild(card); });
  }
  function renderCharacterDetail(id) {
    var panel = byId('character-detail'); if (!panel || !EbiAR.character) return;
    var entry = EbiAR.character.getCatalogEntry(characterState(), id);
    if (!entry) return;
    panel.replaceChildren();
    var heading = document.createElement('h2'); heading.textContent = entry.isAcquired ? entry.name : '未取得のキャラクター'; var rarity = document.createElement('p'); rarity.className = 'rarity'; rarity.textContent = entry.rarityInfo ? entry.rarityInfo.name : ''; var description = document.createElement('p'); description.textContent = entry.isAcquired ? entry.description : '図鑑で発見すると詳細を読めます。'; var area = document.createElement('p'); area.textContent = entry.appearanceSpot ? '出現スポット：' + entry.appearanceSpot.name : ''; panel.append(heading, rarity, description, area); currentCharacterId = id;
  }
  /**
   * 保存済みクーポンを安全に取得する。
   * 保存データが破損している場合でも、UI表示を継続する。
   * @returns {Array<object>}
   */
  function getSavedCoupons() {
    if (!EbiAR.save || typeof EbiAR.save.loadGame !== 'function') return [];
    try {
      var saved = EbiAR.save.loadGame();
      return saved && Array.isArray(saved.coupons) ? saved.coupons : [];
    } catch (error) {
      console.warn('クーポンの保存データを読み込めませんでした。', error);
      return [];
    }
  }

  function renderCoupons(coupons) {
    var target = byId('coupon-list'); if (!target) return;
    var values = coupons || getSavedCoupons();
    target.replaceChildren();
    if (!values.length) { target.textContent = '利用できるクーポンはありません。'; return; }
    values.forEach(function (coupon) { var row = document.createElement('p'); row.textContent = coupon.name || coupon.id || 'クーポン'; target.appendChild(row); });
  }

  function handleClick(event) {
    var target = event.target.closest('[data-action]'); if (!target || !root.contains(target)) return;
    var action = target.dataset.action;
    if (action === 'start') { if (EbiAR.events) EbiAR.events.emit('ui:start-requested'); showScreen('game'); return; }
    if (action === 'character') { renderCharacterDetail(target.dataset.characterId); showScreen('character'); return; }
    if (action === 'catalog' || action === 'quest' || action === 'achievement' || action === 'coupons' || action === 'settings' || action === 'title' || action === 'game') showScreen(action);
  }
  function handleChange(event) {
    if (event.target.id === 'catalog-search') { renderCatalog(); return; }
    var key = event.target.dataset.setting; if (!key) return;
    settings[key] = !!event.target.checked;
    if (key === 'highContrast') root.classList.toggle('high-contrast', settings[key]);
    if (EbiAR.events) EbiAR.events.emit('ui:settings-changed', Object.assign({}, settings));
  }
  function subscribe() {
    if (!EbiAR.events) return;
    unsubscribe.push(EbiAR.events.on('game:state', updateHud));
    unsubscribe.push(EbiAR.events.on('gps:update', updateLocation));
    unsubscribe.push(EbiAR.events.on('gps:spot-arrived', function (event) { renderSpot(event.spot); showMessage(event.spot.name + ' に到着しました'); }));
    unsubscribe.push(EbiAR.events.on('gps:error', function (event) { showMessage(event.message); }));
    unsubscribe.push(EbiAR.events.on('character:acquired', function (event) { showMessage((event.character && event.character.name || 'キャラクター') + 'を発見！'); }));
    unsubscribe.push(EbiAR.events.on('character:levelup', function () { showMessage('レベルアップ！'); }));
    unsubscribe.push(EbiAR.events.on('quest:complete', function (event) { showMessage('クエスト達成：' + (event.quest && event.quest.title || '')); }));
    unsubscribe.push(EbiAR.events.on('achievement:unlock', function (event) { showMessage('実績解除：' + (event.achievement && event.achievement.title || '')); }));
    unsubscribe.push(EbiAR.events.on('quest:error', function () { showMessage('クエスト処理でエラーが発生しました。'); }));
    unsubscribe.push(EbiAR.events.on('achievement:error', function () { showMessage('実績処理でエラーが発生しました。'); }));
    unsubscribe.push(EbiAR.events.on('story:start', function (event) { showMessage('ストーリー開始：' + (event.story && event.story.title || '')); }));
    unsubscribe.push(EbiAR.events.on('story:complete', function (event) { showMessage('ストーリー完了：' + (event.story && event.story.title || '')); }));
  }

  /** UIを初期化し、タイトル画面を表示する。 */
  function init(options) {
    options = options || {};
    destroy();
    root = typeof options.root === 'string' ? document.querySelector(options.root) : (options.root || document.getElementById('app'));
    if (!root) throw new Error('UIの表示先要素が見つかりません。');
    injectStyles(); build(); subscribe();
    if (EbiAR.Quest && typeof EbiAR.Quest.mount === 'function') EbiAR.Quest.mount(byId('quest-root'));
    if (EbiAR.Achievement && typeof EbiAR.Achievement.mount === 'function') EbiAR.Achievement.mount(byId('achievement-root'));
    setLoading(true, options.loadingText);
    global.setTimeout(function () { showScreen(options.initialScreen || 'title'); }, options.loadingDurationMs == null ? 450 : options.loadingDurationMs);
    return EbiAR.ui;
  }
  function destroy() { unsubscribe.forEach(function (off) { off(); }); unsubscribe = []; if (root) root.replaceChildren(); root = null; }

  EbiAR.ui = Object.freeze({ init: init, destroy: destroy, showScreen: showScreen, fadeIn: fadeIn, fadeOut: fadeOut, setLoading: setLoading, showMessage: showMessage, updateHud: updateHud, updateLocation: updateLocation, renderSpot: renderSpot, renderCatalog: renderCatalog, renderCharacterDetail: renderCharacterDetail, renderCoupons: renderCoupons, getCurrentScreen: function () { return currentScreen; }, getCurrentCharacterId: function () { return currentCharacterId; } });
})(window);
