from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional during lightweight local inspection
    def load_dotenv() -> None:
        return None


load_dotenv()


@dataclass(slots=True)
class Settings:
    project_root: Path
    documents_dir: Path
    data_dir: Path
    chunks_path: Path
    qdrant_url: str
    qdrant_api_key: str | None
    qdrant_collection: str
    dense_vector_name: str
    sparse_vector_name: str
    openai_api_key: str | None
    openai_embedding_model: str
    openai_answer_model: str
    chunk_max_chars: int
    index_batch_size: int
    search_api_host: str
    search_api_port: int

    @classmethod
    def from_env(cls, project_root: str | Path | None = None) -> "Settings":
        root = Path(project_root or Path.cwd()).resolve()
        data_dir = root / "data"
        chunks_dir = data_dir / "chunks"
        chunks_dir.mkdir(parents=True, exist_ok=True)

        return cls(
            project_root=root,
            documents_dir=root / "documents",
            data_dir=data_dir,
            chunks_path=chunks_dir / "chunks.jsonl",
            qdrant_url=os.getenv("QDRANT_URL", "http://localhost:6333").rstrip("/"),
            qdrant_api_key=os.getenv("QDRANT_API_KEY") or None,
            qdrant_collection=os.getenv("QDRANT_COLLECTION", "regulations_hybrid"),
            dense_vector_name=os.getenv("QDRANT_DENSE_VECTOR_NAME", "dense"),
            sparse_vector_name=os.getenv("QDRANT_SPARSE_VECTOR_NAME", "bm25"),
            openai_api_key=os.getenv("OPENAI_API_KEY") or None,
            openai_embedding_model=os.getenv(
                "OPENAI_EMBEDDING_MODEL", "text-embedding-3-large"
            ),
            openai_answer_model=os.getenv("OPENAI_ANSWER_MODEL", "gpt-5.4"),
            chunk_max_chars=int(os.getenv("CHUNK_MAX_CHARS", "1200")),
            index_batch_size=int(os.getenv("INDEX_BATCH_SIZE", "16")),
            search_api_host=os.getenv("SEARCH_API_HOST", "0.0.0.0"),
            search_api_port=int(os.getenv("SEARCH_API_PORT", "8000")),
        )
