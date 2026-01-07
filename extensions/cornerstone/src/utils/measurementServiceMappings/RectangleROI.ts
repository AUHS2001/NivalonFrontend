import SUPPORTED_TOOLS from './constants/supportedTools';
import { getDisplayUnit } from './utils';
import getSOPInstanceAttributes from './utils/getSOPInstanceAttributes';
import { utils } from '@ohif/core';
import { getStatisticDisplayString } from './utils/getValueDisplayString';
import { getIsLocked } from './utils/getIsLocked';
import { getIsVisible } from './utils/getIsVisible';
import { metaData } from '@cornerstonejs/core';

const RectangleROI = {
  toAnnotation: measurement => {},
  toMeasurement: (
    csToolsEventDetail,
    displaySetService,
    CornerstoneViewportService,
    getValueTypeFromToolType,
    customizationService
  ) => {
    const { annotation } = csToolsEventDetail;
    const { metadata, data, annotationUID } = annotation;
    const isLocked = getIsLocked(annotationUID);
    const isVisible = getIsVisible(annotationUID);

    if (!metadata || !data) {
      console.warn('Rectangle ROI tool: Missing metadata or data');
      return null;
    }

    const { toolName, referencedImageId, FrameOfReferenceUID } = metadata;
    const validToolType = SUPPORTED_TOOLS.includes(toolName);

    if (!validToolType) {
      throw new Error('Tool not supported');
    }

    const { SOPInstanceUID, SeriesInstanceUID, StudyInstanceUID } = getSOPInstanceAttributes(
      referencedImageId,
      displaySetService,
      annotation
    );

    let displaySet;

    if (SOPInstanceUID) {
      displaySet = displaySetService.getDisplaySetForSOPInstanceUID(
        SOPInstanceUID,
        SeriesInstanceUID
      );
    } else {
      displaySet = displaySetService.getDisplaySetsForSeries(SeriesInstanceUID)[0];
    }

    const { points, textBox } = data.handles;

    // Calculate pixel coordinates and rectangle dimensions
    const pixelPoints = calculatePixelCoordinates(points, referencedImageId);
    const rectanglePixelDimensions = calculateRectanglePixelDimensions(pixelPoints);

    console.log('RectangleROI Pixel calculation:', { pixelPoints, rectanglePixelDimensions });

    const mappedAnnotations = getMappedAnnotations(annotation, displaySetService);

    const displayText = getDisplayText(mappedAnnotations, displaySet, customizationService, rectanglePixelDimensions, pixelPoints);

    const getReport = () =>
      _getReport(mappedAnnotations, points, FrameOfReferenceUID, customizationService);

    const measurementData = {
      uid: annotationUID,
      SOPInstanceUID,
      FrameOfReferenceUID,
      points,
      textBox,
      metadata,
      referenceSeriesUID: SeriesInstanceUID,
      referenceStudyUID: StudyInstanceUID,
      referencedImageId,
      frameNumber: mappedAnnotations[0]?.frameNumber || 1,
      toolName: metadata.toolName,
      displaySetInstanceUID: displaySet.displaySetInstanceUID,
      label: data.label,
      displayText: displayText,
      data: data.cachedStats,
      type: getValueTypeFromToolType(toolName),
      getReport,
      isLocked,
      isVisible,
    };

    if (pixelPoints && pixelPoints.length >= 4) {
      measurementData.pixelPoints = pixelPoints;
    }
    if (rectanglePixelDimensions) {
      measurementData.pixelDistance = rectanglePixelDimensions;
    }

    return measurementData;
  },
};

