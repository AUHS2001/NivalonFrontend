import { HYDRATE_SEG_SYNC_GROUP, VOI_SYNC_GROUP } from './mpr';

export const only3D = {
  id: 'stl-layout',
  locked: true,
  name: '3D only',
  icon: 'layout-advanced-3d-only',
  isPreset: true,
  createdDate: '2023-03-15T10:29:44.894Z',
  modifiedDate: '2023-03-15T10:29:44.894Z',
  availableTo: {},
  editableBy: {},
  protocolMatchingRules: [
    {
      id: 'stlRule',
      weight: 1,
      attribute: 'ProtocolName',
      constraint: {
        equals: {
          value: 'stl-layout'
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
      id: 'stlStage',
      name: 'STL Stage',
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
            viewportId: 'stlViewport',
            customLayout: 'stl'
          },
          displaySets: [
            {
              id: 'activeDisplaySet',
              options: {
              },
            },
          ],
        },
      ],
    },
  ],
  numberOfPriorsReferenced: -1
};
