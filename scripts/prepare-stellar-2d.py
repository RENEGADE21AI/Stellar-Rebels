from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

from build_wraith_realms import build_variant


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'source-art' / 'stellar' / '2d'
LEGACY = ROOT / 'assets' / 'sprites'
SPRITES = ROOT / 'arcade' / 'media' / 'sprites'
ENVIRONMENT = SPRITES.parent / 'environment'

TL, TR = (0, 0, 627, 627), (627, 0, 1254, 627)
BL, BR = (0, 627, 627, 1254), (627, 627, 1254, 1254)

# Output side in pixels, in-game cell side, and source center and scale in world units.
# Gun, exhaust, rail and module coordinates in the game use this same transform.
BOARDS = {
    'fleet': [
        ('needle', TR, 300, 59, (941, 312), .098),
        ('bastion', BL, 320, 68, (315, 908), .113),
        ('shield-node', BR, 164, 43, (941, 919), .081),
    ],
    'fighters': [
        ('diver', TR, 192, 42, (941, 308), .069),
        ('sweeper', BL, 208, 56, (315, 931), .086),
        ('relay', BR, 208, 55, (940, 929), .081),
    ],
    'command': [
        ('gatekeeper', TL, 472, 267, (318, 278), .355),
        ('warden', TR, 416, 242, (940, 302), .393),
        ('matron', BL, 438, 246, (318, 871), .331),
        ('tyrant', BR, 438, 245, (929, 881), .258),
    ],
    'hardware': [
        ('crown', (0, 0, 666, 627), 456, 258, (343, 230), .323),
        ('siphon', (666, 0, 1254, 627), 416, 247, (941, 332), .374),
        ('lancer', BL, 208, 52, (343, 880), .092),
        ('turret', BR, 168, 43, (939, 868), .083),
    ],
}

# Connect the empty sockets to the authored module targets. Outside wings taper back to the original silhouette.
SOCKET_COLUMNS = {
    'matron': [(0, -121), (171, -70), (317, 0), (467, 70), (627, 121)],
    'crown': [(0, -123), (177, -74), (343, 0), (509, 74), (666, 123)],
}


def isolated_foreground(rgba):
    """Keep the connected silhouette and its antialiasing. Drop soft sheet haze and stray specks."""
    raw = rgba.getchannel('A')
    mask = raw.point(lambda value: 255 if value >= 155 else 0)
    interior = mask.getbbox()
    if not interior:
        raise ValueError('The sprite has no opaque foreground')
    count = 0
    for y in range(interior[1], interior[3]):
        for x in range(interior[0], interior[2]):
            if mask.getpixel((x, y)) != 255:
                continue
            count += 1
            ImageDraw.floodfill(mask, (x, y), count)
            if count == 240:
                raise ValueError('Too many opaque objects in the source cell')
    confidence = mask.histogram()
    best = max(range(1, count + 1), key=confidence.__getitem__)
    hull = mask.point(lambda value: 255 if value == best else 0).filter(ImageFilter.MaxFilter(5))
    alpha = raw.point(lambda value: max(0, min(255, round((value - 38) * 255 / 213))))
    rgba.putalpha(ImageChops.multiply(alpha, hull))
    return rgba


def frame(rgba, side, world, center, scale, origin=(0, 0), columns=None):
    if center is None:
        left, top, right, bottom = rgba.getchannel('A').getbbox()
        center = (origin[0] + (left + right) / 2, origin[1] + (top + bottom) / 2)
        scale = scale / max(right - left, bottom - top)
    rate = side / world
    top = center[1] - origin[1] - world / (2 * scale)
    if columns is None:
        left = center[0] - origin[0] - world / (2 * scale)
        return rgba.transform((side, side), Image.Transform.AFFINE,
                              (1 / (rate * scale), 0, left, 0, 1 / (rate * scale), top), Image.Resampling.BICUBIC)
    result = Image.new('RGBA', (side, side))
    for (source_left, offset_left), (source_right, offset_right) in zip(columns, columns[1:]):
        left = round(side / 2 + offset_left * rate)
        right = round(side / 2 + offset_right * rate)
        strip = rgba.transform((right - left, side), Image.Transform.AFFINE,
                               ((source_right - source_left) / (right - left), 0, source_left - origin[0],
                                0, 1 / (rate * scale), top), Image.Resampling.BICUBIC)
        result.paste(strip, (left, 0))
    return result


