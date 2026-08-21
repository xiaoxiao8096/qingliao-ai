# 中国大陆长期纯静态托管资料

## 结论

对于轻聊 AI 的纯前端版本，长期面向中国大陆用户的可行生产形态是“自有域名 + ICP 备案 + 中国大陆对象存储静态网站 + CDN”。它不需要常驻服务器或后端应用进程，但域名、对象存储和 CDN 通常会产生持续费用。

## 腾讯云 COS

腾讯云官方说明显示，COS 可以托管静态网站，并建议使用自定义域名；指南将注册域名、备案、存储桶静态网站设置、上传文件和域名绑定列为部署步骤。使用国内 CDN 的自定义域名需要备案。

- https://cloud.tencent.com/document/product/436/9512
- https://cloud.tencent.com/document/product/436/18670

## 阿里云 OSS

阿里云官方说明显示，OSS 可直接公开发布 HTML、CSS 和 JavaScript，且无需维护传统服务器。对于位于中国内地的 Bucket，使用自定义域名浏览网站需要完成 ICP 备案。SPA 可将默认 404 页面设为 `index.html` 且返回 200，以支持前端路由刷新。

- https://help.aliyun.com/zh/oss/user-guide/hosting-static-websites
- https://help.aliyun.com/zh/icp-filing/basic-icp-service/product-overview/use-oss

## 本项目的特定边界

轻聊 AI 会将 AI API Key、头像、名字、AI 档案和会话记录保存在 Safari 的 localStorage；静态托管只发布 HTML、CSS、JavaScript，不能代管或同步这些私密数据。浏览器会直接请求用户填写的模型 API，因此供应商必须提供适配浏览器的 CORS 响应。
