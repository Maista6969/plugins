import { useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { gql } from "@apollo/client";

const DEBOUNCE_MS = 350;

// Cheaper than fetching rows: a single aggregate in the sqlite database
const COUNT_QUERIES: Record<string, any> = {
  scenes: gql(`
    query LibrarianSceneCount($entity_filter: SceneFilterType) {
      result: findScenes(scene_filter: $entity_filter) { count }
    }
  `),
  galleries: gql(`
    query LibrarianGalleryCount($entity_filter: GalleryFilterType) {
      result: findGalleries(gallery_filter: $entity_filter) { count }
    }
  `),
  images: gql(`
    query LibrarianImageCount($entity_filter: ImageFilterType) {
      result: findImages(image_filter: $entity_filter) { count }
    }
  `),
};

export function useEntityCount(
  entityType: string,
  entityFilter: any,
): number | null {
  const client = useApolloClient();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (entityFilter === undefined) {
      setCount(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      client
        .query({
          query: COUNT_QUERIES[entityType] || COUNT_QUERIES.scenes,
          variables: { entity_filter: entityFilter },
          fetchPolicy: "network-only",
        })
        .then(({ data }: any) => {
          if (!cancelled) {
            setCount(data && data.result ? data.result.count : null);
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
  }, [client, entityType, JSON.stringify(entityFilter)]);

  return count;
}
