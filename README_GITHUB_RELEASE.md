# GitHub 自动发布说明

这个包已经加入了 GitHub Actions 工作流：

- `.github/workflows/release.yml`
- `.gitignore`

## 用法

1. 把整个项目推到 GitHub 仓库
2. 提交并推送代码
3. 打标签并推送，例如：

```bash
git tag v0.76.0
git push origin v0.76.0
```

4. GitHub Actions 会自动同时构建：
   - macOS 安装包
   - Windows 安装包

并把产物上传到 GitHub Release。

## 手动触发

也可以在 GitHub 的 Actions 页面手动运行 `build-and-release`。

## 注意

当前工作流按你本地已跑通的版本配置：
- `@tauri-apps/api = 2.0.0`
- `@tauri-apps/plugin-dialog = 2.0.0`
- `@tauri-apps/cli = 2.0.0`
