import urllib.parse
import requests
from bs4 import BeautifulSoup
from ..logger import logger

def match(url_string):
    try:
        parsed = urllib.parse.urlparse(url_string)
        hostname = parsed.hostname.replace('www.', '') if parsed.hostname else ''
        return hostname in ['facebook.com', 'fb.com']
    except Exception:
        return False

def parse(url_string):
    try:
        parsed = urllib.parse.urlparse(url_string)
        facebed_url = f"https://facebed.com{parsed.path}?{parsed.query}"
        
        # Try facebed first
        try:
            response = requests.get(
                facebed_url,
                headers={'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'},
                timeout=15
            )
            
            if response.ok:
                soup = BeautifulSoup(response.text, 'html.parser')
                og_title = soup.find('meta', property='og:title')
                title = og_title['content'] if og_title else ''
                
                og_desc = soup.find('meta', property='og:description')
                description = og_desc['content'] if og_desc else ''
                
                og_img = soup.find('meta', property='og:image')
                image_url = og_img['content'] if og_img else None
                
                # Check if Facebed was blocked
                if not title or 'Log in or sign up' in title or '登入' in title or 'Facebook' in title:
                    title = None
            else:
                title = None
        except Exception as e:
            title = None
            
        # Fallback to WhatsApp UA on original URL
        if not title:
            logger.info("[Facebook] Facebed 被阻擋，嘗試使用原生 WhatsApp UA 備用方案...")
            try:
                fallback_resp = requests.get(
                    url_string,
                    headers={'User-Agent': 'WhatsApp/2.21.12.21 A'},
                    timeout=10
                )
                if fallback_resp.ok:
                    soup = BeautifulSoup(fallback_resp.text, 'html.parser')
                    og_title = soup.find('meta', property='og:title')
                    fallback_title = og_title['content'] if og_title else ''
                    
                    if fallback_title and 'Log in or sign up' not in fallback_title and '登入' not in fallback_title:
                        title = fallback_title
                        og_desc = soup.find('meta', property='og:description')
                        description = og_desc['content'] if og_desc else ''
                        
                        og_img = soup.find('meta', property='og:image')
                        image_url = og_img['content'] if og_img else None
            except Exception as e:
                logger.warning(f"[Facebook] 備用方案抓取失敗: {str(e)}")
                
        if not title or 'Log in or sign up' in title or title == 'Facebook':
            return None
            
        if len(description) > 200:
            description = description[:200] + '...'
            
        result_text = f"[Facebook 推文 | {title}]\n{description}"
        
        images = []
        if image_url:
            images.append(image_url)
            
        return {
            'text': result_text,
            'images': images
        }
        
    except Exception as e:
        logger.warning(f"Facebed 解析失敗 ({url_string}): {str(e)}")
        return None
