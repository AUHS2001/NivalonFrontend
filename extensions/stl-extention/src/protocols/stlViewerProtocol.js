// In your index.tsx - use this exact protocol definition
const stlViewerProtocol = {
  id: 'stl-viewer',
  name: 'STL Viewer Layout',
  locked: true,
  hasUpdatedPriorsInformation: false,
  numberOfPriorsReferenced: 0,

  // Required: displaySetSelectors
  displaySetSelectors: {
    defaultDisplaySetId: {
      seriesMatchingRules: [
        {
          weight: 1,
          attribute: 'Modality',
          constraint: {
            equals: 'CT',
          },
        },
      ],
    },
    stlDisplaySetId: {
      seriesMatchingRules: [
        {
          weight: 1,
          attribute: 'Modality',
          constraint: {
            equals: 'CT',
          },
        },
      ],
    },
  },

  // Required: stages array
  stages: [
    {
      id: 'stlStage',
      name: 'STL Viewer Stage',
      status: 'active',
      viewportStructure: {
        type: 'grid',
        properties: {
          rows: 1,
          columns: 2,
        },
      },
      viewports: [
        {
          viewportOptions: {
            viewportId: 'stl-viewport-1',
            background: [0, 0, 0],
            toolGroupId: 'default',
            viewportType: 'stack',
          },
          displaySets: [
            {
              id: 'stlDisplaySetId',
            },
          ],
        },
        {
          viewportOptions: {
            viewportId: 'dicom-viewport-1',
            background: [0, 0, 0],
            toolGroupId: 'default',
            viewportType: 'stack',
          },
          displaySets: [
            {
              id: 'defaultDisplaySetId',
            },
          ],
        },
      ],
      createdDate: '2024-01-01',
    },
  ],

  // Optional but recommended
  protocolMatchingRules: [
    {
      id: 'stlViewerRule',
      weight: 1,
      attribute: 'Modality',
      constraint: {
        equals: 'CT',
      },
    },
  ],
};
