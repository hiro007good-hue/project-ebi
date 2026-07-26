/* 海老フライ王国AR v1.0 - Canvas演出エンジン */
(function (global) {
  'use strict';

  var EbiAR = global.EbiAR;
  if (!EbiAR || !EbiAR.config) throw new Error('config.js を先に読み込んでください。');

  var canvas = null;
  var context = null;
  var particles = [];
  var animations = [];
  var rafId = null;
  var lastFrameAt = 0;
  var connected = false;
  var MAX_PARTICLES = 120;
  var COLORS = ['#ffce4b', '#e85d24', '#ff7d61', '#75c99a', '#6fa8dc', '#ffffff'];

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function random(min, max) { return min + Math.random() * (max - min); }
  function viewport() { return { width: global.innerWidth || 0, height: global.innerHeight || 0 }; }
  function point(x, y) { var view = viewport(); return { x: x == null ? view.width / 2 : x, y: y == null ? view.height / 2 : y }; }
  function emit(name, detail) { if (EbiAR.events) EbiAR.events.emit(name, detail); }

  /** Canvasを表示領域へ合わせる。DPRを2に制限してモバイルGPU負荷を抑える。 */
  function resize() {
    if (!canvas || !context) return;
    var view = viewport();
    var ratio = Math.min(global.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(view.width * ratio));
    canvas.height = Math.max(1, Math.round(view.height * ratio));
    canvas.style.width = view.width + 'px';
    canvas.style.height = view.height + 'px';
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function ensureCanvas(options) {
    if (canvas) return true;
    if (!global.document || !global.document.body) return false;
    options = options || {};
    canvas = global.document.createElement('canvas');
    canvas.id = 'ebi-effect-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;z-index:9998;pointer-events:none;width:100%;height:100%;';
    (options.root || global.document.body).appendChild(canvas);
    context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) { canvas.remove(); canvas = null; return false; }
    MAX_PARTICLES = Number(options.maxParticles) || MAX_PARTICLES;
    resize();
    global.addEventListener('resize', resize, { passive: true });
    return true;
  }

  /** 粒子を追加する。上限時は最も古い粒子を捨てる。 */
  function addParticle(properties) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, gravity: 0, drag: 0.96, size: 4, rotation: 0, spin: 0, life: 0.8, age: 0, color: '#fff', shape: 'circle', alpha: 1 }, properties));
    startLoop();
  }
  function updateParticle(particle, delta) {
    particle.age += delta;
    particle.vx *= Math.pow(particle.drag, delta * 60);
    particle.vy = particle.vy * Math.pow(particle.drag, delta * 60) + particle.gravity * delta;
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.rotation += particle.spin * delta;
    return particle.age < particle.life;
  }
  function drawParticle(particle) {
    var progress = particle.age / particle.life;
    context.save();
    context.globalAlpha = particle.alpha * (1 - progress) * (1 - progress);
    context.fillStyle = particle.color;
    context.translate(particle.x, particle.y);
    context.rotate(particle.rotation);
    if (particle.shape === 'confetti') context.fillRect(-particle.size, -particle.size / 2, particle.size * 2, particle.size);
    else if (particle.shape === 'star') {
      context.beginPath();
      for (var index = 0; index < 10; index += 1) { var angle = -Math.PI / 2 + index * Math.PI / 5; var radius = index % 2 ? particle.size * .45 : particle.size; context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius); }
      context.closePath(); context.fill();
    } else { context.beginPath(); context.arc(0, 0, particle.size * (1 - progress * .4), 0, Math.PI * 2); context.fill(); }
    context.restore();
  }

  /** 時間ベースのアニメーションを登録する。 */
  function animate(durationMs, update, complete) {
    animations.push({ duration: Math.max(1, durationMs), elapsed: 0, update: update, complete: complete });
    startLoop();
  }
  function drawAnimations(delta) {
    animations = animations.filter(function (animation) {
      animation.elapsed += delta * 1000;
      var progress = clamp(animation.elapsed / animation.duration, 0, 1);
      animation.update(progress);
      if (progress < 1) return true;
      if (typeof animation.complete === 'function') animation.complete();
      return false;
    });
  }
  function frame(timestamp) {
    var delta = lastFrameAt ? Math.min(.034, (timestamp - lastFrameAt) / 1000) : .016;
    lastFrameAt = timestamp;
    context.clearRect(0, 0, global.innerWidth, global.innerHeight);
    particles = particles.filter(function (particle) { var alive = updateParticle(particle, delta); if (alive) drawParticle(particle); return alive; });
    drawAnimations(delta);
    if (particles.length || animations.length) rafId = global.requestAnimationFrame(frame);
    else { rafId = null; lastFrameAt = 0; }
  }
  function startLoop() { if (canvas && context && rafId === null) rafId = global.requestAnimationFrame(frame); }

  /** 指定地点からキラキラ粒子を発生させる。 */
  function sparkle(x, y, options) {
    options = options || {}; if (!ensureCanvas(options)) return false;
    var origin = point(x, y), count = clamp(Number(options.count) || 16, 1, 48);
    for (var index = 0; index < count; index += 1) addParticle({ x: origin.x, y: origin.y, vx: random(-75, 75), vy: random(-115, -20), gravity: 80, size: random(3, 7), life: random(.55, 1.05), color: options.color || COLORS[index % COLORS.length], shape: 'star', spin: random(-6, 6) });
    return true;
  }
  /** 紙吹雪を画面上部から降らせる。 */
  function confetti(options) {
    options = options || {}; if (!ensureCanvas(options)) return false;
    var view = viewport(), count = clamp(Number(options.count) || 56, 1, 100);
    for (var index = 0; index < count; index += 1) addParticle({ x: random(view.width * .1, view.width * .9), y: random(-20, 20), vx: random(-80, 80), vy: random(45, 130), gravity: random(90, 180), size: random(4, 8), life: random(1.4, 2.4), color: COLORS[index % COLORS.length], shape: 'confetti', spin: random(-10, 10), drag: .99 });
    return true;
  }
  /** レベルアップの中心演出。 */
  function levelUp(options) { var center = point(options && options.x, options && options.y); sparkle(center.x, center.y, { count: 34, color: '#ffce4b' }); confetti({ count: 42 }); emit('effect:level-up'); }
  /** スポット発見の控えめなキラキラ演出。 */
  function spotFound(spot, options) { var center = point(options && options.x, options && options.y); sparkle(center.x, center.y, { count: 18, color: '#75c99a' }); emit('effect:spot-found', { spot: spot }); }
  /** キャラクター出現の演出。 */
  function characterAppear(character, options) { var center = point(options && options.x, options && options.y); sparkle(center.x, center.y, { count: 28, color: options && options.color || '#ff7d61' }); emit('effect:character-appear', { character: character }); }
  /** ARモデル配置に接続するための出現演出。 */
  function arAppear(payload, options) { var center = point(options && options.x, options && options.y); sparkle(center.x, center.y, { count: 22, color: '#6fa8dc' }); emit('effect:ar-appear', { payload: payload }); }

  /** 画面要素を短く揺らす。 */
  function shake(target, options) {
    options = options || {}; var element = target || (global.document && global.document.getElementById('app')); if (!element) return false;
    var duration = Number(options.durationMs) || 360, distance = Number(options.distance) || 8;
    if (typeof element.animate === 'function') { element.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + distance + 'px)' }, { transform: 'translateX(-' + distance + 'px)' }, { transform: 'translateX(0)' }], { duration: duration, easing: 'ease-out' }); return true; }
    return false;
  }
  /** Canvas上の黒幕をフェードさせる。 */
  function fade(options) {
    options = options || {}; if (!ensureCanvas(options)) return Promise.resolve(false);
    var from = clamp(options.from == null ? 0 : options.from, 0, 1), to = clamp(options.to == null ? 1 : options.to, 0, 1), color = options.color || '#000';
    return new Promise(function (resolve) { animate(options.durationMs || 300, function (progress) { context.save(); context.fillStyle = color; context.globalAlpha = from + (to - from) * progress; context.fillRect(0, 0, global.innerWidth, global.innerHeight); context.restore(); }, function () { resolve(true); }); });
  }
  /** 指定要素を一度ズームする。 */
  function zoom(target, options) {
    options = options || {}; var element = target || (global.document && global.document.getElementById('app')); if (!element || typeof element.animate !== 'function') return false;
    element.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + (options.scale || 1.04) + ')' }, { transform: 'scale(1)' }], { duration: options.durationMs || 300, easing: 'ease-out' }); return true;
  }
  function connectEvents() {
    if (connected || !EbiAR.events) return;
    connected = true;
    EbiAR.events.on('character:levelup', levelUp);
    EbiAR.events.on('gps:spot-arrived', function (event) { spotFound(event.spot); });
    EbiAR.events.on('character:acquired', function (event) { characterAppear(event.character); });
    EbiAR.events.on('ar:placed', function (event) { arAppear(event); });
  }
  /** エフェクトエンジンを初期化する。 */
  function init(options) { if (!ensureCanvas(options)) return false; connectEvents(); return true; }
  function destroy() { if (rafId !== null) global.cancelAnimationFrame(rafId); rafId = null; particles = []; animations = []; if (canvas) canvas.remove(); canvas = null; context = null; }

  EbiAR.effect = Object.freeze({ init: init, destroy: destroy, sparkle: sparkle, confetti: confetti, levelUp: levelUp, spotFound: spotFound, characterAppear: characterAppear, arAppear: arAppear, shake: shake, fade: fade, zoom: zoom, animate: animate, resize: resize, getParticleCount: function () { return particles.length; } });
})(window);
