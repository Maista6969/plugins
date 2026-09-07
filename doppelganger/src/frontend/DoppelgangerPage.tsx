import React, { useCallback, useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import {
  findDuplicateScenes,
  findDuplicatePerformers,
  findDuplicateTags,
  findDuplicateStudios,
  findIdenticalCopies,
  fetchStashBoxes,
  fetchDeleteTrashPath,
  StashBoxSummary,
} from "./shared/stash-api.js";
import { DuplicateGroupList, DuplicateGroup } from "./DuplicateGroupList.js";
import {
  IdenticalCopiesList,
  IdenticalCopyGroup,
} from "./IdenticalCopiesList.js";

const PluginApi = (window as any).PluginApi;
const { Button, Nav } = PluginApi.libraries.Bootstrap;

type Tab = "scenes" | "performers" | "tags" | "studios";

const TABS: { key: Tab; label: string }[] = [
  { key: "scenes", label: "Scenes" },
  { key: "performers", label: "Performers" },
  { key: "tags", label: "Tags" },
  { key: "studios", label: "Studios" },
];

function tabLabel(label: string, counts: (number | null)[]) {
  // A tab's count is the number of things left to resolve in it, so the
  // scenes tab adds both of its sections. Nothing is shown until every
  // section in the tab has loaded, so the number never jumps.
  if (counts.some((c) => c === null)) return label;
  const total = counts.reduce<number>((n, c) => n + (c ?? 0), 0);
  return `${label} (${total})`;
}

export function DoppelgangerPage() {
  const client = useApolloClient();
  const [tab, setTab] = useState<Tab>("scenes");
  const [scenes, setScenes] = useState<DuplicateGroup[] | null>(null);
  const [performers, setPerformers] = useState<DuplicateGroup[] | null>(null);
  const [tags, setTags] = useState<DuplicateGroup[] | null>(null);
  const [studios, setStudios] = useState<DuplicateGroup[] | null>(null);
  const [copies, setCopies] = useState<IdenticalCopyGroup[] | null>(null);
  const [stashBoxes, setStashBoxes] = useState<StashBoxSummary[]>([]);
  const [trashPath, setTrashPath] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchStashBoxes(client).then((boxes) => {
      if (!cancelled) setStashBoxes(boxes);
    });
    fetchDeleteTrashPath(client).then((path) => {
      if (!cancelled) setTrashPath(path);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const refresh = useCallback(() => {
    setScenes(null);
    setCopies(null);
    setPerformers(null);
    setTags(null);
    setStudios(null);
    findDuplicateScenes(client).then(setScenes);
    findIdenticalCopies(client).then(setCopies);
    findDuplicatePerformers(client).then(setPerformers);
    findDuplicateTags(client).then(setTags);
    findDuplicateStudios(client).then(setStudios);
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const counts: Record<Tab, (number | null)[]> = {
    scenes: [scenes?.length ?? null, copies?.length ?? null],
    performers: [performers?.length ?? null],
    tags: [tags?.length ?? null],
    studios: [studios?.length ?? null],
  };

  return (
    <div className="container">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2>Doppelganger</h2>
        <Button variant="secondary" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <Nav
        variant="tabs"
        className="mb-3"
        activeKey={tab}
        onSelect={(k: string | null) => k && setTab(k as Tab)}
      >
        {TABS.map(({ key, label }) => (
          <Nav.Item key={key}>
            <Nav.Link eventKey={key}>{tabLabel(label, counts[key])}</Nav.Link>
          </Nav.Item>
        ))}
      </Nav>

      {/* Keyed so switching tabs remounts the panel: an open merge dialog or a
          half-chosen keeper never leaks into another tab. */}
      <div className="pt-2" key={tab}>
        {tab === "scenes" && (
          <>
            <DuplicateGroupList
              title="Duplicate scenes"
              description="Scenes matched to the same stash-box entry more than once."
              entityPath="scenes"
              groups={scenes}
              stashBoxes={stashBoxes}
              mergeKind="scene"
              onMerged={refresh}
            />
            <IdenticalCopiesList
              groups={copies}
              trashPath={trashPath}
              onDeleted={refresh}
            />
          </>
        )}

        {tab === "performers" && (
          <DuplicateGroupList
            title="Duplicate performers"
            description="Performers matched to the same stash-box entry more than once."
            entityPath="performers"
            groups={performers}
            stashBoxes={stashBoxes}
            mergeKind="performer"
            onMerged={refresh}
          />
        )}

        {tab === "tags" && (
          <DuplicateGroupList
            title="Duplicate tags"
            description="Tags matched to the same stash-box entry more than once."
            entityPath="tags"
            groups={tags}
            stashBoxes={stashBoxes}
            mergeKind="tag"
            onMerged={refresh}
          />
        )}

        {tab === "studios" && (
          <DuplicateGroupList
            title="Duplicate studios"
            description="Studios matched to the same stash-box entry more than once. Stash has no built-in studio merge, so these need to be resolved manually."
            entityPath="studios"
            groups={studios}
            stashBoxes={stashBoxes}
          />
        )}
      </div>
    </div>
  );
}
