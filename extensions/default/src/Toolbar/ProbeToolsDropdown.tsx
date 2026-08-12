import React from 'react';
import { useToolbar } from '@ohif/core';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Icons,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@ohif/ui-next';

const ProbeToolsDropdown: React.FC = () => {
  const { toolbarButtons, onInteraction } = useToolbar({ buttonSection: 'ProbeTools' });

  if (!toolbarButtons?.length) {
    return null;
  }

  // Show the trigger as active if any probe tool in the section is active
  const anyActive = toolbarButtons.some(({ componentProps }) =>
    componentProps?.className?.includes('!text-primary')
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TooltipTrigger asChild>
              <div className="flex items-center">
                {/* Main icon */}
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg transition-all duration-200 cursor-pointer text-foreground/80 hover:bg-[rgba(52,140,253,0.12)] hover:text-highlight hover:shadow-[0_0_10px_rgba(52,140,253,0.18)]">
                  <i
                    className="fas fa-bullseye"
                    style={{ fontSize: '25px', color: anyActive ? 'rgb(0, 168, 255)' : 'inherit' }}
                  />
                </div>
                {/* Divider */}
                <div className="h-5 w-px self-center bg-[rgba(52,140,253,0.35)]" />
                {/* Chevron */}
                <div className="inline-flex h-10 w-5 items-center justify-center rounded-tr-lg rounded-br-lg transition-all duration-200 cursor-pointer text-foreground/80 hover:bg-[rgba(52,140,253,0.12)] hover:text-highlight hover:shadow-[0_0_10px_rgba(52,140,253,0.18)]">
                  <i className="fas fa-chevron-down" style={{ fontSize: '10px' }} />
                </div>
              </div>
            </TooltipTrigger>
          </DropdownMenuTrigger>
          <TooltipContent side="bottom">Probe Tools</TooltipContent>
          <DropdownMenuContent
            side="bottom"
            align="start"
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
              const isActive = componentProps?.className?.includes('!text-primary');
              return (
                <DropdownMenuItem
                  key={id}
                  onSelect={() => onInteraction({ itemId: id })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    color: isActive ? 'rgb(0, 168, 255)' : '#ffffff',
                    backgroundColor: isActive ? 'rgba(0, 168, 255, 0.12)' : 'transparent',
                    border: isActive ? '1px solid rgba(0, 168, 255, 0.28)' : '1px solid transparent',
                    cursor: 'pointer',
                    fontSize: '13px',
                    transition: 'all 0.1s ease',
                  }}
                >
                  {icon && (
                    <span style={{ color: isActive ? 'rgb(0, 168, 255)' : '#ffffff', flexShrink: 0 }}>
                      <Icons.ByName name={icon} className="h-4 w-4" />
                    </span>
                  )}
                  <span style={{ flex: 1 }}>{label}</span>
                  {isActive && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0, 168, 255, 0.2)',
                        color: 'rgb(0, 168, 255)',
                        fontSize: '9px',
                        flexShrink: 0,
                        fontWeight: 'bold',
                      }}
                    >
                      ✕
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ProbeToolsDropdown;
