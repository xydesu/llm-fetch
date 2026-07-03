import os
import re
import urllib.parse
import requests
from ..logger import logger

YOUTUBE_DOMAINS = ['youtube.com', 'youtu.be']

def extract_video_id(url_string):
    try:
        parsed = urllib.parse.urlparse(url_string)
        hostname = parsed.hostname.replace('www.', '') if parsed.hostname else ''
        
        if hostname not in YOUTUBE_DOMAINS:
            return None
            
        if hostname == 'youtu.be':
            return parsed.path[1:]
            
        if parsed.path == '/watch':
            query = urllib.parse.parse_qs(parsed.query)
            return query.get('v', [None])[0]
            
        if parsed.path.startswith('/shorts/') or parsed.path.startswith('/embed/'):
            parts = parsed.path.split('/')
            return parts[2] if len(parts) > 2 else None
            
        return None
    except Exception:
        return None

def match(url_string):
    return extract_video_id(url_string) is not None

def format_number(num_str):
    if not num_str:
        return '0'
    try:
        return "{:,}".format(int(num_str))
    except ValueError:
        return num_str

def parse(url_string):
    video_id = extract_video_id(url_string)
    if not video_id:
        return None
        
    api_key = os.environ.get('YOUTUBE_API_KEY')
    if not api_key:
        logger.warning('[YouTube 解析] 未設定 YOUTUBE_API_KEY 環境變數，跳過解析。')
        return None
        
    try:
        api_url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id={video_id}&key={api_key}"
        response = requests.get(api_url, timeout=5)
        if not response.ok:
            logger.error(f"[YouTube API 錯誤] HTTP {response.status_code}")
            return None
            
        data = response.json()
        if not data.get('items'):
            return None
            
        video = data['items'][0]
        snippet = video.get('snippet', {})
        statistics = video.get('statistics', {})
        
        channel_title = snippet.get('channelTitle', 'Unknown')
        title = snippet.get('title', 'Unknown')
        view_count = format_number(statistics.get('viewCount'))
        
        description = snippet.get('description', '')
        if len(description) > 200:
            description = description[:200] + '...'
            
        result_text = f"[YouTube 影片 | 頻道: {channel_title} | 觀看次數: {view_count}]\n標題: {title}\n描述: {description}"
        
        return {
            'text': result_text,
            'images': []
        }
    except Exception as e:
        logger.error(f"[YouTube 網址解析失敗] {str(e)}")
        
    return None
