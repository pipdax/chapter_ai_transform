/**
 * API 调用模块
 * 支持 OpenAI 兼容的流式接口
 */

/**
 * 发送流式请求到 AI 模型
 * @param {Object} config - 模型配置
 * @param {string} prompt - 完整的 prompt
 * @param {Function} onChunk - 收到数据块时的回调
 * @param {Function} onComplete - 完成时的回调
 * @param {Function} onError - 错误时的回调
 * @returns {AbortController} - 用于取消请求
 */
export function streamRequest(config, prompt, onChunk, onComplete, onError) {
    const controller = new AbortController();

    const { endpoint, model, apiKey, temperature, maxTokens } = config;

    const requestBody = {
        model: model,
        messages: [
            {
                role: 'user',
                content: prompt
            }
        ],
        temperature: temperature,
        max_tokens: maxTokens,
        stream: true
    };

    fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
    })
        .then(async (response) => {
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error (${response.status}): ${errorText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    onComplete(fullContent);
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                // 按行解析 SSE 数据
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // 保留不完整的行

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
                                onChunk(content, fullContent);
                            }
                        } catch (e) {
                            // 解析失败，跳过这一行
                            console.warn('Failed to parse SSE line:', trimmedLine);
                        }
                    }
                }
            }
        })
        .catch((error) => {
            if (error.name === 'AbortError') {
                console.log('Request aborted');
                return;
            }
            onError(error);
        });

    return controller;
}

/**
 * 测试 API 连通性
 * @param {Object} config - 模型配置
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function testConnection(config) {
    const { endpoint, model, apiKey } = config;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 5
            })
        });

        if (response.ok) {
            return { success: true, message: '连接成功' };
        } else {
            const errorText = await response.text();
            return { success: false, message: `连接失败: ${response.status} - ${errorText}` };
        }
    } catch (error) {
        return { success: false, message: `连接失败: ${error.message}` };
    }
}
