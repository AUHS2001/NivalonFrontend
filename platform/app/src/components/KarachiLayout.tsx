// KarachiLayout.tsx
import React from 'react';
import SingleSpinalCord from '../../../../extensions/stl-extention/src/SingleSpinalCord';

const KarachiLayout = ({ servicesManager, commandsManager, extensionManager }) => {
  return (
    <div className="flex flex-col w-full h-full bg-gray-900">
      <div className="flex-1 overflow-hidden">
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
