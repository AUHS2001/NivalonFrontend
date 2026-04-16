import React from 'react';
import { useThreeDTools } from '../context/ThreeDToolsBridgeContext';
import {
  ToolButtonList,
  ToolButtonListDivider,
  ToolButtonListDropDown,
} from '@ohif/ui-next';
import {
  DropdownMenuItem,
} from '@ohif/ui-next';

const ThreeDToolsDropdown: React.FC = () => {
  const tools = useThreeDTools();
  const disabled = tools.length === 0;

  return (
    <ToolButtonList>
      <div className="flex items-center justify-center h-10 w-10">
        <i
          className={`fas fa-cube ${disabled ? 'text-foreground/40' : 'text-foreground/80'}`}
          style={{ fontSize: '20px' }}
        />
      </div>
      <ToolButtonListDivider className={disabled ? 'opacity-50' : 'opacity-100'} />
      <ToolButtonListDropDown>
        {tools.map((tool) => {
          const isActive = tool.active;
          const isDanger = tool.danger && isActive;

          return (
            <DropdownMenuItem
              key={tool.id}
              disabled={tool.disabled}
              className={`flex items-center space-x-2 ${
                isDanger
                  ? 'bg-red-500/20 text-red-300'
                  : isActive
                    ? 'bg-primary/25 text-highlight'
                    : ''
              }`}
              onSelect={() => {
                tool.onClick();
              }}
            >
              <i
                className={`fas ${tool.icon}`}
                style={{ fontSize: '14px', minWidth: '20px', textAlign: 'center' }}
              />
              <span className="pl-1">{tool.label}</span>
            </DropdownMenuItem>
          );
        })}
      </ToolButtonListDropDown>
    </ToolButtonList>
  );
};

export default ThreeDToolsDropdown;
