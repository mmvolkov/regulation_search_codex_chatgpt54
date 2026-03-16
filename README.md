# Помощник для сотрудников

Поиск по корпоративным регламентам в формате `docx` с опорой на:

- предметный парсинг сложных Word-документов;
- гибридную индексацию в `Qdrant` (dense + sparse);
- production-фронтенд на Beget;
- `PHP` proxy для same-origin доступа;
- `n8n` dispatcher как центральный маршрутизатор с логированием;
- логирование всех действий в Google Sheets.

Корпус регламентов и часть production backend живут вне Git и подключаются отдельно.

## Профили запуска

В репозитории явно разделены два контура:

- `docker-compose.yml` в корне: локальный dev-контур, который поднимает только `Qdrant`;
- `deploy/beget/docker-compose.yml`: production-образец для Beget с `Traefik`, `n8n`, `Postgres`, `Redis`, `Qdrant`, `ingest-api` и внешним `regulation-search-api`.

Это важно: корневой compose не описывает боевой стек целиком.

## Документы проекта

- Краткое описание: [docs/PROJECT_ONE_PAGER.md](docs/PROJECT_ONE_PAGER.md)
- Подробное техническое описание: [docs/PROJECT_DESCRIPTION.md](docs/PROJECT_DESCRIPTION.md)
- Обследование проекта: [docs/Обследование.md](docs/Обследование.md)
- Схема логирования dispatcher: [docs/LOGGING_SCHEMA.md](docs/LOGGING_SCHEMA.md)
- Runbook деплоя логирования: [docs/LOGGING_DEPLOY_RUNBOOK.md](docs/LOGGING_DEPLOY_RUNBOOK.md)
- Smoke test checklist: [docs/LOGGING_SMOKE_TEST_CHECKLIST.md](docs/LOGGING_SMOKE_TEST_CHECKLIST.md)

## Структура

```text
.
├── deploy/
│   ├── beget/
│   │   ├── .env.example
│   │   ├── docker-compose.yml
│   │   ├── Dockerfile.ingest-api
│   │   ├── healthcheck.js
│   │   ├── init-data.sh
│   │   └── README.md
│   └── bundles/
├── docs/
│   ├── PROJECT_ONE_PAGER.md
│   ├── PROJECT_DESCRIPTION.md
│   ├── Обследование.md
│   ├── LOGGING_SCHEMA.md
│   ├── LOGGING_DEPLOY_RUNBOOK.md
│   └── LOGGING_SMOKE_TEST_CHECKLIST.md
├── n8n/
│   ├── regulation_search_dispatcher.json
│   └── regulation_search_hybrid.json
├── scripts/
│   ├── parse_documents.py
│   ├── index_documents.py
│   └── build_logging_deploy_bundle.sh
├── site/
│   ├── app.js
│   ├── index.html
│   ├── index.php
│   ├── styles.css
│   ├── .htaccess
│   └── regulation-proxy/
│       ├── access.php
│       ├── auth.php
│       ├── collection.php
│       ├── feedback.php
│       ├── search.php
│       └── upload.php
├── src/regulation_search/
│   ├── __init__.py
│   ├── config.py
│   ├── docx_parser.py
│   ├── ingest_api.py
│   └── qdrant_indexer.py
├── .env.example
├── docker-compose.yml
└── pyproject.toml
```

## Архитектура

### Локальная разработка

- Python-слой парсит `docx`, режет документы на chunks и индексирует их в `Qdrant`;
- локально через корневой [docker-compose.yml](docker-compose.yml) поднимается только `Qdrant`;
- для индексации используются [scripts/parse_documents.py](scripts/parse_documents.py) и [scripts/index_documents.py](scripts/index_documents.py).

### Текущий production-контур

На Beget фактический рабочий поток выглядит так:

`Frontend -> PHP proxy -> n8n dispatcher -> search-api -> Qdrant/OpenAI`

`n8n` dispatcher является центральной точкой маршрутизации всех запросов:

- принимает webhook на `/webhook/regulation-search-dispatch`;
- нормализует входящие параметры;
- проверяет доступ по allowlist в Google Sheets;
- маршрутизирует по полю `action`: `authorize`, `search`, `upload`, `collection_status`, `collection_clear`, `feedback`;
- логирует каждое действие в Google Sheets (`auth_log`, `interaction_log`, `feedback_log`, `document_loading_log`).

Дополнительно рядом живут:

