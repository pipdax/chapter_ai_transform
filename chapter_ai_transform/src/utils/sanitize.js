/**
 * HTML 安全净化模块
 */

// 允许的 HTML 标签白名单
const ALLOWED_TAGS = [
    'div', 'span', 'p', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'blockquote', 'pre', 'code',
    'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark',
    'a', 'img',
    'figure', 'figcaption',
    'article', 'section', 'header', 'footer', 'main', 'aside', 'nav',
    'style' // 允许内联样式标签
];

// 允许的属性白名单
const ALLOWED_ATTRS = {
    '*': ['class', 'id', 'style'],
    'a': ['href', 'title', 'target', 'rel'],
    'img': ['src', 'alt', 'width', 'height', 'loading'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan', 'scope']
};

// 危险属性黑名单
const DANGEROUS_ATTRS = [
    'onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'onblur',
    'onsubmit', 'onreset', 'onchange', 'oninput', 'onkeydown', 'onkeyup'
];

/**
 * 从 Markdown 代码块中提取 HTML
 * 自动清洗 ```html ... ``` 标记及其前后的额外内容
 * 增强版：处理 LLM 返回的各种噪声
 */
export function extractHtmlFromMarkdown(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    let result = text;

    // 1. 尝试匹配 ```html ... ``` 或 ``` ... ```（完整闭合）
    const closedRegex = /```(?:html|HTML)?[\s\n]*?([\s\S]*?)```/;
    const closedMatch = result.match(closedRegex);

    if (closedMatch) {
        result = closedMatch[1].trim();
    } else {
        // 2. 尝试匹配未闭合的 ```html（流式传输中可能未完成）
        const openRegex = /```(?:html|HTML)?[\s\n]*?([\s\S]*?)$/;
        const openMatch = result.match(openRegex);

        if (openMatch && openMatch[1].includes('<')) {
            result = openMatch[1].trim();
        }
    }

    // 3. 移除代码块前后的说明文字
    // 移除 "以下是..." "这是..." "好的，" "当然，" 等开头
    result = result.replace(/^(以下是|这是|好的[，,]|当然[，,]|我[已来为]|下面是|这里是|请[看查]|现在|为您|根据|接下来)[^\n<]*\n*/gi, '');

    // 移除 "希望这..." "如果您..." "请注意..." 等结尾说明
    result = result.replace(/\n*(希望这|如果[您你]|请注意|如[有需]要|以上是|这个|如果|让我知道|请[让告])[^\n]*$/gi, '');

    // 4. 提取 <!DOCTYPE html> 到 </html> 之间的内容
    const htmlDocMatch = result.match(/<!DOCTYPE\s+html[\s\S]*?<\/html>/i);
    if (htmlDocMatch) {
        return htmlDocMatch[0].trim();
    }

    // 5. 提取 <html> 到 </html> 之间的内容
    const htmlTagMatch = result.match(/<html[\s\S]*?<\/html>/i);
    if (htmlTagMatch) {
        return htmlTagMatch[0].trim();
    }

    // 6. 检查是否以 < 开头（可能是部分 HTML）
    const trimmed = result.trim();
    if (trimmed.startsWith('<') || trimmed.startsWith('<!')) {
        // 移除末尾可能的非 HTML 文字
        // 查找最后一个 > 的位置
        const lastTagEnd = trimmed.lastIndexOf('>');
        if (lastTagEnd > 0) {
            // 检查 > 后面是否有非空白字符
            const afterTag = trimmed.substring(lastTagEnd + 1).trim();
            if (afterTag && !afterTag.startsWith('<')) {
                // 移除 > 后面的内容
                return trimmed.substring(0, lastTagEnd + 1);
            }
        }
        return trimmed;
    }

    // 7. 最后尝试：查找任何 HTML 结构
    const anyHtmlMatch = result.match(/<(!DOCTYPE|html|head|body|div|style)[^>]*>[\s\S]*$/i);
    if (anyHtmlMatch) {
        return anyHtmlMatch[0].trim();
    }

    // 否则返回空字符串（等待更多内容）
    return '';
}

/**
 * 净化 HTML 内容
 * 移除危险元素和属性，保留白名单内容
 */
export function sanitizeHtml(html) {
    // 防御性检查
    if (!html || typeof html !== 'string' || html.trim() === '') {
        return '';
    }

    try {
        // 创建一个临时容器解析 HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 检查 body 是否存在
        if (!doc || !doc.body) {
            console.warn('[sanitizeHtml] Failed to parse HTML, returning empty');
            return '';
        }

        // 提取 head 中的 style 标签
        let styleContent = '';
        const styleTags = doc.querySelectorAll('head style, style');
        styleTags.forEach(style => {
            styleContent += style.outerHTML + '\n';
        });

        // 递归净化节点
        function sanitizeNode(node) {
            if (!node) return;

            if (node.nodeType === Node.TEXT_NODE) {
                return;
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();

                // 移除不在白名单中的标签（但保留其内容）
                if (!ALLOWED_TAGS.includes(tagName)) {
                    // 特殊处理 script 和危险标签：完全移除
                    if (['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'].includes(tagName)) {
                        node.remove();
                        return;
                    }
                    // 其他标签：用 span 替换
                    const span = document.createElement('span');
                    while (node.firstChild) {
                        span.appendChild(node.firstChild);
                    }
                    node.parentNode?.replaceChild(span, node);
                    sanitizeNode(span);
                    return;
                }

                // 移除危险属性
                const attrs = Array.from(node.attributes);
                for (const attr of attrs) {
                    const attrName = attr.name.toLowerCase();

                    // 检查是否为危险属性
                    if (DANGEROUS_ATTRS.includes(attrName) || attrName.startsWith('on')) {
                        node.removeAttribute(attr.name);
                        continue;
                    }

                    // 检查是否在允许列表中
                    const allowedForTag = ALLOWED_ATTRS[tagName] || [];
                    const allowedForAll = ALLOWED_ATTRS['*'] || [];
                    if (!allowedForTag.includes(attrName) && !allowedForAll.includes(attrName)) {
                        node.removeAttribute(attr.name);
                        continue;
                    }

                    // 检查 href 和 src 中的危险协议
                    if ((attrName === 'href' || attrName === 'src') && attr.value) {
                        const value = attr.value.toLowerCase().trim();
                        if (value.startsWith('javascript:') || value.startsWith('data:text/html')) {
                            node.removeAttribute(attr.name);
                        }
                    }
                }

                // 递归处理子节点
                const children = Array.from(node.childNodes);
                for (const child of children) {
                    sanitizeNode(child);
                }
            }
        }

        // 净化 body 的子节点（不处理 body 本身）
        Array.from(doc.body.childNodes).forEach(child => sanitizeNode(child));

        // 移除 body 中已经提取的 style 标签（避免重复）
        doc.body.querySelectorAll('style').forEach(style => style.remove());

        // 拼接 style 和 body 内容
        const bodyContent = doc.body.innerHTML || '';
        const result = styleContent + bodyContent;

        return result;
    } catch (e) {
        console.error('[sanitizeHtml] Error:', e);
        return '';
    }
}

/**
 * 完整的 HTML 处理流程
 * 1. 从 Markdown 提取 HTML
 * 2. 净化 HTML
 */
export function processAIOutput(text) {
    const html = extractHtmlFromMarkdown(text);
    return sanitizeHtml(html);
}
