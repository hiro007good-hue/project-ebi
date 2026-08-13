/* Project EBI PWA cache. Increment CACHE_VERSION whenever the app shell changes. */
'use strict';

const CACHE_VERSION = 'v2';
const SHELL_CACHE = `project-ebi-shell-${CACHE_VERSION}`;
const CHARACTER_CACHE = `project-ebi-characters-${CACHE_VERSION}`;
const AUDIO_CACHE = `project-ebi-audio-${CACHE_VERSION}`;
const CACHE_PREFIX = 'project-ebi-';
const OFFLINE_URL = './offline.html';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  OFFLINE_URL,
  './js/config.js',
  './js/spots.js',
  './js/character.js',
  './js/blink.js',
  './js/idle.js',
  './js/photo.js',
  './js/gps.js',
  './js/game.js',
  './js/achievement.js',
  './js/quest.js',
  './js/story.js',
  './js/ending.js',
  './js/save.js',
  './js/sound.js',
  './js/effect.js',
  './js/ui.js',
  './js/ar.js',
  './js/pwa.js',
  './images/icons/icon-192.png',
  './images/icons/icon-512.png',
  './images/icons/icon-maskable-512.png',
  './images/icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(SHELL_CACHE).then(function (cache) {
    return cache.addAll(APP_SHELL);
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (name) {
      return name.startsWith(CACHE_PREFIX) && name !== SHELL_CACHE && name !== CHARACTER_CACHE && name !== AUDIO_CACHE;
    }).map(function (name) {
      return caches.delete(name);
    }));
  }));
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || (fallbackUrl ? await cache.match(fallbackUrl) : undefined) || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
    if (cacheName === CHARACTER_CACHE) {
      const keys = await cache.keys();
      if (keys.length > 60) await cache.delete(keys[0]);
    }
  }
  return response;
}

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, OFFLINE_URL));
    return;
  }

  if (url.pathname.endsWith('/js/spots.js')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (/\/images\/characters\/[a-z0-9-]+(?:-blink)?\.webp$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, CHARACTER_CACHE));
    return;
  }

  if (/\/sounds\/[a-z0-9_-]+\.mp3$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, AUDIO_CACHE));
    return;
  }

  event.respondWith(cacheFirst(request, SHELL_CACHE));
});
