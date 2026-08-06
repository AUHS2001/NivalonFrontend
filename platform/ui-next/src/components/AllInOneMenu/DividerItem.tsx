import React from 'react';

const DividerItem = () => {
  return (
    <div className="flex h-3.5 shrink-0 items-center px-2">
      <div
        className="h-px w-full"
        style={{ background: 'linear-gradient(to right, transparent, rgba(52,140,253,0.25), transparent)' }}
      />
    </div>
  );
};

export default DividerItem;
