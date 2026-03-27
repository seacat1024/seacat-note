# SeaCat Note 完整包

这个包包含：

1. 已修复并可本地构建的完整源码
2. 已对齐 Tauri 2.0.0 的前端依赖
3. macOS 本地打 DMG 脚本
4. 海猫笔记 Logo 与图标素材

## 推荐构建步骤

```bash
rm -rf node_modules package-lock.json dist src-tauri/target
npm install
npm run build
cd src-tauri
cargo tauri build
```

或：

```bash
chmod +x BUILD_DMG_MAC_ALIGNED.sh
./BUILD_DMG_MAC_ALIGNED.sh
```


## 图标替换说明

这版已把 `src-tauri/icons/icon.png` 直接替换为 SeaCat Notes 新图标。
如果 macOS 仍显示旧图标，请先删除旧的 `.app` 和旧的 DMG，再重新构建与安装。


## V69 版本对齐

这版前端依赖重新对齐到 Rust 侧 2.0.0：
- @tauri-apps/api = 2.0.0
- @tauri-apps/plugin-dialog = 2.0.0
