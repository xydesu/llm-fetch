import re
from typing import Optional, Dict, Any, List

# 假設在 Python 中相對應的 logger 和 promptLoader 模組
from .. import logger
from .. import promptLoader

URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md'

# 匹配 Discord 內部頻道或訊息網址格式
# 例如: https://discord.com/channels/1020298446613254174/1522337167261565151/1550536564570980393
# 或: https://canary.discord.com/channels/1020298446613254174/1522337167261565151
DISCORD_CHANNEL_REGEX = re.compile(
    r'^https?:\/\/(?:[a-zA-Z0-9-]+\.)?discord(?:app)?\.com\/channels\/(\d+|@me)\/(\d+)(?:\/(\d+))?\/?$',
    re.IGNORECASE
)

def match(url_string: str) -> bool:
    """
    檢查是否為 Discord 內部頻道或訊息網址
    """
    if not url_string or not isinstance(url_string, str):
        return False
    return bool(DISCORD_CHANNEL_REGEX.match(url_string.strip()))

async def parse(url_string: str, context: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """
    解析 Discord 內部頻道或訊息連結
    """
    if context is None:
        context = {}
        
    trimmed = (url_string or '').strip()
    regex_match = DISCORD_CHANNEL_REGEX.match(trimmed)
    if not regex_match:
        return None

    guild_id = regex_match.group(1)
    channel_id = regex_match.group(2)
    message_id = regex_match.group(3) if regex_match.lastindex >= 3 else None

    client = context.get('client')
    current_guild_id = context.get('currentGuildId')

    # 若無 client 實例，安全標記為無法讀取，嚴禁 fallback 至外部爬蟲抓取宣傳圖
    if not client:
        return {
            'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_no_client'),
            'images': []
        }

    # 存取範圍約束：僅限同一伺服器（非 @me 且設定了 currentGuildId 時進行比對）
    if guild_id != '@me' and current_guild_id and str(guild_id) != str(current_guild_id):
        logger.debug(f"[DiscordParser] 略過跨伺服器 Discord 連結: 來源伺服器 {current_guild_id} -> 目標伺服器 {guild_id}")
        return {
            'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_cross_guild'),
            'images': []
        }

    try:
        # 嘗試獲取目標頻道或討論串 (Thread)
        channel = None
        if hasattr(client, 'get_channel'):
            channel = client.get_channel(int(channel_id))
            
        if not channel and hasattr(client, 'fetch_channel'):
            try:
                channel = await client.fetch_channel(int(channel_id))
            except Exception:
                channel = None

        if not channel:
            return {
                'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_channel_unavailable'),
                'images': []
            }

        channel_name = getattr(channel, 'name', None) or promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_unknown_channel')

        # 若為特定訊息連結
        if message_id:
            # 嘗試獲取目標訊息
            target_msg = None
            if hasattr(channel, 'fetch_message'):
                try:
                    target_msg = await channel.fetch_message(int(message_id))
                except Exception:
                    target_msg = None

            if not target_msg:
                return {
                    'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_message_unavailable', {'channel_name': channel_name}),
                    'images': []
                }

            author = getattr(target_msg, 'author', None)
            author_name = getattr(author, 'display_name', None) or getattr(author, 'global_name', None) or getattr(author, 'name', None) or getattr(author, 'username', None) or promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_unknown_user')
            
            msg_content = (getattr(target_msg, 'clean_content', None) or getattr(target_msg, 'content', '')).strip()

            # 提取該訊息中真實附加的圖片
            images = []
            attachments = getattr(target_msg, 'attachments', [])
            if attachments:
                for attachment in attachments:
                    content_type = getattr(attachment, 'content_type', '') or ''
                    name = getattr(attachment, 'filename', '') or getattr(attachment, 'url', '')
                    
                    is_img = content_type.startswith('image/') or bool(re.search(r'\.(png|jpe?g|gif|webp|bmp)$', name, re.IGNORECASE))
                    
                    url = getattr(attachment, 'url', None)
                    if is_img and url:
                        images.append(url)

            img_text = (' ' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_media_count', {'count': len(images)})) if images else ''
            
            if msg_content:
                display_text = msg_content
            else:
                if images:
                    display_text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_image_only_text')
                else:
                    display_text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_no_text_content')

            return {
                'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_quoted_message', {
                    'channel_name': channel_name,
                    'author_name': author_name,
                    'media_text': img_text,
                    'content': display_text
                }),
                'images': images
            }

        # 若僅為頻道或討論串連結
        channel_topic = getattr(channel, 'topic', None)
        topic_text = (' ' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_channel_topic', {'topic': channel_topic})) if channel_topic else ''
        
        return {
            'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_channel_reference', {
                'channel_name': channel_name,
                'topic_text': topic_text
            }),
            'images': []
        }
        
    except Exception as err:
        logger.warning(f"[DiscordParser] 解析 Discord 連結異常 ({trimmed}): {str(err)}")
        return {
            'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'discord_read_error'),
            'images': []
        }
