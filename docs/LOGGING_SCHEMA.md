# Logging Schema

Ниже приведены рекомендуемые листы и точные шапки колонок для Google Spreadsheet `regulation_search_codex_chatgpt54_log`.

## Листы

- `auth_log`
- `interaction_log`
- `feedback_log`
- `document_loading_log`

## auth_log

```text
created_at_utc	request_id	action	email	display_name	role	auth_status	auth_message	can_upload	can_manage_collection	remote_ip	user_agent	execution_id
```

## interaction_log

```text
created_at_utc	request_id	email	role	query_text	top_k	preset	retrieval_mode	generation_mode	answer_text	found_documents	found_citations	top_chunks_json	hits_count	unique_docs_count	top1_score	zero_results	latency_ms	collection_name	index_version	status	error_message	feedback	feedback_at	execution_id
```

## feedback_log

```text
created_at_utc	request_id	email	role	query_text	answer_useful	feedback_reason	feedback_comment	selected_doc	selected_citation	answer_text	clicked_after_ms	execution_id
```

## document_loading_log

```text
created_at_utc	request_id	email	role	action	original_file_name	stored_doc_name	doc_id	file_size_bytes	mime_type	file_sha1	status	chunks_count	avg_chunk_chars	max_chunk_chars	paragraph_chunks	table_row_chunks	important_chunks	chunk_max_chars_setting	collection_name	processing_ms	message	execution_id
```

## Что уже заполняется автоматически после изменений

- `auth_log`: все проверки доступа через dispatcher, включая `authorize`, `search`, `upload`, `collection_status`, `collection_clear`, `feedback`
- `interaction_log`: поисковые запросы, ответы, найденные документы, чанки, количество результатов, latency
- `feedback_log`: отметка полезности ответа `yes/no` с привязкой к исходному `request_id`
- `document_loading_log`: загрузки документов и очистка коллекции

## Что пока зависит от backend

Некоторые поля будут заполняться только если upstream API вернет их в ответе:

- `retrieval_mode`
- `collection_name`
- `index_version`
- `avg_chunk_chars`
- `max_chunk_chars`
- `paragraph_chunks`
- `table_row_chunks`
- `important_chunks`

Если этих данных нет в ответе backend, колонки останутся пустыми, но схема уже готова и не потребует миграции позже.
