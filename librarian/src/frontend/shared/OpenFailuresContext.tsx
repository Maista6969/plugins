import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useApolloClient } from "@apollo/client";
import { openFailures, clearOpenFailures } from "../../core/run-results.js";
import {
  fetchResultsStore,
  saveResultsStore,
  RunFailure,
} from "./stash-api.js";

interface OpenFailuresValue {
  store: any;
  reload: () => void;
  clear: (entityType: string) => Promise<void>;
}

const OpenFailuresContext = createContext<OpenFailuresValue | null>(null);

// What renaming has not managed yet, by type, kept by the backend in the
// results key and re-read whenever a run started here finishes
export function OpenFailuresProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = useApolloClient();
  const [store, setStore] = useState<any>(null);

  const reload = useCallback(async () => {
    try {
      setStore(await fetchResultsStore(client));
    } catch (e) {
      // the list is a convenience: leave whatever was shown
    }
  }, [client]);

  useEffect(() => {
    reload();
  }, [reload]);

  // re-read first, so a run that finished meanwhile is not written over
  const clear = useCallback(
    async (entityType: string) => {
      const next = clearOpenFailures(
        await fetchResultsStore(client),
        entityType,
      );
      await saveResultsStore(client, next);
      setStore(next);
    },
    [client],
  );

  return (
    <OpenFailuresContext.Provider value={{ store, reload, clear }}>
      {children}
    </OpenFailuresContext.Provider>
  );
}

export function failuresById(
  failures: RunFailure[],
): Record<string, RunFailure> {
  const byId: Record<string, RunFailure> = {};
  failures.forEach((f) => {
    if (f.id != null) {
      byId[f.id] = f;
    }
  });
  return byId;
}

// empty outside a provider
export function useOpenFailures(entityType: string) {
  const context = useContext(OpenFailuresContext);
  const list: RunFailure[] = context
    ? openFailures(context.store, entityType)
    : [];
  return {
    list,
    byId: failuresById(list),
    clear: () => (context ? context.clear(entityType) : Promise.resolve()),
  };
}

export function useReloadOpenFailures(): () => void {
  const context = useContext(OpenFailuresContext);
  return context ? context.reload : () => {};
}
