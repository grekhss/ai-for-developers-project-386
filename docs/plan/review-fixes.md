# План доработок по замечаниям ревью

Источник: список замечаний ревьюера к коммиту `7b075f1` + находки ревью PR #28
(обработаны ревизией от 2026-10-25).

**Правила работы и формат коммитов — в корневом [`AGENTS.md`](../AGENTS.md)**
(разделы «Правила сессии» и «Commits»); здесь не дублируются. Коротко: задачи
делаются в ветке `fix/code-review-remarks` (PR #28 в `main`), после каждой —
пауза до указаний пользователя; мерж — только пользователь. Коммиты —
Conventional Commits, `feat!` сопровождается телом с пояснением, что ломается.

## Зафиксированные решения

1. **Длительность типа встречи — информационное поле.** `duration_minutes`:
   int32, 30–180, кратно 30 (кратность проверяется в роуте). Сетка слотов,
   `UNIQUE(date, time)` и ADR-0008 не меняются; влияние длительности на
   занятость слотов отложено как путь роста.
2. **Роли — по URL через cookie.** Механика нынешнего дев-обхода (`dev_role`,
   `requireRole`, 403 на админ-ручках) становится единственным сценарием:
   пароли, подписанные cookie, `requireSession` и `AUTH_DISABLED` исчезают.
3. **Правила букинга — дублирование в `server/`.** Новый
   `server/booking-rules.ts` по образцу `server/date.ts` (чистые функции с
   параметром `moment`), без `shared/`-модуля и правок tsconfig. Осознанное
   дублирование фиксируется новым ADR взамен ADR-0007.
4. **Имя записавшегося — в форме записи** (решение пользователя от
   2026-10-25): `booker_name` появляется в `MeetingDraft`, гость вводит имя на
   шаге «Готово» перед «Записаться». Сервер валидирует непустое имя ≤ 100
   символов — `MAX_BOOKER_LENGTH` переезжает из проверки сессии в проверку
   draft; фиксированное `DEV_BOOKER_NAME` («Гость») исчезает вместе с
   дев-обходом. `PlannedMeeting.booker` и колонка Booker в админке остаются.

## Порядок выполнения

1 → 2 → 3 → 4 → 5. Задачи 3–5 строго последовательно: все три меняют
`contract/main.tsp`, `server/routes.ts`, `server/routes.test.ts`.
Каждая задача завершается зелёным `npm run check` (из
`calendar-of-meetings/`) и правкой затрагиваемых доков — пункт «доки» есть в
каждой задаче.

---

## Задача 1 — AGENTS.md в корень + Conventional Commits (замечание 4) — выполнена

- `git mv calendar-of-meetings/AGENTS.md AGENTS.md`; шапка задаёт конвенцию
  путей прозой относительно пакета, ссылки — от расположения файла.
- Раздел «Commits» (Conventional Commits, типы, `!`, история не
  переписывается, связь с release-please).
- Правила сессии переписаны по указанию пользователя (ревью PR отметило это
  как расширение объёма Задачи 1 — оно было запрошено напрямую, вне списка
  замечаний): агент ведёт ветку и PR, мерж — пользователь, пауза после
  задачи.
- Устранена устарелость про README (корневой `README.md` существует с
  `7b075f1`), интро Commands переписано на запуск из `calendar-of-meetings/`.
- Починена обратная ссылка `ARCHITECTURE.md` → `../AGENTS.md`.
- Коммит: `docs: move AGENTS.md to the repo root and adopt Conventional
  Commits` (`dac2429`).

## Задача 2 — GitHub Actions: проверки + release-please (замечание 5) — выполнена

- `.github/workflows/ci.yml`: триггеры — push в `main` + `pull_request`
  (push во все ветки давал бы дубль прогона у ветки с открытым PR — находка
  ревью PR #29), `concurrency` с `cancel-in-progress`, `permissions:
  contents: read`, checkout с `persist-credentials: false`, `timeout-minutes`;
  setup-node с Node 20 (пины jsdom/jest-dom/TypeSpec завязаны на Node 20),
  `cache: npm`, `cache-dependency-path: calendar-of-meetings/package-lock.json`;
  `npm ci` и `npm run check` с `working-directory: calendar-of-meetings`.
- `.github/workflows/release-please.yml`: `googleapis/release-please-action@v5`
  на push в `main`, `permissions: contents: write, pull-requests: write,
  issues: write` — `issues: write` обязателен для лейбла
  `autorelease: pending` на первом релизе (блокирующая находка ревью PR #29).
  Корневой `release-please-config.json` с записью `packages`:
  `{"calendar-of-meetings": {"release-type": "node", "initial-version":
  "0.1.0", "bump-minor-pre-major": true}}` (корневого `package.json` нет —
  манифест-режим обязателен; `initial-version` закрепляет первый релиз
  0.1.0 — иначе 1.0.0, а `bump-minor-pre-major` держит breaking changes в
  0.x на minor-бампах — находки ревью PR #29 и продуктовое решение от
  2026-10-25) и `.release-please-manifest.json` с ключом
  `"calendar-of-meetings": "0.0.0"`. Для открытия релизных PR владельцу
  нужно включить флаг «Allow GitHub Actions to create and approve pull
  requests» в настройках репозитория (сейчас выключен).
- **Доки (по находке ревью):** обновить устаревающие строки `AGENTS.md` —
  «nothing in CI does, so `npm run check` is manual» (буллет про hexlet-check)
  и «CI does not run the linter» (буллет про pre-commit hook): после `ci.yml`
  CI гоняет `npm run check` полностью; hexlet-check остаётся внешней
  проверкой, которую нельзя править.
- Не трогать `hexlet-check.yml` и `opencode.yml`.
- Коммиты: `ci: add lint, typecheck and test workflow` (`3830b1d`), `ci: add
  release-please workflow` (`320e1e4`), `docs: refresh CI claims in AGENTS.md
  for the new workflows` (`ec2702b`), `ci: address PR review of the
  workflows` (правки по ревью PR #29: `issues: write`, `initial-version`
  0.1.0, триггеры без дублей, least-privilege, AGENTS.md/план).

## Задача 3 — Длительность типа встречи (замечание 1) — выполнена

- `contract/main.tsp`: `duration_minutes: int32` в `MeetingType` и
  `MeetingTypeDraft` (`@minValue(30) @maxValue(180)`); **явно удалить ложный
  комментарий модели** «Длительность не моделируется — на сетку слотов она
  не влияет» (строки 87–91) и заменить описанием семантики (информационное
  поле). `npm run contract` (openapi.yaml, обе contract.gen.ts, JSON Schema,
  SDK).
- `server/db.ts`: SCHEMA_VERSION 1 → 2; `duration_minutes INTEGER NOT NULL
  DEFAULT 30` в CREATE TABLE + идемпотентный ALTER TABLE ADD COLUMN.
- Сервер: `meeting-types-repository.ts` (insert/select/toMeetingType),
  `routes.ts` (передача поля, проверка кратности 30), тесты репозитория и
  роутов.
- Фронт: `AdminView.tsx` — поле «Длительность» в модалке (NumberInput,
  min 30 / max 180 / step 30) + колонка «Длительность»; `GuestView.tsx` —
  длительность в описании типа и в шаге «Готово»; тесты `AdminView.test.tsx`,
  `GuestView.test.tsx`, `lib/meeting-types/inMemory.ts`, `http.test.ts`.
- Коммит: `feat: add meeting type duration to contract, server and UI`
  (`a136381`) + `fix: address PR review on the duration feature` — правки по
  ревью PR #30: цельное описание в артефактах (строка doc-комментария,
  начинавшаяся с `@maxValue`, обрезалась парсером TypeSpec), доменный
  `lib/duration.ts` вместо дублирования правил во вью, точная формулировка про
  multipleOf, закрытие БД в тесте миграции, проверка радио-описания в
  GuestView-тесте, актуализация ARCHITECTURE/AGENTS/GLOSSARY.

## Задача 4 — Серверные проверки букинга (замечание 2)

- `server/booking-rules.ts`: isPastDay, isWeekendDay, окно 14 дней,
  isAllowedTime (сетка 09:00–17:30, шаг 30), сегодняшний слот строго позже
  «сейчас»; момент — параметром (T3). `server/date.ts` расширяется до now().
- `server/routes.ts`, POST /api/meetings: 400 на прошедшую дату / вне окна /
  выходной / время вне сетки / сегодняшний прошедший слот; русские тексты.
- `server/routes.test.ts`: удалить тест-документацию T11 (строки 718–740),
  добавить негативы и границы на каждое правило (фиксированный момент).
- **Доки (по находке ревью):** комментарий-шапка контракта «Контракт описывает
  формат и схему, не домен» и док `createMeeting` «Окно/выходные/прошлое
  сервер не проверяет (C1)» переписываются. **Новый ADR-0009** (сервер
  проверяет домен букинга; правила продублированы в `server/booking-rules.ts`
  осознанно, без `shared/`), **ADR-0007 → `status: superseded`** со ссылкой на
  0009. ARCHITECTURE.md, AGENTS.md — соответствующие пункты; корневой
  `README.md` «Server-side rules» становится правдой.
- Коммит: `feat: enforce booking window, past dates, weekends and slot grid
  on the server` (+ `docs: supersede ADR-0007 with server-side booking
  rules` — или одним коммитом).

## Задача 5 — Убрать парольную авторизацию и сессии (замечание 3)

- Контракт: удалить `LoginInput`, `Session`, `SessionCookie`, `OkSession`,
  операции login/logout/me, все `@useAuth` и 401; 403 остаётся на
  админ-ручках. **Добавить `booker_name` в `MeetingDraft`** (решение 4):
  непустое, ≤ 100 символов. `npm run contract`.
- Сервер: `session.ts` сжимается до чтения роли из cookie `dev_role` и
  `requireRole` (переименовать в `server/role.ts`); `app.ts` — без
  `assertValidAuth` и паролей, cookie-parser остаётся без секрета;
  `index.ts` — из env только PORT/MEETINGS_DB_PATH; `routes.ts` — без
  login/logout/me, `booker` берётся из `req.body.booker_name` с валидацией
  (непустое после trim, ≤ 100); `contract.test.ts` — сеанс-гейт больше не
  требуется; `routes.test.ts` — сценарии без cookie-сессий, имя — в теле
  запроса.
- Фронт: `App.tsx` — роль из URL (`lib/devRole.ts`), без гейта /api/me;
  удалить `LoginScreen.tsx`, `hooks/useSession.ts`, `lib/session/` и их
  тесты; `GuestView.tsx` — поле «Ваше имя» на шаге «Готово» (required,
  отправляется с записью); шапка — бейдж по роли + переключатель вида
  (/admin ↔ /); `credentials: 'include'` убрать из адаптеров.
- **Доки (по находке ревью):** **новый ADR-0010** (роли по URL, без сессий и
  паролей; `booker_name` в форме записи), **ADR-0006 → `status:
  superseded`** со ссылкой на 0010. `.env.example` (PORT/MEETINGS_DB_PATH),
  `Dockerfile` (убрать AUTH_DISABLED/пароли), `docker-compose.yml`, корневой
  `README.md` (Access/Environment), DEPLOY-доки, `GLOSSARY.md` (термины про
  сессию), ARCHITECTURE.md, AGENTS.md.
- Коммит: `feat!: drop password auth and sessions in favor of URL-based
  roles` — **с телом**, поясняющим breaking change (контракт: −login/me, 401,
  `booker_name` в MeetingDraft; деплой: секреты больше не нужны) — как
  требует `AGENTS.md`. Релиз после этого коммита — `0.3.0` (при релизах
  0.1.0/0.2.0 после задач 3/4): `bump-minor-pre-major` держит breaking в 0.x
  на minor, major не тратится.

---

## Сквозные замечания

- Все npm-команды — из `calendar-of-meetings/`; прозовые пути в AGENTS.md —
  относительно пакета.
- Правки контракта — только через `contract/main.tsp` + `npm run contract`.
- Отменяемые решения фиксируются новыми ADR (0009, 0010) со статусом
  `superseded` у старых (0007, 0006) — «почему» не теряется из ADR-лога
  (находка ревью).
- PR мержит/закрывает только пользователь; после каждой задачи — пауза.
- После Задачи 5 учесть перепубликацию Amvera-образа без секретных env.
