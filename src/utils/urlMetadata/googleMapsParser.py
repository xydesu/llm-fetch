import re
import urllib.parse
from urllib.parse import urlparse
import requests

from .. import logger
from .. import promptLoader

URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md'

# Google 網域匹配規則（包含 google.com、google.co.*、google.com.* 等常見國家代碼域名）
GOOGLE_DOMAIN_REGEX = re.compile(r'(?:^|\.)google\.(?:com|co\.[a-z]{2,}|com\.[a-z]{2,})$', re.IGNORECASE)

def clean_text(raw):
    """
    清理並解碼 URL 參數或路徑名稱
    將加號轉換為空格並處理 URL 編碼字元
    """
    if not raw or not isinstance(raw, str):
        return ''
    try:
        return urllib.parse.unquote(raw.replace('+', ' ')).strip()
    except Exception:
        return raw.replace('+', ' ').strip()

def is_short_link(parsed_url):
    """
    檢查是否為 Google Maps 短網址
    """
    host = parsed_url.hostname.lower() if parsed_url.hostname else ''
    pathname = parsed_url.path
    if host == 'maps.app.goo.gl':
        return True
    if (host == 'goo.gl' or host.endswith('.goo.gl')) and (pathname == '/maps' or pathname.startswith('/maps/')):
        return True
    return False

def match(url_string):
    """
    檢查是否為 Google Maps 網址
    """
    if not url_string or not isinstance(url_string, str):
        return False
    try:
        normalized = url_string.strip()
        if not normalized.startswith('http://') and not normalized.startswith('https://'):
            normalized = 'https://' + normalized
        
        parsed = urlparse(normalized)
        host = parsed.hostname.lower() if parsed.hostname else ''
        pathname = parsed.path
        
        # 短網址域名：maps.app.goo.gl、goo.gl 且路徑以 /maps 開頭
        if host == 'maps.app.goo.gl':
            return True
        if (host == 'goo.gl' or host.endswith('.goo.gl')) and (pathname == '/maps' or pathname.startswith('/maps/')):
            return True
        
        # 域名為 maps.google.com
        if host == 'maps.google.com':
            return True
            
        # 域名包含 google.com 或 google.co.* 或 google.com.* 且路徑為 /maps 或 /search
        if GOOGLE_DOMAIN_REGEX.search(host):
            if pathname == '/maps' or pathname.startswith('/maps/') or pathname == '/search' or pathname.startswith('/search/'):
                return True
                
        return False
    except Exception:
        return False

def is_static_map_image_url(url):
    """
    檢查圖片 URL 是否為 Google 靜態街道地圖縮圖
    用於過濾街道縮圖，避免 Vision 視覺模型解析道路標籤產生幻覺
    """
    if not url or not isinstance(url, str):
        return False
    return bool(re.search(r'(?:maps\.google\.com/maps/api/staticmap|maps\.googleapis\.com/maps/api/staticmap|staticmap\?|/staticmap)', url, re.IGNORECASE))

