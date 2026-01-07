// karachiHangingProtocol.js
const karachiHangingProtocol = {
  id: 'karachi-layout',
  name: '3D only',
  locked: true,
  icon: 'layout-advanced-3d-only',
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
  stages: [
    {
      id: 'karachiStage',
      name: 'Karachi Stage',
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
            viewportId: 'karachiViewport',
            customLayout: 'karachi'
          },
          displaySets: [
            {
              id: 'karachiDisplaySet'
            }
          ]
        }
      ]
    }
  ],
  numberOfPriorsReferenced: -1
};

export default karachiHangingProtocol;
