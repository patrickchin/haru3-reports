"""Generate Harpa Pro YC-style 10-slide pitch deck (v2).

Run:
    /tmp/pptx-venv/bin/python docs/investor/build_deck.py

Output:
    docs/investor/Harpa-Pro-Deck-v2.pptx

Design: minimal, no stock images, no mascot. Harpa palette sampled from
the original deck (teal #4FB3A9, red #E63946, orange #F4A261, navy
#1D3557, off-white #F8F9FA).
"""

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt

# ---------------------------------------------------------------- palette
TEAL = RGBColor(0x4F, 0xB3, 0xA9)
RED = RGBColor(0xE6, 0x39, 0x46)
ORANGE = RGBColor(0xF4, 0xA2, 0x61)
NAVY = RGBColor(0x1D, 0x35, 0x57)
INK = RGBColor(0x21, 0x25, 0x29)
MUTED = RGBColor(0x6C, 0x75, 0x7D)
BG = RGBColor(0xFF, 0xFF, 0xFF)
SOFT = RGBColor(0xF1, 0xF3, 0xF5)

# ---------------------------------------------------------------- layout
SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)


def new_deck() -> Presentation:
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    return prs


def blank(prs: Presentation):
    return prs.slides.add_slide(prs.slide_layouts[6])


def add_text(
    slide,
    left,
    top,
    width,
    height,
    text: str,
    *,
    size: int = 18,
    bold: bool = False,
    color: RGBColor = INK,
    align=PP_ALIGN.LEFT,
    anchor=MSO_ANCHOR.TOP,
    font: str = "Helvetica Neue",
):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(0)
    tf.margin_top = tf.margin_bottom = Inches(0)
    lines = text.split("\n")
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        run = p.add_run()
        run.text = line
        run.font.name = font
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
    return box


def add_bullets(
    slide,
    left,
    top,
    width,
    height,
    items: list[str],
    *,
    size: int = 18,
    color: RGBColor = INK,
    bullet: str = "—",
    line_spacing: float = 1.35,
):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(0)
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        p.line_spacing = line_spacing
        run = p.add_run()
        run.text = f"{bullet}  {item}"
        run.font.name = "Helvetica Neue"
        run.font.size = Pt(size)
        run.font.color.rgb = color


def add_rect(slide, left, top, width, height, fill: RGBColor, line: RGBColor | None = None):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    s.fill.solid()
    s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
    s.shadow.inherit = False
    return s


def slide_number_footer(slide, n: int, total: int):
    add_text(
        slide,
        Inches(12.4),
        Inches(7.05),
        Inches(0.8),
        Inches(0.3),
        f"{n} / {total}",
        size=10,
        color=MUTED,
        align=PP_ALIGN.RIGHT,
    )


def title_bar(slide, label: str):
    add_rect(slide, Inches(0.6), Inches(0.55), Inches(0.18), Inches(0.45), TEAL)
    add_text(
        slide,
        Inches(0.95),
        Inches(0.5),
        Inches(11),
        Inches(0.55),
        label,
        size=28,
        bold=True,
        color=INK,
    )


# ---------------------------------------------------------------- slides
def slide_1_cover(prs):
    s = blank(prs)
    add_rect(s, Inches(0), Inches(0), SLIDE_W, SLIDE_H, BG)
    # left accent stripe
    add_rect(s, Inches(0), Inches(0), Inches(0.35), SLIDE_H, RED)
    # brand
    add_text(s, Inches(1.0), Inches(2.2), Inches(11), Inches(1.2), "HARPA PRO", size=72, bold=True, color=INK)
    add_text(
        s,
        Inches(1.0),
        Inches(3.4),
        Inches(11),
        Inches(0.8),
        "Voice notes → AI-structured site reports for construction supervisors.",
        size=24,
        color=NAVY,
    )
    # divider
    add_rect(s, Inches(1.0), Inches(4.5), Inches(2.5), Inches(0.04), TEAL)
    # founders / contact
    add_text(
        s,
        Inches(1.0),
        Inches(4.8),
        Inches(11),
        Inches(0.4),
        "Haruna Bayoh & Patrick Chin",
        size=18,
        bold=True,
        color=INK,
    )
    add_text(
        s,
        Inches(1.0),
        Inches(5.25),
        Inches(11),
        Inches(0.4),
        "haruna@harpapro.com  ·  +86 156 6257 5731  ·  [MONTH YEAR]",
        size=14,
        color=MUTED,
    )


