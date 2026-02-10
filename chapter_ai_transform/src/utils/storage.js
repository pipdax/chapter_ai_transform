/**
 * Chrome Storage 工具模块
 */

const STORAGE_KEYS = {
    MODEL_CONFIG: 'modelConfig',
    CUSTOM_PROMPTS: 'customPrompts',
    HISTORY: 'history',
    UI_CONFIG: 'uiConfig'
};

/**
 * 获取存储数据
 */
export async function getStorage(key) {
    return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
            resolve(result[key]);
        });
    });
}

/**
 * 设置存储数据
 */
export async function setStorage(key, value) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, resolve);
    });
}

/**
 * 获取模型配置
 */
export async function getModelConfig() {
    const config = await getStorage(STORAGE_KEYS.MODEL_CONFIG);
    return config || null;
}

/**
 * 保存模型配置
 */
export async function saveModelConfig(config) {
    await setStorage(STORAGE_KEYS.MODEL_CONFIG, config);
}

/**
 * 获取自定义 Prompt 列表
 */
export async function getCustomPrompts() {
    const prompts = await getStorage(STORAGE_KEYS.CUSTOM_PROMPTS);
    return prompts || [];
}

/**
 * 保存自定义 Prompt 列表
 */
export async function saveCustomPrompts(prompts) {
    await setStorage(STORAGE_KEYS.CUSTOM_PROMPTS, prompts);
}

/**
 * 添加自定义 Prompt
 */
export async function addCustomPrompt(prompt) {
    const prompts = await getCustomPrompts();
    const newPrompt = {
        ...prompt,
        id: `custom-${Date.now()}`,
        isCustom: true
    };
    prompts.push(newPrompt);
    await saveCustomPrompts(prompts);
    return newPrompt;
}

/**
 * 删除自定义 Prompt
 */
export async function deleteCustomPrompt(id) {
    const prompts = await getCustomPrompts();
    const filtered = prompts.filter(p => p.id !== id);
    await saveCustomPrompts(filtered);
}

/**
 * 获取历史记录
 */
export async function getHistory() {
    const history = await getStorage(STORAGE_KEYS.HISTORY);
    return history || [];
}

/**
 * 添加历史记录
 */
export async function addHistory(record) {
    const history = await getHistory();
    const newRecord = {
        ...record,
        id: `history-${Date.now()}`,
        timestamp: Date.now()
    };
    // 最多保留 50 条记录
    history.unshift(newRecord);
    if (history.length > 50) {
        history.pop();
    }
    await setStorage(STORAGE_KEYS.HISTORY, history);
    return newRecord;
}

/**
 * 清空历史记录
 */
export async function clearHistory() {
    await setStorage(STORAGE_KEYS.HISTORY, []);
}

/**
 * 获取 UI 配置
 */
export async function getUIConfig() {
    const config = await getStorage(STORAGE_KEYS.UI_CONFIG);
    return config || null;
}

/**
 * 保存 UI 配置
 */
export async function saveUIConfig(config) {
    await setStorage(STORAGE_KEYS.UI_CONFIG, config);
}
