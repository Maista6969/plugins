import React, { createContext, useContext, useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { fetchLibraryPaths, LibraryPathsByType } from "./stash-api.js";

const EMPTY_PATHS: LibraryPathsByType = {
  scenes: [],
  galleries: [],
  images: [],
};

interface LibraryPathsValue {
  // valid roots for scenes, which is all the settings page edits today
  paths: string[];
  pathsByType: LibraryPathsByType;
  loading: boolean;
}

const LibraryPathsContext = createContext<LibraryPathsValue>({
  paths: [],
  pathsByType: EMPTY_PATHS,
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
  const [pathsByType, setPathsByType] =
    useState<LibraryPathsByType>(EMPTY_PATHS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchLibraryPaths(client)
      .then((result) => {
        if (!cancelled) setPathsByType(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <LibraryPathsContext.Provider
      value={{ paths: pathsByType.scenes, pathsByType, loading }}
    >
      {children}
    </LibraryPathsContext.Provider>
  );
}
