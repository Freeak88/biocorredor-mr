from pathlib import Path
from html import escape
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    ListFlowable,
    ListItem,
    KeepTogether,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/auditoria/PEDIDO_ACCESO_INFORMACION_TERRITORIAL.md"
OUTPUT = ROOT / "public/documentos/solicitud-informacion-territorial-municipio-2026-09.pdf"

TITLE = "Solicitud de acceso a documentación administrativa"
SUBJECT = "Solicitud de información territorial - Ministro Rivadavia"
PUBLIC_URL = "https://biocorredor-mr.embudo.com.ar/auditoria-territorial.html"


def extract_section_a(md: str) -> str:
    start_marker = "## A. Pedido al Departamento Ejecutivo / Municipio de Almirante Brown"
    end_marker = "\n---\n\n## B."
    if start_marker not in md:
        raise RuntimeError("No se encontró la sección municipal A")
    section = md.split(start_marker, 1)[1]
    if end_marker in section:
        section = section.split(end_marker, 1)[0]
    return section.strip()


def inline_format(text: str) -> str:
    text = escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r"<font name='Courier'>\1</font>", text)
    return text


def parse_blocks(section: str):
    blocks = []
    para = []
    bullets = []

    def flush_para():
        nonlocal para
        if para:
            blocks.append(("p", " ".join(x.strip() for x in para)))
            para = []

    def flush_bullets():
        nonlocal bullets
        if bullets:
            blocks.append(("ul", bullets))
            bullets = []

    for raw in section.splitlines():
        line = raw.strip()

        if not line:
            flush_para()
            flush_bullets()
            continue

        if line.startswith("### "):
            flush_para()
            flush_bullets()
            blocks.append(("h3", line[4:].strip()))
            continue

        if line.startswith("**Asunto:**"):
            flush_para()
            flush_bullets()
            blocks.append(("subject", line))
            continue

        if line.startswith("- "):
            flush_para()
            bullets.append(line[2:].strip())
            continue

        flush_bullets()
        para.append(line)

    flush_para()
    flush_bullets()
    return blocks


styles = getSampleStyleSheet()

body = ParagraphStyle(
    "Body",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=8.8,
    leading=11.8,
    textColor=colors.HexColor("#20262d"),
    spaceAfter=4,
    alignment=TA_LEFT,
)

small = ParagraphStyle(
    "Small",
    parent=body,
    fontSize=7.5,
    leading=10,
    textColor=colors.HexColor("#59636e"),
)

heading = ParagraphStyle(
    "Heading",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=11,
    leading=13,
    textColor=colors.HexColor("#14222e"),
    spaceBefore=6,
    spaceAfter=4,
)

subject_style = ParagraphStyle(
    "Subject",
    parent=body,
    fontName="Helvetica-Bold",
    fontSize=9.3,
    leading=13,
    spaceAfter=8,
)

title_style = ParagraphStyle(
    "Title",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=16,
    leading=19,
    textColor=colors.HexColor("#14222e"),
    spaceAfter=6,
)

kicker_style = ParagraphStyle(
    "Kicker",
    parent=body,
    fontName="Helvetica-Bold",
    fontSize=8,
    leading=10,
    textColor=colors.HexColor("#65727d"),
    spaceAfter=7,
)


def header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4

    canvas.setFillColor(colors.HexColor("#14222e"))
    canvas.setFont("Helvetica-Bold", 8.2)
    canvas.drawString(18 * mm, h - 14 * mm, "BIOCORREDOR MR")

    canvas.setFillColor(colors.HexColor("#66717c"))
    canvas.setFont("Helvetica", 7.5)
    canvas.drawRightString(
        w - 18 * mm,
        h - 14 * mm,
        "Auditoría territorial - Ministro Rivadavia",
    )

    canvas.setStrokeColor(colors.HexColor("#d7dce1"))
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, h - 17 * mm, w - 18 * mm, h - 17 * mm)

    canvas.line(18 * mm, 15 * mm, w - 18 * mm, 15 * mm)

    canvas.setFillColor(colors.HexColor("#66717c"))
    canvas.setFont("Helvetica", 7.3)
    canvas.drawString(
        18 * mm,
        10 * mm,
        "Solicitud de acceso a documentación administrativa",
    )
    canvas.drawRightString(
        w - 18 * mm,
        10 * mm,
        f"Página {doc.page}",
    )

    canvas.restoreState()


def build_pdf():
    md = SOURCE.read_text(encoding="utf-8")
    section = extract_section_a(md)
    blocks = parse_blocks(section)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=21 * mm,
        bottomMargin=19 * mm,
        title=f"{TITLE} - BioCorredor MR",
        subject=SUBJECT,
        author="BioCorredor MR",
    )

    story = [
        Spacer(1, 4 * mm),
        Paragraph("DOCUMENTO PARA PRESENTACIÓN", kicker_style),
        Paragraph(TITLE, title_style),
        Spacer(1, 1 * mm),
    ]

    for kind, value in blocks:
        if kind == "h3":
            story.append(KeepTogether([
                Spacer(1, 2 * mm),
                Paragraph(inline_format(value), heading),
            ]))
        elif kind == "subject":
            story.append(Paragraph(inline_format(value), subject_style))
        elif kind == "p":
            story.append(Paragraph(inline_format(value), body))
        elif kind == "ul":
            items = [
                ListItem(
                    Paragraph(inline_format(item), body),
                    leftIndent=10,
                )
                for item in value
            ]
            story.append(
                ListFlowable(
                    items,
                    bulletType="bullet",
                    start="circle",
                    leftIndent=15,
                    bulletFontName="Helvetica",
                    bulletFontSize=6,
                    spaceAfter=5,
                )
            )

    story.extend([
        Spacer(1, 5 * mm),
        Paragraph("<b>BioCorredor MR</b>", body),
        Paragraph("Auditoría territorial de Ministro Rivadavia", body),
        Spacer(1, 2 * mm),
        Paragraph(
            "Portal público de auditoría: "
            f"<link href='{PUBLIC_URL}' color='#365f78'>{PUBLIC_URL}</link>",
            small,
        ),
        Paragraph(
            "Los valores cuantitativos incluidos en este pedido corresponden a un screening "
            "técnico provisional y no sustituyen el cálculo ni la documentación oficial municipal.",
            small,
        ),
    ])

    doc.build(
        story,
        onFirstPage=header_footer,
        onLaterPages=header_footer,
    )

    print(f"PDF_GENERATED {OUTPUT}")


if __name__ == "__main__":
    build_pdf()
