# Librarian

A [Stash](https://github.com/stashapp/stash) plugin that renames scene, gallery and image files based on your own
rules and metadata.

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

- **Settings page**: Pick a tab for scenes, galleries or images, then decide whether to only rename items that are
  marked Organized (or, for scenes, that have a StashID), configure any exclusions for the files you know you'll
  never want to rename, and optionally [configure your own rules](#rule) for subsets of your collection that need
  their own naming scheme. Everything that does not have its own rule will be renamed according to that tab's
  default pattern. Formatting settings are shared across all three

<p align="center">
  <a href="https://raw.githubusercontent.com/Maista6969/plugins/blob/main/librarian/images/stash-librarian-settings.png">
    <img src="images/stash-librarian-settings.png" width="800" alt="Settings page: Options, Exclusions, and the ordered Rules list">
  </a>
</p>

- **Filtered views** (scenes only): Librarian plugs into the existing Scenes page and offers its own view for whatever filters you're already using.
  This makes it easy to apply renames to subsets of your collection while you're figuring things out. Note that applying a rename from this
  view will apply to every scene that matches the filter and not just the current page!

<p align="center">
  <a href="https://raw.githubusercontent.com/Maista6969/plugins/blob/main/librarian/images/stash-librarian-scene-list-view.png">
    <img src="images/stash-librarian-scene-list-view.png" width="800" alt="Scenes page filtered rename preview: old/new path comparison table">
  </a>
</p>

- **Automatically rename files as you update**: Librarian will rename the files for a scene, gallery or image as soon
  as it's updated with new metadata, as long as it meets the criteria you've configured for that type. Each tab has its
  own "Automatic renaming" switch at the top of its Options section; all default to off so that you can verify that your
  rules and patterns look good before you enable them

- **Scene page, File Info tab** (scenes only): See exactly which rule would apply to any scene in the File Info tab

<p align="center">
  <a href="https://raw.githubusercontent.com/Maista6969/plugins/blob/main/librarian/images/stash-librarian-fileinfo-tab-integration.png">
    <img src="images/stash-librarian-fileinfo-tab-integration.png" width="800" alt="Scene File Info tab: Librarian's own block appended below Stash's native file details">
  </a>
</p>

- **Per-type tasks**: each type also gets its own "Rename all …" task, so you can sweep scenes, galleries or images
  independently. See [What can be renamed](#what-can-be-renamed) for the limits Stash imposes on galleries and images.

## What can be renamed

Scenes, galleries and images each get their own tab in the settings.
Two things Stash itself cannot do set the limits, so Librarian skips those cases explicitly rather than half-doing them:

|                     | Renamed    | Why not                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scenes              | ✅         |                                                                                                                                                                                                                                                                                                                          |
| Zip galleries       | ✅         | The images inside follow the zip automatically                                                                                                                                                                                                                                                                           |
| Folder galleries    | ❌ skipped | A folder gallery has no file to move, only a folder. Stash has no mutation for moving one, and no way to repoint a gallery at a different folder. Moving the images out individually would strand the gallery, and its title, date, rating and tags, on the old folder while a new empty gallery appeared at the new one |
| Loose images        | ✅         |                                                                                                                                                                                                                                                                                                                          |
| Images inside a zip | ❌ skipped | Stash refuses to move or rename anything contained in a zip, even to change only the filename. Rename the gallery instead                                                                                                                                                                                                |

Both skips are reported per item in the preview and in the logs, with the reason, so nothing fails silently.

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
- `{token|modifier}`: a modifier, described below. Several can be chained, e.g. `{performers|gender=female|limit=1|uppercase}`.
  Modifiers always come before the `?`, so the fullest form is `{performers|gender=female|limit=1?}`
  A mistyped modifier is refused outright rather than quietly renaming to something wrong.
- `<...>`: wraps literal text and/or tokens as one optional-segment unit. The whole span, literal text included,
  is dropped if it contains at least one optional token and every one of them rendered empty for that scene.
  For example `{studio}<, {date?}>< - {title?}>` renders `Studio, 2024 - Title` when both are present, or just `Studio` when both are missing,
  each bracket collapsing independently. A required token inside `<...>` normally never triggers a collapse, because it is
  guaranteed to have data (if it didn't, the scene would be reported as missing data instead of rendered). The one exception
  is a **list token a filter emptied** — `{performers|gender=female}` on a scene with no female performers, or
  `{performers_not_in_title}` when every performer is named in the title.
- `<a|b|c>`: split a bracket on `|` to try alternatives in order, using each one's own collapse rule as the test. The first
  alternative that doesn't collapse wins: any literal-only or required-token alternative always qualifies; an optional-token
  alternative qualifies only once that token actually has data. For example `<{date?}|missing-date>` renders the date if it has one, or else the literal `missing-date`.
  Each alternative can carry its own literal text, e.g. `< ({code?})| [{date?}]>` includes the parentheses
  only when the code alternative is the one chosen, the brackets only when the date one is. Like a plain `<...>`, if every
  alternative collapses and none is a guaranteed-content fallback, the whole group renders empty.

**Token modifiers**

| Modifier    | Works on                                                            | Effect                                                |
| ----------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| `limit=N`   | list tokens                                                         | Join at most the first N values                       |
| `gender=`   | `{performers}`, `{performers_not_in_title}`, `{matched_performers}` | Keep only performers of the gender(s) named           |
| `uppercase` | any token                                                           | `AVA KENSINGTON`                                      |
| `lowercase` | any token                                                           | `ava kensington`                                      |
| `titlecase` | any token                                                           | `Ava Kensington`                                      |
| `compact`   | any token                                                           | Removes spaces: `AvaKensington`                       |
| `regex=`    | any token                                                           | Find-and-replace, written `/find/replace/`; see below |
| `from=`     | `{stash_id}`                                                        | Which stash-box source to take the ID from; see below |

The list tokens are `performers`, `performers_not_in_title`, `matched_performers`, `tags` and `matched_tags`.

**Modifiers apply strictly left to right**, in the order you write them. This matters whenever a filter and a
limit appear together:

```
{performers|gender=female|limit=1}   the first female performer
{performers|limit=1|gender=female}   the first performer, kept only if she is female
```

Both are valid; they just mean different things, and each one means what it reads like. The preview shows you
which you got before anything is renamed

On a list token, the text modifiers apply to **each value**, leaving the separator alone, so
`{performers|compact}` gives `AvaKensington, MarcusChen` rather than running the names together

`gender` accepts several values separated by commas, e.g. `{performers|gender=female,trans_female}`. Valid
values are `female`, `male`, `trans_female`, `trans_male`, `intersex`, `non_binary` and `unknown`
(`transgender_female`, `transgender_male` and `nonbinary` also work if you prefer them spelled out)

`titlecase` is deliberately simple: it capitalises the first letter of each word and lowercases the rest. It is
meant for fixing scraped ALL-CAPS titles, not for correcting names — it will turn `McDonald` into `Mcdonald`

**`regex=`** does a find-and-replace, written as `/find/replace/`. Every match is replaced, and a captured
group is reused in the replacement as `$1`, `$2` and so on:

```
{title|regex=/(?:\D*(\d+).*)/Time for $1/}     "Happy 420 day"  ->  "Time for 420"
{date|regex=/(\d{4}).*/$1/}                    "2024-03-15"     ->  "2024"
{title|regex=/ - Trailer//}                    strips a suffix
{performers|regex=/ /_/}                       "Ava Kensington" ->  "Ava_Kensington"
```

Write `\/` for a literal forward slash, and `$$` for a literal `$`. On a list token the find-and-replace runs
on each value separately, so it can never damage the separator between them. A replacement cannot smuggle a
path separator into a folder either: the result is re-cleaned afterwards, so a `/` becomes a space like any
other illegal character

> **Why some valid regexes are refused.** The rename preview runs in your browser, but the rename itself runs
> inside Stash's own JavaScript Virtual Machine Goja, and the two do not agree on every regex feature.
> Rather than let the preview show one filename while the rename produces another, Librarian refuses the
> constructs where they differ and says what to write instead:
>
> | Refused                                             | Write instead                                     |
> | --------------------------------------------------- | ------------------------------------------------- |
> | `$<name>` in the replacement                        | `$1`, by group number                             |
> | `\1` in the replacement                             | `$1`                                              |
> | `\p{Lu}` and friends                                | a class like `[A-Z]`                              |
> | `[[:digit:]]` POSIX classes                         | `\d`, `\w`, or `[0-9]`                            |
> | a pattern that can match nothing, like `a?` or ` *` | `a+`, ` +` — make it match at least one character |
>
> Everything else behaves identically in both engines and is fully supported: capture groups, non-capturing
> `(?:...)`, alternation, lookahead, lookbehind, backreferences and `{2}` quantifiers

> ⚠️ A slow regex is slow in the rename engine too. A pattern with nested quantifiers (the classic being
> `(a+)+`) can take exponentially long on a long title. It will not freeze Stash — the rest of the app stays
> responsive — and you can stop the task from the job queue, but check the preview before running a sweep

> ⚠️ **Deprecated in version 0.7**: the `{performers:2}` spelling of the limit. Write `{performers|limit=2}`
> instead. `:N` still works and Librarian shows the exact replacement, but note that it is now read in the
> position it is written: `{performers:1|gender=female}` used to mean "the first female performer" and now
> means "the first performer, if she happens to be female". Anywhere you combined `:N` with `gender=`, swap
> the order: `{performers|gender=female|limit=1}`

> **Gender has to actually be set in Stash.** `unknown` means "no gender recorded", and it is deliberately _not_
> matched by `gender=female` — so on a library where performers have not been tagged, `{performers|gender=female}`
> will quietly leave them out. Like `{performers_not_in_title}`, a filter that matches nobody renders empty rather
> than reporting missing data; use `{performers|gender=female?}` or `<{performers|gender=female}|Unsorted>` if you
> want to handle that case explicitly.

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

> ⚠️ **Behaviour change in version 0.4**: a blank folder pattern used to mean "put files in the library root",
> which flattened manually-organised folder hierarchies. It now means "leave files where they are".
> If you were relying on the old behaviour, change your folder pattern to `/`.

**Blank filename pattern**: the mirror image of a blank folder pattern. It will **keep the name each file already
has**, extension included, and only move it to wherever the folder pattern points. This is the option to use
when your filenames are already how you want them and it is only the folder structure you want maintained.

A kept name is never sanitised. It is a name your filesystem has already accepted, so settings like the
space replacement leave it alone; sanitising it would be a rename, which is the one thing a blank pattern
promises not to do. Names are still de-duplicated, though: if two files of the same scene land in the same
destination folder under the same name, the second becomes `name (2).ext`. Two files that differ only in
their extension are not a collision and both keep their names.

Leaving both patterns blank is a no-op, and Librarian reports those files as skipped. On a rule that is a
useful escape hatch: because the first matching rule wins, an all-blank rule marks everything it matches
as off-limits to every rule below it and to the default pattern.

> ⚠️ **Behaviour change in version 0.6**: a blank filename pattern used to be an error, so a half-finished
> rule that had a folder pattern but no filename pattern quietly did nothing. It now moves files while
> keeping their names. Check any rule you left with a blank filename pattern.

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
| `{stash_id}`                                  | StashID from one stash-box source, can be specified as `{stash_id\|from=StashDB}`; see below                                                                                                                               |

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

**`{stash_id}`**: a scene can have StashIDs from several different stash-box sources at once, so the
token has to say which one it means. Name it inline with `|from=`:

```
{stash_id|from=StashDB}-{stash_id|from=ThePornDB}
```

That is the main reason to use `|from=`: one pattern can carry StashIDs from several sources,
which a single picker could never express. Names are matched against the sources configured in
Stash's own settings (Settings > Metadata Providers), ignoring case, and the first match wins if you
have given two sources the same name.

A source is worked out in this order:

1. `|from=` on the token itself.
2. otherwise the **Default StashID source** picker, which appears on a rule (or the default pattern)
   as soon as some `{stash_id}` in it does _not_ say `|from=`.
3. otherwise, if you have exactly **one** stash-box configured, that one — there is nothing to choose
   between, so `{stash_id}` just works.
4. otherwise it is missing data, an error unless written `{stash_id?}`.

If a scene has no StashID from the resolved source, that is missing data too, and the error names the
source so you can tell the two cases apart.

> **`|from=` uses a name, and names can be edited.** Renaming a source in Stash breaks every pattern
> that referred to it by the old name: Librarian refuses to rename rather than producing a wrong
> filename, but you will have to update your patterns. If you would rather be immune to that, give the
> full endpoint URL instead: `{stash_id|from=https://stashdb.org/graphql}`. A URL is also accepted when
> no configured source uses it any more, so scenes keep working after you remove a stash-box.

Two spelling quirks worth knowing: a source whose name ends in `?` cannot be written directly (the `?`
is read as the optional marker), and neither can one containing `|`.

`{resolution}`/`{video_codec}`/`{audio_codec}`/`{bitrate}`/`{fps}`/`{phash}` describe the specific file
being renamed, not the scene as a whole: a scene with both a 1080p copy and a 4K remux renders each
file's own filename (and folder, if referenced there too) from that file's own specs, so a
collection with multiple qualities of the same scene ends up correctly labeled. Files that still
render to the identical folder+filename get the usual `Name.mp4`, `Name (2).mp4`, ... suffixing.

**Sort order for `{performers}`/`{performers_not_in_title}`/`{matched_performers}`**: each rule (and
the default pattern) has its own performer sort order, only shown when the pattern actually
references one of those tokens. Pick any combination of **Favourites first** and **Highest rated**,
in the order you click them; whatever is left over is broken alphabetically, always. So choosing
both, in that order, means "favourited performers first, best-rated first among those, then A→Z",
which combined with `{performers|limit=1}` gives you a folder named after the favourite you rate highest.
Unrated performers sort last. `{tags}`/`{matched_tags}` always sort alphabetically.

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
{studio} - {date} - {title}< - {performers|gender=female,trans_fem?}>
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
OnlyFans/{matched_performers|limit=1}
```

Filename:

```
{date}< ({rating?}) > - [{performers|limit=3}]
```

`:1` on `{matched_performers}` is a safety cap in case your rule matches multiple performers and two or
more of them appear in the same scene - the first performer is used for the folder name.
The `[...]` around `{performers|limit=3}` are just literal bracket characters for decoration, not `<...>` syntax, so it never collapses.
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
{studio}<.{code?}>.{date_year}.{date_month}.{date_day}.{title}.-.{performers|limit=3}.{resolution}.{video_codec}
```

`{date_year}.{date_month}.{date_day}` is used instead of bare `{date}`, since Stash's own date
format uses `-`, which space-replacement doesn't touch; `<.{code?}>` collapses away since most
studios don't set Stash's own "Studio Code" field, rather than leaving a double dot behind:

With a code set:

`Galaxy.Network/Nebula.Films.NF-042.2024.03.15.Sunflower.Fields.-.Ava.Kensington.Marcus.Chen.1080p.h264.mp4`

Without:

`Galaxy.Network/Nebula.Films.2024.03.15.Sunflower.Fields.-.Ava.Kensington.Marcus.Chen.1080p.h264.mp4`
