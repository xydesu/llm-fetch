import logging
from typing import List, Dict, Any

try:
    from ..logger import logger
except ImportError:
    # 預設的 logger fallback
    logger = logging.getLogger(__name__)

import aiohttp

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
}

async def fetch_steam_specials(limit: int = 15) -> List[Dict[str, Any]]:
    """
    從 Steam 官方商店 API 抓取即時特價與特惠遊戲
    :param limit: 取得筆數
    :return: 包含遊戲資訊的列表
    """
    url = 'https://store.steampowered.com/api/featuredcategories/?cc=tw&l=tchinese'
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=DEFAULT_HEADERS, timeout=10) as res:
                res.raise_for_status()
                data = await res.json()

        items = data.get('specials', {}).get('items', [])
        specials = []
        for item in items:
            raw_discount = item.get('discount_percent', 0)
            
            final_price = item.get('final_price', 0)
            final_price_num = round(final_price / 100) if final_price else 0
            
            orig_price = item.get('original_price', 0)
            orig_price_num = round(orig_price / 100) if orig_price else 0

            item_id = item.get('id', '')
            cover = item.get('large_capsule_image') or item.get('header_image') or f"https://cdn.cloudflare.steamstatic.com/steam/apps/{item_id}/header.jpg"

            specials.append({
                'id': str(item_id),
                'name': item.get('name', ''),
                'discount': f"-{raw_discount}%" if raw_discount > 0 else '特惠',
                'price': f"NT$ {final_price_num}" if final_price_num > 0 else '免費遊玩',
                'originalPrice': f"NT$ {orig_price_num}" if orig_price_num > 0 else '',
                'cover': cover,
                'tag': 'Steam 骨折特惠' if raw_discount >= 50 else 'Steam 熱門特價',
                'category': 'Steam 特價特惠',
                'url': f"https://store.steampowered.com/app/{item_id}"
            })

        logger.info(f"[SteamCrawler] 成功取得 Steam 官方即時特惠遊戲 {len(specials)} 款")
        return specials[:limit]
    except Exception as err:
        logger.error(f"[SteamCrawler] 抓取 Steam 特價遊戲失敗: {err}")
        return []

async def fetch_steam_top_sellers(limit: int = 10) -> List[Dict[str, Any]]:
    """
    抓取 Steam 熱門暢銷排行 (Top Sellers)
    :param limit: 取得筆數
    :return: 包含遊戲資訊的列表
    """
    url = 'https://store.steampowered.com/api/featuredcategories/?cc=tw&l=tchinese'
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=DEFAULT_HEADERS, timeout=10) as res:
                res.raise_for_status()
                data = await res.json()

        items = data.get('top_sellers', {}).get('items', [])
        top_sellers = []
        for item in items:
            discount_percent = item.get('discount_percent', 0)
            final_price = item.get('final_price', 0)
            item_id = item.get('id', '')
            
            cover = item.get('large_capsule_image') or item.get('header_image') or f"https://cdn.cloudflare.steamstatic.com/steam/apps/{item_id}/header.jpg"
            
            top_sellers.append({
                'id': str(item_id),
                'name': item.get('name', ''),
                'discount': f"-{discount_percent}%" if discount_percent else '原價',
                'price': f"NT$ {round(final_price / 100)}" if final_price else '免費',
                'cover': cover,
                'tag': 'Steam 暢銷榜首',
                'category': 'Steam 熱銷排行',
                'url': f"https://store.steampowered.com/app/{item_id}"
            })

        return top_sellers[:limit]
    except Exception as err:
        logger.error(f"[SteamCrawler] 抓取 Steam 暢銷榜失敗: {err}")
        return []
