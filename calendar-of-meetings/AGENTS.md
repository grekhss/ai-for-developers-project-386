# AGENTS.md

Guidance for AI agents working in this app. The git repo root is one level up.

## Commands

This folder is the only package in the repo — there is no root `package.json` and
no workspaces, so every npm command runs from here. Use **npm**
(`package-lock.json` is committed; do not introduce yarn/pnpm/bun). Node 20 /
npm 10 locally.

| Task | Command |
| --- | --- |
| Dev (Vite HMR + API-сервер) | `npm run dev` |
| API-сервер только (watch) | `npm run dev:server` |
| Prod-сборка фронта и сервера | `npm run build` |
| Запуск прод-сервера (API + статика) | `npm start` — только после `npm run build` |
| Lint | `npm run lint` |
| Lint + autofix safe fixes | `npm run lint:fix` |
| Lint language server (for editors) | `npm run lint:lsp` |
| Tests (single run) | `npm test` |
| Tests (watch mode) | `npm run test:watch` |
| Full gate: lint + typecheck + tests | `npm run check` |
| Preview собранной статики | `npm run preview` — без `/api`, записи не грузятся |

- **There is no `typecheck` script.** `npm run build` runs `tsc -b` first, and
  `npm run check` runs lint + `tsc -b` + `tsc -p tsconfig.server.json --noEmit`
  + vitest without bundling — those are the two type gates. Note that `npm run
  dev` gives HMR but **no type feedback**: Vite and `tsx watch` strip types
  without checking them, so run `check` (or
  `npx tsc --noEmit -p tsconfig.app.json --watch` in a second terminal) while
  developing.
- **`npm run dev` starts two processes** (concurrently: `tsx watch server/index.ts`
  and `vite`); Ctrl-C kills both (`-k`). There is a startup race: the first
  request can arrive before `listen(PORT)` → a one-off `LOAD_ERROR` under the
  calendar; acceptable.
- **`npm start` serves only after `npm run build`** — it needs both `dist/` and
  `dist-server/`.
- **`npm run preview` is a build-only smoke check.** It serves the static
  `dist/` without `/api`, so bookings fail to load.
- Hexlet's own suite is separate and external: it runs on every push via
  `.github/workflows/hexlet-check.yml` at the repo root, which must not be
  edited, renamed, or deleted. It does **not** run lint, typecheck, or the local
  tests — nothing in CI does, so `npm run check` is manual.
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
- `npm run lint` exits 0 with `react-perf(jsx-no-new-*-as-prop)` warnings
  printed inline — `perf` is `warn` and `--deny-warnings` isn't used, so those
  are noise, not failures. Inline lambdas passed as props are idiomatic here;
  hoist a handler to a module constant only when it's a pure predicate.

## Testing (vitest + Testing Library)

- **Do not "upgrade" vitest to v5.** npm 10.8.2 cannot resolve its peer graph at
  all: `TypeError: Cannot read properties of null (reading 'edgesOut')` in
  arborist's `#loadPeerSet`. It fails on `npm i -D vitest@5` alone and leaves
  `package.json` untouched. The project is pinned to `vitest@^4.1.11`, whose
  `vite` peer (`^6 || ^7 || ^8`) covers vite 8. Moving to v5 means upgrading
  npm first.
- **Two deps are capped by Node 20, not by preference.** `jsdom` is `^29` (v30
  requires Node `^22.22.2`) and `@testing-library/jest-dom` is `~6.9.1` (v7 and
  6.10.0 require Node ≥22). `~` is deliberate — a caret would drift to 6.10.0
  and break the install. Revisit all three pins together if Node is upgraded.
- **Test config lives in `vite.config.ts`; don't split out a
  `vitest.config.ts`.** Vitest does not merge the two — a `vitest.config.ts`
  fully *displaces* `vite.config.ts` (verified: with one in place, the
  `environment` and `setupFiles` from `vite.config.ts` were gone and all tests
  died on `document is not defined`). JSX still compiles without the `react()`
  plugin, because Vite transforms TSX from tsconfig's `jsx: react-jsx` — so the
  plugin was never what made the tests work, and the breakage is *silent* for
  anything added later (aliases, extra plugins, `define`). Keep one config.
