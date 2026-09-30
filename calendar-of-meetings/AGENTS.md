# AGENTS.md

Guidance for AI agents working in this repository.

## What this is

A "Календарь звонков" (call/meeting calendar booking service) — a Hexlet learning
project (`ai-for-developers`) built with AI assistance. The Vite app lives in
`calendar-of-meetings/`; the git repository root is one level above.

## Commands

Run everything from `calendar-of-meetings/`. Use **npm** (a `package-lock.json` is
committed; do not introduce yarn/pnpm/bun).

| Task | Command |
| --- | --- |
| Dev server (HMR) | `npm run dev` |
| Typecheck + production build | `npm run build` |
| Lint | `npm run lint` |
| Serve the built output | `npm run preview` |

**There is no `typecheck` script.** `npm run build` runs `tsc -b` first and is the
only thing that catches type errors, so run it before declaring work done.

**There is no test framework and no test script.** Do not add one unprompted. CI
runs Hexlet's external tests via `.github/workflows/hexlet-check.yml` at the repo
root — that file must not be edited, renamed, or deleted.

## Stack

- Vite 8, React 19, TypeScript ~6.0, ESM (`"type": "module"` in package.json)
- [Mantine v9](https://mantine.dev) — `@mantine/core`, `@mantine/dates`, `@mantine/hooks`
- [dayjs](https://dayjs.org) for dates (already a dependency — use it rather than
  adding date-fns/luxon/moment)
- **oxlint** for linting (not ESLint), configured in `.oxlintrc.json`
- PostCSS via `postcss-preset-mantine` + `postcss-simple-vars`; the breakpoint
  variables in `postcss.config.cjs` must match Mantine's own breakpoints

Node 20 is installed locally; `@types/node` is available for Node-side code.

## Conventions

- Use the new JSX transform (`jsx: "react-jsx"`). Only `src/main.tsx` imports
  `React`, and only for `React.StrictMode`. New components do **not** need it.
- Import Mantine's styles once in `src/main.tsx`, not per component.
- **User-facing copy is in Russian.** Match it — titles, labels, empty states,
  button text, `aria-label`s. The only exception is the `<title>` tag in
  `index.html`.
- `verbatimModuleSyntax` is on: type-only imports must use `import type`.
- `noUnusedLocals` and `noUnusedParameters` are on, and will fail the build.
  Delete unused code rather than prefixing names with `_` to silence it.
- `erasableSyntaxOnly` is on: no TS-only runtime constructs (enums, parameter
  properties, namespaces).
- `moduleResolution: "bundler"` with `allowImportingTsExtensions` — relative
  imports may carry the `.tsx`/`.ts` extension (see `main.tsx`) but are not
  required to.
- Quotes are single. There is **no formatter configured** (no Prettier, no
  EditorConfig) and semicolon usage is currently inconsistent — `App.tsx` uses
  them, `main.tsx` and `vite.config.ts` do not. Match the file you are editing
  rather than reformatting, and do not add a formatter unprompted.
- Comments should be Russian when they accompany user-facing code, consistent
  with the existing inline comment in `main.tsx`.

## Layout

```
calendar-of-meetings/
├── index.html              # Vite entry; mount point #root, page title
├── vite.config.ts          # react() plugin only — no aliases or env vars
├── postcss.config.cjs      # CommonJS on purpose (package.json is ESM)
├── .oxlintrc.json
├── tsconfig.json           # project references only
├── tsconfig.app.json       # src/ — the app's compiler options
├── tsconfig.node.json      # vite.config.ts
├── public/                 # served at / — favicon.svg, icons.svg
└── src/
    ├── main.tsx            # createRoot, MantineProvider (defaultColorScheme="dark")
    ├── App.tsx             # all current UI
```

`src/App.css`, `src/index.css`, `src/assets/*`, and `public/icons.svg` are dead
files from the Vite starter template — nothing imports them. They still describe
a light-themed landing page, which contradicts the dark Mantine theme. Prefer
deleting them over extending them; if one is kept, it must be imported
explicitly. Do not treat them as a styling reference.

## Adding features

- There are no path aliases, so relative imports go up as `../`.
- New dependencies go in `dependencies` unless they are build- or lint-only.
- Update the `<title>` in `index.html` and the `README.md` install/usage sections
  at the repo root when the project's shape changes.
- Before finishing: run `npm run lint` and `npm run build`, and report any
  failures rather than leaving them unverified.