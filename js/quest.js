/**
 * Project EBI - Quest Engine
 * @version 1.0.0
 * @license Proprietary
 */
(function questModule(global) {
  'use strict';

  const EbiAR = global.EbiAR = global.EbiAR || {};
  if (!EbiAR.events) throw new Error('config.js must be loaded before quest.js.');

  const STATUS = Object.freeze({
    NOT_STARTED: 'not_started',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    CLAIMED: 'claimed'
  });

  const CONDITION = Object.freeze({
    GAME_START: 'game_start',
    SPOT_VISIT: 'spot_visit',
    CHARACTER: 'character',
    LEVEL: 'level',
    POINTS: 'points',
    COLLECTION: 'collection'
  });

  const STORAGE_KEY = 'ebiar.quest.v1';

  const INITIAL_QUESTS = Object.freeze([
    {
      id: 'welcome-hino',
      title: 'ようこそ日野町へ',
      description: 'ゲームを始めよう',
      condition: { type: CONDITION.GAME_START, target: 1 },
      rewards: { points: 100, experience: 50, coins: 10 }
    },
    {
      id: 'visit-hamada',
      title: 'はま田へ行こう',
      description: 'はま田スポットを訪問しよう',
      prerequisite: 'welcome-hino',
      condition: { type: CONDITION.SPOT_VISIT, value: 'hamada', target: 1 },
      rewards: { points: 200, experience: 100, coins: 20 }
    },
    {
      id: 'find-ebimaru',
      title: 'エビ丸を見つけよう',
      description: 'エビ丸を取得しよう',
      prerequisite: 'visit-hamada',
      condition: { type: CONDITION.CHARACTER, value: 'ebi-maru', target: 1 },
      rewards: { points: 300, experience: 150, coins: 30 }
    },
    {
      id: 'merchant-town',
      title: '商人の町',
      description: '近江日野商人館を訪問しよう',
      prerequisite: 'find-ebimaru',
      condition: { type: CONDITION.SPOT_VISIT, value: 'omi-hino-merchant-museum', target: 1 },
      rewards: { points: 300, experience: 150, coins: 30 }
    },
    {
      id: 'shrine-tour',
      title: '神社巡り',
      description: '綿向神社を訪問しよう',
      prerequisite: 'merchant-town',
      condition: { type: CONDITION.SPOT_VISIT, value: 'umamioka-watamuki-shrine', target: 1 },
      rewards: {
        points: 400,
        experience: 200,
        coins: 40,
        achievements: ['shrine-pilgrim']
      }
    },
    {
      id: 'collection-five',
      title: '図鑑を5種類集めよう',
      description: '図鑑に5種類登録しよう',
      prerequisite: 'shrine-tour',
      condition: { type: CONDITION.COLLECTION, target: 5 },
      rewards: { points: 500, experience: 250, coins: 50, coupon: 'collection-5' }
    },
    {
      id: 'reach-level-five',
      title: 'レベル5になる',
      description: 'プレイヤーレベルを5にしよう',
      prerequisite: 'collection-five',
      condition: { type: CONDITION.LEVEL, target: 5 },
      rewards: {
        points: 1000,
        experience: 500,
        coins: 100,
        achievements: ['hino-adventurer']
      }
    }
  ]);

  const clone = (value) => JSON.parse(JSON.stringify(value));

  /**
   * クエストの状態、進行、報酬、表示を管理します。
   */
  class QuestManager {
    /**
     * @param {object} [options]
     * @param {Storage|null} [options.storage] 永続化に利用するStorage
     * @param {string} [options.storageKey]
     * @param {(condition: object) => number} [options.stateProvider]
     * @param {object} [options.rewardAdapter]
     * @param {Array<object>} [options.quests]
     */
    constructor(options = {}) {
      this.storage = options.storage === undefined ? this.#getStorage() : options.storage;
      this.storageKey = options.storageKey || STORAGE_KEY;
      this.stateProvider = options.stateProvider || null;
      this.rewardAdapter = options.rewardAdapter || {};
      this.quests = new Map();
      this.state = {};
      this.listeners = new Set();
      this.root = null;
      this.completionTimer = null;

      (options.quests || INITIAL_QUESTS).forEach((quest) => this.#register(quest));
      this.#load();
      this.#bindGameEvents();
    }

    /**
     * クエストを開始します。
     * @param {string} id
     * @returns {object|null}
     */
    start(id) {
      const quest = this.quests.get(id);
      const state = this.state[id];
      if (!quest || !state || state.status !== STATUS.NOT_STARTED) return null;
      if (quest.prerequisite && this.state[quest.prerequisite]?.status !== STATUS.CLAIMED) {
        return null;
      }

      state.status = STATUS.ACTIVE;
      state.startedAt = new Date().toISOString();
      this.#syncProgress(quest, state);
      this.#saveAndEmit('start', id);
      return this.#view(quest);
    }

    /**
     * 進行中のクエストを達成状態にします。
     * @param {string} id
     * @returns {object|null}
     */
    complete(id) {
      const quest = this.quests.get(id);
      const state = this.state[id];
      if (!quest || !state || state.status !== STATUS.ACTIVE) return null;

      state.progress = quest.condition.target;
      state.status = STATUS.COMPLETED;
      state.completedAt = new Date().toISOString();
      this.#saveAndEmit('complete', id);
      this.#showCompletion(quest);
      return this.#view(quest);
    }

    /**
     * 達成済みクエストの報酬を一度だけ受け取ります。
     * @param {string} id
     * @returns {object|null}
     */
    claim(id) {
      const quest = this.quests.get(id);
      const state = this.state[id];
      if (!quest || !state || state.status !== STATUS.COMPLETED) return null;

      try {
        this.#grantRewards(quest.rewards);
      } catch (error) {
        this.#dispatch('error', { id, phase: 'claim', error });
        return null;
      }

      state.status = STATUS.CLAIMED;
      state.claimedAt = new Date().toISOString();
      const next = this.#nextQuest(id);
      if (next) this.start(next.id);
      this.#saveAndEmit('claim', id);
      return this.#view(quest);
    }

    /**
     * @returns {Array<object>} 進行中のクエスト
     */
    getActive() {
      return this.#byStatus(STATUS.ACTIVE);
    }

    /**
     * @returns {Array<object>} 達成済み（報酬受取前）のクエスト
     */
    getCompleted() {
      return this.#byStatus(STATUS.COMPLETED);
    }

    /** @returns {Array<object>} 報酬受取済みのクエスト */
    getClaimed() {
      return this.#byStatus(STATUS.CLAIMED);
    }

    /**
     * @param {string} id
     * @returns {{current:number,target:number,percent:number,status:string}|null}
     */
    getProgress(id) {
      const quest = this.quests.get(id);
      const state = this.state[id];
      if (!quest || !state) return null;
      const current = Math.min(state.progress, quest.condition.target);
      return {
        current,
        target: quest.condition.target,
        percent: Math.round((current / quest.condition.target) * 100),
        status: state.status
      };
    }

    /**
     * ゲーム内の状態変化を通知します。
     * @param {string} type CONDITIONの値
     * @param {string|number|object} [value]
     * @returns {Array<object>} 更新されたクエスト
     */
    update(type, value) {
      const updated = [];
      this.getActive().forEach(({ id }) => {
        const quest = this.quests.get(id);
        if (quest.condition.type !== type) return;

        const state = this.state[id];
        const previous = state.progress;
        if (type === CONDITION.SPOT_VISIT || type === CONDITION.CHARACTER) {
          const identity = typeof value === 'object' ? value?.id : value;
          if (this.#matches(quest.condition.value, identity)) state.progress = 1;
        } else if (type === CONDITION.GAME_START) {
          const started = typeof value === 'object' ? value?.started ?? value?.count : value;
          if (started === true || Number(started) >= 1) state.progress = 1;
        } else {
          const numeric = typeof value === 'object'
            ? value?.count ?? value?.level ?? value?.points
            : value;
          if (Number.isFinite(Number(numeric))) {
            state.progress = Math.max(state.progress, Number(numeric));
          }
        }

        if (state.progress >= quest.condition.target) this.complete(id);
        if (state.progress !== previous) updated.push(this.#view(quest));
      });
      if (updated.length) this.#saveAndEmit('progress', null);
      return updated;
    }

    /**
     * クエスト一覧UIを指定要素へ表示します。
     * @param {HTMLElement|string} target
     * @returns {HTMLElement|null}
     */
    mount(target) {
      if (!global.document) return null;
      this.root = typeof target === 'string' ? global.document.querySelector(target) : target;
      if (!this.root) return null;
      this.root.classList.add('ebiar-quest');
      this.root.addEventListener('click', (event) => {
        const button = event.target.closest('[data-quest-claim]');
        if (button) this.claim(button.dataset.questClaim);
      });
      this.#installStyles();
      this.#render();
      return this.root;
    }

    /**
     * 変更通知を購読します。
     * @param {(event: object) => void} listener
     * @returns {() => void}
     */
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    /**
     * 外部システムとの接続設定を更新します。
     * @param {object} options
     * @returns {QuestManager}
     */
    configure(options = {}) {
      if (typeof options.stateProvider === 'function') this.stateProvider = options.stateProvider;
      if (options.rewardAdapter) this.rewardAdapter = options.rewardAdapter;
      this.refresh();
      return this;
    }

    /** @returns {object} Save Engine向け状態 */
    exportState() {
      return {
        version: 1,
        updatedAt: new Date().toISOString(),
        quests: clone(this.state)
      };
    }

    /** @param {object} saved Save Engineから復元する状態 */
    restoreState(saved) {
      if (!saved || saved.version !== 1 || !saved.quests) return false;
      Object.keys(this.state).forEach((id) => {
        const entry = saved.quests[id];
        if (entry && Object.values(STATUS).includes(entry.status)) {
          const target = this.quests.get(id).condition.target;
          this.state[id] = {
            ...this.state[id],
            ...entry,
            progress: Math.max(0, Math.min(Number(entry.progress) || 0, target))
          };
        }
      });
      this.#render();
      return true;
    }

    /**
     * 外部状態から進行値を再取得します。
     */
    refresh() {
      if (this.stateProvider) {
        this.getActive().forEach(({ id }) => {
          const quest = this.quests.get(id);
          this.update(quest.condition.type, this.stateProvider(clone(quest.condition)));
        });
      }
      this.#render();
    }

    #register(quest) {
      if (!quest?.id || this.quests.has(quest.id)) {
        throw new Error('Quest id must be unique.');
      }
      if (!Object.values(CONDITION).includes(quest.condition?.type)
          || !Number.isFinite(quest.condition?.target)
          || quest.condition.target <= 0) {
        throw new Error(`Invalid condition: ${quest.id}`);
      }
      this.quests.set(quest.id, clone(quest));
      this.state[quest.id] = { status: STATUS.NOT_STARTED, progress: 0 };
    }

    #getStorage() {
      try {
        return global.localStorage || null;
      } catch {
        return null;
      }
    }

    #load() {
      if (!this.storage) return;
      try {
        const saved = JSON.parse(this.storage.getItem(this.storageKey));
        if (saved?.version !== 1 || !saved.quests) return;
        Object.keys(this.state).forEach((id) => {
          const entry = saved.quests[id];
          if (entry && Object.values(STATUS).includes(entry.status)) {
            this.state[id] = { ...this.state[id], ...entry };
          }
        });
      } catch {
        // 壊れた保存データは初期状態として扱い、ゲーム開始を妨げません。
      }
    }

    #save() {
      if (!this.storage) return;
      try {
        this.storage.setItem(this.storageKey, JSON.stringify({
          version: 1,
          updatedAt: new Date().toISOString(),
          quests: this.state
        }));
      } catch (error) {
        this.#dispatch('error', { phase: 'save', error });
      }
    }

    #syncProgress(quest, state) {
      if (!this.stateProvider) return;
      const value = Number(this.stateProvider(clone(quest.condition)));
      if (Number.isFinite(value)) state.progress = Math.max(state.progress, value);
      if (state.progress >= quest.condition.target) {
        global.queueMicrotask(() => this.complete(quest.id));
      }
    }

    #matches(expected, actual) {
      const aliases = {
        hamada: ['hamada', 'はま田', 'ハマダ'],
        ebimaru: ['ebimaru', 'ebi-maru', 'エビ丸', 'えび丸'],
        'merchant-museum': ['merchant-museum', 'omi-hino-merchant-museum', '近江日野商人館', '商人館'],
        'watamuki-shrine': ['watamuki-shrine', 'umamioka-watamuki-shrine', '綿向神社']
      };
      return aliases[expected]?.includes(String(actual)) || expected === actual;
    }

    #grantRewards(rewards) {
      const adapter = this.rewardAdapter;
      if (rewards.points) this.#grant(adapter.addPoints, 'points', rewards.points);
      if (rewards.experience) this.#grant(adapter.addExperience, 'experience', rewards.experience);
      if (rewards.coins) this.#grant(adapter.addCoins, 'coins', rewards.coins);
      if (rewards.coupon) this.#grant(adapter.addCoupon, 'coupons', rewards.coupon);
      (rewards.achievements || []).forEach((id) => {
        this.#grant(adapter.unlockAchievement, 'achievements', id);
      });
    }

    #grant(adapterMethod, fallbackKey, value) {
      if (typeof adapterMethod === 'function') {
        adapterMethod(value);
        return;
      }
      if (fallbackKey === 'achievements' && typeof EbiAR.Achievement?.unlock === 'function') {
        EbiAR.Achievement.unlock(value);
        return;
      }
      const rewards = EbiAR.playerRewards = EbiAR.playerRewards || {
        points: 0, experience: 0, coins: 0, coupons: [], achievements: []
      };
      if (Array.isArray(rewards[fallbackKey])) {
        if (!rewards[fallbackKey].includes(value)) rewards[fallbackKey].push(value);
      } else {
        rewards[fallbackKey] = Number(rewards[fallbackKey] || 0) + value;
      }
    }

    #nextQuest(id) {
      return [...this.quests.values()].find((quest) => quest.prerequisite === id) || null;
    }

    #byStatus(status) {
      return [...this.quests.values()]
        .filter((quest) => this.state[quest.id].status === status)
        .map((quest) => this.#view(quest));
    }

    #view(quest) {
      return Object.freeze({
        ...clone(quest),
        ...clone(this.state[quest.id]),
        progressInfo: this.getProgress(quest.id)
      });
    }

    #saveAndEmit(type, id) {
      this.#save();
      this.#render();
      const detail = { type, id, quest: id ? this.#view(this.quests.get(id)) : null };
      this.listeners.forEach((listener) => {
        try { listener(detail); } catch { /* 購読側の例外を進行処理へ伝播させません。 */ }
      });
      this.#dispatch(type, detail);
    }

    #dispatch(type, detail) {
      try {
        EbiAR.events.emit(`quest:${type}`, detail);
      } catch (error) {
        console.error('[EbiAR Quest event]', type, error);
      }
    }

    #bindGameEvents() {
      EbiAR.events.on('game:started', () => this.update(CONDITION.GAME_START, 1));
      EbiAR.events.on('gps:spot-arrived', (detail) => this.update(CONDITION.SPOT_VISIT, detail?.spot));
      EbiAR.events.on('character:acquired', (detail) => {
        this.update(CONDITION.CHARACTER, detail?.character);
        this.update(CONDITION.COLLECTION, { count: detail?.character?.isAcquired
          ? EbiAR.game?.getState()?.character?.discoveredEbi?.length
          : 0 });
      });
      EbiAR.events.on('character:levelup', (detail) => this.update(CONDITION.LEVEL, { level: detail?.character?.level }));
      EbiAR.events.on('game:points-changed', (detail) => this.update(CONDITION.POINTS, detail));
      EbiAR.events.on('save:loaded', (data) => this.restoreState(data?.quest));
      EbiAR.events.on('save:reset', () => {
        this.quests.forEach((quest, id) => {
          this.state[id] = { status: STATUS.NOT_STARTED, progress: 0 };
        });
        try { this.storage?.removeItem(this.storageKey); } catch { /* Save Engine側で通知済み */ }
        this.start('welcome-hino');
        this.#render();
      });
    }

    #render() {
      if (!this.root) return;
      const visible = [...this.quests.values()].filter(
        (quest) => this.state[quest.id].status !== STATUS.NOT_STARTED
      );
      this.root.innerHTML = `
        <div class="ebiar-quest__header">
          <h2>クエスト</h2>
          <span>${this.getCompleted().length}件の報酬</span>
        </div>
        <div class="ebiar-quest__list">
          ${visible.length ? visible.map((quest) => this.#questMarkup(quest)).join('') :
            '<p class="ebiar-quest__empty">進行中のクエストはありません</p>'}
        </div>`;
    }

    #questMarkup(quest) {
      const state = this.state[quest.id];
      const progress = this.getProgress(quest.id);
      const label = {
        [STATUS.ACTIVE]: '進行中',
        [STATUS.COMPLETED]: '達成',
        [STATUS.CLAIMED]: '受取済み'
      }[state.status];
      const rewards = [
        quest.rewards.points && `${quest.rewards.points}pt`,
        quest.rewards.experience && `経験値 ${quest.rewards.experience}`,
        quest.rewards.coins && `コイン ${quest.rewards.coins}`,
        quest.rewards.coupon && 'クーポン',
        quest.rewards.achievements?.length && '実績'
      ].filter(Boolean).join('・');

      return `
        <article class="ebiar-quest__item" data-status="${state.status}">
          <div class="ebiar-quest__row">
            <div>
              <span class="ebiar-quest__status">${label}</span>
              <h3>${this.#escape(quest.title)}</h3>
            </div>
            <strong>${progress.percent}%</strong>
          </div>
          <p>${this.#escape(quest.description)}</p>
          <div class="ebiar-quest__progress" role="progressbar"
               aria-label="${this.#escape(quest.title)}"
               aria-valuemin="0" aria-valuemax="${progress.target}"
               aria-valuenow="${progress.current}">
            <span style="width:${progress.percent}%"></span>
          </div>
          <div class="ebiar-quest__footer">
            <small>${this.#escape(rewards)}</small>
            ${state.status === STATUS.COMPLETED
              ? `<button type="button" data-quest-claim="${this.#escape(quest.id)}">報酬を受け取る</button>`
              : `<span>${progress.current} / ${progress.target}</span>`}
          </div>
        </article>`;
    }

    #showCompletion(quest) {
      if (!global.document?.body) return;
      global.clearTimeout(this.completionTimer);
      global.document.querySelector('.ebiar-quest-toast')?.remove();
      const toast = global.document.createElement('div');
      toast.className = 'ebiar-quest-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML = `<strong>クエスト達成！</strong><span>${this.#escape(quest.title)}</span>`;
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
      if (global.document.getElementById('ebiar-quest-styles')) return;
      const style = global.document.createElement('style');
      style.id = 'ebiar-quest-styles';
      style.textContent = `
        .ebiar-quest{color:#20241f;font-family:system-ui,-apple-system,"Noto Sans JP",sans-serif}
        .ebiar-quest__header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
        .ebiar-quest__header h2{font-size:1.25rem;margin:0}.ebiar-quest__header span{font-size:.8rem;color:#596057}
        .ebiar-quest__list{display:grid;gap:10px}.ebiar-quest__item{background:#fff;border:1px solid #d8ddd6;border-radius:8px;padding:14px}
        .ebiar-quest__item[data-status="completed"]{border-color:#d1492e;box-shadow:0 0 0 1px #d1492e}
        .ebiar-quest__item[data-status="claimed"]{opacity:.68}.ebiar-quest__row,.ebiar-quest__footer{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .ebiar-quest__item h3{font-size:1rem;margin:3px 0 0}.ebiar-quest__item p{font-size:.875rem;margin:8px 0;color:#4d554b}
        .ebiar-quest__status{color:#34734a;font-size:.75rem;font-weight:700}.ebiar-quest__item[data-status="completed"] .ebiar-quest__status{color:#b83520}
        .ebiar-quest__progress{height:8px;overflow:hidden;background:#e7eae5;border-radius:4px;margin:12px 0}
        .ebiar-quest__progress span{display:block;height:100%;background:#34734a;transition:width .35s ease}
        .ebiar-quest__footer{font-size:.75rem;color:#596057}.ebiar-quest__footer small{min-width:0}
        .ebiar-quest__footer button{min-height:44px;border:0;border-radius:6px;padding:0 14px;background:#d1492e;color:#fff;font:inherit;font-weight:700;touch-action:manipulation}
        .ebiar-quest__footer button:focus-visible{outline:3px solid #f0b429;outline-offset:2px}.ebiar-quest__empty{text-align:center;color:#687067;padding:24px 8px}
        .ebiar-quest-toast{position:fixed;z-index:10000;left:50%;top:max(20px,env(safe-area-inset-top));width:min(calc(100% - 32px),380px);transform:translate(-50%,-20px);opacity:0;display:grid;gap:3px;padding:14px 18px;background:#20241f;color:#fff;border-left:5px solid #f0b429;border-radius:6px;box-shadow:0 8px 24px #0004;transition:.25s ease;pointer-events:none}
        .ebiar-quest-toast.is-visible{transform:translate(-50%,0);opacity:1}.ebiar-quest-toast strong{color:#ffd166}
        @media (prefers-reduced-motion:reduce){.ebiar-quest__progress span,.ebiar-quest-toast{transition:none}}
      `;
      global.document.head.append(style);
    }
  }

  const manager = new QuestManager();

  // 公開APIは既存名前空間を保ち、必要な操作だけを束縛して公開します。
  EbiAR.QuestManager = QuestManager;
  EbiAR.QuestStatus = STATUS;
  EbiAR.QuestCondition = CONDITION;
  EbiAR.Quest = Object.freeze({
    start: manager.start.bind(manager),
    complete: manager.complete.bind(manager),
    claim: manager.claim.bind(manager),
    getActive: manager.getActive.bind(manager),
    getCompleted: manager.getCompleted.bind(manager),
    getClaimed: manager.getClaimed.bind(manager),
    getProgress: manager.getProgress.bind(manager),
    update: manager.update.bind(manager),
    mount: manager.mount.bind(manager),
    subscribe: manager.subscribe.bind(manager),
    configure: manager.configure.bind(manager),
    refresh: manager.refresh.bind(manager),
    exportState: manager.exportState.bind(manager),
    restoreState: manager.restoreState.bind(manager)
  });

  // 最初のクエストを開始。ゲーム開始イベントで達成します。
  if (!manager.getActive().length && !manager.getCompleted().length) {
    manager.start('welcome-hino');
  }
})(typeof window !== 'undefined' ? window : globalThis);
