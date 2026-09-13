// Service Worker for PWA functionality
// =============================================================================
// IMPORTANT: Change CACHE_VERSION to force ALL clients to get fresh content!
// This is the nuclear option - change this string and deploy to bust all caches.
// =============================================================================
const CACHE_VERSION = "v6";

// Detect if we're on a staging path or the production build (root)
function detectBuildPath() {
  // Service worker scope tells us where we're registered
  const scope = self.registration
    ? self.registration.scope
    : self.location.href;
  const scopeUrl = new URL(scope);
  if (["localhost", "127.0.0.1", "::1"].includes(scopeUrl.hostname)) {
    return {
      isLocal: true,
      isStaging: false,
      basePath: scopeUrl.pathname,
      versionUrl: new URL("version.json", scopeUrl).href,
      cachePrefix: "local",
    };
  }

  // Scope keeps project sites, staging folders and custom domains independent.
  const isStaging = /\/(?:BranchStaging|BranchMain)(?:\/|$)/.test(
    scopeUrl.pathname,
  );
  return {
    isLocal: false,
    isStaging,
    basePath: scopeUrl.pathname,
    versionUrl: new URL("version.json", scopeUrl).href,
    cachePrefix: encodeURIComponent(scopeUrl.pathname),
  };
}

const BUILD_INFO = detectBuildPath();
const CACHE_NAME = `unity-game-cache-${CACHE_VERSION}-${BUILD_INFO.cachePrefix}`;
const GAME_CACHE_PREFIX = "unity-game-cache-";

function isCurrentBuildCache(cacheName) {
  return (
    cacheName.startsWith(GAME_CACHE_PREFIX) &&
    cacheName.endsWith(`-${BUILD_INFO.cachePrefix}`)
  );
}

// Remote URL to check for version updates - dynamically set based on build path
const VERSION_CHECK_URL = BUILD_INFO.versionUrl;

// Files that should NEVER be cached - always fetch fresh from network
const NEVER_CACHE_FILES = [
  "version.json",
  "sw.js", // Service worker should never be cached by itself
];

// Files that should be network-first but still cached for offline use
const NETWORK_FIRST_FILES = ["index.html", "manifest.json"];

// Files to precache on install (critical for offline PWA)
const PRECACHE_ASSETS = [
  "./index.html",
  "./manifest.json",
  "./manifest-staging.json",
  "./platform-detection.js",
  "./version-check.js",
  "./lucide-icons.js",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png",
];

// Check if a URL should never be cached
function shouldNeverCache(url) {
  const pathname = url.pathname;
  return NEVER_CACHE_FILES.some((file) => pathname.endsWith(file));
}

// Check if a URL should use network-first strategy (but still cache for offline)
function shouldNetworkFirst(url) {
  const pathname = url.pathname;
  // Root path or index.html
  if (pathname === "/" || pathname.endsWith("/")) {
    return true;
  }
  return NETWORK_FIRST_FILES.some((file) => pathname.endsWith(file));
}

