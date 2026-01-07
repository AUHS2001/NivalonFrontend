import SUPPORTED_TOOLS from './constants/supportedTools';
import { getIsLocked } from './utils/getIsLocked';
import { getIsVisible } from './utils/getIsVisible';
import getSOPInstanceAttributes from './utils/getSOPInstanceAttributes';
import { utils } from '@ohif/core';
import { config } from '@cornerstonejs/tools/annotation';
import { metaData } from '@cornerstonejs/core';


const Length = {
  toAnnotation: measurement => {},

  /**
   * Maps cornerstone annotation event data to measurement service format.
   *
   * @param {Object} cornerstone Cornerstone event data
   * @return {Measurement} Measurement instance
   */
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
    // const colorString = config.style.getStyleProperty('color', { annotationUID });

    // color string is like 'rgb(255, 255, 255)' we need them to be in RGBA array [255, 255, 255, 255]
    // Todo: this should be in a utility
    // const color = colorString.replace('rgb(', '').replace(')', '').split(',').map(Number);

    if (!metadata || !data) {
      console.warn('Length tool: Missing metadata or data');
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

    const pixelPoints = calculatePixelCoordinates(points, referencedImageId);
    const pixelDistance = calculatePixelDistance(pixelPoints);

    console.log('Pixel calculation:', { pixelPoints, pixelDistance });

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

    if (pixelPoints && pixelPoints.length >= 2) {
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
    const { length, unit = 'mm' } = targetStats;

    annotations.push({
      SeriesInstanceUID,
      SOPInstanceUID,
      SeriesNumber,
      frameNumber,
      unit,
      length,
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
  values.push('Cornerstone:Length');

  mappedAnnotations.forEach(annotation => {
    const { length, unit } = annotation;
    columns.push(`Length`);
    values.push(length);
    columns.push('Unit');
    values.push(unit);
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
    // Get the fucking DICOM metadata
    const imagePlaneModule = metaData.get('imagePlaneModule', referencedImageId);

    console.log('ImagePlaneModule:', imagePlaneModule); // Debug

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

    console.log('Metadata values:', {
      imagePositionPatient,
      rowCosines,
      columnCosines,
      pixelSpacing
    }); // Debug

    // Convert each fucking point
    const pixelPoints = points.map(worldPoint => {
      // Vector from image origin to point
      const dx = worldPoint[0] - imagePositionPatient[0];
      const dy = worldPoint[1] - imagePositionPatient[1];
      const dz = worldPoint[2] - imagePositionPatient[2];

      console.log('World point:', worldPoint, 'Vector:', {dx, dy, dz}); // Debug

      // Dot product with column direction (usually [1,0,0])
      const pixelX = (dx * columnCosines[0] + dy * columnCosines[1] + dz * columnCosines[2]) / pixelSpacing[0];

      // Dot product with row direction (usually [0,1,0])
      const pixelY = (dx * rowCosines[0] + dy * rowCosines[1] + dz * rowCosines[2]) / pixelSpacing[1];

      console.log('Pixel calculated:', {pixelX, pixelY}); // Debug

      return [Math.round(pixelX), Math.round(pixelY)];
    });

    console.log('Final pixel points:', pixelPoints); // Debug
    return pixelPoints;

  } catch (error) {
    console.warn('Could not calculate pixel coordinates:', error);
    return null;
  }
}

function calculatePixelDistance(pixelPoints) {
  if (!pixelPoints || pixelPoints.length < 2) return null;

  const [p1, p2] = pixelPoints;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const distance = Math.sqrt(dx * dx + dy * dy);
  console.log('Pixel distance calculated:', distance); // Debug
  return distance;
}


function getDisplayText(mappedAnnotations, displaySet, pixelDistance = null, pixelPoints = null) {
  const displayText = {
    primary: [],
    secondary: [],
  };

  if (!mappedAnnotations || !mappedAnnotations.length) {
    return displayText;
  }

  // Length is the same for all series
  const { length, SeriesNumber, SOPInstanceUID, frameNumber, unit } = mappedAnnotations[0];

  const instance = displaySet.instances.find(image => image.SOPInstanceUID === SOPInstanceUID);

  let InstanceNumber;
  if (instance) {
    InstanceNumber = instance.InstanceNumber;
  }

  const instanceText = InstanceNumber ? ` I: ${InstanceNumber}` : '';
  const frameText = displaySet.isMultiFrame ? ` F: ${frameNumber}` : '';

  if (length === null || length === undefined) {
    return displayText;
  }

  const roundedLength = utils.roundNumber(length, 2);

  if (pixelPoints && pixelPoints.length >= 2 && pixelDistance !== null) {
    const [startPixel, endPixel] = pixelPoints;
    displayText.primary.push(`Length: ${roundedLength} ${unit}`);
    displayText.primary.push(`Pixel Distance: ${Math.round(pixelDistance)} px`);
    displayText.secondary.push(`Pixel Coordinates: (${startPixel[0]},${startPixel[1]}) to (${endPixel[0]},${endPixel[1]})`);
    console.log('Displaying with pixel data'); // Debug
  } else {
    // Fallback to original display
    displayText.primary.push(`${roundedLength} ${unit}`);
    console.log('Displaying without pixel data - fallback'); // Debug
  }

  displayText.secondary.push(`Series Info: ${SeriesNumber}${instanceText}${frameText}`);

  return displayText;
}

export default Length;
