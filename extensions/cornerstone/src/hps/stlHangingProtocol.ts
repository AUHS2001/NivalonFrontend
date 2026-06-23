// stlHangingProtocol.js
const stlHangingProtocol = {
  id: 'stl-layout',
  name: '3D only',
  locked: true,
  icon: 'layout-advanced-3d-only',
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
  stages: [
    {
      id: 'stlStage',
      name: 'STL Stage',
      viewportStructure: {
        type: 'grid',
        properties: {
          rows: 1,
          columns: 1
        }
      },
      viewports: [
        {
          viewportOptions: {
            viewportId: 'stlViewport',
            customLayout: 'stl'
          },
          displaySets: [
            {
              id: 'stlDisplaySet'
            }
          ]
        }
      ]
    }
  ],
  numberOfPriorsReferenced: -1
};

export default stlHangingProtocol;
