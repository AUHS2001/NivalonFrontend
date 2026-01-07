import React, { createContext, useState, ReactNode, FC } from 'react';

export interface Series {
  series_instance_uid: string;
  series_number: string;
  description: string;
  modality: string;
  num_series_instances: number;
  instance_urls: string[];
}

// Define the shape of your context state and updater function
interface StlInstanceContextValue {
  stlInstanceId: string | null;
  updateStlInstanceId: (newId: string | null) => void;
  seriesName: string | null;
  updateSeriesName: (newName: string | null) => void;
  seriesList: Series[];
  updateSeriesList: (newList: Series[]) => void;
  seriesName1: string | null;
  updateSeriesName1: (newName: string | null) => void;
}

// Create the context with default undefined for proper null checking
export const StlInstanceContext = createContext<StlInstanceContextValue | undefined>(undefined);

// Define props for the provider component
interface StlInstanceProviderProps {
  children: ReactNode;
}

// Provider component with typing
export const StlInstanceProvider: FC<StlInstanceProviderProps> = ({ children }) => {
  const [stlInstanceId, setStlInstanceId] = useState<string | null>(null);
  const [seriesName, setSeriesName] = useState<string | null>(null);
  const [seriesName1, setSeriesName1] = useState<string | null>(null);
  const [seriesList, setSeriesList] = useState<Series[]>([]);

  const updateStlInstanceId = (newId: string | null) => {
    setStlInstanceId(newId);
  };

  const updateSeriesName = (newName: string | null) => {
    setSeriesName(newName);
  };

  const updateSeriesList = (newList: Series[]) => {
    setSeriesList(newList);
  };

  const updateSeriesName1 = (newName: string | null) => {
    setSeriesName1(newName);
  };


  return (
    <StlInstanceContext.Provider value={{
        stlInstanceId,
        updateStlInstanceId,
        seriesName,
        updateSeriesName,
        seriesList,
        updateSeriesList,
        seriesName1,
        updateSeriesName1
      }}>
      {children}
    </StlInstanceContext.Provider>
  );
};
