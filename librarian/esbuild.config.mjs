import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = (p) => path.join(__dirname, p);

function copyManifest() {
  fs.mkdirSync(r("dist"), { recursive: true });
  fs.copyFileSync(r("librarian.yml"), r("dist/librarian.yml"));
}

const watch = process.argv.includes("--watch");

// This target the Goja virtual machine that Stash uses so it needs to be
// pretty conservative with its target and the result needs to be an IIFE
// that returns an { Output: value, Error: error } object
const backendBuild = {
  entryPoints: [r("src/backend/index.js")],
  outfile: r("dist/librarian.js"),
  bundle: true,
  format: "iife",
  platform: "neutral",
  target: "es2017",
  legalComments: "none",
  globalName: "__librarianOutput",
  footer: { js: "__librarianOutput.default;" },
};

// Frontend is much cooler and we can assume modern browser features
// and target esnext
const frontendBuild = {
  entryPoints: [r("src/frontend/entry.tsx")],
  outfile: r("dist/librarian-ui.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "esnext",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  legalComments: "none",
  alias: {
    react: r("src/frontend/shared/react-shim.cjs"),
    "react-dom": r("src/frontend/shared/react-dom-shim.cjs"),
    "@apollo/client": r("src/frontend/shared/apollo-shim.cjs"),
    "react-router-dom": r("src/frontend/shared/react-router-dom-shim.cjs"),
  },
  loader: { ".tsx": "tsx", ".ts": "ts" },
};

const cssBuild = {
  entryPoints: [r("src/frontend/styles.css")],
  outfile: r("dist/librarian-ui.css"),
  bundle: true,
  legalComments: "none",
};

async function run() {
  const opts = { logLevel: "info" };
  if (watch) {
    const { context } = await import("esbuild");
    const backendCtx = await context({ ...backendBuild, ...opts });
    const frontendCtx = await context({ ...frontendBuild, ...opts });
    const cssCtx = await context({ ...cssBuild, ...opts });
    copyManifest();
    await Promise.all([
      backendCtx.watch(),
      frontendCtx.watch(),
      cssCtx.watch(),
    ]);
    console.log("Watching for changes...");
  } else {
    await build({ ...backendBuild, ...opts });
    await build({ ...frontendBuild, ...opts });
    await build({ ...cssBuild, ...opts });
    copyManifest();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
