import React, { ReactNode, useCallback, useContext, useState } from 'react';
import { MenuContext } from './Menu';

type ItemProps = {
  label: string;
  secondaryLabel?: string;
  icon?: ReactNode;
  rightIcon?: ReactNode;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  useIconSpace?: boolean;
};

const Item = ({
  label,
  secondaryLabel,
  icon,
  rightIcon,
  onClick,
  onMouseEnter,
  onMouseLeave,
  useIconSpace = false,
}: ItemProps) => {
  const { hideMenu } = useContext(MenuContext);
  const [hovered, setHovered] = useState(false);

  const onClickHandler = useCallback(() => {
    hideMenu();
    onClick?.();
  }, [hideMenu, onClick]);

  return (
    <div
      className="flex h-8 w-full flex-shrink-0 cursor-pointer items-center px-2 text-sm leading-[18px] rounded-lg transition-all duration-100"
      style={{
        backgroundColor: hovered ? 'rgba(10,111,253,0.15)' : 'transparent',
        color: hovered ? '#ffffff' : 'rgba(200,220,255,0.88)',
      }}
      onClick={onClickHandler}
      onMouseEnter={() => { setHovered(true); onMouseEnter?.(); }}
      onMouseLeave={() => { setHovered(false); onMouseLeave?.(); }}
    >
      {(icon || useIconSpace) && (
        <div className="flex w-7 flex-shrink-0 items-center justify-center">{icon}</div>
      )}
      <span className="flex-grow">{label}</span>
      {secondaryLabel && (
        <span className="ml-2 flex-shrink-0 text-xs" style={{ color: 'rgba(130,185,255,0.55)' }}>
          {secondaryLabel}
        </span>
      )}
      {rightIcon && <div className="ml-2 flex-shrink-0">{rightIcon}</div>}
    </div>
  );
};

export default Item;
