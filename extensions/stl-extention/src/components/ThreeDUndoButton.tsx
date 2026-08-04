import React from 'react';
import { useThreeDTools } from '../context/ThreeDToolsBridgeContext';

const ThreeDUndoButton: React.FC = () => {
  const tools = useThreeDTools();
  const undoTool = tools.find(t => t.id === 'undo');
  const disabled = !undoTool || undoTool.disabled;

  return (
    <div
      className={`flex items-center justify-center h-10 w-10 rounded-lg transition-all duration-200 ${
        disabled
          ? 'cursor-not-allowed text-foreground/40'
          : 'cursor-pointer text-foreground/80 hover:bg-[rgba(52,140,253,0.12)] hover:text-highlight hover:shadow-[0_0_10px_rgba(52,140,253,0.18)]'
      }`}
      onClick={() => {
        if (!disabled && undoTool) undoTool.onClick();
      }}
      title="Undo last 3D change"
    >
      <i
        className="fas fa-undo-alt"
        style={{ fontSize: '20px' }}
      />
    </div>
  );
};

export default ThreeDUndoButton;