def slide_2_what_we_do(prs, total):
    s = blank(prs)
    title_bar(s, "What we do")
    add_text(
        s,
        Inches(0.95),
        Inches(1.4),
        Inches(11.5),
        Inches(1.2),
        "A site supervisor speaks into their phone. Harpa Pro transcribes,\n"
        "structures, and turns the voice note into a daily site report —\n"
        "weather, headcount, materials, flagged issues — in under a minute.",
        size=20,
        color=INK,
    )
    # workflow chips
    steps = [
        "Site\nsupervisor",
        "Voice\nnote",
        "Transcribe",
        "Structured\ndata",
        "Attach\nmedia",
        "Generate\nreport",
        "Export /\nshare",
    ]
    chip_w = Inches(1.45)
    chip_h = Inches(1.3)
    gap = Inches(0.18)
    total_w = chip_w * len(steps) + gap * (len(steps) - 1)
    start_x = (SLIDE_W - total_w) / 2
    y = Inches(4.4)
    for i, label in enumerate(steps):
        x = start_x + (chip_w + gap) * i
        fill = TEAL if i in (0, 6) else SOFT
        text_color = BG if i in (0, 6) else INK
        add_rect(s, x, y, chip_w, chip_h, fill)
        add_text(
            s,
            x,
            y,
            chip_w,
            chip_h,
            label,
            size=14,
            bold=True,
            color=text_color,
            align=PP_ALIGN.CENTER,
            anchor=MSO_ANCHOR.MIDDLE,
        )
        if i < len(steps) - 1:
            arrow_x = x + chip_w + Inches(0.01)
            add_text(
                s, arrow_x, y, gap, chip_h, "›", size=20, color=MUTED,
                align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE,
            )
    slide_number_footer(s, 2, total)


def slide_3_why(prs, total):
    s = blank(prs)
    title_bar(s, "Why it matters")
    # big stat
    add_text(
        s,
        Inches(0.95),
        Inches(1.6),
        Inches(11),
        Inches(1.6),
        "3–8 hours / week / manager",
        size=56,
        bold=True,
        color=RED,
    )
    add_text(
        s,
        Inches(0.95),
        Inches(3.1),
        Inches(11),
        Inches(0.5),
        "lost to manual site-report writing.",
        size=22,
        color=INK,
    )
    add_text(
        s,
        Inches(0.95),
        Inches(3.6),
        Inches(11),
        Inches(0.4),
        "Source: Harpa Pro internal data + [INSERT EXTERNAL CITATION — e.g., McKinsey \"Reinventing Construction\" 2017].",
        size=12,
        color=MUTED,
    )
    add_bullets(
        s,
        Inches(0.95),
        Inches(4.5),
        Inches(11.5),
        Inches(2.4),
        [
            "Critical site details are forgotten before they're written down.",
            "Owners and PMs lose visibility into progress.",
            "Risk and incident data never make it into the audit trail.",
        ],
        size=18,
        color=INK,
    )
    slide_number_footer(s, 3, total)


