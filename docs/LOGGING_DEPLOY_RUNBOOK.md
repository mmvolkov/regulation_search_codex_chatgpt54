# Logging Deploy Runbook

Этот runbook нужен для двух ближайших задач:

- деплой обновленного dispatcher workflow в `n8n`
- деплой обновленного `site/` с feedback flow

## Что уже готово

- структура логов в Google Spreadsheet `regulation_search_codex_chatgpt54_log`
- листы:
  - `auth_log`
  - `interaction_log`
  - `feedback_log`
  - `document_loading_log`
  - `dashboard_daily`
- обновленный workflow:
  - `n8n/regulation_search_dispatcher.json`
- обновленный фронт и proxy:
  - `site/app.js`
  - `site/regulation-proxy/auth.php`
  - `site/regulation-proxy/search.php`
  - `site/regulation-proxy/upload.php`
  - `site/regulation-proxy/collection.php`
  - `site/regulation-proxy/feedback.php`
- готовый bundle builder:
  - `scripts/build_logging_deploy_bundle.sh`
- короткий smoke-test checklist:
  - `docs/LOGGING_SMOKE_TEST_CHECKLIST.md`

## Быстрый handoff

1. В корне репозитория выполнить:
   - `./scripts/build_logging_deploy_bundle.sh`
2. Забрать артефакты из:
   - `deploy/bundles/logging_deploy_bundle_<timestamp>/`
   - `deploy/bundles/logging_deploy_bundle_<timestamp>.tar.gz`
3. Передать архив оператору или использовать его как deploy package для `n8n` и web root.

## 1. Деплой workflow в n8n

1. Открыть production `n8n`.
2. Экспортировать текущую production-версию workflow как бэкап.
3. Импортировать `n8n/regulation_search_dispatcher.json`.
4. Проверить узлы записи в Google Sheets:
   - `Append Auth Log`
   - `Append Interaction Log`
   - `Append Upload Log`
   - `Append Clear Log`
   - `Append Feedback Log`
5. Проверить, что все они пишут в spreadsheet:
   - `1IYQFLqJyingGBr0gjxIfR3JY1HIsRQ5SzdMu6Nt3Z-w`
6. Проверить credential:
   - `Google Service Account account n8n-integration`
7. Сохранить workflow и активировать его.
8. Убедиться, что используется production webhook:
   - `/webhook/regulation-search-dispatch`

## 2. Деплой сайта

1. Скопировать обновленное содержимое каталога `site/` в production web root.
2. Проверить, что файл `site/regulation-proxy/feedback.php` тоже опубликован.
3. Убедиться, что production UI использует актуальный endpoint:
   - либо `./regulation-proxy/search.php`
   - либо production dispatcher URL, если он задан вручную в интерфейсе
4. Очистить кэш браузера или открыть UI в новой вкладке без старого `localStorage`.

## 3. Smoke test

### authorize

1. Открыть UI.
2. Ввести рабочий email.
3. Нажать `Проверить доступ`.

Ожидается:

- успешный ответ в UI
- новая строка в `auth_log`

### search

1. Выполнить один поиск по регламентам.

Ожидается:

- ответ в UI
- `requestId` приходит во фронт
- новая строка в `auth_log`
- новая строка в `interaction_log`

### feedback

1. После поиска нажать `Да` или `Нет`.

Ожидается:

- в UI появляется подтверждение сохранения
- новая строка в `feedback_log`
- `request_id` в `feedback_log` совпадает с `request_id` из `interaction_log`

### upload

1. Загрузить один `.docx`.

Ожидается:

- успешный ответ в UI
- новая строка в `auth_log`
- новая строка в `document_loading_log`

### collection clear

1. Выполнить очистку коллекции под `admin`.

Ожидается:

- успешный ответ
- новая строка в `document_loading_log` с `action = collection_clear`

## 4. Что проверить отдельно

- `interaction_log.feedback` и `interaction_log.feedback_at` пока не заполняются автоматически из `feedback_log`
- если нужно видеть feedback прямо в `interaction_log`, потребуется отдельный merge/update слой, потому что сейчас feedback хранится как отдельное событие
- поля `retrieval_mode`, `collection_name`, `index_version`, `avg_chunk_chars` и похожие будут полнее после того, как upstream backend начнет стабильно возвращать эти атрибуты
