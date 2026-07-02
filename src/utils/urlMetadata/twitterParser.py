import re
import requests
import urllib.parse
from ..logger import logger

TWITTER_DOMAINS = ['twitter.com', 'x.com', 'fxtwitter.com', 'fixupx.com', 'vxtwitter.com']

def match(url):
    try:
        parsed = urllib.parse.urlparse(url)
        hostname = parsed.hostname
        if not hostname:
            return False
        return hostname in TWITTER_DOMAINS or any(hostname.endswith('.' + d) for d in TWITTER_DOMAINS)
    except Exception:
        return False

def parse(url):
    try:
        parsed = urllib.parse.urlparse(url)
        match_result = re.search(r'/status(?:es)?/(\d+)', parsed.path)
        if not match_result:
            return None
            
        tweet_id = match_result.group(1)
        api_url = f"https://api.fxtwitter.com/2/status/{tweet_id}"
        
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(api_url, headers=headers, timeout=5)
        if not response.ok:
            return None
            
        data = response.json()
        
        if data.get('code') == 200 and data.get('status'):
            status = data['status']
            author = status.get('author', {}).get('name', 'Unknown')
            text = status.get('text', '')
            reposts = status.get('reposts', 0)
            likes = status.get('likes', 0)
            
            media_info = []
            if status.get('media'):
                media = status['media']
                if media.get('photos') and isinstance(media['photos'], list) and len(media['photos']) > 0:
                    media_info.append(f"{len(media['photos'])} 張圖片")
                if media.get('video') or media.get('videos'):
                    media_info.append("包含影片")
                    
            media_text = f" [附帶: {', '.join(media_info)}]" if media_info else ""
            
            return f"[Twitter 推文 | 作者: {author} | 轉推: {reposts} 喜歡: {likes}{media_text}]\n{text}"
    except Exception as e:
        logger.warning(f"[Twitter 網址解析失敗] {str(e)}")
        
    return None
