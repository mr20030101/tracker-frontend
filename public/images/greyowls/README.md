# Grey Owls Tracker — logo assets

Every SVG has the wordmark converted to outlines, so nothing depends on a font being
installed. All artwork is on a transparent background unless it is an icon tile.

## svg/
| File | Use |
| --- | --- |
| `logo-horizontal.svg` | Default. Site header, docs, email signature. |
| `logo-horizontal-inverse.svg` | The same lockup on dark grounds. |
| `logo-horizontal-mono.svg` | One colour, inherits `currentColor` from CSS. |
| `logo-stacked.svg` | Narrow spaces — sidebars, square placements. |
| `mark.svg` | Owl alone, full colour. |
| `mark-inverse.svg` | Owl alone on dark. |
| `mark-mono.svg` | Owl alone, one colour via `currentColor`. |
| `mark-small.svg` | Below 44 px: fatter eyes, no beak. Use for favicons. |
| `wordmark.svg` / `wordmark-inverse.svg` | Type only. |

`currentColor` files take their colour from CSS:

```html
<span style="color: var(--go-ink)">
  <!-- inline the contents of logo-horizontal-mono.svg here -->
</span>
```

## icons/
PNG and SVG at every size a web app asks for, plus a multi-resolution `favicon.ico`
(16/32/48). `icon-512-beacon` is the yellow-ground alternate.

Drop `favicon-snippet.html` into your `<head>`.

## Rules worth keeping
- Clear space on all four sides = half the mark's height.
- Minimum sizes: mark 24 px, full lockup 112 px wide.
- Beacon `#F5B301` never carries text on a light background — use Ember `#8A6200`.
- Don't stretch, recolour, tilt, or place the logo on a low-contrast ground.

Fonts: Space Grotesk (display/wordmark) and IBM Plex Sans + IBM Plex Mono (UI, figures).
All three are on Google Fonts under the SIL Open Font License.
