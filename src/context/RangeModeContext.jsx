import { createContext, useContext, useState } from 'react';

const RangeModeContext = createContext(null);

/**
 * Range Mode — Section 3 "Specialized UX Views."
 *
 * Toggled from the header. Switches the whole app into a high-contrast,
 * touch-first layout for outdoor bench use: full viewport width, larger
 * tap targets, maximum contrast for direct sunlight. Individual
 * components read `rangeMode` and adjust their own classes/sizing.
 */
export function RangeModeProvider({ children }) {
  const [rangeMode, setRangeMode] = useState(false);
  const toggleRangeMode = () => setRangeMode((prev) => !prev);

  return (
    <RangeModeContext.Provider value={{ rangeMode, toggleRangeMode }}>
      {children}
    </RangeModeContext.Provider>
  );
}

export function useRangeMode() {
  const ctx = useContext(RangeModeContext);
  if (!ctx) {
    throw new Error('useRangeMode must be used within a RangeModeProvider');
  }
  return ctx;
}
