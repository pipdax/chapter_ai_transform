# 网页可视化 AI 助手 - 交接与功能说明

## 概览
- 形态：Chrome 插件（MV3），页面右下角悬浮气泡，点开全屏遮罩内嵌 iframe UI。
- 目标：从网页提取正文 → 选择/编辑内容 → 选择 Prompt/模型 → 流式生成 → 安全渲染/复制。

## 用户流程
1) 点击扩展图标，右下角出现 “AI转” 气泡；点气泡展开面板。
2) 内容来源：自动抽取 / 用选中 / 手动粘贴；可在预览框编辑。
3) 选择 Prompt（内置或自定义）；如需，展开“模型配置”折叠面板填写 Endpoint/Model/API Key/温度/Max Tokens。
4) 点击“生成” → 文本流式显示；切换渲染模式可用 JSON 模式在沙箱 iframe 预览卡片。
5) 复制结果；后续可扩展导出/历史等。

## 功能清单（MVP）
- 内容抽取：基于 DOM 选择 article/main/role=main，过滤导航/广告/评论，保留标题/列表/引用；选区兜底；手动粘贴。
- Prompt 管理：内置多种模板，支持自定义保存/导入/导出（存本地 storage）。
- 模型配置：本地存储 Endpoint/Model/API Key/温度/Max Tokens；无外传。
- 生成：OpenAI 兼容流式接口（需用户自带 Key），UI 实时追加输出；文本/JSON 渲染模式。
- 安全渲染：推荐 JSON → 本地模板渲染 → iframe sandbox（无 allow-same-origin），HTML 白名单净化。
- 悬浮 UI：气泡可收起/关闭；右键扩展图标有“配置 AI 模型”入口（唤起并聚焦配置）。

## 开发与架构
- manifest：`manifest.json`（权限：storage、scripting、activeTab、contextMenus）。
- 内容脚本：`src/content/content-script.js`（抽取/选区，悬浮气泡+iframe srcdoc 加载 UI）。
- 背景页：`src/background/service-worker.js`（消息路由、流式转发、右键菜单、必要时注入内容脚本再消息）。
- UI：`src/ui/sidepanel.html/css/js`（极简布局，配置折叠；流式显示、渲染模式切换、复制）。
- 配置/存储：`src/utils/storage.js`（模型默认值与存储、自定义 Prompt 存取）。
- Prompt 列表：`src/config/prompts.js`。
- 渲染安全：`src/utils/sanitize.js`（白名单净化）、`src/utils/template.js`（变量替换）。

## 配置与使用要点
- API Key 仅存 `chrome.storage.local`，不透传服务器。
- 模型接口默认 OpenAI 兼容 `/v1/chat/completions`；需自备可访问的 Endpoint/Key。
- 侧边栏无，全部通过悬浮面板；若气泡不出现，点击扩展图标并确保内容脚本注入成功。

## 测试与验证
- 打开任意网页 → 点击扩展 → 气泡/面板正常出现。
- 自动抽取正文，预览有内容；选区模式用选中的文字；手动粘贴可编辑。
- 填写有效 Endpoint/Key/Model，点击生成可见流式文本；JSON 模式可在沙箱预览。
- 右键扩展图标选择“配置 AI 模型”可直接拉起面板并滚动到配置区。

## 常见问题
- 看不到面板：可能内容脚本未注入，点击扩展图标重试；背景页会在失败时自动注入后重发消息。
- “页面被屏蔽”：已改为 iframe `srcdoc` 且移除 allow-same-origin；若仍异常，查看控制台错误。
- 生成无响应：检查网络是否可访问模型 Endpoint，确认 API Key/Model/Endpoint 填写正确。
