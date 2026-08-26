import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Header,
  Icons,
  useModal,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@ohif/ui-next';
import { useSystem, useToolbar } from '@ohif/core';
import { Toolbar } from '../Toolbar/Toolbar';
import HeaderPatientInfo from './HeaderPatientInfo';
import { PatientInfoVisibility } from './HeaderPatientInfo/HeaderPatientInfo';
import { preserveQueryParameters } from '@ohif/app';
import { Types } from '@ohif/core';

function MoreToolsNavDropdown() {
  const { onInteraction, toolbarButtons } = useToolbar({ buttonSection: 'MoreTools' });
  const [open, setOpen] = useState(false);

  if (!toolbarButtons?.length) {
    return null;
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
    >
      <DropdownMenuTrigger asChild>
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            marginRight: '8px',
            borderRadius: '8px',
            border: '1px solid rgba(52,140,253,0.22)',
            backgroundColor: open ? 'rgba(10,111,253,0.15)' : 'rgba(52,140,253,0.06)',
            color: 'rgba(200,220,255,0.9)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'all 0.15s ease',
            outline: 'none',
          }}
          onMouseEnter={e => {
            if (!open) {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(10,111,253,0.12)';
              (e.currentTarget as HTMLElement).style.color = '#ffffff';
            }
          }}
          onMouseLeave={e => {
            if (!open) {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(52,140,253,0.06)';
              (e.currentTarget as HTMLElement).style.color = 'rgba(200,220,255,0.9)';
            }
          }}
        >
          <Icons.More className="h-4 w-4" />
          <span>More Tools</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        style={{
          backgroundColor: 'rgba(6,9,20,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(52,140,253,0.22)',
          boxShadow: '0 0 40px rgba(10,111,253,0.12), 0 16px 60px rgba(0,0,0,0.85)',
          borderRadius: '12px',
          padding: '6px',
          minWidth: '180px',
        }}
      >
        {toolbarButtons.map(({ id, componentProps }) => {
          const label = componentProps?.label || componentProps?.tooltip || id;
          const icon = componentProps?.icon;
          return (
            <DropdownMenuItem
              key={id}
              onSelect={() => {
                onInteraction({ itemId: id });
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '8px',
                color: 'rgba(200,220,255,0.9)',
                cursor: 'pointer',
                fontSize: '13px',
                transition: 'all 0.1s ease',
              }}
            >
              {icon && (
                <span style={{ color: 'rgba(130,185,255,0.7)', flexShrink: 0 }}>
                  <Icons.ByName
                    name={icon}
                    className="h-4 w-4"
                  />
                </span>
              )}
              <span>{label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ViewerHeader({ appConfig }: withAppTypes<{ appConfig: AppTypes.Config }>) {
  const { servicesManager, extensionManager, commandsManager } = useSystem();
  const { customizationService } = servicesManager.services;

  const navigate = useNavigate();
  const location = useLocation();

  const onClickReturnButton = () => {
    navigate('/localWorklist');
  };

  const { t } = useTranslation();
  const { show } = useModal();

  const AboutModal = customizationService.getCustomization(
    'ohif.aboutModal'
  ) as Types.MenuComponentCustomization;

  const UserPreferencesModal = customizationService.getCustomization(
    'ohif.userPreferencesModal'
  ) as Types.MenuComponentCustomization;

  const menuOptions = [
    {
      title: UserPreferencesModal.menuTitle ?? t('Header:Preferences'),
      icon: 'settings',
      onClick: () =>
        show({
          content: UserPreferencesModal,
          title: UserPreferencesModal.title ?? t('UserPreferencesModal:User preferences'),
          containerClassName:
            UserPreferencesModal?.containerClassName ?? 'flex max-w-4xl p-6 flex-col',
        }),
    },
  ];

  menuOptions.push({
    title: t('Header:Logout'),
    icon: 'power-off',
    onClick: async () => {
      localStorage.removeItem('token');
      localStorage.removeItem('userRole');
      if (appConfig.oidc) {
        navigate(`/logout?redirect_uri=${encodeURIComponent(window.location.href)}`);
      } else {
        navigate('/');
      }
    },
  });

  return (
    <Header
      menuOptions={menuOptions}
      isReturnEnabled={!!appConfig.showStudyList}
      onClickReturnButton={onClickReturnButton}
      WhiteLabeling={appConfig.whiteLabeling}
      Secondary={<Toolbar buttonSection="secondary" />}
      PatientInfo={
        appConfig.showPatientInfo !== PatientInfoVisibility.DISABLED && (
          <HeaderPatientInfo
            servicesManager={servicesManager}
            appConfig={appConfig}
          />
        )
      }
      UndoRedo={null}
    >
      <div className="relative flex justify-center gap-[4px]">
        <Toolbar buttonSection="primary" />
      </div>
    </Header>
  );
}

export default ViewerHeader;
