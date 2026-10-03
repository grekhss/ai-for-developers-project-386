# AGENTS.md

Guidance for AI agents working in this app. The git repo root is one level up.

## Commands

This folder is the only package in the repo — there is no root `package.json` and
no workspaces, so every npm command runs from here. Use **npm**
(`package-lock.json` is committed; do not introduce yarn/pnpm/bun). Node 20 /
npm 10 locally.

| Task | Command |
| --- | --- |
| Dev server (HMR) | `npm run dev` |
| Typecheck + production build | `npm run build` |
| Lint | `npm run lint` |
| Lint + autofix safe fixes | `npm run lint:fix` |
| Lint language server (for editors) | `npm run lint:lsp` |
| Lint + typecheck, no bundling | `npm run check` |
| Serve the built output | `npm run preview` |

- **There is no `typecheck` script.** `npm run build` runs `tsc -b` first, and
  `npm run check` runs lint + `tsc -b` without bundling — those are the two type
  gates. Note that `npm run dev` gives HMR but **no type feedback**: Vite strips
  types without checking them, so run `check` (or
  `npx tsc --noEmit -p tsconfig.app.json --watch` in a second terminal) while
  developing.
- **There is no test framework and no test script.** Do not add one unprompted.
  The real suite is external and runs on every push via
  `.github/workflows/hexlet-check.yml` at the repo root; that file must not be
  edited, renamed, or deleted.
- There is **no `README.md`** — the Hexlet template one was removed in `e8322d2`.
  Don't reference or try to update it.

## Linting (oxlint, not ESLint)

- **oxlint has no `--watch` mode.** There is no re-running lint loop; live
  feedback comes from the language server (`npm run lint:lsp`, verified working)
  wired up in your editor, or from `npm run check` by hand.
- **There is deliberately no pre-commit hook** — no husky, no lint-staged, no
  active git hooks, and CI does not run the linter. Don't add one unprompted;
  check whether the project has settled first.
- **`plugins` in `.oxlintrc.json` *replaces* the default plugin set, it does not
  extend it.** Adding one plugin silently disables the others, so the array must
  list every plugin the project wants. (`unicorn` is on by default in oxlint but
  is *not* in this project's array, so it is inactive — adding it back is a
  separate decision, not a fix.)
- `correctness` and `suspicious` are set to **error** so they fail the exit
  code. `perf` and `react/only-export-components` stay at `warn`, and
  `--deny-warnings` is not used, so warnings never fail `npm run lint`.
- `react/react-in-jsx-scope` is **off** because the project uses
  `jsx: "react-jsx"` — the rule would demand `React` in scope and flag every
  JSX element as a false positive.
- `npm run lint` prints nothing on success.

## Mantine v9 dates — check this before writing date code

`@mantine/dates` is **9.6.3**, whose API differs from most tutorials, Stack
Overflow answers, and your own priors. Verified against
`node_modules/@mantine/dates/lib/**/*.d.ts`:

- **Dates are strings, not `Date` objects.** `DateStringValue = string` in
  `YYYY-MM-DD` form; `DateValue = DateStringValue | Date | null`. Build and
  compare these with `dayjs`.
- **dayjs is a peer dependency** of `@mantine/dates` (`>=1.0.0`) and is listed in
  `dependencies` on purpose. Never remove or replace it — the calendar breaks
  without it. Don't add date-fns/luxon/moment alongside it.
- **`Calendar` cannot select a date.** It exposes `date` / `onDateChange` (the
  *displayed* month) plus `onMonthSelect` / `onYearSelect`. Its `value` and
  `onChange` are inherited from the root `div`'s DOM props
  (`ElementProps<'div'>`), so they are the wrong types for a date — and worse,
  they **silently do nothing at runtime**, because a `<div>` never fires
  `change`. Selection state lives only on `DatePicker`, `DateInput`, and
  `DatePickerInput`; `DatePickerProps` re-declares `value` / `onChange` and
  supports `type="default" | "multiple" | "range"`. `DatePicker` renders
  `Calendar` internally, so it is a drop-in replacement. `Month` is **not** one
  of them: it only takes `month` + `getDayProps` and computes no selection.
