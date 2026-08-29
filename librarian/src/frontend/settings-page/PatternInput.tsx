import React, { useRef, useState } from "react";
import { useIntl, IntlShape } from "react-intl";
import { findPatternProblems } from "../../core/path-template.js";
import { adapterFor } from "../../core/entity-adapter.js";
import { countableNoun } from "../shared/eligible-entities.js";
import { useStashBoxes } from "../shared/StashBoxesContext.js";
import { TextSettingModal } from "./TextSettingModal.js";
import { PatternReference } from "./PatternReference.js";
import { describeTokens } from "../../core/token-docs.js";
import { blankPatternToCurrent } from "../../core/config-schema.js";

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
  const intl = useIntl();
  // Each type supports a different token set: only scenes have stash_ids, a zip
  // gallery file reports no dimensions at all, and an image reports only its own
  const adapter = adapterFor(entityType || "scenes");
  const fileTechTokens: string[] = adapter.fileTechTokens;
  const metadataTokens: string[] = adapter.tokens.filter(
    (t: string) => fileTechTokens.indexOf(t) === -1,
  );
  const { stashBoxes, loading: boxesLoading } = useStashBoxes();
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  function insertToken(tokenText: string) {
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
      const caret =
        tokenText.slice(-2) === "@}" ? tokenText.length - 1 : tokenText.length;
      const pos = start + caret;
      input.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="librarian-pattern-input-wrapper">
      <Form.Control
        ref={inputRef}
        as="textarea"
        rows={3}
        autoFocus
        className="input-control librarian-pattern-textarea"
        isInvalid={blockingCount > 0 || unsafeBasename}
        value={pattern}
        // A pattern is one logical line that wraps for readability, not a
        // multi-line value: Enter must not plant a literal newline in a
        // folder/filename, so it's stripped here and blocked on keydown too
        // (a paste only goes through onChange, Enter only through keydown)
        onChange={(e: any) => setValue(e.target.value.replace(/[\r\n]+/g, ""))}
        onKeyDown={(e: any) => {
          if (e.key === "Enter") {
            e.preventDefault();
          }
        }}
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
          {intl.formatMessage({
            id: "librarian.patternInput.unsafeBasename.before",
          })}
          <code>?</code>
          {intl.formatMessage({
            id: "librarian.patternInput.unsafeBasename.after",
          })}
        </div>
      )}
      {pattern.trim() === "" && (
        <div className="librarian-token-hint text-warning">
          {intl.formatMessage({
            id: "librarian.patternInput.emptyPattern.before",
          })}{" "}
          <code>{"{current}"}</code>
          {intl.formatMessage(
            { id: "librarian.patternInput.emptyPattern.after" },
            {
              keepsWhat: intl.formatMessage({
                id: isFolder
                  ? "librarian.patternInput.keepsFolder"
                  : "librarian.patternInput.keepsName",
              }),
            },
          )}
        </div>
      )}
      {renderTokenGroup(
        intl,
        intl.formatMessage(
          { id: "librarian.patternInput.metadataGroup" },
          {
            entityNoun: countableNoun(intl, entityType || "scenes", true, true),
          },
        ),
        metadataTokens,
        insertToken,
        adapter.noun,
      )}
      {fileTechTokens.length > 0 &&
        renderTokenGroup(
          intl,
          intl.formatMessage({ id: "librarian.patternInput.fileMetadata" }),
          fileTechTokens,
          insertToken,
          adapter.noun,
        )}
      <button
        type="button"
        className="btn btn-link btn-sm librarian-reference-toggle"
        onClick={() => setReferenceOpen(!referenceOpen)}
      >
        {intl.formatMessage({
          id: referenceOpen
            ? "librarian.patternInput.hideReference"
            : "librarian.patternInput.showReference",
        })}
      </button>
      {referenceOpen && (
        <PatternReference
          tokens={adapter.tokens}
          noun={adapter.noun}
          insertToken={insertToken}
          onClose={() => setReferenceOpen(false)}
          isFolder={isFolder}
          stashBoxes={stashBoxes}
          boxesLoading={boxesLoading}
        />
      )}
    </div>
  );
}

function renderTokenGroup(
  intl: IntlShape,
  label: string,
  tokens: string[],
  insertToken: (text: string) => void,
  noun: string,
  hint?: string,
) {
  return (
    <div className="librarian-token-group">
      <div className="librarian-token-group-label text-muted">{label}</div>
      {hint && <div className="librarian-token-hint text-muted">{hint}</div>}
      {describeTokens(tokens, noun).map((token: any) => (
        <span
          key={token.name}
          className="librarian-token-chip badge badge-secondary"
          onClick={() => insertToken(token.insert)}
          title={
            (token.description ? token.description + " " : "") +
            intl.formatMessage({
              id: "librarian.patternInput.clickToInsert",
            })
          }
        >
          {token.spelling}
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
  const intl = useIntl();
  return (
    <TextSettingModal
      value={value}
      onChange={(next: string) => onChange(blankPatternToCurrent(next))}
      heading={
        label || intl.formatMessage({ id: "librarian.patternInput.pattern" })
      }
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
