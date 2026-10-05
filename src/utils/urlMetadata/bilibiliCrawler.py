import hashlib
import requests
import time
import urllib.parse
import re

try:
    from .. import logger
except ImportError:
    import logging
    logger = logging.getLogger(__name__)
    if not logger.handlers:
        logging.basicConfig(level=logging.INFO)

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/'
}

# Wbi 簽名金鑰快取 (每日有效)
wbi_keys_cache = {'img_key': None, 'sub_key': None, 'timestamp': 0}
mixin_key_enc_tab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
]

def get_mixin_key(orig: str) -> str:
    return ''.join([orig[n] for n in mixin_key_enc_tab])[:32]

def enc_wbi(params: dict, img_key: str, sub_key: str) -> str:
    mixin_key = get_mixin_key(img_key + sub_key)
    curr_time = round(time.time())
    
    params['wts'] = curr_time
    
    sorted_keys = sorted(params.keys())
    
    query_parts = []
    for key in sorted_keys:
        val = str(params[key])
        val = re.sub(r"[!'()*]", '', val)
        query_parts.append(f"{urllib.parse.quote(key, safe='')}={urllib.parse.quote(val, safe='')}")
        
    query = '&'.join(query_parts)
    
    wbi_sign = hashlib.md5((query + mixin_key).encode('utf-8')).hexdigest()
    return query + '&w_rid=' + wbi_sign

def get_wbi_keys():
    global wbi_keys_cache
    now = time.time() * 1000
    if wbi_keys_cache['img_key'] and wbi_keys_cache['sub_key'] and (now - wbi_keys_cache['timestamp'] < 6 * 60 * 60 * 1000):
        return wbi_keys_cache

    try:
        res = requests.get('https://api.bilibili.com/x/web-interface/nav', headers=DEFAULT_HEADERS, timeout=8)
        res.raise_for_status()
        json_data = res.json()
        wbi_img = json_data['data']['wbi_img']
        img_url = wbi_img['img_url']
        sub_url = wbi_img['sub_url']

        wbi_keys_cache['img_key'] = img_url[img_url.rfind('/') + 1: img_url.rfind('.')]
        wbi_keys_cache['sub_key'] = sub_url[sub_url.rfind('/') + 1: sub_url.rfind('.')]
        wbi_keys_cache['timestamp'] = now
        return wbi_keys_cache
    except Exception as err:
        logger.warning(f"[BilibiliCrawler] 取得 Wbi Keys 失敗: {err}")
        return None

# 分區名稱與 Bilibili RID 對照表
CATEGORY_RID_MAP = {
    'gaming': 17,    # 單機遊戲
    'anime': 1,      # 動畫主區
    'vtuber': 230,   # VTuber / 虛擬主播
    'kichiku': 22    # 鬼畜
}

def fetch_homepage_rcmd(ps: int = 20):
    try:
        keys = get_wbi_keys()
        if not keys: return []

        query = enc_wbi({'ps': ps, 'fresh_type': 3}, keys['img_key'], keys['sub_key'])
        url = f"https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd?{query}"
        res = requests.get(url, headers=DEFAULT_HEADERS, timeout=8)
        res.raise_for_status()
        json_data = res.json()

        if json_data.get('code') != 0 or not json_data.get('data') or not isinstance(json_data['data'].get('item'), list):
            logger.warning(f"[BilibiliCrawler] 抓取 B 站首頁推薦流失敗: {json_data.get('message', '無內容')}")
            return []

        return [format_video_item(item) for item in json_data['data']['item']]
    except Exception as err:
        logger.error(f"[BilibiliCrawler] 抓取 B 站首頁推薦流時發生網路錯誤: {err}")
        return []

def fetch_popular_videos(page: int = 1, page_size: int = 20):
    try:
        url = f"https://api.bilibili.com/x/web-interface/popular?pn={page}&ps={page_size}"
        res = requests.get(url, headers=DEFAULT_HEADERS, timeout=8)
        res.raise_for_status()
        json_data = res.json()

        if json_data.get('code') != 0 or not json_data.get('data') or not json_data['data'].get('list'):
            logger.warning(f"[BilibiliCrawler] 抓取熱門影片失敗: {json_data.get('message', '格式不符')}")
            return []

        return [format_video_item(item) for item in json_data['data']['list']]
    except Exception as err:
        logger.error(f"[BilibiliCrawler] 抓取全站熱門影片時發生網路錯誤: {err}")
        return []

def fetch_hot_keywords(limit: int = 10):
    try:
        url = f'https://api.bilibili.com/x/web-interface/search/square?limit={limit}'
        res = requests.get(url, headers=DEFAULT_HEADERS, timeout=8)
        res.raise_for_status()
        json_data = res.json()

        if json_data.get('code') != 0 or not json_data.get('data') or not json_data['data'].get('trending') or not json_data['data']['trending'].get('list'):
            logger.warning(f"[BilibiliCrawler] 抓取熱搜關鍵字失敗: {json_data.get('message', '無熱搜數據')}")
            return []

        items = json_data['data']['trending']['list'][:limit]
        return [item.get('keyword') or item.get('show_name') for item in items if item.get('keyword') or item.get('show_name')]
    except Exception as err:
        logger.error(f"[BilibiliCrawler] 抓取熱搜關鍵字時發生網路錯誤: {err}")
        return []

