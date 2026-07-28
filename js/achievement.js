/**
 * Project EBI - Achievement Engine
 * @version 1.0.0
 * @license Proprietary
 */
(function achievementModule(global) {
  'use strict';

  const EbiAR = global.EbiAR = global.EbiAR || {};
  if (!EbiAR.events) throw new Error('config.js must be loaded before achievement.js.');

  const STATUS = Object.freeze({
    LOCKED: 'locked',
    UNLOCKED: 'unlocked',
    CLAIMED: 'claimed'
  });

  const CONDITION = Object.freeze({
    GAME_START: 'game_start',
    SPOT_COUNT: 'spot_count',
    CHARACTER_COUNT: 'character_count',
    RARE_CHARACTER: 'rare_character',
    COLLECTION: 'collection',
    LEVEL: 'level',
    POINTS: 'points',
    QUEST_COUNT: 'quest_count'
  });

  const STORAGE_KEY = 'ebiar.achievement.v1';

  const INITIAL_ACHIEVEMENTS = Object.freeze([
    {
      id: 'first-adventure',
      title: 'はじめての冒険',
      description: 'ゲームを始める',
      condition: { type: CONDITION.GAME_START, target: 1 },
      rewards: { points: 100, experience: 50, coins: 10, title: '日野町の旅人' }
    },
    {
      id: 'find-ebimaru',
      title: 'エビ丸発見',
      description: 'レアキャラクター「エビ丸」を見つける',
      condition: { type: CONDITION.RARE_CHARACTER, value: 'ebi-maru', target: 1 },
      rewards: { points: 300, experience: 150, coins: 30, title: 'エビ丸の友' }
    },
    {
      id: 'collection-five',
      title: '図鑑5種類',
      description: '図鑑に5種類登録する',
      condition: { type: CONDITION.COLLECTION, target: 5 },
      rewards: { points: 500, experience: 250, coins: 50, coupon: 'achievement-collection-5' }
    },
    {
      id: 'visit-five-spots',
      title: 'スポット5か所',
      description: '異なるスポットを5か所訪問する',
      condition: { type: CONDITION.SPOT_COUNT, target: 5 },
      rewards: { points: 500, experience: 250, coins: 50, title: '日野町探検家' }
    },
    {
      id: 'reach-level-five',
      title: 'レベル5',
      description: 'プレイヤーレベル5に到達する',
      condition: { type: CONDITION.LEVEL, target: 5 },
      rewards: { points: 700, experience: 350, coins: 70, title: '熟練の冒険者' }
    },
    {
      id: 'earn-thousand-points',
      title: '1000ポイント達成',
      description: '累計1000ポイントに到達する',
      condition: { type: CONDITION.POINTS, target: 1000 },
      rewards: { experience: 500, coins: 100, coupon: 'achievement-1000-points' }
    },
    {
      id: 'complete-five-quests',
      title: 'クエスト5件達成',
      description: '異なるクエストを5件達成する',
      condition: { type: CONDITION.QUEST_COUNT, target: 5 },
      rewards: { points: 1000, experience: 500, coins: 100, title: '日野町の英雄' }
    }
  ]);

  const clone = (value) => JSON.parse(JSON.stringify(value));

  /**
   * 実績の進行、解除、報酬、永続化、表示を管理します。
   */
  class AchievementManager {
    /**
     * @param {object} [options]
     * @param {Storage|null} [options.storage]
     * @param {string} [options.storageKey]
     * @param {object} [options.saveAdapter] load/saveを持つSave Engine接続
     * @param {(condition: object) => number} [options.stateProvider]
     * @param {object} [options.rewardAdapter]
     * @param {Array<object>} [options.achievements]
     */
    constructor(options = {}) {
      this.storage = options.storage === undefined ? this.#getStorage() : options.storage;
      this.storageKey = options.storageKey || STORAGE_KEY;
      this.saveAdapter = options.saveAdapter || null;
      this.stateProvider = options.stateProvider || null;
      this.rewardAdapter = options.rewardAdapter || {};
      this.achievements = new Map();
      this.state = {};
      this.metrics = {
        spots: new Set(),
        characters: new Set(),
        quests: new Set(),
        collection: 0,
        level: 0,
        points: 0,
        gameStarted: false
      };
      this.listeners = new Set();
      this.root = null;
      this.completionTimer = null;

      (options.achievements || INITIAL_ACHIEVEMENTS).forEach(
        (achievement) => this.#register(achievement)
      );
      this.#load();
      this.#bindGameEvents();
      this.refresh();
    }

    /**
     * 実績を解除します。解除済みの場合は状態を変更しません。
     * @param {string} id
     * @returns {object|null}
     */
    unlock(id) {
      const achievement = this.achievements.get(id);
      const state = this.state[id];
      if (!achievement || !state || state.status !== STATUS.LOCKED) return null;

      state.status = STATUS.UNLOCKED;
      state.progress = achievement.condition.target;
      state.unlockedAt = new Date().toISOString();
      this.#saveAndEmit('unlock', id);
      this.#showCompletion(achievement);
      return this.#view(achievement);
    }

    /**
     * 解除済み実績の報酬を一度だけ受け取ります。
     * @param {string} id
     * @returns {object|null}
     */
    claim(id) {
      const achievement = this.achievements.get(id);
      const state = this.state[id];
      if (!achievement || !state || state.status !== STATUS.UNLOCKED) return null;

      try {
        this.#grantRewards(achievement.rewards);
      } catch (error) {
        this.#dispatch('error', { id, phase: 'claim', error });
        return null;
      }

      state.status = STATUS.CLAIMED;
      state.claimedAt = new Date().toISOString();
      this.#saveAndEmit('claim', id);
      return this.#view(achievement);
    }

    /**
     * @param {string} id
     * @returns {boolean}
     */
    isUnlocked(id) {
      return [STATUS.UNLOCKED, STATUS.CLAIMED].includes(this.state[id]?.status);
    }

    /**
     * @returns {Array<object>} 解除済みおよび報酬受取済みの実績
     */
    getUnlocked() {
      return [...this.achievements.values()]
        .filter((achievement) => this.isUnlocked(achievement.id))
        .map((achievement) => this.#view(achievement));
    }

    /**
     * @param {string} id
     * @returns {{current:number,target:number,percent:number,status:string}|null}
     */
    getProgress(id) {
      const achievement = this.achievements.get(id);
      const state = this.state[id];
      if (!achievement || !state) return null;
      const current = Math.min(state.progress, achievement.condition.target);
      return {
        current,
        target: achievement.condition.target,
        percent: Math.round((current / achievement.condition.target) * 100),
        status: state.status
      };
    }

    /**
     * ゲーム内の状態変化を実績へ反映します。
     * @param {string} type CONDITIONの値
     * @param {string|number|object} [value]
     * @returns {Array<object>}
     */
    update(type, value) {
      this.#updateMetrics(type, value);
      const updated = [];

      this.achievements.forEach((achievement) => {
        const state = this.state[achievement.id];
        if (state.status !== STATUS.LOCKED || achievement.condition.type !== type) return;
        const next = this.#metricValue(achievement.condition);
        if (next === null) return;
        const previous = state.progress;
        state.progress = Math.max(state.progress, next);
        if (state.progress >= achievement.condition.target) this.unlock(achievement.id);
        if (state.progress !== previous) updated.push(this.#view(achievement));
      });

      if (updated.length) this.#saveAndEmit('progress', null);
      return updated;
    }

    /**
     * 外部システムとの接続設定を更新します。
     * @param {object} options
     * @returns {AchievementManager}
     */
    configure(options = {}) {
      if (options.saveAdapter) {
        this.saveAdapter = options.saveAdapter;
        try {
          this.#restore(this.saveAdapter.load?.('achievement'));
        } catch {
          // Save Engine側の読込失敗時も現在の進行状態を維持します。
        }
      }
      if (typeof options.stateProvider === 'function') this.stateProvider = options.stateProvider;
      if (options.rewardAdapter) this.rewardAdapter = options.rewardAdapter;
      this.refresh();
      return this;
    }

    /** @returns {object} Save Engine向け状態 */
    exportState() {
      return clone(this.#serialize());
    }

    /** @param {object} saved Save Engineから復元する状態 */
    restoreState(saved) {
      if (!saved) return false;
      this.#restore(saved);
      this.refresh();
      return true;
    }

    /**
     * 外部状態から現在値を取り込みます。
     */
    refresh() {
      if (this.stateProvider) {
        this.achievements.forEach((achievement) => {
          const value = this.stateProvider(clone(achievement.condition));
          if (value !== undefined && value !== null) {
            this.update(achievement.condition.type, value);
          }
        });
      }
      this.#render();
    }

    /**
     * 実績一覧UIを指定要素へ表示します。
     * @param {HTMLElement|string} target
     * @returns {HTMLElement|null}
     */
    mount(target) {
      if (!global.document) return null;
      this.root = typeof target === 'string' ? global.document.querySelector(target) : target;
      if (!this.root) return null;
      this.root.classList.add('ebiar-achievement');
      this.root.addEventListener('click', (event) => {
        const button = event.target.closest('[data-achievement-claim]');
        if (button) this.claim(button.dataset.achievementClaim);
      });
      this.#installStyles();
      this.#render();
      return this.root;
    }

    /**
     * 状態変化を購読します。
     * @param {(event: object) => void} listener
     * @returns {() => void}
     */
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    #register(achievement) {
      if (!achievement?.id || this.achievements.has(achievement.id)) {
        throw new Error('Achievement id must be unique.');
      }
      if (!Object.values(CONDITION).includes(achievement.condition?.type)
          || !Number.isFinite(achievement.condition?.target)
          || achievement.condition.target <= 0) {
        throw new Error(`Invalid achievement condition: ${achievement.id}`);
      }
      this.achievements.set(achievement.id, clone(achievement));
      this.state[achievement.id] = { status: STATUS.LOCKED, progress: 0 };
    }

    #getStorage() {
      try {
        return global.localStorage || null;
      } catch {
        return null;
      }
    }

    #serialize() {
      return {
        version: 1,
        updatedAt: new Date().toISOString(),
        achievements: this.state,
        metrics: {
          spots: [...this.metrics.spots],
          characters: [...this.metrics.characters],
          quests: [...this.metrics.quests],
          spotCount: this.metrics.spotCount || 0,
          characterCount: this.metrics.characterCount || 0,
          questCount: this.metrics.questCount || 0,
          collection: this.metrics.collection,
          level: this.metrics.level,
          points: this.metrics.points,
          gameStarted: this.metrics.gameStarted
        }
      };
    }

    #load() {
      let saved = null;
      try {
        saved = typeof this.saveAdapter?.load === 'function'
          ? this.saveAdapter.load('achievement')
          : JSON.parse(this.storage?.getItem(this.storageKey) || 'null');
      } catch {
        saved = null;
      }
      this.#restore(saved);
    }

    #restore(saved) {
      if (!saved || saved.version !== 1 || !saved.achievements) return;
      Object.keys(this.state).forEach((id) => {
        const entry = saved.achievements[id];
        if (entry && Object.values(STATUS).includes(entry.status)) {
          const target = this.achievements.get(id).condition.target;
          const status = entry.status;
          const restoredProgress = Math.max(0, Math.min(Number(entry.progress) || 0, target));
          this.state[id] = {
            ...this.state[id],
            ...entry,
            progress: status === STATUS.LOCKED ? restoredProgress : target
          };
        }
      });
      const metrics = saved.metrics || {};
      this.metrics.spots = new Set(this.#safeStringArray(metrics.spots));
      this.metrics.characters = new Set(this.#safeStringArray(metrics.characters));
      this.metrics.quests = new Set(this.#safeStringArray(metrics.quests));
      this.metrics.spotCount = this.#safeNumber(metrics.spotCount);
      this.metrics.characterCount = this.#safeNumber(metrics.characterCount);
      this.metrics.questCount = this.#safeNumber(metrics.questCount);
      this.metrics.collection = this.#safeNumber(metrics.collection);
      this.metrics.level = this.#safeNumber(metrics.level);
      this.metrics.points = this.#safeNumber(metrics.points);
      this.metrics.gameStarted = metrics.gameStarted === true;
    }

    #save() {
      const data = this.#serialize();
      try {
        if (typeof this.saveAdapter?.save === 'function') {
          this.saveAdapter.save('achievement', clone(data));
        } else {
          this.storage?.setItem(this.storageKey, JSON.stringify(data));
        }
      } catch (error) {
        this.#dispatch('error', { phase: 'save', error });
      }
    }

    #safeStringArray(value) {
      return Array.isArray(value)
        ? [...new Set(value.filter((item) => typeof item === 'string').slice(0, 10000))]
        : [];
    }

    #safeNumber(value) {
      const number = Number(value);
      return Number.isFinite(number) && number >= 0 ? number : 0;
    }

    #updateMetrics(type, value) {
      const detail = value && typeof value === 'object' ? value : {};
      const identity = detail.id ?? value;
      if (type === CONDITION.GAME_START) {
        const started = typeof value === 'object' ? detail.started ?? detail.count : value;
        this.metrics.gameStarted = this.metrics.gameStarted || started === true || Number(started) >= 1;
      } else if (type === CONDITION.SPOT_COUNT && identity !== undefined) {
        if (typeof identity === 'number') {
          this.metrics.spotCount = Math.max(this.metrics.spotCount || 0, identity);
        } else {
          this.metrics.spots.add(String(identity));
        }
      } else if (type === CONDITION.CHARACTER_COUNT && identity !== undefined) {
        if (typeof identity === 'number') {
          this.metrics.characterCount = Math.max(this.metrics.characterCount || 0, identity);
        } else {
          this.metrics.characters.add(String(identity));
        }
      } else if (type === CONDITION.RARE_CHARACTER && identity !== undefined) {
        this.metrics.characters.add(String(identity));
      } else if (type === CONDITION.QUEST_COUNT && identity !== undefined) {
        if (typeof identity === 'number') {
          this.metrics.questCount = Math.max(this.metrics.questCount || 0, identity);
        } else {
          this.metrics.quests.add(String(identity));
        }
      } else if (type === CONDITION.COLLECTION) {
        this.metrics.collection = Math.max(this.metrics.collection, this.#extractNumber(value, 'count'));
      } else if (type === CONDITION.LEVEL) {
        this.metrics.level = Math.max(this.metrics.level, this.#extractNumber(value, 'level'));
      } else if (type === CONDITION.POINTS) {
        this.metrics.points = Math.max(this.metrics.points, this.#extractNumber(value, 'points'));
      }
    }

    #extractNumber(value, key) {
      const candidate = typeof value === 'object' ? value?.[key] : value;
      return this.#safeNumber(candidate);
    }

    #metricValue(condition) {
      switch (condition.type) {
        case CONDITION.GAME_START:
          return this.metrics.gameStarted ? 1 : 0;
        case CONDITION.SPOT_COUNT:
          return Math.max(this.metrics.spots.size, this.metrics.spotCount || 0);
        case CONDITION.CHARACTER_COUNT:
          return Math.max(this.metrics.characters.size, this.metrics.characterCount || 0);
        case CONDITION.RARE_CHARACTER:
          return [...this.metrics.characters].some(
            (id) => this.#matchesCharacter(condition.value, id)
          ) ? 1 : 0;
        case CONDITION.COLLECTION:
          return this.metrics.collection;
        case CONDITION.LEVEL:
          return this.metrics.level;
        case CONDITION.POINTS:
          return this.metrics.points;
        case CONDITION.QUEST_COUNT:
          return Math.max(this.metrics.quests.size, this.metrics.questCount || 0);
        default:
          return null;
      }
    }

    #matchesCharacter(expected, actual) {
      const aliases = {
        ebimaru: ['ebimaru', 'ebi-maru', 'エビ丸', 'えび丸']
      };
      return aliases[expected]?.includes(String(actual)) || expected === actual;
    }

    #grantRewards(rewards) {
      const adapter = this.rewardAdapter;
      if (rewards.points) this.#grant(adapter.addPoints, 'points', rewards.points);
      if (rewards.experience) this.#grant(adapter.addExperience, 'experience', rewards.experience);
      if (rewards.coins) this.#grant(adapter.addCoins, 'coins', rewards.coins);
      if (rewards.coupon) this.#grant(adapter.addCoupon, 'coupons', rewards.coupon);
      if (rewards.title) this.#grant(adapter.addTitle, 'titles', rewards.title);
    }

    #grant(adapterMethod, fallbackKey, value) {
      if (typeof adapterMethod === 'function') {
        adapterMethod(value);
        return;
      }
      const rewards = EbiAR.playerRewards = EbiAR.playerRewards || {
        points: 0, experience: 0, coins: 0, coupons: [], achievements: [], titles: []
      };
      if (!Object.hasOwn(rewards, fallbackKey)) {
        rewards[fallbackKey] = typeof value === 'number' ? 0 : [];
      }
      if (Array.isArray(rewards[fallbackKey])) {
        if (!rewards[fallbackKey].includes(value)) rewards[fallbackKey].push(value);
      } else {
        rewards[fallbackKey] = Number(rewards[fallbackKey] || 0) + value;
      }
    }

    #bindGameEvents() {
      const events = {
        'game:started': CONDITION.GAME_START,
        'gps:spot-arrived': CONDITION.SPOT_COUNT,
        'character:levelup': CONDITION.LEVEL,
        'game:points-changed': CONDITION.POINTS,
        'quest:complete': CONDITION.QUEST_COUNT
      };
      Object.entries(events).forEach(([name, type]) => {
        EbiAR.events.on(name, (payload) => {
          const detail = payload || {};
          const value = name === 'gps:spot-arrived' ? detail.spot
            : name === 'character:levelup' ? { level: detail.character?.level }
            : name === 'quest:complete' ? detail.quest
            : detail;
          this.update(type, value?.id !== undefined ? value.id : value);
        });
      });
      EbiAR.events.on('character:acquired', (detail) => {
        const character = detail?.character || {};
        this.update(CONDITION.CHARACTER_COUNT, character.id);
        this.update(CONDITION.RARE_CHARACTER, character.id);
        this.update(CONDITION.COLLECTION, {
          count: EbiAR.game?.getState()?.character?.discoveredEbi?.length || 0
        });
      });
      EbiAR.events.on('save:loaded', (data) => this.restoreState(data?.achievement));
      EbiAR.events.on('save:reset', () => {
        this.achievements.forEach((achievement, id) => {
          this.state[id] = { status: STATUS.LOCKED, progress: 0 };
        });
        this.metrics = {
          spots: new Set(),
          characters: new Set(),
          quests: new Set(),
          collection: 0,
          level: 0,
          points: 0,
          gameStarted: false
        };
        try { this.storage?.removeItem(this.storageKey); } catch { /* Save Engine側で通知済み */ }
        this.#render();
      });
    }

    #view(achievement) {
      return Object.freeze({
        ...clone(achievement),
        ...clone(this.state[achievement.id]),
        progressInfo: this.getProgress(achievement.id)
      });
    }

    #saveAndEmit(type, id) {
      this.#save();
      this.#render();
      const detail = {
        type,
        id,
        achievement: id ? this.#view(this.achievements.get(id)) : null
      };
      this.listeners.forEach((listener) => {
        try { listener(detail); } catch { /* 購読側の例外を進行処理へ伝播させません。 */ }
      });
      this.#dispatch(type, detail);
    }

    #dispatch(type, detail) {
      try {
        EbiAR.events.emit(`achievement:${type}`, detail);
      } catch (error) {
        console.error('[EbiAR Achievement event]', type, error);
      }
    }

    #render() {
      if (!this.root) return;
      const unlockedCount = this.getUnlocked().length;
      this.root.innerHTML = `
        <div class="ebiar-achievement__header">
          <h2>実績</h2>
          <span>${unlockedCount} / ${this.achievements.size}</span>
        </div>
        <div class="ebiar-achievement__list">
          ${[...this.achievements.values()].map((item) => this.#itemMarkup(item)).join('')}
        </div>`;
    }

    #itemMarkup(achievement) {
      const state = this.state[achievement.id];
      const progress = this.getProgress(achievement.id);
      const label = {
        [STATUS.LOCKED]: '未解除',
        [STATUS.UNLOCKED]: '解除済み',
        [STATUS.CLAIMED]: '受取済み'
      }[state.status];
      const rewards = [
        achievement.rewards.points && `${achievement.rewards.points}pt`,
        achievement.rewards.experience && `経験値 ${achievement.rewards.experience}`,
        achievement.rewards.coins && `コイン ${achievement.rewards.coins}`,
        achievement.rewards.coupon && '限定クーポン',
        achievement.rewards.title && `称号「${achievement.rewards.title}」`
      ].filter(Boolean).join('・');

      return `
        <article class="ebiar-achievement__item" data-status="${state.status}">
          <div class="ebiar-achievement__row">
            <div>
              <span class="ebiar-achievement__status">${label}</span>
              <h3>${this.#escape(achievement.title)}</h3>
            </div>
            <strong>${progress.percent}%</strong>
          </div>
          <p>${this.#escape(achievement.description)}</p>
          <div class="ebiar-achievement__progress" role="progressbar"
               aria-label="${this.#escape(achievement.title)}"
               aria-valuemin="0" aria-valuemax="${progress.target}"
               aria-valuenow="${progress.current}">
            <span style="width:${progress.percent}%"></span>
          </div>
          <div class="ebiar-achievement__footer">
            <small>${this.#escape(rewards)}</small>
            ${state.status === STATUS.UNLOCKED
              ? `<button type="button" data-achievement-claim="${this.#escape(achievement.id)}">報酬を受け取る</button>`
              : `<span>${progress.current} / ${progress.target}</span>`}
          </div>
        </article>`;
    }

    #showCompletion(achievement) {
      if (!global.document?.body) return;
      global.clearTimeout(this.completionTimer);
      global.document.querySelector('.ebiar-achievement-toast')?.remove();
      const toast = global.document.createElement('div');
      toast.className = 'ebiar-achievement-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML = `<strong>実績解除！</strong><span>${this.#escape(achievement.title)}</span>`;
      global.document.body.append(toast);
      global.requestAnimationFrame?.(() => toast.classList.add('is-visible'));
      this.completionTimer = global.setTimeout(() => toast.remove(), 3500);
    }

    #escape(value) {
      return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[character]);
    }

    #installStyles() {
      if (global.document.getElementById('ebiar-achievement-styles')) return;
      const style = global.document.createElement('style');
      style.id = 'ebiar-achievement-styles';
      style.textContent = `
        .ebiar-achievement{color:#20241f;font-family:system-ui,-apple-system,"Noto Sans JP",sans-serif}
        .ebiar-achievement__header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
        .ebiar-achievement__header h2{font-size:1.25rem;margin:0}.ebiar-achievement__header span{font-size:.8rem;color:#596057}
        .ebiar-achievement__list{display:grid;gap:10px}.ebiar-achievement__item{background:#fff;border:1px solid #d8ddd6;border-radius:8px;padding:14px}
        .ebiar-achievement__item[data-status="unlocked"]{border-color:#b7791f;box-shadow:0 0 0 1px #b7791f}.ebiar-achievement__item[data-status="claimed"]{opacity:.7}
        .ebiar-achievement__row,.ebiar-achievement__footer{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .ebiar-achievement__item h3{font-size:1rem;margin:3px 0 0}.ebiar-achievement__item p{font-size:.875rem;margin:8px 0;color:#4d554b}
        .ebiar-achievement__status{color:#626961;font-size:.75rem;font-weight:700}.ebiar-achievement__item[data-status="unlocked"] .ebiar-achievement__status{color:#986415}
        .ebiar-achievement__progress{height:8px;overflow:hidden;background:#e7eae5;border-radius:4px;margin:12px 0}
        .ebiar-achievement__progress span{display:block;height:100%;background:#34734a;transition:width .35s ease}
        .ebiar-achievement__footer{font-size:.75rem;color:#596057}.ebiar-achievement__footer small{min-width:0}
        .ebiar-achievement__footer button{min-height:44px;border:0;border-radius:6px;padding:0 14px;background:#b7791f;color:#fff;font:inherit;font-weight:700;touch-action:manipulation}
        .ebiar-achievement__footer button:focus-visible{outline:3px solid #34734a;outline-offset:2px}
        .ebiar-achievement-toast{position:fixed;z-index:10000;left:50%;top:max(20px,env(safe-area-inset-top));width:min(calc(100% - 32px),380px);transform:translate(-50%,-20px);opacity:0;display:grid;gap:3px;padding:14px 18px;background:#20241f;color:#fff;border-left:5px solid #f0b429;border-radius:6px;box-shadow:0 8px 24px #0004;transition:.25s ease;pointer-events:none}
        .ebiar-achievement-toast.is-visible{transform:translate(-50%,0);opacity:1}.ebiar-achievement-toast strong{color:#ffd166}
        @media (prefers-reduced-motion:reduce){.ebiar-achievement__progress span,.ebiar-achievement-toast{transition:none}}
      `;
      global.document.head.append(style);
    }
  }

  const manager = new AchievementManager();

  EbiAR.AchievementManager = AchievementManager;
  EbiAR.AchievementStatus = STATUS;
  EbiAR.AchievementCondition = CONDITION;
  EbiAR.Achievement = Object.freeze({
    unlock: manager.unlock.bind(manager),
    claim: manager.claim.bind(manager),
    isUnlocked: manager.isUnlocked.bind(manager),
    getUnlocked: manager.getUnlocked.bind(manager),
    getProgress: manager.getProgress.bind(manager),
    update: manager.update.bind(manager),
    configure: manager.configure.bind(manager),
    refresh: manager.refresh.bind(manager),
    exportState: manager.exportState.bind(manager),
    restoreState: manager.restoreState.bind(manager),
    mount: manager.mount.bind(manager),
    subscribe: manager.subscribe.bind(manager)
  });
})(typeof window !== 'undefined' ? window : globalThis);
