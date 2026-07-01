function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const clean1 = str1.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    const clean2 = str2.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    
    if (clean1.length < 3 || clean2.length < 3) return 0;
    
    // 如果互相包含，且長度差距不大，則視為高度相似
    if (clean1.includes(clean2) || clean2.includes(clean1)) {
        const ratio = Math.min(clean1.length, clean2.length) / Math.max(clean1.length, clean2.length);
        if (ratio > 0.4) return 0.9;
    }
    
    // Jaccard similarity on Bigrams
    const getBigrams = str => {
        const bg = new Set();
        for(let i = 0; i < str.length - 1; i++) bg.add(str.substring(i, i+2));
        return bg;
    };
    
    const bg1 = getBigrams(clean1);
    const bg2 = getBigrams(clean2);
    
    let intersection = 0;
    for (const bg of bg1) {
        if (bg2.has(bg)) intersection++;
    }
    
    const union = bg1.size + bg2.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

/**
 * 進階重複對話偵測
 * @param {string} newText 生成的新文字
 * @param {Array} recentMessages 近期訊息陣列
 * @param {string} botId 機器人ID
 * @param {number} threshold 觸發重複的相似度閾值 (預設 0.4)
 */
function isRepetitive(newText, recentMessages, botId, threshold = 0.4) {
    if (!newText || newText.trim() === '') return false;
    
    // 檢查機器人自己最近發過的訊息 (過去10~20筆內)
    const botMsgs = recentMessages.filter(m => m.user_id === botId || m.is_bot === 1 || m.is_bot === true);
    
    for (const msg of botMsgs) {
        const similarity = calculateSimilarity(newText, msg.content);
        if (similarity >= threshold) {
            return true;
        }
    }
    return false;
}

module.exports = {
    calculateSimilarity,
    isRepetitive
};
