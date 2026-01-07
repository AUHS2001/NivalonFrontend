import SUPPORTED_TOOLS from './constants/supportedTools';
import { getDisplayUnit } from './utils';
import getSOPInstanceAttributes from './utils/getSOPInstanceAttributes';
import { utils } from '@ohif/core';
import { getStatisticDisplayString } from './utils/getValueDisplayString';
import { getIsLocked } from './utils/getIsLocked';
import { getIsVisible } from './utils/getIsVisible';
import { metaData } from '@cornerstonejs/core';

const CircleROI = {
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
      console.warn('CircleROI tool: Missing metadata or data');
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

    // Calculate pixel coordinates and circle dimensions
    const pixelPoints = calculatePixelCoordinates(points, referencedImageId);
    const circlePixelDimensions = calculateCirclePixelDimensions(pixelPoints);

    console.log('CircleROI Pixel calculation:', { pixelPoints, circlePixelDimensions });

    const mappedAnnotations = getMappedAnnotations(annotation, displaySetService);

    const displayText = getDisplayText(mappedAnnotations, displaySet, circlePixelDimensions, pixelPoints);
    const getReport = () =>
      _getReport(mappedAnnotations, points, FrameOfReferenceUID, customizationService);

    const measurementData = {
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
      frameNumber: mappedAnnotations[0]?.frameNumber || 1,
      toolName: metadata.toolName,
      displaySetInstanceUID: displaySet.displaySetInstanceUID,
      label: data.label,
      displayText: displayText,
      data: data.cachedStats,
      type: getValueTypeFromToolType(toolName),
      getReport,
    };

    if (pixelPoints && pixelPoints.length >= 2) {
      measurementData.pixelPoints = pixelPoints;
    }
    if (circlePixelDimensions) {
      measurementData.pixelDistance = circlePixelDimensions;
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
    const { mean, stdDev, max, area, Modality, areaUnit, modalityUnit, perimeter, radiusUnit } =
      targetStats;

    if (Modality && addedModalities.has(Modality)) {
      return;
    }

    addedModalities.add(Modality);

    annotations.push({
      SeriesInstanceUID,
      SOPInstanceUID,
      SeriesNumber,
      frameNumber,
      Modality,
      unit: modalityUnit,
      mean,
      stdDev,
      max,
      area,
      areaUnit,
      perimeter,
      radiusUnit,
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
  values.push('Cornerstone:CircleROI');

  mappedAnnotations.forEach(annotation => {
    const { mean, stdDev, max, area, unit, areaUnit } = annotation;

    if (!mean || !unit || !max || !area) {
      return;
    }

    columns.push(`max (${unit})`, `mean (${unit})`, `std (${unit})`, 'Area', 'Unit');
    values.push(max, mean, stdDev, area, areaUnit);
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

    console.log('CircleROI ImagePlaneModule:', imagePlaneModule);

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

    console.log('CircleROI Metadata values:', {
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

      console.log('CircleROI World point:', worldPoint, 'Vector:', {dx, dy, dz});

      // Dot product with column direction (usually [1,0,0])
      const pixelX = (dx * columnCosines[0] + dy * columnCosines[1] + dz * columnCosines[2]) / pixelSpacing[0];

      // Dot product with row direction (usually [0,1,0])
      const pixelY = (dx * rowCosines[0] + dy * rowCosines[1] + dz * rowCosines[2]) / pixelSpacing[1];

      console.log('CircleROI Pixel calculated:', {pixelX, pixelY});

      return [Math.round(pixelX), Math.round(pixelY)];
    });

    console.log('CircleROI Final pixel points:', pixelPoints);
    return pixelPoints;

  } catch (error) {
    console.warn('Could not calculate pixel coordinates for CircleROI tool:', error);
    return null;
  }
}

function calculateCirclePixelDimensions(pixelPoints) {
  if (!pixelPoints || pixelPoints.length < 2) return null;

  // CircleROI typically has 2 points: [center, radiusPoint]
  // representing the circle center and a point on the circumference
  const [centerPoint, radiusPoint] = pixelPoints;

  // Calculate radius (distance between center and radius point)
  const radius = Math.sqrt(
    Math.pow(radiusPoint[0] - centerPoint[0], 2) +
    Math.pow(radiusPoint[1] - centerPoint[1], 2)
  );

  // Calculate diameter
  const diameter = 2 * radius;

  // Calculate circumference (2πr)
  const circumference = 2 * Math.PI * radius;

  // Calculate area (πr²)
  const area = Math.PI * radius * radius;

  const dimensions = {
    radius: Math.round(radius),
    diameter: Math.round(diameter),
    circumference: Math.round(circumference),
    center: [Math.round(centerPoint[0]), Math.round(centerPoint[1])],
    pixelArea: Math.round(area)
  };

  console.log('CircleROI Pixel dimensions calculated:', dimensions);
  return dimensions;
}

function getDisplayText(mappedAnnotations, displaySet, circlePixelDimensions = null, pixelPoints = null) {
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

  if (pixelPoints && pixelPoints.length >= 2 && circlePixelDimensions !== null) {
    const { radius, diameter, pixelArea, center } = circlePixelDimensions;

    // Area sometimes becomes undefined if `preventHandleOutsideImage` is off.
    if (!isNaN(area)) {
      const roundedArea = utils.roundNumber(area || 0, 2);
      displayText.primary.push(`${roundedArea} ${getDisplayUnit(areaUnit)}`);
    }

    displayText.primary.push(`Pixel Area: ${pixelArea} px²`);
    displayText.primary.push(`Diameter: ${diameter} px`);
    displayText.primary.push(`Radius: ${radius} px`);

    displayText.secondary.push(`Center: (${center[0]},${center[1]})`);
    displayText.secondary.push(`S: ${SeriesNumber}${instanceText}${frameText}`);

    console.log('CircleROI Displaying with pixel data');
  } else {
    // Fallback to original display
    // Area sometimes becomes undefined if `preventHandleOutsideImage` is off.
    if (!isNaN(area)) {
      const roundedArea = utils.roundNumber(area || 0, 2);
      displayText.primary.push(`${roundedArea} ${getDisplayUnit(areaUnit)}`);
    }

    // Todo: we need a better UI for displaying all these information
    mappedAnnotations.forEach(mappedAnnotation => {
      const { unit, perimeter, radiusUnit, max, SeriesNumber } = mappedAnnotation;

      if (!isNaN(max)) {
        const maxStr = getStatisticDisplayString(max, unit, 'max');
        displayText.primary.push(maxStr);
      } else if (perimeter && !isNaN(perimeter)) {
        const perimeterStr = getStatisticDisplayString(perimeter, radiusUnit, 'perimeter');
        displayText.primary.push(perimeterStr);
      }
      displayText.secondary.push(`S: ${SeriesNumber}${instanceText}${frameText}`);
    });

    console.log('CircleROI Displaying without pixel data - fallback');
  }

  return displayText;
}

export default CircleROI;
