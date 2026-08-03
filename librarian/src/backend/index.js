import * as taskEntry from "./task-entry.js";
import * as hookEntry from "./hook-entry.js";

function main() {
  const args = (typeof input !== "undefined" && input.Args) || {};
  if (args.hookContext) {
    return hookEntry.run(args);
  }
  return taskEntry.run(args);
}

// This returns the actual output to Stash through the Goja VM
export default main();
