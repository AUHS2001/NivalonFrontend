const DB_NAME = 'nivalon-dicom-cache';
const DB_VERSION = 1;
const META_STORE = 'meta';
const BLOBS_STORE = 'blobs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
      if (!db.objectStoreNames.contains(BLOBS_STORE)) {
        db.createObjectStore(BLOBS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function isCached(studyUID: string): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const req = store.get('current');
      req.onsuccess = () => {
        const meta = req.result;
        resolve(
          meta != null &&
          meta.studyInstanceUID === studyUID &&
          meta.complete === true
        );
      };
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function getAllCachedBlobs(): Promise<{ url: string; blob: Blob }[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(BLOBS_STORE, 'readonly');
      const store = tx.objectStore(BLOBS_STORE);
      const results: { url: string; blob: Blob }[] = [];
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) {
          results.push({ url: c.key as string, blob: c.value as Blob });
          c.continue();
        } else {
          resolve(results);
        }
      };
      cursor.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function cacheBlob(url: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(BLOBS_STORE, 'readwrite');
      const store = tx.objectStore(BLOBS_STORE);
      store.put(blob, url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // silently skip (QuotaExceededError etc.)
    });
  } catch {
    // IndexedDB unavailable — no-op
  }
}

export async function initCacheForStudy(studyUID: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction([META_STORE, BLOBS_STORE], 'readwrite');
      tx.objectStore(BLOBS_STORE).clear();
      tx.objectStore(META_STORE).clear();
      tx.objectStore(META_STORE).put(
        { studyInstanceUID: studyUID, complete: false },
        'current'
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // no-op
  }
}

export async function markCacheComplete(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      const req = store.get('current');
      req.onsuccess = () => {
        const meta = req.result;
        if (meta) {
          meta.complete = true;
          store.put(meta, 'current');
        }
        tx.oncomplete = () => resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {
    // no-op
  }
}

export async function getCachedBlob(url: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(BLOBS_STORE, 'readonly');
      const store = tx.objectStore(BLOBS_STORE);
      const req = store.get(url);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function isBlobCached(url: string): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(BLOBS_STORE, 'readonly');
      const store = tx.objectStore(BLOBS_STORE);
      const req = store.count(url);
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction([META_STORE, BLOBS_STORE], 'readwrite');
      tx.objectStore(META_STORE).clear();
      tx.objectStore(BLOBS_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // no-op
  }
}
