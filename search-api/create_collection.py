#!/usr/bin/env python3
"""
Create a hybrid Qdrant collection for regulation search.

This script creates a collection with:
  - Dense vectors (text-embedding-3-small, 1536 dimensions, cosine)
  - Sparse vectors (for BM25-like keyword search)

Usage:
    python create_collection.py

Reads QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION from environment or .env file.

Alternatively, use the REST API directly (see QDRANT_GUIDE.md).
"""

import os
import sys

# Allow running from backend/ or project root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    SparseIndexParams,
    SparseVectorParams,
    VectorParams,
)

from config import settings


def create_hybrid_collection(
    url: str | None = None,
    api_key: str | None = None,
    collection_name: str | None = None,
    embedding_dim: int | None = None,
    recreate: bool = False,
):
    """
    Create a hybrid (dense + sparse) collection in Qdrant.

    Args:
        url:             Qdrant URL (default from .env)
        api_key:         Qdrant API key (default from .env)
        collection_name: Collection name (default from .env)
        embedding_dim:   Dense vector dimension (default 1536 for text-embedding-3-small)
        recreate:        If True, delete existing collection first
    """
    _url = url or settings.qdrant_url
    _key = api_key or settings.qdrant_api_key
    _name = collection_name or settings.qdrant_collection
    _dim = embedding_dim or settings.embedding_dimensions

    print(f"Qdrant URL:    {_url}")
    print(f"Collection:    {_name}")
    print(f"Dense dim:     {_dim}")
    print()

    client = QdrantClient(url=_url, api_key=_key, timeout=30)

    existing = [c.name for c in client.get_collections().collections]
    print(f"Existing collections: {existing}")

    if _name in existing:
        if recreate:
            print(f"Deleting existing collection '{_name}'...")
            client.delete_collection(_name)
        else:
            print(f"Collection '{_name}' already exists. Use --recreate to overwrite.")
            # Print info
            info = client.get_collection(_name)
            print(f"  Points: {info.points_count}")
            print(f"  Status: {info.status}")
            return

    print(f"Creating hybrid collection '{_name}'...")

    client.create_collection(
        collection_name=_name,
        vectors_config={
            # Dense vector for semantic search
            # Used with OpenAI text-embedding-3-small (1536 dim)
            "dense": VectorParams(
                size=_dim,
                distance=Distance.COSINE,
            ),
        },
        sparse_vectors_config={
            # Sparse vector for keyword (BM25-like) search
            # Populated with TF-weighted token hashes
            "sparse": SparseVectorParams(
                index=SparseIndexParams(),
            ),
        },
    )

    print(f"Collection '{_name}' created successfully!")
    print()
    print("Vectors config:")
    print(f"  dense:  size={_dim}, distance=COSINE")
    print(f"  sparse: index=default (IDF-aware)")

    # Verify
    info = client.get_collection(_name)
    print(f"\nVerification: points={info.points_count}, status={info.status}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Create hybrid Qdrant collection")
    parser.add_argument("--recreate", action="store_true", help="Delete and recreate if exists")
    args = parser.parse_args()
    create_hybrid_collection(recreate=args.recreate)
