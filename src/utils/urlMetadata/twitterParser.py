import urllib.parse
import re
import aiohttp
import logging
from .. import promptLoader

URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md'

TWITTER_DOMAINS = ['twitter.com', 'x.com', 'fxtwitter.com', 'fixupx.com', 'vxtwitter.com']

def match(url_string: str) -> bool:
    """
    檢查是否為 Twitter/X 相關網址
    """
    try:
        parsed = urllib.parse.urlparse(url_string)
        hostname = parsed.hostname
        if not hostname:
            return False
        return hostname in TWITTER_DOMAINS or any(hostname.endswith('.' + d) for d in TWITTER_DOMAINS)
    except Exception:
        return False

async def parse(url_string: str):
    """
    解析 Twitter/X 網址並提取內容
    """
    try:
        parsed = urllib.parse.urlparse(url_string)
        # 匹配推文 ID： /status/:id 或 /statuses/:id
        match_result = re.search(r'/status(?:es)?/(\d+)', parsed.path)
        if not match_result:
            return None
        
        tweet_id = match_result.group(1)
        api_url = f"https://api.fxtwitter.com/2/status/{tweet_id}"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(api_url) as response:
                if response.status != 200:
                    return None
                data = await response.json()
        
        if data.get('code') == 200 and data.get('status'):
            status_data = data['status']
            author = status_data.get('author', {}).get('name', 'Unknown') if status_data.get('author') else 'Unknown'
            text = (status_data.get('text') or '').strip()
            reposts = status_data.get('reposts', 0)
            likes = status_data.get('likes', 0)
            
            # 媒體內容判斷與縮圖提取
            media_info = []
            images = []
            
            media = status_data.get('media')
            if media:
                photos = media.get('photos')
                if photos and isinstance(photos, list) and len(photos) > 0:
                    # 假設 python 版的 promptLoader 使用 snake_case 命名法
                    media_info.append(promptLoader.render_prompt_section(URL_CONTEXT_PROMPT_FILE, 'twitter_media_photo_count', {'count': len(photos)}))
                    for p in photos:
                        url = p.get('url')
                        if url and url not in images:
                            images.append(url)
                
                video = media.get('video')
                videos = media.get('videos')
                if video or videos:
                    video_list = videos if isinstance(videos, list) else ([video] if video else [])
                    if len(video_list) > 0:
                        media_info.append(promptLoader.render_prompt_section(URL_CONTEXT_PROMPT_FILE, 'twitter_media_video_count', {'count': len(video_list)}))
                    else:
                        media_info.append(promptLoader.render_prompt_section(URL_CONTEXT_PROMPT_FILE, 'twitter_media_video_only', {}))
                    
                    for v in video_list:
                        thumbnail_url = v.get('thumbnail_url')
                        if thumbnail_url and thumbnail_url not in images:
                            images.append(thumbnail_url)
                
                # 備用遍歷 media.all 補全可能遺漏的縮圖
                all_media = media.get('all')
                if isinstance(all_media, list):
                    for item in all_media:
                        thumb = item.get('thumbnail_url') or (item.get('url') if item.get('type') == 'photo' else None)
                        if thumb and thumb not in images:
                            images.append(thumb)
            
            if len(media_info) > 0:
                media_text = ' ' + promptLoader.render_prompt_section(URL_CONTEXT_PROMPT_FILE, 'twitter_media_note', {'media_items': ', '.join(media_info)})
            else:
                media_text = ''
            
            # 確保無文字時明確標示，避免大腦誤將作者暱稱當作推文主題
            if text:
                content_text = text
            elif len(images) > 0:
                content_text = promptLoader.render_prompt_section(URL_CONTEXT_PROMPT_FILE, 'twitter_media_only_text', {})
            else:
                content_text = promptLoader.render_prompt_section(URL_CONTEXT_PROMPT_FILE, 'twitter_no_text', {})
            
            result_text = promptLoader.render_prompt_section(URL_CONTEXT_PROMPT_FILE, 'twitter_post', {
                'author': author,
                'reposts': reposts,
                'likes': likes,
                'media_text': media_text,
                'content_text': content_text
            })
            
            return {
                'text': result_text,
                'images': images
            }
            
    except Exception as e:
        logging.error(f"[Twitter 網址解析失敗] {str(e)}")
        
    # 如果解析失敗但仍是 Twitter 網址，回傳 None 讓其他 parser 接手
    return None
