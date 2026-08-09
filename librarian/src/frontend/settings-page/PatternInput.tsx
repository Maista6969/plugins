import React, { useRef } from "react";
import { findPatternProblems } from "../../core/path-template.js";
import { adapterFor } from "../../core/entity-adapter.js";
import { useStashBoxes } from "../shared/StashBoxesContext.js";
import { TextSettingModal } from "./TextSettingModal.js";

const PluginApi = (window as any).PluginApi;
const { Form } = PluginApi.libraries.Bootstrap;

const TOKEN_DESCRIPTIONS: Record<string, string> = {
  studio: "The {noun}'s own studio",
  studio_root:
    "The TOP of the studio hierarchy (often the network), not the {noun}'s own; for a BangBros {noun} under Public Bang, this is “BangBros”, not “Public Bang”",
  studio_hierarchy:
    "The full studio chain from top to bottom, joined with “/” (e.g. “BangBros/Public Bang”)",
  performers:
    "All performers on the {noun}, sorted per this rule's “Sort performers by” setting, joined with a comma. Add :N to limit the count, e.g. {performers:3}, or |gender=female to keep only performers of a given gender",
  performers_not_in_title:
    "Performers not already named in the {noun}'s title. It would not include “Joy” if the title is “A Day in the Park with Joy”",
  matched_performers:
    "Only the performer(s) that actually satisfied THIS rule's own performer condition, not every performer on the {noun}",
  tags: "All tags on the {noun}, joined with a comma",
  matched_tags:
    "Only the tag(s) that actually satisfied THIS rule's own tag condition, not every tag on the {noun}",
  title: "The {noun}'s title",
  code: "The {noun}'s own “Studio Code”, not that very few studios actually have these",
  date: "The {noun}'s date, can be partial",
  date_year: "Just the year of the date, e.g. “2024”",
  date_month:
    "Just the month of the date, e.g. “05”, can be missing if the {noun} has a partial date",
  date_day:
    "Just the day of the date, e.g. “10”, can be missing if the {noun} has a partial date",
  resolution:
    "The file's resolution, e.g. “1080p” or “4K”. Can differ per file on a multi-file {noun}",
  video_codec:
    "The file's video codec, e.g. “h264”, “hevc”. Can differ per file on a multi-file {noun}",
  audio_codec:
    "The file's audio codec, e.g. “aac”. Can differ per file on a multi-file {noun}",
  bitrate:
    "The file's bitrate, e.g. “8.42Mbps”. Can differ per file on a multi-file {noun}",
  fps: "The file's framerate, e.g. “30fps” or “23.98fps”. Can differ per file on a multi-file {noun}",
  phash:
    "The file's perceptual hash fingerprint. Can differ per file on a multi-file {noun}",
  oshash:
    "The file's oshash fingerprint (Stash's older, pre-phash identifier, still computed for every video). Can differ per file on a multi-file {noun}",
  rating: "The {noun}'s rating on a 0-10 scale (one decimal place)",
  stash_id:
    "The {noun}'s StashID. Add |from=StashDB to name the source, or leave it off to use the “Default StashID source” picked below. Several sources can appear in one pattern",
};

interface PatternModalFieldProps {
  value: string | undefined;
  setValue: (v?: string) => void;
  validate?: (value: string) => boolean;
  isFolder?: boolean;
  entityType?: string;
}

