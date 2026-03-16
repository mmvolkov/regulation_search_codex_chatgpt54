"""
Hybrid search engine using Qdrant + OpenAI embeddings.

Implements:
- Vector (semantic) search via OpenAI text-embedding-3-small
- Keyword (BM25-like) search via Qdrant sparse vectors
- RRF (Reciprocal Rank Fusion) to combine results
"""

import hashlib
import logging
import math
from collections import Counter

import httpx
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    NamedSparseVector,
    PointStruct,
    SparseIndexParams,
    SparseVector,
    SparseVectorParams,
    VectorParams,
)

from config import settings
from lemmatizer import remove_stop_words, tokenize

logger = logging.getLogger(__name__)


class SearchEngine:
    def __init__(self):
        self._client: QdrantClient | None = None

    @property
    def client(self) -> QdrantClient:
        if self._client is None:
            if settings.qdrant_api_key:
                self._client = QdrantClient(
                    url=settings.qdrant_url,
                    api_key=settings.qdrant_api_key,
                    timeout=60,
                )
            else:
                self._client = QdrantClient(url=settings.qdrant_url, timeout=60)
        return self._client

    def _get_embeddings(self, texts: list[str]) -> list[list[float]]:
        """Get embeddings via OpenAI-compatible API."""
        headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        }
        # OpenRouter needs extra headers
        if "openrouter.ai" in settings.openai_base_url:
            headers["HTTP-Referer"] = "https://slcloud.cloudmaster.ru"
            headers["X-Title"] = "RegulationSearchV2"

        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                f"{settings.openai_base_url}/embeddings",
                headers=headers,
                json={
                    "model": settings.openai_embedding_model,
                    "input": texts,
                },
            )
            response.raise_for_status()
            data = response.json()

        # Sort by index to maintain order
        embeddings = sorted(data["data"], key=lambda x: x["index"])
        return [e["embedding"] for e in embeddings]

    def _get_embedding(self, text: str) -> list[float]:
        """Get a single embedding."""
        return self._get_embeddings([text])[0]

    def _text_to_sparse(self, text: str) -> SparseVector:
        """
        Convert text to sparse vector using TF-based approach.
        Each unique token gets a hash-based index and TF weight.
        """
        tokens = tokenize(text)
        tokens = remove_stop_words(tokens)

        if not tokens:
            return SparseVector(indices=[0], values=[0.0])

        tf = Counter(tokens)
        indices = []
        values = []

        for token, count in tf.items():
            idx = int(hashlib.md5(token.encode()).hexdigest()[:8], 16) % (2**31)
            weight = 1 + math.log(count) if count > 0 else 0
            indices.append(idx)
            values.append(weight)

        return SparseVector(indices=indices, values=values)

    def _point_id(self, doc_id: str) -> int:
        """Generate stable numeric point ID from string doc_id."""
        return int(hashlib.md5(doc_id.encode()).hexdigest()[:15], 16)

    def ensure_collection(self):
        """Create collection if it doesn't exist."""
        collections = [c.name for c in self.client.get_collections().collections]
        if settings.qdrant_collection not in collections:
            self.client.create_collection(
                collection_name=settings.qdrant_collection,
                vectors_config={
                    "dense": VectorParams(
                        size=settings.embedding_dimensions,
                        distance=Distance.COSINE,
                    )
                },
                sparse_vectors_config={
                    "sparse": SparseVectorParams(
                        index=SparseIndexParams()
                    )
                },
            )
            logger.info("Created collection: %s", settings.qdrant_collection)
        else:
            logger.info("Collection already exists: %s", settings.qdrant_collection)

    def index_fragments(self, fragments: list[dict]) -> int:
        """
        Index fragments into Qdrant.

        Args:
            fragments: List of dicts with 'id', 'text', 'metadata'

        Returns:
            Number of indexed fragments
        """
        self.ensure_collection()

        batch_size = 50  # OpenAI API supports larger batches
        total = 0

        for i in range(0, len(fragments), batch_size):
            batch = fragments[i:i + batch_size]
            texts = [f['text'] for f in batch]

            # Get dense embeddings from OpenAI API
            embeddings = self._get_embeddings(texts)

            points = []
            for j, frag in enumerate(batch):
                point_id = self._point_id(frag['id'])
                sparse_vec = self._text_to_sparse(frag['text'])

                points.append(PointStruct(
                    id=point_id,
                    vector={
                        "dense": embeddings[j],
                        "sparse": sparse_vec,
                    },
                    payload={
                        "text": frag['text'],
                        "doc_id": frag['id'],
                        **frag['metadata'],
                    },
                ))

            self.client.upsert(
                collection_name=settings.qdrant_collection,
                points=points,
            )

            total += len(batch)
            logger.info("Indexed %d/%d fragments", total, len(fragments))

        return total

    def search_semantic(self, query: str, top_k: int = 10, doc_filter: str | None = None) -> list[dict]:
        """Perform semantic (dense vector) search."""
        query_vec = self._get_embedding(query)

        search_filter = None
        if doc_filter:
            search_filter = Filter(
                must=[FieldCondition(key="doc_name", match=MatchValue(value=doc_filter))]
            )

        results = self.client.search(
            collection_name=settings.qdrant_collection,
            query_vector=("dense", query_vec),
            query_filter=search_filter,
            limit=top_k,
        )

        return [
            {
                "id": str(r.id),
                "score": r.score,
                "text": r.payload.get("text", ""),
                "doc_name": r.payload.get("doc_name", ""),
                "heading": r.payload.get("heading", ""),
                "fragment_type": r.payload.get("fragment_type", ""),
                "original_text": r.payload.get("original_text", ""),
            }
            for r in results
        ]

    def search_keyword(self, query: str, top_k: int = 10, doc_filter: str | None = None) -> list[dict]:
        """Perform keyword (sparse vector) search."""
        sparse_vec = self._text_to_sparse(query)

        search_filter = None
        if doc_filter:
            search_filter = Filter(
                must=[FieldCondition(key="doc_name", match=MatchValue(value=doc_filter))]
            )

        results = self.client.search(
            collection_name=settings.qdrant_collection,
            query_vector=NamedSparseVector(name="sparse", vector=sparse_vec),
            query_filter=search_filter,
            limit=top_k,
        )

        return [
            {
                "id": str(r.id),
                "score": r.score,
                "text": r.payload.get("text", ""),
                "doc_name": r.payload.get("doc_name", ""),
                "heading": r.payload.get("heading", ""),
                "fragment_type": r.payload.get("fragment_type", ""),
                "original_text": r.payload.get("original_text", ""),
            }
            for r in results
        ]

    def search_hybrid(
        self,
        query: str,
        semantic_top_k: int | None = None,
        keyword_top_k: int | None = None,
        final_top_k: int | None = None,
        doc_filter: str | None = None,
    ) -> list[dict]:
        """
        Perform hybrid search combining semantic and keyword results via RRF.
        """
        s_top_k = semantic_top_k or settings.search_top_k
        k_top_k = keyword_top_k or settings.search_top_k
        f_top_k = final_top_k or settings.final_top_k

        semantic_results = self.search_semantic(query, s_top_k, doc_filter)
        keyword_results = self.search_keyword(query, k_top_k, doc_filter)

        return self._rrf_fusion(semantic_results, keyword_results, f_top_k)

    def _rrf_fusion(
        self,
        semantic_results: list[dict],
        keyword_results: list[dict],
        top_k: int,
    ) -> list[dict]:
        """
        Reciprocal Rank Fusion to combine two result lists.

        RRF score = sum(1 / (k + rank)) for each list.
        """
        k = settings.rrf_k
        scores: dict[str, float] = {}
        docs: dict[str, dict] = {}

        for rank, result in enumerate(semantic_results, 1):
            doc_id = result["id"]
            scores[doc_id] = scores.get(doc_id, 0) + 1.0 / (k + rank)
            docs[doc_id] = result
            docs[doc_id]["semantic_rank"] = rank

        for rank, result in enumerate(keyword_results, 1):
            doc_id = result["id"]
            scores[doc_id] = scores.get(doc_id, 0) + 1.0 / (k + rank)
            if doc_id not in docs:
                docs[doc_id] = result
            docs[doc_id]["keyword_rank"] = rank

        sorted_ids = sorted(scores, key=lambda x: scores[x], reverse=True)

        results = []
        for doc_id in sorted_ids[:top_k]:
            doc = docs[doc_id]
            doc["rrf_score"] = scores[doc_id]
            results.append(doc)

        return results

    def delete_collection(self):
        """Delete the collection."""
        self.client.delete_collection(settings.qdrant_collection)
        logger.info("Deleted collection: %s", settings.qdrant_collection)

    def collection_info(self) -> dict:
        """Get information about the collection."""
        try:
            info = self.client.get_collection(settings.qdrant_collection)
            return {
                "name": settings.qdrant_collection,
                "points_count": info.points_count,
                "vectors_count": info.vectors_count,
                "status": info.status.value,
            }
        except Exception as e:
            return {"error": str(e)}


# Singleton instance
engine = SearchEngine()
