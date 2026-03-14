# Regulation Search

Поиск по корпоративным регламентам в формате `docx` с акцентом на:

- сложные таблицы;
- разнородные стили Word;
- гибридный поиск `dense + sparse`;
- публичный backend в `n8n`;
- хранение индекса в `Qdrant`.

Исходные документы лежат в [documents](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/documents).

## Архитектура

Репозиторий собран как практичный MVP:

- `docker-compose.yml` поднимает локальный `Qdrant`;
- Python-слой читает `docx`, нормализует абзацы и строки таблиц, режет их на поисковые chunks и загружает в `Qdrant`;
- `n8n` workflow принимает поисковый запрос, строит dense embedding через OpenAI и выполняет hybrid search в `Qdrant`;
- фронтенд на Beget может стучаться в публичный webhook `n8n`.

Почему так:

- backend остаётся в `n8n`, как вы и хотели;
- сложную подготовку `docx` и индексацию проще и надёжнее делать Python-скриптами;
- hybrid retrieval лучше работает по регламентам, где есть и точные формулировки, и свободные вопросы.

## Структура

```text
.
├── documents/                   # исходные регламенты
├── n8n/
│   └── regulation_search_hybrid.json
├── site/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── scripts/
│   ├── index_documents.py
│   └── parse_documents.py
├── src/regulation_search/
│   ├── config.py
│   ├── docx_parser.py
│   └── qdrant_indexer.py
├── .env.example
├── docker-compose.yml
└── pyproject.toml
```

## Как это работает

### 1. Парсинг `docx`

Парсер не пытается доверять только стилям Word. Он:

- читает OOXML напрямую;
- восстанавливает разделы по нумерации типа `1`, `1.2`, `4.3.1`;
- извлекает абзацы;
- превращает таблицы в отдельные поисковые блоки по строкам;
- сохраняет метаданные для цитирования: документ, раздел, тип блока, источник.

### 2. Индексация в `Qdrant`

Для каждого chunk создаются:

- dense embedding через OpenAI;
- sparse embedding через `Qdrant/bm25`.

В коллекции хранятся два именованных вектора:

- `dense`
- `bm25`

### 3. Поиск из `n8n`

Workflow в [n8n/regulation_search_hybrid.json](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/n8n/regulation_search_hybrid.json):

1. принимает `POST /webhook/regulations-search`;
2. валидирует запрос;
3. запрашивает dense embedding в OpenAI;
4. отправляет hybrid query в `Qdrant`;
5. возвращает найденные фрагменты и цитаты.

### 4. Статический фронтенд на Beget

Фронт лежит в [site](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/site) и не требует сборки:

- [site/index.html](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/site/index.html)
- [site/styles.css](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/site/styles.css)
- [site/app.js](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/site/app.js)

Он умеет:

- задавать webhook URL прямо в интерфейсе;
- сохранять URL в `localStorage`;
- отправлять поисковый запрос в `n8n`;
- показывать результаты с цитатами, score и метаданными.

## Локальный запуск

### 1. Поднять Qdrant

```bash
cd /Users/michaelvolkov/projects/regulation_search_codex_chatgpt54
docker compose up -d
```

После старта Qdrant будет доступен на [http://localhost:6333](http://localhost:6333).

### 2. Настроить окружение

```bash
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

Заполните `OPENAI_API_KEY` в [.env.example](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/.env.example) по образцу в локальном `.env`.

### 3. Посмотреть chunks

```bash
python scripts/parse_documents.py
```

Результат попадёт в `data/chunks/chunks.jsonl`.

### 4. Проиндексировать документы

```bash
python scripts/index_documents.py --recreate
```

## Контракт поиска

Пример запроса в `n8n`:

```json
{
  "query": "кто согласует командировку и какие документы нужны для отчета",
  "limit": 6
}
```

Пример ответа:

```json
{
  "query": "кто согласует командировку и какие документы нужны для отчета",
  "limit": 6,
  "mode": "search",
  "count": 6,
  "hits": [
    {
      "rank": 1,
      "score": 0.87,
      "doc_title": "13.11 Командировки",
      "citation": "13.11 Командировки / 4. Как отчитаться по командировке / table",
      "raw_text": "Пакет документов для отчета за командировку ...",
      "text": "Документ: ..."
    }
  ]
}
```

## Импорт в `n8n`

1. Откройте ваш `n8n` на Beget.
2. Импортируйте [n8n/regulation_search_hybrid.json](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/n8n/regulation_search_hybrid.json).
3. В переменных окружения `n8n` задайте:

```bash
OPENAI_API_KEY=...
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
QDRANT_URL=http://<host-or-container>:6333
QDRANT_COLLECTION=regulations_hybrid
QDRANT_DENSE_VECTOR_NAME=dense
QDRANT_SPARSE_VECTOR_NAME=bm25
QDRANT_API_KEY=
```

4. Активируйте workflow и используйте `Production URL`.

## Как деплоить у вас

Рекомендуемый маршрут:

- `n8n` живёт на Beget и отдаёт публичный webhook;
- `Qdrant` поднимается через `docker compose` там, где он доступен по сети из `n8n`;
- фронтенд на Beget вызывает webhook `n8n`, а не `Qdrant` напрямую.

### Фронтенд на `ayezodumbob.beget.app`

У вас уже создан отдельный сайт для `ayezodumbob.beget.app`, значит фронт можно выкладывать прямо в:

```text
ayezodumbob.beget.app/public_html
```

Минимальный деплой:

1. Скопировать содержимое [site](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/site) в `public_html`.
2. Открыть [site/app.js](/Users/michaelvolkov/projects/regulation_search_codex_chatgpt54/site/app.js) или поле `Webhook URL` в интерфейсе и указать production webhook `n8n`.
3. Проверить HTTPS и CORS между `ayezodumbob.beget.app` и `plequeneluera.beget.app`.

Если хотите не править код перед каждой проверкой, оставляйте URL пустым или меняйте его прямо через поле в интерфейсе: фронт сохранит его в браузере.

Если `Qdrant` стоит не внутри той же машины, где `n8n`, важно:

- открыть сетевой доступ к `6333` только для нужной среды;
- либо повесить reverse proxy перед `Qdrant`;
- либо использовать приватную сеть/VPN.

## Следующие шаги

Следующий логичный этап:

1. проверить локальную индексацию;
2. импортировать workflow в `n8n`;
3. добавить режим `answer`, который будет строить ответ по найденным фрагментам с цитатами;
4. сделать простой фронтенд поиска на Beget.
