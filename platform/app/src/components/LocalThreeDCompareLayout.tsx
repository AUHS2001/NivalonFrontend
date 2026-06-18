import React from 'react';
import LocalThreeDCompareViewer from '../../../../extensions/stl-extention/src/components/LocalThreeDCompareViewer';

const LocalThreeDCompareLayout = ({ servicesManager, commandsManager }) => {
  return (
    <div className="flex flex-col w-full h-full bg-[#0a0e17]">
      <div className="flex-1 overflow-hidden relative" style={{ height: '100%' }}>
        <LocalThreeDCompareViewer
          servicesManager={servicesManager}
          commandsManager={commandsManager}
        />
      </div>
    </div>
  );
};

export default LocalThreeDCompareLayout;