function PatternModalField({
  value,
  setValue,
  validate,
  isFolder,
  entityType,
}: PatternModalFieldProps) {
  // Each type supports a different token set: only scenes have stash_ids, a zip
  // gallery file reports no dimensions at all, and an image reports only its own
  const adapter = adapterFor(entityType || "scenes");
  const fileTechTokens: string[] = adapter.fileTechTokens;
  const metadataTokens: string[] = adapter.tokens.filter(
    (t: string) => fileTechTokens.indexOf(t) === -1,
  );
  const { stashBoxes, loading: boxesLoading } = useStashBoxes();
  const inputRef = useRef<HTMLInputElement>(null);
  const pattern = value || "";
  // null while loading, so a from= value is never flagged against a list we
  // have not received yet: a blocking problem refuses the rename outright
  const problems: { raw: string; message: string }[] = findPatternProblems(
    pattern,
    adapter.tokens,
    { stashBoxes: boxesLoading ? null : stashBoxes },
  );
  const unsafeBasename = !!validate && !validate(pattern);

  function insertToken(token: string) {
    const tokenText = "{" + token + "}";
    const input = inputRef.current;
    if (!input) {
      setValue(pattern + tokenText);
      return;
    }
    const start =
      input.selectionStart != null ? input.selectionStart : pattern.length;
    const end =
      input.selectionEnd != null ? input.selectionEnd : pattern.length;
    const next = pattern.slice(0, start) + tokenText + pattern.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + tokenText.length;
      input.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="librarian-pattern-input-wrapper">
      <Form.Control
        ref={inputRef}
        type="text"
        autoFocus
        className="input-control"
        isInvalid={problems.length > 0 || unsafeBasename}
        value={pattern}
        onChange={(e: any) => setValue(e.target.value)}
        placeholder="{studio_parent}/{studio}/{studio} - {date} - {title}"
      />
      {problems.map((problem, i) => (
        <div key={i} className="librarian-token-hint text-danger">
          <code>{problem.raw}</code> {problem.message}
        </div>
      ))}
      {unsafeBasename && (
        <div className="librarian-token-hint text-danger">
          This filename only has optional tokens: if none of them have data for
          a scene, every such scene would collide on the same name. Make at
          least one of them required (remove its <code>?</code>), or add a
          required token
        </div>
      )}
      {isFolder && (
        <div className="librarian-token-hint text-muted">
          <p>
            Leave this <strong>blank</strong> to keep every file in the folder
            it is already in, renaming it without touching your folder
            structure. Use <code>/</code> on its own to place files directly
            under the library root instead.
          </p>
        </div>
      )}
      <div className="librarian-token-hint text-muted"></div>
      {renderTokenGroup(
        adapter.label + " metadata",
        metadataTokens,
        insertToken,
        adapter.noun,
      )}
      {fileTechTokens.length > 0 &&
        renderTokenGroup(
          "File metadata",
          fileTechTokens,
          insertToken,
          adapter.noun,
        )}
      <div className="librarian-token-hint text-muted">
        <p>
          Add <code>?</code> to make a token optional, or <code>:N</code> on a
          list token to limit its count, e.g. <code>{"{performers:2}"}</code>{" "}
          will either be <samp className="text-success">First Performer</samp>{" "}
          if there's one performer or{" "}
          <samp className="text-success">
            First Performer, Second Performer
          </samp>{" "}
          if there are two or more performers. A performer token can also take{" "}
          <code>|gender=female</code> to keep only performers of that gender,
          e.g. <code>{"{performers:1|gender=female}"}</code>
        </p>
        {adapter.tokens.indexOf("stash_id") !== -1 && (
          <p>
            <code>{"{stash_id}"}</code> takes <code>|from=</code> to say which
            stash-box it means, so{" "}
            <code>{"{stash_id|from=StashDB}-{stash_id|from=ThePornDB}"}</code>{" "}
            puts both in one name. Without <code>|from=</code> the default
            source below is used
            {!boxesLoading && stashBoxes.length > 0 && (
              <>
                {" "}
                Your sources:{" "}
                <samp className="text-success">
                  {stashBoxes.map((b: any) => b.name).join(", ")}
                </samp>
              </>
            )}
          </p>
        )}
        <p>
          Wrap optional text in <code>&lt;...&gt;</code> to drop it as a whole
          (literal text included) when the optional token(s) inside are empty,
          e.g. <code>{"{studio} - {date}< - {title?}>"}</code> will only include
          the title if it exists, so the result will be either{" "}
          <samp className="text-success">{"Studio Name - 2024-06-27"}</samp>{" "}
          without the trailing hyphen or{" "}
          <samp className="text-success">
            {"Studio Name - 2024-06-27 - Scene Title"}
          </samp>
        </p>
        <p>
          Split a <code>&lt;...&gt;</code> group with <code>|</code> to try
          alternatives in order and use the first one with content, so{" "}
          <code>{"<{date?}|missing-date>"}</code> uses the date if set, else the
          literal text <samp className="text-success">missing-date</samp>. Each
          alternative can carry its own literal text, so{" "}
          <code>{"< ({code?})| [{date?}]>"}</code> only adds the parentheses
          when the code alternative wins and the brackets when the date one
          does.
        </p>
      </div>
    </div>
  );
}

function renderTokenGroup(
  label: string,
  tokens: string[],
  insertToken: (token: string) => void,
  noun: string,
  hint?: string,
) {
  return (
    <div className="librarian-token-group">
      <div className="librarian-token-group-label text-muted">{label}</div>
      {hint && <div className="librarian-token-hint text-muted">{hint}</div>}
      {tokens.map((token) => (
        <span
          key={token}
          className="librarian-token-chip badge badge-secondary"
          onClick={() => insertToken(token)}
          title={
            (TOKEN_DESCRIPTIONS[token]
              ? TOKEN_DESCRIPTIONS[token].replace(/{noun}/g, noun) + " "
              : "") + "(click to insert)"
          }
        >
          {"{" + token + "}"}
        </span>
      ))}
    </div>
  );
}

interface PatternInputProps {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  subHeading?: React.ReactNode;
  validate?: (value: string) => boolean;
  isFolder?: boolean;
  entityType?: string;
}

export function PatternInput({
  value,
  onChange,
  label,
  subHeading,
  validate,
  isFolder,
  entityType,
}: PatternInputProps) {
  return (
    <TextSettingModal
      value={value}
      onChange={onChange}
      heading={label || "Pattern"}
      subHeading={subHeading}
      renderField={(fieldValue, setValue) => (
        <PatternModalField
          value={fieldValue}
          setValue={setValue}
          validate={validate}
          isFolder={isFolder}
          entityType={entityType}
        />
      )}
      validate={validate}
    />
  );
}
