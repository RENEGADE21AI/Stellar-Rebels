"""Generate editable Stellar Rebels vector marks from original emblem paths and outlined type."""

from pathlib import Path
from sys import argv

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source-art" / "stellar"
FONT = TTFont(SOURCE / "type" / "BarlowCondensed-Bold.ttf")
GLYPHS = FONT.getGlyphSet()
CMAP = FONT.getBestCmap()

EMBLEMS = {
    "flare": (
        "M50 8 86 69 69 63 50 34 30 63 14 69Z M12 73 34 66 50 92 24 82Z "
        "M88 73 66 66 50 92 76 82Z",
        "M50 43 58 56 50 69 42 56Z",
    ),
    "orbit": (
        "M49 10A40 40 0 0 1 88 38L73 44A24 24 0 0 0 36 31L26 17A40 40 0 0 1 49 10Z "
        "M12 63 26 56A24 24 0 0 0 64 71L74 84A41 41 0 0 1 12 63Z M27 69 50 30 68 55Z",
        "M12 76 86 32 97 30 87 43 18 85Z",
    ),
    "pennant": (
        "M15 20H70L85 31 67 43H43L34 77 19 87 27 54H14L22 39H37L42 31H15Z "
        "M41 75 53 49H75L62 59H51L47 67 63 61 48 83Z",
        "M76 45 90 32 89 46 69 58Z",
    ),
}


def emblem(direction, face, accent):
    body, core = EMBLEMS[direction]
    return f'<path fill="{face}" d="{body}"/><path fill="{accent}" d="{core}"/>'


def outline(text, fill, width, height, left, baseline, style="flare"):
    glyph_names = [CMAP.get(ord(c), "space") for c in text]
    advance = sum(FONT["hmtx"].metrics[g][0] + 12 for g in glyph_names)
    italic = {"flare": .145, "orbit": 0, "pennant": .24}[style]
    markup = []
    cursor = 0
    for glyph in glyph_names:
        pen = SVGPathPen(GLYPHS)
        GLYPHS[glyph].draw(pen)
        if pen.getCommands():
            markup.append(f'<path transform="translate({cursor})" d="{pen.getCommands()}"/>')
        cursor += FONT["hmtx"].metrics[glyph][0] + 12
    xscale = width / (advance + 700 * italic)
    yscale = height / 700
    transform = f"matrix({xscale:.6f} 0 {italic * xscale:.6f} {-yscale:.6f} {left} {baseline})"
    return f'<g transform="{transform}" fill="{fill}">{"".join(markup)}</g>'


def svg(width, height, label, content):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">'
            f'<title>{label}</title>{content}</svg>\n')


def mark(direction, layout, face, accent):
    shape = emblem(direction, face, accent)
    label = "Stellar Rebels"
    if layout == "emblem":
        return svg(100, 100, label + " emblem", shape)
    if layout == "horizontal":
        text = outline("STELLAR REBELS", face, 486, 46, 98, 69, direction)
        return svg(604, 96, label, f'<g transform="translate(7 7) scale(.82)">{shape}</g>{text}')
    top = outline("STELLAR", face, 280, 52, 28, 124, direction)
    bottom = outline("REBELS", face, 324, 66, 4, 192, direction)
    return svg(336, 201, label, f'<g transform="translate(134 1) scale(.68)">{shape}</g>{top}{bottom}')


def app_icon():
    shape = emblem("flare", "#fff0db", "#111927")
    return svg(1024, 1024, "Stellar Rebels app icon", f"""
    <defs><linearGradient id="field" x2=".9" y2="1"><stop stop-color="#152233"/>
    <stop offset=".53" stop-color="#0b1320"/><stop offset="1" stop-color="#311b1c"/>
    </linearGradient><linearGradient id="ember" x2="1" y2="1"><stop stop-color="#ffc180"/>
    <stop offset="1" stop-color="#ff633d"/></linearGradient></defs>
    <path fill="url(#field)" d="M0 0h1024v1024H0z"/>
    <circle cx="512" cy="512" r="334" fill="#0d1623" stroke="#4b4750" stroke-width="3"/>
    <path d="M187 535a326 326 0 0 1 580-223M838 494a326 326 0 0 1-589 216"
      fill="none" stroke="url(#ember)" stroke-width="7" stroke-linecap="round"/>
    <g transform="translate(242 243) scale(5.4)">{shape}</g>
    <path fill="#ff7848" d="M512 475l38 70-38 69-38-69z"/>
    <path d="M512 140v25m0 695v25M140 512h25m695 0h25" fill="none" stroke="#ae7370" stroke-width="5"/>
    """)


def write(path, artwork):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(artwork, encoding="utf-8")


if __name__ == "__main__":
    if "--production" in argv:
        for layout in ("stacked", "horizontal", "emblem"):
            for tone, face, accent in (("light", "#fff0db", "#ff7848"),
                                       ("dark", "#131e2b", "#c44428"),
                                       ("mono-light", "#ffffff", "#ffffff"),
                                       ("mono-dark", "#141414", "#141414")):
                write(SOURCE / "brand" / f"{layout}-{tone}.svg", mark("flare", layout, face, accent))
        write(SOURCE / "brand" / "app-icon.svg", app_icon())
    else:
        for direction in EMBLEMS:
            for layout in ("stacked", "emblem"):
                write(SOURCE / "brand-concepts" / f"{direction}-{layout}.svg",
                      mark(direction, layout, "#fff0db", "#ff7848"))
        write(SOURCE / "brand-concepts" / "icon-proposal.svg", app_icon())
