/**
 * Content Script
 * 负责页面内容抽取、悬浮气泡、Shadow DOM 容器
 */

// 避免重复注入
if (window.__AI_TRANSFORM_INJECTED__) {
    console.log('[AI Transform] Already injected, skipping...');
} else {
    window.__AI_TRANSFORM_INJECTED__ = true;
    initContentScript();
}

// 保存 shadow 引用（因为 closed 模式下 shadowRoot 返回 null）
let panelShadow = null;
let panelVisible = false;

function initContentScript() {
    console.log('[AI Transform] Content script initialized');

    // 监听来自 background 的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.type) {
            case 'PING':
                sendResponse({ success: true });
                break;

            case 'TOGGLE_PANEL':
                togglePanel();
                sendResponse({ success: true });
                break;

            case 'REQUEST_AUTO_CONTENT':
                const autoContent = extractMainContent();
                sendResponse(autoContent);
                break;

            case 'REQUEST_SELECTION_CONTENT':
                const selectionContent = getSelectionContent();
                sendResponse(selectionContent);
                break;

            case 'OPEN_CONFIG':
                togglePanel(true); // 打开面板
                // 通知 UI 打开配置
                setTimeout(() => {
                    forwardMessageToIframe({ type: 'OPEN_CONFIG' });
                }, 300);
                sendResponse({ success: true });
                break;

            // 流式消息转发到 iframe
            case 'STREAM_CHUNK':
            case 'STREAM_COMPLETE':
            case 'STREAM_ERROR':
            case 'STREAM_ABORTED':
                forwardMessageToIframe(message);
                sendResponse({ success: true });
                break;

            default:
                sendResponse({ error: 'Unknown message type' });
        }
        return true; // 保持消息通道开放
    });

    // 监听 iframe 发来的消息（如生成完成通知）
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'GENERATION_COMPLETE') {
            // 如果面板已最小化，显示徽标
            if (!panelVisible) {
                showBubbleBadge();
            }
        }
    });

    // 注意：不再自动创建悬浮气泡，只有用户点击扩展图标后才显示
}

/**
 * 转发消息到 iframe
 */
function forwardMessageToIframe(message) {
    const container = document.querySelector('#ai-transform-container');
    if (container && panelShadow) {
        const iframe = panelShadow.querySelector('.panel-frame');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(message, '*');
        }
    }
}

/**
 * 显示悬浮气泡上的徽标
 */
function showBubbleBadge() {
    const badge = document.querySelector('#bubbleBadge');
    if (badge) {
        badge.classList.remove('hidden');
    }
}

/**
 * 隐藏悬浮气泡上的徽标
 */
function hideBubbleBadge() {
    const badge = document.querySelector('#bubbleBadge');
    if (badge) {
        badge.classList.add('hidden');
    }
}

/**
 * 提取页面主要内容
 */
function extractMainContent() {
    const pageTitle = document.title || '';
    const pageUrl = window.location.href;

    // 尝试多种选择器获取主内容区域
    const selectors = [
        'article',
        '[role="main"]',
        'main',
        '.post-content',
        '.article-content',
        '.entry-content',
        '.content',
        '#content',
        '.post',
        '.article'
    ];

    let mainElement = null;
    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim().length > 200) {
            mainElement = el;
            break;
        }
    }

    // 如果没找到，使用 body
    if (!mainElement) {
        mainElement = document.body;
    }

    // 克隆并清理内容
    const clone = mainElement.cloneNode(true);

    // 移除不需要的元素
    const removeSelectors = [
        'script', 'style', 'noscript', 'iframe', 'object', 'embed',
        'nav', 'header', 'footer', 'aside',
        '.nav', '.navigation', '.menu', '.sidebar', '.ads', '.advertisement',
        '.comment', '.comments', '#comments', '.share', '.social',
        '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]'
    ];

    removeSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // 获取纯文本内容
    let content = '';

    // 保留一定的结构
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node;
    let lastWasBlock = false;

    while (node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text) {
                content += (lastWasBlock ? '\n\n' : ' ') + text;
                lastWasBlock = false;
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'section', 'article', 'li', 'br'].includes(tagName)) {
                lastWasBlock = true;
            }
        }
    }

    // 清理多余空白
    content = content
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();

    const characters = content.length;
    const estimatedTokens = Math.ceil(characters / 2); // 中文大约 2 字符/token

    return {
        title: pageTitle,
        url: pageUrl,
        content: content,
        characters: characters,
        estimatedTokens: estimatedTokens
    };
}

/**
 * 获取用户选中的内容
 */
function getSelectionContent() {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (!selectedText) {
        return {
            title: document.title || '',
            url: window.location.href,
            content: '',
            characters: 0,
            estimatedTokens: 0,
            isEmpty: true
        };
    }

    const characters = selectedText.length;
    const estimatedTokens = Math.ceil(characters / 2);

    return {
        title: document.title || '',
        url: window.location.href,
        content: selectedText,
        characters: characters,
        estimatedTokens: estimatedTokens
    };
}

/**
 * 创建悬浮气泡
 */
