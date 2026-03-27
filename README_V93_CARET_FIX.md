# V93 caret anchor fix

This package keeps the exact working Tauri pins and fixes the editor caret landing position after changing font size or line height.

## Fixes
- caret no longer jumps to the top-left anchor position after changing formatting
- caret is now restored to the deepest text end inside the edited block
- keeps previous fixes for font-size application on the last line
- keeps the exact pinned Tauri versions that already launch successfully
