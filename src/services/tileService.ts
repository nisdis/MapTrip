/** Empties the offline map-tile cache (filled by the service worker as you browse). */
export async function clearTileCache(): Promise<void> {
  try {
    const cache = await caches.open('map-tiles');
    const keys = await cache.keys();
    await Promise.all(keys.map((key) => cache.delete(key)));
  } catch (error) {
    console.error('Failed to clear tile cache:', error);
    throw error;
  }
}