def slide_4_product(prs, total):
    s = blank(prs)
    title_bar(s, "Product")
    # three placeholder phone frames
    labels = [
        ("New Report", "Voice-note list,\nGenerate-report\nbutton"),
        ("Daily Progress Report", "Weather, headcount,\nmaterials, flagged\nissues — structured"),
        ("Reports", "History with\nDRAFT / Incident /\nSafety tags"),
    ]
    frame_w = Inches(2.6)
    frame_h = Inches(4.6)
    gap = Inches(0.6)
    total_w = frame_w * 3 + gap * 2
    start_x = (SLIDE_W - total_w) / 2
    y = Inches(1.6)
    for i, (heading, body) in enumerate(labels):
        x = start_x + (frame_w + gap) * i
        # phone frame
        add_rect(s, x, y, frame_w, frame_h, SOFT, line=MUTED)
        add_text(
            s, x, y + Inches(0.35), frame_w, Inches(0.4), heading,
            size=14, bold=True, color=NAVY, align=PP_ALIGN.CENTER,
        )
        add_text(
            s, x, y + Inches(1.6), frame_w, Inches(2.0), body,
            size=12, color=MUTED, align=PP_ALIGN.CENTER,
        )
        add_text(
            s, x, y + frame_h + Inches(0.15), frame_w, Inches(0.4),
            f"[INSERT SCREENSHOT {i+1}]",
            size=10, color=RED, align=PP_ALIGN.CENTER, bold=True,
        )
    add_text(
        s, Inches(0.95), Inches(6.7), Inches(11.5), Inches(0.4),
        "Prototype 90% complete. Real screenshots already exist in the previous deck (slide 15).",
        size=12, color=MUTED,
    )
    slide_number_footer(s, 4, total)


def slide_5_traction(prs, total):
    s = blank(prs)
    title_bar(s, "Traction")
    add_bullets(
        s,
        Inches(0.95),
        Inches(1.5),
        Inches(11.5),
        Inches(3.2),
        [
            "Prototype 90% complete on [iOS / Android / web].",
            "Customer interviews: [N] site supervisors and PMs across [N] firms in [REGION].",
            "Pilots: [PILOT COMPANY NAME] — [STATUS: signed LOI / in evaluation / paid pilot] · [START DATE].",
        ],
        size=18,
    )
    # quote block
    add_rect(s, Inches(0.95), Inches(4.9), Inches(11.5), Inches(2.0), SOFT)
    add_rect(s, Inches(0.95), Inches(4.9), Inches(0.1), Inches(2.0), TEAL)
    add_text(
        s, Inches(1.3), Inches(5.05), Inches(11.0), Inches(1.0),
        "\u201C[VERBATIM QUOTE FROM A REAL CONSTRUCTION PM, 1–2 SENTENCES.]\u201D",
        size=18, color=INK,
    )
    add_text(
        s, Inches(1.3), Inches(6.3), Inches(11.0), Inches(0.4),
        "— [NAME], [TITLE], [COMPANY]",
        size=14, color=MUTED, bold=True,
    )
    slide_number_footer(s, 5, total)


def slide_6_market(prs, total):
    s = blank(prs)
    title_bar(s, "Market")
    # three stacked tiers
    tiers = [
        ("SOM", "[N] supervisors in [REGION] × $[ACV]/yr", "$[SOM] M", TEAL),
        ("SAM", "GCs + enterprise developers in [REGION/COUNTRY]", "$[SAM] M", NAVY),
        ("TAM", "Global construction software market", "$[TAM] B", ORANGE),
    ]
    y = Inches(1.6)
    h = Inches(1.45)
    gap = Inches(0.2)
    for i, (label, desc, value, color) in enumerate(tiers):
        ty = y + (h + gap) * i
        add_rect(s, Inches(0.95), ty, Inches(11.5), h, color)
        add_text(
            s, Inches(1.2), ty, Inches(2.0), h, label,
            size=32, bold=True, color=BG, anchor=MSO_ANCHOR.MIDDLE,
        )
        add_text(
            s, Inches(3.2), ty, Inches(6.5), h, desc,
            size=16, color=BG, anchor=MSO_ANCHOR.MIDDLE,
        )
        add_text(
            s, Inches(9.5), ty, Inches(2.7), h, value,
            size=28, bold=True, color=BG, anchor=MSO_ANCHOR.MIDDLE, align=PP_ALIGN.RIGHT,
        )
    add_text(
        s, Inches(0.95), Inches(6.4), Inches(11.5), Inches(0.4),
        "Bottoms-up first. TAM source: [INSERT INDUSTRY REPORT — IDC / Gartner / Statista].",
        size=12, color=MUTED,
    )
    slide_number_footer(s, 6, total)


