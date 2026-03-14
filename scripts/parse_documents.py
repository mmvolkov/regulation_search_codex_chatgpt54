from __future__ import annotations

from regulation_search.config import Settings
from regulation_search.docx_parser import RegulationDocxParser


def main() -> None:
    settings = Settings.from_env()
    parser = RegulationDocxParser(max_chars=settings.chunk_max_chars)
    chunks = parser.parse_directory(settings.documents_dir)
    count = parser.write_jsonl(chunks, settings.chunks_path)
    print(
        f"Parsed {count} chunks from {len({chunk.source_file for chunk in chunks})} documents "
        f"into {settings.chunks_path}"
    )


if __name__ == "__main__":
    main()

