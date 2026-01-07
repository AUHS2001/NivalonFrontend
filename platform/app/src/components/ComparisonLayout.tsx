// KarachiLayout.tsx
import React from 'react';
import StlComparison from '../../../../extensions/stl-extention/src/StlComparison';

const ComparisonLayout = ({ servicesManager, commandsManager, extensionManager, viewportOptions, viewportId   }) => {
  const viewportIndex = viewportId ? parseInt(viewportId.split('-').pop(), 10) : 0;
  const seriesLabel = viewportOptions?.customProps?.seriesLabel;

  return (
    <div className="flex flex-col w-full h-full bg-gray-900">
      <div className="flex-1 overflow-hidden">
        <StlComparison
          servicesManager={servicesManager}
          commandsManager={commandsManager}
          extensionManager={extensionManager}
          seriesLabel={viewportIndex === 0 ? 'series 1' : 'series 2'}
        />
      </div>
    </div>
  );
};

export default ComparisonLayout;
