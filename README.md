# 海猫笔记（SeaCat Note）

一个基于 **Tauri 2 + React + TypeScript + Rust + SQLite** 的本地桌面笔记应用。  
支持普通笔记、Markdown、脑图，以及带二次解锁的保险箱内容管理。

这份代码包已经整理成适合上传到 GitHub 的结构，包含：
- 适合公开仓库的 `README.md`
- 更完整的 `.gitignore`
- 统一的 `.gitattributes`
- 保留现有 Tauri / React / Rust 工程结构

## 当前版本

这份包基于你当前整理后的版本，已包含近两次改动：
- 富文本 **行高下拉**
- 富文本 **字号选择修复**

## 功能概览

### 笔记功能
- 普通富文本笔记
- Markdown 笔记
- 脑图笔记
- 分类与子分类
- 面包屑路径导航
- 列表/目录视图切换

### 富文本编辑
- 字体
- 字号
- 加粗 / 斜体 / 下划线 / 删除线
- 文字颜色 / 背景色
- 列表
- 对齐
- 表格
- 图片插入
- 行高调节

### 保险箱
- 独立保险箱数据库
- 主密码 / 二次解锁
- 安全笔记管理
- 与普通笔记区域分离

### 脑图
- 集成 `simple-mind-map`
- 支持主题与结构切换
- 支持节点样式调整
- 支持节点操作与基础编辑

## 技术栈

### 前端
- React 18
- TypeScript
- Vite

### 桌面容器
- Tauri 2

### 后端
- Rust
- rusqlite
- argon2
- aes-gcm-siv

### 数据存储
- SQLite 本地数据库

## 项目结构

```text
.
├── src/                  # React 前端
├── src-tauri/            # Tauri / Rust 端
├── branding/             # 图标与品牌素材
├── index.html
├── package.json
├── vite.config.ts
└── README.md
```

## 本地开发

### 1. 安装前置环境
请先准备：
- Node.js
- Rust
- Cargo
- Tauri 2 开发环境
- macOS 或 Windows 对应的 Tauri 打包依赖

### 2. 安装依赖
```bash
npm install
```

### 3. 启动开发模式
按你习惯的方式，直接使用：

```bash
cargo tauri dev
```

如果你只想先看前端，也可以：

```bash
npm run dev
```

## 构建

### 前端构建
```bash
npm run build
```

### 桌面打包
```bash
cargo tauri build
```

## 版本与配置说明

当前仓库内可见的关键版本：

- 前端包版本：`0.76.0`
- Tauri 配置版本：`0.76.0`
- Rust 包版本：`0.33.0`

如果你后续准备长期维护，建议下次整理时统一这几个版本号。

## GitHub 上传建议

建议新建一个公开或私有仓库后，把这个包内容全部放进去，再执行：

```bash
git init
git add .
git commit -m "init: seacat-note github ready package"
```

然后关联你的远端仓库：

```bash
git remote add origin 你的仓库地址
git branch -M main
git push -u origin main
```

## 不建议提交到 GitHub 的内容

这些内容已经在 `.gitignore` 中处理：
- `node_modules`
- `dist`
- `target`
- `src-tauri/target`
- 数据库文件
- 本地日志
- `.DS_Store`
- IDE 配置目录
- 打包产物（`.dmg` / `.msi` / `.exe` / `.app`）

## 后续建议

如果你下一步准备把这个仓库长期维护下去，建议继续补这几项：
- 统一版本号
- 增加截图
- 增加 changelog
- 增加 LICENSE
- 增加 GitHub Releases 发布说明
- 增加 issue / feature request 模板

## 说明

这是一个以本地数据为核心的桌面笔记项目。  
为了安全，**不要把真实数据库、密码、助记词、私钥、备份包** 上传到 GitHub。