- **Vitest runs two `projects` in `vite.config.ts`: `app` and `server`.**
  `app` — jsdom + `src/test/setup.ts`, files under `src/**`; `server` — node,
  no setup, files under `server/**` (they carry `@vitest-environment node` and
  use `:memory:` SQLite). The setup's `window.matchMedia` stub only applies to
  the app project — under node it would crash. Default `include`/`exclude` are
  not enough here: the explicit `include` also keeps any built
  `dist-server/*.test.js` from running.
- **The config uses `/// <reference types="vitest/config" />` rather than
  importing `defineConfig` from `vitest/config`,** so `vite build` doesn't need
  vitest installed at runtime. Delete that reference and `tsc` fails on the
  `test` key.
- **`src/test/setup.ts` carries three load-bearing lines.** `window.matchMedia`
  is stubbed because jsdom doesn't implement it and Mantine's
  `use-provider-color-scheme` calls it (every render test throws otherwise);
  `import 'dayjs/locale/ru'` is required because tests import `App.tsx` directly
  and bypass the import in `main.tsx` — without it the calendar silently renders
  "October 2026" / "MoTuWe..."; and `afterEach(cleanup)` is explicit because
  RTL's auto-cleanup only self-registers when a *global* `afterEach` exists.
  Don't delete any of them as unused.
- **No `globals: true`** — `tsconfig.app.json` pins
  `types: ["vite/client"]`, so tests must `import { describe, it, expect } from
  'vitest'`. Adding `globals` means editing that `types` array.
- Tests are **colocated in `src/`**, so `tsc -b` typechecks them for free and a
  type error in a test fails `npm run check`.
- Mantine days are `<button>`s carrying `data-selected` / `data-today` /
  `data-outside`. Query those, not day text — numbers repeat across outside
  days, so `getByText('1')` is ambiguous. `data-today` is unique and is the
  stable click target. Each day also gets a localized default
  `aria-label` ("3 октября 2026") computed in `Month.mjs`.
- **Mantine v9 throws without `MantineProvider` in the tree** ("MantineProvider
  was not found in component tree") — every render test must wrap the component
  it renders. `DatesProvider` is only needed for date widgets that read locale
  or weekend days from context; a `Modal` with a `TimeGrid` does not need it.
- `TimeGrid` slots are `<button>`s whose text is the formatted time, so
  `getByRole('button', { name: '09:00' })` works. Taken slots are `disabled`
  **and** carry `data-disabled`; the active slot gets Mantine's `active`
  class, not a `data-` attribute.
- **Calendar CSS classes are `mantine-DatePicker-*`, not `mantine-Calendar-*`.**
  Verified ones: `-weekday` (7 cells, lowercase 2-letter Russian: `пн`…`вс`),
  `-weekdaysRow`, `-calendarHeaderLevel` (button with "октябрь 2026"),
  `-day`, `-monthTbody`. Don't guess `.mantine-Calendar-header` — it doesn't
  exist in v9 and the failure mode is a confusing
  "undefined and string is invalid for this assertion" instead of a null check.
- **Assert the locale from day `aria-label`s, not from the header text.**
  The header shows the *current* month, so a test asserting "октября" passes in
  October and fails in November. `/^\d{1,2} [а-яё]+ \d{4}$/` proves Russian
  locale in any month.
- **`App` takes an optional `api` prop, and it is load-bearing in tests.**
  `lib/bookings/api.ts` exports a module-level singleton, so without a per-test
  `createInMemoryBookingsApi()` the bookings leak between test cases in the same
  file and a slot booked by an earlier test is `disabled` in a later one — the
  click silently does nothing and the test times out on a `findBy`. Pass
  `api={createInMemoryBookingsApi()}` from every render test.

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

- **Server imports carry the `.js` suffix** (`server/routes.ts` imports
  `./repository.js`). `moduleResolution: nodenext` + ESM require it, and both
  `tsx` and vitest resolve `.js` → `.ts` for TS importers. Don't mix with `src/`,
  where `moduleResolution: bundler` and extensions are optional. `rootDir:
  server` blocks any import from `src/` — that's deliberate (domain rules stay on
  the front, see ARCHITECTURE §7).
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
- **`react/set-state-in-effect` is an error, and it is transitive:** calling a
  function that touches `setState` from an effect body is flagged *even if the
  `setState` happens after an `await`*. So a "load on mount" effect can't call
  the hook's own `refresh` — see the inlined `load` in `useBookings.ts` for the
  accepted shape. Don't "simplify" it back into `void refresh()`.
