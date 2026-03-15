from __future__ import annotations

import hashlib
import os
from collections import Counter
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from .config import Settings
from .docx_parser import RegulationDocxParser
from .qdrant_indexer import RegulationIndexer


app = FastAPI(title="Regulation Ingest API", version="0.1.0")


def _project_root() -> Path:
    return Path(os.getenv("PROJECT_ROOT") or Path.cwd()).resolve()


def _upload_root() -> Path:
    root = Path(os.getenv("UPLOAD_DIR_ROOT", "/tmp/rag_regulation_uploads")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _persist_upload(upload: UploadFile, content: bytes) -> Path:
    safe_name = Path(upload.filename or "document.docx").name
    digest = hashlib.sha1(content).hexdigest()[:12]
    target_dir = _upload_root() / digest
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / safe_name
    target.write_bytes(content)
    return target


def _build_upload_response(path: Path, parser: RegulationDocxParser, chunks: list, collection: str) -> dict:
    chunk_types = Counter(chunk.block_type for chunk in chunks)
    raw_lengths = [len(chunk.raw_text) for chunk in chunks]
    return {
        "ok": True,
        "doc_name": path.stem,
        "doc_id": chunks[0].doc_id,
        "collection_name": collection,
        "stats": {
            "documents": len({chunk.source_file for chunk in chunks}),
            "total_fragments": len(chunks),
            "vectors_indexed": len(chunks),
            "paragraph_chunks": chunk_types.get("paragraph", 0),
            "table_row_chunks": chunk_types.get("table_row", 0),
            "important_chunks": chunk_types.get("important", 0),
            "avg_chunk_chars": round(sum(raw_lengths) / len(raw_lengths), 2) if raw_lengths else 0,
            "max_chunk_chars": max(raw_lengths) if raw_lengths else 0,
            "chunk_max_chars_setting": parser.max_chars,
            "collection": collection,
        },
    }


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "ingest-api"}


@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    preset: str = Form("balanced"),
    min_chunk_chars: str | None = Form(None),
    max_chunk_chars: str | None = Form(None),
) -> dict:
    del preset
    del min_chunk_chars

    if not (file.filename or "").lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are supported.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    uploaded_path = _persist_upload(file, content)
    settings = Settings.from_env(_project_root())
    parser = RegulationDocxParser(
        max_chars=int(max_chunk_chars) if max_chunk_chars else settings.chunk_max_chars
    )
    chunks = parser.parse_document(uploaded_path)
    if not chunks:
        raise HTTPException(status_code=400, detail="No chunks were produced from the document.")

    try:
        indexer = RegulationIndexer(settings)
        stats = indexer.index_chunks(chunks)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:  # pragma: no cover - defensive API boundary
        raise HTTPException(status_code=500, detail=str(error)) from error

    return _build_upload_response(uploaded_path, parser, chunks, stats.collection)


@app.post("/ingest")
async def ingest_document(
    file: UploadFile = File(...),
    preset: str = Form("balanced"),
    min_chunk_chars: str | None = Form(None),
    max_chunk_chars: str | None = Form(None),
) -> dict:
    return await upload_document(
        file=file,
        preset=preset,
        min_chunk_chars=min_chunk_chars,
        max_chunk_chars=max_chunk_chars,
    )
