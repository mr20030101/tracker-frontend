# Owl background pattern

Seamless tiles, 120 x 120. Owls sit on a half-drop diagonal lattice and each one is
rotated -18 degrees. The tile wraps in both directions, so `background-repeat` shows
no seam at any size.

| File | For |
| --- | --- |
| `owls-tile-light.svg` | Light grounds — Paper, white. Owl Grey at 7%. |
| `owls-tile-dark.svg` | Dark grounds — Owl Grey, black. White at 7%. |
| `owls-tile-mist.svg` | Light grounds, more visible. Slate at 16%. |
| `owls-tile-beacon.svg` | On Beacon yellow. Owl Grey at 14%. |

All four have a transparent background, so the colour underneath shows through and
through the knocked-out eyes.

## Use

```css
.hero {
  background-color: var(--go-paper);
  background-image: url("/pattern/owls-tile-light.svg");
  background-repeat: repeat;
  background-size: 120px 120px;   /* 80px denser, 180px airier */
}
```

Change `background-size` to rescale — it stays seamless at any value, as long as
both numbers match.

## Keep it quiet

This is texture, never content. Don't run it behind body copy: at 7% it is safe
under headings and empty states, but any pattern under small text costs legibility.
Use it on hero bands, empty states, card backs, login screens and 404s, and leave
the reading surfaces plain.
