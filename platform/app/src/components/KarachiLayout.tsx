// KarachiLayout.tsx
import React from 'react';
import SingleSpinalCord from '../../../../extensions/stl-extention/src/SingleSpinalCord';

const KarachiLayout = ({ servicesManager, commandsManager, extensionManager }) => {
  return (
    <div className="w-full h-full bg-[#0a0e17]" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', height: '100%' }}>
        <SingleSpinalCord
          servicesManager={servicesManager}
          commandsManager={commandsManager}
          extensionManager={extensionManager}
        />
      </div>
    </div>
  );
};

export default KarachiLayout;
