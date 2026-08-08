import { useEffect, useState } from "react";
import { useApolloClient, gql } from "@apollo/client";
import { ENTITY_TYPES } from "../../core/config-schema.js";

const STATS_QUERY = gql(`
  query LibrarianEntityCounts {
    stats {
      scene_count
      gallery_count
      image_count
    }
  }
`);

const STAT_KEY: Record<string, string> = {
  scenes: "scene_count",
  galleries: "gallery_count",
  images: "image_count",
};

export interface EntityCounts {
  counts: Record<string, number> | null;
  loading: boolean;
}

export function useEntityCounts(): EntityCounts {
  const client = useApolloClient();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    client
      .query({ query: STATS_QUERY, fetchPolicy: "network-only" })
      .then(({ data }: any) => {
        if (cancelled) return;
        const stats = (data && data.stats) || {};
        const next: Record<string, number> = {};
        ENTITY_TYPES.forEach((type) => {
          next[type] = stats[STAT_KEY[type]] || 0;
        });
        setCounts(next);
      })
      .catch(() => {
        // if the count cannot be fetched, show every tab rather than hiding
        // settings the user may need
        if (!cancelled) setCounts(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return { counts, loading };
}
