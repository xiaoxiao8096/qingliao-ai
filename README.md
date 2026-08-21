# 轻聊 AI（个人多 AI 本机版）

这是一个无需登录、无需数据库的移动端 AI 聊天工具。它会将你的 AI 档案、名称、头像、API 配置和聊天记录保存到当前浏览器的 `localStorage` 中。

## 使用方式

打开网站后，先进入“管理我的 AI”。你可以为每个 AI 单独设置名称、头像、OpenAI Chat Completions 兼容的 Base URL、模型名称和 API Key。随后点击“使用”切换当前聊天 AI；会话记录会按 AI 档案隔离。进入“我的资料”可以设置你自己的名称和头像。

## GitHub Pages 临时发布

本仓库包含 `.github/workflows/deploy-pages.yml`。推送到 `main` 后，在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**，工作流将发布 `dist/public` 静态文件。

仓库名固定为 `qingliao-ai` 时，临时网址格式为：`https://<你的 GitHub 用户名>.github.io/qingliao-ai/`。

> GitHub Pages 是公开静态托管。应用不会把 API Key 上传到本仓库，但浏览器会用该 Key 直接请求你配置的模型接口。因此仅应在自己信任的设备上使用，且模型服务必须允许浏览器跨域访问（CORS）。清理 Safari 网站数据、使用无痕模式或更换设备后，本地数据不会保留。
