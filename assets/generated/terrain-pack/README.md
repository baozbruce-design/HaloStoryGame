# Terrain Pack

Generated battle environment assets currently used by the game.

## Files

- `clocktower_background.png`
  - 1672 × 941
  - Frozen clocktower / Eternal Winter City battle backdrop
  - Drawn behind the tactical grid with a darkened vignette for readability

- `snow_tiles.png`
  - 1254 × 1254
  - Treated as an 8 × 8 atlas
  - Snow, stone, ice, dirt, grass, and snow/ice/stone transitions

- `clocktower_tiles.png`
  - 1254 × 1254
  - Treated as a 10 × 10 atlas
  - Clocktower stone, glowing blue runes, brass gears, altar and mechanical floor variants

- `elevation_tiles.png`
  - 1254 × 1254
  - Treated as an 8 × 8 atlas
  - Snow cliffs, raised platforms, ramps, walls and height-transition art

## Runtime mapping

The game keeps its existing FFT-style logical height grid. Visual terrain is selected deterministically per map tile:

- Shrine tiles → clocktower rune tiles
- Mirror ice tiles → snow/ice atlas
- Central clocktower zone → stone / rune / gear atlas
- Height 4–5 → elevation atlas
- Height 3 → snowy elevation variants
- Height 2 → snow-covered stone
- Height 1 → snow / light vegetation

The atlas is sampled inside each existing 72 × 36 isometric diamond, so gameplay coordinates, Jump, Move, ranges and AI remain unchanged.
