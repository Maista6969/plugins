import React from "react";

const TOKEN_RE = /\{[a-z_]+\}/g;

interface TokenizedTextProps {
  text: string;
}

// Renders a plain string with every {token} substring styled the same way
// PatternInput.tsx's own clickable token chips look (.librarian-token-chip's
// badge badge-secondary + monospace), just without the click-to-insert
// behavior, since this is for read-only prose (a setting's own subHeading)
// rather than a pattern-authoring surface. Keeps a subheading's own token
// mentions visually obvious/consistent with the modal where those same
// tokens are actually picked, rather than blending into plain text.
export function TokenizedText({ text }: TokenizedTextProps) {
  const parts = text.split(TOKEN_RE);
  const tokens = text.match(TOKEN_RE) || [];
  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {part}
          {tokens[i] && (
            <span className="librarian-token-chip-static badge badge-secondary">
              {tokens[i]}
            </span>
          )}
        </React.Fragment>
      ))}
    </>
  );
}
