import OHIF, { DicomMetadataStore } from '@ohif/core';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import * as cornerstone from '@cornerstonejs/core';
import FileLoaderService from '../routes/Local/fileLoaderService';
import { getCachedBlob, cacheBlob, markCacheComplete } from '../utils/dicomCache';
import { SERVER_URL } from '../../../../config/server';

interface SeriesLoadState {
  allUrls: string[];
  loadedUrls: Set<string>;
  isLoading: boolean;
  urlsFetched: boolean;
  studyUID: string;
}

const MAX_CONCURRENCY = 6;
const BATCH_SIZE = 100;
const seriesStates = new Map<string, SeriesLoadState>();
let abortController: AbortController | null = null;

function getToken(): string {
  return localStorage.getItem('token') || '';
}

async function fetchInstanceUrls(seriesUID: string): Promise<string[]> {
  const res = await fetch(
    `${SERVER_URL}/imaging/instances?series_instance_uid=${encodeURIComponent(seriesUID)}`,
    {
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      signal: abortController?.signal,
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  console.log('[lazyLoadService] /imaging/instances raw response:', JSON.stringify(json).substring(0, 500));

  const payload = json.data;
  let urls: string[] = [];
  if (Array.isArray(payload)) urls = payload;
  else if (payload?.items && Array.isArray(payload.items)) urls = payload.items;
  else if (payload?.instance_urls && Array.isArray(payload.instance_urls)) urls = payload.instance_urls;
  else if (Array.isArray(json.instance_urls)) urls = json.instance_urls;
  else if (Array.isArray(json)) urls = json;
  else {
    console.warn('[lazyLoadService] Unexpected /imaging/instances response:', json);
    return [];
  }
  console.log(`[lazyLoadService] Parsed ${urls.length} URLs, first:`, urls[0]);
  return urls;
}

async function downloadAndProcessBlob(
  url: string,
  studyUID: string,
  signal?: AbortSignal
): Promise<{ seriesUID: string; studyUID: string } | null> {
  let blob: Blob | null = null;

  blob = await getCachedBlob(url);

  if (!blob) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { signal, credentials: 'include' });
        if (res.status === 403) {
          // Cookie may have expired — refresh and retry
          console.warn(`[lazyLoadService] 403 on ${url}, refreshing cookies...`);
          try {
            await fetch(`${SERVER_URL}/imaging/studies`, {
              headers: { Authorization: `Bearer ${getToken()}` },
              credentials: 'include',
            });
          } catch (_) {}
          const retry = await fetch(url, { signal, credentials: 'include' });
          if (!retry.ok) throw new Error(`HTTP ${retry.status} after cookie refresh`);
          blob = await retry.blob();
          cacheBlob(url, blob);
          break;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        blob = await res.blob();
        cacheBlob(url, blob);
        break;
      } catch (err) {
        console.error(`[lazyLoadService] Attempt ${attempt + 1}/3 failed for ${url}:`, err);
        if (signal?.aborted) return null;
        if (attempt === 2) return null;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  if (!blob) return null;

  const fileName = url.split('/').pop();
  const file = new File([blob], fileName || 'dicom.dcm', {
    type: blob.type || 'application/dicom',
  });

  try {
    const svc = new FileLoaderService(file);
    const imageId = svc.addFile(file);
    const image = await svc.loadFile(file, imageId);
    const dataset = await svc.getDataset(image, imageId);
    dataset.imageId = imageId;

    DicomMetadataStore.addInstance(dataset);
    const metadataProvider = OHIF.classes.MetadataProvider;
    metadataProvider.addImageIdToUIDs(imageId, {
      StudyInstanceUID: dataset.StudyInstanceUID,
      SeriesInstanceUID: dataset.SeriesInstanceUID,
      SOPInstanceUID: dataset.SOPInstanceUID,
    });

    return {
      seriesUID: dataset.SeriesInstanceUID,
      studyUID: dataset.StudyInstanceUID,
    };
  } catch (err) {
    console.warn('[lazyLoadService] Failed to process DICOM blob:', err);
    return null;
  }
}

/**
 * Run async tasks with a concurrency limit.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      try {
        results[idx] = await tasks[idx]();
      } catch {
        results[idx] = null as T;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Download a batch of DICOM files and add them to the metadata store.
 * @param silent - If true, do NOT broadcast INSTANCES_ADDED event (caller will do it later)
 */
async function _loadBatch(
  seriesUID: string,
  batchSize: number = BATCH_SIZE,
  silent: boolean = false
): Promise<{ loaded: number; seriesUID: string | null; studyUID: string | null }> {
  const state = seriesStates.get(seriesUID);
  if (!state || state.isLoading) return { loaded: 0, seriesUID: null, studyUID: null };

  const remaining = state.allUrls.filter(url => !state.loadedUrls.has(url));
  if (remaining.length === 0) return { loaded: 0, seriesUID: null, studyUID: null };

  state.isLoading = true;
  const batch = remaining.slice(0, batchSize);

  let groupSeriesUID: string | null = null;
  let groupStudyUID: string | null = null;
  let loaded = 0;

  const tasks = batch.map(url => async () => {
    try {
      const result = await downloadAndProcessBlob(url, state.studyUID, abortController?.signal);
      if (result) {
        state.loadedUrls.add(url);
        if (!groupSeriesUID) {
          groupSeriesUID = result.seriesUID;
          groupStudyUID = result.studyUID;
        }
        loaded++;

        // Per-file progress update
        const totalUrls = state.allUrls.length;
        const loadedCount = state.loadedUrls.size;
        window.dispatchEvent(
          new CustomEvent('dicom-viewport-loading-progress', {
            detail: {
              SeriesInstanceUID: seriesUID,
              progress: totalUrls > 0 ? loadedCount / totalUrls : 1,
            },
          })
        );
      }
    } catch {
      // Skip failed files
    }
  });

  await runWithConcurrency(tasks, MAX_CONCURRENCY);
  state.isLoading = false;

  // Only broadcast if not silent (scroll-triggered batches broadcast; loadSeriesFully does not)
  if (!silent && groupSeriesUID && groupStudyUID) {
    const { EVENTS } = DicomMetadataStore;
    DicomMetadataStore._broadcastEvent(EVENTS.INSTANCES_ADDED, {
      StudyInstanceUID: groupStudyUID,
      SeriesInstanceUID: groupSeriesUID,
      madeInClient: false,
    });
  }

  // Emit progress event for the sidebar
  const totalUrls = state.allUrls.length;
  const loadedCount = state.loadedUrls.size;
  window.dispatchEvent(
    new CustomEvent('dicom-series-loading', {
      detail: {
        SeriesInstanceUID: seriesUID,
        progress: totalUrls > 0 ? loadedCount / totalUrls : 1,
      },
    })
  );

  console.log(`[lazyLoadService] Batch done for ${seriesUID}: ${loadedCount}/${totalUrls} (${loaded} this batch, silent=${silent})`);

  if (isSeriesFullyLoaded(seriesUID)) {
    checkAllComplete();
  }

  return { loaded, seriesUID: groupSeriesUID, studyUID: groupStudyUID };
}

function checkAllComplete(): void {
  for (const [, state] of seriesStates) {
    if (!state.urlsFetched) return;
    if (state.loadedUrls.size < state.allUrls.length) return;
  }
  markCacheComplete().catch(() => {});
}

// --- Public API ---

export async function fetchInitialBatch(
  seriesUID: string,
  count: number = 10
): Promise<string[]> {
  try {
    const urls = await fetchInstanceUrls(seriesUID);
    if (!Array.isArray(urls)) return [];
    return urls.slice(0, count);
  } catch (err) {
    console.warn(`[lazyLoadService] fetchInitialBatch failed for ${seriesUID}:`, err);
    return [];
  }
}

/**
 * Register a series and load the next batch (with broadcast).
 * Used for scroll-triggered loading and initial registration.
 */
export async function startSeriesLoad(
  seriesUID: string,
  studyUID: string,
  preloadedUrls?: string[]
): Promise<void> {
  if (!abortController) {
    abortController = new AbortController();
  }

  let state = seriesStates.get(seriesUID);
  if (state?.urlsFetched) {
    try {
      while (state.isLoading) {
        await new Promise(r => setTimeout(r, 200));
      }
      if (!isSeriesFullyLoaded(seriesUID)) {
        await _loadBatch(seriesUID);
      }
    } catch (err) {
      console.warn(`[lazyLoadService] _loadBatch error for ${seriesUID}:`, err);
    }
    return;
  }

  state = {
    allUrls: [],
    loadedUrls: new Set<string>(),
    isLoading: false,
    urlsFetched: false,
    studyUID,
  };
  seriesStates.set(seriesUID, state);

  try {
    const urls = await fetchInstanceUrls(seriesUID);
    if (!Array.isArray(urls) || urls.length === 0) {
      console.warn(`[lazyLoadService] No instance URLs returned for series ${seriesUID}`);
      return;
    }
    state.allUrls = urls;
    state.urlsFetched = true;

    console.log(`[lazyLoadService] Registered series ${seriesUID}: ${urls.length} total URLs`);

    const preloadedCount = preloadedUrls?.length || 0;
    if (preloadedCount > 0) {
      urls.slice(0, preloadedCount).forEach(u => state.loadedUrls.add(u));
    }

    if (isSeriesFullyLoaded(seriesUID)) {
      console.log(`[lazyLoadService] Series ${seriesUID} already fully loaded`);
      return;
    }

    // Load one batch with broadcast (for scroll-triggered viewport updates)
    await _loadBatch(seriesUID);
  } catch (err) {
    console.error(`[lazyLoadService] Failed to start loading series ${seriesUID}:`, err);
  }
}

/**
 * Load ALL remaining instances for a series, then broadcast ONCE.
 * This prevents volume viewports from crashing on partial data.
 * Used for drag-and-drop and double-click.
 */
export async function loadSeriesFully(
  seriesUID: string,
  studyUID: string
): Promise<void> {
  console.log(`[lazyLoadService] loadSeriesFully called for ${seriesUID}`);

  // Show loading overlay immediately (0%) before any async work
  window.dispatchEvent(
    new CustomEvent('dicom-viewport-loading-start', {
      detail: { SeriesInstanceUID: seriesUID },
    })
  );

  if (!abortController) {
    abortController = new AbortController();
  }

  let state = seriesStates.get(seriesUID);

  // If not registered yet, register without loading any batch
  if (!state?.urlsFetched) {
    state = {
      allUrls: [],
      loadedUrls: new Set<string>(),
      isLoading: false,
      urlsFetched: false,
      studyUID,
    };
    seriesStates.set(seriesUID, state);

    try {
      const urls = await fetchInstanceUrls(seriesUID);
      if (!Array.isArray(urls) || urls.length === 0) {
        console.warn(`[lazyLoadService] loadSeriesFully: No URLs for ${seriesUID}`);
        window.dispatchEvent(
          new CustomEvent('dicom-viewport-loading-complete', {
            detail: { SeriesInstanceUID: seriesUID },
          })
        );
        return;
      }
      state.allUrls = urls;
      state.urlsFetched = true;
      console.log(`[lazyLoadService] loadSeriesFully registered ${seriesUID}: ${urls.length} URLs`);
    } catch (err) {
      console.error(`[lazyLoadService] loadSeriesFully: Failed to fetch URLs for ${seriesUID}:`, err);
      window.dispatchEvent(
        new CustomEvent('dicom-viewport-loading-complete', {
          detail: { SeriesInstanceUID: seriesUID },
        })
      );
      return;
    }
  } else {
    // Already registered, wait for any in-progress batch
    while (state.isLoading) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (isSeriesFullyLoaded(seriesUID)) {
    console.log(`[lazyLoadService] loadSeriesFully: ${seriesUID} already complete`);
    window.dispatchEvent(
      new CustomEvent('dicom-viewport-loading-complete', {
        detail: { SeriesInstanceUID: seriesUID },
      })
    );
    return;
  }

  let lastGroupSeriesUID: string | null = null;
  let lastGroupStudyUID: string | null = null;

  try {
    // Load ALL batches silently (no INSTANCES_ADDED broadcast per batch)
    let retries = 0;
    while (!isSeriesFullyLoaded(seriesUID)) {
      if (state.isLoading) {
        await new Promise(r => setTimeout(r, 200));
        continue;
      }

      const result = await _loadBatch(seriesUID, BATCH_SIZE, true); // silent = true

      if (result.loaded === 0) {
        retries++;
        if (retries >= 3) {
          console.warn(`[lazyLoadService] loadSeriesFully: Giving up for ${seriesUID}. Loaded: ${state.loadedUrls.size}/${state.allUrls.length}`);
          break;
        }
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      retries = 0;
      if (result.seriesUID) lastGroupSeriesUID = result.seriesUID;
      if (result.studyUID) lastGroupStudyUID = result.studyUID;

      const progress = state.allUrls.length > 0
        ? state.loadedUrls.size / state.allUrls.length
        : 1;
      window.dispatchEvent(
        new CustomEvent('dicom-viewport-loading-progress', {
          detail: { SeriesInstanceUID: seriesUID, progress },
        })
      );
    }

    console.log(`[lazyLoadService] loadSeriesFully done for ${seriesUID}: ${state.loadedUrls.size}/${state.allUrls.length}`);

    // ONE broadcast after ALL instances are loaded — this creates/updates the display set
    // and triggers a single clean viewport refresh with complete data
    const broadcastStudy = lastGroupStudyUID || state.studyUID;
    const broadcastSeries = lastGroupSeriesUID || seriesUID;
    const { EVENTS } = DicomMetadataStore;
    DicomMetadataStore._broadcastEvent(EVENTS.INSTANCES_ADDED, {
      StudyInstanceUID: broadcastStudy,
      SeriesInstanceUID: broadcastSeries,
      madeInClient: false,
    });
  } finally {
    window.dispatchEvent(
      new CustomEvent('dicom-viewport-loading-complete', {
        detail: { SeriesInstanceUID: seriesUID },
      })
    );
  }
}

export async function loadNextBatch(seriesUID: string): Promise<void> {
  const state = seriesStates.get(seriesUID);
  if (!state || state.isLoading || isSeriesFullyLoaded(seriesUID)) return;
  await _loadBatch(seriesUID);
}

export function isSeriesFullyLoaded(seriesUID: string): boolean {
  const state = seriesStates.get(seriesUID);
  if (!state || !state.urlsFetched) return false;
  return state.loadedUrls.size >= state.allUrls.length;
}

/**
 * Clean up all in-memory state from previous studies to prevent memory buildup.
 * Call this before loading a new study.
 */
export function cleanupPreviousStudy(): void {
  // 1. Abort in-flight downloads and clear series tracking
  cancelAll();

  // 2. Purge cornerstone image/volume cache (frees GPU + CPU memory)
  try {
    cornerstone.cache.purgeCache();
  } catch (err) {
    console.warn('[lazyLoadService] Failed to purge cornerstone cache:', err);
  }

  // 3. Clear wadouri file manager (frees accumulated File/Blob objects)
  try {
    const fm = dicomImageLoader.wadouri.fileManager;
    if (fm && fm.purge) {
      fm.purge();
    } else if (fm && Array.isArray(fm.files)) {
      fm.files.length = 0;
    }
  } catch (err) {
    console.warn('[lazyLoadService] Failed to clear fileManager:', err);
  }

  // 4. Clear DicomMetadataStore (removes all study/series/instance metadata)
  try {
    const store = DicomMetadataStore as any;
    if (store._model) {
      store._model.studies = [];
    }
  } catch (err) {
    console.warn('[lazyLoadService] Failed to clear DicomMetadataStore:', err);
  }

  console.log('[lazyLoadService] Previous study cleaned up');
}

export function cancelAll(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  seriesStates.clear();
}

// --- Event listener for scroll-triggered loading ---

function handleLazyLoadMore(event: Event): void {
  const detail = (event as CustomEvent).detail;
  if (!detail?.viewportId) return;

  for (const [seriesUID] of seriesStates) {
    if (!isSeriesFullyLoaded(seriesUID)) {
      loadNextBatch(seriesUID).catch(err =>
        console.warn('[lazyLoadService] loadNextBatch error:', err)
      );
    }
  }
}

// --- Event listener for series load requests (from extensions that can't import directly) ---

function handleLazyLoadSeries(event: Event): void {
  const detail = (event as CustomEvent).detail;
  if (!detail?.seriesUID || !detail?.studyUID) return;
  loadSeriesFully(detail.seriesUID, detail.studyUID)
    .then(() => {
      detail.onComplete?.();
    })
    .catch(err =>
      console.warn('[lazyLoadService] loadSeriesFully error:', err)
    );
}

// Register global listeners
if (typeof window !== 'undefined') {
  window.addEventListener('dicom-lazy-load-more', handleLazyLoadMore);
  window.addEventListener('dicom-lazy-load-series', handleLazyLoadSeries);
}

export default {
  fetchInitialBatch,
  startSeriesLoad,
  loadSeriesFully,
  loadNextBatch,
  isSeriesFullyLoaded,
  cancelAll,
};
