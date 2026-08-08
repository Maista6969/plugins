# Librarian

A [Stash](https://github.com/stashapp/stash) plugin that renames scene files based on your own rules and metadata.

## Motivation

There are already several options if you're looking for a plugin to rename your files so why choose Librarian?

Librarian aims to be user friendly and fast. When using Librarian you will never need to edit a configuration file yourself,
which can be finicky and error-prone, but can instead use an in-app UI that looks and feels like the rest of Stash.
Settings are stored in your Stash configuration file and will therefore be easier to keep backed up.

Librarian runs fully inside of the Stash process through the embedded Goja JavaScript virtual machine instead of relying on Python.
This means Librarian does not pay the price of forking a subprocess and is measurably faster than the alternatives.

Anyone who has felt their Stash slow down because of plugins can appreciate this!

Librarian also ensures that the Stash database and the filesystem can not drift out of sync by using
the `moveFiles` GraphQL mutation instead of directly touching the filesystem or editing the database directly.
This leaves a lot of the safety checks to Stash and makes the plugin faster (no coordination overhead) and more robust.

## Warning

As with any plugin that promises to rename your files, these changes are not reversible! There are safety measures in place
to avoid common mistakes like empty filenames or moving files out of the Stash library itself, but this has only been tested
with my own personal usecases so it's hard to predict what could go wrong with more complex patterns and rules.
Librarian will **never** delete your files or overwrite other files, but it will lose all existing information contained in the names of those files.

I recommend making frequent backups of your database and your config where the plugin settings live.

⚠️ Renaming files is not reversible! ⚠️

## Usage

- **Settings page**: Decide whether or not you want to only rename scenes that are marked Organized or have a StashID,
  configure any exclusions for the files you know you'll never want to rename, and optionally [configure your own rules](#rule)
  for subsets of your collection that need their own naming scheme. Everything that does not have its own rule will be renamed
  according to the default pattern.

<p align="center">
  <a href="https://raw.githubusercontent.com/Maista6969/plugins/blob/main/librarian/images/stash-librarian-settings.png">
    <img src="images/stash-librarian-settings.png" width="800" alt="Settings page: Options, Exclusions, and the ordered Rules list">
  </a>
</p>

- **Filtered views**: Librarian plugs into the existing Scenes page and offers its own view for whatever filters you're already using.
  This makes it easy to apply renames to subsets of your collection while you're figuring things out. Note that applying a rename from this
  view will apply to every scene that matches the filter and not just the current page!

<p align="center">
  <a href="https://raw.githubusercontent.com/Maista6969/plugins/blob/main/librarian/images/stash-librarian-scene-list-view.png">
    <img src="images/stash-librarian-scene-list-view.png" width="800" alt="Scenes page filtered rename preview: old/new path comparison table">
  </a>
</p>

- **Automatically rename files as you update**: Librarian will rename the files for any scene as soon as it's updated with
  new metadata as long as it meets the criteria you've configured in the settings. Turn off "Automatic renaming" at the
  top of the settings page's Options section to disable this and only ever rename via a manual task or the Scenes-page
  filtered view.

- **Scene page, File Info tab**: See exactly which rule would apply to any scene in the File Info tab.

<p align="center">
  <a href="https://raw.githubusercontent.com/Maista6969/plugins/blob/main/librarian/images/stash-librarian-fileinfo-tab-integration.png">
    <img src="images/stash-librarian-fileinfo-tab-integration.png" width="800" alt="Scene File Info tab: Librarian's own block appended below Stash's native file details">
  </a>
</p>

## Rule

Rules let you define new folder and filename patterns for a subset of your collection: they must have at least one condition
that defines a subset, such as having a particular set of tags or performers, belonging to a set of studios, or having a certain rating.

<p align="center">
  <a href="https://raw.githubusercontent.com/Maista6969/plugins/blob/main/librarian/images/stash-librarian-rule-editor.png">
    <img src="images/stash-librarian-rule-editor.png" width="800" alt="Rule editor modal: conditions, folder/filename patterns, and a live preview of matching scenes">
  </a>
</p>

**Pattern syntax**:

- `{token}`: required. Errors if the scene has no data for it.
- `{token?}`: optional. Renders empty instead of erroring when the scene has no data for it.
- `{token:N}`: list tokens only (`performers`, `performers_not_in_title`, `matched_performers`, `tags`, `matched_tags`). Joins at most the first N values so `{performers:3}` includes at most three names.
- `{token:N?}`: both of the above combined, e.g. `{performers_not_in_title:2?}`.
- `<...>`: wraps literal text and/or tokens as one optional-segment unit. The whole span, literal text included,
  is dropped if it contains at least one optional token and every one of them rendered empty for that scene.
  For example `{studio}<, {date?}>< - {title?}>` renders `Studio, 2024 - Title` when both are present, or just `Studio` when both are missing,
  each bracket collapsing independently. A required token inside `<...>` never triggers a collapse (it's guaranteed to have data already);
  an unknown/misspelled token counts as real content and also never triggers one, so a typo stays visible rather than silently vanishing.
- `<a|b|c>`: split a bracket on `|` to try alternatives in order, using each one's own collapse rule as the test. The first
  alternative that doesn't collapse wins: any literal-only or required-token alternative always qualifies; an optional-token
  alternative qualifies only once that token actually has data. For example `<{date?}|missing-date>` renders the date if it has one, or else the literal `missing-date`.
  Each alternative can carry its own literal text, e.g. `< ({code?})| [{date?}]>` includes the parentheses
  only when the code alternative is the one chosen, the brackets only when the date one is. Like a plain `<...>`, if every
  alternative collapses and none is a guaranteed-content fallback, the whole group renders empty.

**Folder pattern**: the folder pattern accepts the same syntax as the filename pattern, and additionally
treats three cases specially:

| Folder pattern           | Result                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------- |
| blank                    | **Keep each file in the folder it is already in**, renaming it but never moving it |
| `/`                      | Place files directly under the library root                                        |
| renders empty for a file | An error for that file, rather than a silent guess                                 |

Leaving the folder pattern blank is the option to use if you maintain your own folder hierarchy by hand,
or if an external tool depends on your existing structure, and you only want Librarian to fix filenames.

The third row covers a pattern like `{studio?}` that is not blank but happens to render to nothing for a
particular scene (here, one with no studio). Rather than quietly dropping such a file into the library
root, Librarian reports it so you can decide: write `/` if the root really is what you want, or leave the
pattern blank to keep those files where they are.

> ⚠️ **Behaviour change in version 1.0**: a blank folder pattern used to mean "put files in the library root",
> which flattened manually-organised folder hierarchies. It now means "leave files where they are".
> If you were relying on the old behaviour, change your folder pattern to `/`.

**Nesting**: a folder pattern may contain `/` or `\` to nest folders, so `{studio}/{date_year}` and
`{studio}\{date_year}` are equivalent and both produce two levels. Whichever you write, the finished
path uses your library's own separator, so a Windows library ends up with backslashes throughout
regardless of how the pattern was typed.

Only the separators you write in the pattern itself split folders. A token whose _value_ contains a
slash never does: a tag literally named `Rock/Pop` renders as the single folder `Rock Pop` rather than
nesting `Pop` inside `Rock`. The one deliberate exception is `{studio_hierarchy}`, whose whole purpose
is to expand into one folder per studio in the chain. The filename pattern never splits into
subfolders at all: a `/` or `\` there, whether literal or from a token, becomes a space.

**Available tokens**:

_Scene metadata_

| Token                                         | Description                                                                                                                                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{title}`                                     | The scene's title                                                                                                                                                                                                          |
| `{date}`                                      | The scene's date, can be partial                                                                                                                                                                                           |
| `{date_year}` / `{date_month}` / `{date_day}` | Individual date parts. Stash dates come in 3 precisions, full `YYYY-MM-DD` or partial `YYYY-MM`/`YYYY`; `{date_year}` is available from all three, `{date_month}` needs at least `YYYY-MM`, `{date_day}` needs a full date |
| `{code}`                                      | The studio code, only used by certain studios                                                                                                                                                                              |
| `{studio}`                                    | The scene's own studio                                                                                                                                                                                                     |
| `{studio_root}`                               | The top of the studio hierarchy, e.g. the network                                                                                                                                                                          |
| `{studio_hierarchy}`                          | The full chain of studios from top to bottom, joined with `/`, capped at 5 levels                                                                                                                                          |
| `{performers}`                                | All performers on the scene                                                                                                                                                                                                |
| `{performers_not_in_title}`                   | Performers not already named in the scene's title                                                                                                                                                                          |
| `{matched_performers}`                        | Only the performer(s) that satisfied this rule's own `performer` condition                                                                                                                                                 |
| `{tags}`                                      | All tags on the scene                                                                                                                                                                                                      |
| `{matched_tags}`                              | Only the tag(s) that satisfied this rule's own `tag` condition                                                                                                                                                             |
| `{rating}`                                    | 0-10 decimal scale, regardless of which rating system this Stash instance is configured to display                                                                                                                         |
| `{stash_id}`                                  | StashID from one specific, rule-configured stash-box source like StashDB or ThePornDB; see below                                                                                                                           |

_File metadata_

| Token           | Description                                         |
| --------------- | --------------------------------------------------- |
| `{resolution}`  | Uses Stash classifications like `1080p`, `4K`       |
| `{video_codec}` | `h264`, `av1`, and so on                            |
| `{audio_codec}` | `aac`, `mp3`, and so on                             |
| `{bitrate}`     | Formatted with two significant digits as `8.42Mbps` |
| `{fps}`         | Framerate, e.g. `30fps` or `23.98fps`               |
| `{phash}`       | Perceptual hash fingerprint                         |
| `{oshash}`      | OpenSubtitles hash fingerprint                      |

**`{stash_id}`**: a scene can have StashIDs from several different stash-box sources at once, and
those sources are user-named in Stash's own settings (Settings > Metadata Providers), so there's no
fixed name like "StashDB" this plugin could assume. Once a pattern uses `{stash_id}`, a "StashID
source" picker appears on that rule (or the default pattern) showing your currently configured
stash-box sources by name; pick one, and the token resolves to whichever StashID this scene actually
has from that specific source. If a scene has no StashID from the chosen source, `{stash_id}` is
missing data like any other token, an error unless written `{stash_id?}`.

`{resolution}`/`{video_codec}`/`{audio_codec}`/`{bitrate}`/`{fps}`/`{phash}` describe the specific file
being renamed, not the scene as a whole: a scene with both a 1080p copy and a 4K remux renders each
file's own filename (and folder, if referenced there too) from that file's own specs, so a
collection with multiple qualities of the same scene ends up correctly labeled. Files that still
render to the identical folder+filename get the usual `Name.mp4`, `Name (2).mp4`, ... suffixing.

**Sort order for `{performers}`/`{performers_not_in_title}`/`{matched_performers}`**: each rule (and
the default pattern) has its own performer sort order, only shown when the pattern actually
references one of those tokens: `alphabetical` (default), `favorite_first` (favorites first,
alphabetical within each group), or `rating` (highest first, unrated last). Combine with
`{performers:N}` for e.g. "the top 3 favorited performers." `{tags}`/`{matched_tags}` always sort
alphabetically.

**When a matched rule's pattern references a required token the scene doesn't have data for**, that
scene is treated as an error which is shown both in the preview and Stash logs rather than silently
ending up with placeholder text.

## Example patterns

#### Expanded version of the default pattern with an optional performers suffix

Folder

```
{studio_root}
```

Filename:

```
{studio} - {date} - {title}< - {performers?}>
```

The `< - {performers?}>` group drops away as a whole (leading " - " included) rather than leaving
a dangling separator when a scene has no performers tagged:

With performers:

`Galaxy Network/Nebula Films - 2024-03-15 - Sunflower Fields - Ava Kensington, Marcus Chen.mp4`

Without:

`Galaxy Network/Nebula Films - 2024-03-15 - Sunflower Fields.mp4`

#### Performer-specific folders for OnlyFans studios

Folder:

```
OnlyFans/{matched_performers:1}
```

Filename:

```
{date}< ({rating?}) > - [{performers:3}]
```

`:1` on `{matched_performers}` is a safety cap in case your rule matches multiple performers and two or
more of them appear in the same scene - the first performer is used for the folder name.
The `[...]` around `{performers:3}` are just literal bracket characters for decoration, not `<...>` syntax, so it never collapses.
The optional `< ({rating?}) >` does collapse, angle brackets included, when a scene has no rating set:

With a rating

`OnlyFans/Ava Kensington/2024-03-15 (8.5) - [Ava Kensington, Marcus Chen].mp4`

Without:

`OnlyFans/Ava Kensington/2024-03-15 - [Ava Kensington, Marcus Chen].mp4`

#### Prefer the studio code, fall back to the date, fall back to a fixed placeholder

Filename:

```
<{code?}|{date?}|xxx> - {performers}
```

Each `|`-separated alternative is tried in order; the first one that actually has content is used, and the
rest (including their own literal text, if any) are discarded:

With a code set:

`v1234 - Ava Kensington, Marcus Chen.mp4`

With no code but a date:

`2020-01-01 - Ava Kensington, Marcus Chen.mp4`

With neither (`xxx` is plain literal text, so it always has content and never gets skipped):

`xxx - Ava Kensington, Marcus Chen.mp4`

**A more compact, dot-separated look**, along the lines of what release/rip naming conventions
often use. This one leans on the Formatting section: set "Space replacement" to `.`, and
"Performers delimiter" to `.` too, since `{performers}` otherwise always joins with `, ` regardless
of space-replacement (a literal comma would survive as `Ava.Kensington,.Marcus.Chen` otherwise).
Folder stays `{studio_hierarchy}`; filename:

```
{studio}<.{code?}>.{date_year}.{date_month}.{date_day}.{title}.-.{performers:3}.{resolution}.{video_codec}
```

`{date_year}.{date_month}.{date_day}` is used instead of bare `{date}`, since Stash's own date
format uses `-`, which space-replacement doesn't touch; `<.{code?}>` collapses away since most
studios don't set Stash's own "Studio Code" field, rather than leaving a double dot behind:

With a code set:

`Galaxy.Network/Nebula.Films.NF-042.2024.03.15.Sunflower.Fields.-.Ava.Kensington.Marcus.Chen.1080p.h264.mp4`

Without:

`Galaxy.Network/Nebula.Films.2024.03.15.Sunflower.Fields.-.Ava.Kensington.Marcus.Chen.1080p.h264.mp4`
