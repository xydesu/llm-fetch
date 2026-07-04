import urllib.parse
import requests
from bs4 import BeautifulSoup
from ..logger import logger

def match(url_string):
    try:
        parsed = urllib.parse.urlparse(url_string)
        hostname = parsed.hostname.replace('www.', '') if parsed.hostname else ''
        return hostname in ['threads.net', 'threads.com']
    except Exception:
        return False

def parse(url_string):
    try:
        response = requests.get(
            url_string,
            timeout=10
        )
        
        if not response.ok:
            return None
            
        soup = BeautifulSoup(response.text, 'html.parser')
        og_title = soup.find('meta', property='og:title')
        title = og_title['content'] if og_title else ''
        
        if not title:
            return None
            
        og_desc = soup.find('meta', property='og:description')
        description = og_desc['content'] if og_desc else ''
        
        og_img = soup.find('meta', property='og:image')
        image_url = og_img['content'] if og_img else None
        
        if len(description) > 200:
            description = description[:200] + '...'
            
        result_text = f"[Threads 推文 | {title}]\n{description}"
        
        images = []
        if image_url:
            images.append(image_url)
            
        return {
            'text': result_text,
            'images': images
        }
        
    except Exception as e:
        logger.warning(f"Threads 解析失敗 ({url_string}): {str(e)}")
        return None
