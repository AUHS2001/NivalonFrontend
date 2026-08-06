import { LengthTool, utilities, annotation as csAnnotation, Enums as csToolsEnums } from '@cornerstonejs/tools';
import { callInputDialog } from '@ohif/extension-default';
import { utilities as coreUtilities, Enums as csEnums, eventTarget } from '@cornerstonejs/core';
import getActiveViewportEnabledElement from '../utils/getActiveViewportEnabledElement';

const { calibrateImageSpacing, triggerAnnotationRenderForViewportIds } = utilities;
const { calibratedPixelSpacingMetadataProvider } = coreUtilities;

/**
 * Calibration Line tool — draws a line, then asks the user for the real
 * physical length in mm and applies the correction to the image spacing.
 *
 * Enhancements over the base OHIF version:
 *  1. Multi-frame XA: calibration is stored for EVERY frame in the stack,
 *     not just the currently displayed frame.
 *  2. Bad input (NaN / zero / negative) is silently rejected.
 *  3. Label shows pixel distance (px) so user knows the drawn line length.
 *  4. After IMAGE_SPACING_CALIBRATED fires (image reload confirmed), ALL
 *     annotations are invalidated and re-rendered so every measurement
 *     panel entry reflects the new scale — including open-path SplineLength
 *     tools whose parent skips stats for open contours.
 */
class CalibrationLineTool extends LengthTool {
  static toolName = 'CalibrationLine';

  _renderingViewport: any;
  _lengthToolRenderAnnotation = this.renderAnnotation;

  renderAnnotation = (enabledElement, svgDrawingHelper) => {
    const { viewport } = enabledElement;
    this._renderingViewport = viewport;
    return this._lengthToolRenderAnnotation(enabledElement, svgDrawingHelper);
  };

  _getTextLines(data, _targetId) {
    const [canvasPoint1, canvasPoint2] = data.handles.points.map(p =>
      this._renderingViewport.worldToCanvas(p)
    );
    const lengthPx = Math.round(calculateLength2(canvasPoint1, canvasPoint2) * 100) / 100;
    return [`${lengthPx}px`];
  }
}

