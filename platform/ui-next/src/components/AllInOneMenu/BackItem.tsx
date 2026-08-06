import React, { useState } from 'react';
import { Icons } from '@ohif/ui-next';
import DividerItem from './DividerItem';

type BackItemProps = {
  backLabel?: string;
  onBackClick: () => void;
};

const BackItem = ({ backLabel, onBackClick }: BackItemProps) => {
  const [hovered, setHovered] = useState(false);

  return (
    <>
      <div
        className="flex h-8 w-full flex-shrink-0 cursor-pointer items-center pl-1 pr-2 text-sm rounded-lg transition-all duration-100"
        style={{
          backgroundColor: hovered ? 'rgba(10,111,253,0.15)' : 'transparent',
          color: hovered ? '#ffffff' : 'rgba(130,185,255,0.8)',
        }}
        onClick={onBackClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Icons.ByName
          name="content-prev"
          className="ml-2 mr-2"
        />
        <span>{backLabel || 'Back to Display Options'}</span>
      </div>
      <DividerItem />
    </>
  );
};

export default BackItem;
