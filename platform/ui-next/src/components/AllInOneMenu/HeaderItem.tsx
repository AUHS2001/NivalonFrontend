import React, { ReactNode } from 'react';

type HeaderItemProps = {
  children: ReactNode;
};

const HeaderItem = ({ children }: HeaderItemProps) => {
  return (
    <div
      className="mx-2 flex h-6 shrink-0 items-center text-xs font-semibold uppercase tracking-wider"
      style={{ color: 'rgba(130,185,255,0.6)' }}
    >
      {children}
    </div>
  );
};

export default HeaderItem;