def write(name, image):
    hull = image.getchannel('A').point(lambda value: 255 if value >= 128 else 0).getbbox()
    if not hull or min(hull[0], hull[1], image.width - hull[2], image.height - hull[3]) < 3:
        raise ValueError(f'{name} sprite is empty or clipped: {hull}')
    image.save(SPRITES / f'{name}.png', optimize=True)


def repair_palette(image):
    hsv = image.convert('HSV')
    alpha = image.getchannel('A')
    hsv.putdata([(107 if 132 <= hue <= 201 and saturation >= 66 else hue, saturation, value)
                 for hue, saturation, value in hsv.getdata()])
    rgb = hsv.convert('RGB')
    rgb.putalpha(alpha)
    return rgb


def main():
    for sheet, units in BOARDS.items():
        source = Image.open(SOURCE / f'{sheet}.png').convert('RGBA')
        for name, box, side, world, center, scale in units:
            unit = isolated_foreground(source.crop(box))
            write(name, frame(unit, side, world, center, scale, box[:2], SOCKET_COLUMNS.get(name)))

    legacy = [
        ('kestrel', 'player', 300, 58, (248.5, 256), .101, False),
        ('scout', 'enemy-red', 192, 43, (224, 191.5), .091, True),
        ('escort', 'enemy-shieldbearer', 224, 54, (224, 203), .099, False),
        ('phantom', 'enemy-phantom', 224, 59, (212, 225), .101, True),
        ('rock', 'asteroid-rock-1', 152, 42, (155, 160), .099, False),
    ]
    for name, file, side, world, center, scale, invert in legacy:
        sprite = Image.open(LEGACY / f'{file}.png').convert('RGBA')
        if invert:
            sprite = sprite.transpose(Image.Transpose.ROTATE_180)
        write(name, frame(sprite, side, world, center, scale))
        if name == 'kestrel':
            craft = frame(sprite, 720, 59, center, .105)
            craft = craft.rotate(-8, resample=Image.Resampling.BICUBIC)
            craft.save(ENVIRONMENT / 'title-craft.webp', quality=90, method=6)
    with Image.open(SOURCE / 'cruiser.png') as cruiser:
        write('cruiser', frame(isolated_foreground(cruiser.convert('RGBA')), 410, 214, (1065, 316), .098))
    with Image.open(SOURCE / 'wraith-refined.png') as wraith:
        physical = frame(isolated_foreground(wraith.convert('RGBA')), 430, 215, (929, 332), .102)
        ghost = build_variant(physical, 'ghost')
        assert physical.getchannel('A').tobytes() == ghost.getchannel('A').tobytes()
        write('wraith', physical)
        write('wraith-ghost', ghost)
    for name, source in [('barrier', 'phase-shield'), ('power', 'dual'), ('repair', 'repair'), ('overdrive', 'rapid')]:
        with Image.open(ROOT / 'assets' / 'powerups' / f'{source}.png') as original:
            icon = frame(original.convert('RGBA'), 136, 1, None, .82)
            write(f'pickup-{name}', repair_palette(icon) if name == 'repair' else icon)
    with Image.open(SOURCE / 'outer-orbit.png') as outer:
        image = ImageOps.fit(outer.convert('RGB'), (512, 1024), Image.Resampling.LANCZOS)
        image.save(ENVIRONMENT / 'outer-playfield.webp', quality=85, method=6)


if __name__ == '__main__':
    main()
