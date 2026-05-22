/**
 * Adds a small red circle at the center of the CrosshairsTool intersection
 * on each DICOM viewport. Uses its OWN SVG overlay (not Cornerstone's SVG layer)
 * so that Cornerstone's SVG cleanup can't remove it.
 */
import { getEnabledElement } from '@cornerstonejs/core';
import { ToolGroupManager } from '@cornerstonejs/tools';

const CIRCLE_RADIUS = 6;
const CIRCLE_COLOR = 'rgb(255, 0, 0)';
const OVERLAY_CLASS = 'crosshair-center-overlay';
const CIRCLE_CLASS = 'crosshair-center-circle';

let listening = false;

/** Get or create our own SVG overlay on top of the viewport element */
function getOverlay(element: HTMLElement): SVGSVGElement {
  let overlay = element.querySelector(`.${OVERLAY_CLASS}`) as SVGSVGElement | null;
  if (!overlay) {
    const svgns = 'http://www.w3.org/2000/svg';
    overlay = document.createElementNS(svgns, 'svg') as SVGSVGElement;
    overlay.setAttribute('class', OVERLAY_CLASS);
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '200';
    overlay.style.overflow = 'hidden';

    // Ensure parent is a positioning context
    const pos = getComputedStyle(element).position;
    if (pos === 'static') {
      element.style.position = 'relative';
    }

    element.appendChild(overlay);

    // Add circle inside our overlay
    const circle = document.createElementNS(svgns, 'circle');
    circle.setAttribute('class', CIRCLE_CLASS);
    circle.setAttribute('r', String(CIRCLE_RADIUS));
    circle.setAttribute('stroke', CIRCLE_COLOR);
    circle.setAttribute('fill', 'transparent');
    circle.setAttribute('stroke-width', '1');
    overlay.appendChild(circle);
  }
  return overlay;
}

function handleImageRendered(evt: any) {
  try {
    const detail = evt.detail || {};
    const { element, viewportId, renderingEngineId } = detail;
    if (!element || !viewportId) return;

    const toolGroup = ToolGroupManager.getToolGroupForViewport(viewportId, renderingEngineId) as any;
    if (!toolGroup || !toolGroup.hasTool('Crosshairs')) return;

    const toolInstance = toolGroup.getToolInstance('Crosshairs');
    if (!toolInstance || toolInstance.mode !== 'Active') {
      removeOverlay(element);
      return;
    }

    const toolCenter = toolInstance.toolCenter;
    if (!toolCenter) return;

    const ee = getEnabledElement(element);
    if (!ee?.viewport) return;

    const canvasCoords = ee.viewport.worldToCanvas(toolCenter);
    if (!canvasCoords) return;

    const overlay = getOverlay(element);
    const circle = overlay.querySelector(`.${CIRCLE_CLASS}`);
    if (circle) {
      circle.setAttribute('cx', String(canvasCoords[0]));
      circle.setAttribute('cy', String(canvasCoords[1]));
    }
  } catch {
    // Silently ignore
  }
}

function removeOverlay(element: HTMLElement) {
  const overlay = element.querySelector(`.${OVERLAY_CLASS}`);
  if (overlay) overlay.remove();
}

const IMAGE_RENDERED = 'CORNERSTONE_IMAGE_RENDERED';
const ANNOTATION_RENDERED = 'CORNERSTONE_TOOLS_ANNOTATION_RENDERED';

export function initCrosshairCenterCircle() {
  if (listening) return;
  listening = true;
  // IMAGE_RENDERED: fires on scroll / volume render
  // ANNOTATION_RENDERED: fires on crosshair drag / annotation updates
  document.addEventListener(IMAGE_RENDERED, handleImageRendered, true);
  document.addEventListener(ANNOTATION_RENDERED, handleImageRendered, true);
}

export function destroyCrosshairCenterCircle() {
  if (!listening) return;
  listening = false;
  document.removeEventListener(IMAGE_RENDERED, handleImageRendered, true);
  document.removeEventListener(ANNOTATION_RENDERED, handleImageRendered, true);
  document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach(el => el.remove());
}
