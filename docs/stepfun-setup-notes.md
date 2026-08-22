# StepFun 本机配置核验记录

核验日期：2026-08-22。

StepFun 官方文档说明其兼容 OpenAI API 规范，并支持 Chat Completions 与模型列表接口。若用户可登录 StepFun 开放平台、进入“接口密钥”并看到“创建新的密钥”，则可将该密钥用于轻聊 AI；如果用户只有面向消费者的产品会员、没有此页面或无法创建接口密钥，则应先向 StepFun 确认该订阅是否包含开放平台 API 调用额度。

| 轻聊 AI 字段 | 推荐填写值 | 说明 |
| --- | --- | --- |
| AI 名称 | 阶跃 StepFun | 仅是本机显示名称，可自行改名。 |
| API Base URL | `https://api.stepfun.com/v1` | 轻聊 AI 会自动补上 `/chat/completions` 和 `/models` 路径。 |
| 模型名称 | `step-3.7-flash` | 官方迁移文档列出的旗舰多模态推理模型；也可在验证后改为 `step-3.5-flash`。 |
| API Key | 从“接口密钥”新建后复制的密钥 | 仅保存在当前 Safari 的 localStorage；不能发送给助手或提交到仓库。 |

用户可先填写前三项和密钥，然后点击“测试 API 连接”。该测试仅请求模型服务的 `/models`，不发送任何聊天内容；成功后再点击“保存我的 AI”，返回聊天主页开始对话。

来源：<https://platform.stepfun.com/docs/zh/guides/developer/openai>；<https://platform.stepfun.com/interface-key>。
