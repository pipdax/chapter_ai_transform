/**
 * Panel 主逻辑
 * 处理 UI 交互、状态管理、与 background/content 通信
 */

import { BUILTIN_PROMPTS, fillPromptTemplate } from '../config/prompts.js';
import { DEFAULT_MODEL_CONFIG } from '../config/defaults.js';
import { extractHtmlFromMarkdown, sanitizeHtml } from '../utils/sanitize.js';
import { copyToClipboard, downloadHtml, downloadImage, captureToImage } from '../utils/screenshot.js';

// ============================================
// 状态管理
// ============================================
const state = {
    currentMode: 'auto', // 'auto' | 'selection' | 'manual'
    selectedPromptId: 'summary-card',
    content: {
        title: '',
        url: '',
        content: '',
        characters: 0,
        estimatedTokens: 0
    },
    modelConfig: { ...DEFAULT_MODEL_CONFIG },
    customPrompts: [],
    generatedHtml: '',
    rawContent: '', // 原始 AI 响应（markdown格式）
    isGenerating: false
};

// ============================================
// DOM 元素引用
// ============================================
const elements = {};

function initElements() {
    elements.promptSelector = document.getElementById('promptSelector');
    elements.currentPromptLabel = document.getElementById('currentPromptLabel');
    elements.promptDropdown = document.getElementById('promptDropdown');
    elements.builtinPromptList = document.getElementById('builtinPromptList');
    elements.customPromptList = document.getElementById('customPromptList');
    elements.addPromptBtn = document.getElementById('addPromptBtn');

    elements.historyBtn = document.getElementById('historyBtn');
    elements.configBtn = document.getElementById('configBtn');
    elements.minimizeBtn = document.getElementById('minimizeBtn');
    elements.closeBtn = document.getElementById('closeBtn');

    elements.stepInput = document.getElementById('stepInput');
    elements.stepOutput = document.getElementById('stepOutput');
    elements.inputTabs = document.querySelectorAll('.input-tab');
    elements.contentTitle = document.getElementById('contentTitle');
    elements.contentTextarea = document.getElementById('contentTextarea');
    elements.charCount = document.getElementById('charCount');
    elements.tokenCount = document.getElementById('tokenCount');
    elements.generateBtn = document.getElementById('generateBtn');

    elements.outputFrame = document.getElementById('outputFrame');
    elements.loadingOverlay = document.getElementById('loadingOverlay');
    elements.floatingActions = document.getElementById('floatingActions');
    elements.backBtn = document.getElementById('backBtn');
    elements.copyBtn = document.getElementById('copyBtn');
    elements.downloadCodeBtn = document.getElementById('downloadCodeBtn');
    elements.downloadImageBtn = document.getElementById('downloadImageBtn');

    elements.configOverlay = document.getElementById('configOverlay');
    elements.configCloseBtn = document.getElementById('configCloseBtn');
    elements.configEndpoint = document.getElementById('configEndpoint');
    elements.configModel = document.getElementById('configModel');
    elements.configApiKey = document.getElementById('configApiKey');
    elements.configTemperature = document.getElementById('configTemperature');
    elements.configMaxTokens = document.getElementById('configMaxTokens');
    elements.testConnectionBtn = document.getElementById('testConnectionBtn');
    elements.saveConfigBtn = document.getElementById('saveConfigBtn');
    elements.connectionStatus = document.getElementById('connectionStatus');

    elements.historyOverlay = document.getElementById('historyOverlay');
    elements.historyCloseBtn = document.getElementById('historyCloseBtn');
    elements.historyList = document.getElementById('historyList');
    elements.clearHistoryBtn = document.getElementById('clearHistoryBtn');

    elements.promptEditorOverlay = document.getElementById('promptEditorOverlay');
    elements.promptEditorTitle = document.getElementById('promptEditorTitle');
    elements.promptEditorCloseBtn = document.getElementById('promptEditorCloseBtn');
    elements.promptName = document.getElementById('promptName');
    elements.promptDescription = document.getElementById('promptDescription');
    elements.promptTemplate = document.getElementById('promptTemplate');
    elements.cancelPromptBtn = document.getElementById('cancelPromptBtn');
    elements.savePromptBtn = document.getElementById('savePromptBtn');

    elements.toast = document.getElementById('toast');
    elements.toastMessage = document.getElementById('toastMessage');

    // 调试功能
    elements.debugModeToggle = document.getElementById('debugModeToggle');
    elements.viewLogsBtn = document.getElementById('viewLogsBtn');
    elements.logsOverlay = document.getElementById('logsOverlay');
    elements.logsCloseBtn = document.getElementById('logsCloseBtn');
    elements.logsList = document.getElementById('logsList');
    elements.clearLogsBtn = document.getElementById('clearLogsBtn');
    elements.copyAllLogsBtn = document.getElementById('copyAllLogsBtn');
}

