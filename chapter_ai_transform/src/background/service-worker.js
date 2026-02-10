/**
 * Background Service Worker
 * 消息路由、AI 请求转发、右键菜单、调试日志
 */

// 默认配置
const DEFAULT_MODEL_CONFIG = {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    apiKey: '',
    temperature: 0.7,
    maxTokens: 4096
};

// 调试模式
let debugMode = false;

// 请求日志
let requestLogs = [];
const MAX_LOGS = 100;

/**
 * 调试日志
 */
function debugLog(type, data) {
    const logEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        type,
        data
    };

    requestLogs.unshift(logEntry);
    if (requestLogs.length > MAX_LOGS) {
        requestLogs.pop();
    }

    if (debugMode) {
        console.log(`[AI Transform Debug] [${type}]`, data);
    }

    // 保存到 storage
    chrome.storage.local.set({ requestLogs });
}

// 初始化
chrome.runtime.onInstalled.addListener(() => {
    console.log('[AI Transform] Extension installed');

    // 创建右键菜单
    chrome.contextMenus.create({
        id: 'ai-transform-config',
        title: '配置 AI 模型',
        contexts: ['action']
    });

    chrome.contextMenus.create({
        id: 'ai-transform-selection',
        title: '用 AI 可视化选中内容',
        contexts: ['selection']
    });
});

// 启动时加载调试模式状态
chrome.storage.local.get(['debugMode', 'requestLogs']).then(result => {
    debugMode = result.debugMode || false;
    requestLogs = result.requestLogs || [];
});

// 点击扩展图标
chrome.action.onClicked.addListener(async (tab) => {
    await ensureContentScriptInjected(tab);
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
});

// 右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'ai-transform-config') {
        await ensureContentScriptInjected(tab);
        chrome.tabs.sendMessage(tab.id, { type: 'OPEN_CONFIG' });
    } else if (info.menuItemId === 'ai-transform-selection') {
        await ensureContentScriptInjected(tab);
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
        setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, {
                type: 'SET_INPUT_MODE',
                mode: 'selection'
            });
        }, 500);
    }
});

// 消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'GET_MODEL_CONFIG':
            getModelConfig().then(sendResponse);
            return true;

        case 'SAVE_MODEL_CONFIG':
            saveModelConfig(message.config).then(sendResponse);
            return true;

        case 'STREAM_REQUEST':
            handleStreamRequest(message, sender.tab?.id);
            sendResponse({ started: true });
            return true;

        case 'ABORT_REQUEST':
            abortCurrentRequest();
            sendResponse({ success: true });
            return true;

        case 'TEST_CONNECTION':
            testConnection(message.config).then(sendResponse);
            return true;

        case 'GET_DEBUG_MODE':
            sendResponse({ debugMode });
            return true;

        case 'SET_DEBUG_MODE':
            debugMode = message.enabled;
            chrome.storage.local.set({ debugMode });
            debugLog('CONFIG', { action: 'Debug mode changed', enabled: debugMode });
            sendResponse({ success: true });
            return true;

        case 'GET_LOGS':
            // 只保留当天的日志
            const today = new Date().toDateString();
            const todayLogs = requestLogs.filter(log => {
                const logDate = new Date(log.timestamp).toDateString();
                return logDate === today;
            });
            // 如果有旧日志被清理，更新存储
            if (todayLogs.length !== requestLogs.length) {
                requestLogs = todayLogs;
                chrome.storage.local.set({ requestLogs: todayLogs });
            }
            sendResponse({ logs: todayLogs });
            return true;

        case 'CLEAR_LOGS':
            requestLogs = [];
            chrome.storage.local.set({ requestLogs: [] });
            sendResponse({ success: true });
            return true;

        default:
            sendResponse({ error: 'Unknown message type' });
            return false;
    }
});

/**
 * 确保 content script 已注入
 */
async function ensureContentScriptInjected(tab) {
    try {
        await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
    } catch (e) {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['src/content/content-script.js']
        });
    }
}

