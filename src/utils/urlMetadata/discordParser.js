const URL = require('url');
const logger = require('../logger');
const promptLoader = require('../promptLoader');

const URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md';

// 匹配 Discord 內部頻道或訊息網址格式
// 例如: https://discord.com/channels/1020298446613254174/1522337167261565151/1550536564570980393
// 或: https://canary.discord.com/channels/1020298446613254174/1522337167261565151
const DISCORD_CHANNEL_REGEX = /^https?:\/\/(?:[a-zA-Z0-9-]+\.)?discord(?:app)?\.com\/channels\/(\d+|@me)\/(\d+)(?:\/(\d+))?\/?$/i;

/**
 * 檢查是否為 Discord 內部頻道或訊息網址
 * @param {string} urlString 
 * @returns {boolean}
 */
function match(urlString) {
    if (!urlString || typeof urlString !== 'string') return false;
    return DISCORD_CHANNEL_REGEX.test(urlString.trim());
}

/**
 * 解析 Discord 內部頻道或訊息連結
 * @param {string} urlString 
 * @param {Object} context 上下文資訊，包含 { client, currentGuildId }
 * @returns {Promise<{text: string, images: string[]}>}
 */
async function parse(urlString, context = {}) {
    const trimmed = (urlString || '').trim();
    const regexMatch = trimmed.match(DISCORD_CHANNEL_REGEX);
    if (!regexMatch) {
        return null;
    }

    const guildId = regexMatch[1];
    const channelId = regexMatch[2];
    const messageId = regexMatch[3] || null;

    const client = context.client;
    const currentGuildId = context.currentGuildId;

    // 若無 client 實例，安全標記為無法讀取，嚴禁 fallback 至外部爬蟲抓取宣傳圖
    if (!client) {
        return {
            text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_no_client'),
            images: []
        };
    }

    // 存取範圍約束：僅限同一伺服器（非 @me 且設定了 currentGuildId 時進行比對）
    if (guildId !== '@me' && currentGuildId && guildId !== currentGuildId) {
        logger.debug(`[DiscordParser] 略過跨伺服器 Discord 連結: 來源伺服器 ${currentGuildId} -> 目標伺服器 ${guildId}`);
        return {
            text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_cross_guild'),
            images: []
        };
    }

    try {
        // 嘗試獲取目標頻道或討論串 (Thread)
        const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);

        if (!channel) {
            return {
                text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_channel_unavailable'),
                images: []
            };
        }

        const channelName = channel.name || promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_unknown_channel');

        // 若為特定訊息連結
        if (messageId) {
            // 嘗試獲取目標訊息
            let targetMsg = null;
            if (channel.messages && typeof channel.messages.fetch === 'function') {
                targetMsg = channel.messages.cache.get(messageId) || await channel.messages.fetch(messageId).catch(() => null);
            }

            if (!targetMsg) {
                return {
                    text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_message_unavailable', { channel_name: channelName }),
                    images: []
                };
            }

            const authorName = targetMsg.member?.displayName || targetMsg.author?.globalName || targetMsg.author?.username || promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_unknown_user');
            const msgContent = (targetMsg.cleanContent || targetMsg.content || '').trim();

            // 提取該訊息中真實附加的圖片
            const images = [];
            if (targetMsg.attachments && targetMsg.attachments.size > 0) {
                for (const attachment of targetMsg.attachments.values()) {
                    const isImg = (attachment.contentType && attachment.contentType.startsWith('image/')) ||
                                  /\.(png|jpe?g|gif|webp|bmp)$/i.test(attachment.name || attachment.url);
                    if (isImg && attachment.url) {
                        images.push(attachment.url);
                    }
                }
            }

            const imgText = images.length > 0
                ? ' ' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_media_count', { count: images.length })
                : '';
            const displayText = msgContent || (images.length > 0
                ? promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_image_only_text')
                : promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_no_text_content'));

            return {
                text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_quoted_message', {
                    channel_name: channelName,
                    author_name: authorName,
                    media_text: imgText,
                    content: displayText
                }),
                images: images
            };
        }

        // 若僅為頻道或討論串連結
        const topicText = channel.topic
            ? ' ' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_channel_topic', { topic: channel.topic })
            : '';
        return {
            text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_channel_reference', {
                channel_name: channelName,
                topic_text: topicText
            }),
            images: []
        };
    } catch (err) {
        logger.warn(`[DiscordParser] 解析 Discord 連結異常 (${trimmed}): ${err.message}`);
        return {
            text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_read_error'),
            images: []
        };
    }
}

module.exports = {
    match,
    parse
};
