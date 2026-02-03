import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface Series {
  series_instance_uid: string;
  series_number: string;
  description: string;
  modality: string;
  num_series_instances: number;
  instance_urls: string[];
}

interface Study {
  study_instance_uid: string;
  patient_name: string;
  patient_id: string;
  date: string;
  time: string;
  description: string;
  series: Series[];
}

interface ComparisonContextValue {
  comparisonMode: boolean;
  showComparisonPopup: boolean;
  comparisonSeries1: Series | null;
  comparisonSeries2: Series | null;
  comparisonStudy1: Study | null;
  comparisonStudy2: Study | null;
  openComparisonPopup: () => void;
  closeComparisonPopup: () => void;
  confirmComparison: (
    series1: Series | null,
    series2: Series | null,
    study1?: Study | null,
    study2?: Study | null
  ) => void;
  exitComparison: () => void;
}

const ComparisonContext = createContext<ComparisonContextValue | undefined>(undefined);

interface ComparisonProviderProps {
  children: ReactNode;
}

export const ComparisonProvider: React.FC<ComparisonProviderProps> = ({ children }) => {
  const [comparisonMode, setComparisonMode] = useState(false);
  const [showComparisonPopup, setShowComparisonPopup] = useState(false);
  const [comparisonSeries1, setComparisonSeries1] = useState<Series | null>(null);
  const [comparisonSeries2, setComparisonSeries2] = useState<Series | null>(null);
  const [comparisonStudy1, setComparisonStudy1] = useState<Study | null>(null);
  const [comparisonStudy2, setComparisonStudy2] = useState<Study | null>(null);

  const openComparisonPopup = useCallback(() => {
    console.log('Opening comparison series selection popup');
    setShowComparisonPopup(true);
  }, []);

  const closeComparisonPopup = useCallback(() => {
    setShowComparisonPopup(false);
  }, []);

  const confirmComparison = useCallback((
    series1: Series | null,
    series2: Series | null,
    study1?: Study | null,
    study2?: Study | null
  ) => {
    if (!series1 || !series2) {
      console.error('Both series must be selected');
      return;
    }

    console.log('Activating comparison mode with series:', series1.description, 'vs', series2.description);

    setComparisonSeries1(series1);
    setComparisonSeries2(series2);
    setComparisonStudy1(study1 || null);
    setComparisonStudy2(study2 || null);
    setComparisonMode(true);
    setShowComparisonPopup(false);
  }, []);

  const exitComparison = useCallback(() => {
    setComparisonMode(false);
    setComparisonSeries1(null);
    setComparisonSeries2(null);
    setComparisonStudy1(null);
    setComparisonStudy2(null);
    console.log('Exited comparison mode');
  }, []);

  return (
    <ComparisonContext.Provider value={{
      comparisonMode,
      showComparisonPopup,
      comparisonSeries1,
      comparisonSeries2,
      comparisonStudy1,
      comparisonStudy2,
      openComparisonPopup,
      closeComparisonPopup,
      confirmComparison,
      exitComparison
    }}>
      {children}
    </ComparisonContext.Provider>
  );
};

export const useComparisonContext = () => {
  const context = useContext(ComparisonContext);
  if (!context) {
    throw new Error('useComparisonContext must be used within a ComparisonProvider');
  }
  return context;
};
