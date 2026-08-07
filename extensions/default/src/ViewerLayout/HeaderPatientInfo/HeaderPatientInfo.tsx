import React from 'react';
import { Icons } from '@ohif/ui-next';

export enum PatientInfoVisibility {
  VISIBLE = 'visible',
  VISIBLE_COLLAPSED = 'visibleCollapsed',
  DISABLED = 'disabled',
  VISIBLE_READONLY = 'visibleReadOnly',
}

function HeaderPatientInfo({ servicesManager, appConfig }: withAppTypes) {

  const userRole = localStorage.getItem('userRole') || 'User';

  return (
    <div className="flex h-full items-center gap-2 px-2 py-[3px]">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(52,140,253,0.2)] shadow-[0_0_8px_rgba(52,140,253,0.3)]">
        <Icons.Patient className="h-7 w-7 text-[rgba(52,140,253,0.9)]" />
      </div>
      <div className="text-[13px] font-semibold capitalize text-white leading-tight">
        {userRole}
      </div>
      <Icons.ArrowLeft className="-rotate-90 h-5 w-5 text-white/40" />
    </div>
  );
}

export default HeaderPatientInfo;