- **`onChange` yields a `DateStringValue`, so type state as `string | null`.**
  Don't round-trip through `new Date(str)` — `'YYYY-MM-DD'` parses as UTC
  midnight and renders as the *previous* day in negative-UTC-offset timezones.
  For display use `dayjs(date).format('D MMMM YYYY')`; the `LL` token needs the
  unconfigured `dayjs/plugin/localizedFormat`.
- **Date widgets render English labels by default.** Copy in this app is
  Russian, so wrap date components in
  `<DatesProvider settings={{ locale: 'ru' }}>` and `import 'dayjs/locale/ru'`.
- Prefer `getDayProps` / `renderDay` / `excludeDate` / `getDayAriaLabel` (all
  take a `DateStringValue`) over reaching into internals. Props prefixed `__`
  are private — don't pass them.

## Conventions

- **User-facing copy is in Russian** (`index.html` is `lang="ru"`, page title
  "Календарь встреч"). Match it — titles, labels, empty states, button text,
  `aria-label`s. Inline explanatory comments are Russian too (see `main.tsx`).
- The app is a **dark theme**: `MantineProvider defaultColorScheme="dark"`.
  Import Mantine's CSS once in `src/main.tsx`, never per component.
- `verbatimModuleSyntax` is on: type-only imports must use `import type`.
- `noUnusedLocals` and `noUnusedParameters` are on and will fail the build.
  Delete unused code rather than prefixing names with `_` to silence it.
- `erasableSyntaxOnly` is on: no TS-only runtime constructs (enums, parameter
  properties, namespaces).
- **`strict` is *not* enabled** in `tsconfig.app.json` (unlike the stock Vite
  template). Don't assume strict-null checking, and don't turn `strict` on
  unprompted.
- `tsconfig.app.json` sets `types: ["vite/client"]`, which replaces the usual
  `src/vite-env.d.ts`. Don't create that file.
- `moduleResolution: "bundler"` with `allowImportingTsExtensions` — relative
  imports may carry the `.tsx` extension (see `main.tsx`) but don't have to.
  There are no path aliases, so nested files import via `../`.
- Use the new JSX transform (`jsx: "react-jsx"`). Only `src/main.tsx` imports
  `React`, and only for `React.StrictMode`. New components do **not** need it.
- **No formatter is configured** (no Prettier, no EditorConfig) and linting is
  **oxlint**, not ESLint. Single quotes. Semicolon usage is inconsistent on
  purpose — `App.tsx` has them, `main.tsx` and `vite.config.ts` don't. Match the
  file you're editing instead of reformatting, and don't add a formatter
  unprompted.
- Don't "fix" `postcss.config.cjs` to ESM — the `.cjs` extension is required
  because `package.json` sets `"type": "module"`. Its Mantine breakpoint
  variables must keep matching Mantine's own breakpoints.
- New dependencies go in `dependencies` unless they're build- or lint-only.

## Layout

```
calendar-of-meetings/
├── index.html              # Vite entry; mount point #root, <html lang="ru">
├── vite.config.ts          # react() plugin only — no aliases or env vars
├── postcss.config.cjs      # CommonJS on purpose (package.json is ESM)
├── .oxlintrc.json
├── tsconfig.json           # project references only
├── tsconfig.app.json       # src/ — the app's compiler options
├── tsconfig.node.json      # vite.config.ts
├── public/favicon.svg      # served at /
└── src/
    ├── main.tsx            # createRoot, MantineProvider, Mantine CSS imports
    └── App.tsx             # all current UI
```

`src/App.css`, `src/index.css`, `src/assets/`, and `public/icons.svg` were dead
Vite-starter leftovers and have since been deleted — don't reintroduce them, and
don't assume any CSS beyond Mantine's stylesheets.