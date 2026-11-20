"""Compose deterministic phone UI over the generated Stellar Rebels concept plates."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
STUDIES = ROOT / "source-art" / "stellar" / "studies"
BRAND = ROOT / "source-art" / "stellar" / "brand-concepts" / "png"
DEST = ROOT / "docs" / "stellar-concepts"
DISPLAY = ROOT / "source-art" / "stellar" / "type" / "BarlowCondensed-Bold.ttf"
WINDOWS_FONTS = Path("C:/Windows/Fonts")
BASE = "#080f18"
WHITE = "#fff0db"
MUTED = "#b1bdc9"
ORANGE = "#ff8752"
TEAL = "#78efdb"
EDGE = "#415568"

SCREENS = {
    "01-launch-and-icon": ("Launch / installed icon", "launch"),
    "02-title-play": ("Title / main Play", "title"),
    "03-stage-select": ("Arcade route / Endless entry", "route"),
    "04-ship-bay": ("Ship selection", "ship"),
    "05-upgrades": ("Shared upgrade shop", "upgrades"),
    "06-initial-hud": ("Initial HUD / inline teaching", "start"),
    "07-breach-combat": ("Normal stage combat", "combat"),
    "08-advanced-combat": ("Advanced combat / formation layering", "advanced"),
    "09-gatekeeper": ("Boss / visible turret hardpoints", "boss"),
    "10-rail-tyrant": ("Boss / rail warning", "rail"),
    "11-field-pickups": ("Pickup / Barrier and Overdrive", "buffs"),
    "12-recovery": ("Damage / Repair recovery", "heal"),
    "13-pause": ("Pause / deliberate resume", "pause"),
    "14-defeat": ("Defeat / quick retry", "defeat"),
    "15-victory": ("Victory / proceed", "clear"),
    "16-stage-unlock": ("Stage unlock", "stage_unlock"),
    "17-ship-unlock": ("Ship unlock", "ship_unlock"),
    "18-upgrade-purchase": ("Upgrade purchase / result", "purchase"),
    "19-records": ("Personal and legacy records", "records"),
    "20-endless-combat": ("Endless survival", "endless"),
    "21-endless-result": ("Endless personal result", "endless_end"),
    "22-flight-school": ("Help / controls", "help"),
    "23-settings": ("Settings / accessibility", "settings"),
    "24-offline-recovery": ("Offline / local-save recovery", "offline"),
    "25-finale": ("Campaign finale", "finale"),
    "26-offline-ready": ("Offline play / pack status", "offline_ready"),
    "27-offline-pack-missing": ("Offline pack recovery", "offline_pack"),
}


def typeface(size, kind="body"):
    source = DISPLAY if kind == "head" else WINDOWS_FONTS / ("consola.ttf" if kind == "label" else "arial.ttf")
    return ImageFont.truetype(str(source), size)


def paste_contain(fr, source, center, size):
    logo = Image.open(source).convert("RGBA")
    logo.thumbnail(size, Image.Resampling.LANCZOS)
    fr.paste(logo, (center[0] - logo.width // 2, center[1] - logo.height // 2), logo)


def blend_box(frame, box, fill, border=EDGE):
    x, y, x2, y2 = box
    layer = Image.new("RGBA", frame.size)
    draw = ImageDraw.Draw(layer)
    points = [(x, y), (x2 - 11, y), (x2, y + 11), (x2, y2), (x + 10, y2), (x, y2 - 10)]
    draw.polygon(points, fill=fill, outline=border)
    frame.alpha_composite(layer)


def title(draw, text, x, y, size=37, color=WHITE):
    draw.text((x, y), text, font=typeface(size, "head"), fill=color, anchor="lt")


def label(draw, text, x, y, color=MUTED, anchor="lt", size=12):
    draw.text((x, y), text, font=typeface(size, "label"), fill=color, anchor=anchor)


def body(draw, text, x, y, color=MUTED, size=14):
    draw.multiline_text((x, y), text, font=typeface(size), fill=color, spacing=6)


def button(frame, text, x, y, w, height=48, primary=True, arrow=True):
    color = ORANGE if primary else "#132331"
    blend_box(frame, (x, y, x + w, y + height), color, ORANGE if primary else EDGE)
    d = ImageDraw.Draw(frame)
    font = typeface(24, "head")
    if font.getlength(text) > w - 47:
        font = typeface(20, "head")
    d.text((x + 16, y + height / 2), text, font=font, fill=BASE if primary else WHITE, anchor="lm")
    if arrow:
        d.text((x + w - 15, y + height / 2), "›", font=typeface(24, "head"), fill=BASE if primary else MUTED, anchor="rm")


def backplate(name, size, shade=0):
    source = Image.open(STUDIES / f"{name}.jpg").convert("RGB")
    if name.startswith("combat-"):
        # Keep every panel's ship and foreground placement in the phone frame.
        scene = source.resize(size, Image.Resampling.LANCZOS).convert("RGBA")
    else:
        scene = ImageOps.fit(source, size, method=Image.Resampling.LANCZOS, centering=(.50, .47)).convert("RGBA")
    if shade:
        scene.alpha_composite(Image.new("RGBA", size, (3, 9, 16, shade)))
    return scene


def veil(frame, top, bottom):
    w, h = frame.size
    ramp = Image.new("L", (1, h))
    ramp.putdata([int(max(0, 1 - y / max(1, top), (y - h + bottom) / max(1, bottom)) * 242) for y in range(h)])
    tint = Image.new("RGBA", frame.size, (5, 11, 19))
    tint.putalpha(ramp.resize((w, h)))
    frame.alpha_composite(tint)


def header(frame, name, note):
    w = frame.width
    draw = ImageDraw.Draw(frame)
    label(draw, "‹  BACK", 22, 24, WHITE)
    label(draw, note, w - 22, 24, ORANGE, anchor="rt")
    title(draw, name, 22, 49)
    draw.line((22, 97, w - 22, 97), fill=EDGE)


def hud(frame, state):
    w, h = frame.size
    blend_box(frame, (13, 14, w - 13, 69), (8, 17, 28, 225))
    draw = ImageDraw.Draw(frame)
    label(draw, "HULL", 26, 25)
    for i in range(5):
        draw.rectangle((26 + i * 14, 44, 36 + i * 14, 54), fill=TEAL if i < (3 if state == "heal" else 5) else "#293948")
    section = "ENDLESS" if state == "endless" else "RED SUN" if state == "rail" else "VESPER ORBIT" if state in ("start", "combat", "boss", "pause", "heal") else "RELAY STATION"
    label(draw, section, 111, 26, WHITE)
    label(draw, "00:14" if state == "start" else "06:42" if state == "endless" else "01:38", 111, 45, MUTED)
    draw.rounded_rectangle((w - 62, 19, w - 18, 63), 3, fill="#172636", outline=EDGE)
    draw.rectangle((w - 44, 32, w - 41, 47), fill=WHITE)
    draw.rectangle((w - 36, 32, w - 33, 47), fill=WHITE)
    if state in ("boss", "rail"):
        label(draw, "WARDEN" if state == "boss" else "RAIL SHIP", 20, 88, WHITE)
        draw.rectangle((20, 106, w - 20, 111), fill="#494154")
        draw.rectangle((20, 106, w * .64, 111), fill="#ff765e")
    if state == "boss":
        for fraction, disabled in ((.255, False), (.752, True)):
            cx, cy, radius = w * fraction, h * .237, 16
            if disabled:
                draw.line((cx-7, cy-7, cx+7, cy+7), fill="#ced3d9", width=2)
                draw.line((cx+7, cy-7, cx-7, cy+7), fill="#ced3d9", width=2)
            else:
                draw.line([(cx-radius, cy-5), (cx-radius, cy-13), (cx-6, cy-13)], fill=TEAL, width=2)
                draw.line([(cx+radius, cy+5), (cx+radius, cy+13), (cx+6, cy+13)], fill=TEAL, width=2)
    if state == "start":
        blend_box(frame, (32, h - 88, w - 32, h - 29), (9, 18, 29, 235))
        label(ImageDraw.Draw(frame), "DRAG TO FLY   ·   AUTO-FIRE", w // 2, h - 65, WHITE, anchor="mt")
    if state in ("buffs", "heal"):
        cx = w * (.50 if state == "buffs" else .56)
        cy = h * .692
        effect = Image.new("RGBA", frame.size)
        ed = ImageDraw.Draw(effect)
        color = (119, 245, 214) if state == "heal" else (111, 201, 255)
        for radius, alpha in ((20, 215), (24, 80), (28, 38)):
            ed.arc((cx-radius, cy-radius, cx+radius, cy+radius), 20, 337, fill=(*color, alpha), width=2)
        if state == "buffs":
            for lane in (-16, 16):
                for inset in (45, 77, 112):
                    ed.line((cx+lane, cy-inset, cx+lane, cy-inset-9), fill="#dda6ff", width=2)
        else:
            ed.line((cx+27, cy-17, cx+41, cy-17), fill=TEAL, width=2)
            ed.line((cx+34, cy-24, cx+34, cy-10), fill=TEAL, width=2)
        frame.alpha_composite(effect)
        blend_box(frame, (22, h - 77, w - 22, h - 29), (10, 23, 35, 245))
        label(ImageDraw.Draw(frame), "BARRIER ×2    OVERDRIVE 07s" if state == "buffs" else "REPAIR   +2 HULL", 34, h - 60, WHITE)
    if state == "rail":
        x = round(w * .58)
        overlay = Image.new("RGBA", frame.size)
        od = ImageDraw.Draw(overlay)
        od.rectangle((x - 16, 135, x + 16, h - 20), outline="#ffc36f", fill=(243, 112, 56, 49), width=2)
        for stripe in range(160, h - 27, 25):
            od.line((x - 15, stripe, x + 15, stripe - 16), fill=(250, 168, 89, 180), width=1)
        frame.alpha_composite(overlay)


def panel(frame, heading, description, primary, secondary=None, tag=None):
    w, h = frame.size
    y = max(118, round(h * .32))
    panel_height = 224 + (57 if secondary else 0)
    blend_box(frame, (18, y, w - 18, y + panel_height), (11, 20, 32, 245))
    d = ImageDraw.Draw(frame)
    label(d, tag or "FLIGHT REPORT", 40, y + 25, ORANGE)
    title(d, heading, 39, y + 47, 37)
    body(d, description, 40, y + 104)
    button(frame, primary, 39, y + 158, w - 78)
    if secondary:
        button(frame, secondary, 39, y + 215, w - 78, primary=False)


def list_rows(frame, items, top=111, minimum=43):
    w, h = frame.size
    row = max(minimum, min(72, (h - top - 102) // len(items) - 8))
    for i, (name, desc, value, locked) in enumerate(items):
        y = top + i * (row + 8)
        blend_box(frame, (22, y, w - 22, y + row), (15, 28, 42, 225), ORANGE if i == 0 and not locked else EDGE)
        d = ImageDraw.Draw(frame)
        title(d, name, 36, y + 8, 23 if row < 58 else 27, MUTED if locked else WHITE)
        label(d, value, w - 36, y + 12, MUTED if locked else ORANGE, anchor="rt", size=12)
        if desc and row >= 49:
            label(d, desc, 36, y + row - 16, MUTED, size=10)


def compose(state, size):
    w, h = size
    if state in ("launch", "title"):
        f = backplate("key-art", size)
        veil(f, h * .3, h * .25)
        if state == "launch":
            paste_contain(f, BRAND / "icon-proposal.png", (w // 2, h // 2), (108, 108))
        paste_contain(f, BRAND / "flare-stacked.png", (w // 2, int(h * .202)), (int(w * .64), int(h * .24)))
        if state == "title":
            button(f, "Play", 27, h - 119, w - 54, 53)
            d = ImageDraw.Draw(f)
            for text, x in (("HANGAR", .21), ("RECORDS", .5), ("SETTINGS", .79)):
                label(d, text, int(w * x), h - 37, WHITE, anchor="mt")
        return f
    combat = {"start": 1, "combat": 1, "advanced": 2, "boss": 3, "rail": "rail", "buffs": 2,
              "heal": 1, "pause": 1, "endless": 2}
    if state in combat:
        frame = backplate(f"combat-{combat[state]}", size, shade=12)
        hud(frame, state)
        if state == "pause":
            frame.alpha_composite(Image.new("RGBA", size, (4, 9, 16, 165)))
            panel(frame, "Paused", "Your flight is on hold.", "Resume", "Leave flight", "VESPER ORBIT")
        return frame
    if state == "ship":
        frame = backplate("hangar", size)
        veil(frame, h * .32, h * .35)
        header(frame, "Ship bay", "HANGAR")
        for j, (name, note) in enumerate((("Fighter", "EQUIPPED"), ("Interceptor", "CLEAR 02"), ("Gunship", "CLEAR 04"))):
            width = (w - 58) // 3
            x = 23 + j * (width + 6)
            blend_box(frame, (x, h - 127, x + width, h - 82), (12, 24, 37, 247), ORANGE if j == 0 else EDGE)
            title(ImageDraw.Draw(frame), name, x + 7, h - 120, 18)
            label(ImageDraw.Draw(frame), note, x + 7, h - 97, size=9)
        title(ImageDraw.Draw(frame), "Fighter", 23, h - 216, 42)
        body(ImageDraw.Draw(frame), "Twin pulse guns · balanced handling", 24, h - 162)
        button(frame, "Equip Fighter", 23, h - 76, w - 46)
        label(ImageDraw.Draw(frame), "SHIP BAY   /   UPGRADES ›", w - 22, 109, WHITE, anchor="rt", size=11)
        return frame
    frame = backplate("navigation", size, shade=35)
    if state == "route":
        header(frame, "Stage Select", "ARCADE")
        blend_box(frame, (22, 107, w - 22, 150), (15, 28, 42, 235))
        title(ImageDraw.Draw(frame), "Fighter equipped", 33, 117, 21)
        label(ImageDraw.Draw(frame), "CHANGE ›", w - 33, 124, ORANGE, anchor="rt", size=10)
        names = ("Vesper Orbit", "Asteroid Belt", "Relay Station", "Red Sun", "Outer Orbit", "The Flagship")
        list_rows(frame, [(f"{i + 1:02d}  {name}", "Warden at the relay" if i == 0 else "", "LAUNCH" if i == 0 else "LOCKED", i > 0) for i, name in enumerate(names)], top=160)
        button(frame, "Endless", 22, h - 64, int((w - 49) * .52), 44, primary=False)
        button(frame, "Flight school", 27 + int((w - 49) * .52), h - 64, round((w - 49) * .48), 44, primary=False, arrow=False)
    elif state == "upgrades":
        header(frame, "Upgrades", "125 SALVAGE")
        label(ImageDraw.Draw(frame), "‹ SHIP BAY   /   UPGRADES", 22, 110, WHITE, size=11)
        list_rows(frame, [("Calibrated Rails", "+8% weapon damage", "70", False), ("Cycling Chamber", "+9% fire rate · needs Rails", "125", True), ("Resonant Cells", "+10% damage · needs Chamber", "210", True), ("Ablative Hull", "+1 hull across your fleet", "95", False)], top=132)
        button(frame, "Inspect Calibrated Rails", 22, h - 72, w - 44)
    elif state == "records":
        header(frame, "Records", "ON THIS DEVICE")
        list_rows(frame, [("Arcade best", "Vesper Orbit · Fighter", "9,420", False), ("Endless", "Interceptor · Standard", "06:42", False), ("Star Strike RUSH", "Legacy best and Glory", "ARCHIVE", False)])
    elif state == "help":
        header(frame, "Flight school", "CONTROLS")
        list_rows(frame, [("Drag to steer", "Lift and drag again to reanchor", "MOVE", False), ("Fire automatically", "Line up targets above you", "FIRE", False), ("Read warning lanes", "Exit striped telegraphs", "DODGE", False), ("Collect equipment", "Fly through the capsule", "PICKUPS", False)])
        button(frame, "To Stage Select", 22, h - 72, w - 44)
    elif state == "settings":
        header(frame, "Settings", "FLIGHT SYSTEMS")
        list_rows(frame, [("Music", "", "ON", False), ("Sound effects", "", "ON", False), ("Reduced motion", "Fewer flashes and less shake", "OFF", False), ("High contrast hazards", "Brighter outlines and warnings", "ON", False), ("Drag sensitivity", "", "STANDARD", False)])
        button(frame, "Flight school", 22, h - 72, w - 44, primary=False)
    else:
        states = {
            "defeat": ("Flight lost", "Vesper Orbit  ·  2,430 score\n+11 Salvage banked", "Retry Vesper Orbit", "Stages", "DEFEAT"),
            "clear": ("Stage clear", "Warden down.\n+78 first-clear Salvage", "Next · Asteroid Belt", "Replay stage", "VESPER ORBIT"),
            "stage_unlock": ("Asteroid Belt open", "Stage 02 · Thread the debris lanes.", "Launch Asteroid Belt", "View route", "STAGE UNLOCKED"),
            "ship_unlock": ("Interceptor unlocked", "Precision interceptor.\nFast steer · focused center fire.", "Inspect in hangar", "Next stage", "SHIP UNLOCKED"),
            "purchase": ("Calibrated Rails", "+8% weapon damage on every ship.\n70 Salvage", "Install for 70", "Back to upgrades", "UPGRADE"),
            "endless_end": ("New survival best", "06:42  ·  21,030 score\nInterceptor · Standard", "Fly again", "Stage Select", "ENDLESS"),
            "offline": ("Save unavailable", "The flight can continue.\nLocal storage is currently blocked.", "Retry saving", "Back to title", "DEVICE STORAGE"),
            "offline_ready": ("Offline play ready", "Stages and ships are available.\nRecords are saved on this device.", "Stage Select", "Settings", "CONNECTION LOST"),
            "offline_pack": ("Flight pack missing", "Reconnect to download stages.\nYour device save is kept separately.", "Reload", None, "CONNECTION LOST"),
            "finale": ("The Flagship", "The Dominion's relay network is down.\nAll Arcade stages can be replayed.", "Stage Select", "Flight records", "CAMPAIGN COMPLETE"),
        }
        panel(frame, *states[state])
        if state == "clear":
            button(frame, "Stages", 39, max(118, round(h * .32)) + 293, w - 78, primary=False)
    return frame


def sheet(size, cols, filename):
    tw, th = size
    tw = round(tw * .62)
    th = round(th * .62)
    margin = 26
    stride = th + 47
    rows = (len(SCREENS) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * (tw + margin) + margin, rows * stride + 96), BASE)
    draw = ImageDraw.Draw(canvas)
    title(draw, "STELLAR REBELS", margin, 22, 38)
    label(draw, f"SCREEN CONCEPTS  /  {size[0]} × {size[1]}", margin, 70, ORANGE)
    folder = DEST / f"{size[0]}x{size[1]}"
    folder.mkdir(parents=True, exist_ok=True)
    for i, (name, (caption, state)) in enumerate(SCREENS.items()):
        frame = compose(state, size).convert("RGB")
        frame.save(folder / (name + ".jpg"), quality=90, optimize=True, subsampling=0)
        x = margin + i % cols * (tw + margin)
        y = 101 + i // cols * stride
        canvas.paste(frame.resize((tw, th), Image.Resampling.LANCZOS), (x, y))
        draw.rectangle((x - 1, y - 1, x + tw, y + th), outline=EDGE)
        short = name[:2] + "  " + caption
        if len(short) > 31:
            short = short.split(" / ")[0]
        label(draw, short, x, y + th + 10, WHITE, size=10)
    canvas.save(DEST / filename, quality=93, optimize=True, subsampling=0)


if __name__ == "__main__":
    sheet((390, 844), 5, "contact-tall.jpg")
    sheet((320, 568), 5, "contact-compact.jpg")
    brands = Image.new("RGBA", (960, 380), BASE)
    draw = ImageDraw.Draw(brands)
    title(draw, "STELLAR REBELS / MARK STUDIES", 30, 25, 32)
    for pos, name, description in ((165, "flare", "Flare · primary direction"), (480, "orbit", "Orbit · flight path"), (795, "pennant", "Pennant · squadron mark")):
        paste_contain(brands, BRAND / f"{name}-stacked.png", (pos, 185), (240, 172))
        label(draw, description, pos, 310, WHITE, anchor="mt")
    brands.convert("RGB").save(DEST / "brand-studies.jpg", quality=95)
