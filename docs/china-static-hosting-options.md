# 国内纯静态托管选项（轻聊 AI）

## 结论摘要

轻聊 AI 已经是纯静态网站，实测 `pnpm build` 后由普通静态预览服务返回首页、`/ais` 和 `/profile` 均为 HTTP 200。它可部署到不提供后端运行环境的静态托管服务。

## 首选临时/零预算：腾讯云 EdgeOne Makers Pages

EdgeOne Makers Pages 目前是最接近 Vercel 的国内候选：官方文档确认可直接上传已构建的静态产物，也支持导入 GitHub、Gitee、GitLab、Bitbucket 和 CNB 仓库；关联生产分支后，新的提交可自动构建和部署。免费静态托管页面称，注册账户后的免费站点可长期保留。

需要注意中国大陆访问规则：系统项目域名与部署域名在中国大陆需要使用有效期 3 小时的预览链接；若需长期稳定公开访问，应绑定自定义域名。中国大陆可用区或全球可用区（含中国大陆）下的自定义域名须先完成 ICP 备案。

本项目部署参数：

| 项目 | 值 |
|---|---|
| 安装命令 | `pnpm install` |
| 构建命令 | `pnpm build` |
| 输出目录 | `dist` |
| 项目类型 | Vite 静态单页应用 |
| 后端需求 | 无 |

## 次选：腾讯云 CloudBase 静态网站托管

CloudBase 可通过控制台部署静态资源，并由 COS/CDN 分发；官方产品页给新用户提供 1GB 存储、5GB 流量的一个月免费资源。它适合后续的小额长期托管，但并非无期限免费。面向中国大陆用自定义域名长期公开访问仍需按备案规则办理。

## 不建议作为国内正式方案的选项

GitHub Pages 和 Vercel 均可托管当前产物，但并不适合中国大陆长期稳定访问。Vercel 官方明确说明其没有中国大陆服务器或 CDN 节点，且无法保证中国大陆可用性或性能。

## 官方资料

1. https://pages.edgeone.ai/zh/use-cases/free-static-hosting
2. https://pages.edgeone.ai/zh/document/importing-a-git-repository
3. https://pages.edgeone.ai/zh/document/direct-upload
4. https://pages.edgeone.ai/zh/document/domain-overview
5. https://pages.edgeone.ai/zh/document/custom-domain
6. https://cloud.tencent.com/product/wh
7. https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china
