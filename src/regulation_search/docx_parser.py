from __future__ import annotations

import hashlib
import json
import re
import unicodedata
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET


NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
HEADING_RE = re.compile(r"^(?P<num>\d+(?:\.\d+){0,7})(?:[.)])?\s+(?P<title>\S.*)")
IMPORTANT_RE = re.compile(r"^(важно|примечание)\b", re.IGNORECASE)


def w_tag(tag: str) -> str:
    return f"{{{NS['w']}}}{tag}"


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = value.replace("\xa0", " ")
    value = value.replace("\u200b", "")
    value = value.replace("\u200c", "")
    value = value.replace("\u200d", "")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def split_text(text: str, max_chars: int) -> list[str]:
    text = normalize_text(text)
    if len(text) <= max_chars:
        return [text]

    sentences = re.split(r"(?<=[.!?;])\s+", text)
    segments: list[str] = []
    current = ""

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        candidate = sentence if not current else f"{current} {sentence}"
        if len(candidate) <= max_chars:
            current = candidate
            continue

        if current:
            segments.append(current)
        current = sentence

    if current:
        segments.append(current)

    return segments or [text[:max_chars]]


def text_hash(*parts: str) -> str:
    digest = hashlib.sha1("||".join(parts).encode("utf-8")).hexdigest()
    return digest[:24]


@dataclass(slots=True)
class ChunkRecord:
    id: str
    doc_id: str
    doc_title: str
    source_file: str
    section_path: list[str]
    block_type: str
    block_index: int
    chunk_index: int
    text: str
    raw_text: str
    citation: str
    table_index: int | None = None
    row_index: int | None = None

    def payload(self) -> dict:
        payload = asdict(self)
        payload["section_path_text"] = " > ".join(self.section_path)
        return payload


