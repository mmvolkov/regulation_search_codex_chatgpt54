"""
FastAPI backend for Regulation Search v2.

Endpoints:
- POST /api/upload      - Upload and index a DOCX document (with chunking presets)
- POST /api/search      - Hybrid search with optional LLM answer
- GET  /api/presets     - List chunking presets
- GET  /api/documents   - List indexed documents
- GET  /api/collection  - Collection info
- DELETE /api/collection - Delete collection
"""

import logging
import os
import shutil
import tempfile
import time

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from chunker import chunk_document, fragments_to_search_text
from config import settings
from search_engine import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Regulation Search API",
    description="Поиск по регламентам с использованием RAG",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Track which documents have been indexed
indexed_docs: dict[str, dict] = {}

# --- Chunking Presets ---
CHUNKING_PRESETS = {
    "balanced": {
        "name": "Сбалансированный",
        "min_chunk_chars": 100,
        "max_chunk_chars": 1500,
        "description": (
            "Оптимальный баланс между точностью поиска и полнотой контекста. "
            "Фрагменты 100-1500 символов. Мелкие абзацы объединяются до 100 символов, "
            "крупные разбиваются на части до 1500 символов. "
            "Лучший выбор для большинства регламентов общего назначения."
        ),
    },
    "precise": {
        "name": "Точный факт",
        "min_chunk_chars": 50,
        "max_chunk_chars": 500,
        "description": (
            "Мелкие фрагменты 50-500 символов для максимально точного поиска. "
            "Каждый фрагмент содержит 1-3 предложения. "
            "Идеально для поиска конкретных фактов: определений, сроков, дат, "
            "пороговых значений, контактов. Больше фрагментов - выше точность, "
            "но может потеряться контекст длинных процедур."
        ),
    },
    "context": {
        "name": "Большой контекст",
        "min_chunk_chars": 200,
        "max_chunk_chars": 3000,
        "description": (
            "Крупные фрагменты 200-3000 символов для вопросов, требующих "
            "развёрнутого ответа. Сохраняет целые разделы и таблицы. "
            "Подходит для описания процессов, пошаговых инструкций, сравнений. "
            "Меньше фрагментов - LLM получает больше контекста за раз, "
            "но менее точное попадание при коротких вопросах."
        ),
    },
}


# --- Answer Controls ---

DEFAULT_TEMPERATURE = 0.1
DEFAULT_RESPONSE_LENGTH = "M"
ALLOWED_RESPONSE_LENGTHS = {"S", "M", "L"}
RESPONSE_LENGTH_MAX_TOKENS = {
    "S": 350,
    "M": 900,
    "L": 1600,
}


def normalize_response_length(value: str | None) -> str:
    candidate = (value or DEFAULT_RESPONSE_LENGTH).strip().upper()
    if candidate not in ALLOWED_RESPONSE_LENGTHS:
        return DEFAULT_RESPONSE_LENGTH
    return candidate


# --- Request / Response Models ---

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    doc_filter: str | None = None
    generate_answer: bool = True
    model: str | None = None
    temperature: float = DEFAULT_TEMPERATURE
    response_length: str = DEFAULT_RESPONSE_LENGTH


class SearchResult(BaseModel):
    id: str
    text: str
    doc_name: str
    heading: str
    fragment_type: str
    rrf_score: float | None = None
    semantic_rank: int | None = None
    keyword_rank: int | None = None


class SearchResponse(BaseModel):
    query: str
    answer: str | None = None
    fragments: list[SearchResult]
    total_fragments: int
    chat_model: str | None = None


class ChunkStats(BaseModel):
    total_fragments: int
    text_fragments: int
    table_fragments: int
    total_chars: int
    avg_fragment_chars: int
    min_fragment_chars: int
    max_fragment_chars: int
    headings_found: int
    vectors_indexed: int


class UploadResponse(BaseModel):
    doc_name: str
    preset: str
    preset_name: str
    stats: ChunkStats
    processing_time_sec: float
    message: str


class DocumentInfo(BaseModel):
    doc_name: str
    fragments_count: int
    preset: str


class PresetInfo(BaseModel):
    id: str
    name: str
    min_chunk_chars: int
    max_chunk_chars: int
    description: str


# --- LLM Integration ---

ALLOWED_CHAT_MODELS = {
    "openai/gpt-4o-mini",
    "openai/gpt-oss-120b",
}


def resolve_chat_model(model_override: str | None) -> str:
    candidate = (model_override or settings.openai_chat_model or "").strip()
    allowed = set(ALLOWED_CHAT_MODELS)
    if settings.openai_chat_model:
        allowed.add(settings.openai_chat_model)
    if candidate not in allowed:
        allowed_list = ", ".join(sorted(allowed))
        raise ValueError(f"Unsupported chat model: {candidate}. Allowed: {allowed_list}")
    return candidate


