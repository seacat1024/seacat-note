
# 海猫笔记（SeaCat Note）— 最终工程交接版

版本：v0.76.x  
状态：✅ 可开发 / 可打包 / 可发布 / 可自动构建

-------------------------------------

# 🧠 一、下次如何继续开发（非常重要）

当你开启一个新的 ChatGPT 会话，请按下面步骤：

## ① 上传本工程 zip

👉 直接上传整个项目压缩包

## ② 复制这段话作为开场（非常关键）

这是我的 Tauri 桌面应用项目（海猫笔记 SeaCat Note）

当前状态：
- 已完成 Mac / Windows 打包
- 已有：富文本 / Markdown / 脑图 / 保险箱
- 已有：设置页 / 关于页 / 工具栏优化
- 使用 Tauri 2.0.0
- 当前版本 v0.76.x

请基于当前工程继续开发，不要重建项目。

我要做的改动是：
（写你的需求）

-------------------------------------

# 🚀 二、开发运行方式

```bash
npm install
npm run tauri:dev
```

-------------------------------------

# 🍎 三、Mac 打包（DMG）

```bash
chmod +x BUILD_DMG_MAC.sh
./BUILD_DMG_MAC.sh
```

产物：

src-tauri/target/release/bundle/dmg/

-------------------------------------

# 🪟 四、Windows 打包（EXE）

必须在 Windows 上执行：

```bash
npm install
npx @tauri-apps/cli@2.0.0 icon branding/seacat-notes-icon.png
npm run build
cd src-tauri
cargo tauri build
```

产物：

src-tauri\target\release\bundle\nsis\

-------------------------------------

# 🌍 五、自动发布（GitHub）

```bash
git tag v0.76.0
git push origin v0.76.0
```

-------------------------------------

# ⚠️ 六、常见问题

icon 报错：

必须执行：

```bash
npx @tauri-apps/cli@2.0.0 icon branding/seacat-notes-icon.png
```

-------------------------------------

作者：海猫
