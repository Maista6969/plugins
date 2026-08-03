import React, { createContext, useContext, useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { fetchLibraryPaths } from "./stash-api.js";

interface LibraryPathsValue {
  paths: string[];
  loading: boolean;
}

const LibraryPathsContext = createContext<LibraryPathsValue>({
  paths: [],
  loading: true,
});

export function useLibraryPaths(): LibraryPathsValue {
  return useContext(LibraryPathsContext);
}

export function LibraryPathsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = useApolloClient();
  const [paths, setPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchLibraryPaths(client)
      .then((result) => {
        if (!cancelled) setPaths(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <LibraryPathsContext.Provider value={{ paths, loading }}>
      {children}
    </LibraryPathsContext.Provider>
  );
}
