# Bundled Korean fonts

Downloaded on 2026-10-27 directly from the official [`google/fonts`](https://github.com/google/fonts) repository. All five fonts are **WOFF2 containers converted from official originals without subsetting**. Glyph order and complete cmap equality are verified against the originals. Original and WOFF2 sizes/hashes are recorded in fonts.json. No runtime font CDN, API key, or paid service is required.

## Files and licenses

| Font | Original font file | Complete license | Size | Hangul syllables |
| --- | --- | --- | ---: | ---: |
| Nanum Pen Script (나눔손글씨 펜) | [`NanumPenScript-Regular.woff2`](NanumPenScript-Regular.woff2) | [`NanumPenScript-OFL.txt`](NanumPenScript-OFL.txt) — SIL OFL 1.1 | 3,201,664 B | 11,172 / 11,172 |
| Nanum Brush Script (나눔손글씨 붓) | [`NanumBrushScript-Regular.woff2`](NanumBrushScript-Regular.woff2) | [`NanumBrushScript-OFL.txt`](NanumBrushScript-OFL.txt) — SIL OFL 1.1 | 3,564,804 B | 11,172 / 11,172 |
| Gaegu (개구) | [`Gaegu-Regular.woff2`](Gaegu-Regular.woff2) | [`Gaegu-OFL.txt`](Gaegu-OFL.txt) — SIL OFL 1.1 | 3,165,816 B | 2,350 / 11,172 |
| Gamja Flower (감자꽃) | [`GamjaFlower-Regular.woff2`](GamjaFlower-Regular.woff2) | [`GamjaFlower-OFL.txt`](GamjaFlower-OFL.txt) — SIL OFL 1.1 | 12,615,444 B | 11,172 / 11,172 |
| Poor Story (푸어스토리) | [`PoorStory-Regular.woff2`](PoorStory-Regular.woff2) | [`PoorStory-OFL.txt`](PoorStory-OFL.txt) — SIL OFL 1.1 | 3,966,768 B | 11,172 / 11,172 |

## Provenance and integrity

`fonts.json` records original URLs, exact filenames, source paths, sizes, SHA-256 hashes, internal names, glyph counts, and license file hashes. The matching `*-METADATA.pb` files are the original Google Fonts metadata and are included unchanged. Source URLs use the upstream `main` branch and may change later; the manifest hashes identify the exact bundled bytes.

Each `*-OFL.txt` is the **complete downloaded upstream license**, including copyright notices and any Reserved Font Names, not a summary. Retain the applicable license and notices when redistributing the bundled fonts. Font licensing is separate from application licensing. Read those files for the authoritative conditions.

## Integration notes

- Use a local `@font-face` with `font-weight: 400`, `font-style: normal`, `font-display: swap`, and `format("truetype")`.
- A CSS family alias may use `family` from the manifest. Nanum Pen Script's internal family name is `Nanum Pen`; this is normal and does not prevent a CSS alias.
- Gaegu covers 2,350 common precomposed Hangul syllables, not all 11,172 modern syllables. Use another bundled Korean family or the system Korean font as fallback for uncommon syllables and unprovided characters.
- Poor Story is classified `DISPLAY` in upstream metadata; the other four are classified `HANDWRITING`. Poor Story is included as a handwritten-looking alternative requested for this bundle.
- Original TTFs total 26,514,496 bytes. Gamja Flower is the largest (12,615,444 bytes). Load the selected font on demand rather than preloading all five.
- No font outlines, names, metrics, tables, or file formats were changed. No subsets or third-party binary conversions are included.

## Validation performed

- `file` recognized every font as TrueType; all five have the expected sfnt signature `00010000`.
- fontTools 4.61.1 opened and decompiled each font table with checksum checking enabled.
- Original metadata filenames, weight 400, normal style, and OFL declarations were verified.
- Each license contains its copyright notice plus the OFL 1.1 preamble, definitions, conditions, termination, and disclaimer through the final line.
- Unicode character maps were checked for Korean syllable coverage and the sample `안녕하세요 오늘의 메모 한글 손글씨 가나다라마바 사아자차카타파하 123 ABC`; all five contain every sample character.
- No installation, font registration, network publication, or deployment was performed.

The sizes in the table above refer to original TTF inputs; see fonts.json for compressed WOFF2 sizes. Conversion changes the container only, not the font design, names or supported characters. Original TTFs are not duplicated in the repository.
