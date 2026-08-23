# FolioPause brand and asset provenance

This document records where the FolioPause identity came from and which assets
are safe to ship. It is a provenance record, not a trademark clearance or legal
opinion.

## Identity

**Name:** FolioPause  
**Tagline:** Swipe fast. Pause before Trash.  
**Created in-repository:** 24 August 2026

“Folio” represents a collection of images. “Pause” represents the mandatory
review checkpoint before anything moves to Trash.

The exact name received a preliminary public-web search on the creation date,
including exact-name queries scoped to the Chrome Web Store, USPTO, and EUIPO;
no exact result surfaced. This was not a formal database clearance and is not a
substitute for professional trademark advice before a large commercial launch.

## Product mark

The master asset is [`extension/icons/icon.svg`](extension/icons/icon.svg). It
was created directly as SVG from simple geometric primitives for this project;
no stock image, traced logo, generated bitmap, host-page asset, or third-party
icon file was used.

The mark combines:

1. a mint rounded sheet, rotated eight degrees counter-clockwise;
2. a violet front sheet with an ink outline; and
3. two ink rounded bars forming a pause symbol.

This “folio plus pause” construction is intentionally different from the
Google Photos pinwheel and the Google “G”. The same geometry appears in the
extension toolbar, the in-app header, and the page launcher.

The committed PNGs are raster exports of that SVG at 16, 32, 48, and 128
pixels. They can be reproduced with ImageMagick:

```bash
for size in 16 32 48 128; do
  magick -background none -density 768 extension/icons/icon.svg \
    -resize "${size}x${size}" -depth 8 \
    "PNG32:extension/icons/icon${size}.png"
done
```

## Palette

| Token | Hex | Use |
|---|---|---|
| Ink Navy | `#172033` | mark outline and pause bars |
| Folio Violet | `#7667F5` | front folio sheet and primary identity |
| Pause Mint | `#58D6B2` | offset sheet and positive/safe states |

The application expands this independent palette with neutral navy surfaces,
accessible violet accents, mint confirmation states, and non-Google coral
destructive states. Exact Google brand red, yellow, blue, green, and Google
Sans are prohibited by the automated brand audit.

## Typography and interface icons

FolioPause uses only the operating system's UI font stack:

```css
system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

No font file is bundled or downloaded. Interface icons are project-native
24-pixel line paths stored in [`src/20-dom.js`](src/20-dom.js); there is no
external icon package or copied host-page SVG.

## Release guard

[`test/brand-audit.js`](test/brand-audit.js) checks production source and
distributable text assets, all five extension locales, the SVG construction,
and the presence and dimensions of every required raster icon. It rejects the
removed Google font, Google-associated color values, and third-party identity
claims during `npm run check`.

## Licensing and trademark notice

The original FolioPause source and artwork files are distributed under the
project's [MIT License](LICENSE). That copyright license does not grant anyone
the right to misrepresent a modified build as an official FolioPause release or
to imply endorsement by another company.

Google Photos is a trademark of Google LLC. FolioPause is an independent
project and is not affiliated with, sponsored by, or endorsed by Google.
