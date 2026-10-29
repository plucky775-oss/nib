# Original notebook cover collection

The original five cover IDs and colors remain unchanged: `midnight`, `ivory`,
`slate`, `clay`, `lavender`. Ten additional fixed, original geometric designs add
color blocks, fine stripes, framed labels, a grid, an arch, speckles and circular
accents. Navy, ivory, clay and muted blue are the main palette; green is not a
collection-wide accent.

## Direction references

These official stationery pages were reviewed for broad product/category direction
(minimal layouts, color variety and notebook identity), not copied as artwork:

- [Papier Colourblock](https://www.papier.com/colourblock-36617)
- [Papier minimal notebooks](https://www.papier.com/us/all-notebooks-journals/minimal)
- [LEUCHTTURM1917 notebook editions](https://www.leuchtturm1917.us/collections/notebook-editions)

No reference image, full cover design, logo, trademark or remote asset is embedded.
All patterns are original deterministic SVG primitives generated locally in
`src/notebook-covers.js`, with a strict ID allowlist and bounded output.

## Rendering and data boundaries

`applyCoverAppearance` is shared by the notebook editor, cover-picker swatches and
library grid/list cards. User titles remain DOM text, never SVG/HTML. Background
SVG contains only internal fixed geometry and palette constants. Metadata stores
only the existing `cover` ID field, so legacy notes retain their identity and new
IDs survive JSON backup/import. Selecting a cover does not alter a page's `paper`,
`paperTheme`, strokes, converted text, font, timestamps or page order.

`cover-design-contact-sheet.svg` / `.png`, when generated during local QA, use the
exact background renderer with illustrative title overlays. They check the design
palette and geometry, not browser layout or native focus behavior.
