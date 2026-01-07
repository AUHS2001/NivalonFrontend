// comparisonHangingProtocol.js
const comparisonHangingProtocol = {
  id: 'comparison-layout',
  name: 'Comparison Layout',
  locked: true,
  icon: 'layout-side-by-side',
  protocolMatchingRules: [
    {
      id: 'comparisonRule',
      weight: 1,
      attribute: 'NumberOfDisplaySets',
      constraint: {
        greaterThan: {
          value: 0
        }
      }
    }
  ],
  stages: [
    {
      id: 'comparisonStage',
      name: 'Comparison Stage',
      viewportStructure: {
        type: 'grid',
        properties: {
          rows: 1,
          columns: 2
        }
      },
      viewports: [
        {
          viewportOptions: {
            viewportId: 'comparisonViewport-0',
            toolGroupId: 'default',
            customLayout: 'comparison',
            background: [0, 0, 0],
            customProps: {
              seriesLabel: 'series1',
              type: 'text'  // Explicitly pass type
            }
          },
          displaySets: [
            {
              id: 'displaySet1',
              matchedDisplaySetsIndex: 0
            }
          ]
        },
        {
          viewportOptions: {
            viewportId: 'comparisonViewport-1',
            toolGroupId: 'default',
            customLayout: 'comparison',
            background: [0, 0, 0],
            customProps: {
              seriesLabel: 'series2',
              type: 'text'  // Explicitly pass type
            }
          },
          displaySets: [
            {
              id: 'displaySet2',
              matchedDisplaySetsIndex: 1 // Same display set or different one
            }
          ]
        }
      ]
    }
  ],
  numberOfPriorsReferenced: -1
};

export default comparisonHangingProtocol;
