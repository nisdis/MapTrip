// import localforage from 'localforage';
// import type { TileEvent } from 'leaflet';
import L from 'leaflet';

// const TILE_CACHE = 'map-tiles-cache';
const MAX_ZOOM = 18;
const MIN_ZOOM = 10;

// Initialize localforage instance for tiles
// const tileStore = localforage.createInstance({
//   name: TILE_CACHE,
//   storeName: 'tiles'
// });

export async function cacheTileRegion(bounds: L.LatLngBounds): Promise<void> {
  const urls: string[] = [];

  // Calculate tile URLs for the visible area
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();

    const tileBounds = {
      minX: Math.floor((southWest.lng + 180) / 360 * Math.pow(2, z)),
      maxX: Math.floor((northEast.lng + 180) / 360 * Math.pow(2, z)),
      minY: Math.floor((1 - Math.log(Math.tan(northEast.lat * Math.PI / 180) + 1 / Math.cos(northEast.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z)),
      maxY: Math.floor((1 - Math.log(Math.tan(southWest.lat * Math.PI / 180) + 1 / Math.cos(southWest.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z))
    };

    for (let x = tileBounds.minX; x <= tileBounds.maxX; x++) {
      for (let y = tileBounds.minY; y <= tileBounds.maxY; y++) {
        const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
        urls.push(url);
      }
    }
  }

  // Cache all tiles
  try {

    const cache = await caches.open('map-tiles');

    // Function to process a batch of URLs and wait 2 seconds after each batch.
    async function processUrlsInBatches(urls: string[], batchSize: number) {
      for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);

        // Process the current batch
        await Promise.all(batch.map(async (url: RequestInfo | URL) => {
          try {
            const response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response.clone());  // clone() is necessary to prevent response body from being consumed
            }
          } catch (error) {
            console.error(`Failed to cache tile: ${url}`, error);
          }
        }));

        // Wait for 2 seconds before processing the next batch
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Define the batch size and call the function with your URLs array.
    const batchSize = 10;
    await processUrlsInBatches(urls, batchSize);

  } catch (error) {
    console.error('Failed to cache tiles:', error);
  }
}

export async function clearTileCache(): Promise<void> {
  try {
    // await tileStore.clear();
    const cache = await caches.open('map-tiles');
    await cache.keys().then(keys => {
      keys.forEach(key => {
        cache.delete(key);
      });
    });
  } catch (error) {
    console.error('Failed to clear tile cache:', error);
  }
}

export function createOfflineTileLayer(): L.TileLayer {
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: MAX_ZOOM,
    attribution: '© OpenStreetMap contributors',
    crossOrigin: true,
    className: 'map-tiles'
  });
}