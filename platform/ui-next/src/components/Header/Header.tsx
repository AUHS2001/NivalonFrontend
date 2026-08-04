import React, { ReactNode } from 'react';
import classNames from 'classnames';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Icons,
  Button,
  ToolButton,
} from '../';
import { IconPresentationProvider } from '@ohif/ui-next';

import NavBar from '../NavBar';
import logo from '../../../../app/assets/logo.png'

// Todo: we should move this component to composition and remove props base

interface HeaderProps {
  children?: ReactNode;
  menuOptions: Array<{
    title: string;
    icon?: string;
    onClick: () => void;
  }>;
  isReturnEnabled?: boolean;
  onClickReturnButton?: () => void;
  isSticky?: boolean;
  WhiteLabeling?: {
    createLogoComponentFn?: (React: any, props: any) => ReactNode;
  };
  PatientInfo?: ReactNode;
  Secondary?: ReactNode;
  UndoRedo?: ReactNode;
}

function Header({
  children,
  menuOptions,
  isReturnEnabled = true,
  onClickReturnButton,
  isSticky = false,
  WhiteLabeling,
  PatientInfo,
  UndoRedo,
  Secondary,
  ...props
}: HeaderProps): ReactNode {
  const onClickReturn = () => {
    if (isReturnEnabled && onClickReturnButton) {
      onClickReturnButton();
    }
  };

  return (
    <IconPresentationProvider
      size="large"
      IconContainer={ToolButton}
    >
      <NavBar
        isSticky={isSticky}
        {...props}
      >
        <div className="relative h-[70px] items-center bg-gradient-to-b from-[rgba(255,255,255,0.04)] to-transparent">
          <div className="absolute left-1 top-1/2 flex -translate-y-1/2 items-center">
            <div
              className={classNames(
                'mr-3 inline-flex items-center transition-all duration-300 group',
                isReturnEnabled && 'cursor-pointer'
              )}
              data-cy="return-to-work-list"
              onClick={onClickReturn}
            >
              <div className="ml-2 relative">
                <div className="absolute inset-0 rounded-lg bg-[rgba(52,140,253,0.08)] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-110" />
                <img
                  src={logo}
                  alt="Logo"
                  width="250"
                  height="250"
                  className="relative drop-shadow-[0_0_12px_rgba(52,140,253,0.25)] transition-all duration-300 group-hover:drop-shadow-[0_0_20px_rgba(52,140,253,0.45)] group-hover:scale-[1.02]"
                />
              </div>
            </div>
          </div>
          <div className="absolute top-1/2 left-[250px] h-8 -translate-y-1/2">{Secondary}</div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform">
            <div className="flex items-center justify-center space-x-1 rounded-lg bg-[rgba(52,140,253,0.06)] px-3 py-1 shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
              {children}
            </div>
          </div>
          <div className="absolute right-0 top-1/2 flex -translate-y-1/2 select-none items-center pr-2">
            {UndoRedo}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="mx-2 flex cursor-pointer items-center gap-1 rounded-lg bg-[rgba(52,140,253,0.05)] px-1 py-1 shadow-[0_2px_12px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(52,140,253,0.1)] transition-all duration-200 hover:bg-[rgba(52,140,253,0.1)] hover:shadow-[0_0_14px_rgba(52,140,253,0.2)]">
                  {PatientInfo}
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px] p-1 bg-gradient-to-b from-[rgba(52,140,253,0.07)] to-[rgba(8,12,24,0.82)]">
                {menuOptions.map((option, index) => {
                  const IconComponent = option.icon
                    ? Icons[option.icon as keyof typeof Icons]
                    : null;
                  return (
                    <DropdownMenuItem
                      key={index}
                      onSelect={option.onClick}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      {IconComponent && (
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-[rgba(52,140,253,0.7)]">
                          <Icons.ByName name={IconComponent.name} className={option.icon === 'info' ? 'h-6 w-6 [&>*]:h-6 [&>*]:w-6' : 'h-4 w-4 [&>*]:h-4 [&>*]:w-4'} />
                        </span>
                      )}
                      <span className="flex-1">{option.title}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </NavBar>
    </IconPresentationProvider>
  );
}

export default Header;
