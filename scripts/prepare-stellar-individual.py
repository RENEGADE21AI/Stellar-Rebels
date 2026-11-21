"""Bake separately generated source art into the arena's calibrated sprite frames."""
from pathlib import Path
import json

from PIL import Image, ImageChops, ImageEnhance, ImageOps
from build_wraith_realms import build_variant


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'source-art' / 'stellar' / 'individuals'
MEDIA = ROOT / 'arcade' / 'media'
ENVIRONMENTS = ('cover-space', 'vesper-playfield', 'belt-playfield', 'relay-playfield', 'sun-playfield',
                'outer-playfield', 'fleet-playfield')


def opaque_bounds(image):
    return image.getchannel('A').point(lambda pixel: 255 if pixel >= 145 else 0).getbbox()


def condition_art(source, key):
    brightness = {'scout':1.24, 'splitter':1.18, 'shard':1.22, 'phantom':1.14, 'wraith':1.11}.get(key, 1.05)
    color = ImageEnhance.Color(source.convert('RGB')).enhance(.91 if key.startswith('pickup-') else .72)
    color = ImageEnhance.Brightness(color).enhance(brightness)
    color.putalpha(source.getchannel('A'))
    return color


def write_sprites():
    frames = json.loads((SOURCE / 'frames.json').read_text(encoding='utf-8'))
    for key, (size, left, top, right, bottom) in frames.items():
        with Image.open(SOURCE / (key + '.webp')) as opened:
            source = opened.convert('RGBA')
        bounds = opaque_bounds(source)
        if not bounds or source.getchannel('A').getextrema()[0] == 255:
            raise ValueError(f'{key} needs an alpha cutout')
        source = condition_art(source.crop(bounds), key)
        source = source.resize((right-left, bottom-top), Image.Resampling.LANCZOS)
        frame = Image.new('RGBA', (size, size))
        frame.paste(source, (left, top))
        frame.save(MEDIA / 'sprites' / (key + '.png'), optimize=True)
        if key == 'wraith':
            build_variant(frame, 'ghost').save(MEDIA / 'sprites' / 'wraith-ghost.png', optimize=True)


def write_environments():
    for key in ENVIRONMENTS:
        with Image.open(SOURCE / (key + '.webp')) as source:
            shot = ImageOps.fit(source.convert('RGB'), (576,1152), Image.Resampling.LANCZOS)
        shot.save(MEDIA / 'environment' / (key + '.webp'), quality=86, method=6)


def write_wordmark():
    with Image.open(SOURCE / 'title-wordmark.webp') as source:
        mark = source.convert('RGBA')
    mark.thumbnail((768, 768), Image.Resampling.LANCZOS)
    mark.save(MEDIA / 'brand' / 'title-wordmark.webp', quality=92, method=6)


def write_variants():
    sprites = MEDIA / 'sprites'
    for path in sorted((SOURCE / 'variants').glob('*.webp')):
        key = path.stem
        with Image.open(sprites / (key + '.png')) as base_file, Image.open(path) as source_file:
            base = base_file.convert('RGBA')
            source = source_file.convert('RGBA')
        bounds = opaque_bounds(source)
        if not bounds:
            raise ValueError(f'{key} variant needs an alpha cutout')
        left, top, right, bottom = opaque_bounds(base)
        fitted = condition_art(source.crop(bounds), key).resize((right-left, bottom-top), Image.Resampling.LANCZOS)
        detail = Image.new('RGBA', base.size)
        detail.paste(fitted, (left, top))
        # Preserve each role's silhouette, collision mask, and existing transparent edge.
        alpha = base.getchannel('A')
        coverage = ImageChops.multiply(detail.getchannel('A'), alpha).point(lambda a: a * 4 // 5)
        recolored = Image.composite(detail.convert('RGB'), base.convert('RGB'), coverage)
        recolored.putalpha(alpha)
        recolored.save(sprites / (key + '-alt.webp'), quality=90, method=6)


if __name__ == '__main__':
    write_sprites()
    write_environments()
    write_wordmark()
    write_variants()
