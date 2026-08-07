import React, { useCallback, useContext, useState } from 'react';
import { MenuContext, MenuProps } from './Menu';
import { Icons } from '@ohif/ui-next';

export interface SubMenuProps extends MenuProps {
  itemLabel: string;
  onClick?: () => void;
  itemIcon?: string;
}

const SubMenu = (props: SubMenuProps) => {
  const { showSubMenu } = useContext(MenuContext);
  const [hovered, setHovered] = useState(false);

  const onClickHandler = useCallback(() => {
    showSubMenu(props);
    props.onClick?.();
  }, [showSubMenu, props]);

  return (
    <div
      className="flex h-8 w-full cursor-pointer items-center px-2 text-sm rounded-lg transition-all duration-100"
      style={{
        backgroundColor: hovered ? 'rgba(10,111,253,0.15)' : 'transparent',
        color: hovered ? '#ffffff' : 'rgba(200,220,255,0.88)',
      }}
      onClick={onClickHandler}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {props.itemIcon && (
        <div className="flex w-7 flex-shrink-0 items-center justify-center">
          <Icons.ByName name={props.itemIcon} />
        </div>
      )}
      <span className="flex-grow">{props.itemLabel}</span>
      <div className="ml-2 flex-shrink-0" style={{ color: 'rgba(130,185,255,0.6)' }}>
        <Icons.ByName name="content-next" />
      </div>
    </div>
  );
};

export default SubMenu;
