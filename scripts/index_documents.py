from __future__ import annotations

import argparse

from regulation_search.config import Settings
from regulation_search.qdrant_indexer import RegulationIndexer


def main() -> None:
    parser = argparse.ArgumentParser(description="Index DOCX regulations into Qdrant.")
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="Drop and recreate the Qdrant collection before indexing.",
    )
    args = parser.parse_args()

    settings = Settings.from_env()
    indexer = RegulationIndexer(settings)
    stats = indexer.index_documents(recreate_collection=args.recreate)
    print(
        f"Indexed {stats.chunks} chunks from {stats.documents} documents into "
        f"{stats.collection}"
    )


if __name__ == "__main__":
    main()