def fetch_category_ranking(category_or_rid='gaming'):
    try:
        rid = category_or_rid if isinstance(category_or_rid, int) else CATEGORY_RID_MAP.get(category_or_rid)
        if not rid: rid = 17

        url = f"https://api.bilibili.com/x/web-interface/ranking/v2?rid={rid}&type=all"
        res = requests.get(url, headers=DEFAULT_HEADERS, timeout=8)
        res.raise_for_status()
        json_data = res.json()

        if json_data.get('code') == 0 and json_data.get('data') and isinstance(json_data['data'].get('list'), list) and len(json_data['data']['list']) > 0:
            return [format_video_item(item) for item in json_data['data']['list']]

        logger.info(f"[BilibiliCrawler] 分區 (RID: {rid}) 榜單未回傳資料，轉為使用全站熱門過濾...")
        popular_list = fetch_popular_videos(1, 50)
        
        category_keywords = {
            'gaming': ['遊戲', '单机', '手游', 'MC', 'Steam', '主机'],
            'anime': ['動畫', '国创', '番剧', '二次元', 'MAD'],
            'vtuber': ['VTuber', '虛擬', 'V圈', '歌回'],
            'kichiku': ['鬼畜', '鬼畜调教', '音MAD']
        }

        keywords = category_keywords.get(category_or_rid, [])
        if not keywords: return popular_list

        filtered = [v for v in popular_list if any(kw in v['tname'] or kw in v['title'] or kw in v['desc'] for kw in keywords)]

        return filtered if filtered else popular_list
    except Exception as err:
        logger.error(f"[BilibiliCrawler] 抓取分區熱門榜時發生錯誤: {err}")
        return fetch_popular_videos(1, 20)

def fetch_precious_videos():
    try:
        url = 'https://api.bilibili.com/x/web-interface/popular/precious?page_size=100&page=1'
        res = requests.get(url, headers=DEFAULT_HEADERS, timeout=8)
        res.raise_for_status()
        json_data = res.json()

        if json_data.get('code') != 0 or not json_data.get('data') or not isinstance(json_data['data'].get('list'), list):
            logger.warning(f"[BilibiliCrawler] 抓取寶藏精選失敗: {json_data.get('message', '格式不符')}")
            return []

        return [format_video_item(item) for item in json_data['data']['list']]
    except Exception as err:
        logger.error(f"[BilibiliCrawler] 抓取寶藏精選影片時發生錯誤: {err}")
        return []

def fetch_related_videos(bvid: str):
    try:
        if not bvid: return []
        url = f"https://api.bilibili.com/x/web-interface/archive/related?bvid={bvid}"
        res = requests.get(url, headers=DEFAULT_HEADERS, timeout=8)
        res.raise_for_status()
        json_data = res.json()

        if json_data.get('code') != 0 or not isinstance(json_data.get('data'), list):
            return []

        return [format_video_item(item) for item in json_data['data']]
    except Exception as err:
        logger.warning(f"[BilibiliCrawler] 抓取關聯推薦影片 ({bvid}) 失敗: {err}")
        return []

def format_video_item(item: dict) -> dict:
    stat = item.get('stat', {})
    view = stat.get('view') or item.get('view') or 0
    like = stat.get('like') or item.get('like') or 0
    coin = stat.get('coin') or item.get('coin') or 0
    favorite = stat.get('favorite') or item.get('favorite') or 0
    danmaku = stat.get('danmaku') or item.get('danmaku') or 0

    coin_to_like = (coin / like) if like > 0 else 0
    like_to_view = (like / view) if view > 0 else 0

    quality_tag = '日常內容'
    if coin_to_like >= 0.12 or (like >= 8000 and coin_to_like >= 0.08):
        quality_tag = '🔥 深度優質/良心神作 (高幣讚比)'
    elif like_to_view >= 0.04:
        quality_tag = '⭐ 高口碑熱門 (高點讚率)'
    elif view > 30000 and like_to_view < 0.008 and coin_to_like < 0.02:
        quality_tag = '⚠️ 疑似低質營銷號/標題黨 (低幣讚率)'

    pic = item.get('pic') or item.get('cover') or ''
    if pic.startswith('http://'):
        pic = pic.replace('http://', 'https://', 1)

    owner = item.get('owner', {})
    rcmd_reason = item.get('rcmd_reason', {})
    
    title = re.sub(r'<[^>]+>', '', item.get('title', '')).strip()

    return {
        'bvid': item.get('bvid', ''),
        'title': title,
        'desc': item.get('desc', ''),
        'upName': owner.get('name') or item.get('author') or item.get('up_name') or '',
        'tname': item.get('tname') or item.get('typename') or '',
        'pic': pic,
        'cover_url': pic,
        'view': view,
        'like': like,
        'coin': coin,
        'favorite': favorite,
        'danmaku': danmaku,
        'coin_to_like_ratio': coin_to_like,
        'like_to_view_ratio': like_to_view,
        'quality_tag': quality_tag,
        'rcmdReason': rcmd_reason.get('content', '') if isinstance(rcmd_reason, dict) else '',
        'url': f"https://www.bilibili.com/video/{item.get('bvid')}" if item.get('bvid') else ''
    }
