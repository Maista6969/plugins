import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = (p) => path.join(__dirname, p);

// The comment line in doppelganger.yml that the real version replaces at build time
const VERSION_ANCHOR = /^# version: injected from package.json at build time$/m;

// package.json holds the version. The manifest that actually ships is this
// dist/ copy: CI assembles plugins/ from it and build_site.sh greps it for
// "version:", so injecting here leaves no second place to keep in sync.
function copyManifest() {
  fs.mkdirSync(r("dist"), { recursive: true });

  const { version } = JSON.parse(fs.readFileSync(r("package.json"), "utf8"));
  if (!version) {
    throw new Error("package.json has no version to write into the manifest");
  }

  const manifest = fs.readFileSync(r("doppelganger.yml"), "utf8");
  if (/^version:/m.test(manifest)) {
    throw new Error(
      "doppelganger.yml declares its own version: remove it, package.json is the source of truth",
    );
  }
  if (!VERSION_ANCHOR.test(manifest)) {
    throw new Error(
      `doppelganger.yml is missing its version anchor comment (${VERSION_ANCHOR.source}), so the built manifest would ship without a version`,
    );
  }

  fs.writeFileSync(
    r("dist/doppelganger.yml"),
    manifest.replace(VERSION_ANCHOR, `version: ${version}`),
  );
}

const watch = process.argv.includes("--watch");

const frontendBuild = {
  entryPoints: [r("src/frontend/entry.tsx")],
  outfile: r("dist/doppelganger-ui.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "ESNext",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  legalComments: "none",
  alias: {
    react: r("src/frontend/shared/react-shim.cjs"),
    "react-dom": r("src/frontend/shared/react-dom-shim.cjs"),
    "@apollo/client": r("src/frontend/shared/apollo-shim.cjs"),
    "react-router-dom": r("src/frontend/shared/react-router-dom-shim.cjs"),
    "react-intl": r("src/frontend/shared/intl-shim.cjs"),
  },
  loader: { ".tsx": "tsx", ".ts": "ts" },
};

async function run() {
  const opts = { logLevel: "info" };
  if (watch) {
    const { context } = await import("esbuild");
    const frontendCtx = await context({ ...frontendBuild, ...opts });
    copyManifest();
    await frontendCtx.watch();
    console.log("Watching for changes...");
  } else {
    await build({ ...frontendBuild, ...opts });
    copyManifest();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
