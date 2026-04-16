import React, { createContext, useContext, useRef, useCallback, useSyncExternalStore, ReactNode } from 'react';

export interface ToolDef {
  id: string;
  label: string;
  icon: string;
  active: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

interface ThreeDToolsBridgeContextType {
  getTools: () => ToolDef[];
  registerTools: (tools: ToolDef[]) => void;
  subscribe: (cb: () => void) => () => void;
}

const ThreeDToolsBridgeContext = createContext<ThreeDToolsBridgeContextType | undefined>(undefined);

interface ThreeDToolsBridgeProviderProps {
  children: ReactNode;
}

export const ThreeDToolsBridgeProvider: React.FC<ThreeDToolsBridgeProviderProps> = ({ children }) => {
  const toolsRef = useRef<ToolDef[]>([]);
  const listenersRef = useRef(new Set<() => void>());

  const getTools = useCallback(() => toolsRef.current, []);

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  const registerTools = useCallback((newTools: ToolDef[]) => {
    toolsRef.current = newTools;
    listenersRef.current.forEach(cb => cb());
  }, []);

  const valueRef = useRef({ getTools, registerTools, subscribe });

  return (
    <ThreeDToolsBridgeContext.Provider value={valueRef.current}>
      {children}
    </ThreeDToolsBridgeContext.Provider>
  );
};

export const useThreeDToolsBridge = () => {
  const context = useContext(ThreeDToolsBridgeContext);
  if (context === undefined) {
    throw new Error('useThreeDToolsBridge must be used within a ThreeDToolsBridgeProvider');
  }
  return context;
};

/** Hook that subscribes to tool changes — only re-renders the consuming component */
export const useThreeDTools = (): ToolDef[] => {
  const { getTools, subscribe } = useThreeDToolsBridge();
  return useSyncExternalStore(subscribe, getTools);
};
