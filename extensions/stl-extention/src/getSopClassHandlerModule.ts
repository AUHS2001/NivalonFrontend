import { utils } from '@ohif/core';
import { SOPClassHandlerId, SOPClassHandlerName } from './id';

const { sopClassDictionary } = utils;

/**
 * STL SOP Class Handler
 * Creates display sets for STL/3D model data
 */
function _getDisplaySetsFromSeries(instances, servicesManager, extensionManager) {
  // If the series has no instances, stop here
  if (!instances || !instances.length) {
    throw new Error('No instances were provided');
  }

  utils.sortStudyInstances(instances);
  const instance = instances[0]; // Use first instance for metadata

  const {
    StudyInstanceUID,
    SeriesInstanceUID,
    SeriesDescription,
    SeriesNumber,
    SeriesDate,
    SeriesTime,
    Modality,
  } = instance;

  // Check if this series contains STL data
  // You can customize this logic based on your data
  const seriesDescription = (SeriesDescription || '').toLowerCase();
  const isSTLSeries = seriesDescription.includes('3d') ||
                      seriesDescription.includes('stl') ||
                      seriesDescription.includes('segmentation') ||
                      seriesDescription.includes('recon');

  if (!isSTLSeries) {
    return [];
  }

  const displaySet = {
    // Required DICOM properties
    Modality: Modality || 'CT', // Use original modality or default to CT
    displaySetInstanceUID: utils.guid(),
    SeriesDescription: SeriesDescription || '3D STL Model',
    SeriesNumber: SeriesNumber || 999,
    SeriesDate,
    SeriesTime,
    SeriesInstanceUID,
    StudyInstanceUID,

    // STL-specific properties
    SOPClassHandlerId,
    isDerivedDisplaySet: true,
    isLoaded: false,
    isSTL: true,
    stlInstanceId: SeriesInstanceUID, // Use series UID to fetch STL data

    // Display properties
    sopClassUids: [sopClassDictionary.CTImageStorage], // Use CT as base
    instances,

    // Load method - this will be called when the display set is activated
    load: () => _load(displaySet, servicesManager, extensionManager),
  };

  return [displaySet];
}

/**
 * Loads the STL display set - this is where you fetch your STL data
 */
async function _load(displaySet, servicesManager, extensionManager) {
  console.log('🔄 Loading STL display set:', displaySet.SeriesInstanceUID);

  // Set as loaded immediately since we'll handle loading in the component
  displaySet.isLoaded = true;

  // You can add additional loading logic here if needed
  // For example, pre-fetch STL data or validate availability

  return displaySet;
}

/**
 * Retrieves the SOP class handler module following dicomsr pattern
 */
function getSopClassHandlerModule(params) {
  const { servicesManager, extensionManager } = params;

  const getDisplaySetsFromSeries = instances => {
    return _getDisplaySetsFromSeries(instances, servicesManager, extensionManager);
  };

  return [
    {
      name: SOPClassHandlerName,
      sopClassUids: [
        sopClassDictionary.CTImageStorage, // Handle CT series that contain STL data
        sopClassDictionary.MRImageStorage, // Handle MR series that contain STL data
      ],
      getDisplaySetsFromSeries,
    },
  ];
}

export default getSopClassHandlerModule;