function getMappedAnnotations(annotation, displaySetService) {
  const { metadata, data } = annotation;
  const { cachedStats } = data;
  const { referencedImageId } = metadata;
  const targets = Object.keys(cachedStats);

  if (!targets.length) {
    return [];
  }

  const annotations = [];

  const addedModalities = new Set();
  Object.keys(cachedStats).forEach(targetId => {
    const targetStats = cachedStats[targetId];

    const { SOPInstanceUID, SeriesInstanceUID, frameNumber } = getSOPInstanceAttributes(
      referencedImageId,
      displaySetService,
      annotation
    );

    const displaySet = displaySetService.getDisplaySetsForSeries(SeriesInstanceUID)[0];

    const { SeriesNumber } = displaySet;
    const { mean, stdDev, max, area, Modality, modalityUnit, areaUnit } = targetStats;

    // Skip if we've already added this modality
    if (Modality && addedModalities.has(Modality)) {
      return;
    }

    // Add modality to the set if it exists
    if (Modality) {
      addedModalities.add(Modality);
    }

    annotations.push({
      SeriesInstanceUID,
      SOPInstanceUID,
      SeriesNumber,
      frameNumber,
      Modality,
      unit: modalityUnit,
      mean,
      stdDev,
      metadata,
      max,
      area,
      areaUnit,
    });
  });

  return annotations;
}

/*
This function is used to convert the measurement data to a format that is
suitable for the report generation (e.g. for the csv report). The report
returns a list of columns and corresponding values.
*/
function _getReport(mappedAnnotations, points, FrameOfReferenceUID, customizationService) {
  const columns = [];
  const values = [];

  // Add Type
  columns.push('AnnotationType');
  values.push('Cornerstone:RectangleROI');

  mappedAnnotations.forEach(annotation => {
    const { mean, stdDev, max, area, unit, areaUnit } = annotation;

    if (!mean || !unit || !max || !area) {
      return;
    }

    columns.push(`Maximum`, `Mean`, `Std Dev`, 'Pixel Unit', `Area`, 'Unit');
    values.push(max, mean, stdDev, unit, area, areaUnit);
  });

  if (FrameOfReferenceUID) {
    columns.push('FrameOfReferenceUID');
    values.push(FrameOfReferenceUID);
  }

  if (points) {
    columns.push('points');
    // points has the form of [[x1, y1, z1], [x2, y2, z2], ...]
    // convert it to string of [[x1 y1 z1];[x2 y2 z2];...]
    // so that it can be used in the csv report
    values.push(points.map(p => p.join(' ')).join(';'));
  }

  return {
    columns,
    values,
  };
}

function calculatePixelCoordinates(points, referencedImageId) {
  try {
    // Get the DICOM metadata
    const imagePlaneModule = metaData.get('imagePlaneModule', referencedImageId);

    console.log('RectangleROI ImagePlaneModule:', imagePlaneModule);

    if (!imagePlaneModule) {
      console.warn('No image plane metadata found for pixel conversion');
      return null;
    }

    const {
      imagePositionPatient,
      rowCosines,
      columnCosines,
      pixelSpacing
    } = imagePlaneModule;

    console.log('RectangleROI Metadata values:', {
      imagePositionPatient,
      rowCosines,
      columnCosines,
      pixelSpacing
    });

    // Convert each world point to pixel coordinates
    const pixelPoints = points.map(worldPoint => {
      // Vector from image origin to point
      const dx = worldPoint[0] - imagePositionPatient[0];
      const dy = worldPoint[1] - imagePositionPatient[1];
      const dz = worldPoint[2] - imagePositionPatient[2];

      console.log('RectangleROI World point:', worldPoint, 'Vector:', {dx, dy, dz});

      // Dot product with column direction (usually [1,0,0])
      const pixelX = (dx * columnCosines[0] + dy * columnCosines[1] + dz * columnCosines[2]) / pixelSpacing[0];

      // Dot product with row direction (usually [0,1,0])
      const pixelY = (dx * rowCosines[0] + dy * rowCosines[1] + dz * rowCosines[2]) / pixelSpacing[1];

      console.log('RectangleROI Pixel calculated:', {pixelX, pixelY});

      return [Math.round(pixelX), Math.round(pixelY)];
    });

    console.log('RectangleROI Final pixel points:', pixelPoints);
    return pixelPoints;

  } catch (error) {
    console.warn('Could not calculate pixel coordinates for RectangleROI tool:', error);
    return null;
  }
}

