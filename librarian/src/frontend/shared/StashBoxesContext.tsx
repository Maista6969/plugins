import React, { createContext, useContext, useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { fetchStashBoxes, StashBoxSummary } from "./stash-api.js";

interface StashBoxesValue {
  stashBoxes: StashBoxSummary[];
  loading: boolean;
}

const StashBoxesContext = createContext<StashBoxesValue>({
  stashBoxes: [],
  loading: true,
});

export function useStashBoxes(): StashBoxesValue {
  return useContext(StashBoxesContext);
}

export function StashBoxesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = useApolloClient();
  const [stashBoxes, setStashBoxes] = useState<StashBoxSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchStashBoxes(client)
      .then((result) => {
        if (!cancelled) setStashBoxes(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <StashBoxesContext.Provider value={{ stashBoxes, loading }}>
      {children}
    </StashBoxesContext.Provider>
  );
}
