import { HYDRATE_SEG_SYNC_GROUP, VOI_SYNC_GROUP } from './mpr';

export const only3D = {
  id: 'karachi-layout', // Changed to match your protocol ID
  locked: true,
  name: '3D only', // Updated name
  icon: 'layout-advanced-3d-only',
  isPreset: true,
  createdDate: '2023-03-15T10:29:44.894Z',
  modifiedDate: '2023-03-15T10:29:44.894Z',
  availableTo: {},
  editableBy: {},
  protocolMatchingRules: [
    {
      id: 'karachiRule',
      weight: 1,
      attribute: 'ProtocolName',
      constraint: {
        equals: {
          value: 'karachi-layout'
        }
      }
    }
  ],
  imageLoadStrategy: 'interleaveCenter',
  displaySetSelectors: {
    activeDisplaySet: {
      seriesMatchingRules: [
        {
          weight: 1,
          attribute: 'isReconstructable',
          constraint: {
            equals: {
              value: true,
            },
          },
          required: true,
        },
      ],
    },
  },
  stages: [
    {
      id: 'karachiStage',
      name: 'Karachi Stage',
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 1,
          columns: 1,
        },
      },
      viewports: [
        {
          viewportOptions: {
            viewportId: 'karachiViewport',
            customLayout: 'karachi' // This will trigger your custom layout
          },
          displaySets: [
            {
              id: 'activeDisplaySet',
              options: {
                // You can keep display preset options if needed
                // or remove them for custom layout
              },
            },
          ],
        },
      ],
    },
  ],
  numberOfPriorsReferenced: -1
};