// ============================================
// 初始化
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    initElements();
    await loadConfig();
    await loadCustomPrompts();
    renderPromptList();
    bindEvents();
    requestContent('auto');
});

// ============================================
// 事件绑定
// ============================================
function bindEvents() {
    // Header 按钮
    elements.historyBtn.addEventListener('click', () => showOverlay('history'));
    elements.configBtn.addEventListener('click', () => showOverlay('config'));
    elements.minimizeBtn.addEventListener('click', () => {
        window.parent.postMessage({ type: 'MINIMIZE_PANEL' }, '*');
    });
    elements.closeBtn.addEventListener('click', () => {
        window.parent.postMessage({ type: 'CLOSE_PANEL' }, '*');
    });

    // Prompt 选择器
    elements.promptSelector.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.promptSelector.classList.toggle('open');
    });

    document.addEventListener('click', () => {
        elements.promptSelector.classList.remove('open');
    });

    elements.addPromptBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPromptEditor();
    });

    // 输入 Tab 切换
    elements.inputTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.mode;
            setInputMode(mode);
        });
    });

    // 内容编辑
    elements.contentTextarea.addEventListener('input', () => {
        updateStats();
    });

    // 生成按钮
    elements.generateBtn.addEventListener('click', () => {
        startGeneration();
    });

    // 输出操作
    elements.backBtn.addEventListener('click', () => {
        // 清理状态
        state.isGenerating = false;
        state.generatedHtml = '';
        state.rawContent = '';
        elements.outputFrame.srcdoc = '';
        elements.loadingOverlay.classList.add('hidden');

        // 发送中止请求（如果正在生成）
        if (state.isGenerating) {
            chrome.runtime.sendMessage({ type: 'ABORT_REQUEST' });
        }

        showStep('input');
    });

    elements.copyBtn.addEventListener('click', async () => {
        // 复制 HTML 代码
        if (state.generatedHtml) {
            await copyToClipboard(state.generatedHtml);
            showToast('已复制 HTML 到剪贴板');
        }
    });

    elements.downloadCodeBtn.addEventListener('click', () => {
        if (state.generatedHtml) {
            downloadHtml(state.generatedHtml, `article-${Date.now()}.html`);
            showToast('代码已下载');
        }
    });

    elements.downloadImageBtn.addEventListener('click', async () => {
        if (state.generatedHtml) {
            try {
                showToast('正在生成图片...');
                const blob = await captureIframeAsImage();
                downloadImage(blob, `article-${Date.now()}.png`);
                showToast('图片已下载');
            } catch (e) {
                showToast('图片生成失败: ' + e.message);
            }
        }
    });

    // 配置面板
    elements.configCloseBtn.addEventListener('click', () => hideOverlay('config'));
    elements.testConnectionBtn.addEventListener('click', () => testConnection());
    elements.saveConfigBtn.addEventListener('click', () => saveConfig());

    // 历史面板
    elements.historyCloseBtn.addEventListener('click', () => hideOverlay('history'));
    elements.clearHistoryBtn.addEventListener('click', () => clearAllHistory());

    // Prompt 编辑器
    elements.promptEditorCloseBtn.addEventListener('click', () => hideOverlay('promptEditor'));
    elements.cancelPromptBtn.addEventListener('click', () => hideOverlay('promptEditor'));
    elements.savePromptBtn.addEventListener('click', () => savePrompt());

    // 调试功能
    elements.debugModeToggle.addEventListener('change', () => toggleDebugMode());
    elements.viewLogsBtn.addEventListener('click', () => showOverlay('logs'));
    elements.logsCloseBtn.addEventListener('click', () => hideOverlay('logs'));
    elements.clearLogsBtn.addEventListener('click', () => clearLogs());
    elements.copyAllLogsBtn.addEventListener('click', () => copyAllLogs());

    // 监听父窗口消息
    window.addEventListener('message', handleParentMessage);

    // 监听 background 消息
    chrome.runtime?.onMessage?.addListener(handleBackgroundMessage);
}

