export const MAX_STUDIO_DEPTH = 5;

export function walkStudioChain(studio) {
  const chain = [];
  let current = studio;
  let depth = 0;
  while (current && depth < MAX_STUDIO_DEPTH) {
    chain.unshift({ id: String(current.id), name: current.name });
    current = current.parent_studio;
    depth += 1;
  }
  return chain;
}
