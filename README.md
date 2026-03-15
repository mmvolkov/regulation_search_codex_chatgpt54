# Regulation Search

Поиск по корпоративным регламентам в формате `docx` с опорой на:

- предметный парсинг сложных Word-документов;
- индексацию в `Qdrant`;
- production-фронтенд на Beget;
- `PHP` proxy для same-origin доступа;
- `n8n` как orchestration-слой и площадку для workflow.

Корпус регламентов и часть production backend живут вне Git и подключаются отдельно.

## Профили запуска

В репозитории теперь явно разделены два контура:

- `docker-compose.yml` в корне: локальный dev-контур, который поднимает только `Qdrant`;
- `deploy/beget/docker-compose.yml`: production-образец для Beget с `Traefik`, `n8n`, `Postgres`, `Redis`, `Qdrant`, `ingest-api` и внешним `regulation-search-api`.

Это важно: корневой compose не описывает боевой стек целиком.

## Документы проекта

- Краткое описание: [docs/PROJECT_ONE_PAGER.md](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/docs/PROJECT_ONE_PAGER.md)
- Подробное техническое описание: [docs/PROJECT_DESCRIPTION.md](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/docs/PROJECT_DESCRIPTION.md)
- Схема логирования dispatcher: [docs/LOGGING_SCHEMA.md](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/docs/LOGGING_SCHEMA.md)

## Структура

```text
.
├── deploy/
│   └── beget/
│       ├── .env.example
│       ├── docker-compose.yml
│       ├── Dockerfile.ingest-api
│       ├── healthcheck.js
│       ├── init-data.sh
│       └── README.md
├── docs/
├── n8n/
│   ├── regulation_search_dispatcher.json
│   └── regulation_search_hybrid.json
├── scripts/
├── site/
│   ├── app.js
│   ├── index.html
│   ├── styles.css
│   └── regulation-proxy/
├── src/regulation_search/
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
- локально через корневой [docker-compose.yml](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/docker-compose.yml) поднимается только `Qdrant`;
- для индексации используются [scripts/parse_documents.py](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/scripts/parse_documents.py) и [scripts/index_documents.py](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/scripts/index_documents.py).

### Текущий production-контур

На Beget фактический рабочий поток выглядит так:

`Frontend -> PHP proxy -> search-api -> Qdrant/OpenAI`

Дополнительно рядом живут:

- `n8n` и `n8n-worker` для automation / orchestration;
- `Traefik` для HTTPS и routing;
- `Postgres` и `Redis` для `n8n`;
- `ingest-api` как отдельный ingestion-контур;
- внешний `regulation-search-api`, который не хранится в этом репозитории целиком.

### Роль `n8n`

`n8n` в проекте не является единственным backend. Сейчас он используется как orchestration-слой и место для workflow, а production search/upload-контур может идти напрямую через `search-api` и `PHP` proxy.

## Локальный запуск

### 1. Поднять `Qdrant`

```bash
cd /Users/michaelvolkov/projects/regulation_search_codex_chatgpt54
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

Заполните переменные в [.env.example](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/.env.example), прежде всего `OPENAI_API_KEY`.

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

Production-образец вынесен в [deploy/beget/docker-compose.yml](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/deploy/beget/docker-compose.yml).

Сопутствующие файлы:

- [deploy/beget/.env.example](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/deploy/beget/.env.example)
- [deploy/beget/Dockerfile.ingest-api](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/deploy/beget/Dockerfile.ingest-api)
- [deploy/beget/healthcheck.js](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/deploy/beget/healthcheck.js)
- [deploy/beget/init-data.sh](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/deploy/beget/init-data.sh)
- [deploy/beget/README.md](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/deploy/beget/README.md)

Что важно понимать:

- `regulation-search-api` в production собирается из отдельного backend checkout, а не из этого репозитория;
- `deploy/beget/docker-compose.yml` нужен как честная документация и reproducible scaffold;
- текущий production URL фронтенда и его proxy могут жить отдельно от `n8n`.

## `ingest-api`

В репозитории добавлен минимальный ingestion API на FastAPI:

- [src/regulation_search/ingest_api.py](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/src/regulation_search/ingest_api.py)

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

- [n8n/regulation_search_hybrid.json](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/n8n/regulation_search_hybrid.json)
- [n8n/regulation_search_dispatcher.json](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/n8n/regulation_search_dispatcher.json)

Они полезны как:

- reference implementation;
- экспортируемые workflow для Beget;
- база для дальнейшей стабилизации dispatcher-контура.

## Что сейчас считается правдой

- корневой compose не равен production compose;
- production на Beget шире, чем локальный dev-контур;
- `search-api` остается внешней частью боевой архитектуры;
- `n8n` в проекте важен, но не обязан быть единственной точкой входа для production search.
