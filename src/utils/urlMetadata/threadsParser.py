import re
from urllib.parse import urlparse
import aiohttp
from bs4 import BeautifulSoup

from .. import logger
from .. import promptLoader

URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md'

def match(url: str) -> bool:
    try:
        u = urlparse(url)
        return u.hostname in ('www.threads.net', 'threads.net', 'www.threads.com', 'threads.com')
    except Exception:
        return False

async def parse(url: str):
    try:
        # 帶上常用社群爬蟲 UA，以利獲取公開 OpenGraph 標籤
        headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, allow_redirects=True, timeout=10) as response:
                if response.status != 200:
                    return None
                
                final_url = str(response.url)
                
                # 檢查最終轉址網址，若被重導向至無效貼文或登入頁則判定失效
                if 'error=invalid_post' in final_url or '/login' in final_url:
                    logger.debug(f"[Threads] 貼文已失效或為私人貼文 ({url} -> {final_url})")
                    return None
                
                html = await response.text()
                
        soup = BeautifulSoup(html, 'html.parser')
        
        og_title = soup.find('meta', property='og:title')
        title = (og_title.get('content') if og_title else '').strip()
        
        og_description = soup.find('meta', property='og:description')
        description = (og_description.get('content') if og_description else '').strip()
        
        og_image = soup.find('meta', property='og:image')
        image_url = (og_image.get('content') if og_image else '').strip()
        
        if not title:
            return None
            
        # 檢查是否為登入頁/註冊牆佔位內容
        is_login_page = (
            re.search(r'^(threads\s*[•·-]?\s*)?(log\s*in|sign\s*in|登入|登錄)', title, re.IGNORECASE) or
            re.search(r'join threads to share ideas', description, re.IGNORECASE) or
            re.search(r'log in with your instagram', description, re.IGNORECASE)
        )
        
        if is_login_page:
            logger.debug(f"[Threads] 網址為登入頁佔位內容，略過解析: {title}")
            return None
            
        if len(description) > 200:
            description = description[:200] + promptLoader.render_prompt_section(URL_CONTEXT_PROMPT_FILE, 'description_ellipsis')
            
        images = []
        # 擷取所有圖片（支援多圖輪播）
        for meta in soup.find_all('meta', property='og:image'):
            img = (meta.get('content') or '').strip()
            if img and img not in images:
                # 排除 Meta 官方靜態 Logo / 圖示資源
                is_official_logo = any(x in img for x in ['static.cdninstagram.com', 'rsrc.php', 'threads_icon', 'favicon'])
                if not is_official_logo:
                    images.append(img)
                    
        if not images and image_url:
            is_official_logo = any(x in image_url for x in ['static.cdninstagram.com', 'rsrc.php', 'threads_icon', 'favicon'])
            if not is_official_logo:
                images.append(image_url)
                
        if description:
            content_text = description
        else:
            if images:
                content_text = promptLoader.render_prompt_section(URL_CONTEXT_PROMPT_FILE, 'threads_media_only_text')
            else:
                content_text = promptLoader.render_prompt_section(URL_CONTEXT_PROMPT_FILE, 'threads_no_text')
                
        if images:
            media_count_text = ' ' + promptLoader.render_prompt_section(URL_CONTEXT_PROMPT_FILE, 'threads_media_count', {'count': len(images)})
        else:
            media_count_text = ''
            
        result_text = promptLoader.render_prompt_section(URL_CONTEXT_PROMPT_FILE, 'threads_post', {
            'author': title,
            'media_text': media_count_text,
            'content_text': content_text
        })
        
        return {
            'text': result_text,
            'images': images
        }
        
    except Exception as err:
        logger.warning(f"Threads 解析失敗 ({url}): {err}")
        return None
