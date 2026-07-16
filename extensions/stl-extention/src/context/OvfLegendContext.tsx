import React, { createContext, useContext, useState, ReactNode } from 'react';

interface OvfLegendEntry {
  name: string;
  color: string;
}

interface OvfLegendContextType {
  vertebraLegend: OvfLegendEntry[];
  setVertebraLegend: (legend: OvfLegendEntry[]) => void;
}

const OvfLegendContext = createContext<OvfLegendContextType | undefined>(undefined);

export const OvfLegendProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [vertebraLegend, setVertebraLegend] = useState<OvfLegendEntry[]>([]);

  return (
    <OvfLegendContext.Provider value={{ vertebraLegend, setVertebraLegend }}>
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