class RegulationDocxParser:
    def __init__(self, max_chars: int = 1200) -> None:
        self.max_chars = max_chars

    def parse_directory(self, documents_dir: Path) -> list[ChunkRecord]:
        chunks: list[ChunkRecord] = []
        for path in sorted(documents_dir.glob("*.docx")):
            chunks.extend(self.parse_document(path))
        return chunks

    def parse_document(self, path: Path) -> list[ChunkRecord]:
        root = self._load_document_root(path)
        body = root.find("w:body", NS)
        if body is None:
            return []

        chunks: list[ChunkRecord] = []
        doc_title = path.stem
        doc_id = text_hash(path.name)
        section_path: list[str] = []
        block_index = 0
        table_index = 0
        last_context = ""

        for child in body:
            if child.tag == w_tag("p"):
                text = self._paragraph_text(child)
                if not text:
                    continue

                style_id = self._paragraph_style_id(child)
                heading_level = self._detect_heading_level(text, style_id)
                if heading_level:
                    heading = self._clean_heading_text(text)
                    section_path = section_path[: heading_level - 1] + [heading]
                    last_context = heading
                    continue

                block_type = "important" if IMPORTANT_RE.match(text) else "paragraph"
                chunks.extend(
                    self._build_text_chunks(
                        doc_id=doc_id,
                        doc_title=doc_title,
                        source_file=path.name,
                        section_path=section_path,
                        block_type=block_type,
                        block_index=block_index,
                        raw_text=text,
                    )
                )
                block_index += 1
                last_context = text
                continue

            if child.tag == w_tag("tbl"):
                table_index += 1
                table_chunks = self._table_chunks(
                    table_element=child,
                    doc_id=doc_id,
                    doc_title=doc_title,
                    source_file=path.name,
                    section_path=section_path,
                    table_index=table_index,
                    block_index=block_index,
                    table_context=last_context,
                )
                chunks.extend(table_chunks)
                block_index += max(1, len(table_chunks))

        return chunks

    def write_jsonl(self, chunks: Iterable[ChunkRecord], output_path: Path) -> int:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        count = 0
        with output_path.open("w", encoding="utf-8") as handle:
            for chunk in chunks:
                handle.write(json.dumps(chunk.payload(), ensure_ascii=False) + "\n")
                count += 1
        return count

    def _load_document_root(self, path: Path) -> ET.Element:
        with zipfile.ZipFile(path) as archive:
            xml_bytes = archive.read("word/document.xml")
        return ET.fromstring(xml_bytes)

    def _paragraph_text(self, paragraph: ET.Element) -> str:
        parts: list[str] = []

        for node in paragraph.iter():
            if node.tag == w_tag("t"):
                parts.append(node.text or "")
            elif node.tag == w_tag("tab"):
                parts.append("\t")
            elif node.tag == w_tag("br"):
                parts.append("\n")

        return normalize_text("".join(parts))

    def _paragraph_style_id(self, paragraph: ET.Element) -> str | None:
        style = paragraph.find("./w:pPr/w:pStyle", NS)
        if style is None:
            return None
        return style.attrib.get(w_tag("val"))

    def _detect_heading_level(self, text: str, style_id: str | None) -> int | None:
        if style_id:
            style_lower = style_id.lower()
            match = re.search(r"heading\s*([1-6])", style_lower)
            if match:
                return int(match.group(1))
            match = re.search(r"заголовок\s*([1-6])", style_lower)
            if match:
                return int(match.group(1))

        match = HEADING_RE.match(text)
        if match:
            return match.group("num").count(".") + 1

        return None

    def _clean_heading_text(self, text: str) -> str:
        match = HEADING_RE.match(text)
        if not match:
            return text
        return normalize_text(f"{match.group('num')} {match.group('title')}")

    def _build_text_chunks(
        self,
        *,
        doc_id: str,
        doc_title: str,
        source_file: str,
        section_path: list[str],
        block_type: str,
        block_index: int,
        raw_text: str,
    ) -> list[ChunkRecord]:
        chunks: list[ChunkRecord] = []
        citation = self._make_citation(doc_title, section_path, block_type)

        for chunk_index, segment in enumerate(split_text(raw_text, self.max_chars)):
            wrapped = self._wrap_text(
                doc_title=doc_title,
                section_path=section_path,
                block_type=block_type,
                body_text=segment,
            )
            chunk_id = text_hash(doc_id, str(block_index), str(chunk_index), segment)
            chunks.append(
                ChunkRecord(
                    id=chunk_id,
                    doc_id=doc_id,
                    doc_title=doc_title,
                    source_file=source_file,
                    section_path=list(section_path),
                    block_type=block_type,
                    block_index=block_index,
                    chunk_index=chunk_index,
                    text=wrapped,
                    raw_text=segment,
                    citation=citation,
                )
            )

        return chunks

    def _table_chunks(
        self,
        *,
        table_element: ET.Element,
        doc_id: str,
        doc_title: str,
        source_file: str,
        section_path: list[str],
        table_index: int,
        block_index: int,
        table_context: str,
    ) -> list[ChunkRecord]:
        rows, vmerge_flags = self._extract_table_rows(table_element)
        if not rows:
            return []

        rows = self._apply_vertical_merges(rows, vmerge_flags)
        max_cols = max(len(row) for row in rows)

        header_count = 0
        if max_cols > 1 and len(rows) > 1:
            header_count = 1
            if len(rows) > 2 and self._looks_like_header(rows[1]):
                header_count = 2

        headers = self._merge_headers(rows[:header_count], max_cols)
        table_title = ""
        if table_context and len(table_context) <= 180:
            table_title = table_context

        citation = self._make_citation(doc_title, section_path, "table")
        chunks: list[ChunkRecord] = []

        for row_position, row in enumerate(rows[header_count:]):
            if not any(cell.strip() for cell in row):
                continue

            if max_cols == 1:
                row_text = normalize_text(row[0])
            else:
                pairs: list[str] = []
                for col_index, cell in enumerate(row):
                    cell = normalize_text(cell)
                    if not cell:
                        continue
                    header = headers[col_index] if col_index < len(headers) else ""
                    label = header or f"Колонка {col_index + 1}"
                    pairs.append(f"{label}: {cell}")
                row_text = "; ".join(pairs)

            if not row_text:
                continue

            table_body = row_text
            if table_title:
                table_body = f"Контекст таблицы: {table_title}\n{row_text}"

            chunk_id = text_hash(doc_id, "table", str(table_index), str(row_position), row_text)
            chunks.append(
                ChunkRecord(
                    id=chunk_id,
                    doc_id=doc_id,
                    doc_title=doc_title,
                    source_file=source_file,
                    section_path=list(section_path),
                    block_type="table_row",
                    block_index=block_index,
                    chunk_index=row_position,
                    text=self._wrap_text(
                        doc_title=doc_title,
                        section_path=section_path,
                        block_type="table_row",
                        body_text=table_body,
                    ),
                    raw_text=row_text,
                    citation=citation,
                    table_index=table_index,
                    row_index=row_position,
                )
            )

        return chunks

    def _extract_table_rows(self, table_element: ET.Element) -> tuple[list[list[str]], list[list[bool]]]:
        rows: list[list[str]] = []
        vmerge_flags: list[list[bool]] = []
        max_cols = 0

        for row in table_element.findall("./w:tr", NS):
            row_values: list[str] = []
            row_merges: list[bool] = []

            for cell in row.findall("./w:tc", NS):
                cell_text_parts: list[str] = []
                for paragraph in cell.findall("./w:p", NS):
                    text = self._paragraph_text(paragraph)
                    if text:
                        cell_text_parts.append(text)

                cell_text = normalize_text("\n".join(cell_text_parts))
                span_element = cell.find("./w:tcPr/w:gridSpan", NS)
                span = int(span_element.attrib.get(w_tag("val"), "1")) if span_element is not None else 1
                vmerge = cell.find("./w:tcPr/w:vMerge", NS) is not None

                row_values.extend([cell_text] + [""] * (span - 1))
                row_merges.extend([vmerge] * span)

            max_cols = max(max_cols, len(row_values))
            rows.append(row_values)
            vmerge_flags.append(row_merges)

        for row_values, row_merges in zip(rows, vmerge_flags, strict=True):
            if len(row_values) < max_cols:
                padding = max_cols - len(row_values)
                row_values.extend([""] * padding)
                row_merges.extend([False] * padding)

        return rows, vmerge_flags

    def _apply_vertical_merges(
        self, rows: list[list[str]], vmerge_flags: list[list[bool]]
    ) -> list[list[str]]:
        normalized = [list(row) for row in rows]

        for row_index in range(1, len(normalized)):
            for col_index in range(len(normalized[row_index])):
                if vmerge_flags[row_index][col_index] and not normalized[row_index][col_index]:
                    normalized[row_index][col_index] = normalized[row_index - 1][col_index]

        return normalized

    def _looks_like_header(self, row: list[str]) -> bool:
        non_empty = [cell for cell in row if cell.strip()]
        if not non_empty:
            return False
        short_cells = sum(len(cell) <= 48 for cell in non_empty)
        return short_cells / len(non_empty) >= 0.7

    def _merge_headers(self, header_rows: list[list[str]], max_cols: int) -> list[str]:
        if not header_rows:
            return ["" for _ in range(max_cols)]

        merged: list[str] = []
        for col_index in range(max_cols):
            values = []
            for row in header_rows:
                value = normalize_text(row[col_index])
                if value and value not in values:
                    values.append(value)
            merged.append(" > ".join(values))
        return merged

    def _wrap_text(
        self,
        *,
        doc_title: str,
        section_path: list[str],
        block_type: str,
        body_text: str,
    ) -> str:
        lines = [f"Документ: {doc_title}"]
        if section_path:
            lines.append(f"Раздел: {' > '.join(section_path)}")
        lines.append(f"Тип блока: {block_type}")
        lines.append(f"Содержание: {body_text}")
        return "\n".join(lines)

    def _make_citation(self, doc_title: str, section_path: list[str], block_type: str) -> str:
        parts = [doc_title]
        if section_path:
            parts.append(" > ".join(section_path))
        parts.append(block_type)
        return " / ".join(parts)

