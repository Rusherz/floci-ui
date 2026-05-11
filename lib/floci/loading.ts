import { useEffect, useMemo, useState } from 'react';

// Shared loading contract for service pages.
export type InitialLoadingState = {
  hasLoadedOnce: boolean;
  isInitialLoading: boolean;
};

// Convention: initial skeletons should render only before first successful data hydration.
export function useInitialLoading(loading: boolean): InitialLoadingState {
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (!loading && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [hasLoadedOnce, loading]);

  return useMemo(
    () => ({
      hasLoadedOnce,
      isInitialLoading: loading && !hasLoadedOnce,
    }),
    [hasLoadedOnce, loading]
  );
}
