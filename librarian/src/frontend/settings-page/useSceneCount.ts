import { useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { SCENE_COUNT_QUERY } from "./scene-preview-query.js";

const DEBOUNCE_MS = 350;

export function useSceneCount(sceneFilter: any): number | null {
  const client = useApolloClient();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (sceneFilter === undefined) {
      setCount(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      client
        .query({
          query: SCENE_COUNT_QUERY,
          variables: { scene_filter: sceneFilter },
          fetchPolicy: "network-only",
        })
        .then(({ data }: any) => {
          if (!cancelled) {
            setCount(data && data.findScenes ? data.findScenes.count : null);
          }
        })
        .catch(() => {
          if (!cancelled) setCount(null);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, JSON.stringify(sceneFilter)]);

  return count;
}
