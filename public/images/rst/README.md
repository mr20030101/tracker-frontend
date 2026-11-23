# RST (Robotics Special Tasker) - logo assets

Sister brand to Grey Owls Tracker: same palette, same eye construction, same Space Grotesk wordmark.
Every SVG has the wordmark converted to outlines, so nothing depends on a font being installed.
Transparent backgrounds except icon tiles.

## svg/
| File | Use |
| --- | --- |
| `logo-horizontal.svg` | Default. Site header, docs, email signature. |
| `logo-horizontal-inverse.svg` | Same lockup on dark grounds (looks blank on white - that's correct). |
| `logo-horizontal-mono.svg` | One colour, inherits `currentColor` from CSS (looks black until a `color` is set). |
| `logo-stacked.svg` | Narrow/square spaces. |
| `mark.svg`, `mark-inverse.svg`, `mark-mono.svg` | Robot mark alone: colour, on dark, one-colour. |
| `mark-small.svg` | Simplified cut for 44px and below (no ears or mouth, bigger eyes). |
| `wordmark*.svg` | Type only - documents, legal. |

## icons/
PNG + SVG at 16, 32, 180 (Apple touch), 192, 512, a yellow 512 alternate, and multi-resolution `favicon.ico`.
Paste `favicon-snippet.html` into your `<head>`.

## print/
Vector PDF and EPS: full colour, one-ink (ink or black), reverse, stacked, mark.

## pattern/
Seamless background tiles (light, dark, on-accent, strong). Use at 6-8% strength in headers, empty
states, login screens and 404s - never behind body copy.

## brand-tokens.css
CSS custom properties for the palette.

## Colour
| Role | Hex | CMYK (approx.) | Use |
| --- | --- | --- | --- |
| Ink | `#32373F` | 21/13/0/75 | Mark body, headings |
| Sub | `#5A626D` | 17/10/0/57 | Secondary text, tagline |
| Accent | `#F5B301` | 0/27/100/4 | Antenna, eyes, mouth — fills only |
| Accent text | `#8A6200` | 0/29/100/46 | Links/text in the accent hue on light grounds |
| Light | `#F6F7F8` | 1/0/0/3 | Page background; mark body on dark |
| Mist | `#D8DCE1` | 4/2/0/12 | Rules, borders |

CMYK values are arithmetic conversions, not press-matched. Check the yellow against a physical
swatch book before a print run - saturated yellows shift the most between screen and press.

## Rules
- Clear space on all sides = half the mark's height.
- Minimums: mark 24px / 8mm; full lockup 112px / 30mm wide. Below that, use the mark alone.
- Yellow `#F5B301` never carries text on light grounds - use `#8A6200`.
- Don't stretch, recolour, tilt, or place on a busy or low-contrast ground.