// ============================================
// 消息处理
// ============================================
function handleParentMessage(event) {
    const { type, data } = event.data || {};
    const message = event.data;

    switch (type) {
        case 'CONTENT_RESPONSE':
            handleContentResponse(data);
            break;
        case 'OPEN_CONFIG':
            showOverlay('config');
            break;
        // 流式消息（从 content-script 转发过来）
        case 'STREAM_CHUNK':
            handleStreamChunk(message.chunk, message.fullContent);
            break;
        case 'STREAM_COMPLETE':
            handleStreamComplete(message.content);
            break;
        case 'STREAM_ERROR':
            handleStreamError(message.error);
            break;
        case 'STREAM_ABORTED':
            handleStreamAborted();
            break;
    }
}

function handleBackgroundMessage(message) {
    switch (message.type) {
        case 'STREAM_CHUNK':
            handleStreamChunk(message.chunk, message.fullContent);
            break;
        case 'STREAM_COMPLETE':
            handleStreamComplete(message.content);
            break;
        case 'STREAM_ERROR':
            handleStreamError(message.error);
            break;
        case 'STREAM_ABORTED':
            handleStreamAborted();
            break;
    }
}

// ============================================
// 内容管理
// ============================================
function requestContent(mode) {
    window.parent.postMessage({
        type: 'REQUEST_CONTENT',
        mode: mode === 'selection' ? 'selection' : 'auto'
    }, '*');
}

function handleContentResponse(data) {
    state.content = data;
    elements.contentTitle.textContent = data.title || '未知标题';
    elements.contentTextarea.value = data.content || '';
    updateStats();

    // 如果选区为空且当前是选区模式，提示
    if (state.currentMode === 'selection' && data.isEmpty) {
        showToast('未检测到选中内容，请先选中文字');
    }
}

function setInputMode(mode) {
    state.currentMode = mode;

    elements.inputTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    if (mode === 'manual') {
        elements.contentTextarea.value = '';
        elements.contentTextarea.focus();
        updateStats();
    } else {
        requestContent(mode);
    }
}

function updateStats() {
    const content = elements.contentTextarea.value;
    const characters = content.length;
    const estimatedTokens = Math.ceil(characters / 2);

    elements.charCount.textContent = `${characters.toLocaleString()} 字`;
    elements.tokenCount.textContent = `~${estimatedTokens.toLocaleString()} tokens`;
}

