import { DisplaySetService, ViewportGridService } from '@ohif/core';
import { Enums, utilities } from '@cornerstonejs/core';

export const IMAGE_SLICE_SYNC_NAME = 'IMAGE_SLICE_SYNC';

interface SyncEntry {
  listeners: { element: HTMLElement; listener: EventListener }[];
  unsubscribeFns: Array<() => void>;
}

export const syncListeners: Map<string, SyncEntry> = new Map();

export default function toggleImageSliceSync({
  servicesManager,
  syncId,
}: withAppTypes) {
  syncId ||= IMAGE_SLICE_SYNC_NAME;

  if (syncListeners.has(syncId)) {
    return disableSync(syncId);
  }

  const { viewportGridService, displaySetService, cornerstoneViewportService } =
    servicesManager.services;

  // Register entry immediately so evaluator shows active
  const entry: SyncEntry = { listeners: [], unsubscribeFns: [] };
  syncListeners.set(syncId, entry);

  const attachListeners = () => {
    // Remove old element listeners
    entry.listeners.forEach(({ element, listener }) =>
      element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, listener)
    );
    entry.listeners = [];

    // Get ALL non-empty viewports that have a stack viewport
    const viewportIds = getAllStackViewportIds(
      viewportGridService,
      displaySetService,
      cornerstoneViewportService
    );

    if (viewportIds.length < 2) {
      return;
    }

    viewportIds.forEach(sourceId => {
      const sourceVp = cornerstoneViewportService.getCornerstoneViewport(sourceId);
      if (!sourceVp?.element) {
        return;
      }

      let isSyncing = false;

      const listener = () => {
        if (isSyncing) {
          return;
        }
        isSyncing = true;
        try {
          const sourceViewport = cornerstoneViewportService.getCornerstoneViewport(sourceId);
          if (!sourceViewport) {
            return;
          }
          const sourceIndex = sourceViewport.getCurrentImageIdIndex?.();
          if (sourceIndex == null || sourceIndex < 0) {
            return;
          }

          viewportIds.forEach(targetId => {
            if (targetId === sourceId) {
              return;
            }
            const targetViewport = cornerstoneViewportService.getCornerstoneViewport(targetId);
            if (!targetViewport?.element) {
              return;
            }
            if (targetViewport.getCurrentImageIdIndex?.() === sourceIndex) {
              return;
            }
            utilities
              .jumpToSlice(targetViewport.element, { imageIndex: sourceIndex })
              .catch(() => {});
          });
        } finally {
          setTimeout(() => {
            isSyncing = false;
          }, 50);
        }
      };

      sourceVp.element.addEventListener(Enums.Events.STACK_NEW_IMAGE, listener);
      entry.listeners.push({ element: sourceVp.element, listener });
    });
  };

  // Attach now
  attachListeners();

  // Re-attach on any viewport change
  const events = [
    viewportGridService.EVENTS.VIEWPORTS_READY,
    viewportGridService.EVENTS.LAYOUT_CHANGED,
    viewportGridService.EVENTS.GRID_STATE_CHANGED,
  ];

  events.forEach(event => {
    const sub = viewportGridService.subscribe(event, () => {
      if (!syncListeners.has(syncId)) {
        return;
      }
      // Small delay to let viewport elements fully mount
      setTimeout(attachListeners, 100);
    });
    entry.unsubscribeFns.push(() => sub.unsubscribe());
  });
}

function disableSync(syncId: string) {
  const entry = syncListeners.get(syncId);
  if (!entry) {
    return;
  }
  entry.listeners.forEach(({ element, listener }) =>
    element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, listener)
  );
  entry.unsubscribeFns.forEach(fn => fn());
  syncListeners.delete(syncId);
}

/**
 * Returns IDs of all loaded viewports that support stack scrolling
 */
function getAllStackViewportIds(
  viewportGridService: ViewportGridService,
  displaySetService: DisplaySetService,
  cornerstoneViewportService
): string[] {
  let { viewports } = viewportGridService.getState();
  viewports = [...viewports.values()];

  // Only viewports that have display sets loaded
  viewports = viewports.filter(
    vp => vp.displaySetInstanceUIDs?.length && vp.viewportId
  );

  return viewports
    .map(vp => vp.viewportId)
    .filter(viewportId => {
      const csVp = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      // Keep only viewports that support getCurrentImageIdIndex (stack viewports)
      return csVp && typeof csVp.getCurrentImageIdIndex === 'function';
    });
}
