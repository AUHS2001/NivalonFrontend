import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  Button,
} from '@ohif/ui-next';

export interface FreehandSmoothSettings {
  iterations: number;
  lambda: number;
}

export interface FreehandSmoothDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (settings: FreehandSmoothSettings) => void;
}

const FreehandSmoothDialog: React.FC<FreehandSmoothDialogProps> = ({ isOpen, onClose, onApply }) => {
  const [iterationsStr, setIterationsStr] = useState('6');
  const [lambdaStr, setLambdaStr] = useState('0.8');

  const handleApply = () => {
    const iterations = Math.max(1, Math.min(20, parseInt(iterationsStr) || 6));
    const lambda = Math.min(1, Math.max(0.01, parseFloat(lambdaStr) || 0.8));
    onApply({ iterations, lambda });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Free Hand Smooth Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="freehand-iterations">Iterations</Label>
            <Input
              id="freehand-iterations"
              type="number"
              min={1}
              max={20}
              value={iterationsStr}
              onChange={(e) => setIterationsStr(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="freehand-lambda">Smooth Factor</Label>
            <Input
              id="freehand-lambda"
              type="number"
              min={0.01}
              max={1}
              step={0.05}
              value={lambdaStr}
              onChange={(e) => setLambdaStr(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FreehandSmoothDialog;
