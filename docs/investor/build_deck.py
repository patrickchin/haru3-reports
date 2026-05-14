"""Generate Harpa Pro YC-style 10-slide pitch deck (v2).

Run:
    /tmp/pptx-venv/bin/python docs/investor/build_deck.py

Output:
    docs/investor/Harpa-Pro-Deck-v2.pptx

Design: matches the Harpa Pro mobile app design system
(`apps/mobile/lib/design-tokens/colors.ts`).

  - Warm paper background `#f8f6f1`
  - Softened navy primary `#2d3a5a` (used for headings, primary surfaces)
  - Single saturated orange accent `#ea580c` — used once per slide
    maximum, reserved for hero/CTA-equivalent emphasis (the "Update
    report" colour in the app). Never used as routine chrome.
  - White cards `#ffffff` with warm-grey borders `#b9b4a8`
  - Label rows: uppercase + letterspaced (Tailwind `text-label`)
  - Rounded corners 6/8/12 pt mirroring `borderRadius: { md, lg, xl }`
  - System sans for UI text, Menlo for monospace metadata
"""

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Emu, Inches, Pt

# ---------------------------------------------------------------- palette
# Mirrors apps/mobile/lib/design-tokens/colors.ts. Do not invent new hex
# values here — if a colour is needed and not present, add it to the
# design tokens file first.

PAPER = RGBColor(0xF8, 0xF6, 0xF1)       # background
PAPER_MUTED = RGBColor(0xF1, 0xEE, 0xE6)  # surface.muted
PAPER_EMPHASIS = RGBColor(0xFF, 0xFD, 0xF8)  # surface.emphasis
CARD = RGBColor(0xFF, 0xFF, 0xFF)         # card

NAVY = RGBColor(0x2D, 0x3A, 0x5A)         # primary / foreground
NAVY_SOFT = RGBColor(0x5F, 0x5B, 0x66)    # muted.foreground
NAVY_DISABLED = RGBColor(0x8A, 0x86, 0x93)  # muted.disabled

ACCENT = RGBColor(0xEA, 0x58, 0x0C)       # accent (saturated orange — hero only)
DANGER = RGBColor(0xB9, 0x1C, 0x1C)       # destructive
WARNING = RGBColor(0xB6, 0x69, 0x16)      # warning
SUCCESS = RGBColor(0x2F, 0x6F, 0x48)      # success

BORDER = RGBColor(0xB9, 0xB4, 0xA8)       # border / input
SECONDARY = RGBColor(0xEC, 0xE8, 0xDF)    # secondary

# Soft tints (for tile backgrounds, info pills, etc.)
WARNING_SOFT = RGBColor(0xFF, 0xF4, 0xE5)
DANGER_SOFT = RGBColor(0xFD, 0xEC, 0xEA)
SUCCESS_SOFT = RGBColor(0xED, 0xF7, 0xEF)
INFO_SOFT = RGBColor(0xED, 0xF4, 0xFF)

# ---------------------------------------------------------------- layout
SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

CONTENT_LEFT = Inches(0.95)
CONTENT_RIGHT = Inches(12.4)
CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT


# ---------------------------------------------------------------- helpers
def new_deck() -> Presentation:
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    return prs


def blank(prs: Presentation):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    # paint warm-paper background on every slide
    add_rect(s, Inches(0), Inches(0), SLIDE_W, SLIDE_H, PAPER)
    return s


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
    color: RGBColor = NAVY,
    align=PP_ALIGN.LEFT,
    anchor=MSO_ANCHOR.TOP,
    font: str = "Helvetica Neue",
    spacing: float | None = None,
    tracking: float | None = None,
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
        if spacing is not None:
            p.line_spacing = spacing
        run = p.add_run()
        run.text = line
        run.font.name = font
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        # python-pptx exposes char-level spacing via XML; tracking is for
        # uppercase labels (~80/1000em ≈ 8% letterspacing in the app).
        if tracking is not None:
            from pptx.oxml.ns import qn
            rPr = run._r.get_or_add_rPr()
            rPr.set("spc", str(int(tracking)))
    return box