// Fetch version.json from remote server
async function fetchRemoteVersion() {
  try {
    const cacheBuster = Date.now();
    const response = await fetch(`${VERSION_CHECK_URL}?_=${cacheBuster}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.warn(
      "[ServiceWorker] Could not fetch remote version:",
      err.message,
    );
  }
  return null;
}

// Get locally stored version
async function getStoredVersion() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match("__version__");
    if (response) {
      return await response.json();
    }
  } catch (err) {
    console.warn("[ServiceWorker] Could not get stored version:", err.message);
  }
  return null;
}

// Store version info in cache
async function storeVersion(version) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = new Response(JSON.stringify(version), {
      headers: { "Content-Type": "application/json" },
    });
    await cache.put("__version__", response);
  } catch (err) {
    console.warn("[ServiceWorker] Could not store version:", err.message);
  }
}

// Clear this build channel's game caches without evicting unrelated apps or
// the other BROcoli channel (production versus staging).
async function clearAllCaches() {
  console.log(
    "[ServiceWorker] Clearing game caches for:",
    BUILD_INFO.cachePrefix,
  );
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.filter(isCurrentBuildCache).map((name) => {
      console.log("[ServiceWorker] Deleting cache:", name);
      return caches.delete(name);
    }),
  );
  console.log("[ServiceWorker] Build-channel caches cleared");
}

// Check for updates and clear caches if new version found
async function checkForUpdatesAndClearIfNeeded() {
  if (BUILD_INFO.isLocal) {
    console.log("[ServiceWorker] Local build, skipping hosted version check");
    return false;
  }

  const buildType = BUILD_INFO.isStaging ? "[STAGING]" : "[PRODUCTION]";
  console.log(
    "[ServiceWorker]",
    buildType,
    "Checking for updates from:",
    VERSION_CHECK_URL,
  );

  const [remoteVersion, storedVersion] = await Promise.all([
    fetchRemoteVersion(),
    getStoredVersion(),
  ]);

  if (!remoteVersion) {
    console.log(
      "[ServiceWorker]",
      buildType,
      "Could not fetch remote version, skipping update check",
    );
    return false;
  }

  if (!storedVersion) {
    console.log("[ServiceWorker] No stored version, saving current version");
    await storeVersion(remoteVersion);
    return false;
  }

  // Compare versions
  if (remoteVersion.buildId !== storedVersion.buildId) {
    console.log("[ServiceWorker] NEW VERSION DETECTED!");
    console.log("[ServiceWorker] Old:", storedVersion.buildId);
    console.log("[ServiceWorker] New:", remoteVersion.buildId);

    // Clear all caches
    await clearAllCaches();

    // Store new version
    await caches.open(CACHE_NAME);
    await storeVersion(remoteVersion);

    // Notify all clients to reload
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((client) => {
      client.postMessage({
        type: "NEW_VERSION_AVAILABLE",
        version: remoteVersion,
      });
    });

    return true;
  }

  console.log("[ServiceWorker] Version is up to date:", remoteVersion.buildId);
  return false;
}

// Install event
self.addEventListener("install", (event) => {
  console.log(
    "[ServiceWorker]",
    BUILD_INFO.isStaging ? "[STAGING]" : "[PRODUCTION]",
    "Installing version:",
    CACHE_VERSION,
  );
  console.log("[ServiceWorker] Cache name:", CACHE_NAME);
  console.log("[ServiceWorker] Version URL:", VERSION_CHECK_URL);
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log(
          "[ServiceWorker] Pre-caching assets (excluding index.html)",
        );
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn("[ServiceWorker] Some assets failed to cache:", err);
        });
      })
      .then(() => {
        console.log("[ServiceWorker] Installed successfully, skipping waiting");
        return self.skipWaiting();
      }),
  );
});

// Activate event - clean up old caches and claim clients without reloading them
self.addEventListener("activate", (event) => {
  console.log("[ServiceWorker] Activating...");
  event.waitUntil(
    (async () => {
      // Delete only old caches for this build channel. Production and staging
      // are separate PWAs and must not continuously evict one another.
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              isCurrentBuildCache(cacheName) && cacheName !== CACHE_NAME,
          )
          .map((cacheName) => {
            console.log("[ServiceWorker] Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }),
      );

      // Take control of all clients immediately
      await self.clients.claim();
      console.log("[ServiceWorker] Activated and claimed all clients");
    })(),
  );
});

// Fetch event
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith("http")) {
    return;
  }

  // NEVER cache certain files (version.json, sw.js) - always fetch fresh from network
  // But return a graceful fallback when offline (not an error that could break things)
  if (shouldNeverCache(url)) {
    event.respondWith(
      (async () => {
        try {
          // Add timeout for iOS Safari which can hang on fetch when offline
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

          const response = await fetch(event.request, {
            cache: "no-store",
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          return response;
        } catch (err) {
          // Offline or timeout - return a "success" response with offline indicator
          // This prevents errors while allowing version-check.js to handle gracefully
          console.log(
            "[ServiceWorker] Offline, returning fallback for:",
            url.pathname,
          );
          return new Response(
            JSON.stringify({
              error: "offline",
              offline: true,
              buildId: "offline-fallback",
            }),
            {
              status: 200, // Return 200 so it doesn't throw, let the caller handle the 'offline' flag
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      })(),
    );
    return;
  }

  // Network-first WITH caching for index.html and root path (works offline!)
  // CRITICAL: On iOS Safari, we must check cache FIRST if we suspect we're offline
  // because fetch() can hang or fail silently when waking from background
  if (shouldNetworkFirst(url)) {
    event.respondWith(
      (async () => {
        // Pre-check: try to get cached version first as fallback
        const cachedResponse = await caches.match(event.request);

        try {
          // Create an AbortController with timeout for iOS Safari
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

          const response = await fetch(event.request, {
            cache: "no-store",
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response && response.status === 200) {
            // Cache the fresh response for offline use
            const responseToCache = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              })
              .catch(() => {}); // Ignore cache write errors
          }
          return response;
        } catch (err) {
          // Offline or timeout - serve from cache
          console.log(
            "[ServiceWorker] Network failed, serving from cache:",
            url.pathname,
            err.message,
          );
          if (cachedResponse) {
            return cachedResponse;
          }
          // No cache available - return a basic offline page
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title></head><body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center"><h1>Loading...</h1><p>Trying to load from cache...</p><script>setTimeout(function(){location.reload();},2000);</script></div></body></html>',
            { status: 200, headers: { "Content-Type": "text/html" } },
          );
        }
      })(),
    );
    return;
  }

  // For Unity build files, use cache-first (they're big and versioned by buildId)
  // CRITICAL: These MUST be served from cache when offline - iOS Safari can fail fetch before cache lookup
  if (url.pathname.includes("/Build/")) {
    event.respondWith(
      (async () => {
        // Always try cache first for build files
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          console.log(
            "[ServiceWorker] Serving Build file from cache:",
            url.pathname,
          );
          return cachedResponse;
        }

        // No cache - let large Unity downloads finish. A fixed timeout made
        // first loads fail on mobile connections even while bytes were arriving.
        try {
          const response = await fetch(event.request);

          if (!response || response.status !== 200) {
            return response;
          }

          // Cache the response for future offline use
          const responseToCache = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => {
              console.log("[ServiceWorker] Caching Build file:", url.pathname);
              cache.put(event.request, responseToCache);
            })
            .catch(() => {});

          return response;
        } catch (err) {
          console.warn(
            "[ServiceWorker] Failed to fetch Build file:",
            url.pathname,
            err.message,
          );
          // Return error - Unity loader will handle this
          return new Response(
            "Build file not cached - please connect to internet",
            { status: 503 },
          );
        }
      })(),
    );
    return;
  }

  // For other requests (CSS, JS, images), use cache-first when offline
  // This is critical for iOS Safari which can lose network suddenly when backgrounded
  event.respondWith(
    (async () => {
      // Always check cache first
      const cachedResponse = await caches.match(event.request);

      try {
        // Try network with a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(event.request, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            })
            .catch(() => {}); // Ignore cache write errors
        }
        return response;
      } catch (err) {
        // Network failed - return cached response if available
        console.log(
          "[ServiceWorker] Network failed for:",
          url.pathname,
          "- using cache",
        );
        if (cachedResponse) {
          return cachedResponse;
        }
        // No cache, return error response
        return new Response("Offline - resource not cached", { status: 503 });
      }
    })(),
  );
});

// Handle messages from the main thread
self.addEventListener("message", (event) => {
  console.log("[ServiceWorker] Received message:", event.data?.type);

  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data?.type === "CHECK_FOR_UPDATES") {
    event.waitUntil(
      checkForUpdatesAndClearIfNeeded().then((updated) => {
        if (event.source) {
          event.source.postMessage({ type: "UPDATE_CHECK_COMPLETE", updated });
        }
      }),
    );
  }

  if (event.data?.type === "FORCE_CLEAR_ALL") {
    event.waitUntil(
      clearAllCaches().then(() => {
        if (event.source) {
          event.source.postMessage({ type: "CACHES_CLEARED" });
        }
      }),
    );
  }

  if (event.data?.type === "GET_CACHE_INFO") {
    event.waitUntil(
      (async () => {
        const cacheNames = await caches.keys();
        const storedVersion = await getStoredVersion();
        if (event.source) {
          event.source.postMessage({
            type: "CACHE_INFO",
            caches: cacheNames,
            currentCache: CACHE_NAME,
            version: storedVersion,
          });
        }
      })(),
    );
  }

  // Warmup cache with critical files - call this after game loads successfully
  // This ensures iOS Safari has all files cached for offline use
  if (event.data?.type === "WARMUP_CACHE") {
    event.waitUntil(
      (async () => {
        console.log("[ServiceWorker] Warming up cache for offline use...");
        const urlsToCache = event.data.urls || [];
        const cache = await caches.open(CACHE_NAME);

        let cached = 0;
        for (const url of urlsToCache) {
          try {
            // Check if already cached
            const existing = await cache.match(url);
            if (!existing) {
              console.log("[ServiceWorker] Caching:", url);
              const response = await fetch(url);
              if (response.ok) {
                await cache.put(url, response);
                cached++;
              }
            }
          } catch (err) {
            console.warn("[ServiceWorker] Failed to cache:", url, err.message);
          }
        }

        console.log(
          "[ServiceWorker] Cache warmup complete. Cached",
          cached,
          "new files.",
        );
        if (event.source) {
          event.source.postMessage({ type: "WARMUP_COMPLETE", cached });
        }
      })(),
    );
  }
});

// Periodic background sync (if supported) - check for updates
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "check-updates") {
    event.waitUntil(checkForUpdatesAndClearIfNeeded());
  }
});