async def parse(url_string):
    """
    解析 Google Maps 網址並提取地點、座標、搜尋或路線資訊
    支援保留店家照片並過濾掉靜態街道地圖縮圖
    """
    try:
        if not url_string or not isinstance(url_string, str):
            # 依賴 Python 模組慣用的方法名稱，這裡保留和 JS 類似以防未重構完成
            return {
                'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_fallback'),
                'images': []
            }
            
        current_url = url_string.strip()
        if not current_url.startswith('http://') and not current_url.startswith('https://'):
            current_url = 'https://' + current_url
            
        initial_parsed = urlparse(current_url)
        candidate_image_url = None
        
        # 短網址轉址追蹤
        if is_short_link(initial_parsed):
            try:
                # 使用 requests 處理 Location 標頭，不自動跟隨重定向，手動取得 Location
                response = requests.get(
                    current_url,
                    headers={'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'},
                    timeout=6,
                    allow_redirects=False
                )
                
                # 若為重定向狀態碼則取 Location，否則直接使用
                if response.status_code in (301, 302, 303, 307, 308) and 'Location' in response.headers:
                    current_url = response.headers['Location']
                    # 再次發送請求獲取最終頁面
                    response = requests.get(
                        current_url,
                        headers={'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'},
                        timeout=6
                    )
                else:
                    if response.url:
                        current_url = response.url

                html = response.text
                og_match = re.search(r'<meta[^>]*content="([^"]+)"[^>]*property="og:image"', html, re.IGNORECASE) or \
                           re.search(r'<meta[^>]*property="og:image"[^>]*content="([^"]+)"', html, re.IGNORECASE)
                           
                if og_match and og_match.group(1):
                    candidate = og_match.group(1).replace('&amp;', '&')
                    if not is_static_map_image_url(candidate):
                        candidate_image_url = candidate
            except Exception as fetch_err:
                logger.warn(f"[GoogleMapsParser] 短網址轉址失敗 ({url_string}): {str(fetch_err)}")
                return {
                    'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_fallback'),
                    'images': []
                }
                
        try:
            parsed_url = urlparse(current_url)
        except Exception:
            return {
                'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_fallback'),
                'images': []
            }
            
        # 提取經緯度座標（支援 @lat,lng、ll=lat,lng 或 q 參數內座標）
        coords = None
        at_match = re.search(r'@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)', current_url)
        if at_match:
            coords = f"{at_match.group(1)}, {at_match.group(2)}"
        else:
            ll_match = re.search(r'[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)', current_url)
            if ll_match:
                coords = f"{ll_match.group(1)}, {ll_match.group(2)}"
            else:
                q_coords_match = re.search(r'[?&]q=(?:loc:)?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)', current_url)
                if q_coords_match:
                    coords = f"{q_coords_match.group(1)}, {q_coords_match.group(2)}"
                    
        images = [candidate_image_url] if candidate_image_url else []
        
        # 1. 路線規劃：/maps/dir/起點/終點
        dir_match = re.search(r'/maps/dir/([^/]+)/([^/@?]+)', current_url)
        if dir_match:
            origin = clean_text(dir_match.group(1))
            destination = clean_text(dir_match.group(2))
            if origin and destination:
                text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_directions', {
                    'origin': origin,
                    'destination': destination
                })
                return {'text': text, 'images': images}
                
        # 2. 地點標記：/maps/place/地點名稱
        place_match = re.search(r'/maps/place/([^/@?]+)', current_url)
        if place_match:
            place_name = clean_text(place_match.group(1))
            if place_name:
                extra_info = ''
                if coords:
                    coords_suffix = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_coords_suffix', {'coords': coords})
                    extra_info = f" {coords_suffix}" if coords_suffix else ''
                text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_place', {
                    'place_name': place_name,
                    'extra_info': extra_info
                })
                return {'text': text, 'images': images}
                
        # 3. 搜尋標記：/maps/search/搜尋關鍵字 或 ?query=關鍵字 或 ?q=關鍵字
        query = None
        search_match = re.search(r'/maps/search/([^/@?]+)', current_url)
        qs = urllib.parse.parse_qs(parsed_url.query)
        
        if search_match and search_match.group(1).strip() != '':
            query = clean_text(search_match.group(1))
        elif 'query' in qs and qs['query'][0]:
            query = clean_text(qs['query'][0])
        elif 'q' in qs and qs['q'][0]:
            query = clean_text(qs['q'][0])
            
        if query:
            extra_info = ''
            if coords:
                coords_suffix = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_coords_suffix', {'coords': coords})
                extra_info = f" {coords_suffix}" if coords_suffix else ''
            text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_search', {
                'query': query,
                'extra_info': extra_info
            })
            return {'text': text, 'images': images}
            
        # 4. 純座標位置
        if coords:
            text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_coords_only', {'coords': coords})
            return {'text': text, 'images': images}
            
        # 5. 無法辨識具體資訊時回傳預設 fallback 區塊
        fallback_text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_fallback')
        return {'text': fallback_text, 'images': images}
        
    except Exception as err:
        logger.warn(f"[GoogleMapsParser] 解析 Google Maps 網址失敗 ({url_string}): {str(err)}")
        return {
            'text': promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_fallback'),
            'images': []
        }
