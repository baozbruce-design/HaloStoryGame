# Enemy Sprite Atlas

Generated enemy battle art used by the current tactical map.

## Files
- time_guard_4dir.png — 逆時守衛／重裝兵
- frost_crossbow_4dir.png — 霜刻弩手／弩兵
- time_mage_4dir.png — 時間術士／術士
- clock_knight_4dir.png — 時鐘騎士／隊長

## Common format
- 1536 × 1536 PNG
- 2 × 2 equal cells
- transparent background
- FFT-inspired slightly dimensional chibi tactical-RPG style

## Runtime direction mapping
Standard atlases:
- S/front = top-left
- E/right = top-right
- N/back = bottom-right
- W/left = bottom-left

Frost Crossbowman:
- S/front = top-left
- E/right = top-right
- N/back = bottom-left
- W/left = mirrored top-right

The crossbowman's left-facing view is mirrored at runtime because the generated sheet did not contain a clean left-side pose.
