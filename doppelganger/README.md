# Doppelganger

A [Stash](https://github.com/stashapp/stash) plugin that finds scenes, performers, and studios
matched to the same stash-box entry more than once — the kind of duplicate created by re-scraping
or re-importing the same content, which Stash's built-in perceptual-hash duplicate finder can't
catch (it's aimed at re-encodes of the same source video, not user-error duplicates).

## Motivation

Stash's own duplicate scanner uses phash, which is useless for the much more common case: a scene
(or performer, or studio) accidentally matched/scraped against the same stash-box entry twice,
under two different local IDs. Since a StashID pairs an endpoint with an entity, two entities
sharing the same `(stash_id, endpoint)` are near-certainly the same real-world thing.

## Usage

Open **Settings > Plugins > Doppelganger** and click **Find duplicates** (or go straight to
`/plugins/doppelganger`). Three sections list duplicate scenes, performers, and studios. Scenes
and performers get a one-click **Merge** button (using Stash's own `sceneMerge`/`performerMerge`
mutations — the older/lowest-ID entry is always the merge destination). Studios are listed for
awareness only: Stash has no `studioMerge` mutation, so those need to be resolved manually.

## Scope

Frontend-only (no `exec`/`interface` in `doppelganger.yml`) — detection runs live via Stash's
`querySQL` mutation (no direct database file access), and resolution goes through Stash's existing
merge mutations, never `execSQL`.

## Development

```sh
pnpm install        # once, from the repo root
pnpm --filter doppelganger run build
pnpm --filter doppelganger run typecheck
pnpm --filter doppelganger run test
```

See the repo root [README](../README.md) for the full monorepo build/publish flow.
