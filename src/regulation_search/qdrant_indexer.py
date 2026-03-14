from __future__ import annotations

from dataclasses import dataclass
from itertools import islice
from pathlib import Path
from typing import Iterable, Iterator, Sequence

from fastembed import SparseTextEmbedding
from openai import OpenAI
from qdrant_client import QdrantClient, models

from .config import Settings
from .docx_parser import ChunkRecord, RegulationDocxParser


def batched(items: Sequence[ChunkRecord], size: int) -> Iterator[Sequence[ChunkRecord]]:
    iterator = iter(items)
    while batch := list(islice(iterator, size)):
        yield batch


def _to_list(values: Iterable[float | int]) -> list[float | int]:
    if hasattr(values, "tolist"):
        return values.tolist()
    return list(values)


@dataclass(slots=True)
class IndexStats:
    documents: int
    chunks: int
    collection: str


class RegulationIndexer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.parser = RegulationDocxParser(max_chars=settings.chunk_max_chars)
        self.qdrant = QdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key,
        )
        self.openai = OpenAI(api_key=settings.openai_api_key)
        self.sparse_model = SparseTextEmbedding(model_name="Qdrant/bm25")

    def parse(self, documents_dir: Path | None = None) -> list[ChunkRecord]:
        target_dir = documents_dir or self.settings.documents_dir
        chunks = self.parser.parse_directory(target_dir)
        self.parser.write_jsonl(chunks, self.settings.chunks_path)
        return chunks

    def index_documents(
        self,
        *,
        recreate_collection: bool = False,
        documents_dir: Path | None = None,
    ) -> IndexStats:
        if not self.settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required for indexing dense embeddings.")

        chunks = self.parse(documents_dir)
        if not chunks:
            raise ValueError("No chunks produced from documents directory.")

        dense_vectors = self._dense_embeddings([chunk.text for chunk in chunks[:1]])
        dense_size = len(dense_vectors[0])
        self._ensure_collection(dense_size=dense_size, recreate=recreate_collection)

        for batch in batched(chunks, self.settings.index_batch_size):
            self._upsert_batch(batch)

        document_count = len({chunk.source_file for chunk in chunks})
        return IndexStats(
            documents=document_count,
            chunks=len(chunks),
            collection=self.settings.qdrant_collection,
        )

    def _dense_embeddings(self, texts: list[str]) -> list[list[float]]:
        response = self.openai.embeddings.create(
            model=self.settings.openai_embedding_model,
            input=texts,
        )
        return [item.embedding for item in response.data]

    def _ensure_collection(self, *, dense_size: int, recreate: bool) -> None:
        collection = self.settings.qdrant_collection
        exists = self.qdrant.collection_exists(collection)

        if recreate and exists:
            self.qdrant.delete_collection(collection)
            exists = False

        if not exists:
            self.qdrant.create_collection(
                collection_name=collection,
                vectors_config={
                    self.settings.dense_vector_name: models.VectorParams(
                        size=dense_size,
                        distance=models.Distance.COSINE,
                    )
                },
                sparse_vectors_config={
                    self.settings.sparse_vector_name: models.SparseVectorParams()
                },
            )

            for field_name in ("doc_id", "doc_title", "block_type", "source_file"):
                self.qdrant.create_payload_index(
                    collection_name=collection,
                    field_name=field_name,
                    field_schema=models.PayloadSchemaType.KEYWORD,
                )

    def _upsert_batch(self, batch: Sequence[ChunkRecord]) -> None:
        texts = [chunk.text for chunk in batch]
        dense_vectors = self._dense_embeddings(texts)
        sparse_vectors = list(self.sparse_model.embed(texts))
        points: list[models.PointStruct] = []

        for chunk, dense_vector, sparse_vector in zip(
            batch, dense_vectors, sparse_vectors, strict=True
        ):
            points.append(
                models.PointStruct(
                    id=chunk.id,
                    vector={
                        self.settings.dense_vector_name: dense_vector,
                        self.settings.sparse_vector_name: models.SparseVector(
                            indices=[int(v) for v in _to_list(sparse_vector.indices)],
                            values=[float(v) for v in _to_list(sparse_vector.values)],
                        ),
                    },
                    payload=chunk.payload(),
                )
            )

        self.qdrant.upsert(
            collection_name=self.settings.qdrant_collection,
            points=points,
            wait=True,
        )

