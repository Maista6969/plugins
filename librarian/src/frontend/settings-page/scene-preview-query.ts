import { gql } from "@apollo/client";
import { planScene } from "../../core/plan-scene.js";
import { SCENE_FIELDS } from "../shared/scene-query-fields.js";

export const SAMPLE_SCENES_QUERY = gql(`
  query LibrarianSamplePreview($scene_filter: SceneFilterType, $filter: FindFilterType) {
    findScenes(scene_filter: $scene_filter, filter: $filter) {
      count
      scenes { ${SCENE_FIELDS} }
    }
  }
`);

export const SAMPLE_SIZE = 10;

// Cheaper query just for the count, single aggregate in sqlite database
export const SCENE_COUNT_QUERY = gql(`
  query LibrarianSceneCount($scene_filter: SceneFilterType) {
    findScenes(scene_filter: $scene_filter) {
      count
    }
  }
`);

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
  sceneFilter: any,
  config: any,
  sort?: PreviewSort,
) {
  return client
    .query({
      query: SAMPLE_SCENES_QUERY,
      variables: { scene_filter: sceneFilter, filter: sortFilter(sort, 1) },
      fetchPolicy: "network-only",
    })
    .then(({ data }: any) => {
      const scenes = (data && data.findScenes && data.findScenes.scenes) || [];
      return scenes.map((scene: any) => ({
        scene,
        plan: planScene(scene, config),
      }));
    });
}

// We can't keep going forever, try at most 5 pages of results to
// find SAMPLE_SIZE scenes to show in the preview
const MAX_SCOPED_PAGES = 5;

export async function fetchScopedPreviewRows(
  client: any,
  sceneFilter: any,
  config: any,
  sort: PreviewSort | undefined,
  isStolen: (plan: any) => boolean,
) {
  const collected: { scene: any; plan: any }[] = [];
  let page = 1;
  while (collected.length < SAMPLE_SIZE && page <= MAX_SCOPED_PAGES) {
    const { data }: any = await client.query({
      query: SAMPLE_SCENES_QUERY,
      variables: { scene_filter: sceneFilter, filter: sortFilter(sort, page) },
      fetchPolicy: "network-only",
    });
    const scenes = (data && data.findScenes && data.findScenes.scenes) || [];
    if (scenes.length === 0) {
      break;
    }
    for (const scene of scenes) {
      const plan = planScene(scene, config);
      if (!isStolen(plan)) {
        collected.push({ scene, plan });
        if (collected.length >= SAMPLE_SIZE) {
          break;
        }
      }
    }
    if (scenes.length < SAMPLE_SIZE) {
      // Reached the last page of matches; no point requesting another.
      break;
    }
    page++;
  }
  return collected;
}
