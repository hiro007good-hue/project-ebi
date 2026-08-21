/* 海老フライ王国AR v1.0 - UI画面管理 */
(function (global) {
  'use strict';

  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var root = null;
  var currentScreen = 'loading';
  var currentCharacterId = null;
  var lastFocusedElement = null;
  var unsubscribe = [];
  var failedCharacterImages = new Set();
  var COUPON_DEFINITIONS = Object.freeze({
    'collection-5': Object.freeze({ name: '図鑑コレクタークーポン', source: 'クエスト「図鑑を5種類集めよう」' }),
    'achievement-collection-5': Object.freeze({ name: '図鑑5種類 達成クーポン', source: '実績「図鑑5種類」' }),
    'achievement-1000-points': Object.freeze({ name: '1000ポイント達成クーポン', source: '実績「1000ポイント達成」' })
  });
  var settings = { bgmEnabled: true, seEnabled: true, bgmVolume: 0.6, seVolume: 0.8, vibration: true, highContrast: false };
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
      '.ebi-ui{--ebi:#e85d24;--ink:#282018;--paper:#fffaf2;--line:#ead9c4;display:block;width:100%;min-height:100svh;padding:0;text-align:left;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Noto Sans JP",sans-serif}',
      '.ebi-ui *{box-sizing:border-box}.ebi-ui button,.ebi-ui input,.ebi-ui select{font:inherit}.ebi-ui button{min-height:44px;cursor:pointer;border:0;border-radius:12px;padding:.7rem 1rem;background:var(--ebi);color:#fff;font-weight:700;touch-action:manipulation}.ebi-ui button.secondary{background:#fff;color:var(--ink);border:1px solid var(--line)}.ebi-ui :focus-visible{outline:3px solid #2767a8;outline-offset:2px}',
      '.ebi-ui .screen{display:none;width:100%;min-height:100svh;padding:max(20px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));animation:ebi-fade .22s ease}.ebi-ui .screen.active{display:flex;flex-direction:column}.ebi-ui .center{align-items:center;justify-content:center;text-align:center;gap:18px}.ebi-ui .title{font-size:clamp(1.8rem,7vw,3rem);line-height:1.18;margin:0;color:var(--ebi)}',
      '.ebi-ui .hud{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:rgba(255,250,242,.94);padding:8px 0;border-bottom:1px solid var(--line)}.ebi-ui .stat{padding:7px;text-align:center;font-size:.78rem}.ebi-ui .stat strong{display:block;font-size:1rem}',
      '.ebi-ui .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:auto;padding-top:20px}.ebi-ui .panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;margin:12px 0;box-shadow:0 2px 12px #5d34130d}',
      '.ebi-ui .catalog-summary{display:grid;gap:7px;margin:4px 0 14px}.ebi-ui .catalog-summary p{display:flex;justify-content:space-between;gap:12px;margin:0;font-weight:800}.ebi-ui .catalog-summary progress{width:100%;height:12px;accent-color:var(--ebi)}',
      '.ebi-ui .catalog{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ebi-ui .character-card{display:grid;min-width:0;min-height:44px;padding:10px;text-align:left;background:#fff!important;color:var(--ink)!important;border:1px solid var(--line)!important;overflow:hidden}.ebi-ui .character-card.locked{color:#625c56!important}.ebi-ui .character-card strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ebi-ui .catalog-image{position:relative;display:grid;place-items:center;width:100%;aspect-ratio:1;margin-bottom:8px;overflow:hidden;border-radius:10px;background:linear-gradient(145deg,#fff5e4,#f2dfc8)}.ebi-ui .catalog-image img{width:100%;height:100%;object-fit:contain}.ebi-ui .catalog-image.is-locked img{filter:brightness(0) saturate(100%);opacity:.72}.ebi-ui .catalog-image-fallback{font-size:clamp(3rem,18vw,6rem);line-height:1}.ebi-ui .catalog-image.is-locked .catalog-image-fallback{filter:brightness(0);opacity:.72}.ebi-ui .catalog-number,.ebi-ui .catalog-status{font-size:.72rem;color:#70645a}.ebi-ui .rarity{font-size:.74rem;color:var(--ebi)}',
      '.ebi-ui .toolbar{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}.ebi-ui .toolbar input{grid-column:1/-1}.ebi-ui .toolbar input,.ebi-ui .toolbar select{width:100%;min-height:44px;padding:.65rem;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink)}.ebi-ui .back{align-self:flex-start;min-height:44px;background:transparent!important;color:var(--ink)!important;padding:4px 8px!important}.ebi-ui .catalog-empty{padding:24px;text-align:center;color:#70645a}',
      '.ebi-ui .collection-progress{min-width:0;margin:0 0 22px;padding:16px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.ebi-ui .collection-progress h3{margin:0 0 10px;font-size:1rem}.ebi-ui .collection-progress-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.ebi-ui .collection-progress-head p{margin:0;color:#62564c}.ebi-ui .collection-total{font-size:.78rem}.ebi-ui .collection-progress-head strong{font-size:1.35rem;color:var(--ebi);white-space:nowrap}.ebi-ui .collection-progress progress{display:block;width:100%;height:14px;margin:10px 0;accent-color:var(--ebi)}.ebi-ui .collection-next{margin:0 0 14px;font-weight:700}.ebi-ui .collection-rewards{display:grid;gap:8px}.ebi-ui .collection-reward{min-width:0;padding:10px 12px;border-left:4px solid #34734a;background:#fff;overflow-wrap:anywhere}.ebi-ui .collection-reward strong{display:block;font-size:.85rem}.ebi-ui .collection-reward span{display:block;color:#62564c;font-size:.78rem}.ebi-ui .collection-reward-status{margin-top:5px;font-weight:800;color:#34734a!important}.ebi-ui .coupon-summary{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 14px}.ebi-ui .coupon-summary p{margin:0;color:#62564c}.ebi-ui .coupon-summary strong{font-size:1.35rem;color:var(--ebi);white-space:nowrap}.ebi-ui .coupon-list{display:grid;min-width:0;gap:12px}.ebi-ui .coupon-card{position:relative;min-width:0;overflow:hidden;margin:0;padding:16px;border:1px solid #dfc9ae;border-left:6px solid var(--ebi);border-radius:8px;background:#fff;overflow-wrap:anywhere}.ebi-ui .coupon-card h3{margin:0 0 6px;font-size:1rem}.ebi-ui .coupon-card p{margin:5px 0;color:#554a41;font-size:.9rem}.ebi-ui .coupon-source{padding-top:9px;border-top:1px dashed #dfc9ae;color:#71645a!important;font-size:.78rem!important}.ebi-ui .coupon-empty{min-height:150px;margin:0;padding:32px 8px;text-align:center;color:#70645a}.ebi-ui .coupon-empty strong{display:block;margin-bottom:8px;color:var(--ink)}',
      '.ebi-ui .catalog-modal{position:fixed;z-index:12000;inset:0;display:grid;align-items:center;overflow:auto;padding:max(16px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:#21170dcc}.ebi-ui .catalog-modal[hidden]{display:none}.ebi-ui .catalog-modal-panel{position:relative;width:min(100%,560px);max-height:calc(100svh - 32px);margin:auto;overflow:auto;border-radius:20px;background:#fffaf2;box-shadow:0 20px 60px #0008}.ebi-ui .catalog-modal-close{position:sticky;z-index:2;top:10px;float:right;width:46px;min-height:46px;margin:10px 10px -56px 0;padding:0;border-radius:50%;font-size:1.5rem}.ebi-ui .character-detail{padding:20px}.ebi-ui .character-detail .catalog-image{width:min(100%,360px);margin:0 auto 16px}.ebi-ui .character-detail h2{margin:.1rem 0}.ebi-ui .character-detail dl{display:grid;grid-template-columns:auto 1fr;gap:7px 14px;margin:16px 0}.ebi-ui .character-detail dt{font-weight:800}.ebi-ui .character-detail dd{min-width:0;margin:0}',
      '.ebi-ui .message{position:fixed;z-index:12500;left:50%;bottom:max(20px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(92vw,520px);background:#30251d;color:#fff;padding:14px 16px;border-radius:14px;box-shadow:0 8px 30px #0004}.ebi-ui .message[hidden]{display:none}.ebi-ui .spinner{width:42px;height:42px;border:5px solid #f3d3c1;border-top-color:var(--ebi);border-radius:50%;animation:ebi-spin .8s linear infinite}',
      '.ebi-ui .fade-out{opacity:0;transition:opacity .2s ease;pointer-events:none}.ebi-ui .fade-in{animation:ebi-fade .25s ease}@keyframes ebi-spin{to{transform:rotate(360deg)}}@keyframes ebi-fade{from{opacity:0}to{opacity:1}}',
      '@media (min-width:600px){.ebi-ui .catalog{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (min-width:800px){.ebi-ui .screen{max-width:900px;margin:auto;padding:28px}.ebi-ui .catalog{grid-template-columns:repeat(4,minmax(0,1fr))}.ebi-ui .actions{max-width:520px;width:100%;align-self:center}}@media (prefers-reduced-motion:reduce){.ebi-ui *{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}'
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
    root.addEventListener('input', handleInput);
    document.addEventListener('keydown', handleKeydown);
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
  function createSelect(id, label, options) {
    var select = document.createElement('select'); select.id = id; select.setAttribute('aria-label', label);
    options.forEach(function (option) { var item = document.createElement('option'); item.value = option[0]; item.textContent = option[1]; select.appendChild(item); });
    return select;
  }
  function createCatalog() {
    var el = screen('screen-catalog'); el.append(button('← 戻る', 'game', 'back'));
    var heading = document.createElement('h2'); heading.textContent = '海老フライ図鑑';
    var summary = document.createElement('div'); summary.className = 'catalog-summary';
    var rate = document.createElement('p'); rate.append(Object.assign(document.createElement('span'), { id: 'catalog-rate' }), Object.assign(document.createElement('strong'), { id: 'catalog-percent' }));
    var progress = document.createElement('progress'); progress.id = 'catalog-progress'; progress.max = 100; progress.value = 0; progress.setAttribute('aria-label', '図鑑完成率');
    summary.append(rate, progress);
    var toolbar = document.createElement('div'); toolbar.className = 'toolbar';
    var input = document.createElement('input'); input.id = 'catalog-search'; input.type = 'search'; input.placeholder = '名前・レア度・スポットを検索'; input.setAttribute('aria-label', '図鑑を検索');
    var filter = createSelect('catalog-filter', '発見状態で絞り込む', [['all','すべて'], ['acquired','発見済み'], ['unacquired','未発見']]);
    var sort = createSelect('catalog-sort', '図鑑の並び順', [['number','番号順'], ['name','名前順'], ['rarity','レア度順']]);
    toolbar.append(input, filter, sort);
    var list = document.createElement('div'); list.id = 'catalog-list'; list.className = 'catalog'; list.setAttribute('aria-live', 'polite');
    var empty = document.createElement('p'); empty.id = 'catalog-empty'; empty.className = 'catalog-empty'; empty.hidden = true; empty.textContent = '条件に一致するキャラクターはいません。';
    el.append(heading, summary, toolbar, list, empty); return el;
  }
  function createCharacterDetail() {
    var modal = document.createElement('div'); modal.id = 'character-modal'; modal.className = 'catalog-modal'; modal.hidden = true;
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'character-detail-title'); modal.setAttribute('aria-describedby', 'character-detail-description');
    var panel = document.createElement('article'); panel.className = 'catalog-modal-panel';
    var close = button('×', 'character-close', 'catalog-modal-close'); close.setAttribute('aria-label', '詳細を閉じる');
    var detail = document.createElement('div'); detail.id = 'character-detail'; detail.className = 'character-detail';
    panel.append(close, detail); modal.appendChild(panel); return modal;
  }
  function createQuest() { var el = screen('screen-quest'); el.append(button('← 戻る', 'game', 'back')); var content = document.createElement('div'); content.id = 'quest-root'; el.append(content); return el; }
  function createAchievement() { var el = screen('screen-achievement'); el.append(button('← 戻る', 'game', 'back')); var content = document.createElement('div'); content.id = 'achievement-root'; el.append(content); return el; }
  function createCoupons() {
    var el = screen('screen-coupons'); el.append(button('← 戻る', 'game', 'back'));
    var heading = document.createElement('h2'); heading.textContent = 'クーポン';
    var collection = document.createElement('section'); collection.id = 'coupon-collection-progress'; collection.className = 'collection-progress'; collection.setAttribute('aria-labelledby', 'coupon-collection-title');
    var summary = document.createElement('div'); summary.className = 'coupon-summary';
    summary.append(Object.assign(document.createElement('p'), { textContent: '獲得した限定クーポン' }), Object.assign(document.createElement('strong'), { id: 'coupon-count', textContent: '0枚' }));
    var list = document.createElement('div'); list.id = 'coupon-list'; list.className = 'coupon-list'; list.setAttribute('aria-live', 'polite'); list.setAttribute('aria-atomic', 'true');
    el.append(heading, collection, summary, list); return el;
  }
  function createSettings() {
    if (EbiAR.sound && typeof EbiAR.sound.getSettings === 'function') settings = Object.assign(settings, EbiAR.sound.getSettings());
    var el = screen('screen-settings'); el.append(button('← 戻る', 'game', 'back'));
    var heading = document.createElement('h2'); heading.textContent = '設定';
    var panel = document.createElement('div'); panel.className = 'panel';
    [['bgmEnabled','BGM'], ['seEnabled','効果音'], ['vibration','バイブレーション'], ['highContrast','高コントラスト表示']].forEach(function (item) {
      var label = document.createElement('label'); var input = document.createElement('input');
      input.type = 'checkbox'; input.dataset.setting = item[0]; input.checked = settings[item[0]];
      label.append(input, text(' ' + item[1])); panel.appendChild(label); panel.appendChild(document.createElement('br'));
    });
    [['bgmVolume','BGM音量'], ['seVolume','効果音音量']].forEach(function (item) {
      var label = document.createElement('label'); label.textContent = item[1] + ' ';
      var input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '0.05'; input.value = settings[item[0]]; input.dataset.setting = item[0]; input.setAttribute('aria-label', item[1]);
      label.appendChild(input); panel.appendChild(label); panel.appendChild(document.createElement('br'));
    });
    var note = document.createElement('p'); note.textContent = 'Safariで遊んでいたデータが表示されない場合は、Saveのエクスポート／インポートをご利用ください。';
    panel.appendChild(note); el.append(heading, panel); return el;
  }

  /** 指定画面をフェード付きで表示する。 */
  function showScreen(name) {
    var next = byId('screen-' + name);
    if (!next) return false;
    var previous = byId('screen-' + currentScreen);
    if (currentScreen === 'catalog' && name !== 'catalog') { closeCharacterDetail(); stopCharacterAnimations(previous); }
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
    setText('hud-location', update.status === 'ready' || update.status === 'outside_area' ? '精度±' + accuracy + 'm' : '取得中');
    renderGpsStatus(update.status);
  }
  /** GPS状態と近傍スポットをゲーム画面の案内パネルへ反映する。 */
  function renderGpsStatus(status, nearbySpots) {
    var content = {
      locating: ['現在地を取得しています…', '位置情報を確認しています。', ''],
      ready: ['現在地を取得しました', '現在地の近くに冒険スポットはありません。', '近くのスポットを探しながら冒険しよう。'],
      low_accuracy: ['現在地を確認しています…', '屋外など位置情報を取得しやすい場所でお待ちください。', ''],
      outside_area: ['現在地を取得しました', '日野町の冒険エリア外です。', '日野町に近づくと冒険スポットが表示されます。'],
      permission_denied: ['位置情報の利用が許可されていません', 'Safariと端末の設定から位置情報を許可してください。', ''],
      timeout: ['現在地の取得に時間がかかっています', '屋外など位置情報を取得しやすい場所でお待ちください。', ''],
      unavailable: ['現在地を取得できませんでした', '通信環境と位置情報の設定を確認して、もう一度お試しください。', '']
    }[status] || null;
    if (status === 'ready' && nearbySpots && nearbySpots.length) {
      renderSpot(nearbySpots[0]);
      return;
    }
    if (!content) return;
    setText('spot-name', content[0]);
    setText('spot-description', content[1]);
    setText('spot-guide', content[2]);
  }
  function updateGpsSpots(event) {
    if (!event) return;
    renderGpsStatus(event.status, event.nearbySpots || []);
  }
  function renderGpsError(event) {
    var status = event && event.status || 'unavailable';
    renderGpsStatus(status);
    setText('hud-location', '取得失敗');
    if (event && event.message) showMessage(event.message);
  }
  function renderSpot(spot) {
    if (!spot) return;
    setText('spot-name', spot.name || '近くのスポット');
    setText('spot-description', spot.description || 'スポットに到着しました。');
    setText('spot-guide', spot.guide || '周囲の安全に注意して楽しもう。');
  }
  function characterState() { var game = EbiAR.game && EbiAR.game.getState ? EbiAR.game.getState() : null; return game && game.character ? game.character : null; }
  /** character.jsの定義順を図鑑番号へ変換する。 */
  function catalogNumber(id) {
    var catalog = EbiAR.character && EbiAR.character.catalog || [];
    return Math.max(0, catalog.findIndex(function (item) { return item.id === id; })) + 1;
  }
  function formatCatalogNumber(id) { return String(catalogNumber(id)).padStart(3, '0'); }
  function stopCharacterAnimations(container) {
    if (!container) return;
    if (EbiAR.Blink) Array.from(container.querySelectorAll('img')).forEach(function (image) { EbiAR.Blink.stop(image); });
    if (EbiAR.idle) Array.from(container.querySelectorAll('.character-idle')).forEach(function (element) { EbiAR.idle.stop(element); });
  }
  /** 正式画像と読込失敗時の共通フォールバックを生成する。 */
  function createCharacterImage(entry, large) {
    var frame = document.createElement('div'); frame.className = 'catalog-image' + (entry.isAcquired ? '' : ' is-locked') + (large ? ' is-large' : '');
    var idle = document.createElement('div'); idle.className = 'character-idle';
    var float = document.createElement('div'); float.className = 'character-idle-float';
    var sway = document.createElement('div'); sway.className = 'character-idle-sway';
    var jump = document.createElement('div'); jump.className = 'character-idle-jump';
    var fallback = document.createElement('span'); fallback.className = 'catalog-image-fallback'; fallback.textContent = '🦐'; fallback.setAttribute('role', 'img'); fallback.setAttribute('aria-label', 'キャラクター画像を準備中'); fallback.hidden = true;
    var image = document.createElement('img'); image.alt = entry.isAcquired ? entry.name : ''; image.decoding = 'async'; image.loading = large ? 'eager' : 'lazy';
    function showFallback() { failedCharacterImages.add(entry.image); image.hidden = true; fallback.hidden = false; if (EbiAR.idle) EbiAR.idle.stop(idle); }
    image.addEventListener('error', showFallback, { once: true });
    if (entry.image && !failedCharacterImages.has(entry.image)) image.src = entry.image;
    else showFallback();
    jump.append(image, fallback); sway.appendChild(jump); float.appendChild(sway); idle.appendChild(float); frame.appendChild(idle);
    if (entry.image && !failedCharacterImages.has(entry.image) && EbiAR.Blink) EbiAR.Blink.start(image, entry.id);
    if (entry.image && !failedCharacterImages.has(entry.image) && EbiAR.idle) EbiAR.idle.start(idle, { mode: large ? 'detail' : 'catalog' });
    return frame;
  }
  function rarityLabel(entry) {
    var rank = entry.rarityInfo ? entry.rarityInfo.rank : 0;
    return '★'.repeat(rank) + (entry.rarityInfo ? ' ' + entry.rarityInfo.name : '');
  }
  /** 検索・発見状態・並び順を反映して図鑑一覧を再描画する。 */
  function renderCatalog() {
    var list = byId('catalog-list'); if (!list) return;
    stopCharacterAnimations(list);
    list.replaceChildren();
    var player = characterState();
    var query = byId('catalog-search') ? byId('catalog-search').value : '';
    var entries = EbiAR.character && EbiAR.character.search ? EbiAR.character.search(player, query) : [];
    var stats = EbiAR.character && EbiAR.character.collectionStats ? EbiAR.character.collectionStats(player) : null;
    var filter = byId('catalog-filter') ? byId('catalog-filter').value : 'all';
    var sort = byId('catalog-sort') ? byId('catalog-sort').value : 'number';
    entries = entries.filter(function (entry) { return filter === 'all' || (filter === 'acquired' ? entry.isAcquired : !entry.isAcquired); });
    entries.sort(function (a, b) {
      if (sort === 'name') return a.name.localeCompare(b.name, 'ja-JP') || catalogNumber(a.id) - catalogNumber(b.id);
      if (sort === 'rarity') return (b.rarityInfo?.rank || 0) - (a.rarityInfo?.rank || 0) || catalogNumber(a.id) - catalogNumber(b.id);
      return catalogNumber(a.id) - catalogNumber(b.id);
    });
    setText('catalog-rate', stats ? '図鑑完成率 ' + stats.acquired + ' / ' + stats.total : '図鑑を準備中です');
    setText('catalog-percent', stats ? stats.completionRate + '%' : '');
    var progress = byId('catalog-progress');
    if (progress) {
      progress.value = stats ? stats.completionRate : 0;
      progress.setAttribute('aria-valuetext', stats ? stats.acquired + ' / ' + stats.total + '、' + stats.completionRate + '%' : '準備中');
    }
    var empty = byId('catalog-empty'); if (empty) empty.hidden = entries.length !== 0;
    entries.forEach(function (entry) {
      var card = button('', 'character'); card.classList.add('character-card'); if (!entry.isAcquired) card.classList.add('locked');
      card.dataset.characterId = entry.id; card.setAttribute('aria-label', '図鑑No.' + formatCatalogNumber(entry.id) + ' ' + (entry.isAcquired ? entry.name + '、発見済み' : '未発見'));
      var number = document.createElement('span'); number.className = 'catalog-number'; number.textContent = 'No.' + formatCatalogNumber(entry.id);
      var name = document.createElement('strong'); name.textContent = entry.isAcquired ? entry.name : '？？？';
      var rarity = document.createElement('span'); rarity.className = 'rarity'; rarity.textContent = rarityLabel(entry);
      var status = document.createElement('span'); status.className = 'catalog-status'; status.textContent = entry.isAcquired ? '発見済み' : '未発見';
      card.append(createCharacterImage(entry, false), number, name, rarity, status); list.appendChild(card);
    });
  }
  function formatAcquiredAt(value) {
    if (!value) return '';
    var date = new Date(value); if (Number.isNaN(date.getTime())) return '';
    try { return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
    catch (error) { return date.toLocaleString('ja-JP'); }
  }
  /** 単一の再利用モーダルへキャラクター詳細を描画して開く。 */
  function renderCharacterDetail(id) {
    var panel = byId('character-detail'); var modal = byId('character-modal'); if (!panel || !modal || !EbiAR.character) return;
    var entry = EbiAR.character.getCatalogEntry(characterState(), id);
    if (!entry) return;
    stopCharacterAnimations(panel); panel.replaceChildren();
    var number = document.createElement('span'); number.className = 'catalog-number'; number.textContent = '図鑑 No.' + formatCatalogNumber(entry.id);
    var heading = document.createElement('h2'); heading.id = 'character-detail-title'; heading.textContent = entry.isAcquired ? entry.name : '？？？';
    var rarity = document.createElement('p'); rarity.className = 'rarity'; rarity.textContent = rarityLabel(entry);
    var description = document.createElement('p'); description.id = 'character-detail-description'; description.textContent = entry.isAcquired ? entry.description : 'まだ発見されていません';
    var details = document.createElement('dl');
    function addDetail(label, value) { var term = document.createElement('dt'); term.textContent = label; var detail = document.createElement('dd'); detail.textContent = value; details.append(term, detail); }
    addDetail('取得状態', entry.isAcquired ? '取得済み' : '未発見');
    if (entry.isAcquired && entry.appearanceSpots?.length) addDetail('出現スポット', entry.appearanceSpots.map(function (spot) { return spot.name; }).join('、'));
    else if (entry.isAcquired && entry.appearanceSpot) addDetail('出現スポット', entry.appearanceSpot.name);
    var acquiredAt = entry.isAcquired && entry.record ? formatAcquiredAt(entry.record.acquiredAt) : '';
    if (acquiredAt) addDetail('発見日時', acquiredAt);
    panel.append(createCharacterImage(entry, true), number, heading, rarity, description, details);
    currentCharacterId = id; lastFocusedElement = document.activeElement; modal.hidden = false;
    var close = modal.querySelector('[data-action="character-close"]'); if (close) close.focus();
  }
  /** 詳細モーダルを閉じ、開く前の要素へフォーカスを戻す。 */
  function closeCharacterDetail() {
    var modal = byId('character-modal'); if (!modal || modal.hidden) return false;
    stopCharacterAnimations(byId('character-detail'));
    modal.hidden = true;
    if (lastFocusedElement && lastFocusedElement.isConnected && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
    lastFocusedElement = null;
    return true;
  }
  /**
   * 保存済みクーポンを安全に取得する。
   * 保存データが破損している場合でも、UI表示を継続する。
   * @returns {Array<object>}
   */
  function getSavedCoupons() {
    var state = EbiAR.game && typeof EbiAR.game.getState === 'function'
      ? EbiAR.game.getState()
      : null;
    return state && Array.isArray(state.character?.coupons) ? state.character.coupons : [];
  }

  /** 正式カタログと正規化済みプレイヤー状態から収集進捗を取得する。 */
  function getCollectionProgress() {
    var state = EbiAR.game && typeof EbiAR.game.getState === 'function' ? EbiAR.game.getState() : null;
    var character = state && state.character;
    if (!EbiAR.character || typeof EbiAR.character.collectionStats !== 'function') return { acquired: 0, total: 0 };
    var stats = EbiAR.character.collectionStats(character);
    return {
      acquired: Math.max(0, Math.min(safeNumber(stats.acquired), safeNumber(stats.total))),
      total: Math.max(0, safeNumber(stats.total))
    };
  }

  /** 既存Quest/Achievement APIから5体収集報酬の達成状態を読み取る。 */
  function getCollectionRewardStatus(system, completedStatuses, acquired) {
    var progress = system && typeof system.getProgress === 'function' ? system.getProgress('collection-five') : null;
    var status = progress && typeof progress.status === 'string' ? progress.status : '';
    var completed = completedStatuses.indexOf(status) >= 0;
    var current = progress ? safeNumber(progress.current) : acquired;
    return { completed: completed, remaining: Math.max(0, 5 - Math.max(current, acquired)) };
  }

  /** クーポン画面へ捕獲進捗と既存の5体収集報酬を表示する。 */
  function renderCollectionProgress() {
    var target = byId('coupon-collection-progress'); if (!target) return;
    var stats = getCollectionProgress();
    var firstTarget = 5;
    var nextText = stats.total === 0
      ? '収集対象を確認しています'
      : stats.acquired < firstTarget
        ? '次の目標：あと' + (firstTarget - stats.acquired) + '体で「5体収集」達成！'
        : stats.acquired < stats.total
          ? '✅ 5体収集 達成済み（コンプリートまであと' + (stats.total - stats.acquired) + '体）'
          : '🎉 正式収集対象をコンプリートしました！';
    var title = Object.assign(document.createElement('h3'), { id: 'coupon-collection-title', textContent: 'キャラクター収集進捗' });
    var head = document.createElement('div'); head.className = 'collection-progress-head';
    var labels = document.createElement('div');
    labels.append(Object.assign(document.createElement('p'), { textContent: '現在の捕獲数' }), Object.assign(document.createElement('p'), { className: 'collection-total', textContent: '正式収集対象：' + stats.total + '体' }));
    head.append(labels, Object.assign(document.createElement('strong'), { textContent: stats.acquired + ' / ' + stats.total + '体' }));
    var progress = document.createElement('progress'); progress.max = Math.max(1, stats.total); progress.value = stats.acquired; progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-label', 'キャラクター収集進捗'); progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', String(stats.total)); progress.setAttribute('aria-valuenow', String(stats.acquired)); progress.setAttribute('aria-valuetext', stats.acquired + ' / ' + stats.total + '体');
    var next = Object.assign(document.createElement('p'), { className: 'collection-next', textContent: nextText });
    var rewards = document.createElement('div'); rewards.className = 'collection-rewards'; rewards.setAttribute('aria-label', '5体収集時の既存報酬');
    var achievementStatus = getCollectionRewardStatus(EbiAR.Achievement, ['unlocked', 'claimed'], stats.acquired);
    var questStatus = getCollectionRewardStatus(EbiAR.Quest, ['completed', 'claimed'], stats.acquired);
    [
      ['【5体収集 実績】', '500pt・経験値 +250・コイン +50・限定クーポン', achievementStatus],
      ['【5体収集 クエスト】', '500pt・経験値 +250・コイン +50・クーポン', questStatus]
    ].forEach(function (reward) {
      var row = document.createElement('div'); row.className = 'collection-reward';
      var rewardStatusText = reward[2].completed ? '✅ 達成済み' : reward[2].remaining > 0 ? '未達成（あと' + reward[2].remaining + '体）' : '未達成（進行条件を確認中）';
      var status = Object.assign(document.createElement('span'), { className: 'collection-reward-status', textContent: rewardStatusText });
      row.append(Object.assign(document.createElement('strong'), { textContent: reward[0] }), Object.assign(document.createElement('span'), { textContent: reward[1] }), status); rewards.appendChild(row);
    });
    target.replaceChildren(title, head, progress, next, rewards);
  }

  /** 保存形式の文字列・将来のオブジェクト形式を安全な表示モデルへ変換する。 */
  function normalizeCoupon(coupon) {
    var id = typeof coupon === 'string' ? coupon : (coupon && typeof coupon.id === 'string' ? coupon.id : '');
    if (!id || id.length > 128) return null;
    var definition = COUPON_DEFINITIONS[id] || {};
    var suppliedName = coupon && typeof coupon.name === 'string' ? coupon.name.trim().slice(0, 80) : '';
    if (suppliedName === id || /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(suppliedName)) suppliedName = '';
    return {
      id: id,
      name: definition.name || suppliedName || '獲得済みクーポン',
      description: coupon && typeof coupon.description === 'string' && coupon.description.trim() ? coupon.description.trim().slice(0, 160) : '獲得済みの特典クーポンです。',
      source: coupon && typeof coupon.source === 'string' && coupon.source.trim() ? coupon.source.trim().slice(0, 100) : (definition.source || 'ゲーム内報酬')
    };
  }

  function renderCoupons(coupons) {
    var target = byId('coupon-list'); if (!target) return;
    renderCollectionProgress();
    var values = Array.isArray(coupons) ? coupons : getSavedCoupons();
    var seen = new Set();
    var items = values.map(normalizeCoupon).filter(function (coupon) {
      if (!coupon || seen.has(coupon.id)) return false;
      seen.add(coupon.id); return true;
    });
    target.replaceChildren();
    setText('coupon-count', items.length.toLocaleString() + '枚');
    if (!items.length) {
      var empty = document.createElement('p'); empty.className = 'coupon-empty';
      empty.append(Object.assign(document.createElement('strong'), { textContent: 'クーポンはまだありません' }), document.createElement('br'), text('クエストや実績を達成すると獲得できます。'));
      target.appendChild(empty); return;
    }
    items.forEach(function (coupon) {
      var card = document.createElement('article'); card.className = 'coupon-card';
      var heading = document.createElement('h3'); heading.textContent = coupon.name;
      var description = document.createElement('p'); description.textContent = coupon.description;
      var source = document.createElement('p'); source.className = 'coupon-source'; source.textContent = '取得元：' + coupon.source;
      card.append(heading, description, source); target.appendChild(card);
    });
  }

  /** Save load/import/reset後にAudioManagerの値を設定フォームへ同期する。 */
  function syncAudioSettingsControls() {
    if (!EbiAR.sound || typeof EbiAR.sound.getSettings !== 'function') return;
    settings = Object.assign(settings, EbiAR.sound.getSettings());
    ['bgmEnabled', 'seEnabled', 'bgmVolume', 'seVolume'].forEach(function (key) {
      var input = root && root.querySelector('[data-setting="' + key + '"]');
      if (!input) return;
      if (input.type === 'range') input.value = settings[key];
      else input.checked = settings[key];
    });
  }

  function handleClick(event) {
    if (event.target.id === 'character-modal') { closeCharacterDetail(); return; }
    var target = event.target.closest('[data-action]'); if (!target || !root.contains(target)) return;
    var action = target.dataset.action;
    if (action === 'start') { if (EbiAR.events) EbiAR.events.emit('ui:start-requested'); showScreen('game'); return; }
    if (action === 'character') { renderCharacterDetail(target.dataset.characterId); return; }
    if (action === 'character-close') { closeCharacterDetail(); return; }
    if (action === 'catalog' || action === 'quest' || action === 'achievement' || action === 'coupons' || action === 'settings' || action === 'title' || action === 'game') showScreen(action);
  }
  function handleChange(event) {
    if (event.target.id === 'catalog-filter' || event.target.id === 'catalog-sort') { renderCatalog(); return; }
    var key = event.target.dataset.setting; if (!key) return;
    settings[key] = event.target.type === 'range' ? Number(event.target.value) : !!event.target.checked;
    if (key === 'highContrast') root.classList.toggle('high-contrast', settings[key]);
    if (EbiAR.sound) {
      if (key === 'bgmEnabled') EbiAR.sound.setBgmEnabled(settings[key]);
      if (key === 'seEnabled') EbiAR.sound.setSeEnabled(settings[key]);
      if (key === 'bgmVolume') EbiAR.sound.setBgmVolume(settings[key]);
      if (key === 'seVolume') EbiAR.sound.setSeVolume(settings[key]);
    }
    if ((key === 'bgmEnabled' || key === 'seEnabled' || key === 'bgmVolume' || key === 'seVolume') && EbiAR.save) {
      try { EbiAR.save.saveGame(); } catch (error) { showMessage('音声設定を保存できませんでした。'); }
    }
    if (EbiAR.events) EbiAR.events.emit('ui:settings-changed', Object.assign({}, settings));
  }
  function handleInput(event) { if (event.target.id === 'catalog-search') renderCatalog(); }
  function handleKeydown(event) {
    var modal = byId('character-modal'); if (!modal || modal.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeCharacterDetail(); return; }
    if (event.key !== 'Tab') return;
    var focusable = Array.from(modal.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function refreshCatalogIfVisible() {
    if (currentScreen !== 'catalog') return;
    closeCharacterDetail();
    renderCatalog();
  }
  function subscribe() {
    if (!EbiAR.events) return;
    unsubscribe.push(EbiAR.events.on('game:state', updateHud));
    unsubscribe.push(EbiAR.events.on('gps:started', function () { renderGpsStatus('locating'); }));
    unsubscribe.push(EbiAR.events.on('gps:update', updateLocation));
    unsubscribe.push(EbiAR.events.on('gps:spots-updated', updateGpsSpots));
    unsubscribe.push(EbiAR.events.on('gps:spot-arrived', function (event) { renderSpot(event.spot); showMessage(event.spot.name + ' に到着しました'); }));
    unsubscribe.push(EbiAR.events.on('gps:error', renderGpsError));
    unsubscribe.push(EbiAR.events.on('character:acquired', function (event) { showMessage((event.character && event.character.name || 'キャラクター') + 'を発見！'); if (currentScreen === 'coupons') renderCollectionProgress(); }));
    unsubscribe.push(EbiAR.events.on('ar:spot-complete', function (event) { showMessage((event.spot && event.spot.name || 'このスポット') + 'のキャラクターはすべて発見しました'); }));
    unsubscribe.push(EbiAR.events.on('character:levelup', function () { showMessage('レベルアップ！'); }));
    unsubscribe.push(EbiAR.events.on('quest:complete', function (event) { showMessage('クエスト達成：' + (event.quest && event.quest.title || '')); if (currentScreen === 'coupons') renderCollectionProgress(); }));
    unsubscribe.push(EbiAR.events.on('achievement:unlock', function (event) { showMessage('実績解除：' + (event.achievement && event.achievement.title || '')); if (currentScreen === 'coupons') renderCollectionProgress(); }));
    unsubscribe.push(EbiAR.events.on('quest:error', function () { showMessage('クエスト処理でエラーが発生しました。'); }));
    unsubscribe.push(EbiAR.events.on('achievement:error', function () { showMessage('実績処理でエラーが発生しました。'); }));
    unsubscribe.push(EbiAR.events.on('coupon:acquired', function () { if (currentScreen === 'coupons') renderCoupons(); }));
    unsubscribe.push(EbiAR.events.on('story:start', function (event) { showMessage('ストーリー開始：' + (event.story && event.story.title || '')); }));
    unsubscribe.push(EbiAR.events.on('story:complete', function (event) { showMessage('ストーリー完了：' + (event.story && event.story.title || '')); }));
    unsubscribe.push(EbiAR.events.on('save:loaded', function () { syncAudioSettingsControls(); refreshCatalogIfVisible(); if (currentScreen === 'coupons') renderCoupons(); }));
    unsubscribe.push(EbiAR.events.on('save:imported', function () { syncAudioSettingsControls(); if (currentScreen === 'coupons') renderCoupons(); }));
    unsubscribe.push(EbiAR.events.on('save:reset', function () { syncAudioSettingsControls(); refreshCatalogIfVisible(); if (currentScreen === 'coupons') renderCoupons([]); }));
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
    global.clearTimeout(timers.loading);
    timers.loading = global.setTimeout(function () { showScreen(options.initialScreen || 'title'); }, options.loadingDurationMs == null ? 450 : options.loadingDurationMs);
    return EbiAR.ui;
  }
  function destroy() {
    unsubscribe.forEach(function (off) { off(); }); unsubscribe = [];
    document.removeEventListener('keydown', handleKeydown);
    if (root) {
      stopCharacterAnimations(root);
      root.removeEventListener('click', handleClick);
      root.removeEventListener('change', handleChange);
      root.removeEventListener('input', handleInput);
      root.replaceChildren();
    }
    global.clearTimeout(timers.message); timers = {}; lastFocusedElement = null; currentScreen = 'loading'; root = null;
  }

  EbiAR.ui = Object.freeze({ init: init, destroy: destroy, showScreen: showScreen, fadeIn: fadeIn, fadeOut: fadeOut, setLoading: setLoading, showMessage: showMessage, updateHud: updateHud, updateLocation: updateLocation, renderSpot: renderSpot, renderCatalog: renderCatalog, renderCharacterDetail: renderCharacterDetail, closeCharacterDetail: closeCharacterDetail, renderCoupons: renderCoupons, getCurrentScreen: function () { return currentScreen; }, getCurrentCharacterId: function () { return currentCharacterId; } });
})(window);
