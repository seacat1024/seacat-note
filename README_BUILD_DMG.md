# SeaCat Note V62 Clean Package

This package is cleaned for local macOS packaging.

## Build DMG on macOS

Run:

```bash
chmod +x BUILD_DMG_MAC.sh
./BUILD_DMG_MAC.sh
```

Generated files will be under:

- `src-tauri/target/release/bundle/dmg/`
- `src-tauri/target/release/bundle/macos/`

## Notes

- DMG packaging must be built on macOS.
- If your local environment already has dependencies installed, you can skip the cleanup steps inside the script and run:
  - `npm install`
  - `npm run build`
  - `cd src-tauri && cargo tauri build`

TypeScript declarations for simple-mind-map plugin imports have been added under `src/types/simple-mind-map.d.ts`.

## Tauri 版本对齐说明

这版已把前端依赖对齐为：

- `@tauri-apps/api = 2.0.0`
- `@tauri-apps/plugin-dialog = 2.0.0`

请先清理旧依赖后重新安装：

```bash
rm -rf node_modules package-lock.json dist src-tauri/target
npm install
npm run build
cd src-tauri
cargo tauri build
```
