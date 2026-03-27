# Tauri version fix

This package updates the Tauri versions so the Rust crates and NPM packages match.

## Updated versions

- `@tauri-apps/api`: `^2.10.3`
- `@tauri-apps/plugin-dialog`: `^2.6.0`
- `@tauri-apps/cli`: `^2.10.3`
- `tauri`: `2.10.3`
- `tauri-build`: `2.10.3`
- `tauri-plugin-dialog`: `2.6.0`

## Recommended commands

```bash
rm -rf node_modules package-lock.json
cd src-tauri
rm -f Cargo.lock
cd ..
npm install
cargo update
cargo tauri build
```
