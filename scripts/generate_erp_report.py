import os
import textwrap
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "ERP_Full_Report.pdf"

EXCLUDE_NAMES = {
    ".git",
    ".wrangler",
    "__pycache__",
    "node_modules",
    "erp.db",
    ".env",
    ".dev.vars",
    "passwords.txt",
}

TEXT_EXTENSIONS = {
    ".md",
    ".py",
    ".js",
    ".css",
    ".html",
    ".json",
    ".sql",
    ".toml",
    ".yml",
    ".yaml",
    ".txt",
    ".ps1",
    ".csv",
    ".svg",
}

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}


def is_excluded(path: Path) -> bool:
    for part in path.parts:
        if part in EXCLUDE_NAMES:
            return True
    if path.name in EXCLUDE_NAMES:
        return True
    return False


def walk_files(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_file() and not is_excluded(path):
            yield path


def build_tree(root: Path) -> str:
    lines = []
    for path in sorted(root.rglob("*")):
        if is_excluded(path):
            continue
        rel = path.relative_to(root)
        depth = len(rel.parts) - 1
        prefix = "  " * depth + ("- " if depth >= 0 else "")
        lines.append(f"{prefix}{rel.as_posix()}")
    return "\n".join(lines)


def wrap_text_block(text: str, width: int = 110) -> str:
    wrapped_lines = []
    for line in text.splitlines():
        if len(line) <= width:
            wrapped_lines.append(line)
        else:
            wrapped_lines.extend(textwrap.wrap(line, width=width, replace_whitespace=False))
    return "\n".join(wrapped_lines)


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return f"[Could not read file: {path}]"


def collect_assets(root: Path):
    text_files = []
    image_files = []
    pdf_files = []
    other_files = []
    for path in walk_files(root):
        ext = path.suffix.lower()
        if ext in TEXT_EXTENSIONS:
            text_files.append(path)
        elif ext in IMAGE_EXTENSIONS:
            image_files.append(path)
        elif ext == ".pdf":
            pdf_files.append(path)
        else:
            other_files.append(path)
    return text_files, image_files, pdf_files, other_files


def page_header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.grey)
    canvas.drawString(inch * 0.75, 0.5 * inch, "Aviation ERP – Full System Report")
    canvas.drawRightString(A4[0] - inch * 0.75, 0.5 * inch, f"Page {doc.page}")
    canvas.restoreState()


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="TitleLarge",
            parent=styles["Title"],
            fontSize=28,
            leading=32,
            spaceAfter=18,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Heading1Custom",
            parent=styles["Heading1"],
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Heading2Custom",
            parent=styles["Heading2"],
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CodeBlock",
            parent=styles["Code"],
            fontName="Courier",
            fontSize=7.5,
            leading=9,
        )
    )

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.9 * inch,
        bottomMargin=0.9 * inch,
        title="Aviation ERP – Full System Report",
        author="Codex Report Generator",
    )

    story = []

    title = "Aviation ERP – Full System Report"
    story.append(Paragraph(title, styles["TitleLarge"]))
    story.append(Paragraph("Comprehensive system documentation and source appendix", styles["Heading2Custom"]))
    story.append(Spacer(1, 12))
    story.append(
        Paragraph(
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            styles["Normal"],
        )
    )
    story.append(Paragraph(f"Workspace: {ROOT}", styles["Normal"]))
    story.append(PageBreak())

    story.append(Paragraph("Executive Summary", styles["Heading1Custom"]))
    story.append(
        Paragraph(
            "This report aggregates project documentation, architecture notes, assets, and the full "
            "source code for the Aviation ERP system into a single long-form PDF. It includes screenshots, "
            "database schemas, migrations, backend services, frontend application code, serverless functions, "
            "and supporting scripts.",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 12))

    story.append(Paragraph("Project Overview", styles["Heading1Custom"]))
    readme = read_text(ROOT / "README.md")
    story.append(Preformatted(wrap_text_block(readme), styles["CodeBlock"]))
    story.append(PageBreak())

    story.append(Paragraph("Architecture Notes", styles["Heading1Custom"]))
    arch = read_text(ROOT / "architecture_mapping.md")
    story.append(Preformatted(wrap_text_block(arch), styles["CodeBlock"]))
    story.append(PageBreak())

    story.append(Paragraph("Repository File Tree", styles["Heading1Custom"]))
    tree = build_tree(ROOT)
    story.append(Preformatted(wrap_text_block(tree), styles["CodeBlock"]))
    story.append(PageBreak())

    text_files, image_files, pdf_files, other_files = collect_assets(ROOT)

    story.append(Paragraph("Media Assets", styles["Heading1Custom"]))
    story.append(Paragraph("Screenshots and visuals included below.", styles["BodyText"]))
    story.append(Spacer(1, 12))
    for img_path in image_files:
        try:
            story.append(Paragraph(img_path.relative_to(ROOT).as_posix(), styles["Heading2Custom"]))
            img = Image(str(img_path))
            img.drawHeight = 4.8 * inch
            img.drawWidth = 6.8 * inch
            story.append(img)
            story.append(Spacer(1, 12))
        except Exception:
            story.append(Paragraph(f"[Could not embed image: {img_path}]", styles["BodyText"]))
            story.append(Spacer(1, 12))
    story.append(PageBreak())

    story.append(Paragraph("PDF Assets (Referenced)", styles["Heading1Custom"]))
    for pdf_path in pdf_files:
        size_kb = pdf_path.stat().st_size / 1024
        story.append(Paragraph(f"{pdf_path.relative_to(ROOT).as_posix()} – {size_kb:.1f} KB", styles["BodyText"]))
    story.append(PageBreak())

    story.append(Paragraph("Source Code Appendix (No Code)", styles["Heading1Custom"]))
    story.append(
        Paragraph(
            "This appendix lists all text-based source files without including their contents, "
            "per the requested no-code policy. Sensitive or generated artifacts remain excluded.",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 12))

    for path in text_files:
        if path.name in {"README.md", "architecture_mapping.md"}:
            continue
        rel = path.relative_to(ROOT).as_posix()
        size_kb = path.stat().st_size / 1024
        story.append(Paragraph(f"{rel} – {size_kb:.1f} KB", styles["Heading2Custom"]))
        story.append(
            Paragraph(
                "Contents intentionally omitted (no code included in this report).",
                styles["BodyText"],
            )
        )
        story.append(Spacer(1, 6))

    story.append(Paragraph("Excluded Sensitive/Generated Files", styles["Heading1Custom"]))
    story.append(
        Paragraph(
            "For safety, the following files or directories were excluded from the report:",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 6))
    excluded_list = ", ".join(sorted(EXCLUDE_NAMES))
    story.append(Paragraph(excluded_list, styles["BodyText"]))
    story.append(Spacer(1, 12))

    doc.build(story, onFirstPage=page_header_footer, onLaterPages=page_header_footer)


if __name__ == "__main__":
    main()
