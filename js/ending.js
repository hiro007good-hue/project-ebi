/**
 * Project EBI - Ending & Release Polish
 * @version 1.0.0
 * @license Proprietary
 */
(function endingModule(global) {
  'use strict';

  const EbiAR = global.EbiAR;
  if (!EbiAR?.events) throw new Error('config.js must be loaded before ending.js.');

  const STORAGE_KEY = 'ebiar.ending.v1';
  const VERSION = '1.0';
  const BUILD_NUMBER = '20260727.1';
  const QUEST_TOTAL = 7;
  const ACHIEVEMENT_TOTAL = 7;
  const clone = (value) => JSON.parse(JSON.stringify(value));

  /**
   * エンディング、スタッフロール、統計、公開版情報を管理する。
   */
  class EndingManager {
    constructor() {
      this.initialized = false;
      this.cleared = false;
      this.completionRate = 0;
      this.playTimeMs = 0;
      this.clearedAt = null;
      this.sessionStartedAt = Date.now();
      this.root = null;
      this.view = null;
      this.pendingSave = null;
      this.pendingStart = false;
      this.#bindEvents();
    }

    /**
     * Ending Managerを初期化する。
     * @param {object} [saved] 統合Save内のEnding状態
     * @returns {object}
     */
    initialize(saved) {
      if (saved) this.load(saved);
      else if (this.pendingSave) this.load(this.pendingSave);
      else this.load();
      this.initialized = true;
      this.sessionStartedAt = Date.now();
      this.#ensureRoot();
      this.#updateTitle();
      const storyCompleted = EbiAR.Story?.getState?.().completedStories?.includes('chapter4-ending');
      if ((this.pendingStart || storyCompleted) && !this.cleared) this.startEnding();
      return this.getState();
    }

    /**
     * エンディングを開始する。
     * @returns {boolean}
     */
    startEnding() {
      if (!this.initialized) {
        this.pendingStart = true;
        return false;
      }
      this.pendingStart = false;
      EbiAR.events.emit('ending:start', {
        statistics: this.calculateStatistics(),
        completion: this.calculateCompletion()
      });
      return this.playCredits();
    }

    /**
     * スタッフロールを表示する。
     * @returns {boolean}
     */
    playCredits() {
      const root = this.#ensureRoot();
      this.view = 'credits';
      if (root) {
        root.querySelector('#ending-content').innerHTML = `
          <div class="ending-credits" aria-label="スタッフロール">
            <p>Produced by</p><strong>hiro007good</strong>
            <p>Development</p><strong>Project EBI</strong>
            <p>Special Thanks</p><strong>日野町</strong><strong>OpenAI ChatGPT</strong>
          </div>`;
        this.#setHeading('海老フライ王国AR', '冒険の記録');
        this.#setActions('スキップ', '統計を見る');
        root.hidden = false;
      }
      EbiAR.events.emit('ending:credit', { build: BUILD_NUMBER });
      return true;
    }

    /**
     * プレイ統計画面を表示する。
     * @returns {object}
     */
    showStatistics() {
      const statistics = this.calculateStatistics();
      const root = this.#ensureRoot();
      if (root) {
        this.view = 'statistics';
        const rows = [
          ['プレイ時間', this.#formatDuration(statistics.playTimeMs)],
          ['訪問スポット数', statistics.visitedSpots],
          ['取得キャラクター数', statistics.acquiredCharacters],
          ['Quest達成率', `${statistics.questRate}%`],
          ['Achievement達成率', `${statistics.achievementRate}%`],
          ['図鑑完成率', `${statistics.catalogRate}%`],
          ['ポイント', statistics.points.toLocaleString('ja-JP')],
          ['レベル', `Lv.${statistics.level}`]
        ];
        root.querySelector('#ending-content').innerHTML = `<dl class="ending-statistics">${rows.map(
          ([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`
        ).join('')}</dl>`;
        this.#setHeading('冒険の記録', 'Statistics');
        this.#setActions('クレジット', 'コンプリート率');
        root.hidden = false;
      }
      return statistics;
    }

    /**
     * ゲーム全体のコンプリート率を表示する。
     * @returns {object}
     */
    showCompletion() {
      const completion = this.calculateCompletion();
      const root = this.#ensureRoot();
      if (root) {
        this.view = 'completion';
        const rows = [
          ['ゲーム全体', completion.overall],
          ['Quest', completion.quest],
          ['Achievement', completion.achievement],
          ['図鑑', completion.catalog],
          ['スポット', completion.spots]
        ];
        root.querySelector('#ending-content').innerHTML = `<div class="ending-completion">${rows.map(
          ([label, value]) => `<div><span>${label}</span><strong>${value}%</strong><div class="ending-meter" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><i style="width:${value}%"></i></div></div>`
        ).join('')}</div>`;
        this.#setHeading('Complete', `${completion.overall}%`);
        this.#setActions('統計へ戻る', 'タイトルへ');
        root.hidden = false;
      }
      return completion;
    }

    /**
     * エンディングを終了し、クリア状態を保存する。
     * @returns {object}
     */
    finish() {
      const completion = this.calculateCompletion();
      this.playTimeMs = this.#currentPlayTime();
      this.sessionStartedAt = Date.now();
      this.cleared = true;
      this.completionRate = completion.overall;
      this.clearedAt ||= new Date().toISOString();
      if (this.root) this.root.hidden = true;
      this.view = null;
      this.save();
      this.#updateTitle();
      try { EbiAR.save?.saveGame?.(); }
      catch (error) { console.error('[EbiAR Ending] integrated save failed', error); }
      EbiAR.events.emit('ending:finish', {
        statistics: this.calculateStatistics(),
        completion: completion,
        state: this.getState()
      });
      EbiAR.ui?.showScreen?.('title');
      return this.getState();
    }

    /**
     * 現在のプレイ統計を算出する。
     * @returns {object}
     */
    calculateStatistics() {
      const character = EbiAR.game?.getState?.()?.character || {};
      const achievementState = EbiAR.Achievement?.exportState?.();
      const visited = achievementState?.metrics?.spots || character.visitedSpots || [];
      const questDone = (EbiAR.Quest?.getCompleted?.().length || 0) + (EbiAR.Quest?.getClaimed?.().length || 0);
      const achievementDone = EbiAR.Achievement?.getUnlocked?.().length || 0;
      const catalog = EbiAR.character?.collectionStats?.(character) || { acquired: 0, completionRate: 0 };
      return {
        playTimeMs: this.#currentPlayTime(),
        visitedSpots: new Set(visited).size,
        acquiredCharacters: catalog.acquired || 0,
        questRate: this.#rate(questDone, QUEST_TOTAL),
        achievementRate: this.#rate(achievementDone, ACHIEVEMENT_TOTAL),
        catalogRate: this.#percent(catalog.completionRate),
        points: Math.max(0, Number(character.points) || 0),
        level: Math.max(1, Number(character.level) || 1)
      };
    }

    /**
     * 各システムとゲーム全体のコンプリート率を算出する。
     * @returns {object}
     */
    calculateCompletion() {
      const statistics = this.calculateStatistics();
      const spotTotal = EbiAR.spots?.list?.().length || 0;
      const spots = this.#rate(statistics.visitedSpots, spotTotal);
      const overall = this.#percent(
        (statistics.questRate + statistics.achievementRate + statistics.catalogRate + spots) / 4
      );
      return {
        overall,
        quest: statistics.questRate,
        achievement: statistics.achievementRate,
        catalog: statistics.catalogRate,
        spots
      };
    }

    /** @returns {object} 統合Save向けEnding状態 */
    exportState() {
      return {
        version: 1,
        cleared: this.cleared,
        completionRate: this.cleared ? this.completionRate : this.calculateCompletion().overall,
        playTimeMs: this.#currentPlayTime(),
        clearedAt: this.clearedAt,
        updatedAt: new Date().toISOString()
      };
    }

    /** @param {object} saved Ending状態を復元する */
    restoreState(saved) {
      if (!saved || saved.version !== 1) return false;
      this.cleared = saved.cleared === true;
      this.completionRate = this.#percent(saved.completionRate);
      this.playTimeMs = Math.max(0, Number(saved.playTimeMs) || 0);
      this.clearedAt = typeof saved.clearedAt === 'string' ? saved.clearedAt : null;
      this.sessionStartedAt = Date.now();
      if (this.initialized) this.#updateTitle();
      return true;
    }

    /** @returns {object} Ending状態 */
    getState() {
      return clone({
        cleared: this.cleared,
        completionRate: this.cleared ? this.completionRate : this.calculateCompletion().overall,
        playTimeMs: this.#currentPlayTime(),
        clearedAt: this.clearedAt,
        version: VERSION,
        build: BUILD_NUMBER,
        saveVersion: EbiAR.config?.storage?.schemaVersion || 1
      });
    }

    /** @returns {object} Ending状態を保存する */
    save() {
      const state = this.exportState();
      try { global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch (error) { console.error('[EbiAR Ending] save failed', error); }
      return state;
    }

    /** @param {object} [source] Ending状態を読み込む */
    load(source) {
      let saved = source;
      if (!saved) {
        try { saved = JSON.parse(global.localStorage?.getItem(STORAGE_KEY) || 'null'); }
        catch (error) { console.error('[EbiAR Ending] load failed', error); }
      }
      if (saved) this.restoreState(saved);
      return this.getState();
    }

    #bindEvents() {
      EbiAR.events.on('story:complete', (detail) => {
        if (detail?.story?.id !== 'chapter4-ending') return;
        if (this.initialized) this.startEnding();
        else this.pendingStart = true;
      });
      EbiAR.events.on('save:loaded', (data) => {
        if (this.initialized) this.restoreState(data?.ending);
        else this.pendingSave = data?.ending || null;
      });
      EbiAR.events.on('save:reset', () => {
        this.cleared = false;
        this.completionRate = 0;
        this.playTimeMs = 0;
        this.clearedAt = null;
        this.sessionStartedAt = Date.now();
        if (this.root) this.root.hidden = true;
        try { global.localStorage?.removeItem(STORAGE_KEY); } catch { /* Save Engine側で通知済み */ }
        this.#updateTitle();
      });
    }

    #ensureRoot() {
      if (this.root || !global.document?.body) return this.root;
      const root = global.document.createElement('section');
      root.id = 'ending-overlay';
      root.className = 'ending-overlay';
      root.hidden = true;
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-labelledby', 'ending-heading');
      root.innerHTML = '<div class="ending-panel"><span id="ending-kicker"></span><h2 id="ending-heading"></h2><div id="ending-content"></div><div class="ending-actions"><button type="button" data-ending-action="back" class="ending-secondary"></button><button type="button" data-ending-action="next"></button></div><small class="ending-build"></small></div>';
      root.addEventListener('click', (event) => {
        const action = event.target.closest('[data-ending-action]')?.dataset.endingAction;
        if (action === 'back') {
          if (this.view === 'credits') this.finish();
          else if (this.view === 'statistics') this.playCredits();
          else this.showStatistics();
        }
        if (action === 'next') {
          if (this.view === 'credits') this.showStatistics();
          else if (this.view === 'statistics') this.showCompletion();
          else this.finish();
        }
      });
      root.querySelector('.ending-build').textContent = `Version ${VERSION} / Build ${BUILD_NUMBER} / Save ${EbiAR.config?.storage?.schemaVersion || 1}`;
      global.document.body.append(root);
      this.root = root;
      this.#installStyles();
      return root;
    }

    #setHeading(heading, kicker) {
      this.root.querySelector('#ending-heading').textContent = heading;
      this.root.querySelector('#ending-kicker').textContent = kicker;
    }

    #setActions(back, next) {
      this.root.querySelector('[data-ending-action="back"]').textContent = back;
      this.root.querySelector('[data-ending-action="next"]').textContent = next;
    }

    #updateTitle() {
      if (!global.document) return;
      const title = global.document.querySelector('#screen-title');
      if (!title) return;
      let status = title.querySelector('#ending-title-status');
      if (!status) {
        status = global.document.createElement('div');
        status.id = 'ending-title-status';
        status.className = 'ending-title-status';
        title.insertBefore(status, title.querySelector('[data-action="start"]'));
      }
      const completion = this.cleared ? this.completionRate : this.calculateCompletion().overall;
      status.innerHTML = `${this.cleared ? '<strong>CLEAR</strong>' : ''}<span>Complete ${completion}%</span><small>Version ${VERSION} · Build ${BUILD_NUMBER} · Save ${EbiAR.config?.storage?.schemaVersion || 1}</small>`;
    }

    #installStyles() {
      if (!global.document || global.document.getElementById('ebiar-ending-styles')) return;
      const style = global.document.createElement('style');
      style.id = 'ebiar-ending-styles';
      style.textContent = `
        .ending-overlay{position:fixed;z-index:13000;inset:0;overflow:auto;padding:max(20px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:radial-gradient(circle at 50% 10%,#8d5c21,#21140c 60%);color:#fff;font-family:system-ui,-apple-system,"Noto Sans JP",sans-serif}.ending-overlay[hidden]{display:none}
        .ending-panel{width:min(100%,680px);min-height:calc(100svh - 40px);margin:auto;display:flex;flex-direction:column;justify-content:center;text-align:center}.ending-panel h2{margin:.25rem 0 1.5rem;font-size:clamp(2rem,10vw,4rem);color:#ffd166}.ending-panel>span{font-size:.8rem;font-weight:800;letter-spacing:.15em;text-transform:uppercase}
        .ending-credits{display:grid;gap:8px;padding:12px 0 28px}.ending-credits p{margin:20px 0 0;color:#f2c57c;font-size:.8rem;letter-spacing:.1em}.ending-credits strong{font-size:1.25rem}
        .ending-statistics{display:grid;gap:8px;margin:0 0 24px}.ending-statistics div{display:flex;justify-content:space-between;gap:16px;padding:12px 14px;border-radius:12px;background:#ffffff12}.ending-statistics dt{text-align:left}.ending-statistics dd{margin:0;font-weight:800;color:#ffd166}
        .ending-completion{display:grid;gap:18px;margin-bottom:28px}.ending-completion>div{display:grid;grid-template-columns:1fr auto;gap:6px;text-align:left}.ending-completion strong{color:#ffd166}.ending-meter{grid-column:1/-1;height:10px;overflow:hidden;border-radius:5px;background:#ffffff22}.ending-meter i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#e85d24,#ffd166)}
        .ending-actions{display:grid;grid-template-columns:1fr 2fr;gap:10px}.ending-actions button{min-height:52px;border:0;border-radius:13px;background:#e85d24;color:#fff;font:inherit;font-weight:800;touch-action:manipulation}.ending-actions .ending-secondary{border:1px solid #ffffff66;background:transparent}.ending-actions button:focus-visible{outline:3px solid #ffd166;outline-offset:2px}.ending-build{display:block;margin-top:18px;color:#ffffff99}
        .ending-title-status{display:grid;gap:3px;margin:6px 0 14px;padding:10px 16px;border:1px solid #e7c36c;border-radius:12px;background:#fff8e6}.ending-title-status strong{color:#b7791f;font-size:1.3rem;letter-spacing:.16em}.ending-title-status span{font-weight:800}.ending-title-status small{font-size:.68rem;color:#75634b}
        @media(min-width:700px){.ending-panel{min-height:700px}.ending-statistics{grid-template-columns:1fr 1fr}}@media(prefers-reduced-motion:reduce){.ending-overlay *{animation:none!important;transition:none!important}}
      `;
      global.document.head.append(style);
    }

    #rate(value, total) {
      if (!total) return 0;
      return this.#percent(Number(value) / Number(total) * 100);
    }

    #percent(value) {
      return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    }

    #currentPlayTime() {
      return this.playTimeMs + (this.initialized ? Math.max(0, Date.now() - this.sessionStartedAt) : 0);
    }

    #formatDuration(milliseconds) {
      const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor(seconds % 3600 / 60);
      const remaining = seconds % 60;
      return hours ? `${hours}時間 ${minutes}分` : `${minutes}分 ${remaining}秒`;
    }
  }

  const manager = new EndingManager();
  EbiAR.EndingManager = EndingManager;
  EbiAR.Ending = Object.freeze({
    initialize: manager.initialize.bind(manager),
    startEnding: manager.startEnding.bind(manager),
    playCredits: manager.playCredits.bind(manager),
    showStatistics: manager.showStatistics.bind(manager),
    showCompletion: manager.showCompletion.bind(manager),
    finish: manager.finish.bind(manager),
    calculateStatistics: manager.calculateStatistics.bind(manager),
    calculateCompletion: manager.calculateCompletion.bind(manager),
    exportState: manager.exportState.bind(manager),
    restoreState: manager.restoreState.bind(manager),
    save: manager.save.bind(manager),
    load: manager.load.bind(manager),
    getState: manager.getState.bind(manager)
  });
})(typeof window !== 'undefined' ? window : globalThis);
