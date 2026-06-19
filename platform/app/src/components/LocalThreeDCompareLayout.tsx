import React from 'react';
import SingleSpinalCord from '../../../../extensions/stl-extention/src/SingleSpinalCord';

const LocalThreeDCompareLayout = ({ servicesManager, commandsManager }) => {
  return (
    <SingleSpinalCord
      servicesManager={servicesManager}
      localOnly={true}
    />
  );
};

export default LocalThreeDCompareLayout;