/**
 * 获取模型配置
 */
async function getModelConfig() {
    const result = await chrome.storage.local.get(['modelConfig']);
    return result.modelConfig || DEFAULT_MODEL_CONFIG;
}

/**
 * 保存模型配置
 */
async function saveModelConfig(config) {
    await chrome.storage.local.set({ modelConfig: config });
    debugLog('CONFIG', { action: 'Model config saved', config: { ...config, apiKey: '***' } });
    return { success: true };
}

/**
 * 当前请求的 AbortController
 */
let currentAbortController = null;
/**
 * 处理流式请求
 */
async function handleStreamRequest(message, tabId) {
    const { config, prompt } = message;

    // 取消之前的请求
    if (currentAbortController) {
        currentAbortController.abort();
    }

    currentAbortController = new AbortController();

    const { endpoint, model, apiKey, temperature, maxTokens } = config;

    // 如果 maxTokens 过大，先尝试原值，失败后降级
    const fallbackMaxTokens = Math.min(maxTokens, 4096);
    const needsFallback = maxTokens > 4096;

    // 记录请求日志
    debugLog('REQUEST', {
        endpoint,
        model,
        temperature,
        maxTokens,
        promptLength: prompt.length,
        prompt: prompt  // 完整 prompt，不截断
    });

    // 先尝试流式请求
    let success = await tryStreamRequest(endpoint, model, apiKey, temperature, maxTokens, prompt, tabId);

    // 如果流式失败，尝试非流式（如果还有降级选项则抑制错误）
    if (!success) {
        debugLog('FALLBACK', { reason: 'Stream request failed, trying non-stream' });
        success = await tryNonStreamRequest(endpoint, model, apiKey, temperature, maxTokens, prompt, tabId, needsFallback);
    }

    // 如果仍然失败且 maxTokens 较大，尝试降级 maxTokens（这是最后一次尝试，不抑制错误）
    if (!success && needsFallback) {
        debugLog('FALLBACK_TOKENS', {
            reason: 'Request failed with large max_tokens, trying smaller value',
            originalMaxTokens: maxTokens,
            fallbackMaxTokens: fallbackMaxTokens
        });
        success = await tryNonStreamRequest(endpoint, model, apiKey, temperature, fallbackMaxTokens, prompt, tabId, false);
    }

    currentAbortController = null;
}

/**
 * 尝试流式请求
 */
async function tryStreamRequest(endpoint, model, apiKey, temperature, maxTokens, prompt, tabId) {
    const requestBody = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature,
        max_tokens: maxTokens,
        stream: true
    };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: currentAbortController.signal
        });

        debugLog('RESPONSE', {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries())
        });

        if (!response.ok) {
            const errorText = await response.text();
            debugLog('STREAM_ERROR', {
                type: 'API_ERROR',
                status: response.status,
                body: errorText.substring(0, 500)
            });
            // 返回 false 表示失败，尝试非流式
            return false;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                debugLog('COMPLETE', {
                    contentLength: fullContent.length,
                    content: fullContent  // 完整内容，不截断
                });
                chrome.tabs.sendMessage(tabId, {
                    type: 'STREAM_COMPLETE',
                    content: fullContent
                });
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();

                if (!trimmedLine || trimmedLine === 'data: [DONE]') {
                    continue;
                }

                if (trimmedLine.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(trimmedLine.slice(6));
                        const content = json.choices?.[0]?.delta?.content;

                        if (content) {
                            fullContent += content;
                            chrome.tabs.sendMessage(tabId, {
                                type: 'STREAM_CHUNK',
                                chunk: content,
                                fullContent: fullContent
                            });
                        }
                    } catch (e) {
                        debugLog('PARSE_ERROR', { line: trimmedLine, error: e.message });
                    }
                }
            }
        }
        return true;
    } catch (error) {
        if (error.name === 'AbortError') {
            debugLog('ABORTED', { reason: 'User cancelled' });
            chrome.tabs.sendMessage(tabId, {
                type: 'STREAM_ABORTED'
            });
            return true; // 用户取消，不需要重试
        }

        debugLog('STREAM_FETCH_ERROR', {
            message: error.message,
            stack: error.stack
        });
        return false;
    }
}

