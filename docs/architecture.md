# 技术架构与数据流（MVP）

## 模块划分
- **Content Script**：页面主文抽取、选区获取、预处理。输出纯文本/Markdown 片段，避免携带脚本或外链。
- **Background / Service Worker**：消息总线、权限边界、配置持久化（chrome.storage）。未来接入 AI 请求与流式转发。
- **Side Panel UI**：内容预览与编辑、Prompt/模型管理、生成触发与结果展示（本地模板渲染）。
- **Configuration & Templates**：内置 Prompt、模型默认值，按 Schema 管理，存储在 extension 包 + chrome.storage 覆盖。

## 数据流
1) **抽取**：Side Panel 发送 `REQUEST_AUTO_CONTENT` 或 `REQUEST_SELECTION_CONTENT` → Background → Content Script。
2) **预处理**：Content Script 按 DOM 结构抽取（article/main/role=main 等）、过滤导航/广告/评论，输出 `{title,url,content,characters,estimatedTokens}`。
3) **确认**：Side Panel 显示内容并允许编辑，提示字符/Token 估算。
4) **生成（待接入）**：
   - UI 拼装 `{content, promptTemplate, variables, modelConfig}`。
   - Background 按配置调用模型（默认 OpenAI API），采用流式转发到 UI。
5) **渲染（安全）**：
   - 推荐模式：模型返回结构化 JSON → UI 本地模板渲染 → sandbox iframe/DOMPurify 白名单。
   - 高级模式（可选）：模型输出受限 HTML → 经过 sanitizer + sandbox iframe。
6) **操作**：复制、导出（HTML/Markdown/PDF-后续）、历史持久化在 chrome.storage。

## 关键约束
- **安全**：禁止执行脚本；使用 `sandbox iframe` + HTML 白名单；移除 inline 事件 & 外链脚本。
- **隐私**：明确发送内容；API Key 仅存本地 storage；默认过滤敏感站点（银行/邮箱/内网）。
- **性能**：首屏 <10s；首个 Token <5s（流式）；长文分块汇总（V1.1）。

## 目录/文件（当前 MVP）
- `manifest.json`：MV3 配置，注册 content script、side panel、background。
- `src/content/content-script.js`：抽取/选区 + 预处理。
- `src/background/service-worker.js`：消息路由、配置存取。
- `src/ui/sidepanel.*`：侧边栏 UI、Prompt 选择、模型配置占位。
- `src/config/prompts.js`：内置 Prompt。
- `src/utils/storage.js`：模型配置默认值与存取。

## 后续演进钩子
- `Background`：接入流式 AI 调用、分块摘要、重试与限流。
- `UI`：模板化渲染层（JSON→HTML），导出/保存历史。
- `Content`：可选 readability 替换/补强、多语言分词、表格/列表保留策略。
