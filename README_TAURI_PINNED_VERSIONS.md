# Exact Tauri version pins

This package pins Rust crate versions with `=` so Cargo does not float to newer minor versions.

Pinned:
- tauri-build = `=2.5.6`
- tauri = `=2.8.5`
- tauri-plugin-dialog = `=2.4.0`
- @tauri-apps/api = `2.8.0`
- @tauri-apps/plugin-dialog = `2.4.0`
- @tauri-apps/cli = `2.8.0`

Before building, run:

```bash
rm -rf node_modules package-lock.json
cd src-tauri
rm -f Cargo.lock
cd ..
npm install
cargo update
cargo tauri build
```
