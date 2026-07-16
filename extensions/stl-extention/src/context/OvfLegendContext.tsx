import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface OvfLegendEntry {
  name: string;
  color: string;
}

interface OvfLegendContextType {
  vertebraLegend: OvfLegendEntry[];
  setVertebraLegend: (legend: OvfLegendEntry[]) => void;
  colorsDisabled: boolean;
  setColorsDisabled: (disabled: boolean) => void;
  hiddenVertebrae: Set<string>;
  toggleVertebraVisibility: (name: string) => void;
  selectedPreset: string | null;
  setSelectedPreset: (preset: string | null) => void;
}

const OvfLegendContext = createContext<OvfLegendContextType | undefined>(undefined);

export const OvfLegendProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [vertebraLegend, setVertebraLegend] = useState<OvfLegendEntry[]>([]);
  const [colorsDisabled, setColorsDisabled] = useState(false);
  const [hiddenVertebrae, setHiddenVertebrae] = useState<Set<string>>(new Set());
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const toggleVertebraVisibility = useCallback((name: string) => {
    setHiddenVertebrae(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  return (
    <OvfLegendContext.Provider value={{ vertebraLegend, setVertebraLegend, colorsDisabled, setColorsDisabled, hiddenVertebrae, toggleVertebraVisibility, selectedPreset, setSelectedPreset }}>
      {children}
    </OvfLegendContext.Provider>
  );
};

export const useOvfLegendContext = (): OvfLegendContextType => {
  const context = useContext(OvfLegendContext);
  if (context === undefined) {
    throw new Error('useOvfLegendContext must be used within an OvfLegendProvider');
  }
  return context;
};