// ============================================
// Prompt 管理
// ============================================
function renderPromptList() {
    // 内置 Prompt（显示查看图标，不显示删除按钮）
    elements.builtinPromptList.innerHTML = BUILTIN_PROMPTS.map(prompt => `
    <div class="prompt-item ${prompt.id === state.selectedPromptId ? 'active' : ''}" data-id="${prompt.id}" data-builtin="true">
      <div class="prompt-item-content">
        <div class="prompt-item-name">${prompt.name}</div>
        <div class="prompt-item-desc">${prompt.description}</div>
      </div>
      <div class="prompt-item-actions">
        <button class="prompt-action-btn prompt-view-btn" data-id="${prompt.id}" title="查看">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

    // 自定义 Prompt（带编辑/删除按钮）
    if (state.customPrompts.length > 0) {
        elements.customPromptList.innerHTML = state.customPrompts.map(prompt => `
      <div class="prompt-item ${prompt.id === state.selectedPromptId ? 'active' : ''}" data-id="${prompt.id}">
        <div class="prompt-item-content">
          <div class="prompt-item-name">${prompt.name}</div>
          <div class="prompt-item-desc">${prompt.description || ''}</div>
        </div>
        <div class="prompt-item-actions">
          <button class="prompt-action-btn prompt-edit-btn" data-id="${prompt.id}" title="编辑">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="prompt-action-btn prompt-delete-btn" data-id="${prompt.id}" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');
    } else {
        elements.customPromptList.innerHTML = '<div class="prompt-item-desc" style="padding: 8px;">暂无自定义模板</div>';
    }

    // 绑定点击事件（选择 prompt）
    document.querySelectorAll('.prompt-item[data-id]').forEach(item => {
        item.addEventListener('click', (e) => {
            // 如果点击的是操作按钮，不触发选择
            if (e.target.closest('.prompt-action-btn')) return;
            e.stopPropagation();
            selectPrompt(item.dataset.id);
        });
    });

    // 绑定编辑按钮事件
    document.querySelectorAll('.prompt-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const promptId = btn.dataset.id;
            const prompt = state.customPrompts.find(p => p.id === promptId);
            if (prompt) {
                state.editingPromptId = promptId;
                openPromptEditor(prompt);
            }
        });
    });

    // 绑定删除按钮事件
    document.querySelectorAll('.prompt-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const promptId = btn.dataset.id;
            const prompt = state.customPrompts.find(p => p.id === promptId);
            if (prompt && confirm(`确定要删除模板"${prompt.name}"吗？`)) {
                deleteCustomPrompt(promptId);
            }
        });
    });

    // 绑定查看按钮事件（内置模板）
    document.querySelectorAll('.prompt-view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const promptId = btn.dataset.id;
            const prompt = BUILTIN_PROMPTS.find(p => p.id === promptId);
            if (prompt) {
                openPromptViewer(prompt);
            }
        });
    });

    // 更新当前显示
    updatePromptLabel();
}

function selectPrompt(id) {
    state.selectedPromptId = id;
    renderPromptList();
    elements.promptSelector.classList.remove('open');
}

function updatePromptLabel() {
    const all = [...BUILTIN_PROMPTS, ...state.customPrompts];
    const current = all.find(p => p.id === state.selectedPromptId);
    if (current) {
        elements.currentPromptLabel.textContent = current.name;
    }
}

// 辅助函数：根据名称查找模板
function findPromptByName(name) {
    return state.customPrompts.find(p => p.name === name);
}

function openPromptEditor(prompt = null) {
    const defaultTemplate = `你是一位专业的信息可视化设计师。请将以下文章内容转换为一个精美的 HTML 可视化页面。

## 设计要求：
1. **整体风格**：现代简约，配色和谐，适合阅读
2. **结构清晰**：使用卡片、分栏、时间线等方式组织内容
3. **视觉层次**：通过字体大小、颜色深浅、间距等区分主次
4. **图标装饰**：适当使用 emoji 或 SVG 图标增强表现力
5. **响应式**：页面宽度适配不同屏幕

## 输出要求：
- 直接输出完整的 HTML 代码（包含内联 CSS）
- 不需要解释说明，只需要代码
- 确保代码可以独立运行

## 文章内容：
{{content}}`;

    elements.promptEditorTitle.textContent = prompt ? '编辑模板' : '新建模板';
    elements.promptName.value = prompt?.name || '';
    elements.promptDescription.value = prompt?.description || '';
    elements.promptTemplate.value = prompt?.template || defaultTemplate;

    // 设置编辑状态 ID
    state.editingPromptId = prompt ? prompt.id : null;

    // 确保输入框可编辑
    elements.promptName.readOnly = false;
    elements.promptDescription.readOnly = false;
    elements.promptTemplate.readOnly = false;
    showOverlay('promptEditor');
}

function openPromptViewer(prompt) {
    elements.promptEditorTitle.textContent = '查看模板（只读）';
    elements.promptName.value = prompt.name;
    elements.promptDescription.value = prompt.description || '';
    elements.promptTemplate.value = prompt.template;
    // 设置为只读
    elements.promptName.readOnly = true;
    elements.promptDescription.readOnly = true;
    elements.promptTemplate.readOnly = true;
    showOverlay('promptEditor');
}

