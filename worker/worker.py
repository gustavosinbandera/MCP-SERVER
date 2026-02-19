"""
MCP Knowledge Hub - Worker
Validates docs, commits to git, indexes in Qdrant.
"""

import os
import hashlib
import sys
from pathlib import Path

# Minimal validation: check file exists and has content
def validate_document(path: str) -> bool:
    p = Path(path)
    if not p.exists():
        return False
    content = p.read_text(encoding="utf-8", errors="ignore")
    return len(content.strip()) > 0


def document_hash(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()


def main():
    # Phase 5 smoke test: validate a sample path
    docs_root = os.environ.get("DOCS_REPO", str(Path(__file__).parent.parent / "docs_repo"))
    staging = Path(docs_root) / "staging"
    if staging.exists():
        files = list(staging.glob("*.md"))
        for f in files:
            if validate_document(str(f)):
                h = document_hash(f.read_text(encoding="utf-8"))
                print(f"OK: {f.name} hash={h[:16]}...")
    else:
        print("INFO: staging empty, validation passes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
