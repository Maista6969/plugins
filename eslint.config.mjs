import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Three environments live in this repo and they do not share globals:
//
//   src/core      shared by both sides, so it may assume neither
//   src/backend   runs inside Stash's Goja VM, where `input` and `log` are
//                 injected globals and there is no DOM
//   src/frontend  runs in the browser against window.PluginApi
//
// The rules stay close to recommended on purpose. Prettier already settles
// formatting, so the linter is here to catch mistakes, not to relitigate style.
// react-hooks is pinned to the classic pair of rules because the source already
// carries `eslint-disable-next-line react-hooks/exhaustive-deps` in fifteen
// places: this config restores the linter those were written against rather
// than introducing a newer, more opinionated one that would flag working code.
export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "_site/**",
      "plugins/**",
      // hand-written shims whose whole body is a re-export of a global
      "**/*.cjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // `any` is deliberate at the PluginApi boundary: Stash ships no types
      // for its own plugin API, so there is nothing to narrow against
      "@typescript-eslint/no-explicit-any": "off",
      // `catch (e) {}` where the error is deliberately swallowed is an idiom
      // throughout the backend, and Goja is too old to rely on the optional
      // catch binding that would let the parameter be dropped entirely
      // ignoreRestSiblings keeps the "omit these keys" idiom legal:
      // `const { conditions, ...rest } = rule` names a field precisely in order
      // to leave it out, so the binding being unused is the whole point
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          caughtErrors: "none",
          argsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ["librarian/src/frontend/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["librarian/src/backend/**/*.js"],
    languageOptions: {
      globals: { input: "readonly", log: "readonly", gql: "readonly" },
    },
  },
  {
    files: ["librarian/test/**/*.js"],
    languageOptions: { globals: { ...globals.node } },
  },
];
