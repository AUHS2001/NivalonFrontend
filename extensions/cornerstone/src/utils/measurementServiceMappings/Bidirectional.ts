import SUPPORTED_TOOLS from './constants/supportedTools';
import getSOPInstanceAttributes from './utils/getSOPInstanceAttributes';
import { utils } from '@ohif/core';
import { getDisplayUnit } from './utils';
import { getIsLocked } from './utils/getIsLocked';
import { getIsVisible } from './utils/getIsVisible';
import { metaData } from '@cornerstonejs/core';

const Bidirectional = {
  toAnnotation: measurement => {},
  toMeasurement: (
    csToolsEventDetail,
    displaySetService,
    cornerstoneViewportService,
    getValueTypeFromToolType,
    customizationService
  ) => {
    const { annotation } = csToolsEventDetail;
    const { metadata, data, annotationUID } = annotation;

    const isLocked = getIsLocked(annotationUID);
    const isVisible = getIsVisible(annotationUID);

    if (!metadata || !data) {
      console.warn('Bidirectional tool: Missing metadata or data');
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

    // Calculate pixel coordinates and distances for bidirectional tool
    const pixelPoints = calculatePixelCoordinates(points, referencedImageId);
    const pixelDistance = calculateBidirectionalPixelDistance(pixelPoints);

    console.log('Bidirectional Pixel calculation:', { pixelPoints, pixelDistance });

    const mappedAnnotations = getMappedAnnotations(annotation, displaySetService);

    const displayText = getDisplayText(mappedAnnotations, displaySet, pixelDistance, pixelPoints);

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

    if (pixelPoints && pixelPoints.length >= 4) {
      measurementData.pixelPoints = pixelPoints;
    }
    if (pixelDistance) {
      measurementData.pixelDistance = pixelDistance;
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
  Object.keys(cachedStats).forEach(targetId => {
    const targetStats = cachedStats[targetId];

    const { SOPInstanceUID, SeriesInstanceUID, frameNumber } = getSOPInstanceAttributes(
      referencedImageId,
      displaySetService,
      annotation
    );

    const displaySet = displaySetService.getDisplaySetsForSeries(SeriesInstanceUID)[0];

    const { SeriesNumber } = displaySet;
    const { length, width, unit } = targetStats;

    annotations.push({
      SeriesInstanceUID,
      SOPInstanceUID,
      SeriesNumber,
      frameNumber,
      unit,
      length,
      width,
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
  values.push('Cornerstone:Bidirectional');

  mappedAnnotations.forEach(annotation => {
    const { length, width, unit } = annotation;
    columns.push(`Length`, `Width`, 'Unit');
    values.push(length, width, unit);
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

    console.log('Bidirectional ImagePlaneModule:', imagePlaneModule);

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

    console.log('Bidirectional Metadata values:', {
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

      console.log('Bidirectional World point:', worldPoint, 'Vector:', {dx, dy, dz});

      // Dot product with column direction (usually [1,0,0])
      const pixelX = (dx * columnCosines[0] + dy * columnCosines[1] + dz * columnCosines[2]) / pixelSpacing[0];

      // Dot product with row direction (usually [0,1,0])
      const pixelY = (dx * rowCosines[0] + dy * rowCosines[1] + dz * rowCosines[2]) / pixelSpacing[1];

      console.log('Bidirectional Pixel calculated:', {pixelX, pixelY});

      return [Math.round(pixelX), Math.round(pixelY)];
    });

    console.log('Bidirectional Final pixel points:', pixelPoints);
    return pixelPoints;

  } catch (error) {
    console.warn('Could not calculate pixel coordinates for bidirectional tool:', error);
    return null;
  }
}

function calculateBidirectionalPixelDistance(pixelPoints) {
  if (!pixelPoints || pixelPoints.length < 4) return null;

  // Bidirectional tool typically has 4 points: [start1, end1, start2, end2]
  // representing two perpendicular measurements
  const [start1, end1, start2, end2] = pixelPoints;

  // Calculate distance for first measurement (length)
  const dx1 = end1[0] - start1[0];
  const dy1 = end1[1] - start1[1];
  const distance1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

  // Calculate distance for second measurement (width)
  const dx2 = end2[0] - start2[0];
  const dy2 = end2[1] - start2[1];
  const distance2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

  // Return as an object with both distances
  return {
    length: Math.round(distance1),
    width: Math.round(distance2)
  };
}

function getDisplayText(mappedAnnotations, displaySet, pixelDistance = null, pixelPoints = null) {
  const displayText = {
    primary: [],
    secondary: [],
  };

  if (!mappedAnnotations || !mappedAnnotations.length) {
    return displayText;
  }

  // Area is the same for all series
  const { length, width, unit, SeriesNumber, SOPInstanceUID, frameNumber } = mappedAnnotations[0];
  const roundedLength = utils.roundNumber(length, 2);
  const roundedWidth = utils.roundNumber(width, 2);

  const instance = displaySet.instances.find(image => image.SOPInstanceUID === SOPInstanceUID);

  let InstanceNumber;
  if (instance) {
    InstanceNumber = instance.InstanceNumber;
  }

  const instanceText = InstanceNumber ? ` I: ${InstanceNumber}` : '';
  const frameText = displaySet.isMultiFrame ? ` F: ${frameNumber}` : '';

  if (pixelPoints && pixelPoints.length >= 4 && pixelDistance !== null) {
    const [start1, end1, start2, end2] = pixelPoints;

    displayText.primary.push(`L: ${roundedLength} ${getDisplayUnit(unit)}`);
    displayText.primary.push(`W: ${roundedWidth} ${getDisplayUnit(unit)}`);
    displayText.primary.push(`Pixel L: ${pixelDistance.length} px`);
    displayText.primary.push(`Pixel W: ${pixelDistance.width} px`);

    displayText.secondary.push(`Pixel Coords: L(${start1[0]},${start1[1]})-(${end1[0]},${end1[1]})`);
    displayText.secondary.push(`W(${start2[0]},${start2[1]})-(${end2[0]},${end2[1]})`);

    console.log('Bidirectional Displaying with pixel data');
  } else {
    // Fallback to original display
    displayText.primary.push(`L: ${roundedLength} ${getDisplayUnit(unit)}`);
    displayText.primary.push(`W: ${roundedWidth} ${getDisplayUnit(unit)}`);
    console.log('Bidirectional Displaying without pixel data - fallback');
  }

  displayText.secondary.push(`S: ${SeriesNumber}${instanceText}${frameText}`);

  return displayText;
}

export default Bidirectional;
