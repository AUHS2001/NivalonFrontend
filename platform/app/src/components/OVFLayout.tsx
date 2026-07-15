import React from 'react';
import OVFViewer from '../../../../extensions/stl-extention/src/components/OVFViewer';

const OVFLayout = ({ servicesManager, commandsManager, extensionManager, dataSource }) => {
  return (
    <div className="w-full h-full bg-black" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', height: '100%' }}>
        <OVFViewer
          servicesManager={servicesManager}
          commandsManager={commandsManager}
          extensionManager={extensionManager}
          dataSource={dataSource}
        />
      </div>
    </div>
  );
};

export default OVFLayout;
