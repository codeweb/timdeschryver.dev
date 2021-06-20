import { timestamp, files, build } from '$service-worker';

const ASSETS = `cache${timestamp}`;

const EXTENSIONS_TO_CACHE = ['css', 'webmanifest', 'txt'];

// `build` is an array of all the files generated by the bundler,
// `files` is an array of everything in the `static` directory
const TO_CACHE = build.concat(
	files.filter((file) => {
		const basename = file.split('/').pop();
		if (basename[0] === '.') return false;
		const [extension] = basename.split('.').reverse();
		return EXTENSIONS_TO_CACHE.includes(extension);
	}),
);
const cached = new Set(TO_CACHE);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(ASSETS)
			.then((cache) => cache.addAll(TO_CACHE))
			.then(() => {
				self.skipWaiting();
			}),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			// delete old caches
			for (const key of keys) {
				if (key !== ASSETS) await caches.delete(key);
			}

			self.clients.claim();
		}),
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET' || event.request.headers.has('range')) return;

	const url = new URL(event.request.url);

	// don't try to handle e.g. data: URIs
	if (!url.protocol.startsWith('http')) return;

	// ignore dev server requests
	if (url.hostname === self.location.hostname && url.port !== self.location.port) return;

	// always serve static files and bundler-generated assets from cache
	if (url.host === self.location.host && cached.has(url.pathname)) {
		event.respondWith(caches.match(event.request));
		return;
	}

	if (event.request.cache === 'only-if-cached') return;

	// for everything else, try the network first, falling back to
	// cache if the user is offline. (If the pages never change, you
	// might prefer a cache-first approach to a network-first one.)
	event.respondWith(
		caches.open(`offline${timestamp}`).then(async (cache) => {
			try {
				const response = await fetch(event.request);
				cache.put(event.request, response.clone());
				return response;
			} catch (err) {
				const response = await cache.match(event.request);
				if (response) return response;
				console.error(err, event.request);
			}
		}),
	);
});