async function savePrompt() {
    const name = elements.promptName.value.trim();
    const description = elements.promptDescription.value.trim();
    const template = elements.promptTemplate.value.trim();

    if (!name || !template) {
        showToast('请填写模板名称和内容');
        return;
    }

    // 检查重名
    const conflicting = state.customPrompts.find(p => p.name === name);

    // 编辑模式
    if (state.editingPromptId) {
        const original = state.customPrompts.find(p => p.id === state.editingPromptId);
        if (original) {
            // 如果名称改变且与现有的冲突
            if (original.name !== name && conflicting) {
                if (!confirm(`模板名称"${name}"已存在，是否覆盖？`)) {
                    return;
                }
                // 删除冲突的那个（保留当前这个的 ID，或者更新冲突那个保留它的 ID？）
                // 这里的逻辑是：用户想改名为这个名字，并覆盖原有的。
                // 我们保留当前的 ID，删除冲突的那个。
                state.customPrompts = state.customPrompts.filter(p => p.id !== conflicting.id);
            }
            // 更新当前模板
            original.name = name;
            original.description = description;
            original.template = template;
            // original ID 保持不变
        } else {
            // ID 不存在（可能被删除了），当作新建处理
            state.editingPromptId = null;
            return savePrompt();
        }
    } else {
        // 新建模式
        if (conflicting) {
            if (!confirm(`模板名称"${name}"已存在，是否覆盖？`)) {
                return;
            }
            // 覆盖现有的
            conflicting.description = description;
            conflicting.template = template;
            // 切换到编辑该模版
            state.editingPromptId = conflicting.id;
        } else {
            // 创建新的
            const newPrompt = {
                id: `custom-${Date.now()}`,
                name,
                description,
                template,
                isCustom: true
            };
            state.customPrompts.push(newPrompt);
            state.editingPromptId = newPrompt.id;
        }
    }

    await saveCustomPrompts();
    renderPromptList();
    selectPrompt(state.editingPromptId);
    hideOverlay('promptEditor');
    showToast('模板已保存');
}

async function loadCustomPrompts() {
    try {
        const result = await chrome.storage.local.get(['customPrompts']);
        state.customPrompts = result.customPrompts || [];
    } catch (e) {
        console.error('Failed to load custom prompts:', e);
    }
}

async function saveCustomPrompts() {
    try {
        await chrome.storage.local.set({ customPrompts: state.customPrompts });
    } catch (e) {
        console.error('Failed to save custom prompts:', e);
    }
}

async function deleteCustomPrompt(promptId) {
    console.log('Deleting prompt:', promptId);
    // 从列表中移除
    const initialLength = state.customPrompts.length;
    state.customPrompts = state.customPrompts.filter(p => p.id !== promptId);

    if (state.customPrompts.length === initialLength) {
        console.warn('Prompt ID not found:', promptId);
        return;
    }

    // 如果删除的是当前选中的，切换到第一个内置模板
    if (state.selectedPromptId === promptId) {
        state.selectedPromptId = BUILTIN_PROMPTS[0].id; // 假设一定有内置模板
        updatePromptLabel(); // 需要更新 Label
    }

    // 保存并刷新列表
    await saveCustomPrompts();
    renderPromptList();
    showToast('模板已删除');
}

// ============================================
// 配置管理
// ============================================
async function loadConfig() {
    try {
        const result = await chrome.storage.local.get(['modelConfig']);
        if (result.modelConfig) {
            state.modelConfig = { ...DEFAULT_MODEL_CONFIG, ...result.modelConfig };
        }
        populateConfigForm();
    } catch (e) {
        console.error('Failed to load config:', e);
    }
}

function populateConfigForm() {
    elements.configEndpoint.value = state.modelConfig.endpoint;
    elements.configModel.value = state.modelConfig.model;
    elements.configApiKey.value = state.modelConfig.apiKey;
    elements.configTemperature.value = state.modelConfig.temperature;
    elements.configMaxTokens.value = state.modelConfig.maxTokens;
}

