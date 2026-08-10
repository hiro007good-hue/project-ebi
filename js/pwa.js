/* Project EBI PWA registration - game initialization is intentionally independent. */
(function (global) {
  'use strict';

  if (!('serviceWorker' in global.navigator)) return;

  global.addEventListener('load', function () {
    global.navigator.serviceWorker.register('./service-worker.js', { scope: './' }).then(function (registration) {
      if (global.EbiAR && global.EbiAR.events) {
        global.EbiAR.events.emit('pwa:registered', { scope: registration.scope });
      }
    }).catch(function () {
      // PWA registration failure must not prevent the game from starting.
    });
  }, { once: true });
})(window);