def slide_7_competition(prs, total):
    s = blank(prs)
    title_bar(s, "Competition")
    cols = ["", "Procore", "Buildots /\nOpenSpace", "Fieldwire", "Harpa Pro"]
    rows = [
        ("Buyer", "Enterprise GC", "Enterprise GC", "Mid-market", "Site supervisor"),
        ("Input", "Manual forms", "360° camera", "Manual forms", "Voice"),
        ("Onboarding", "Weeks", "Weeks", "Days", "Minutes"),
        ("Price tier", "$$$$", "$$$$", "$$$", "$"),
    ]
    col_w = [Inches(1.7), Inches(2.3), Inches(2.5), Inches(2.3), Inches(2.7)]
    row_h = Inches(0.7)
    x0 = Inches(0.95)
    y0 = Inches(1.5)
    # header
    x = x0
    for i, c in enumerate(cols):
        is_us = i == 4
        add_rect(s, x, y0, col_w[i], row_h, TEAL if is_us else NAVY)
        add_text(
            s, x, y0, col_w[i], row_h, c,
            size=13, bold=True, color=BG,
            align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE,
        )
        x += col_w[i]
    # body
    for r, row in enumerate(rows):
        y = y0 + row_h * (r + 1)
        x = x0
        for i, val in enumerate(row):
            is_us = i == 4
            fill = SOFT if r % 2 == 0 else BG
            if is_us:
                fill = RGBColor(0xE7, 0xF6, 0xF4)
            add_rect(s, x, y, col_w[i], row_h, fill, line=MUTED)
            add_text(
                s, x, y, col_w[i], row_h, val,
                size=13,
                bold=(i == 0 or is_us),
                color=INK,
                align=PP_ALIGN.CENTER,
                anchor=MSO_ANCHOR.MIDDLE,
            )
            x += col_w[i]
    add_text(
        s, Inches(0.95), Inches(5.7), Inches(11.5), Inches(0.6),
        "Wedge: voice-first input · supervisor-grade UX · onboarding in minutes, not weeks.",
        size=18, color=INK, bold=True,
    )
    slide_number_footer(s, 7, total)


def slide_8_business(prs, total):
    s = blank(prs)
    title_bar(s, "Business model")
    # four metric tiles
    tiles = [
        ("Pricing", "$[X]\n/seat/mo", "billed annually"),
        ("Target ACV", "$[Y]", "≈ [N] seats per company"),
        ("Gross margin", "[Z]%", "after AI inference cost"),
        ("Motion", "Land &\nexpand", "supervisor → PM → owner"),
    ]
    tile_w = Inches(2.85)
    tile_h = Inches(3.0)
    gap = Inches(0.15)
    total_w = tile_w * 4 + gap * 3
    start_x = (SLIDE_W - total_w) / 2
    y = Inches(2.0)
    for i, (label, value, sub) in enumerate(tiles):
        x = start_x + (tile_w + gap) * i
        add_rect(s, x, y, tile_w, tile_h, SOFT)
        add_rect(s, x, y, tile_w, Inches(0.08), TEAL)
        add_text(
            s, x, y + Inches(0.3), tile_w, Inches(0.4), label,
            size=14, bold=True, color=MUTED, align=PP_ALIGN.CENTER,
        )
        add_text(
            s, x, y + Inches(0.95), tile_w, Inches(1.3), value,
            size=32, bold=True, color=NAVY, align=PP_ALIGN.CENTER,
            anchor=MSO_ANCHOR.MIDDLE,
        )
        add_text(
            s, x, y + Inches(2.35), tile_w, Inches(0.5), sub,
            size=12, color=MUTED, align=PP_ALIGN.CENTER,
        )
    add_text(
        s, Inches(0.95), Inches(5.8), Inches(11.5), Inches(0.5),
        "AI inference cost ≈ $[X] per active user / month — shown for cost transparency.",
        size=12, color=MUTED,
    )
    slide_number_footer(s, 8, total)


