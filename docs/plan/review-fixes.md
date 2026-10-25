# План доработок по замечаниям ревью

Источник: список замечаний ревьюера к коммиту `7b075f1`.
Правила работы: все задачи делаются в ветке `fix/code-review-remarks`, PR в `main`
мержит только пользователь. После каждой завершённой задачи — пауза до указаний
пользователя по обработке замечаний в PR. Коммиты — Conventional Commits
(сообщения на английском).

## Зафиксированные решения

1. **Длительность типа встречи — информационное поле.** `duration_minutes`:
   int32, 30–180, кратно 30 (кратность проверяется в роуте). Сетка слотов,
   `UNIQUE(date, time)` и ADR-0008 не меняются; влияние длительности на занятость
   слотов отложено как путь роста.
2. **Роли — по URL через cookie.** Механика нынешнего дев-обхода (`dev_role`,
   `requireRole`, 403 на админ-ручках) становится единственным сценарием:
   пароли, подписанные cookie, `requireSession` и `AUTH_DISABLED` исчезают.
3. **Правила букинга — дублирование в `server/`.** Новый
   `server/booking-rules.ts` по образцу `server/date.ts` (чистые функции с
   параметром `moment`), без `shared/`-модуля и правок tsconfig. ADR-0007
   помечается `superseded`.

## Порядок выполнения

1 → 2 → 3 → 4 → 5. Задачи 3–5 строго последовательно: все три меняют
`contract/main.tsp`, `server/routes.ts`, `server/routes.test.ts`.
Каждая задача завершается зелёным `npm run check` (из
`calendar-of-meetings/`).

---

## Задача 1 — AGENTS.md в корень + Conventional Commits (замечание 4)

- `git mv calendar-of-meetings/AGENTS.md AGENTS.md`; в содержимом:
  - убрать «корень репозитория на уровень выше», переписать пути
    (`ARCHITECTURE.md` → `calendar-of-meetings/ARCHITECTURE.md`, раздел Layout);
  - в Commands пометить, что npm-команды выполняются из `calendar-of-meetings/`.
- Добавить раздел Conventional Commits: английские сообщения, формат
  `type(scope)?: subject`, типы feat/fix/docs/refactor/perf/test/build/ci/chore,
  `!` для breaking changes. Действует на новые коммиты, история не
  переписывается.
- Починить обратные ссылки (`calendar-of-meetings/ARCHITECTURE.md:7` —
  `./AGENTS.md` → `../AGENTS.md`), grep по ссылкам на AGENTS.md.
- Гейт: `npm run check`; коммит: `docs: move AGENTS.md to the repo root and
  adopt Conventional Commits`.

## Задача 2 — GitHub Actions: проверки + release-please (замечание 5)

- `.github/workflows/ci.yml`: push в рабочие ветки + pull_request; checkout;
  setup-node с Node 20 (пины jsdom/jest-dom/TypeSpec завязаны на Node 20),
  `cache: npm`, `cache-dependency-path: calendar-of-meetings/package-lock.json`;
  `npm ci` и `npm run check` с `working-directory: calendar-of-meetings`.
- `.github/workflows/release-please.yml`: `googleapis/release-please-action@v4`
  на push в main, `permissions: contents: write, pull-requests: write`, плюс
  корневые `release-please-config.json` (release-type node, package
  `calendar-of-meetings`) и `.release-please-manifest.json` (версия 0.0.0).
- Не трогать `hexlet-check.yml` и `opencode.yml`.
- Коммиты: `ci: add lint, typecheck and test workflow` и `ci: add
  release-please workflow`.

## Задача 3 — Длительность типа встречи (замечание 1)

- `contract/main.tsp`: `duration_minutes: int32` в `MeetingType` и
  `MeetingTypeDraft` (`@minValue(30) @maxValue(180)`); `npm run contract`
  (openapi.yaml, обе contract.gen.ts, JSON Schema, SDK).
- `server/db.ts`: SCHEMA_VERSION 1 → 2; `duration_minutes INTEGER NOT NULL
  DEFAULT 30` в CREATE TABLE + идемпотентный ALTER TABLE ADD COLUMN.
- Сервер: `meeting-types-repository.ts` (insert/select/toMeetingType),
  `routes.ts` (передача поля, проверка кратности 30), тесты репозитория и
  роутов.
- Фронт: `AdminView.tsx` — поле «Длительность» в модалке (NumberInput,
  min 30 / max 180 / step 30) + колонка «Длительность»; `GuestView.tsx` —
  длительность в описании типа и в шаге «Готово»; тесты `AdminView.test.tsx`,
  `GuestView.test.tsx`, `lib/meeting-types/inMemory.ts`, `http.test.ts`.
- Коммит: `feat: add meeting type duration to contract, server and UI`.

## Задача 4 — Серверные проверки букинга (замечание 2)

- `server/booking-rules.ts`: isPastDay, isWeekendDay, окно 14 дней,
  isAllowedTime (сетка 09:00–17:30, шаг 30), сегодняшний слот строго позже
  «сейчас»; момент — параметром (T3). `server/date.ts` расширяется до now().
- `server/routes.ts`, POST /api/meetings: 400 на прошедшую дату / вне окна /
  выходной / время вне сетки / сегодняшний прошедший слот; русские тексты.
- `server/routes.test.ts`: удалить тест-документацию T11 (строки 718–740),
  добавить негативы и границы на каждое правило (фиксированный moment).
- Контракт-доки: убрать «окно/выходные/прошлое сервер не проверяет (C1)».
- ADR-0007 → `status: superseded`; ARCHITECTURE.md, AGENTS.md.
- Коммит: `feat: enforce booking window, past dates, weekends and slot grid
  on the server`.

## Задача 5 — Убрать парольную авторизацию и сессии (замечание 3)

- Контракт: удалить `LoginInput`, `Session`, `SessionCookie`, `OkSession`,
  операции login/logout/me, все `@useAuth` и 401; 403 остаётся на
  админ-ручках. `npm run contract`.
- Сервер: `session.ts` сжимается до чтения роли из cookie `dev_role` и
  `requireRole` (переименовать в `server/role.ts`); `app.ts` — без
  `assertValidAuth` и паролей, cookie-parser остаётся без секрета;
  `index.ts` — из env только PORT/MEETINGS_DB_PATH; `routes.ts` — без
  login/logout/me; `contract.test.ts` — сеанс-гейт больше не требуется;
  `routes.test.ts` — сценарии без cookie-сессий.
- Фронт: `App.tsx` — роль из URL (`lib/devRole.ts`), без гейта /api/me;
  удалить `LoginScreen.tsx`, `hooks/useSession.ts`, `lib/session/` и их
  тесты; шапка — бейдж по роли + переключатель вида (/admin ↔ /);
  `credentials: 'include'` убрать из адаптеров.
- Инфра/доки: `.env.example` (PORT/MEETINGS_DB_PATH), `Dockerfile`,
  `docker-compose.yml`, корневой `README.md`, DEPLOY-доки, `GLOSSARY.md`,
  ADR-0006 → superseded, ARCHITECTURE.md, AGENTS.md.
- Коммит: `feat!: drop password auth and sessions in favor of URL-based
  roles`.

---

## Сквозные замечания

- Все npm-команды — из `calendar-of-meetings/`.
- Правки контракта — только через `contract/main.tsp` + `npm run contract`.
- PR мержит/закрывает только пользователь; после каждой задачи — пауза.
- После Задачи 5 учесть перепубликацию Amvera-обаза без секретных env.
