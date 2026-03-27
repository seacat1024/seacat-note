# 🐱 Seacat Note（海猫笔记）

一款本地优先、安全、可扩展的桌面笔记工具  
Built with **Tauri + Rust + React + TypeScript**

---

## ✨ 特性

- 📝 富文本编辑（支持行高 / 字号 / 样式）
- 🔐 保险箱（敏感信息独立加密存储）
- 🧠 思维导图（simple-mind-map 集成）
- 💾 本地 SQLite 存储
- ⚡ 高性能（Rust 后端）
- 🌙 深色 / 浅色模式

---

## 📸 预览

> 建议你在这里放几张截图（主界面 / 编辑器 / 保险箱）

---

## 🚀 快速开始

```bash
npm install
cargo tauri dev
```

---

## 📦 打包

```bash
cargo tauri build
```

---

## 📁 项目结构

```
src/            前端 React
src-tauri/      Rust 后端
```

---

## 🔒 数据安全

- 所有数据本地存储
- 保险箱采用独立加密机制
- 不上传任何用户数据

---

## 📜 License

MIT License
