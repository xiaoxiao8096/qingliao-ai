# 轻聊 AI：本地优先的个人多 AI 聊天工具

轻聊 AI 没有账户和数据库。你可以添加多个 AI 档案；每个档案有独立的名称、头像、Base URL、模型名称、API Key 和聊天记录。你的名字、头像、AI 档案、密钥和会话均只存储在当前浏览器的 `localStorage` 内。部署到 Vercel 时，项目会启用一个受域名白名单限制的多模态代理，用来解决图片、语音、音乐、视频端点的浏览器跨域问题。

## 重要边界

请仅在受信任的个人设备使用。Vercel 多模态代理不会保存 API Key，但转发请求时 Vercel 和你选择的模型服务仍会经手该密钥。静态部署会由浏览器直接请求服务商，仍要求服务商允许 CORS。清除浏览器网站数据、使用无痕模式或更换设备会清除所有本地档案与聊天记录。

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

## 用 Vercel 解决多模态跨域

1. 在 Vercel 导入这个 GitHub 仓库，Framework Preset 选择 **Vite**；构建和输出目录已由 `vercel.json` 配好。
2. 在项目 **Settings → Environment Variables** 新建 `QINGLIAO_ALLOWED_UPSTREAM_ORIGINS`，值为允许访问的服务商 origin，多个用英文逗号分隔，例如：

   ```text
   https://api.openai.com,https://console.gmicloud.ai,https://生成结果所在的CDN域名
   ```

3. 重新部署。Vercel 构建会自动把多模态请求路由到 `/api/media-proxy`，不需要在轻聊设置中修改原端点。

只填 `协议 + 域名 + 可选端口`，不要填 `/v1/images/...` 等路径。若服务商返回的成品链接位于另一个 CDN 域名，也要把该 CDN origin 加进白名单。不要把模型 API Key 填进 Vercel 环境变量；它仍由你在轻聊的 AI 档案中填写并仅保存在浏览器。

如果前端另放在 GitHub Pages，而只把代理放到 Vercel，还需设置 `QINGLIAO_ALLOWED_WEB_ORIGINS=https://xiaoxiao8096.github.io`，并在前端构建时设置 `VITE_MEDIA_PROXY_URL=https://你的项目.vercel.app/api/media-proxy`。同一个 Vercel 项目部署时这两项都不需要。

## 临时 GitHub Pages

本仓库已配置 GitHub Pages 工作流。推送到 `main` 后，在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。

临时网址格式为：`https://xiaoxiao8096.github.io/qingliao-ai/`。

## 长期中国大陆静态托管

若要面向中国大陆长期稳定访问，应使用自有域名、ICP 备案和中国大陆对象存储静态网站/CDN；不需要运行服务器，但域名、存储和 CDN 通常会有持续费用。具体官方依据和操作边界见 [长期静态托管说明](docs/long-term-static-hosting.md)。