def _llm_headers() -> dict:
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    if "openrouter.ai" in settings.openai_base_url:
        headers["HTTP-Referer"] = "https://slcloud.cloudmaster.ru"
        headers["X-Title"] = "RegulationSearchV2"
    return headers


SYSTEM_PROMPT = """Ты — помощник для сотрудников компании. Твоя задача — отвечать на вопросы по регламентам и учебным материалам компании.

Правила:
1. Отвечай ТОЛЬКО на основе предоставленного контекста (фрагменты регламентов ниже).
2. Если в контексте нет информации для ответа, скажи: "К сожалению, в доступных регламентах не найдено информации по вашему вопросу."
3. Указывай название документа, из которого взята информация.
4. Отвечай на русском языке.
5. Будь точен и конкретен, не додумывай информацию.

Сохраняй точность, ясность и полезность ответа."""

RESPONSE_LENGTH_INSTRUCTIONS = {
    "S": "Отвечай максимально кратко и лаконично, только суть.",
    "M": "Отвечай коротко, ясно и по существу, с минимально необходимыми пояснениями.",
    "L": "Отвечай содержательно и строго по существу, раскрывая тему полно, но без воды и лишних деталей.",
}

RESPONSE_LENGTH_PROMPT = """Полнота ответа: {response_length}.

{instruction}

Сохраняй точность, ясность и полезность ответа."""

RELEVANCE_CHECK_PROMPT = """Определи, является ли следующий вопрос релевантным для поиска по регламентам и учебным материалам компании.
Вопрос должен быть на русском языке и относиться к рабочим процессам, правилам или процедурам.

Вопрос: {query}

Ответь ТОЛЬКО одним словом: "да" или "нет"."""


async def check_relevance(query: str, chat_model: str) -> bool:
    if not settings.openai_api_key:
        return True
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.openai_base_url}/chat/completions",
                headers=_llm_headers(),
                json={
                    "model": chat_model,
                    "messages": [
                        {"role": "user", "content": RELEVANCE_CHECK_PROMPT.format(query=query)}
                    ],
                    "max_tokens": 10,
                    "temperature": 0,
                },
            )
            response.raise_for_status()
            answer = response.json()["choices"][0]["message"]["content"].strip().lower()
            return "да" in answer
    except Exception as e:
        logger.warning("Relevance check failed: %s", e)
        return True


def build_answer_system_prompt(response_length: str) -> str:
    instruction = RESPONSE_LENGTH_INSTRUCTIONS.get(response_length, RESPONSE_LENGTH_INSTRUCTIONS["M"])
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"{RESPONSE_LENGTH_PROMPT.format(response_length=response_length, instruction=instruction)}"
    )


async def generate_answer(
    query: str,
    fragments: list[dict],
    chat_model: str,
    response_length: str,
    temperature: float = DEFAULT_TEMPERATURE,
) -> str | None:
    if not settings.openai_api_key:
        return None

    context_parts = []
    for i, frag in enumerate(fragments, 1):
        doc_name = frag.get("doc_name", "")
        heading = frag.get("heading", "")
        text = frag.get("original_text") or frag.get("text", "")
        header = f"Фрагмент {i}"
        if doc_name:
            header += f" (документ: {doc_name})"
        if heading:
            header += f" — {heading}"
        context_parts.append(f"### {header}\n{text}")

    context = "\n\n".join(context_parts)
    max_tokens = RESPONSE_LENGTH_MAX_TOKENS[response_length]

    user_message = f"""Контекст (фрагменты регламентов):

{context}

Вопрос пользователя: {query}

Дай точный и полный ответ на основе предоставленного контекста."""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.openai_base_url}/chat/completions",
                headers=_llm_headers(),
                json={
                    "model": chat_model,
                    "messages": [
                        {
                            "role": "system",
                            "content": build_answer_system_prompt(response_length),
                        },
                        {"role": "user", "content": user_message},
                    ],
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                },
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error("Answer generation failed: %s", e)
        return None


# --- Endpoints ---

@app.get("/api/presets", response_model=list[PresetInfo])
async def get_presets():
    """Return available chunking presets with descriptions."""
    return [PresetInfo(id=k, **v) for k, v in CHUNKING_PRESETS.items()]