- **`strict` is on** in `tsconfig.app.json` (enabled 2026-10-03, so don't assume
  the stock Vite template's laxer defaults). Nullable date/time state — the bulk
  of this app — is checked, so expect `string | null` to be narrowed explicitly
  rather than passed through. `skipLibCheck` is also on, so strict never surfaces
  errors from Mantine's own `.d.ts`.
- `DatePicker`'s `onChange` is typed `(value: DateStringValue | null) => void`
  even with `type="default"` — `allowDeselect` can emit `null`, so a handler
  can't be typed `(date: string) => void`. Narrow inside the wrapper component
  that owns the `DatePicker`.
- **`getDayProps` overrides the props `DatePicker` computes itself.** In
  `DatePicker.mjs` the day props are built as `...getControlProps(date)` *then*
  `...calendarProps.getDayProps?.(date)`, so a hand-passed `selected` replaces
  the real selection — always OR it with the current value. Symmetrically, in
  `Month.mjs` `disabled` is computed from `excludeDate` / `minDate` / `maxDate`
  *before* `...dayProps` is spread, so a `disabled` from `getDayProps` would
  silently defeat `excludeDate`. Don't pass one.
- Day cells expose `data-selected` / `data-today` / `data-disabled`, but
  `data-outside` and `data-weekend` are only set on **enabled** days
  (`!disabled && outside`), so a disabled weekend has neither attribute.
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
├── vite.config.ts          # react() plugin + vitest projects (app/server) + /api proxy
├── postcss.config.cjs      # CommonJS on purpose (package.json is ESM)
├── .oxlintrc.json
├── tsconfig.json           # project references only
├── tsconfig.app.json       # src/ — the app's compiler options
├── tsconfig.node.json      # vite.config.ts
├── tsconfig.server.json    # server/ + его тесты (nodenext, rootDir: server)
├── tsconfig.server.build.json  # эмитит dist-server/ (тесты исключены)
├── ARCHITECTURE.md         # how it's built and why; read before coding
├── data/bookings.sqlite    # SQLite-файл (в .gitignore; создаётся в server/db.ts)
├── dist-server/            # собранный сервер (в .gitignore)
├── public/favicon.svg      # served at /
├── server/                 # express + better-sqlite3; импорты — с .js-суффиксом
│   ├── index.ts            # wiring: БД → createApp → listen; логики нет
│   ├── app.ts              # createApp: express.json, роуты, статика dist/
│   ├── routes.ts           # GET/POST /api/bookings
│   ├── repository.ts       # createRepository: list/create; UNIQUE → DuplicateBookingError
│   ├── db.ts               # createDatabase + defaultDbPath (data/bookings.sqlite)
│   ├── validate.ts         # форматная валидация тела и query (не домен!)
│   ├── types.ts            # Booking/BookingDraft — копия контракта из src
│   ├── repository.test.ts  # @vitest-environment node
│   └── routes.test.ts      # интеграция: createApp(':memory:') + listen(0) + fetch
└── src/
    ├── main.tsx            # createRoot, provider stack, Mantine CSS imports
    ├── App.tsx             # page-level state and layout; renders components/
    ├── App.test.tsx        # colocated vitest tests
    ├── components/         # rendering only; props in, no domain rules
    │   ├── BookingModal.tsx   # slot picker in a Modal; controlled time prop
    │   ├── BookingModal.test.tsx
    │   └── MeetingCalendar.tsx  # the only component that renders date selection
    ├── hooks/              # React state around lib; the only place with useState
    │   ├── useBookings.ts  # load/create bookings; takes a BookingsApi so tests inject a fake
    │   └── useBookings.test.ts
    ├── lib/                # framework-free domain code, unit-tested beside itself
    │   ├── date.ts         # APP_LOCALE, today, isWeekend, isPast, isBookable, formatDateRu
    │   ├── date.test.ts
    │   ├── slots.ts        # generateTimeSlots — workday bounds and slot length
    │   ├── slots.test.ts
    │   └── bookings/
    │       ├── types.ts    # Booking, BookingDraft, DateRange
    │       ├── api.ts      # BookingsApi interface + the instance the app uses (HTTP)
    │       ├── http.ts     # createHttpBookingsApi — fetch на /api/bookings
    │       ├── http.test.ts
    │       ├── inMemory.ts # тестовая фабрика/fake (createInMemoryBookingsApi)
    │       └── inMemory.test.ts
    └── test/setup.ts       # matchMedia stub, dayjs locale, RTL cleanup (app-проект vitest)
```

**Read `ARCHITECTURE.md` first.** It covers the layers, the `BookingsApi`
contract, the decisions that cost something (controlled slot in `App`, inlined
mount load, `api` prop in `App`) and the known gaps. This file covers commands,
conventions, and Mantine traps — the two documents deliberately don't repeat each
other.

**Three layers:** `lib/` holds pure functions and types with no React and no
Mantine imports; `components/` renders; `hooks/` is the only place that owns
React state and the only bridge between `components/` and `lib/bookings/api.ts`.
Domain rules and date formatting live in `lib/` and are duplicated nowhere — if
a second component needs "is this a bookable day?" or "how do we spell a date in
Russian?", it imports from `lib/`, it does not re-derive it. Keep
`@mantine/dates` confined to `components/` that actually render dates, so the
rest of the app passes plain `'YYYY-MM-DD'` strings around.

**`App` owns only UI state; `lib` state is never mirrored.** It holds
`selectedDate`, `time`, and `lastBooked` (a `BookingDraft` kept only to render
the «Запись: …» line — `Booking` carries no creation timestamp, so "the newest
one" isn't derivable from the sorted array). Resetting on date change happens in
the click handler, not in an effect:

```tsx
onSelect={(date) => { setTime(null); setSelectedDate(date); }}
```

`BookingModal` is deliberately always mounted (so Mantine keeps its close
animation) and takes `date: string | null` where `null` means closed — no `key`
remount, no local `useState` for the slot. `takenTimes` comes from the bookings
for that date, which is what makes a booked slot unselectable on reopen.

**Data access goes through `BookingsApi`** (`lib/bookings/api.ts`), never
straight to a concrete implementation. `api.ts` holds the interface *and* the
instance the app uses, so switching to HTTP is a one-line change there;
components and hooks only see the interface. Hooks take the API as a parameter
with that instance as the default, which is how tests inject a fake without
`vi.mock`.

**Tests must not assume "today is selectable."** Past days and weekends are
disabled by `isBookable`, so `[data-today]` is unclickable whenever today falls
on a weekend (and it was, on 2026-10-03). Select "the first enabled day of the
displayed month" (`tbody button:not([disabled])` without `data-outside`) instead,
and page to the next month via `[data-direction="next"]` when the current one has
none left. Assert on `disabled` for rule checks rather than on dates.

`src/App.css`, `src/index.css`, `src/assets/`, and `public/icons.svg` were dead
Vite-starter leftovers and have since been deleted — don't reintroduce them, and
don't assume any CSS beyond Mantine's stylesheets.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`grekhss/ai-for-developers-project-386`), driven by the `gh` CLI. See `docs/agents/issue-tracker.md` (at the git repo root).

### Triage labels

The five canonical triage roles, each label string equal to its role name. See `docs/agents/triage-labels.md` (at the git repo root).

### Domain docs

Single-context — one `GLOSSARY.md` + `docs/adr/` at the git repo root. See `docs/agents/domain.md` (at the git repo root).
