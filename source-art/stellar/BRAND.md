# Stellar Rebels brand assets

Flare is the primary mark. The upward ceramic wings bracket an ember core and hold their profile without color. The slanted stacked wordmark is used on the portrait title. Use the horizontal wordmark on wide surfaces and the emblem where the full name already appears nearby.

| Color | Hex | Role |
| --- | --- | --- |
| Ivory | `#fff0db` | Wordmark, hull plates and primary copy |
| Ember | `#ff7848` | Emblem core and primary actions |
| Ink | `#131e2b` | Dark treatment, outlines and instrument panels |
| Signal | `#78efdb` | Friendly equipment and positive feedback |

Keep at least the emblem core’s width clear around each lockup. Use the standalone emblem below a 120 CSS pixel wordmark width. Full-color light suits dark art. Full-color dark suits ivory or white. Use the respective monochrome variant on limited-color surfaces. The square app icon keeps the critical mark in its mask-safe center. It has an opaque field. Wordmark and emblem PNGs use straight alpha.

The editable masters are SVG paths in `brand/`. The source generator is `scripts/stellar-brand.py`. The outlined typography is based on OFL-licensed Barlow Condensed Bold with a deliberate flight slant and adjusted proportions. License and type source are in `type/`. Run the generator with `--production`, followed by `node scripts/stellar-rasterize.js --production`, to reproduce the transparent raster exports and the 32, 180, 192, 512 and 1024 px install icons.