function createFloatingBubble() {
    // 检查是否已存在
    if (document.querySelector('#ai-transform-bubble')) {
        return;
    }

    const bubble = document.createElement('div');
    bubble.id = 'ai-transform-bubble';
    bubble.innerHTML = `
    <style>
      #ai-transform-bubble {
        position: fixed;
        right: 20px;
        bottom: 20px;
        padding: 12px 16px;
        border-radius: 24px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
        cursor: pointer;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        user-select: none;
      }
      #ai-transform-bubble:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 30px rgba(102, 126, 234, 0.6);
      }
      #ai-transform-bubble:active {
        transform: scale(0.95);
      }
      #ai-transform-bubble .bubble-icon {
        font-size: 14px;
        color: white;
        font-weight: 600;
        white-space: nowrap;
        text-shadow: 0 1px 2px rgba(0,0,0,0.2);
      }
      #ai-transform-bubble.hidden {
        transform: scale(0);
        opacity: 0;
        pointer-events: none;
      }
      #ai-transform-bubble .bubble-badge {
        position: absolute;
        top: -6px;
        right: -6px;
        width: 20px;
        height: 20px;
        background: #ff4757;
        border-radius: 50%;
        color: white;
        font-size: 12px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(255, 71, 87, 0.5);
        animation: badge-pulse 2s infinite;
      }
      #ai-transform-bubble .bubble-badge.hidden {
        display: none;
      }
      @keyframes badge-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
    </style>
    <span class="bubble-icon">网页信息AI转换</span>
    <span class="bubble-badge hidden" id="bubbleBadge">1</span>
  `;

    // 支持拖拽
    let isDragging = false;
    let startX, startY, startRight, startBottom;

    bubble.addEventListener('mousedown', (e) => {
        isDragging = false;
        startX = e.clientX;
        startY = e.clientY;
        startRight = parseInt(bubble.style.right) || 20;
        startBottom = parseInt(bubble.style.bottom) || 20;

        const onMouseMove = (e) => {
            const deltaX = startX - e.clientX;
            const deltaY = startY - e.clientY;

            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                isDragging = true;
                bubble.style.right = Math.max(10, startRight + deltaX) + 'px';
                bubble.style.bottom = Math.max(10, startBottom + deltaY) + 'px';
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    bubble.addEventListener('click', (e) => {
        if (isDragging) {
            e.stopPropagation();
            isDragging = false;
            return;
        }
        togglePanel();
    });

    document.body.appendChild(bubble);
}

/**
 * 创建面板容器（Shadow DOM + iframe）
 */
function createPanelContainer() {
    const existing = document.querySelector('#ai-transform-container');
    if (existing && panelShadow) {
        return { container: existing, shadow: panelShadow };
    }

    const container = document.createElement('div');
    container.id = 'ai-transform-container';

    // 使用 Shadow DOM 隔离样式（使用 open 模式以便调试）
    const shadow = container.attachShadow({ mode: 'open' });
    panelShadow = shadow; // 保存引用

    const style = document.createElement('style');
    style.textContent = `
    :host {
      all: initial;
    }
    .panel-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 2147483647;
      opacity: 0;
      transition: opacity 0.3s ease;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .panel-overlay.visible {
      opacity: 1;
    }
    .panel-frame {
      width: 95%;
      height: 95%;
      max-height: 95vh;
      border: none;
      border-radius: 16px;
      box-shadow: 0 25px 100px -20px rgba(0, 0, 0, 0.5);
      transform: translateY(20px) scale(0.95);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      background: white;
    }
    .panel-overlay.visible .panel-frame {
      transform: translateY(0) scale(1);
    }
  `;

    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            togglePanel(false);
        }
    });

    const iframe = document.createElement('iframe');
    iframe.className = 'panel-frame';
    // allow-clipboard-write 允许剪贴板写入
    // allow-modals 允许 confirm/alert
    iframe.sandbox = 'allow-scripts allow-forms allow-same-origin allow-modals';
    iframe.allow = 'clipboard-write';

    // 加载 UI HTML
    const panelUrl = chrome.runtime.getURL('src/ui/panel.html');
    iframe.src = panelUrl;

    overlay.appendChild(iframe);
    shadow.appendChild(style);
    shadow.appendChild(overlay);

    document.body.appendChild(container);

    // 监听来自 iframe 的消息
    window.addEventListener('message', (event) => {
        if (event.data.type === 'CLOSE_PANEL') {
            togglePanel(false);
        } else if (event.data.type === 'MINIMIZE_PANEL') {
            togglePanel(false);
        } else if (event.data.type === 'REQUEST_CONTENT') {
            const content = event.data.mode === 'selection'
                ? getSelectionContent()
                : extractMainContent();
            iframe.contentWindow.postMessage({
                type: 'CONTENT_RESPONSE',
                data: content
            }, '*');
        }
    });

    return { container, shadow };
}

/**
 * 切换面板显示状态
 */
function togglePanel(forceState) {
    const { shadow } = createPanelContainer();
    const overlay = shadow.querySelector('.panel-overlay');

    if (!overlay) {
        console.error('[AI Transform] Overlay not found');
        return;
    }

    if (forceState !== undefined) {
        panelVisible = forceState;
    } else {
        panelVisible = !panelVisible;
    }

    if (panelVisible) {
        overlay.style.display = 'flex';
        // 触发动画
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
        // 确保气泡已创建并隐藏
        let bubble = document.querySelector('#ai-transform-bubble');
        if (!bubble) {
            createFloatingBubble();
            bubble = document.querySelector('#ai-transform-bubble');
        }
        if (bubble) bubble.classList.add('hidden');
        // 清除徽标
        hideBubbleBadge();
    } else {
        overlay.classList.remove('visible');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
        // 显示气泡
        const bubble = document.querySelector('#ai-transform-bubble');
        if (bubble) bubble.classList.remove('hidden');
    }
}