def slide_9_team(prs, total):
    s = blank(prs)
    title_bar(s, "Team")
    members = [
        ("Haruna Bayoh", "Co-founder · [ROLE]",
         "[ONE-LINE WHY-US: prior construction-tech experience,\nshipped product, language/region advantage, technical depth.]"),
        ("Patrick Chin", "Co-founder · [ROLE]",
         "[ONE-LINE WHY-US: what you've built and shipped,\nrelevant domain experience.]"),
    ]
    card_w = Inches(5.6)
    card_h = Inches(4.4)
    gap = Inches(0.4)
    total_w = card_w * 2 + gap
    start_x = (SLIDE_W - total_w) / 2
    y = Inches(1.7)
    for i, (name, role, why) in enumerate(members):
        x = start_x + (card_w + gap) * i
        add_rect(s, x, y, card_w, card_h, SOFT)
        # avatar placeholder circle
        add_rect(s, x + Inches(0.5), y + Inches(0.5), Inches(1.8), Inches(1.8), MUTED)
        add_text(
            s, x + Inches(0.5), y + Inches(0.5), Inches(1.8), Inches(1.8),
            "[PHOTO]", size=11, bold=True, color=BG,
            align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE,
        )
        add_text(
            s, x + Inches(2.5), y + Inches(0.6), card_w - Inches(2.7), Inches(0.5),
            name, size=22, bold=True, color=INK,
        )
        add_text(
            s, x + Inches(2.5), y + Inches(1.15), card_w - Inches(2.7), Inches(0.5),
            role, size=14, color=TEAL, bold=True,
        )
        add_text(
            s, x + Inches(0.5), y + Inches(2.6), card_w - Inches(1.0), Inches(1.6),
            why, size=14, color=INK,
        )
    slide_number_footer(s, 9, total)


def slide_10_ask(prs, total):
    s = blank(prs)
    title_bar(s, "The ask")
    # big number
    add_text(
        s, Inches(0.95), Inches(1.5), Inches(11.5), Inches(1.4),
        "$200,000",
        size=72, bold=True, color=RED,
    )
    add_text(
        s, Inches(0.95), Inches(2.85), Inches(11.5), Inches(0.5),
        "SAFE  ·  $[CAP] M post-money cap  ·  18 months runway",
        size=20, color=INK, bold=True,
    )
    # milestones
    add_text(
        s, Inches(0.95), Inches(3.8), Inches(11.5), Inches(0.4),
        "Buys us:",
        size=14, color=MUTED, bold=True,
    )
    add_bullets(
        s, Inches(0.95), Inches(4.2), Inches(7.5), Inches(2.0),
        [
            "[N] paying pilots in [REGION]",
            "$[MRR] MRR",
            "[PRODUCT MILESTONE — e.g., multi-language transcription, offline mode]",
        ],
        size=16, bullet="•",
    )
    # use of funds
    add_rect(s, Inches(8.7), Inches(4.2), Inches(3.7), Inches(2.4), SOFT)
    add_text(
        s, Inches(8.85), Inches(4.3), Inches(3.5), Inches(0.4),
        "Use of funds",
        size=12, color=MUTED, bold=True,
    )
    add_bullets(
        s, Inches(8.85), Inches(4.7), Inches(3.5), Inches(1.8),
        [
            "[%] product",
            "[%] AI inference",
            "[%] go-to-market",
        ],
        size=14, bullet="—",
    )
    # contact
    add_rect(s, Inches(0.95), Inches(6.7), Inches(11.5), Inches(0.04), TEAL)
    add_text(
        s, Inches(0.95), Inches(6.8), Inches(11.5), Inches(0.4),
        "Haruna Bayoh  ·  haruna@harpapro.com  ·  +86 156 6257 5731",
        size=14, color=NAVY, bold=True,
    )
    slide_number_footer(s, 10, total)


# ---------------------------------------------------------------- main
def build():
    prs = new_deck()
    total = 10
    slide_1_cover(prs)
    slide_2_what_we_do(prs, total)
    slide_3_why(prs, total)
    slide_4_product(prs, total)
    slide_5_traction(prs, total)
    slide_6_market(prs, total)
    slide_7_competition(prs, total)
    slide_8_business(prs, total)
    slide_9_team(prs, total)
    slide_10_ask(prs, total)

    out = Path(__file__).parent / "Harpa-Pro-Deck-v2.pptx"
    prs.save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    build()
