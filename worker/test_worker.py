"""Phase 5 - Worker unit tests."""

import tempfile
from pathlib import Path
import sys

# Add worker to path
sys.path.insert(0, str(Path(__file__).parent))

from worker import validate_document, document_hash


def test_validate_document_empty_fails():
    with tempfile.NamedTemporaryFile(suffix=".md", delete=False) as f:
        f.write(b"")
        path = f.name
    try:
        assert validate_document(path) is False
    finally:
        Path(path).unlink()


def test_validate_document_with_content_passes():
    with tempfile.NamedTemporaryFile(suffix=".md", delete=False, mode="w") as f:
        f.write("# Hello\nContent here")
        path = f.name
    try:
        assert validate_document(path) is True
    finally:
        Path(path).unlink()


def test_document_hash():
    h = document_hash("hello world")
    assert len(h) == 64
    assert h == "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"


def test_validate_nonexistent_fails():
    assert validate_document("/nonexistent/path/doc.md") is False
