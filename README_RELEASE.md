# 海猫笔记 v0.76.0 收尾版

这版整理了两件事：

1. 清理了源码里的明显调试输出与部分空注释。
2. 构建脚本已内置图标生成步骤，避免 macOS 打包时再次出现：
   `Failed to create app icon: No matching IconType`

## 推荐构建方式

```bash
chmod +x BUILD_DMG_MAC.sh
./BUILD_DMG_MAC.sh
```

脚本会自动执行：

1. 清理旧依赖和构建产物
2. `npm install`
3. `npx @tauri-apps/cli@2.0.0 icon branding/seacat-notes-icon.png`
4. `npm run build`
5. `cargo tauri build`

## 当前版本

- 应用名：海猫笔记
- 英文名：SeaCat Note
- 作者：海猫
- 版本：0.76.0
