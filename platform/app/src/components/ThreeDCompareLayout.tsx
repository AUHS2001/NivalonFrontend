import React from 'react';
import ThreeDCompareViewer from '../../../../extensions/stl-extention/src/components/ThreeDCompareViewer';

const ThreeDCompareLayout = ({ servicesManager, commandsManager }) => {
  return (
    <div className="flex flex-col w-full h-full bg-[#0a0e17]">
      <div className="flex-1 overflow-hidden relative" style={{ height: '100%' }}>
        <ThreeDCompareViewer
          servicesManager={servicesManager}
          commandsManager={commandsManager}
        />
      </div>
    </div>
  );
};

export default ThreeDCompareLayout;
