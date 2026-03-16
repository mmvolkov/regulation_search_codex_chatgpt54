from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Qdrant
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection: str = "regulations_v2"

    # OpenAI-compatible Embedding API (OpenRouter / OpenAI)
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    # Chunking
    min_chunk_chars: int = 100
    max_chunk_chars: int = 1500

    # Search
    search_top_k: int = 10
    final_top_k: int = 5
    rrf_k: int = 60  # RRF constant

    # LLM (OpenAI-compatible: OpenRouter, GigaChat, etc.)
    openai_chat_model: str = "openai/gpt-4o-mini"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
