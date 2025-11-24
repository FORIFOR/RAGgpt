import fitz  # type: ignore
from pathlib import Path
from typing import Optional

def extract_text_from_file(file_path: Path, max_pages: int = 5) -> str:
    """
    Extracts text from a file. Currently supports PDF.
    Limits to max_pages to avoid processing huge files for tagging.
    """
    try:
        if file_path.suffix.lower() == ".pdf":
            return _extract_pdf(file_path, max_pages)
        # Add other formats here (docx, txt, etc.)
        if file_path.suffix.lower() in [".txt", ".md", ".json"]:
            return file_path.read_text(encoding="utf-8", errors="ignore")[:10000]
        
        return ""
    except Exception as e:
        print(f"Error extracting text from {file_path}: {e}")
        return ""

def _extract_pdf(file_path: Path, max_pages: int) -> str:
    text = ""
    with fitz.open(file_path) as doc:
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            text += page.get_text() + "\n"
    return text
