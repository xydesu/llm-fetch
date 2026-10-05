import re
import urllib.parse
import requests
from bs4 import BeautifulSoup

from .. import logger
from .. import promptLoader

URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md'

# 禁止作為公開網頁爬取與截圖的內部或受保護域名清單
RESTRICTED_DOMAINS = [
    'discord.com',
    'discordapp.com',
    'canary.discord.com',
    'ptb.discord.com'
]

def is_restricted_domain(url_string):
    """
    檢查網址是否屬於禁止通用爬取與截圖的內部域名
    """
    try:
        u = urllib.parse.urlparse(url_string)
        hostname = u.hostname
        if not hostname:
            return False
        for domain in RESTRICTED_DOMAINS:
            if hostname == domain or hostname.endswith('.' + domain):
                return True
        return False
    except Exception:
        return False

def fetch_url_metadata(url):
    try:
        if is_restricted_domain(url):
            return {'isRestricted': True}

        headers = {
            # 偽裝成瀏覽器，避免被一般網站直接阻擋
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        # 4秒超時
        response = requests.get(url, headers=headers, timeout=4)
        
        # 遭遇權限受限或未授權時，直接標記為受限內容，避免錯誤爬取
        if response.status_code in (401, 403):
            return {'isRestricted': True}

        if not response.ok:
            return None

        content_type = response.headers.get('content-type', '')
        if 'text/html' not in content_type.lower():
            return None

        text = response.text
        soup = BeautifulSoup(text, 'html.parser')

        # 獲取標題
        og_title_tag = soup.find('meta', property='og:title')
        title_tag = soup.find('title')
        
        title = ''
        if og_title_tag and og_title_tag.get('content'):
            title = og_title_tag.get('content')
        elif title_tag and title_tag.string:
            title = title_tag.string
        title = title.strip()

        # 獲取描述
        og_desc_tag = soup.find('meta', property='og:description')
        desc_tag = soup.find('meta', attrs={'name': 'description'})
        
        description = ''
        if og_desc_tag and og_desc_tag.get('content'):
            description = og_desc_tag.get('content')
        elif desc_tag and desc_tag.get('content'):
            description = desc_tag.get('content')
        description = description.strip()

        # 獲取圖片
        og_img_tag = soup.find('meta', property='og:image')
        twitter_img_tag = soup.find('meta', attrs={'name': 'twitter:image'})
        
        og_image = None
        if og_img_tag and og_img_tag.get('content'):
            og_image = og_img_tag.get('content').strip()
        elif twitter_img_tag and twitter_img_tag.get('content'):
            og_image = twitter_img_tag.get('content').strip()

        if not title and not description:
            return None

        # 登入頁、無實質內容的社群首頁佔位符或宣傳首頁過濾
        is_login_or_generic = bool(
            re.search(r'^(threads|instagram|twitter|x|facebook|discord)?\s*[•·-]?\s*(log\s*in|sign\s*in|登入|登錄|註冊|請先登入)$', title, re.IGNORECASE) or
            (not description and re.search(r'^(threads|instagram|twitter|facebook|discord)$', title, re.IGNORECASE)) or
            re.search(r'join threads to share ideas|log in with your instagram|discord is great for playing games', description, re.IGNORECASE) or
            re.search(r"discord - group chat that['’]s all fun & games", title, re.IGNORECASE) or
            re.search(r'^(403\s*forbidden|401\s*unauthorized|access\s*denied|just\s*a\s*moment)', title, re.IGNORECASE)
        )

        if is_login_or_generic:
            return {'isRestricted': True}

        return {
            'title': title,
            'description': description,
            'ogImage': og_image
        }
    except Exception as err:
        if logger and hasattr(logger, 'warn'):
            logger.warn(f"抓取網址 metadata 失敗 ({url}): {str(err)}")
        return None

def fetch_webpage_screenshot(url):
    try:
        if is_restricted_domain(url):
            return None

        api_url = f"https://api.microlink.io/?url={urllib.parse.quote(url)}&screenshot=true"
        # 6秒截圖超時
        response = requests.get(api_url, timeout=6)

        if not response.ok:
            return None

        json_data = response.json()
        if (json_data and json_data.get('status') == 'success' and 
            json_data.get('data') and json_data['data'].get('screenshot') and 
            json_data['data']['screenshot'].get('url')):
            return json_data['data']['screenshot']['url']
        return None
    except Exception as err:
        if logger and hasattr(logger, 'warn'):
            logger.warn(f"生成網頁畫面截圖失敗 ({url}): {str(err)}")
        return None

def match(*args, **kwargs):
    # 預設解析器匹配所有無法被其他專用解析器處理的網址
    return True

async def parse(url):
    # 先針對受限制的內部域名進行快速攔截，嚴禁發起爬蟲或截圖
    if is_restricted_domain(url):
        return {
            'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'webpage_restricted_internal'),
            'images': []
        }

    # 先抓取 HTML Metadata 以便確認是否為受限頁面或登入牆
    metadata = fetch_url_metadata(url)

    # 若確認為登入頁、權限受限或無權限，直接回傳看不到內容，禁止截圖與宣傳圖
    if metadata and metadata.get('isRestricted'):
        return {
            'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'webpage_restricted_login'),
            'images': []
        }

    if not metadata or not metadata.get('title'):
        return None

    # 若不是受限頁面，才嘗試獲取網頁即時截圖
    screenshot_url = None
    try:
        screenshot_url = fetch_webpage_screenshot(url)
    except Exception:
        pass

    title = metadata.get('title')
    description = metadata.get('description', '')

    images = []
    if metadata and metadata.get('ogImage'):
        # 排除常見的官方預設 Logo、icon 或品牌圖標
        is_default_logo = re.search(r'rsrc\.php|favicon|apple-touch-icon|site-logo|threads_icon|discordapp\.net/assets', metadata['ogImage'], re.IGNORECASE)
        if not is_default_logo:
            images.append(metadata['ogImage'])
            
    if screenshot_url and screenshot_url not in images:
        images.append(screenshot_url)

    media_count_text = ''
    if len(images) > 0:
        media_count_text = ' ' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'webpage_media_count', {'count': len(images)})

    return {
        'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'webpage_link', {
            'title': title,
            'description': description,
            'media_text': media_count_text
        }),
        'images': images
    }
