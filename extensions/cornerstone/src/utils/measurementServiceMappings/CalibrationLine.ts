import { getIsLocked } from './utils/getIsLocked';
import { getIsVisible } from './utils/getIsVisible';
import getSOPInstanceAttributes from './utils/getSOPInstanceAttributes';

const CalibrationLine = {
  toAnnotation: (_measurement: any) => {},

  toMeasurement: (
    csToolsEventDetail: any,
    displaySetService: any,
    _cornerstoneViewportService: any,
    getValueTypeFromToolType: any,
    _customizationService: any
  ) => {
    const { annotation } = csToolsEventDetail;
    const { metadata, data, annotationUID } = annotation;

    if (!metadata || !data) {
      console.warn('CalibrationLine tool: Missing metadata or data');
      return null;
    }

    const isLocked = getIsLocked(annotationUID);
    const isVisible = getIsVisible(annotationUID);

    const { toolName, referencedImageId, FrameOfReferenceUID } = metadata;

    const { SOPInstanceUID, SeriesInstanceUID, StudyInstanceUID } = getSOPInstanceAttributes(
      referencedImageId,
      displaySetService,
      annotation
    );

    let displaySet;
    if (SOPInstanceUID) {
      displaySet = displaySetService.getDisplaySetForSOPInstanceUID(SOPInstanceUID, SeriesInstanceUID);
    } else {
      displaySet = displaySetService.getDisplaySetsForSeries(SeriesInstanceUID)[0];
    }

    const { points, textBox } = data.handles;

    return {
      uid: annotationUID,
      SOPInstanceUID,
      FrameOfReferenceUID,
      points,
      textBox,
      isLocked,
      isVisible,
      metadata,
      referenceSeriesUID: SeriesInstanceUID,
      referenceStudyUID: StudyInstanceUID,
      referencedImageId,
      frameNumber: 1,
      toolName,
      displaySetInstanceUID: displaySet?.displaySetInstanceUID,
      label: data.label,
      displayText: {
        primary: [
          data.calibratedMm != null
            ? `Calibration: ${data.calibratedMm} mm`
            : 'Calibration Line',
        ],
        secondary: [],
      },
      data: data.cachedStats,
      type: getValueTypeFromToolType(toolName),
      getReport: () => ({
        columns: ['AnnotationType'],
        values: ['CalibrationLine'],
      }),
    };
  },
};

export default CalibrationLine;