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

Open **Settings > Tools > Doppelganger** (it sits under Stash's own Scene duplicate checker), or
**Settings > Plugins > Doppelganger > Find duplicates**, or go straight to `/plugins/doppelganger`.
Each entity type has its own tab.

Stash-box duplicates are listed per entity type. Scenes, performers, and tags get a **Merge...**
button that opens Stash's own merge dialog, so relationships, play counts and history are combined
and conflicts resolved exactly as they would be from the entity page. Studios are listed for
awareness only: Stash has no `studioMerge` mutation, so those need to be resolved manually.

Two scenes on one stash-box entry are either the same scene in different encodes, or different
scenes whose fingerprint was matched to the wrong entry. Each scene in a group shows its running
time, and Doppelganger asks the stash-box (through Stash's own scraper endpoint, one request per
group) for the entry's running time, shown under the box name. A scene within 7 seconds of it is
highlighted in green as the real match. The two cases get different tools:

- **Merge...** for the same scene. After Stash's merge, which attaches every source file to the
  destination, Doppelganger shows the merged scene's files side by side (resolution, codec,
  duration, size) and offers to delete all but the one you pick, through Stash's `deleteFiles`.
  **Keep all files** leaves the scene as Stash merged it. Once you trust the process, the cog
  next to **Refresh** has a setting to skip this chooser and always keep the merge target's
  primary file; it is stored in the plugin's configuration, so it follows the Stash instance.
- **Unlink...** for a wrong match. Removes that scene's stash ID for the entry, so it stops being
  reported, and offers to clear the metadata the match filled in. Fields whose value is identical
  to another scene on the same entry are pre-selected, since Stash does not record which fields a
  scrape wrote and agreement is the next best evidence; untick anything you want to keep. Telling
  the stash-box itself that the fingerprint is wrong is not possible from a plugin yet: Stash's
  client has the `unmatch` field but no mutation exposes it.

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
