import React from 'react';
import { useThreeDTools } from '../context/ThreeDToolsBridgeContext';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@ohif/ui-next';

const ITEM_CLASS = 'px-3 py-2 gap-[10px]';

const ThreeDToolsDropdown: React.FC = () => {
  const allTools = useThreeDTools();
  const tools = allTools.filter(t => !t.hidden);
  const disabled = tools.length === 0;

  return (
    <TooltipProvider>
    <Tooltip>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TooltipTrigger asChild>
        <div className={`flex items-center ${disabled ? 'pointer-events-none' : ''}`}>
          {/* Cube icon — same size/style as ToolButton primary */}
          <div
            className={`inline-flex items-center justify-center h-10 w-10 rounded-lg transition-all duration-200 ${
              disabled
                ? 'cursor-not-allowed text-foreground/40'
                : 'cursor-pointer text-foreground/80 hover:bg-[rgba(52,140,253,0.12)] hover:text-highlight hover:shadow-[0_0_10px_rgba(52,140,253,0.18)]'
            }`}
          >
            <i className="fas fa-cube" style={{ fontSize: '20px' }} />
          </div>
          {/* Divider — same as ToolButtonListDivider */}
          <div className={`h-5 w-px self-center bg-[rgba(52,140,253,0.35)] ${disabled ? 'opacity-40' : ''}`} />
          {/* Chevron — same as ToolButtonListDropDown trigger */}
          <div
            className={`inline-flex h-10 w-5 items-center justify-center rounded-tr-lg rounded-br-lg transition-all duration-200 ${
              disabled
                ? 'text-foreground/40'
                : 'cursor-pointer text-foreground/80 hover:bg-[rgba(52,140,253,0.12)] hover:text-highlight hover:shadow-[0_0_10px_rgba(52,140,253,0.18)]'
            }`}
          >
            <i className="fas fa-chevron-down" style={{ fontSize: '10px' }} />
          </div>
        </div>
        </TooltipTrigger>
      </DropdownMenuTrigger>
      <TooltipContent side="bottom">3D Tools</TooltipContent>
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
          minWidth: '200px',
        }}
      >
        {tools.map(tool => {
          const isActive = tool.active;
          const isDanger = tool.danger && isActive;

          if (tool.children && tool.children.length > 0) {
            return (
              <DropdownMenuSub key={tool.id}>
                <DropdownMenuSubTrigger
                  className={`${ITEM_CLASS} ${isActive ? 'bg-[rgba(52,140,253,0.18)] !text-highlight' : ''}`}
                  style={{ color: '#ffffff', fontSize: '13px' }}
                >
                  <i
                    className={`fas ${tool.icon} flex-shrink-0`}
                    style={{ fontSize: '14px', width: '14px', textAlign: 'center' }}
                  />
                  <span>{tool.label}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent style={{
                    backgroundColor: 'rgba(6,9,20,0.97)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    border: '1px solid rgba(52,140,253,0.22)',
                    boxShadow: '0 0 40px rgba(10,111,253,0.12), 0 16px 60px rgba(0,0,0,0.85)',
                    borderRadius: '12px',
                    padding: '6px',
                    minWidth: '180px',
                  }}>
                  {tool.children.map(child => {
                    const childActive = child.active;
                    const childDanger = child.danger && childActive;
                    return (
                      <DropdownMenuItem
                        key={child.id}
                        disabled={child.disabled}
                        className={`${ITEM_CLASS} ${
                          childDanger
                            ? 'bg-red-500/20 !text-red-300'
                            : childActive
                              ? 'bg-[rgba(52,140,253,0.18)] !text-highlight'
                              : ''
                        }`}
                        style={{ color: '#ffffff', fontSize: '13px' }}
                        onSelect={() => child.onClick()}
                      >
                        <i
                          className={`fas ${child.icon} flex-shrink-0`}
                          style={{ fontSize: '14px', width: '14px', textAlign: 'center' }}
                        />
                        <span>{child.label}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          }

          return (
            <DropdownMenuItem
              key={tool.id}
              disabled={tool.disabled}
              className={`${ITEM_CLASS} ${
                isDanger
                  ? 'bg-red-500/20 !text-red-300'
                  : isActive
                    ? 'bg-[rgba(52,140,253,0.18)] !text-highlight'
                    : ''
              }`}
              style={{ color: '#ffffff', fontSize: '13px' }}
              onSelect={() => tool.onClick()}
            >
              <i
                className={`fas ${tool.icon} flex-shrink-0`}
                style={{ fontSize: '14px', width: '14px', textAlign: 'center' }}
              />
              <span>{tool.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
    </Tooltip>
    </TooltipProvider>
  );
};

export default ThreeDToolsDropdown;
