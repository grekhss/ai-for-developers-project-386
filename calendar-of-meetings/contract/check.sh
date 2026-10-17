#!/usr/bin/env bash
# K1 (ADR-0004): дрейф-проверка артефактов контракта. Генерируем контракт во
# временный каталог и сверяем с закоммиченными openapi.yaml и .gen.ts. Падает,
# если артефакты устарели относительно contract/main.tsp или отредактированы
# руками. Простой `git diff` после регенерации не годится: он даёт ложное падение
# на ещё не закоммиченном изменении контракта.
set -euo pipefail
cd "$(dirname "$0")/.."

tmp="node_modules/.tmp/contract-check"
rm -rf "$tmp"
npx tsp compile contract --output-dir "$tmp" >/dev/null
npx openapi-typescript "$tmp/@typespec/openapi3/openapi.yaml" -o "$tmp/contract.gen.ts" >/dev/null

diff -u contract/openapi.yaml "$tmp/@typespec/openapi3/openapi.yaml"
diff -u src/lib/contract.gen.ts "$tmp/contract.gen.ts"
diff -u server/contract.gen.ts "$tmp/contract.gen.ts"

echo "contract:check — артефакты совпадают с contract/main.tsp"
