import React, { useRef, useState } from "react";
import { findPatternProblems } from "../../core/path-template.js";
import { adapterFor } from "../../core/entity-adapter.js";
import { useStashBoxes } from "../shared/StashBoxesContext.js";
import { TextSettingModal } from "./TextSettingModal.js";
import { PatternReference } from "./PatternReference.js";
import { describeToken } from "../../core/token-docs.js";

const PluginApi = (window as any).PluginApi;
const { Form } = PluginApi.libraries.Bootstrap;

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
  const [referenceOpen, setReferenceOpen] = useState(false);
  const pattern = value || "";
  // null while loading, so a from= value is never flagged against a list we
  // have not received yet: a blocking problem refuses the rename outright
  const problems: { raw: string; message: string; blocking: boolean }[] =
    findPatternProblems(pattern, adapter.tokens, {
      stashBoxes: boxesLoading ? null : stashBoxes,
    });
  const blockingCount = problems.filter((p) => p.blocking).length;
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
    <div
      className={
        "librarian-pattern-input-wrapper" +
        // the panel lists the same tokens with descriptions, so the chips here
        // are redundant while it is open
        (referenceOpen ? " librarian-reference-open" : "")
      }
    >
      <Form.Control
        ref={inputRef}
        type="text"
        autoFocus
        className="input-control"
        isInvalid={blockingCount > 0 || unsafeBasename}
        value={pattern}
        onChange={(e: any) => setValue(e.target.value)}
        placeholder="{studio_parent}/{studio}/{studio} - {date} - {title}"
      />
      {problems.map((problem, i) => (
        <div
          key={i}
          className={
            "librarian-token-hint " +
            (problem.blocking ? "text-danger" : "text-warning")
          }
        >
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
      {isFolder ? (
        <div className="librarian-token-hint text-muted">
          <p>
            Use <code>{"{current}"}</code> on its own to keep every file in the
            folder it is already in, renaming it without touching your folder
            structure. Use <code>/</code> on its own to place files directly
            under the library root instead.
          </p>
        </div>
      ) : (
        <div className="librarian-token-hint text-muted">
          <p>
            Use <code>{"{current}"}</code> on its own to keep every file's
            current name, extension and all, and only move it to the folder the
            folder pattern asks for. <code>{"{current}"}</code> on both sides
            leaves files completely alone.
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
      </div>
      <button
        type="button"
        className="btn btn-link btn-sm librarian-reference-toggle"
        onClick={() => setReferenceOpen(!referenceOpen)}
      >
        {referenceOpen ? "Hide" : "Show"} the full pattern reference
      </button>
      {referenceOpen && (
        <PatternReference
          tokens={adapter.tokens}
          noun={adapter.noun}
          insertToken={insertToken}
          onClose={() => setReferenceOpen(false)}
        />
      )}
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
            (describeToken(token, noun)
              ? describeToken(token, noun) + " "
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
