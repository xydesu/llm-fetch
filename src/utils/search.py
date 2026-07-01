import time
import requests
from bs4 import BeautifulSoup
import urllib.parse
from .logger import logger

def search_web(query):
    start_time = time.time()
    try:
        logger.info(f'[Search] 開始進行 DuckDuckGo 網頁搜尋: "{query}"')
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(f'https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}', headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        results = []
        
        for el in soup.select('.result__body')[:5]:
            title_el = el.select_one('.result__title')
            snippet_el = el.select_one('.result__snippet')
            if title_el and snippet_el:
                title = title_el.get_text(strip=True)
                snippet = snippet_el.get_text(strip=True)
                results.append(f"【標題】{title}\n【摘要】{snippet}")
        
        duration = round(time.time() - start_time, 2)
        logger.info(f'[Search] DuckDuckGo 搜尋成功，耗時 {duration} 秒，找到 {len(results)} 筆結果。')
        
        return '\n\n'.join(results) if results else '找不到相關結果。'
    except requests.exceptions.RequestException as e:
        elapsed = round(time.time() - start_time, 2)
        logger.error(f'[Search] DuckDuckGo 搜尋在 {elapsed} 秒後失敗。細節: {str(e)}')
        if hasattr(e, 'response') and e.response is not None:
            if e.response.status_code in [429, 403]:
                logger.warning('[Search] 偵測為【搜尋頻率限制或 IP 封鎖 (Rate Limit/Block)】')
        return '搜尋失敗，無法取得結果。'

def search_images(query):
    start_time = time.time()
    try:
        logger.info(f'[Search] 開始進行 DuckDuckGo 圖片搜尋: "{query}"')
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(f'https://duckduckgo.com/?q={urllib.parse.quote(query)}', headers=headers, timeout=10)
        response.raise_for_status()
        
        import re
        vqd_match = re.search(r'vqd=([0-9-]+)', response.text)
        if not vqd_match:
            raise ValueError('無法取得 VQD token')
        vqd = vqd_match.group(1)
        
        api_url = f'https://duckduckgo.com/i.js?q={urllib.parse.quote(query)}&vqd={vqd}&o=json&l=us-en'
        headers['Referer'] = 'https://duckduckgo.com/'
        api_response = requests.get(api_url, headers=headers, timeout=10)
        api_response.raise_for_status()
        
        data = api_response.json()
        results = []
        if 'results' in data and data['results']:
            for index, item in enumerate(data['results'][:5]):
                title = item.get('title', '無標題')
                image = item.get('image', '')
                url = item.get('url', '')
                results.append(f"【圖片 {index + 1}】\n標題：{title}\n網址：{image}\n來源網頁：{url}")
                
        duration = round(time.time() - start_time, 2)
        logger.info(f'[Search] DuckDuckGo 圖片搜尋成功，耗時 {duration} 秒，找到 {len(results)} 筆結果。')
        
        return '\n\n'.join(results) if results else '找不到相關圖片結果。'
    except Exception as e:
        elapsed = round(time.time() - start_time, 2)
        logger.error(f'[Search] DuckDuckGo 圖片搜尋在 {elapsed} 秒後失敗。細節: {str(e)}')
        return '圖片搜尋失敗，無法取得結果。'