def add_label(slide, left, top, width, text: str, color: RGBColor = NAVY_SOFT, size: int = 11):
    """Uppercase, letter-spaced label row (matches the app's `text-label` token)."""
    return add_text(
        slide,
        left,
        top,
        width,
        Inches(0.3),
        text.upper(),
        size=size,
        bold=True,
        color=color,
        tracking=160,  # 0.08em ≈ 80 hundredths in OOXML, doubled for visibility on slides
    )


def add_bullets(
    slide,
    left,
    top,
    width,
    height,
    items: list[str],
    *,
    size: int = 18,
    color: RGBColor = NAVY,
    bullet: str = "—",
    line_spacing: float = 1.4,
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


def add_rect(
    slide,
    left,
    top,
    width,
    height,
    fill: RGBColor,
    line: RGBColor | None = None,
    line_weight: float = 0.75,
    radius: float | None = None,
):
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if radius is not None else MSO_SHAPE.RECTANGLE
    s = slide.shapes.add_shape(shape_type, left, top, width, height)
    if radius is not None:
        # adjust the corner radius (0.0–0.5 of the shorter side)
        s.adjustments[0] = radius
    s.fill.solid()
    s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(line_weight)
    s.shadow.inherit = False
    return s


def add_card(slide, left, top, width, height, *, emphasis: bool = False, radius: float = 0.06):
    """White (or emphasis-tinted) card with warm-grey border, mirroring `<Card>`."""
    fill = PAPER_EMPHASIS if emphasis else CARD
    return add_rect(slide, left, top, width, height, fill, line=BORDER, radius=radius)


def add_card_with_left_edge(
    slide,
    left,
    top,
    width,
    height,
    edge_color: RGBColor,
    *,
    emphasis: bool = False,
    radius: float = 0.06,
    edge_width: Emu = None,
    side: str = "left",
):
    """Card whose one edge is the accent colour — drawn as a single rounded
    accent rect *behind* the (slightly inset) card so corners share the same
    radius and never poke out. The card has its border kept all-round so the
    accent reads as a coloured edge of the card itself.

    `side` can be "left" or "top".
    """
    if edge_width is None:
        edge_width = Inches(0.10)
    # accent layer: same bounds + radius as the card
    add_rect(slide, left, top, width, height, edge_color, radius=radius)
    # card layer: inset on the chosen side so the accent shows as a stripe
    if side == "left":
        c_left = left + edge_width
        c_top = top
        c_w = width - edge_width
        c_h = height
    elif side == "top":
        c_left = left
        c_top = top + edge_width
        c_w = width
        c_h = height - edge_width
    else:
        raise ValueError(f"unsupported side: {side}")
    fill = PAPER_EMPHASIS if emphasis else CARD
    card = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, c_left, c_top, c_w, c_h,
    )
    card.adjustments[0] = radius
    card.fill.solid()
    card.fill.fore_color.rgb = fill
    card.line.color.rgb = BORDER
    card.line.width = Pt(0.75)
    card.shadow.inherit = False
    return card


def slide_chrome(slide, n: int, total: int, label: str | None = None):
    """Bottom-left brand mark + bottom-right page number, like the app footer."""
    # brand mark: orange dot + "Harpa Pro"
    add_rect(slide, CONTENT_LEFT, Inches(7.10), Inches(0.18), Inches(0.18), ACCENT, radius=0.5)
    add_text(
        slide,
        CONTENT_LEFT + Inches(0.3),
        Inches(7.05),
        Inches(2.5),
        Inches(0.3),
        "Harpa Pro",
        size=10,
        bold=True,
        color=NAVY,
    )
    # page number
    add_text(
        slide,
        Inches(11.2),
        Inches(7.05),
        Inches(1.2),
        Inches(0.3),
        f"{n:02d} / {total:02d}",
        size=10,
        color=NAVY_DISABLED,
        align=PP_ALIGN.RIGHT,
        font="Menlo",
    )
    # optional label between brand and page number
    if label:
        add_text(
            slide,
            Inches(3.5),
            Inches(7.05),
            Inches(7.5),
            Inches(0.3),
            label.upper(),
            size=10,
            bold=True,
            color=NAVY_DISABLED,
            align=PP_ALIGN.CENTER,
            tracking=160,
        )


