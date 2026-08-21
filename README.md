# 轻聊 AI：纯前端个人多 AI 聊天工具

轻聊 AI 是一个**没有后端、没有账户、没有数据库**的静态网站。你可以在 Safari 中添加多个 AI 档案；每个档案有独立的名称、头像、Base URL、模型名称、API Key 和聊天记录。你的名字、头像、AI 档案和会话均存储在当前浏览器的 `localStorage` 内。

## 重要边界

因为这是纯前端网站，浏览器会直接将你的 API Key 用于请求所配置的模型服务。请仅在受信任的个人设备使用，并确认模型服务允许来自网站域名的浏览器跨域请求（CORS）。清除 Safari 网站数据、使用无痕模式或更换设备会清除所有本地档案与聊天记录。

## 本地运行

```bash
pnpm install
pnpm dev
```

## 静态构建

```bash
pnpm build
```

构建产物位于 `dist/`，可上传到任何静态网站托管服务。

## 临时 GitHub Pages

本仓库已配置 GitHub Pages 工作流。推送到 `main` 后，在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。

临时网址格式为：`https://xiaoxiao8096.github.io/qingliao-ai/`。

## 长期中国大陆静态托管

若要面向中国大陆长期稳定访问，应使用自有域名、ICP 备案和中国大陆对象存储静态网站/CDN；不需要运行服务器，但域名、存储和 CDN 通常会有持续费用。具体官方依据和操作边界见 [长期静态托管说明](docs/long-term-static-hosting.md)。
