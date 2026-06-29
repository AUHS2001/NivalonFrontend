import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  Checkbox,
  Button,
} from '@ohif/ui-next';

export interface SmoothDialogProps {
  isOpen: boolean;
  onClose: () => void;
  meshNames: { index: number; name: string }[];
  onApply: (params: {
    iterations: number;
    lambda: number;
    selectedIndices: number[];
    onProgress: (percent: number) => void;
  }) => Promise<void>;
}

const SmoothDialog: React.FC<SmoothDialogProps> = ({ isOpen, onClose, meshNames, onApply }) => {
  const [iterationsStr, setIterationsStr] = useState('20');
  const [lambdaStr, setLambdaStr] = useState('0.5');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [smoothing, setSmoothing] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggleIndex = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const handleApply = async () => {
    if (selectedIndices.size === 0) return;
    const iterations = Math.max(1, parseInt(iterationsStr) || 1);
    const lambda = Math.min(1, Math.max(0.01, parseFloat(lambdaStr) || 0.5));

    setSmoothing(true);
    setProgress(0);

    try {
      await onApply({
        iterations,
        lambda,
        selectedIndices: Array.from(selectedIndices),
        onProgress: setProgress,
      });
    } finally {
      setSmoothing(false);
      setProgress(0);
      setSelectedIndices(new Set());
      onClose();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !smoothing) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Smooth Meshes</DialogTitle>
        </DialogHeader>

        {smoothing ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="text-primary-light text-sm font-medium">
              Smoothing... {progress}%
            </div>
            <div className="w-full h-2 rounded-full bg-primary/20 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="smooth-iterations">Iterations</Label>
                <Input
                  id="smooth-iterations"
                  type="number"
                  min={1}
                  max={100}
                  value={iterationsStr}
                  onChange={(e) => setIterationsStr(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="smooth-lambda">Smooth Factor</Label>
                <Input
                  id="smooth-lambda"
                  type="number"
                  min={0.01}
                  max={1}
                  step={0.05}
                  value={lambdaStr}
                  onChange={(e) => setLambdaStr(e.target.value)}
                />
              </div>

              {meshNames.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label>Select STLs to Smooth</Label>
                  <div className="max-h-40 overflow-y-auto flex flex-col gap-2 rounded border border-primary/20 p-2">
                    {meshNames.map((m) => (
                      <label
                        key={m.index}
                        className="flex items-center gap-2 cursor-pointer text-sm text-primary-light"
                      >
                        <Checkbox
                          checked={selectedIndices.has(m.index)}
                          onCheckedChange={() => toggleIndex(m.index)}
                        />
                        <span className="truncate">{m.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                disabled={selectedIndices.size === 0}
                onClick={handleApply}
              >
                Apply
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SmoothDialog;