def title_block(slide, eyebrow: str, title: str):
    """Top-of-slide title block: small uppercase eyebrow over a navy title."""
    add_label(slide, CONTENT_LEFT, Inches(0.55), CONTENT_WIDTH, eyebrow, color=ACCENT, size=10)
    add_text(
        slide,
        CONTENT_LEFT,
        Inches(0.95),
        CONTENT_WIDTH,
        Inches(0.7),
        title,
        size=32,
        bold=True,
        color=NAVY,
    )
    # hairline rule
    add_rect(slide, CONTENT_LEFT, Inches(1.75), CONTENT_WIDTH, Emu(6350), BORDER)


# ---------------------------------------------------------------- slides
def slide_1_cover(prs):
    s = blank(prs)
    # warm paper full bleed already applied by blank()
    # left rail with soft secondary tint (mirrors the app's secondary surface)
    add_rect(s, Inches(0), Inches(0), Inches(0.5), SLIDE_H, SECONDARY)
    # accent dot anchor (the app's only-orange-once principle)
    add_rect(s, Inches(1.0), Inches(1.5), Inches(0.5), Inches(0.5), ACCENT, radius=0.5)
    add_text(
        s,
        Inches(1.0),
        Inches(2.2),
        Inches(11.0),
        Inches(1.4),
        "Harpa Pro",
        size=80,
        bold=True,
        color=NAVY,
        font="Helvetica Neue",
    )
    add_text(
        s,
        Inches(1.0),
        Inches(3.5),
        Inches(11.0),
        Inches(0.9),
        "Voice notes turn into AI-structured site reports\nfor construction supervisors.",
        size=22,
        color=NAVY,
        spacing=1.3,
    )
    # hairline
    add_rect(s, Inches(1.0), Inches(5.3), Inches(2.5), Emu(6350), BORDER)
    # founders + contact, label-style
    add_label(s, Inches(1.0), Inches(5.5), Inches(11), "Founders")
    add_text(
        s,
        Inches(1.0),
        Inches(5.85),
        Inches(11),
        Inches(0.4),
        "Haruna Bayoh  ·  Patrick Chin",
        size=18,
        bold=True,
        color=NAVY,
    )
    add_label(s, Inches(1.0), Inches(6.4), Inches(11), "Contact")
    add_text(
        s,
        Inches(1.0),
        Inches(6.75),
        Inches(11),
        Inches(0.4),
        "haruna@harpapro.com   ·   +86 156 6257 5731   ·   [MONTH YEAR]",
        size=14,
        color=NAVY_SOFT,
        font="Menlo",
    )


def slide_2_what_we_do(prs, total):
    s = blank(prs)
    title_block(s, "What we do", "Voice in. Structured site report out.")
    add_text(
        s,
        CONTENT_LEFT,
        Inches(2.0),
        CONTENT_WIDTH,
        Inches(1.4),
        "A site supervisor speaks into their phone. Harpa Pro transcribes,\n"
        "structures, and turns the voice note into a daily site report —\n"
        "weather, headcount, materials, flagged issues — in under a minute.",
        size=18,
        color=NAVY,
        spacing=1.4,
    )
    # workflow chips, app-card style: white card with border, navy labels
    steps = [
        ("01", "Site\nsupervisor"),
        ("02", "Voice\nnote"),
        ("03", "Transcribe"),
        ("04", "Structured\ndata"),
        ("05", "Attach\nmedia"),
        ("06", "Generate\nreport"),
        ("07", "Export /\nshare"),
    ]
    chip_w = Inches(1.5)
    chip_h = Inches(1.45)
    gap = Inches(0.18)
    total_w = chip_w * len(steps) + gap * (len(steps) - 1)
    start_x = (SLIDE_W - total_w) / 2
    y = Inches(4.7)
    for i, (num, label) in enumerate(steps):
        x = start_x + (chip_w + gap) * i
        # accent treatment ONCE — on the final "export" chip, the user-visible payoff
        is_payoff = i == len(steps) - 1
        if is_payoff:
            add_rect(s, x, y, chip_w, chip_h, ACCENT, radius=0.08)
            num_color = RGBColor(0xFF, 0xE6, 0xD5)
            text_color = RGBColor(0xFF, 0xFF, 0xFF)
        else:
            add_card(s, x, y, chip_w, chip_h, radius=0.08)
            num_color = NAVY_DISABLED
            text_color = NAVY
        add_text(
            s, x, y + Inches(0.15), chip_w, Inches(0.3),
            num, size=10, bold=True, color=num_color,
            align=PP_ALIGN.CENTER, font="Menlo", tracking=160,
        )
        add_text(
            s, x, y + Inches(0.45), chip_w, chip_h - Inches(0.5),
            label, size=14, bold=True, color=text_color,
            align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, spacing=1.2,
        )
    slide_chrome(s, 2, total, label="Slide 02 — Product")