/**
 * 非流式请求（作为流式失败的备选方案）
 * @returns {boolean} 是否成功
 */
async function tryNonStreamRequest(endpoint, model, apiKey, temperature, maxTokens, prompt, tabId, suppressError = false) {
    const requestBody = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature,
        max_tokens: maxTokens
        // 不设置 stream
    };

    debugLog('NON_STREAM_REQUEST', {
        endpoint,
        model,
        maxTokens
    });

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: currentAbortController.signal
        });

        debugLog('NON_STREAM_RESPONSE', {
            status: response.status,
            statusText: response.statusText
        });

        if (!response.ok) {
            const errorText = await response.text();
            debugLog('ERROR', {
                type: 'API_ERROR',
                status: response.status,
                body: errorText.substring(0, 500)
            });
            if (!suppressError) {
                // 针对常见错误提供更有意义的提示
                let errorMsg = `API Error (${response.status})`;
                if (response.status === 502 || response.status === 503 || response.status === 504) {
                    errorMsg = `服务器暂时不可用 (${response.status})。建议：1) 稍后重试 2) 更换API服务商 3) 检查API端点是否正确`;
                } else if (response.status === 401) {
                    errorMsg = `认证失败 (401)。请检查API Key是否正确`;
                } else if (response.status === 429) {
                    errorMsg = `请求过于频繁 (429)。请稍后重试`;
                } else if (errorText.length < 200) {
                    errorMsg = `API Error (${response.status}): ${errorText}`;
                }
                chrome.tabs.sendMessage(tabId, {
                    type: 'STREAM_ERROR',
                    error: errorMsg
                });
            }
            return false;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        debugLog('COMPLETE', {
            contentLength: content.length,
            content: content  // 完整内容，不截断
        });

        chrome.tabs.sendMessage(tabId, {
            type: 'STREAM_COMPLETE',
            content: content
        });
        return true;
    } catch (error) {
        if (error.name === 'AbortError') {
            debugLog('ABORTED', { reason: 'User cancelled' });
            chrome.tabs.sendMessage(tabId, {
                type: 'STREAM_ABORTED'
            });
            return true; // 用户取消，不需要重试
        }

        debugLog('ERROR', {
            type: 'FETCH_ERROR',
            message: error.message
        });

        if (!suppressError) {
            chrome.tabs.sendMessage(tabId, {
                type: 'STREAM_ERROR',
                error: error.message
            });
        }
        return false;
    }
}

/**
 * 取消当前请求
 */
function abortCurrentRequest() {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
}

/**
 * 测试连接
 */
async function testConnection(config) {
    const { endpoint, model, apiKey } = config;

    const requestBody = {
        model: model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
    };

    debugLog('TEST_REQUEST', {
        endpoint,
        model,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey.substring(0, 8)}***`
        },
        body: requestBody
    });

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        const responseText = await response.text();

        debugLog('TEST_RESPONSE', {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: responseText.substring(0, 500)
        });

        if (response.ok) {
            return { success: true, message: '连接成功' };
        } else {
            // 解析错误信息
            let errorMessage = `连接失败: ${response.status}`;
            try {
                const errorJson = JSON.parse(responseText);
                if (errorJson.error?.message) {
                    errorMessage = `连接失败: ${errorJson.error.message}`;
                } else if (errorJson.message) {
                    errorMessage = `连接失败: ${errorJson.message}`;
                }
            } catch (e) {
                if (responseText) {
                    errorMessage = `连接失败: ${response.status} - ${responseText.substring(0, 100)}`;
                }
            }
            return { success: false, message: errorMessage };
        }
    } catch (error) {
        debugLog('TEST_ERROR', {
            type: 'FETCH_ERROR',
            message: error.message
        });
        return { success: false, message: `连接失败: ${error.message}` };
    }
}
