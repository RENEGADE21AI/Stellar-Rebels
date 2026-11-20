"""Make the illustrated stage plates used behind the live combat renderer."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'source-art' / 'stellar' / 'studies'
OUTPUT = ROOT / 'arcade' / 'media' / 'environment'

for name, plates in (('inner-orbit-atlas', ('belt', 'relay', 'sun')),
                     ('outer-orbit-atlas', ('outer', 'fleet'))):
    with Image.open(SOURCE / f'{name}.jpg') as atlas:
        for index, plate in enumerate(plates):
            left = round(index * atlas.width / len(plates)) + 1
            right = round((index + 1) * atlas.width / len(plates)) - 1
            panel = atlas.crop((left, 0, right, atlas.height))
            panel = panel.resize((512, 1024), Image.Resampling.LANCZOS)
            panel.save(OUTPUT / f'{plate}-playfield.webp', quality=87, method=6)
