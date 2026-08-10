import React from "react";
import ReactDOM from "react-dom";
import { describeModifiers, describeTokens } from "../../core/token-docs.js";

// The in-app half of the pattern reference. Everything in here is generated
// from the same registries that scripts/generate-docs.mjs reads for the
// README, so the two cannot describe different products: adding a modifier
// makes it appear in both, and doc-coverage.test.js fails if it has no prose.
//
// This exists because most people install and update Librarian from inside
// Stash and never open the repository, so a reference that only lives in the
// README may as well not exist for them.
//
// It is portalled to <body> so it sits beside the pattern modal instead of
// inside it, but it is deliberately NOT a second Bootstrap modal: that would
// trap focus and stop you typing in the pattern field it exists to explain,
// and would stack a second backdrop over the first. A non-modal panel with no
// backdrop leaves the pattern editable while it is open.
//
// Closing follows from where it is mounted: PatternInput renders this, so it
// unmounts with the pattern modal. The Hide button here and the toggle in the
// editing column both close it on its own.

interface PatternReferenceProps {
  tokens: string[];
  noun: string;
  insertToken: (token: string) => void;
  onClose: () => void;
}

// Whether the panel is open is PatternInput's business, not this component's:
// the modal hides its token chips while the panel is showing the same tokens
// with descriptions, and the class that does that sits on the modal's wrapper
export function PatternReference({
  tokens,
  noun,
  insertToken,
  onClose,
}: PatternReferenceProps) {
  const rows = describeTokens(tokens, noun);
  const metadata = rows.filter((r: any) => !r.fileTech);
  const fileTech = rows.filter((r: any) => r.fileTech);

  return ReactDOM.createPortal(
    <aside className="librarian-reference" aria-label="Pattern reference">
      <div className="librarian-reference-header">
        <strong>Pattern reference</strong>
        <button
          type="button"
          className="btn btn-link btn-sm librarian-reference-toggle"
          onClick={onClose}
        >
          Hide
        </button>
      </div>

      <p className="text-muted">
        A pattern is literal text plus <code>{"{tokens}"}</code>, and a token
        that has no data for an item is an error unless you mark it optional
        with <code>?</code>.
      </p>
      <p className="text-muted">
        Wrap a span in <code>&lt;...&gt;</code> to drop it as a whole, literal
        text included, when the optional tokens inside come out empty:{" "}
        <code>{"{studio} - {date}< - {title?}>"}</code> loses the trailing
        hyphen rather than dangling it. Split such a group with <code>|</code>{" "}
        to try alternatives in order and take the first with content, so{" "}
        <code>{"<{date?}|missing-date>"}</code> falls back to the literal text.
      </p>
      <p className="text-muted">
        Chain modifiers with <code>|</code>.{" "}
        <strong>They apply left to right</strong>, so{" "}
        <code>{"{performers|gender=female|limit=1}"}</code> is the first female
        performer, while <code>{"{performers|limit=1|gender=female}"}</code>{" "}
        takes the first performer and keeps her only if she is female.
      </p>
      <p className="text-muted">
        The older <code>{"{performers:2}"}</code> shorthand still works, but
        only on its own. It is stuck at the front of the token, so beside any
        modifier its position stops matching its meaning - write{" "}
        <code>|limit=2</code> there instead, and Librarian will say so.
      </p>
      <p className="text-muted">
        <code>{"{current}"}</code> is the path a file already has, and is the
        one token that reads what the pattern writes. It has to be the whole
        pattern: anything added around it would be read back and added again on
        the next run, so the path would grow every time. For the same reason a
        modifier on it has to leave an already-renamed file alone.{" "}
        <code>{"{current|regex=/ - Trailer//}"}</code> is fine, one that keeps
        changing the name is refused.
      </p>

      <TokenTable
        label="Metadata tokens"
        rows={metadata}
        insertToken={insertToken}
      />
      {fileTech.length > 0 && (
        <TokenTable
          label="File tokens"
          hint="These describe the individual file being renamed, so they can differ between the files of one item"
          rows={fileTech}
          insertToken={insertToken}
        />
      )}

      <div className="librarian-reference-group-label text-muted">
        Modifiers
      </div>
      {/* stacked rather than tabular: three columns do not fit a side panel */}
      <ul className="librarian-reference-modifiers">
        {describeModifiers().map((m: any) => (
          <li key={m.name}>
            <div>
              <code>{"|" + m.spelling}</code>{" "}
              <span className="text-muted">{m.targets}</span>
            </div>
            <div>{m.summary}</div>
            <div className="librarian-reference-example">
              <code>{m.example.pattern}</code>
              <div className="text-muted">
                <samp>{m.example.before}</samp> becomes{" "}
                <samp className="text-success">{m.example.after}</samp>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </aside>,
    document.body,
  );
}

function TokenTable({
  label,
  hint,
  rows,
  insertToken,
}: {
  label: string;
  hint?: string;
  rows: any[];
  insertToken: (token: string) => void;
}) {
  return (
    <>
      <div className="librarian-reference-group-label text-muted">{label}</div>
      {hint && <div className="librarian-token-hint text-muted">{hint}</div>}
      <table className="librarian-reference-table">
        <tbody>
          {rows.map((t) => (
            <tr key={t.name}>
              <td>
                <span
                  className="librarian-token-chip badge badge-secondary"
                  onClick={() => insertToken(t.name)}
                  title="click to insert"
                >
                  {"{" + t.name + "}"}
                </span>
              </td>
              <td>{t.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
