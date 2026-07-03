import requests
from bs4 import BeautifulSoup
from ..logger import logger

def match(url):
    return True

def parse(url):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=4)
        if not response.ok:
            return None
            
        content_type = response.headers.get('content-type', '')
        if 'text/html' not in content_type:
            return None
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        title = ''
        og_title = soup.find('meta', property='og:title')
        if og_title:
            title = og_title.get('content', '')
        if not title:
            title_tag = soup.find('title')
            title = title_tag.text if title_tag else ''
            
        description = ''
        og_desc = soup.find('meta', property='og:description')
        if og_desc:
            description = og_desc.get('content', '')
        if not description:
            meta_desc = soup.find('meta', attrs={'name': 'description'})
            description = meta_desc.get('content', '') if meta_desc else ''
            
        if not title and not description:
            return None
            
        return {
            'text': f"[網頁連結: {title.strip()} | {description.strip()}]",
            'images': []
        }
    except Exception as e:
        logger.warning(f"抓取網址失敗 ({url}): {str(e)}")
        return None