- `n8n-worker` для фоновых задач;
- `Traefik` для HTTPS и routing;
- `Postgres` и `Redis` для `n8n`;
- `ingest-api` как отдельный ingestion-контур;
- внешний `regulation-search-api`, который не хранится в этом репозитории целиком.

## Локальный запуск

### 1. Поднять `Qdrant`

```bash
docker compose up -d
```

После старта `Qdrant` будет доступен на [http://localhost:6333](http://localhost:6333).

### 2. Настроить окружение

```bash
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

Заполните переменные в [.env.example](.env.example), прежде всего `OPENAI_API_KEY`.

### 3. Подготовить chunks

```bash
PYTHONPATH=src python3 scripts/parse_documents.py
```

Результат попадет в `data/chunks/chunks.jsonl`.

### 4. Проиндексировать корпус

```bash
PYTHONPATH=src python3 scripts/index_documents.py --recreate
```

## Production на Beget

Production-образец вынесен в [deploy/beget/docker-compose.yml](deploy/beget/docker-compose.yml).

Сопутствующие файлы:

- [deploy/beget/.env.example](deploy/beget/.env.example)
- [deploy/beget/Dockerfile.ingest-api](deploy/beget/Dockerfile.ingest-api)
- [deploy/beget/healthcheck.js](deploy/beget/healthcheck.js)
- [deploy/beget/init-data.sh](deploy/beget/init-data.sh)
- [deploy/beget/README.md](deploy/beget/README.md)

Что важно понимать:

- `regulation-search-api` в production собирается из отдельного backend checkout, а не из этого репозитория;
- `deploy/beget/docker-compose.yml` нужен как честная документация и reproducible scaffold;
- текущий production URL фронтенда и его proxy могут жить отдельно от `n8n`.

## `ingest-api`

В репозитории добавлен минимальный ingestion API на FastAPI:

- [src/regulation_search/ingest_api.py](src/regulation_search/ingest_api.py)

Он предназначен для:

- healthcheck контейнера;
- загрузки `DOCX`;
- парсинга файла в chunks;
- индексации загруженного файла в `Qdrant`.

Основные endpoint:

- `GET /health`
- `POST /upload`
- `POST /ingest`

## `n8n` workflow

В репозитории лежат два основных workflow:

- [n8n/regulation_search_dispatcher.json](n8n/regulation_search_dispatcher.json) — центральный production dispatcher
- [n8n/regulation_search_hybrid.json](n8n/regulation_search_hybrid.json) — reference-реализация гибридного поиска

### Dispatcher

Dispatcher это главный production workflow. Все PHP proxy направляют запросы на единый webhook, а dispatcher маршрутизирует их по полю `action`:

| Action | Что делает |
| --- | --- |
| `authorize` | Проверяет email по allowlist в Google Sheets |
| `search` | Проксирует поиск в `search-api`, логирует результат |
| `upload` | Загружает DOCX в backend, логирует индексацию |
| `collection_status` | Возвращает состояние коллекции |
| `collection_clear` | Очищает коллекцию (только admin) |
| `feedback` | Сохраняет оценку полезности ответа |

Все действия логируются в Google Spreadsheet. Подробная схема: [docs/LOGGING_SCHEMA.md](docs/LOGGING_SCHEMA.md).

## Деплой

Для быстрого деплоя обновлений dispatcher и сайта используется bundle builder:

```bash
./scripts/build_logging_deploy_bundle.sh
```

Артефакты появятся в `deploy/bundles/`. Подробный runbook: [docs/LOGGING_DEPLOY_RUNBOOK.md](docs/LOGGING_DEPLOY_RUNBOOK.md).

## Frontend

Статический фронтенд в `site/` предоставляет:

- поиск по регламентам с выбором модели генерации (GPT-4o mini / GPT OSS 120B);
- загрузку документов (drag-and-drop DOCX);
- оценку полезности ответа (feedback);
- просмотр статуса коллекции и ее очистку;
- историю запросов;
- проверку доступа по allowlist.

PHP proxy в `site/regulation-proxy/` обеспечивают same-origin доступ к `n8n` dispatcher.

## Что сейчас считается правдой

- корневой compose не равен production compose;
- production на Beget шире, чем локальный dev-контур;
- `n8n` dispatcher является центральной точкой маршрутизации всех API-запросов;
- `search-api` остается внешней частью боевой архитектуры;
- все действия логируются в Google Sheets через dispatcher;
- feedback и ролевой доступ реализованы и работают.