async function saveConfig() {
    state.modelConfig = {
        endpoint: elements.configEndpoint.value.trim(),
        model: elements.configModel.value.trim(),
        apiKey: elements.configApiKey.value.trim(),
        temperature: parseFloat(elements.configTemperature.value) || 0.7,
        maxTokens: parseInt(elements.configMaxTokens.value) || 4096
    };

    try {
        await chrome.storage.local.set({ modelConfig: state.modelConfig });
        showToast('配置已保存');
        hideOverlay('config');
    } catch (e) {
        showToast('保存失败: ' + e.message);
    }
}

async function testConnection() {
    const config = {
        endpoint: elements.configEndpoint.value.trim(),
        model: elements.configModel.value.trim(),
        apiKey: elements.configApiKey.value.trim()
    };

    elements.connectionStatus.classList.remove('hidden', 'success', 'error');
    elements.connectionStatus.textContent = '正在测试...';

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'TEST_CONNECTION',
            config
        });

        if (response.success) {
            elements.connectionStatus.classList.add('success');
            elements.connectionStatus.textContent = '✓ 连接成功';
        } else {
            elements.connectionStatus.classList.add('error');
            elements.connectionStatus.textContent = '✗ ' + response.message;
        }
    } catch (e) {
        elements.connectionStatus.classList.add('error');
        elements.connectionStatus.textContent = '✗ 测试失败: ' + e.message;
    }
}

// ============================================
// 生成逻辑
// ============================================
function startGeneration() {
    const content = elements.contentTextarea.value.trim();

    if (!content) {
        showToast('请先输入或抽取内容');
        return;
    }

    if (!state.modelConfig.apiKey) {
        showToast('请先配置 API Key');
        showOverlay('config');
        return;
    }

    // 获取当前 Prompt
    const all = [...BUILTIN_PROMPTS, ...state.customPrompts];
    const currentPrompt = all.find(p => p.id === state.selectedPromptId);

    if (!currentPrompt) {
        showToast('请选择一个 Prompt 模板');
        return;
    }

    // 填充模板
    const prompt = fillPromptTemplate(currentPrompt.template, {
        content: content
    });

    // 切换到输出步骤
    showStep('output');
    state.isGenerating = true;
    state.generatedHtml = '';
    state.rawContent = '';
    elements.loadingOverlay.classList.remove('hidden');
    elements.outputFrame.srcdoc = '';

    // 发送请求
    chrome.runtime.sendMessage({
        type: 'STREAM_REQUEST',
        config: state.modelConfig,
        prompt: prompt
    });
}

function handleStreamChunk(chunk, fullContent) {
    // 实时尝试提取和渲染 HTML
    const html = extractHtmlFromMarkdown(fullContent);
    if (html && html.startsWith('<')) {
        const sanitized = sanitizeHtml(html);
        renderOutput(sanitized);
        elements.loadingOverlay.classList.add('hidden');
    }
}

function handleStreamComplete(content) {
    state.isGenerating = false;
    elements.loadingOverlay.classList.add('hidden');

    // 保存原始响应
    state.rawContent = content;

    // 最终处理
    const html = extractHtmlFromMarkdown(content);
    const sanitized = sanitizeHtml(html);
    state.generatedHtml = sanitized;
    renderOutput(sanitized);

    // 保存历史
    saveHistory(state.content.title, sanitized);

    // 通知父页面生成完成（用于显示徽标）
    window.parent.postMessage({ type: 'GENERATION_COMPLETE' }, '*');
}

function handleStreamError(error) {
    state.isGenerating = false;
    elements.loadingOverlay.classList.add('hidden');
    showToast('生成失败: ' + error);
    showStep('input');
}

function handleStreamAborted() {
    state.isGenerating = false;
    elements.loadingOverlay.classList.add('hidden');
}