function calculateRectanglePixelDimensions(pixelPoints) {
  if (!pixelPoints || pixelPoints.length < 4) return null;

  // RectangleROI typically has 4 points: [topLeft, topRight, bottomLeft, bottomRight]
  // representing the rectangle corners
  const [topLeft, topRight, bottomLeft, bottomRight] = pixelPoints;

  // Calculate width (distance between left and right points)
  const width = Math.sqrt(
    Math.pow(topRight[0] - topLeft[0], 2) + Math.pow(topRight[1] - topLeft[1], 2)
  );

  // Calculate height (distance between top and bottom points)
  const height = Math.sqrt(
    Math.pow(bottomLeft[0] - topLeft[0], 2) + Math.pow(bottomLeft[1] - topLeft[1], 2)
  );

  // Calculate center point
  const centerX = (topLeft[0] + topRight[0] + bottomLeft[0] + bottomRight[0]) / 4;
  const centerY = (topLeft[1] + topRight[1] + bottomLeft[1] + bottomRight[1]) / 4;

  // Calculate diagonal distance
  const diagonal = Math.sqrt(
    Math.pow(bottomRight[0] - topLeft[0], 2) + Math.pow(bottomRight[1] - topLeft[1], 2)
  );

  const dimensions = {
    width: Math.round(width),
    height: Math.round(height),
    diagonal: Math.round(diagonal),
    center: [Math.round(centerX), Math.round(centerY)],
    // Calculate pixel area (width × height)
    pixelArea: Math.round(width * height),
    // Calculate perimeter
    perimeter: Math.round(2 * (width + height))
  };

  console.log('RectangleROI Pixel dimensions calculated:', dimensions);
  return dimensions;
}

function getDisplayText(mappedAnnotations, displaySet, customizationService, rectanglePixelDimensions = null, pixelPoints = null) {
  const displayText = {
    primary: [],
    secondary: [],
  };

  if (!mappedAnnotations || !mappedAnnotations.length) {
    return displayText;
  }

  // Area is the same for all series
  const { area, SOPInstanceUID, frameNumber, areaUnit, SeriesNumber } = mappedAnnotations[0];

  const instance = displaySet.instances.find(image => image.SOPInstanceUID === SOPInstanceUID);

  let InstanceNumber;
  if (instance) {
    InstanceNumber = instance.InstanceNumber;
  }

  const instanceText = InstanceNumber ? ` I: ${InstanceNumber}` : '';
  const frameText = displaySet.isMultiFrame ? ` F: ${frameNumber}` : '';

  // Area sometimes becomes undefined if `preventHandleOutsideImage` is off.
  const roundedArea = utils.roundNumber(area || 0, 2);

  if (pixelPoints && pixelPoints.length >= 4 && rectanglePixelDimensions !== null) {
    const { width, height, pixelArea, center } = rectanglePixelDimensions;

    displayText.primary.push(`${roundedArea} ${getDisplayUnit(areaUnit)}`);
    displayText.primary.push(`Pixel Area: ${pixelArea} px²`);
    displayText.primary.push(`Size: ${width}×${height} px`);

    displayText.secondary.push(`Center: (${center[0]},${center[1]})`);
    displayText.secondary.push(`S: ${SeriesNumber}${instanceText}${frameText}`);

    console.log('RectangleROI Displaying with pixel data');
  } else {
    // Fallback to original display
    displayText.primary.push(`${roundedArea} ${getDisplayUnit(areaUnit)}`);

    // Todo: we need a better UI for displaying all these information
    mappedAnnotations.forEach(mappedAnnotation => {
      const { unit, max } = mappedAnnotation;

      const maxStr = getStatisticDisplayString(max, unit, 'max');

      displayText.primary.push(maxStr);
      displayText.secondary.push(`S: ${SeriesNumber}${instanceText}${frameText}`);
    });

    console.log('RectangleROI Displaying without pixel data - fallback');
  }

  return displayText;
}

export default RectangleROI;
