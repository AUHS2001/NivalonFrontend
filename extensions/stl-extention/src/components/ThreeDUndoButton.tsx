import React from 'react';
import { useThreeDTools } from '../context/ThreeDToolsBridgeContext';

const ThreeDUndoButton: React.FC = () => {
  const tools = useThreeDTools();
  const undoTool = tools.find(t => t.id === 'undo');
  const disabled = !undoTool || undoTool.disabled;

  return (
    <div
      className={`flex items-center justify-center h-10 w-10 cursor-pointer rounded ${
        disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-primary/25'
      }`}
      onClick={() => {
        if (!disabled && undoTool) undoTool.onClick();
      }}
      title="Undo last 3D change"
    >
      <i
        className={`fas fa-undo-alt ${disabled ? 'text-foreground/40' : 'text-foreground/80'}`}
        style={{ fontSize: '18px' }}
      />
    </div>
  );
};

export default ThreeDUndoButton;
