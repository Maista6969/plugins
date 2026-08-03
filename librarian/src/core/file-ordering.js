export function assignSuffixes(files, basenameNoExt) {
  return files.map((file, index) => {
    const suffixed =
      index === 0 ? basenameNoExt : basenameNoExt + " (" + (index + 1) + ")";
    return { file: file, basenameNoExt: suffixed };
  });
}