def slide_3_why(prs, total):
    s = blank(prs)
    title_block(s, "Why it matters", "Site reports are slow, lossy, and unsearchable.")
    # giant stat in accent — this slide's single orange moment
    add_text(
        s,
        CONTENT_LEFT,
        Inches(2.1),
        CONTENT_WIDTH,
        Inches(1.4),
        "3–8 hrs",
        size=84,
        bold=True,
        color=ACCENT,
    )
    add_text(
        s,
        CONTENT_LEFT,
        Inches(3.45),
        CONTENT_WIDTH,
        Inches(0.5),
        "per week per manager  —  lost to manual report writing.",
        size=20,
        color=NAVY,
    )
    add_label(
        s, CONTENT_LEFT, Inches(4.0), CONTENT_WIDTH,
        "Source: Harpa Pro internal data + [INSERT EXTERNAL CITATION]",
        color=NAVY_DISABLED, size=9,
    )
    # three consequence cards
    cards = [
        ("Memory loss", "Critical site details forgotten\nbefore they're written down."),
        ("Visibility gap", "Owners and PMs lose visibility\ninto day-to-day progress."),
        ("Audit gap", "Risk and incident data never\nmake it into the audit trail."),
    ]
    card_w = Inches(3.95)
    card_h = Inches(2.0)
    gap = Inches(0.2)
    total_w = card_w * 3 + gap * 2
    start_x = (SLIDE_W - total_w) / 2
    y = Inches(4.7)
    for i, (heading, body) in enumerate(cards):
        x = start_x + (card_w + gap) * i
        add_card(s, x, y, card_w, card_h, radius=0.05)
        add_label(s, x + Inches(0.3), y + Inches(0.3), card_w - Inches(0.6), heading, color=ACCENT, size=10)
        add_text(
            s, x + Inches(0.3), y + Inches(0.7), card_w - Inches(0.6), card_h - Inches(0.9),
            body, size=15, color=NAVY, spacing=1.3,
        )
    slide_chrome(s, 3, total, label="Slide 03 — Problem")


def slide_4_product(prs, total):
    s = blank(prs)
    title_block(s, "Product", "The 90%-complete prototype.")
    labels = [
        ("New Report", "Voice-note list, timestamps,\nGenerate-report button"),
        ("Daily Progress Report", "Structured: weather, headcount,\nmaterials, flagged issues"),
        ("Reports", "History with DRAFT, Incident,\nSafety status tags"),
    ]
    frame_w = Inches(2.8)
    frame_h = Inches(3.7)
    gap = Inches(0.5)
    total_w = frame_w * 3 + gap * 2
    start_x = (SLIDE_W - total_w) / 2
    # captions ABOVE the phone frames so we don't run off the slide
    cap_y = Inches(2.0)
    phone_y = Inches(3.05)
    for i, (heading, body) in enumerate(labels):
        x = start_x + (frame_w + gap) * i
        # caption (label + body) above the phone
        add_label(s, x, cap_y, frame_w, heading, color=ACCENT, size=10)
        add_text(
            s, x, cap_y + Inches(0.3), frame_w, Inches(0.7),
            body, size=12, color=NAVY_SOFT, spacing=1.3,
        )
        # phone-shaped card
        add_card(s, x, phone_y, frame_w, frame_h, radius=0.08)
        # mock screen header
        add_rect(
            s, x + Inches(0.25), phone_y + Inches(0.25), frame_w - Inches(0.5), Inches(0.3),
            PAPER_MUTED, radius=0.3,
        )
        # body placeholder rows
        row_y = phone_y + Inches(0.8)
        for r in range(4):
            add_rect(
                s, x + Inches(0.3), row_y + Inches(r * 0.55),
                frame_w - Inches(0.6), Inches(0.35),
                PAPER_MUTED, radius=0.2,
            )
    # placeholder note: small, sits between the phone frames and the chrome
    add_text(
        s, CONTENT_LEFT, Inches(6.80), CONTENT_WIDTH, Inches(0.2),
        "Mock frames — replace with real screenshots before sending.",
        size=9, color=NAVY_DISABLED, font="Menlo", align=PP_ALIGN.CENTER,
    )
    slide_chrome(s, 4, total, label="Slide 04 — Product")


