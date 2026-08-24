# Doppelganger

A [Stash](https://github.com/stashapp/stash) plugin that finds two kinds of duplicate Stash
itself hides:

- scenes, performers, tags, and studios matched to the same stash-box entry more than once — the
  kind of duplicate created by re-scraping or re-importing the same content, which Stash's built-in
  perceptual-hash duplicate finder can't catch (it's aimed at re-encodes of the same source video,
  not user-error duplicates); and
- scenes holding several byte-identical copies of the same file, which a scan silently folds into
  one scene entry, so the duplicate files never show up anywhere.

## Motivation

Stash's own duplicate scanner uses phash, which is useless for the much more common case: a scene
(or performer, or studio) accidentally matched/scraped against the same stash-box entry twice,
under two different local IDs. Since a StashID pairs an endpoint with an entity, two entities
sharing the same `(stash_id, endpoint)` are near-certainly the same real-world thing.

### Identical copies

A scan attaches a new file to an existing scene when its oshash (file size plus checksums of the
first and last 64 KB) matches a file already on that scene. That is meant for keeping alternate
encodes together, but in practice it means a second download of the same file vanishes into the
existing scene. Doppelganger lists every scene whose files share an oshash, side by side, and
deletes the copies you don't want through Stash's own `deleteFiles` mutation — which honours the
trash path configured under Settings > System, when there is one.

## Usage

Open **Settings > Plugins > Doppelganger** and click **Find duplicates** (or go straight to
`/plugins/doppelganger`).

Stash-box duplicates are listed per entity type. Scenes, performers, and tags get a **Merge...**
button that opens Stash's own merge dialog, so relationships are combined and conflicts resolved
exactly as they would be from the entity page. Studios are listed for awareness only: Stash has no
`studioMerge` mutation, so those need to be resolved manually.

**Scenes with identical copies** shows each affected scene with its copies; the current primary
file is selected as the keeper by default and any row can be picked instead. **Delete N copies**
handles one scene, **Delete all extra copies** runs every scene in sequence with a progress bar and
a stop button. Both confirm first and say whether files go to the trash folder or are removed
permanently.

## Scope

Frontend-only (no `exec`/`interface` in `doppelganger.yml`) — detection runs live via Stash's
`querySQL` mutation (no direct database file access). Merging goes through Stash's existing merge
dialogs, and file deletion through Stash's `deleteFiles` mutation, which refuses to remove a
scene's primary file, so no sequence of actions can leave a scene without one. Never `execSQL`.

## Development

```sh
pnpm install        # once, from the repo root
pnpm --filter doppelganger run build
pnpm --filter doppelganger run typecheck
pnpm --filter doppelganger run test
```

See the repo root [README](../README.md) for the full monorepo build/publish flow.
