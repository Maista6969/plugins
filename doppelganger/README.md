# Doppelganger

A [Stash](https://github.com/stashapp/stash) plugin that finds two kinds of duplicate Stash
itself hides:

- scenes, performers, tags, and studios matched to the same stash-box entry more than once — the
  kind of duplicate created by re-scraping or re-importing the same content, which Stash's built-in
  perceptual-hash duplicate finder can't catch (it's aimed at re-encodes of the same source video,
  not user-error duplicates); and
- scenes holding more than one file, either byte-identical copies a scan silently folded into one
  scene entry, or alternate encodes a merge moved onto the same scene, so the extra files never
  show up anywhere.

## Motivation

Stash's own duplicate scanner uses phash, which is useless for the much more common case: a scene
(or performer, or studio) accidentally matched/scraped against the same stash-box entry twice,
under two different local IDs. Since a StashID pairs an endpoint with an entity, two entities
sharing the same `(stash_id, endpoint)` are near-certainly the same real-world thing.

### Scenes with multiple files

A scan attaches a new file to an existing scene when its oshash (file size plus checksums of the
first and last 64 KB) or MD5 matches a file already on that scene, so a second download of the same
file vanishes into the existing scene. A merge does the same with every file of the merged scenes,
which is how alternate encodes end up together. Doppelganger lists every scene with more than one
file, marks byte-identical copies, and deletes the files you don't want through Stash's own
`deleteFiles` mutation — which honours the trash path configured under Settings > System, when
there is one.

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

**Scenes with multiple files** works like Stash's own scene duplicate checker, one row per file:
ticked files are deleted. **Select Options…** offers the same rules — keep the highest resolution,
the largest file, the preferred codec, the oldest or the youngest — plus keep the highest bit rate,
along with the preferred codec picker and the "only select if all codecs match" guard. Unlike
Stash, the chosen rule is stored in the plugin's configuration and applied every time the list
loads. Byte-identical copies always keep the primary file, since any copy is as good as another,
and ties keep the primary too. Boxes can be changed by hand, but the last file of a scene can't be
ticked. **Delete N files** handles one scene, **Delete selected files** runs every scene in
sequence with a progress bar and a stop button. Both confirm first and say whether files go to the
trash folder or are removed permanently.

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