function calculateLength2(point1, point2) {
  const dx = point1[0] - point2[0];
  const dy = point1[1] - point2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function calculateLength3(pos1, pos2) {
  const dx = pos1[0] - pos2[0];
  const dy = pos1[1] - pos2[1];
  const dz = pos1[2] - pos2[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export default CalibrationLineTool;

// Module-level calibration scale, updated each time the user calibrates.
// Exported so mapping files can apply the correct scale² to contour tool areas.
let _currentCalibrationScale = 1;
export function getCalibrationScale(): number {
  return _currentCalibrationScale;
}

// Contour tools whose _calculateCachedStats does not divide area by scale².
// We correct cachedStats.area via an ANNOTATION_MODIFIED listener so the
// viewport label also shows the calibrated value (not just the panel).
const _contourTools = new Set(['PlanarFreehandROI', 'SplineROI', 'LivewireContour']);
let _correctionListenerAdded = false;

function _ensureCorrectionListener() {
  if (_correctionListenerAdded) return;
  _correctionListenerAdded = true;

  // 'ANNOTATION_MODIFIED' fires synchronously inside _calculateCachedStats,
  // before _getTextLines reads cachedStats. Correcting entry.area here means
  // the viewport label displays the calibrated area on the same render pass.
  eventTarget.addEventListener(csToolsEnums.Events.ANNOTATION_MODIFIED, (evt: any) => {
    if (_currentCalibrationScale === 1) return;
    const { annotation } = evt.detail || {};
    if (!annotation || !_contourTools.has(annotation.metadata?.toolName)) return;

    const cachedStats = annotation.data?.cachedStats;
    if (!cachedStats) return;

    const scaleSq = _currentCalibrationScale * _currentCalibrationScale;
    Object.keys(cachedStats).forEach(targetId => {
      const entry = cachedStats[targetId];
      if (entry?.area != null) {
        entry.area = entry.area / scaleSq;
      }
    });
  });
}

export function onCompletedCalibrationLine(
  servicesManager: AppTypes.ServicesManager,
  csToolsEvent
) {
  const { uiDialogService, viewportGridService } = servicesManager.services;

  const annotationAddedEventDetail = csToolsEvent.detail;
  const {
    annotation: { metadata, data: annotationData },
  } = annotationAddedEventDetail;
  const { referencedImageId: imageId } = metadata;
  const enabledElement = getActiveViewportEnabledElement(viewportGridService);
  const { viewport } = enabledElement;

  // World-space length of the drawn line.
  const length =
    Math.round(
      calculateLength3(annotationData.handles.points[0], annotationData.handles.points[1]) * 100
    ) / 100;

  const adjustCalibration = (newLength: number) => {
    // Guard against invalid input
    if (!newLength || newLength <= 0 || length <= 0) return;

    const spacingScale = newLength / length;
    const calibration = { type: 'User', scale: 1 / spacingScale };
    _currentCalibrationScale = calibration.scale;
    const renderingEngine = viewport.getRenderingEngine();
    const element = viewport.element;

    const frameRegex = /(\?|&)frame=\d+$/;

    const storeCalibration = () => {
      calibratedPixelSpacingMetadataProvider.add(imageId, calibration);
      if (frameRegex.test(imageId)) {
        const baseImageId = imageId.replace(frameRegex, '');
        const allIds: string[] = viewport.getImageIds ? viewport.getImageIds() : [imageId];
        allIds
          .filter(id => id.startsWith(baseImageId))
          .forEach(id => calibratedPixelSpacingMetadataProvider.add(id, calibration));
      }
    };

    const applyToAnnotations = () => {

      storeCalibration();

      const allVPs = renderingEngine.getViewports();

      // Permanently patch getImageData on every viewport to inject our calibration.
      // _calculateCachedStats reads imageData.calibration via getCalibratedLengthUnitsAndScale —
      // without this VolumeViewport returns calibration:undefined so scale stays at 1.
      //
      // We store the true original on vp._origGetImageData so repeated calibrations
      // always patch from the real original (not a previously patched version), and
      // new measurements drawn after calibration also pick up the correct scale.
      //
      // IMPORTANT: direct property assignment only — do NOT spread the data object.
      // Spreading triggers the scalarData getter which throws "No scalar data available"
      // on streaming volumes, and also loses all prototype methods the viewport needs.
      allVPs.forEach((vp: any) => {
        if (!vp._origGetImageData) {
          vp._origGetImageData = vp.getImageData.bind(vp);
        }
        // Forward all args so getImageData(volumeId) works correctly for volume viewports.
        // Use type 'manual' (not in CalibrationTypes enum) so the unit stays plain 'mm'.
        vp.getImageData = (...args: any[]) => {
          const data = vp._origGetImageData(...args);
          if (!data) return data;
          data.calibration = { type: 'manual', scale: calibration.scale };
          return data;
        };
      });

      // Invalidate all annotations so _calculateCachedStats re-runs.
      //
      // For contour tools (PlanarFreehandROI, SplineROI, LivewireContour):
      //   when annotation.invalidated=true they use a THROTTLED recalculation path.
      //   But when cachedStats[targetId].areaUnit/unit is null they use the DIRECT
      //   (non-throttled) path. Null those fields out so calibration applies immediately.
      //   The target ID keys are preserved so the tools know what to recalculate.
      //
      // For all other tools: annotation.invalidated=true is sufficient.
      const contourTools = new Set(['PlanarFreehandROI', 'SplineROI', 'LivewireContour']);
      const allAnnotations = csAnnotation.state.getAllAnnotations();
      (allAnnotations as any[]).forEach(ann => {
        ann.invalidated = true;
        if (contourTools.has(ann.metadata?.toolName) && ann.data?.cachedStats) {
          Object.keys(ann.data.cachedStats).forEach(targetId => {
            const entry = ann.data.cachedStats[targetId];
            if (entry) {
              entry.areaUnit = null;
              entry.unit = null;
            }
          });
        }
      });

      const viewportIds = allVPs.map((vp: any) => vp.id);
      if (viewportIds.length > 0) {
        triggerAnnotationRenderForViewportIds(viewportIds);
      }

    };

    // Store calibration metadata
    storeCalibration();

    // Register label-correction listener (safe to call multiple times — no-op after first).
    _ensureCorrectionListener();

    // Apply immediately — vp.calibration is already patched so _calculateCachedStats
    // will pick up the correct scale even before the async image reload completes.
    applyToAnnotations();

    // Also re-apply after image reload in case the reload overwrites our calibration.
    const onCalibrated = () => {
      element.removeEventListener(csEnums.Events.IMAGE_SPACING_CALIBRATED, onCalibrated);
      applyToAnnotations();
    };
    element.addEventListener(csEnums.Events.IMAGE_SPACING_CALIBRATED, onCalibrated);

    // Trigger async image reload (fires IMAGE_SPACING_CALIBRATED when done).
    calibrateImageSpacing(imageId, renderingEngine, calibration);
  };

  return new Promise((resolve, reject) => {
    if (!uiDialogService) {
      reject('UIDialogService is not initiated');
      return;
    }

    callInputDialog({
      uiDialogService,
      title: 'Calibration',
      placeholder: 'Actual Physical distance (mm)',
      defaultValue: `${length}`,
    })
      .then(newValue => {
        const parsed = Number.parseFloat(newValue);
        if (!isNaN(parsed) && parsed > 0) {
          adjustCalibration(parsed);
        }
        resolve(true);
      })
      .catch(() => resolve(false)); // user cancelled — do nothing
  });
}