def slide_5_traction(prs, total):
    s = blank(prs)
    title_block(s, "Traction", "Where we are today.")
    # three stat tiles, app StatTile style
    tiles = [
        ("90%", "PROTOTYPE COMPLETE"),
        ("[N]", "CUSTOMER INTERVIEWS"),
        ("[N]", "PILOTS IN PIPELINE"),
    ]
    tile_w = Inches(3.95)
    tile_h = Inches(1.7)
    gap = Inches(0.2)
    total_w = tile_w * 3 + gap * 2
    start_x = (SLIDE_W - total_w) / 2
    y = Inches(2.0)
    for i, (value, label) in enumerate(tiles):
        x = start_x + (tile_w + gap) * i
        # accent the first tile (the only solid traction we have) — left-edge
        if i == 0:
            add_card_with_left_edge(s, x, y, tile_w, tile_h, ACCENT, radius=0.05)
        else:
            add_card(s, x, y, tile_w, tile_h, radius=0.05)
        add_text(
            s, x, y + Inches(0.3), tile_w, Inches(0.9),
            value, size=44, bold=True, color=NAVY,
            align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE,
        )
        add_label(s, x, y + Inches(1.25), tile_w, label, color=NAVY_SOFT, size=10)
    # quote card (left-accent edge mirrors the in-app emphasis card)
    add_card_with_left_edge(
        s, CONTENT_LEFT, Inches(4.2), CONTENT_WIDTH, Inches(2.2),
        ACCENT, radius=0.05, emphasis=True,
    )
    add_label(s, CONTENT_LEFT + Inches(0.4), Inches(4.4), CONTENT_WIDTH, "Voice of customer")
    add_text(
        s, CONTENT_LEFT + Inches(0.4), Inches(4.8), CONTENT_WIDTH - Inches(0.8), Inches(1.0),
        "\u201C[VERBATIM QUOTE FROM A REAL CONSTRUCTION PM, 1–2 SENTENCES.]\u201D",
        size=18, color=NAVY, spacing=1.3,
    )
    add_text(
        s, CONTENT_LEFT + Inches(0.4), Inches(5.85), CONTENT_WIDTH - Inches(0.8), Inches(0.4),
        "[NAME]   ·   [TITLE]   ·   [COMPANY]",
        size=12, color=NAVY_SOFT, font="Menlo",
    )
    # pilot row
    add_label(s, CONTENT_LEFT, Inches(6.55), CONTENT_WIDTH, "Pilots", color=NAVY_SOFT, size=10)
    add_text(
        s, CONTENT_LEFT, Inches(6.85), CONTENT_WIDTH, Inches(0.3),
        "[PILOT COMPANY NAME]  —  [STATUS]  —  [START DATE]",
        size=11, color=NAVY_SOFT, font="Menlo",
    )
    slide_chrome(s, 5, total, label="Slide 05 — Traction")


