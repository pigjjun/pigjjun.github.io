// 앱 화면 파일은 항상 인터넷에서 새로 받아(그래서 업데이트가 바로 적용됨) 캐시에 저장하고,
// 인터넷이 안 될 때만 캐시를 쓴다. 구글 시트 API·폰트 같은 다른 주소 요청은 건드리지 않는다.
const CACHE = 'budget-2026.11.17-1814';
const CORE = ['./', 'index.html', 'app.css', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'js/utils.js', 'js/store.js', 'js/shared.js', 'js/nav.js', 'js/project.js', 'js/todo.js', 'js/ledger.js', 'js/stats.js', 'js/settings.js', 'js/boot.js'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/') || url.pathname.includes('/server/')) return;
  e.respondWith(
    fetch(req, {cache: 'no-cache'})
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req, {ignoreSearch: true}).then(r => r || caches.match('index.html')))
  );
});
