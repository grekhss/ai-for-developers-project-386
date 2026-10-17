#!/usr/bin/env bash
# Единая команда генерации артефактов контракта (D5/ADR-0005): `npm run contract`.
# Генерирует ВСЕ семейства артефактов и в конце сверяет результат повторной
# генерацией (check.sh), поэтому успешный прогон гарантирует и свежесть, и
# детерминизм. Новый генератор добавляется ступенью ЗДЕСЬ и диффом в check.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. Спецификация OpenAPI из contract/main.tsp
npx tsp compile contract
mv -f tsp-output/@typespec/openapi3/openapi.yaml contract/openapi.yaml

# 2. TS-типы для обеих сторон. Две копии, а не одна общая: сервер не может
#    импортировать из src/ (rootDir: server), идентичность копий держит тест.
npx openapi-typescript contract/openapi.yaml -o src/lib/contract.gen.ts
npx openapi-typescript contract/openapi.yaml -o server/contract.gen.ts

# 3. Будущие ступени добавляются сюда (K3 — клиентский SDK, K4 — JSON Schema).

# 4. Самопроверка: перегенерация во временный каталог + diff по каждому семейству
bash contract/check.sh

echo "contract — артефакты сгенерированы и сверены"