def slide_6_market(prs, total):
    s = blank(prs)
    title_block(s, "Market", "Bottoms-up sizing, beachhead first.")
    tiers = [
        ("SOM", "[N] supervisors in [REGION] × $[ACV] / yr",
         "$[SOM] M", PAPER_EMPHASIS, ACCENT),
        ("SAM", "GCs + enterprise developers in [REGION/COUNTRY]",
         "$[SAM] M", CARD, NAVY),
        ("TAM", "Global construction software market",
         "$[TAM] B", CARD, NAVY),
    ]
    y = Inches(2.0)
    h = Inches(1.4)
    gap = Inches(0.18)
    for i, (label, desc, value, fill, value_color) in enumerate(tiers):
        ty = y + (h + gap) * i
        # focus tier gets a left accent edge instead of a separate bar
        if value_color == ACCENT:
            add_card_with_left_edge(
                s, CONTENT_LEFT, ty, CONTENT_WIDTH, h, ACCENT,
                radius=0.05, emphasis=(fill == PAPER_EMPHASIS),
            )
        else:
            add_card(s, CONTENT_LEFT, ty, CONTENT_WIDTH, h, radius=0.05, emphasis=(fill == PAPER_EMPHASIS))
        # label
        add_text(
            s, CONTENT_LEFT + Inches(0.4), ty, Inches(2.0), h, label,
            size=28, bold=True, color=NAVY,
            anchor=MSO_ANCHOR.MIDDLE,
        )
        # description
        add_text(
            s, CONTENT_LEFT + Inches(2.6), ty, Inches(7.0), h, desc,
            size=15, color=NAVY_SOFT, anchor=MSO_ANCHOR.MIDDLE,
        )
        # value (orange only on the focus tier)
        add_text(
            s, CONTENT_RIGHT - Inches(3.0), ty, Inches(2.6), h, value,
            size=32, bold=True, color=value_color,
            anchor=MSO_ANCHOR.MIDDLE, align=PP_ALIGN.RIGHT,
        )
    add_label(
        s, CONTENT_LEFT, Inches(6.7), CONTENT_WIDTH,
        "TAM source: [INSERT INDUSTRY REPORT — IDC / Gartner / Statista]",
        color=NAVY_DISABLED, size=9,
    )
    slide_chrome(s, 6, total, label="Slide 06 — Market")


def slide_7_competition(prs, total):
    s = blank(prs)
    title_block(s, "Competition", "Voice-first, supervisor-grade. Nobody else.")
    headers = ["", "Procore", "Buildots / OpenSpace", "Fieldwire", "Harpa Pro"]
    rows = [
        ("Buyer", "Enterprise GC", "Enterprise GC", "Mid-market", "Site supervisor"),
        ("Input", "Manual forms", "360° camera", "Manual forms", "Voice"),
        ("Onboarding", "Weeks", "Weeks", "Days", "Minutes"),
        ("Price tier", "$$$$", "$$$$", "$$$", "$"),
    ]
    n_cols = len(headers)
    n_rows = len(rows) + 1
    table_left = CONTENT_LEFT
    table_top = Inches(2.0)
    table_width = CONTENT_WIDTH
    table_height = Inches(3.4)
    table_shape = s.shapes.add_table(
        n_rows, n_cols, table_left, table_top, table_width, table_height
    )
    table = table_shape.table
    # column widths: label column narrower, "Harpa Pro" column slightly wider
    col_widths = [Inches(1.7), Inches(2.3), Inches(2.7), Inches(2.3), Inches(2.45)]
    for i, w in enumerate(col_widths):
        table.columns[i].width = w
    # row heights: header taller
    table.rows[0].height = Inches(0.7)
    for r in range(1, n_rows):
        table.rows[r].height = Inches((table_height - Inches(0.7)) / (n_rows - 1))

    def style_cell(cell, text, *, fill, color, bold=False, size=13, tracking=None):
        cell.fill.solid()
        cell.fill.fore_color.rgb = fill
        cell.margin_left = Inches(0.15)
        cell.margin_right = Inches(0.15)
        cell.margin_top = Inches(0.05)
        cell.margin_bottom = Inches(0.05)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf = cell.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        # clear default run
        p.text = ""
        run = p.add_run()
        run.text = text
        run.font.name = "Helvetica Neue"
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        if tracking is not None:
            from pptx.oxml.ns import qn
            rPr = run._r.get_or_add_rPr()
            rPr.set("spc", str(int(tracking)))

    # header row
    for i, h in enumerate(headers):
        is_us = i == n_cols - 1
        style_cell(
            table.cell(0, i), h,
            fill=ACCENT if is_us else NAVY,
            color=CARD, bold=True, size=12, tracking=80,
        )
    # body rows
    for r, row in enumerate(rows, start=1):
        for i, val in enumerate(row):
            is_us = i == n_cols - 1
            is_label_col = i == 0
            if is_us:
                fill = PAPER_EMPHASIS
            elif is_label_col:
                fill = PAPER_MUTED
            else:
                fill = CARD if r % 2 == 1 else PAPER_MUTED
            color = NAVY if (is_label_col or is_us) else NAVY_SOFT
            style_cell(
                table.cell(r, i), val,
                fill=fill, color=color,
                bold=(is_label_col or is_us),
                size=13,
            )
    # wedge callout — single rounded card with left accent edge
    add_card_with_left_edge(
        s, CONTENT_LEFT, Inches(5.7), CONTENT_WIDTH, Inches(1.0),
        ACCENT, radius=0.05, emphasis=True,
    )
    add_label(s, CONTENT_LEFT + Inches(0.4), Inches(5.85), CONTENT_WIDTH, "Our wedge", color=ACCENT, size=10)
    add_text(
        s, CONTENT_LEFT + Inches(0.4), Inches(6.15), CONTENT_WIDTH - Inches(0.8), Inches(0.5),
        "Voice-first input  ·  supervisor-grade UX  ·  onboarding in minutes, not weeks.",
        size=15, bold=True, color=NAVY,
    )
    slide_chrome(s, 7, total, label="Slide 07 — Competition")


