import { IntlShape } from "react-intl";
import { countableNoun } from "./eligible-entities.js";

function camelCase(code: string): string {
  return code.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// Core describes problems with a snake_case code and its values next to an
// English message for Stash's log. The UI says them in the viewer's language,
// falling back to that English for anything without a code, such as a
// failure recorded before codes existed
export function codedMessage(
  intl: IntlShape,
  prefix: string,
  code: string | undefined,
  values: Record<string, any> | undefined,
  fallback: string,
): string {
  if (!code) {
    return fallback;
  }
  const id = prefix + "." + camelCase(code);
  if (
    !intl.messages ||
    !Object.prototype.hasOwnProperty.call(intl.messages, id)
  ) {
    return fallback;
  }
  return intl.formatMessage({ id }, values);
}

export interface PatternProblem {
  raw: string;
  message: string;
  code?: string;
  values?: Record<string, any>;
  blocking: boolean;
}

export function describePatternProblem(
  intl: IntlShape,
  problem: { code?: string; values?: Record<string, any>; message: string },
): string {
  return codedMessage(
    intl,
    "librarian.patternProblem",
    problem.code,
    problem.values,
    problem.message,
  );
}

// both casings, since a language like German capitalises nouns mid-sentence
export function nounValues(intl: IntlShape, entityType?: string) {
  const type = entityType || "scenes";
  return {
    noun: countableNoun(intl, type, false),
    Noun: countableNoun(intl, type, false, true),
  };
}
