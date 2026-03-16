from __future__ import annotations

import os
import uuid
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .config import Settings
from .qdrant_indexer import RegulationIndexer, SearchHit

app = FastAPI(title="Regulation Search API", version="0.1.0")

RESPONSE_LENGTH_INSTRUCTIONS = {
    "S": "Ответь кратко, в 2-3 предложениях.",
    "M": "Ответь в стандартном объёме, 4-8 предложений.",
    "L": "Дай развернутый ответ с подробностями и примерами.",
}

SYSTEM_PROMPT = (
    "Ты — корпоративный помощник. Отвечай строго на основе предоставленных фрагментов "
    "корпоративных регламентов. Если в фрагментах нет информации для ответа, честно скажи об этом. "
    "Указывай источник (название документа и раздел). Отвечай на русском языке."
)


def _project_root() -> Path:
    return Path(os.getenv("PROJECT_ROOT") or Path.cwd()).resolve()


def _get_indexer() -> RegulationIndexer:
    settings = Settings.from_env(_project_root())
    return RegulationIndexer(settings)


class SearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=6, ge=1, le=12)
    generate_answer: bool = True
    preset: str = "balanced"
    model: str | None = None
    temperature: float = Field(default=0.1, ge=0.0, le=2.0)
    response_length: str = Field(default="M", pattern="^[SML]$")


class SearchResponse(BaseModel):
    query: str
    answer: str
    answer_found: bool
    response_type: str
    request_id: str
    total_fragments: int
    fragments: list[dict]


def _build_context(hits: list[SearchHit]) -> str:
    parts: list[str] = []
    for hit in hits:
        header = f"[Фрагмент {hit.rank}] {hit.citation}"
        body = hit.raw_text or hit.text or ""
        parts.append(f"{header}\n{body}")
    return "\n\n---\n\n".join(parts)


def _generate_answer(
    indexer: RegulationIndexer,
    query: str,
    hits: list[SearchHit],
    model: str | None,
    temperature: float,
    response_length: str,
) -> tuple[str, bool]:
    if not hits:
        return "В доступных регламентах не найдено информации по данному вопросу.", False

    context = _build_context(hits)
    length_instruction = RESPONSE_LENGTH_INSTRUCTIONS.get(response_length, "")
    answer_model = model or indexer.settings.openai_answer_model

    # Normalize model name: strip provider prefix if present (e.g. "openai/gpt-4o-mini" -> "gpt-4o-mini")
    if "/" in answer_model:
        answer_model = answer_model.split("/", 1)[1]

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Вопрос: {query}\n\n"
                f"Фрагменты регламентов:\n\n{context}\n\n"
                f"{length_instruction}\n"
                "Сформулируй ответ на основе этих фрагментов."
            ),
        },
    ]

    response = indexer.openai.chat.completions.create(
        model=answer_model,
        messages=messages,
        temperature=temperature,
    )

    answer_text = (response.choices[0].message.content or "").strip()
    if not answer_text:
        return "Не удалось сгенерировать ответ.", False

    no_answer_markers = [
        "к сожалению",
        "не найден",
        "не удалось найти",
        "не содержат информации",
        "нет информации",
        "в доступных регламентах не найдено",
    ]
    answer_found = not any(marker in answer_text.lower() for marker in no_answer_markers)
    return answer_text, answer_found


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "regulation-search-api"}


@app.post("/search", response_model=SearchResponse)
def search(req: SearchRequest) -> SearchResponse:
    query = req.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Missing query")

    request_id = uuid.uuid4().hex[:16]

    try:
        indexer = _get_indexer()
        hits = indexer.search(query, top_k=req.top_k)
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Search failed: {error}") from error

    if req.generate_answer:
        try:
            answer, answer_found = _generate_answer(
                indexer=indexer,
                query=query,
                hits=hits,
                model=req.model,
                temperature=req.temperature,
                response_length=req.response_length,
            )
        except Exception as error:
            raise HTTPException(
                status_code=502, detail=f"Answer generation failed: {error}"
            ) from error
    else:
        answer = ""
        answer_found = len(hits) > 0

    response_type = "answer_found" if answer_found else "no_answer"
    if not hits:
        response_type = "zero_results"

    fragments = [asdict(hit) for hit in hits]

    return SearchResponse(
        query=query,
        answer=answer,
        answer_found=answer_found,
        response_type=response_type,
        request_id=request_id,
        total_fragments=len(fragments),
        fragments=fragments,
    )
