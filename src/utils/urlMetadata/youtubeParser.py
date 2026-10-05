import os
import urllib.parse
import urllib.request
import json
import logging
from .. import promptLoader

URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md'
YOUTUBE_DOMAINS = ['youtube.com', 'youtu.be']

def extract_video_id(url_string):
    """
    檢查是否為 YouTube 網址，並提取 video id
    """
    try:
        parsed = urllib.parse.urlparse(url_string)
        hostname = parsed.hostname
        if hostname is None:
            return None
            
        hostname = hostname.replace('www.', '')
        
        if hostname not in YOUTUBE_DOMAINS:
            return None

        # 處理 youtu.be/VIDEO_ID
        if hostname == 'youtu.be':
            return parsed.path[1:]

        # 處理 youtube.com/watch?v=VIDEO_ID
        if parsed.path == '/watch':
            query = urllib.parse.parse_qs(parsed.query)
            if 'v' in query:
                return query['v'][0]
            return None

        # 處理 youtube.com/shorts/VIDEO_ID 或 youtube.com/embed/VIDEO_ID
        if parsed.path.startswith('/shorts/') or parsed.path.startswith('/embed/'):
            parts = parsed.path.split('/')
            if len(parts) > 2:
                return parts[2]
            return None

        return None
    except Exception:
        return None


def match(url_string):
    return extract_video_id(url_string) is not None


def format_number(num_str):
    """
    格式化數字 (例如 1000000 -> 1,000,000)
    """
    if not num_str:
        return '0'
    try:
        return f"{int(num_str):,}"
    except ValueError:
        return '0'


async def parse(url_string):
    """
    解析 YouTube 網址並使用 Data API 提取內容
    """
    video_id = extract_video_id(url_string)
    if not video_id:
        return None

    api_key = os.environ.get('YOUTUBE_API_KEY')
    if not api_key:
        logging.warning('[YouTube 解析] 未設定 YOUTUBE_API_KEY 環境變數，跳過解析。')
        return None

    try:
        api_url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id={video_id}&key={api_key}"
        
        req = urllib.request.Request(api_url)
        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                logging.error(f"[YouTube API 錯誤] HTTP {response.status}")
                return None
            data = json.loads(response.read().decode('utf-8'))

        if not data.get('items') or len(data['items']) == 0:
            return None

        video = data['items'][0]
        snippet = video.get('snippet', {})
        statistics = video.get('statistics', {})

        channel_title = snippet.get('channelTitle', 'Unknown')
        title = snippet.get('title', 'Unknown')
        view_count = format_number(statistics.get('viewCount'))
        
        # 擷取前 200 個字的描述
        description = snippet.get('description', '')
        if len(description) > 200:
            description = description[:200] + '...'

        # 提取影片縮圖
        thumbnails = snippet.get('thumbnails', {})
        thumb_url = None
        for res in ['maxres', 'standard', 'high', 'medium', 'default']:
            if res in thumbnails and 'url' in thumbnails[res]:
                thumb_url = thumbnails[res]['url']
                break
        
        if not thumb_url:
            thumb_url = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

        images = [thumb_url] if thumb_url else []

        description_text = description
        if not description_text:
            # 支援 renderPromptSection (JS 風格) 或 render_prompt_section (Python 風格)
            render_func = getattr(promptLoader, 'render_prompt_section', getattr(promptLoader, 'renderPromptSection', lambda *args: ''))
            description_text = render_func(URL_CONTEXT_PROMPT_FILE, 'youtube_no_description')

        render_func = getattr(promptLoader, 'render_prompt_section', getattr(promptLoader, 'renderPromptSection', lambda *args: ''))
        
        result_text = render_func(
            URL_CONTEXT_PROMPT_FILE, 
            'youtube_video', 
            {
                'channel_title': channel_title,
                'view_count': view_count,
                'title': title,
                'description': description_text
            }
        )

        return {
            'text': result_text,
            'images': images
        }
    except Exception as e:
        logging.error(f"[YouTube 網址解析失敗] {str(e)}")

    return None
