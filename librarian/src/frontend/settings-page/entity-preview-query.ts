import { gql } from "@apollo/client";
import { planEntity } from "../../core/plan-scene.js";
import {
  SCENE_FIELDS,
  GALLERY_FIELDS,
  IMAGE_FIELDS,
} from "../shared/scene-query-fields.js";

// items alias keeps the response shape identical across the three types
export const SAMPLE_QUERIES: Record<string, any> = {
  scenes: gql(`
    query LibrarianSampleScenes($entity_filter: SceneFilterType, $filter: FindFilterType) {
      result: findScenes(scene_filter: $entity_filter, filter: $filter) {
        count
        items: scenes { ${SCENE_FIELDS} }
      }
    }
  `),
  galleries: gql(`
    query LibrarianSampleGalleries($entity_filter: GalleryFilterType, $filter: FindFilterType) {
      result: findGalleries(gallery_filter: $entity_filter, filter: $filter) {
        count
        items: galleries { ${GALLERY_FIELDS} }
      }
    }
  `),
  images: gql(`
    query LibrarianSampleImages($entity_filter: ImageFilterType, $filter: FindFilterType) {
      result: findImages(image_filter: $entity_filter, filter: $filter) {
        count
        items: images { ${IMAGE_FIELDS} }
      }
    }
  `),
};

export const SAMPLE_SIZE = 10;

export type SortDirection = "ASC" | "DESC";

export interface PreviewSortField {
  // Stable key for the field dropdown's value/key, not itself sent to Stash.
  value: string;
  label: string;
  sort: string;
  defaultDirection: SortDirection;
}

export const PREVIEW_SORT_FIELDS: PreviewSortField[] = [
  { value: "random", label: "Random", sort: "random", defaultDirection: "ASC" },
  {
    value: "created_at",
    label: "Date added",
    sort: "created_at",
    defaultDirection: "DESC",
  },
  { value: "title", label: "Title", sort: "title", defaultDirection: "ASC" },
  {
    value: "rating",
    label: "Rating",
    sort: "rating",
    defaultDirection: "DESC",
  },
];

export const DEFAULT_PREVIEW_SORT_FIELD = PREVIEW_SORT_FIELDS[0];

export interface PreviewSort {
  field: string;
  direction: SortDirection;
}

export const DEFAULT_PREVIEW_SORT: PreviewSort = {
  field: "created_at",
  direction: "DESC",
};

export function changeSortField(field: string): PreviewSort {
  const f = PREVIEW_SORT_FIELDS.find((x) => x.value === field);
  return {
    field,
    direction: f ? f.defaultDirection : DEFAULT_PREVIEW_SORT.direction,
  };
}

export function toggleSortDirection(sort: PreviewSort): PreviewSort {
  return { ...sort, direction: sort.direction === "ASC" ? "DESC" : "ASC" };
}

function sortFilter(sort: PreviewSort | undefined, page: number): any {
  const chosen = sort || DEFAULT_PREVIEW_SORT;
  const field =
    PREVIEW_SORT_FIELDS.find((f) => f.value === chosen.field) ||
    DEFAULT_PREVIEW_SORT_FIELD;
  return {
    page,
    per_page: SAMPLE_SIZE,
    sort: field.sort,
    direction: chosen.direction,
  };
}

export function fetchPreviewRows(
  client: any,
  entityFilter: any,
  config: any,
  sort?: PreviewSort,
  entityType: string = "scenes",
) {
  return client
    .query({
      query: SAMPLE_QUERIES[entityType] || SAMPLE_QUERIES.scenes,
      variables: { entity_filter: entityFilter, filter: sortFilter(sort, 1) },
      fetchPolicy: "network-only",
    })
    .then(({ data }: any) => {
      const items = (data && data.result && data.result.items) || [];
      return items.map((entity: any) => ({
        scene: entity,
        plan: planEntity(entity, config, entityType),
      }));
    });
}

// We can't keep going forever, try at most 5 pages of results to
// find SAMPLE_SIZE entities to show in the preview
const MAX_SCOPED_PAGES = 5;

export async function fetchScopedPreviewRows(
  client: any,
  entityFilter: any,
  config: any,
  sort: PreviewSort | undefined,
  isStolen: (plan: any) => boolean,
  entityType: string = "scenes",
) {
  const collected: { scene: any; plan: any }[] = [];
  let page = 1;
  while (collected.length < SAMPLE_SIZE && page <= MAX_SCOPED_PAGES) {
    const { data }: any = await client.query({
      query: SAMPLE_QUERIES[entityType] || SAMPLE_QUERIES.scenes,
      variables: { entity_filter: entityFilter, filter: sortFilter(sort, page) },
      fetchPolicy: "network-only",
    });
    const items = (data && data.result && data.result.items) || [];
    if (items.length === 0) {
      break;
    }
    for (const entity of items) {
      const plan = planEntity(entity, config, entityType);
      if (!isStolen(plan)) {
        collected.push({ scene: entity, plan });
        if (collected.length >= SAMPLE_SIZE) {
          break;
        }
      }
    }
    if (items.length < SAMPLE_SIZE) {
      // Reached the last page of matches; no point requesting another.
      break;
    }
    page++;
  }
  return collected;
}
