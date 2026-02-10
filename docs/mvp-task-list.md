# MVP 任务拆解（对照 PRD V1.0）

## 0. 基础设施
- [ ] MV3 manifest、目录 scaffold（content/background/side panel）。
- [ ] 开发/构建链路（npm scripts、lint、hot reload）。

## 1. 内容获取模块
- [ ] 自动抽取主文（article/main/role=main，过滤导航/广告/评论）。
- [ ] 选中内容兜底。
- [ ] 手动粘贴输入区。
- [ ] Token 估算优化（模型感知）。
- [ ] 长文分块策略（V1.1）。

## 2. Prompt 管理
- [ ] 内置 Prompt 列表（摘要卡片/层级/对比/行动）。
- [ ] 自定义 Prompt 保存/导入导出（本地 JSON）。
- [ ] 变量替换与多语言参数。

## 3. 模型配置
- [ ] 本地存储模型配置（endpoint/model/temperature/max tokens/key）。
- [ ] 多模型切换、校验与探活。
- [ ] 请求超时/重试/速率限制。

## 4. 内容生成与渲染
- [ ] 接入 AI 请求（默认 OpenAI，可自定义 endpoint）。
- [ ] 流式转发 UI。
- [ ] 推荐模式：JSON Schema + 本地模板渲染（sandbox）。
- [ ] 高级模式：受控 HTML + sanitizer。

## 5. 结果操作
- [ ] 复制生成结果。
- [ ] 导出：HTML（P0），Markdown/PDF/图片（P1）。
- [ ] 本地历史记录（列表/搜索/复用）。

## 6. 安全与隐私
- [ ] XSS 防护（sanitize + sandbox iframe）。
- [ ] 敏感站点检测/提示。
- [ ] 权限最小化与 error 提示。

## 7. 体验与性能
- [ ] 首屏 <10s 优化（懒加载、抽取超时）。
- [ ] 首 Token <5s（流式）。
- [ ] 空态/错误态/状态提示完善。

## 近期优先级（建议）
1) 接入 AI 请求 + 流式（完成最小端到端）。
2) JSON 模式渲染（本地模板）+ 复制导出。
3) 手动粘贴输入 + Prompt 保存。
4) 安全层（sanitize + sandbox）与敏感站点提示。
5) 分块摘要（长文）与性能优化。
