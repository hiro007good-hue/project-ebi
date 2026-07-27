/**
 * Project EBI - Story & Event Engine
 * @version 1.0.0
 * @license Proprietary
 */
(function storyModule(global) {
  'use strict';

  const EbiAR = global.EbiAR;
  if (!EbiAR?.events) throw new Error('config.js must be loaded before story.js.');

  const STORAGE_KEY = 'ebiar.story.v1';
  const VERSION = 1;
  const HISTORY_SPOTS = Object.freeze({
    'gamo-ujisato-statue': 'history.gamo',
    'omi-hino-merchant-museum': 'history.merchant',
    'umamioka-watamuki-shrine': 'history.shrine',
    'shingakuin-temple': 'history.temple'
  });

  const SCENES = Object.freeze({
    'opening-welcome': { id: 'opening-welcome', chapter: 0, character: 'エビ丸', text: 'ようこそ海老フライ王国へ！' },
    'opening-ebimaru': { id: 'opening-ebimaru', chapter: 0, character: 'エビ丸', text: 'ぼくはエビ丸。この王国の案内役だよ！' },
    'opening-gps': { id: 'opening-gps', chapter: 0, character: 'エビ丸', text: 'GPSを使って日野町を巡り、冒険を始めよう。' },
    'first-arrival': { id: 'first-arrival', chapter: 1, character: 'エビ丸', text: '最初のスポットに到着！ 日野町には物語がたくさん隠れているよ。' },
    'first-points': { id: 'first-points', chapter: 1, character: 'エビ丸', text: '冒険やクエストでポイントが増えるよ。集めたポイントは実績にもつながるんだ。' },
    'first-catalog': { id: 'first-catalog', chapter: 1, character: 'エビ丸', text: 'ARで仲間を見つけると図鑑に登録されるよ。目指せ、図鑑完成！' },
    'history-intro': { id: 'history-intro', chapter: 2, character: 'エビ丸', text: 'ここからは歴史探検！ 日野町の武将、商人、神社、寺院を巡ろう。' },
    'history-gamo': { id: 'history-gamo', chapter: 2, character: 'エビ丸', text: '蒲生氏郷公は日野に生まれ、戦国の世で活躍した武将なんだ。' },
    'history-merchant': { id: 'history-merchant', chapter: 2, character: 'エビ丸', text: '近江日野商人は、遠い土地まで商いに出て信用を築いたんだって。' },
    'history-shrine': { id: 'history-shrine', chapter: 2, character: 'エビ丸', text: '馬見岡綿向神社は、日野の歴史と祭りを今に伝える大切な場所だよ。' },
    'history-temple': { id: 'history-temple', chapter: 2, character: 'エビ丸', text: '信楽院は蒲生氏郷公ゆかりの寺院。静かに歴史へ耳を傾けよう。' },
    'golden-legend': { id: 'golden-legend', chapter: 3, character: 'エビ丸', text: '伝説の黄金えびが目覚めたみたい！ ARで手がかりを探そう。' },
    'golden-ar': { id: 'golden-ar', chapter: 3, character: 'エビ丸', text: 'カメラの向こうに黄金の輝きが見えるよ。安全な場所で捕まえよう！' },
    'golden-found': { id: 'golden-found', chapter: 3, character: 'エビ丸', text: '黄金えびを発見！ 王国に伝わる伝説は本当だったんだ！' },
    'ending-congratulations': { id: 'ending-congratulations', chapter: 4, character: 'エビ丸', text: 'すべての冒険をやり遂げたね。海老フライ王国の真の冒険者だ！' },
    'ending-hino': { id: 'ending-hino', chapter: 4, character: 'エビ丸', text: '日野町で見つけた歴史と出会いを、これからも大切にしてね。' },
    'ending-credits': { id: 'ending-credits', chapter: 4, character: 'Project EBI', text: '海老フライ王国AR ～日野町大冒険～\n企画・制作 Project EBI\n遊んでくれてありがとう！' }
  });

  const STORIES = Object.freeze({
    'chapter0-opening': { id: 'chapter0-opening', chapter: 0, title: 'オープニング', scenes: ['opening-welcome', 'opening-ebimaru', 'opening-gps'] },
    'chapter1-first-hino': { id: 'chapter1-first-hino', chapter: 1, title: 'はじめての日野町', scenes: ['first-arrival', 'first-points', 'first-catalog'] },
    'chapter2-history': { id: 'chapter2-history', chapter: 2, title: '歴史探検', scenes: ['history-intro'] },
    'chapter3-golden-ebi': { id: 'chapter3-golden-ebi', chapter: 3, title: '黄金えび伝説', scenes: ['golden-legend'] },
    'chapter4-ending': { id: 'chapter4-ending', chapter: 4, title: 'エンディング', scenes: ['ending-congratulations', 'ending-hino', 'ending-credits'] }
  });

  const clone = (value) => JSON.parse(JSON.stringify(value));

  /**
   * 物語、会話、位置連動イベントを管理する。
   */
  class StoryManager {
    constructor() {
      this.currentChapter = 0;
      this.currentScene = null;
      this.currentStoryId = null;
      this.flags = {};
      this.visitedEvents = [];
      this.completedStories = [];
      this.initialized = false;
      this.bound = false;
      this.queue = [];
      this.root = null;
      this.pendingSave = null;
      this.#bindEvents();
    }

    /**
     * Story Engineを初期化する。
     * @param {object} [saved] 統合セーブ内のStory状態
     * @returns {object}
     */
    initialize(saved) {
      if (saved) this.load(saved);
      else if (this.pendingSave) this.load(this.pendingSave);
      else this.load();
      this.initialized = true;
      this.#ensureDialog();
      if (!this.currentScene && !this.completedStories.includes('chapter0-opening')) {
        this.startStory('chapter0-opening');
      } else if (this.currentScene) {
        this.playScene(this.currentScene);
      }
      return this.getState();
    }

    /**
     * 指定したStoryを開始する。
     * @param {string} id
     * @returns {boolean}
     */
    startStory(id) {
      const story = STORIES[id];
      if (!story || this.completedStories.includes(id)) return false;
      if (!this.initialized) return this.#fail('not_initialized', { id });
      if (this.currentStoryId && this.currentStoryId !== id) {
        this.#enqueue({ type: 'story', id });
        return true;
      }
      this.currentStoryId = id;
      this.currentChapter = story.chapter;
      EbiAR.events.emit('story:start', { story: clone(story), state: this.getState() });
      return this.playScene(story.scenes[0]);
    }

    /**
     * 指定した会話Sceneを再生する。
     * @param {string} id
     * @returns {boolean}
     */
    playScene(id) {
      const scene = SCENES[id];
      if (!scene) return this.#fail('unknown_scene', { id });
      if (!this.initialized) return this.#fail('not_initialized', { id });
      if (this.currentScene && this.currentScene !== id && !this.#isCurrentStoryScene(id)) {
        this.#enqueue({ type: 'scene', id });
        return true;
      }
      this.currentChapter = scene.chapter;
      this.currentScene = id;
      this.#visit(`scene:${id}`);
      this.#renderScene(scene);
      this.save();
      EbiAR.events.emit('story:scene', { scene: clone(scene), state: this.getState() });
      return true;
    }

    /**
     * 現在のStoryを次のSceneへ進める。
     * @returns {boolean}
     */
    nextScene() {
      if (!this.currentScene) return false;
      const story = STORIES[this.currentStoryId];
      if (!story) {
        this.currentScene = null;
        this.#hideDialog();
        this.#dequeue();
        return true;
      }
      const index = story.scenes.indexOf(this.currentScene);
      if (index >= 0 && index < story.scenes.length - 1) return this.playScene(story.scenes[index + 1]);
      if (!this.#storyObjectiveMet(story.id)) {
        this.currentStoryId = null;
        this.currentScene = null;
        this.#hideDialog();
        this.save();
        this.#dequeue();
        return true;
      }
      return this.completeStory(story.id);
    }

    /**
     * Storyを完了状態にする。
     * @param {string} id
     * @returns {boolean}
     */
    completeStory(id) {
      const story = STORIES[id];
      if (!story) return this.#fail('unknown_story', { id });
      if (!this.completedStories.includes(id)) this.completedStories.push(id);
      this.setFlag(`story.${id}.complete`, true, false);
      this.currentStoryId = null;
      this.currentScene = null;
      this.#hideDialog();
      if (id === 'chapter0-opening' && EbiAR.Quest?.start) EbiAR.Quest.start('welcome-hino');
      this.save();
      EbiAR.events.emit('story:complete', { story: clone(story), state: this.getState() });
      this.#dequeue();
      return true;
    }

    /**
     * Storyフラグを設定する。
     * @param {string} name
     * @param {boolean} [value=true]
     * @param {boolean} [persist=true]
     * @returns {boolean}
     */
    setFlag(name, value = true, persist = true) {
      if (!/^[a-z0-9._-]{1,96}$/i.test(name || '')) return false;
      this.flags[name] = Boolean(value);
      if (persist) this.save();
      return this.flags[name];
    }

    /**
     * Storyフラグを確認する。
     * @param {string} name
     * @returns {boolean}
     */
    hasFlag(name) {
      return this.flags[name] === true;
    }

    /**
     * Story状態をlocalStorageへ保存する。
     * @returns {object}
     */
    save() {
      const state = this.exportState();
      try {
        global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        this.#fail('save_failed', { error });
      }
      return state;
    }

    /**
     * Story状態を復元する。
     * @param {object} [source] 統合SaveまたはStory単体Save
     * @returns {object}
     */
    load(source) {
      let saved = source;
      if (!saved) {
        try { saved = JSON.parse(global.localStorage?.getItem(STORAGE_KEY) || 'null'); }
        catch (error) { this.#fail('load_failed', { error }); }
      }
      if (!saved || saved.version !== VERSION) return this.getState();
      const chapter = saved.chapter ?? saved.currentChapter;
      const scene = saved.scene ?? saved.currentScene;
      this.currentChapter = Math.max(0, Math.min(4, Number(chapter) || 0));
      this.currentScene = SCENES[scene] ? scene : null;
      this.currentStoryId = STORIES[saved.currentStoryId]
        ? saved.currentStoryId
        : (Object.values(STORIES).find((story) => story.scenes.includes(this.currentScene))?.id || null);
      this.flags = saved.flags && typeof saved.flags === 'object' && !Array.isArray(saved.flags) ? { ...saved.flags } : {};
      this.visitedEvents = this.#safeIds(saved.visited ?? saved.visitedEvents, 500);
      this.completedStories = this.#safeIds(saved.completed ?? saved.completedStories, 20).filter((id) => STORIES[id]);
      return this.getState();
    }

    /** @returns {object} 統合Save向けStory状態 */
    exportState() {
      return {
        version: VERSION,
        chapter: this.currentChapter,
        scene: this.currentScene,
        flags: clone(this.flags),
        visited: this.visitedEvents.slice(),
        completed: this.completedStories.slice(),
        updatedAt: new Date().toISOString()
      };
    }

    /** @param {object} saved 統合Saveから復元するStory状態 */
    restoreState(saved) {
      if (!saved) return false;
      this.load(saved);
      if (this.initialized && this.currentScene) this.playScene(this.currentScene);
      return true;
    }

    /** @returns {object} 現在のStory状態 */
    getState() {
      return clone({
        currentChapter: this.currentChapter,
        currentScene: this.currentScene,
        currentStoryId: this.currentStoryId,
        flags: this.flags,
        visitedEvents: this.visitedEvents,
        completedStories: this.completedStories
      });
    }

    #bindEvents() {
      if (this.bound) return;
      this.bound = true;
      EbiAR.events.on('save:loaded', (data) => {
        if (this.initialized) this.restoreState(data?.story);
        else this.pendingSave = data?.story || null;
      });
      EbiAR.events.on('save:reset', () => {
        this.currentChapter = 0;
        this.currentScene = null;
        this.currentStoryId = null;
        this.flags = {};
        this.visitedEvents = [];
        this.completedStories = [];
        this.queue = [];
        this.#hideDialog();
        try { global.localStorage?.removeItem(STORAGE_KEY); } catch { /* Save Engine側で通知済み */ }
        if (this.initialized) this.startStory('chapter0-opening');
      });
      EbiAR.events.on('gps:spot-arrived', (detail) => this.#onSpot(detail?.spot));
      EbiAR.events.on('ar:started', (detail) => this.#onArStarted(detail));
      EbiAR.events.on('ar:captured', (detail) => this.#onArCaptured(detail));
      EbiAR.events.on('quest:complete', (detail) => this.#onEvent('quest', detail?.id));
      EbiAR.events.on('quest:claim', () => this.#checkEnding());
      EbiAR.events.on('achievement:unlock', (detail) => this.#onEvent('achievement', detail?.id));
      EbiAR.events.on('character:levelup', (detail) => {
        this.#onEvent('level', detail?.character?.level);
        this.#checkGoldenCondition();
      });
      EbiAR.events.on('game:points-changed', () => this.#checkGoldenCondition());
      EbiAR.events.on('character:acquired', (detail) => {
        this.#onEvent('catalog', detail?.character?.id);
        this.#checkEnding();
      });
      EbiAR.events.on('coupon:exchanged', (detail) => this.#onEvent('coupon', detail?.id));
    }

    #onSpot(spot) {
      if (!this.initialized || !spot?.id) return;
      if (!this.hasFlag('firstSpotStoryStarted')) {
        this.setFlag('firstSpotStoryStarted');
        this.startStory('chapter1-first-hino');
      }
      const historyFlag = HISTORY_SPOTS[spot.id];
      if (!historyFlag || this.hasFlag(historyFlag)) return;
      if (!this.hasFlag('historyStoryStarted')) {
        this.setFlag('historyStoryStarted');
        this.startStory('chapter2-history');
      }
      this.setFlag(historyFlag);
      this.#schedule({ type: 'scene', id: `history-${historyFlag.split('.')[1]}` });
      if (Object.values(HISTORY_SPOTS).every((flag) => this.hasFlag(flag))) {
        this.#schedule({ type: 'complete', id: 'chapter2-history' });
      }
    }

    #onArStarted(detail) {
      if (!this.initialized) return;
      this.#onEvent('ar-start', detail?.characterId || 'unknown');
      if (this.currentChapter === 3) this.playScene('golden-ar');
    }

    #onArCaptured(detail) {
      const id = detail?.character?.id || detail?.state?.characterId || detail?.characterId;
      this.#onEvent('ar-captured', id || 'unknown');
      if (id === 'hino-gold' && !this.completedStories.includes('chapter3-golden-ebi')) {
        this.setFlag('goldenEbiFound');
        this.playScene('golden-found');
        this.#enqueue({ type: 'complete', id: 'chapter3-golden-ebi' });
      }
      this.#checkEnding();
    }

    #onEvent(type, id) {
      if (!this.initialized) return;
      const key = `${type}:${String(id ?? 'unknown')}`;
      if (!this.#visit(key)) return;
      this.save();
      this.#checkEnding();
    }

    #checkGoldenCondition() {
      if (!this.initialized || this.completedStories.includes('chapter3-golden-ebi') || this.hasFlag('goldenLegendUnlocked')) return;
      const character = EbiAR.game?.getState()?.character;
      if ((character?.level || 0) >= 5 || (character?.points || 0) >= 1000) {
        this.setFlag('goldenLegendUnlocked');
        this.startStory('chapter3-golden-ebi');
      }
    }

    #checkEnding() {
      if (!this.initialized || this.completedStories.includes('chapter4-ending') || this.hasFlag('endingUnlocked')) return;
      const questComplete = ((EbiAR.Quest?.getClaimed?.().length || 0)
        + (EbiAR.Quest?.getCompleted?.().length || 0)) >= 7;
      const achievementComplete = (EbiAR.Achievement?.getUnlocked?.().length || 0) >= 7;
      const character = EbiAR.game?.getState()?.character;
      const catalogComplete = EbiAR.character?.collectionStats?.(character)?.isComplete === true;
      if (questComplete && achievementComplete && catalogComplete) {
        this.setFlag('endingUnlocked');
        this.startStory('chapter4-ending');
      }
    }

    #enqueue(item) {
      const key = `${item.type}:${item.id}`;
      if (!this.queue.some((entry) => `${entry.type}:${entry.id}` === key)) this.queue.push(item);
    }

    #schedule(item) {
      if (this.currentScene || this.currentStoryId) {
        this.#enqueue(item);
      } else if (item.type === 'story') {
        this.startStory(item.id);
      } else if (item.type === 'scene') {
        this.playScene(item.id);
      } else if (item.type === 'complete') {
        this.completeStory(item.id);
      }
    }

    #dequeue() {
      const item = this.queue.shift();
      if (!item) return;
      if (item.type === 'story') this.startStory(item.id);
      else if (item.type === 'scene') this.playScene(item.id);
      else if (item.type === 'complete') this.completeStory(item.id);
    }

    #isCurrentStoryScene(id) {
      return STORIES[this.currentStoryId]?.scenes.includes(id) === true;
    }

    #visit(id) {
      if (this.visitedEvents.includes(id)) return false;
      this.visitedEvents.push(id);
      if (this.visitedEvents.length > 500) this.visitedEvents.shift();
      return true;
    }

    #safeIds(value, limit) {
      return Array.isArray(value)
        ? [...new Set(value.filter((item) => typeof item === 'string' && item.length <= 128))].slice(0, limit)
        : [];
    }

    #ensureDialog() {
      if (this.root || !global.document?.body) return this.root;
      const root = global.document.createElement('section');
      root.id = 'story-dialog';
      root.className = 'story-dialog';
      root.hidden = true;
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-labelledby', 'story-character');
      root.innerHTML = '<div class="story-dialog__panel"><span id="story-chapter" class="story-dialog__chapter"></span><strong id="story-character"></strong><p id="story-text"></p><div class="story-dialog__actions"><button type="button" data-story-action="skip" class="story-dialog__skip">スキップ</button><button type="button" data-story-action="next">次へ</button></div></div>';
      root.addEventListener('click', (event) => {
        const action = event.target.closest('[data-story-action]')?.dataset.storyAction;
        if (action === 'next') this.nextScene();
        if (action === 'skip' && this.currentStoryId) {
          if (this.#storyObjectiveMet(this.currentStoryId)) this.completeStory(this.currentStoryId);
          else {
            this.currentStoryId = null;
            this.currentScene = null;
            this.#hideDialog();
            this.save();
            this.#dequeue();
          }
        }
      });
      global.document.body.append(root);
      this.root = root;
      this.#installStyles();
      return root;
    }

    #renderScene(scene) {
      const root = this.#ensureDialog();
      if (!root) return;
      root.querySelector('#story-chapter').textContent = `Chapter ${scene.chapter}`;
      root.querySelector('#story-character').textContent = scene.character;
      root.querySelector('#story-text').textContent = scene.text;
      root.hidden = false;
      root.querySelector('[data-story-action="next"]')?.focus();
    }

    #hideDialog() {
      if (this.root) this.root.hidden = true;
    }

    #storyObjectiveMet(id) {
      if (id === 'chapter2-history') {
        return Object.values(HISTORY_SPOTS).every((flag) => this.hasFlag(flag));
      }
      if (id === 'chapter3-golden-ebi') return this.hasFlag('goldenEbiFound');
      return true;
    }

    #installStyles() {
      if (!global.document || global.document.getElementById('ebiar-story-styles')) return;
      const style = global.document.createElement('style');
      style.id = 'ebiar-story-styles';
      style.textContent = `
        .story-dialog{position:fixed;z-index:12000;inset:0;display:grid;align-items:end;padding:16px max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:linear-gradient(transparent 35%,#160d08aa);font-family:system-ui,-apple-system,"Noto Sans JP",sans-serif}
        .story-dialog[hidden]{display:none}.story-dialog__panel{width:min(100%,680px);margin:0 auto;padding:18px;border:2px solid #f0b429;border-radius:18px;background:#fffaf2;color:#282018;box-shadow:0 12px 40px #0008}
        .story-dialog__chapter{display:block;color:#a8471c;font-size:.75rem;font-weight:800;letter-spacing:.08em}.story-dialog strong{display:block;margin:3px 0 8px;font-size:1.05rem}.story-dialog p{min-height:3em;margin:0 0 16px;white-space:pre-line;font-size:1rem;line-height:1.7}
        .story-dialog__actions{display:grid;grid-template-columns:1fr 2fr;gap:10px}.story-dialog button{min-height:48px;border:0;border-radius:12px;background:#e85d24;color:#fff;font:inherit;font-weight:800;touch-action:manipulation}.story-dialog .story-dialog__skip{border:1px solid #dcc8af;background:#fff;color:#5b4a3a}
        .story-dialog button:focus-visible{outline:3px solid #34734a;outline-offset:2px}@media(min-width:700px){.story-dialog{align-items:center}.story-dialog__panel{padding:24px}}@media(prefers-reduced-motion:reduce){.story-dialog *{scroll-behavior:auto!important}}
      `;
      global.document.head.append(style);
    }

    #fail(code, detail) {
      console.error('[EbiAR Story]', code, detail || null);
      return false;
    }
  }

  const manager = new StoryManager();
  EbiAR.StoryManager = StoryManager;
  EbiAR.Story = Object.freeze({
    initialize: manager.initialize.bind(manager),
    startStory: manager.startStory.bind(manager),
    playScene: manager.playScene.bind(manager),
    nextScene: manager.nextScene.bind(manager),
    completeStory: manager.completeStory.bind(manager),
    setFlag: manager.setFlag.bind(manager),
    hasFlag: manager.hasFlag.bind(manager),
    save: manager.save.bind(manager),
    load: manager.load.bind(manager),
    exportState: manager.exportState.bind(manager),
    restoreState: manager.restoreState.bind(manager),
    getState: manager.getState.bind(manager),
    stories: STORIES,
    scenes: SCENES
  });
})(typeof window !== 'undefined' ? window : globalThis);
