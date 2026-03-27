# GitHub Actions 自动构建说明

这个仓库已经带好 `.github/workflows/release.yml`。

## 触发方式

### 1. 手动触发
在 GitHub 仓库页面：
- Actions
- Build and Release
- Run workflow

### 2. 打 tag 自动触发
```bash
git tag v1.0.0
git push origin v1.0.0
```

## 自动构建平台
- macOS
- Windows

## 自动产物
- GitHub Release 草稿
- Actions Artifacts

## 说明
- 工作流会调用 `tauri-apps/tauri-action`
- 使用仓库自带的 `GITHUB_TOKEN`
- 首次建议先用 `workflow_dispatch` 手动跑一遍
- 稳定后再用 tag 发正式版本

## 推荐发布流程
```bash
git add .
git commit -m "chore: add GitHub Actions release workflow"
git push

git tag v1.0.0
git push origin v1.0.0
```
