/**
 * 截图导出模块
 * 使用原生 Canvas API 实现截图功能
 */

/**
 * 将 HTML 内容转换为固定尺寸的图片
 * @param {HTMLElement} container - 包含渲染内容的容器
 * @param {Object} options - 配置选项
 * @returns {Promise<Blob>} - 图片 Blob
 */
export async function captureToImage(container, options = {}) {
    const {
        width = 1080,
        height = 800,
        backgroundColor = '#ffffff',
        scale = 2 // 高清屏幕
    } = options;

    // 创建离屏 canvas
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    // 填充背景色
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // 使用 foreignObject 将 HTML 渲染到 canvas
    const svgData = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width: ${width}px; height: ${height}px; overflow: hidden;">
          ${container.innerHTML}
        </div>
      </foreignObject>
    </svg>
  `;

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);

            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create image blob'));
                }
            }, 'image/png');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load SVG image'));
        };
        img.src = url;
    });
}

/**
 * 使用 html2canvas 方式截图（更可靠）
 * 这是一个简化的实现，实际使用中可以引入 html2canvas 库
 */
export async function captureWithClone(sourceIframe, options = {}) {
    const {
        width = 1080,
        height = 800,
        backgroundColor = '#ffffff'
    } = options;

    // 获取 iframe 的内容
    let htmlContent = '';
    try {
        if (sourceIframe.contentDocument) {
            htmlContent = sourceIframe.contentDocument.documentElement.outerHTML;
        } else if (sourceIframe.srcdoc) {
            htmlContent = sourceIframe.srcdoc;
        }
    } catch (e) {
        console.error('Cannot access iframe content:', e);
        throw new Error('无法访问 iframe 内容');
    }

    // 创建一个隐藏的容器
    const container = document.createElement('div');
    container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: ${width}px;
    height: ${height}px;
    background: ${backgroundColor};
    overflow: hidden;
  `;

    // 创建内部 iframe 来渲染内容
    const tempIframe = document.createElement('iframe');
    tempIframe.style.cssText = `
    width: ${width}px;
    height: ${height}px;
    border: none;
  `;
    tempIframe.sandbox = 'allow-same-origin';

    container.appendChild(tempIframe);
    document.body.appendChild(container);

    return new Promise((resolve, reject) => {
        tempIframe.onload = async () => {
            try {
                // 等待渲染完成
                await new Promise(r => setTimeout(r, 500));

                // 由于跨域限制，这里使用简单的截图方法
                // 实际项目中建议使用 html2canvas 库
                const blob = await captureToImage(tempIframe.contentDocument.body, options);
                resolve(blob);
            } catch (e) {
                reject(e);
            } finally {
                document.body.removeChild(container);
            }
        };

        tempIframe.srcdoc = htmlContent;
    });
}

/**
 * 下载图片
 * @param {Blob} blob - 图片 Blob
 * @param {string} filename - 文件名
 */
export function downloadImage(blob, filename = 'article-card.png') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 下载 HTML 代码
 * @param {string} html - HTML 内容
 * @param {string} filename - 文件名
 */
export function downloadHtml(html, filename = 'article-card.html') {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 复制内容到剪贴板
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // 降级方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position: fixed; left: -9999px;';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
    }
}
