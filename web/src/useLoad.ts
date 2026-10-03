import { useCallback, useEffect, useState } from "react";

/** Loads data for the current inputs; ignores responses from superseded requests. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    load().then(
      (data) => active && setState({ data, error: null, loading: false }),
      (error: Error) => active && setState({ data: null, error: error.message, loading: false }),
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { ...state, reload, setData: (data: T) => setState({ data, error: null, loading: false }) };
}
