# V92 font-size fix

This package keeps the working exact Tauri version pins and fixes the rich-text font-size issue.

## Kept exact version pins
- tauri-build = `=2.5.6`
- tauri = `=2.8.5`
- tauri-plugin-dialog = `=2.4.0`
- @tauri-apps/api = `2.8.0`
- @tauri-apps/plugin-dialog = `2.4.0`
- @tauri-apps/cli = `2.8.0`

## Rich text fixes
- fixed font-size dropdown not taking effect
- fixed nested existing font-size styles overriding the new size
- fixed last-line font-size application edge case
- fixed oversized caret on the last line after resizing text