function renderOutput(html) {
    // 包装基础样式
    const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 24px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #212529;
          background: #ffffff;
        }
      </style>
    </head>
    <body>${html}</body>
    </html>
  `;

    elements.outputFrame.srcdoc = fullHtml;
}

// ============================================
// 截图功能
// ============================================
async function captureIframeAsImage() {
    const iframe = elements.outputFrame;

    // 获取 iframe 内容
    let htmlContent = '';
    try {
        if (iframe.srcdoc) {
            htmlContent = iframe.srcdoc;
        } else {
            throw new Error('无法获取内容');
        }
    } catch (e) {
        throw new Error('无法获取内容');
    }

    if (!htmlContent) {
        throw new Error('内容为空');
    }

    // 创建临时容器渲染 HTML
    const container = document.createElement('div');
    container.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: 1080px;
        min-height: 800px;
        background: white;
        overflow: visible;
    `;
    document.body.appendChild(container);

    // 创建 shadow DOM 来隔离样式
    const shadow = container.attachShadow({ mode: 'open' });

    // 解析 HTML 并提取 style
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // 创建内容容器
    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = `
        width: 1080px;
        min-height: 800px;
        background: white;
        padding: 0;
        margin: 0;
    `;

    // 复制 style 标签
    doc.querySelectorAll('style').forEach(style => {
        const newStyle = document.createElement('style');
        newStyle.textContent = style.textContent;
        shadow.appendChild(newStyle);
    });

    // 复制 body 内容
    contentWrapper.innerHTML = doc.body.innerHTML;
    shadow.appendChild(contentWrapper);

    // 等待渲染
    await new Promise(r => setTimeout(r, 500));

    try {
        // 使用 html2canvas 截图
        if (typeof html2canvas === 'undefined') {
            throw new Error('html2canvas 未加载');
        }

        const canvas = await html2canvas(contentWrapper, {
            width: 1080,
            height: contentWrapper.scrollHeight || 800,
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false
        });

        document.body.removeChild(container);

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('生成图片失败'));
                }
            }, 'image/png');
        });
    } catch (e) {
        document.body.removeChild(container);
        throw new Error('截图失败: ' + e.message);
    }
}

// ============================================
// 历史管理
// ============================================
async function saveHistory(title, html) {
    try {
        const result = await chrome.storage.local.get(['history']);
        const history = result.history || [];

        history.unshift({
            id: `history-${Date.now()}`,
            title: title || '无标题',
            html: html,
            timestamp: Date.now()
        });

        // 最多保留 50 条
        if (history.length > 50) {
            history.pop();
        }

        await chrome.storage.local.set({ history });
    } catch (e) {
        console.error('Failed to save history:', e);
    }
}

async function loadHistory() {
    try {
        const result = await chrome.storage.local.get(['history']);
        const history = result.history || [];

        if (history.length === 0) {
            elements.historyList.innerHTML = '<div class="history-empty">暂无历史记录</div>';
            return;
        }

        elements.historyList.innerHTML = history.map(item => `
      <div class="history-item" data-id="${item.id}">
        <div class="history-item-title">${item.title}</div>
        <div class="history-item-time">${formatTime(item.timestamp)}</div>
      </div>
    `).join('');

        // 绑定点击事件
        elements.historyList.querySelectorAll('.history-item').forEach(el => {
            el.addEventListener('click', () => {
                const item = history.find(h => h.id === el.dataset.id);
                if (item) {
                    state.generatedHtml = item.html;
                    renderOutput(item.html);
                    showStep('output');
                    hideOverlay('history');
                }
            });
        });
    } catch (e) {
        console.error('Failed to load history:', e);
    }
}

async function clearAllHistory() {
    if (!confirm('确定要清空所有历史记录吗？此操作不可恢复。')) {
        return;
    }

    try {
        await chrome.storage.local.set({ history: [] });
        elements.historyList.innerHTML = '<div class="history-empty">暂无历史记录</div>';
        showToast('历史记录已清空');
    } catch (e) {
        console.error('Failed to clear history:', e);
        showToast('清空失败');
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;

    return date.toLocaleDateString('zh-CN');
}

// ============================================
// UI 辅助
// ============================================
function showStep(step) {
    if (step === 'input') {
        elements.stepInput.classList.remove('hidden');
        elements.stepOutput.classList.add('hidden');
        // 隐藏悬浮操作按钮
        elements.floatingActions.classList.add('hidden');
    } else {
        elements.stepInput.classList.add('hidden');
        elements.stepOutput.classList.remove('hidden');
        // 显示悬浮操作按钮
        elements.floatingActions.classList.remove('hidden');
    }
}

function showOverlay(name) {
    const overlay = elements[`${name}Overlay`];
    if (overlay) {
        overlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });

        // 加载数据
        if (name === 'history') {
            loadHistory();
        } else if (name === 'config') {
            populateConfigForm();
            loadDebugMode();
        } else if (name === 'logs') {
            loadLogs();
        }
    }
}

