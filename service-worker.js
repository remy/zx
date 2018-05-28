// we'll version our cache (and learn how to delete caches in
// some other post)
const cacheName = 'v3::static';

self.addEventListener('install', e => {
  // once the SW is installed, go ahead and fetch the resources
  // to make this work offline
  e.waitUntil(
    caches.open(cacheName).then(cache => {
      return cache
        .addAll([
          '/',
          'me-int.gif',
          'rem.png',
          '8x8-heart.png',
          'styles.css',
          // from `fd 'js$'
          '1-440.js',
          '2-square.js',
          '3-noise.js',
          '4-binary.js',
          '5-convert.js',
          '6-image.js',
          '7-bars.js',
          '8-bars-cheat.js',
          '8bit-colour.js',
          'BufferLoader.js',
          'Dither.js',
          'ROMLoader-old.js',
          'ROMLoader.js',
          'TAPLoader.js',
          'Zoom.js',
          'analyser.js',
          'art-inspector.js',
          'audio-buffer.js',
          'audio-consts.js',
          'audio.js',
          'audioworker.js',
          'audioworklet.js',
          'bars.js',
          'binary-to-audio.js',
          'canvas.js',
          'colour.js',
          'complete.js',
          'ctx.js',
          'hex.js',
          'image-manip/index.js',
          'image-manip/parser.js',
          'image-manip/scr-main.js',
          'image-manip/scr-worker.js',
          'image-manip/scr.js',
          'image-to-scr.js',
          'image.js',
          'jsconf.js',
          'listen-canvas.js',
          'listen-tap.js',
          'listen.js',
          'main.js',
          'matrices.js',
          'pic-to-audio-simple.js',
          'pic-to-audio.js',
          'pic-to-scr.js',
          'read-audio.js',
          'retrofy.js',
          'rom-loader-nearly-fast.js',
          'rom-loader.js',
          'rom-loader2.js',
          'rom-loader3.js',
          'scr-stream.js',
          'screen.js',
          'sleep.js',
          'sound-only.js',
          'speccy.js',
          't-state.js',
          'tap-processor.js',
          'to-zx-img.js',
          'wav.js',
        ])
        .then(() => self.skipWaiting());
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(names =>
        Promise.all(
          names
            .filter(name => name !== cacheName)
            .map(cache => caches.delete(cache))
        )
      )
  );
});

// when the browser fetches a url, either response with
// the cached object or go ahead and fetch the actual url
self.addEventListener('fetch', event => {
  var res = event.request;
  var url = new URL(res.url);
  if (url.pathname === '/') {
    // strip the query string
    url.search = '';
    res = url;
  }

  event.respondWith(
    // ensure we check the *right* cache to match against
    caches.open(cacheName).then(cache => {
      return cache.match(res).then(res => {
        return res || fetch(event.request);
      });
    })
  );
});
