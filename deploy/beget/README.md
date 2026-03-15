# Beget Deployment

Этот каталог хранит production-oriented scaffold для Beget.

## Что здесь лежит

- `docker-compose.yml` - фактическая схема production-стека на Beget
- `.env.example` - переменные окружения для compose
- `Dockerfile.ingest-api` - образ для локального ingestion API из этого репозитория
- `healthcheck.js` - healthcheck для контейнера `n8n`
- `init-data.sh` - инициализация дополнительной postgres базы/пользователя при необходимости

## Что не лежит в репозитории

- production `.env`
- реальные секреты
- production volumes
- внешний backend `regulation-search-api`, который на Beget собирается из отдельного checkout

## Как использовать

1. Скопировать `.env.example` в `.env`.
2. Указать реальные пути на Beget:
   - `PROJECT_ROOT`
   - `UPLOAD_DIR_ROOT`
   - `REGULATION_SEARCH_API_ROOT`
   - `REGULATION_SEARCH_API_ENV_FILE`
3. Заполнить секреты и домен.
4. Запускать compose из каталога `deploy/beget`.

## Важный нюанс

`ingest-api` в этом репозитории реален и может собираться из `PROJECT_ROOT`.
`regulation-search-api` по-прежнему считается внешним приложением и в этот репозиторий не включен.
