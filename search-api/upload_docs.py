#!/usr/bin/env python3
"""
Batch upload DOCX documents from a directory to the search engine.

Usage:
    python upload_docs.py /path/to/docx/folder [--api-url http://localhost:8000]
"""

import argparse
import os
import sys

import httpx


def upload_file(api_url: str, file_path: str) -> dict:
    """Upload a single file to the API."""
    filename = os.path.basename(file_path)
    with open(file_path, "rb") as f:
        response = httpx.post(
            f"{api_url}/api/upload",
            files={"file": (filename, f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            timeout=300.0,
        )
    response.raise_for_status()
    return response.json()


def main():
    parser = argparse.ArgumentParser(description="Batch upload DOCX documents")
    parser.add_argument("directory", help="Directory containing .docx files")
    parser.add_argument("--api-url", default="http://localhost:8000", help="Backend API URL")
    args = parser.parse_args()

    if not os.path.isdir(args.directory):
        print(f"Error: {args.directory} is not a directory")
        sys.exit(1)

    docx_files = []
    for root, dirs, files in os.walk(args.directory):
        for f in sorted(files):
            if f.endswith(".docx") and not f.startswith("~$"):
                docx_files.append(os.path.join(root, f))

    if not docx_files:
        print(f"No .docx files found in {args.directory}")
        sys.exit(1)

    print(f"Found {len(docx_files)} documents to upload")
    print(f"API URL: {args.api_url}")
    print()

    total_fragments = 0
    for file_path in docx_files:
        filename = os.path.basename(file_path)
        print(f"Uploading: {filename}...", end=" ", flush=True)
        try:
            result = upload_file(args.api_url, file_path)
            count = result.get("fragments_count", 0)
            total_fragments += count
            print(f"OK ({count} fragments)")
        except Exception as e:
            print(f"ERROR: {e}")

    print(f"\nDone! Total fragments indexed: {total_fragments}")


if __name__ == "__main__":
    main()