function hideOverlay(name) {
    const overlay = elements[`${name}Overlay`];
    if (overlay) {
        overlay.classList.remove('visible');
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 250);
    }
}

function showToast(message, duration = 2500) {
    elements.toastMessage.textContent = message;
    elements.toast.classList.remove('hidden');

    requestAnimationFrame(() => {
        elements.toast.classList.add('visible');
    });

    setTimeout(() => {
        elements.toast.classList.remove('visible');
        setTimeout(() => {
            elements.toast.classList.add('hidden');
        }, 250);
    }, duration);
}

// ============================================
// 调试功能
// ============================================
async function loadDebugMode() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_DEBUG_MODE' });
        elements.debugModeToggle.checked = response.debugMode || false;
    } catch (e) {
        console.error('Failed to load debug mode:', e);
    }
}

async function toggleDebugMode() {
    const enabled = elements.debugModeToggle.checked;
    try {
        await chrome.runtime.sendMessage({ type: 'SET_DEBUG_MODE', enabled });
        showToast(enabled ? '调试模式已开启' : '调试模式已关闭');
    } catch (e) {
        showToast('设置失败: ' + e.message);
    }
}

// 保存当前日志数据用于复制
let currentLogs = [];

async function loadLogs() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_LOGS' });
        const logs = response.logs || [];
        // 按时间升序排列（最新的在最下面）
        currentLogs = [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        if (currentLogs.length === 0) {
            elements.logsList.innerHTML = '<div class="logs-empty">暂无日志</div>';
            return;
        }

        elements.logsList.innerHTML = currentLogs.map((log, index) => `
            <div class="log-item">
                <div class="log-item-header">
                    <span class="log-type ${log.type.toLowerCase()}">${log.type}</span>
                    <span class="log-time">${formatLogTime(log.timestamp)}</span>
                    <button class="log-copy-btn" data-index="${index}" title="复制此条">📋</button>
                </div>
                <div class="log-data">${formatLogData(log.data)}</div>
            </div>
        `).join('');

        // 绑定单条复制按钮事件
        elements.logsList.querySelectorAll('.log-copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                copyLogItem(index);
            });
        });
    } catch (e) {
        elements.logsList.innerHTML = '<div class="logs-empty">加载失败: ' + e.message + '</div>';
    }
}

async function clearLogs() {
    try {
        await chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' });
        elements.logsList.innerHTML = '<div class="logs-empty">暂无日志</div>';
        showToast('日志已清空');
    } catch (e) {
        showToast('清空失败: ' + e.message);
    }
}

function formatLogTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('zh-CN') + '.' + date.getMilliseconds().toString().padStart(3, '0');
}

function formatLogData(data) {
    if (typeof data === 'string') return escapeHtml(data);
    try {
        return escapeHtml(JSON.stringify(data, null, 2));
    } catch (e) {
        return escapeHtml(String(data));
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function copyAllLogs() {
    if (currentLogs.length === 0) {
        showToast('暂无日志可复制');
        return;
    }

    const text = currentLogs.map(log => {
        return `[${log.type}] ${log.timestamp}\n${JSON.stringify(log.data, null, 2)}`;
    }).join('\n\n---\n\n');

    try {
        await navigator.clipboard.writeText(text);
        showToast('已复制全部日志');
    } catch (e) {
        showToast('复制失败: ' + e.message);
    }
}

async function copyLogItem(index) {
    if (index < 0 || index >= currentLogs.length) return;

    const log = currentLogs[index];
    const text = `[${log.type}] ${log.timestamp}\n${JSON.stringify(log.data, null, 2)}`;

    try {
        await navigator.clipboard.writeText(text);
        showToast('已复制此条日志');
    } catch (e) {
        showToast('复制失败: ' + e.message);
    }
}