def slide_8_business(prs, total):
    s = blank(prs)
    title_block(s, "Business model", "Per-seat SaaS, land with supervisors.")
    tiles = [
        ("PRICING", "$[X]", "/seat / month, billed annually"),
        ("TARGET ACV", "$[Y]", "≈ [N] seats per company"),
        ("GROSS MARGIN", "[Z]%", "after AI inference cost"),
        ("MOTION", "Land &\nexpand", "supervisor → PM → owner"),
    ]
    tile_w = Inches(2.95)
    tile_h = Inches(2.95)
    gap = Inches(0.15)
    total_w = tile_w * 4 + gap * 3
    start_x = (SLIDE_W - total_w) / 2
    y = Inches(2.2)
    for i, (label, value, sub) in enumerate(tiles):
        x = start_x + (tile_w + gap) * i
        # the first tile (pricing) is the focus — emphasis tint + orange top edge
        is_focus = i == 0
        if is_focus:
            add_card_with_left_edge(
                s, x, y, tile_w, tile_h, ACCENT,
                radius=0.05, emphasis=True, side="top",
            )
        else:
            add_card(s, x, y, tile_w, tile_h, radius=0.05)
        add_label(s, x + Inches(0.3), y + Inches(0.3), tile_w - Inches(0.6), label, color=ACCENT if is_focus else NAVY_SOFT, size=10)
        add_text(
            s, x + Inches(0.3), y + Inches(0.95), tile_w - Inches(0.6), Inches(1.5),
            value,
            size=40 if "\n" not in value else 26,
            bold=True, color=NAVY,
            align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, spacing=1.1,
        )
        add_text(
            s, x + Inches(0.3), y + Inches(2.35), tile_w - Inches(0.6), Inches(0.5),
            sub, size=11, color=NAVY_SOFT, align=PP_ALIGN.CENTER, spacing=1.3,
        )
    add_label(
        s, CONTENT_LEFT, Inches(6.6), CONTENT_WIDTH,
        "AI inference cost ≈ $[X] per active user / month — shown for transparency.",
        color=NAVY_DISABLED, size=9,
    )
    slide_chrome(s, 8, total, label="Slide 08 — Business model")


