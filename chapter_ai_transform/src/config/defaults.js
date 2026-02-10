/**
 * 默认配置
 */
export const DEFAULT_MODEL_CONFIG = {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    apiKey: '',
    temperature: 0.7,
    maxTokens: 4096
};

export const DEFAULT_UI_CONFIG = {
    theme: 'light',
    panelWidth: 480,
    autoExtract: true,
    showFloatingBubble: true
};

export const SENSITIVE_SITES = [
    'bank',
    'login',
    'signin',
    'payment',
    'checkout',
    'mail.google.com',
    'outlook.live.com',
    'mail.qq.com'
];

/**
 * 检测是否为敏感站点
 */
export function isSensitiveSite(url) {
    const lowerUrl = url.toLowerCase();
    return SENSITIVE_SITES.some(keyword => lowerUrl.includes(keyword));
}