@app.post("/api/upload", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    preset: str = Form("balanced"),
    min_chunk_chars: int | None = Form(None),
    max_chunk_chars: int | None = Form(None),
):
    """Upload a DOCX document and index its fragments.

    preset: balanced | precise | context
    Optionally override min_chunk_chars / max_chunk_chars.
    """
    if not file.filename or not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are supported")

    if preset not in CHUNKING_PRESETS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown preset: {preset}. Available: {list(CHUNKING_PRESETS)}",
        )

    p = CHUNKING_PRESETS[preset]
    min_c = min_chunk_chars if min_chunk_chars is not None else p["min_chunk_chars"]
    max_c = max_chunk_chars if max_chunk_chars is not None else p["max_chunk_chars"]
    original_name = os.path.basename(file.filename)
    doc_name = os.path.splitext(original_name)[0].strip() or "document"
    safe_doc_name = "".join(
        char if char.isalnum() or char in (" ", "-", "_", ".") else "_"
        for char in doc_name
    ).strip() or "document"
    temp_dir = tempfile.mkdtemp(prefix="regulation-upload-")
    tmp_path = os.path.join(temp_dir, f"{safe_doc_name}.docx")

    with open(tmp_path, "wb") as tmp:
        content = await file.read()
        tmp.write(content)

    try:
        t0 = time.time()

        fragments = chunk_document(tmp_path, min_chars=min_c, max_chars=max_c)
        if not fragments:
            raise HTTPException(status_code=400, detail="No fragments extracted from document")

        search_fragments = fragments_to_search_text(fragments)

        # Stats
        text_frags = [f for f in fragments if f.fragment_type == "text"]
        table_frags = [f for f in fragments if f.fragment_type == "table"]
        all_chars = [len(f.text) for f in fragments]
        unique_headings = {f.heading for f in fragments if f.heading}

        # Index in Qdrant
        count = engine.index_fragments(search_fragments)
        elapsed = time.time() - t0

        indexed_docs[doc_name] = {
            "doc_name": doc_name,
            "fragments_count": count,
            "preset": preset,
        }

        stats = ChunkStats(
            total_fragments=len(fragments),
            text_fragments=len(text_frags),
            table_fragments=len(table_frags),
            total_chars=sum(all_chars),
            avg_fragment_chars=sum(all_chars) // len(all_chars) if all_chars else 0,
            min_fragment_chars=min(all_chars) if all_chars else 0,
            max_fragment_chars=max(all_chars) if all_chars else 0,
            headings_found=len(unique_headings),
            vectors_indexed=count,
        )

        return UploadResponse(
            doc_name=doc_name,
            preset=preset,
            preset_name=p["name"],
            stats=stats,
            processing_time_sec=round(elapsed, 2),
            message=(
                f"Документ '{doc_name}' загружен ({p['name']}). "
                f"{count} фрагментов, {count} векторов."
            ),
        )
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.post("/api/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    """Search regulations with hybrid search + optional LLM answer."""
    query = request.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    response_length = normalize_response_length(request.response_length)
    temperature = DEFAULT_TEMPERATURE

    try:
        chat_model = resolve_chat_model(request.model)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    is_relevant = await check_relevance(query, chat_model)
    if not is_relevant:
        return SearchResponse(
            query=query,
            answer=(
                "Ваш вопрос не относится к регламентам компании. "
                "Пожалуйста, задайте вопрос, связанный с рабочими процессами."
            ),
            fragments=[],
            total_fragments=0,
            chat_model=chat_model,
        )

    results = engine.search_hybrid(
        query=query,
        final_top_k=request.top_k,
        doc_filter=request.doc_filter,
    )

    if not results:
        return SearchResponse(
            query=query,
            answer="К сожалению, по вашему запросу ничего не найдено.",
            fragments=[],
            total_fragments=0,
            chat_model=chat_model,
        )

    answer = None
    if request.generate_answer:
        answer = await generate_answer(
            query,
            results,
            chat_model,
            response_length=response_length,
            temperature=temperature,
        )

    fragments = [
        SearchResult(
            id=r["id"],
            text=r.get("original_text") or r["text"],
            doc_name=r["doc_name"],
            heading=r.get("heading", ""),
            fragment_type=r.get("fragment_type", ""),
            rrf_score=r.get("rrf_score"),
            semantic_rank=r.get("semantic_rank"),
            keyword_rank=r.get("keyword_rank"),
        )
        for r in results
    ]

    return SearchResponse(
        query=query,
        answer=answer,
        fragments=fragments,
        total_fragments=len(fragments),
        chat_model=chat_model,
    )


@app.get("/api/documents", response_model=list[DocumentInfo])
async def list_documents():
    """List all indexed documents."""
    return [DocumentInfo(**info) for info in indexed_docs.values()]


@app.get("/api/collection")
async def collection_info():
    """Get Qdrant collection info."""
    return engine.collection_info()


@app.delete("/api/collection")
async def delete_collection():
    """Clear the collection and recreate it empty."""
    engine.delete_collection()
    indexed_docs.clear()
    engine.ensure_collection()
    return {
        "message": "Collection cleared successfully",
        "collection": engine.collection_info(),
    }


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "version": "2.0.0"}
