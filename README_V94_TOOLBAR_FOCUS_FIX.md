# V94 toolbar focus fix

This package keeps the exact working Tauri pins and fixes the remaining editor cursor-jump issue.

## What changed
- toolbar selects and buttons no longer steal focus from the editor on mouse down
- formatting controls now restore the saved selection before acting
- editor blur no longer overwrites the saved range with a wrong collapsed position
- keeps prior fixes for font size, last-line behavior, and caret sizing
