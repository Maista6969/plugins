// Duplicate scenes almost always sit under the same library root, so the
// leading part of their paths is identical and carries no information. The
// distinguishing part is towards the end.
//
// Trimming is done a whole segment at a time rather than character by
// character: two files named "foo-1.mp4" and "foo-2.mp4" in the same folder
// share the literal prefix "foo-", but cutting there would leave "1.mp4" and
// "2.mp4", which reads as though the names were mangled. The last segment is
// always kept, so the result is never empty.
export function stripCommonPrefix(paths) {
  if (paths.length < 2) return paths.slice();

  const split = paths.map((p) => String(p ?? "").split("/"));

  // Every path keeps at least its last segment, so a path with n segments can
  // give up at most n-1 of them.
  const maxShared = Math.min(...split.map((s) => s.length)) - 1;

  let shared = 0;
  while (shared < maxShared) {
    const segment = split[0][shared];
    if (!split.every((s) => s[shared] === segment)) break;
    shared++;
  }

  // Every absolute path shares the empty segment before the leading slash.
  // Trimming only that turns an absolute path into something that reads as a
  // relative one while saving a single character, so it is not worth doing:
  // paths that diverge from the very top are clearer left alone.
  const trimmed = split[0].slice(0, shared);
  if (!trimmed.some((segment) => segment !== "")) return paths.slice();

  return split.map((s) => s.slice(shared).join("/"));
}
