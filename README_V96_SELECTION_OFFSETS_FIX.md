# V96 selection offsets fix

This package fixes the remaining cursor jump-to-start issue by saving editor selection as character offsets,
not only as a DOM Range clone. That makes restoration more stable even after editor HTML is persisted and rerendered.

## Fixes
- cursor no longer jumps to the first character after changing font size / line height
- selection restore survives editor rerender better
- keeps working exact Tauri pins
- keeps previous dropdown, last-line, and caret-size fixes
