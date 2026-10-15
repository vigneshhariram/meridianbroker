"""Extract the supplied six-page use case without changing the original PDF.

Run: uv --native-tls run --no-project --with pypdf python scripts/extract_use_case.py
"""

from pathlib import Path

from pypdf import PdfReader


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    source = (
        root
        / "docs/TCS_Meridian_Strengthen_Client_Retention_Producer_Effectiveness_Usecase.pdf"
    )
    reader = PdfReader(source)
    pages = [
        f"## Page {index + 1}\n\n{page.extract_text() or ''}"
        for index, page in enumerate(reader.pages)
    ]
    target = root / "docs/use-case-extracted.md"
    target.write_text("# Source use case\n\n" + "\n\n".join(pages), encoding="utf-8")
    print(f"Extracted {len(pages)} pages to {target}")


if __name__ == "__main__":
    main()
