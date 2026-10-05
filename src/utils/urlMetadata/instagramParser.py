import urllib.parse
import aiohttp
from bs4 import BeautifulSoup

from .. import logger
from .. import promptLoader

URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md'

def match(url: str) -> bool:
    try:
        u = urllib.parse.urlparse(url)
        return u.hostname in ['www.instagram.com', 'instagram.com', 'www.instagr.am', 'instagr.am']
    except Exception:
        return False

async def parse(url: str):
    try:
        u = urllib.parse.urlparse(url)
        # 轉換為 ddinstagram.com 代理網址
        proxy_url = f"https://ddinstagram.com{u.path}"
        if u.query:
            proxy_url += f"?{u.query}"

        html = None
        is_proxy_success = False

        # 1. 優先從 ddinstagram 代理讀取
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    proxy_url,
                    headers={'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        html = await response.text()
                        is_proxy_success = True
        except Exception as proxy_err:
            logger.warning(f"[Instagram] ddinstagram 代理請求失敗 ({url}): {str(proxy_err)}")

        # 2. 如果代理失敗，使用原生 WhatsApp UA 作為 Fallback 備援
        if not html:
            logger.info(f"[Instagram] 啟智原生 WhatsApp UA 備援抓取 ({url})...")
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        url,
                        headers={'User-Agent': 'WhatsApp/2.21.12.21 A'},
                        timeout=aiohttp.ClientTimeout(total=10)
                    ) as fallback_response:
                        if fallback_response.status == 200:
                            html = await fallback_response.text()
            except Exception as fallback_err:
                logger.warning(f"[Instagram] 原生抓取失敗 ({url}): {str(fallback_err)}")

        if not html:
            return None

        soup = BeautifulSoup(html, 'html.parser')

        title_meta = soup.find('meta', attrs={'property': 'og:title'}) or soup.find('meta', attrs={'name': 'twitter:title'})
        title = title_meta.get('content', '') if title_meta else ''

        desc_meta = soup.find('meta', attrs={'property': 'og:description'}) or soup.find('meta', attrs={'name': 'twitter:description'})
        description = desc_meta.get('content', '') if desc_meta else ''

        # 擷取所有圖片網址（包含輪播圖 多重 og:image）
        images = []
        for el in soup.find_all('meta', attrs={'property': 'og:image'}):
            img = el.get('content')
            if img and img not in images:
                images.append(img)
        
        if not images:
            tw_img_meta = soup.find('meta', attrs={'name': 'twitter:image'})
            tw_img = tw_img_meta.get('content') if tw_img_meta else None
            if tw_img:
                images.append(tw_img)

        # 過濾無效標題或登入提示
        if not title or 'Log in' in title or '登入' in title or title == 'Instagram':
            if description or len(images) > 0:
                title = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'instagram_default_title')
            else:
                return None

        if len(description) > 250:
            description = description[:250] + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'description_ellipsis')

        if description:
            content_text = description
        elif len(images) > 0:
            content_text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'instagram_media_only_text')
        else:
            content_text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'instagram_no_text')

        media_count_text = ''
        if len(images) > 0:
            media_count_text = ' ' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'instagram_media_count', {'count': len(images)})

        result_text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'instagram_post', {
            'author': title,
            'media_text': media_count_text,
            'content_text': content_text
        })

        return {
            'text': result_text,
            'images': images
        }
    except Exception as err:
        logger.warning(f"[Instagram 解析失敗] ({url}): {str(err)}")
        return None