def slide_9_team(prs, total):
    s = blank(prs)
    title_block(s, "Team", "Two founders. One product.")
    members = [
        ("Haruna Bayoh", "Co-founder · [ROLE]",
         "[ONE-LINE WHY-US: prior construction-tech experience,\nshipped product, language/region advantage,\ntechnical depth — pick the strongest.]"),
        ("Patrick Chin", "Co-founder · [ROLE]",
         "[ONE-LINE WHY-US: what you've built and shipped,\nrelevant domain experience.]"),
    ]
    card_w = Inches(5.6)
    card_h = Inches(4.5)
    gap = Inches(0.4)
    total_w = card_w * 2 + gap
    start_x = (SLIDE_W - total_w) / 2
    y = Inches(2.0)
    for i, (name, role, why) in enumerate(members):
        x = start_x + (card_w + gap) * i
        add_card(s, x, y, card_w, card_h, radius=0.04)
        # avatar slot — circle, paper-muted, with placeholder label
        add_rect(s, x + Inches(0.5), y + Inches(0.5), Inches(1.9), Inches(1.9), PAPER_MUTED, radius=0.5)
        add_text(
            s, x + Inches(0.5), y + Inches(0.5), Inches(1.9), Inches(1.9),
            "[PHOTO]",
            size=10, bold=True, color=NAVY_DISABLED,
            align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, font="Menlo", tracking=160,
        )
        # name + role
        add_text(
            s, x + Inches(2.6), y + Inches(0.65), card_w - Inches(2.8), Inches(0.6),
            name, size=24, bold=True, color=NAVY,
        )
        add_label(s, x + Inches(2.6), y + Inches(1.3), card_w - Inches(2.8), role, color=ACCENT, size=10)
        # why-us
        add_rect(s, x + Inches(0.5), y + Inches(2.8), card_w - Inches(1.0), Emu(6350), BORDER)
        add_text(
            s, x + Inches(0.5), y + Inches(3.0), card_w - Inches(1.0), Inches(1.4),
            why, size=14, color=NAVY, spacing=1.4,
        )
    slide_chrome(s, 9, total, label="Slide 09 — Team")


def slide_10_ask(prs, total):
    s = blank(prs)
    title_block(s, "The ask", "What we need, what it buys.")
    # giant figure — single accent moment
    add_text(
        s, CONTENT_LEFT, Inches(2.0), CONTENT_WIDTH, Inches(1.6),
        "$200,000",
        size=88, bold=True, color=ACCENT,
    )
    add_text(
        s, CONTENT_LEFT, Inches(3.5), CONTENT_WIDTH, Inches(0.5),
        "SAFE   ·   $[CAP] M post-money cap   ·   18 months runway",
        size=20, bold=True, color=NAVY, font="Menlo",
    )
    # two columns: milestones (left, white card) + use of funds (right, emphasis card)
    col_w = (CONTENT_WIDTH - Inches(0.3)) / 2
    col_y = Inches(4.4)
    col_h = Inches(2.1)
    # milestones card
    add_card(s, CONTENT_LEFT, col_y, col_w, col_h, radius=0.05)
    add_label(s, CONTENT_LEFT + Inches(0.3), col_y + Inches(0.25), col_w, "Milestones", color=ACCENT, size=10)
    add_bullets(
        s,
        CONTENT_LEFT + Inches(0.3),
        col_y + Inches(0.65),
        col_w - Inches(0.6),
        col_h - Inches(0.8),
        [
            "[N] paying pilots in [REGION]",
            "$[MRR] MRR",
            "[PRODUCT MILESTONE]",
        ],
        size=14, bullet="—", line_spacing=1.5,
    )
    # use of funds card
    funds_x = CONTENT_LEFT + col_w + Inches(0.3)
    add_card(s, funds_x, col_y, col_w, col_h, radius=0.05, emphasis=True)
    add_label(s, funds_x + Inches(0.3), col_y + Inches(0.25), col_w, "Use of funds", color=ACCENT, size=10)
    add_bullets(
        s,
        funds_x + Inches(0.3),
        col_y + Inches(0.65),
        col_w - Inches(0.6),
        col_h - Inches(0.8),
        [
            "[%] product",
            "[%] AI inference",
            "[%] go-to-market",
        ],
        size=14, bullet="—", line_spacing=1.5,
    )
    # contact row
    add_rect(s, CONTENT_LEFT, Inches(6.7), CONTENT_WIDTH, Emu(6350), BORDER)
    add_text(
        s, CONTENT_LEFT, Inches(6.85), CONTENT_WIDTH, Inches(0.3),
        "Haruna Bayoh   ·   haruna@harpapro.com   ·   +86 156 6257 5731",
        size=13, color=NAVY, bold=True, font="Menlo",
    )
    slide_chrome(s, 10, total, label="Slide 10 — Ask")


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
