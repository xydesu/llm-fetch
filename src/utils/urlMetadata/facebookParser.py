import urllib.parse
import requests
from bs4 import BeautifulSoup

# 假設 logger 和 promptLoader 模組位於上一層目錄
from .. import logger
from .. import promptLoader

URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md'

def match(url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        return parsed.hostname in ['www.facebook.com', 'facebook.com', 'fb.com']
    except Exception:
        return False

def parse(url: str) -> dict | None:
    try:
        # 將 facebook 網域替換為 facebed.com
        parsed = urllib.parse.urlparse(url)
        query_string = f"?{parsed.query}" if parsed.query else ""
        facebed_url = f"https://facebed.com{parsed.path}{query_string}"
        
        try:
            # 從 facebed.com 獲取資料
            response = requests.get(
                facebed_url,
                headers={
                    # Facebed 是為了 Discord 打造的，所以使用 Discordbot UA
                    'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
                },
                timeout=15
            )
            if not response.ok:
                return None
            html = response.text
        except requests.RequestException:
            return None
            
        soup = BeautifulSoup(html, 'html.parser')
        
        title_meta = soup.find('meta', property='og:title')
        title = title_meta['content'] if title_meta and title_meta.has_attr('content') else ''
        
        desc_meta = soup.find('meta', property='og:description')
        description = desc_meta['content'] if desc_meta and desc_meta.has_attr('content') else ''
        
        image_meta = soup.find('meta', property='og:image')
        image_url = image_meta['content'] if image_meta and image_meta.has_attr('content') else None
        
        # 如果 Facebed 被阻擋 (返回登入畫面)，我們直接使用 WhatsApp UA 去抓原本的 FB 網址作為 Fallback
        if not title or 'Log in or sign up' in title or '登入' in title or 'Facebook' in title:
            logger.info("[Facebook] Facebed 被阻擋，嘗試使用原生 WhatsApp UA 備用方案...")
            try:
                fallback_response = requests.get(
                    url,
                    headers={
                        'User-Agent': 'WhatsApp/2.21.12.21 A'
                    },
                    timeout=10
                )
                
                if fallback_response.ok:
                    fallback_html = fallback_response.text
                    fallback_soup = BeautifulSoup(fallback_html, 'html.parser')
                    
                    fallback_title_meta = fallback_soup.find('meta', property='og:title')
                    fallback_title = fallback_title_meta['content'] if fallback_title_meta and fallback_title_meta.has_attr('content') else None
                    
                    if fallback_title and 'Log in or sign up' not in fallback_title and '登入' not in fallback_title:
                        title = fallback_title
                        
                        fallback_desc_meta = fallback_soup.find('meta', property='og:description')
                        description = fallback_desc_meta['content'] if fallback_desc_meta and fallback_desc_meta.has_attr('content') else ''
                        
                        fallback_image_meta = fallback_soup.find('meta', property='og:image')
                        image_url = fallback_image_meta['content'] if fallback_image_meta and fallback_image_meta.has_attr('content') else None
            except Exception as fallback_err:
                if hasattr(logger, 'warn'):
                    logger.warn(f"[Facebook] 備用方案抓取失敗: {str(fallback_err)}")
                else:
                    logger.warning(f"[Facebook] 備用方案抓取失敗: {str(fallback_err)}")
                
        if not title or 'Log in or sign up' in title or title == 'Facebook':
            return None
            
        if len(description) > 200:
            description = description[:200] + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'description_ellipsis')
            
        images = []
        if image_url:
            images.append(image_url)
            
        if description:
            content_text = description
        else:
            if len(images) > 0:
                content_text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'facebook_media_only_text')
            else:
                content_text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'facebook_no_text')
                
        if len(images) > 0:
            media_count_text = ' ' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'facebook_media_count', {'count': len(images)})
        else:
            media_count_text = ''
            
        result_text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'facebook_post', {
            'author': title,
            'media_text': media_count_text,
            'content_text': content_text
        })
        
        return {
            'text': result_text,
            'images': images
        }
    except Exception as err:
        if hasattr(logger, 'warn'):
            logger.warn(f"Facebed 解析失敗 ({url}): {str(err)}")
        else:
            logger.warning(f"Facebed 解析失敗 ({url}): {str(err)}")
        return None
