import json
import urllib.request
import urllib.parse
import urllib.error
import logging
import asyncio

# 若有自訂 logger，可根據專案結構調整引入方式
try:
    from .. import logger
except ImportError:
    logger = logging.getLogger(__name__)
    if not logger.handlers:
        logging.basicConfig(level=logging.INFO)

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7'
}

def extract_yt_initial_data(html: str) -> dict | None:
    """
    安全解析 HTML 中的 ytInitialData JSON 物件
    使用字串索引與深度終止條件，避免跨行大正則引發災難性回溯 (ReDoS)
    """
    if not html or not isinstance(html, str):
        return None

    pattern = 'ytInitialData'
    idx = html.find(pattern)
    if idx == -1:
        return None

    equal_idx = html.find('=', idx + len(pattern))
    if equal_idx == -1:
        return None

    start_idx = html.find('{', equal_idx)
    if start_idx == -1:
        return None

    script_end_idx = html.find('</script>', start_idx)
    if script_end_idx != -1:
        end_idx = html.rfind(';', start_idx, script_end_idx)
        if end_idx == -1 or end_idx < start_idx:
            end_idx = script_end_idx
        
        candidate = html[start_idx:end_idx].strip()
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            # 若快速擷取失敗，改用深度終止掃描
            pass

    # 帶深度終止條件的括號計數掃描，上限 2MB 避免無限遍歷
    depth = 0
    in_string = False
    escape = False
    quote_char = ''
    max_scan_length = min(len(html), start_idx + 2 * 1024 * 1024)

    for i in range(start_idx, max_scan_length):
        char = html[i]
        if escape:
            escape = False
            continue
        if char == '\\':
            escape = True
            continue
        if in_string:
            if char == quote_char:
                in_string = False
            continue
        if char == '"' or char == "'":
            in_string = True
            quote_char = char
            continue
        if char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(html[start_idx:i + 1])
                except json.JSONDecodeError:
                    return None

    return None

def _fetch_html(url: str, timeout: int = 8) -> str:
    """同步的 HTTP 請求，供 asyncio 呼叫"""
    req = urllib.request.Request(url, headers=DEFAULT_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode('utf-8')

async def fetch_youtube_videos(keyword: str = 'VTuber 歌回', limit: int = 10) -> list:
    """
    從 YouTube 關鍵字搜尋即時真實影片列表 (免 API Key，直接解析首頁資料)
    """
    try:
        url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(keyword)}&sp=CAI%253D"
        # 使用 asyncio.to_thread 避免阻塞事件迴圈
        html = await asyncio.to_thread(_fetch_html, url, 8)
        
        data = extract_yt_initial_data(html)
        if not data:
            logger.warning(f"[YouTubeCrawler] 未能解析【{keyword}】之 ytInitialData")
            return []

        videos = []

        def extract(obj):
            if not obj or not isinstance(obj, (dict, list)):
                return
            
            if isinstance(obj, list):
                for item in obj:
                    extract(item)
                return
                
            if 'videoRenderer' in obj:
                vr = obj['videoRenderer']
                video_id = vr.get('videoId')
                
                title = ''
                title_obj = vr.get('title', {})
                if 'runs' in title_obj and title_obj['runs']:
                    title = title_obj['runs'][0].get('text', '')
                elif 'simpleText' in title_obj:
                    title = title_obj['simpleText']
                    
                author = ''
                owner_text = vr.get('ownerText', {})
                short_byline_text = vr.get('shortBylineText', {})
                if 'runs' in owner_text and owner_text['runs']:
                    author = owner_text['runs'][0].get('text', '')
                elif 'runs' in short_byline_text and short_byline_text['runs']:
                    author = short_byline_text['runs'][0].get('text', '')
                    
                views = ''
                view_count_text = vr.get('viewCountText', {})
                if 'simpleText' in view_count_text:
                    views = view_count_text['simpleText']
                elif 'runs' in view_count_text and view_count_text['runs']:
                    views = view_count_text['runs'][0].get('text', '')
                    
                thumbnails = vr.get('thumbnail', {}).get('thumbnails', [])
                cover = thumbnails[-1]['url'] if thumbnails else f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

                if video_id and title and 'YouTube Shorts' not in title:
                    if '歌回' in keyword or 'VTuber' in keyword:
                        category = 'VTuber 歌回與精華'
                    elif '新番' in keyword:
                        category = '新番點評推薦'
                    elif '速通' in keyword or '法環' in keyword:
                        category = '遊戲極限精華'
                    else:
                        category = 'YouTube 即時精選'
                        
                    videos.append({
                        'id': video_id,
                        'title': title.strip(),
                        'author': author or 'YouTube 創作者',
                        'views': views or '',
                        'url': f"https://www.youtube.com/watch?v={video_id}",
                        'cover': cover,
                        'tag': keyword,
                        'category': category
                    })

            for key in obj:
                extract(obj[key])

        extract(data)
        results = videos[:limit]
        logger.info(f"[YouTubeCrawler] 搜尋【{keyword}】成功取得 {len(results)} 部真實即時影片")
        return results

    except Exception as err:
        logger.error(f"[YouTubeCrawler] 搜尋【{keyword}】失敗: {err}")
        return []

async def fetch_youtube_trending(limit: int = 10) -> list:
    """
    抓取 YouTube 即時發燒 / Trending 影片
    """
    try:
        url = 'https://www.youtube.com/feed/trending'
        html = await asyncio.to_thread(_fetch_html, url, 8)
        
        data = extract_yt_initial_data(html)
        if not data:
            return []

        videos = []

        def extract(obj):
            if not obj or not isinstance(obj, (dict, list)):
                return
            
            if isinstance(obj, list):
                for item in obj:
                    extract(item)
                return

            if 'videoRenderer' in obj:
                vr = obj['videoRenderer']
                video_id = vr.get('videoId')
                
                title = ''
                title_obj = vr.get('title', {})
                if 'runs' in title_obj and title_obj['runs']:
                    title = title_obj['runs'][0].get('text', '')
                elif 'simpleText' in title_obj:
                    title = title_obj['simpleText']
                    
                author = ''
                owner_text = vr.get('ownerText', {})
                short_byline_text = vr.get('shortBylineText', {})
                if 'runs' in owner_text and owner_text['runs']:
                    author = owner_text['runs'][0].get('text', '')
                elif 'runs' in short_byline_text and short_byline_text['runs']:
                    author = short_byline_text['runs'][0].get('text', '')
                    
                views = ''
                view_count_text = vr.get('viewCountText', {})
                if 'simpleText' in view_count_text:
                    views = view_count_text['simpleText']
                elif 'runs' in view_count_text and view_count_text['runs']:
                    views = view_count_text['runs'][0].get('text', '')
                    
                thumbnails = vr.get('thumbnail', {}).get('thumbnails', [])
                cover = thumbnails[-1]['url'] if thumbnails else f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

                if video_id and title:
                    videos.append({
                        'id': video_id,
                        'title': title.strip(),
                        'author': author or 'YouTube 創作者',
                        'views': views or '',
                        'url': f"https://www.youtube.com/watch?v={video_id}",
                        'cover': cover,
                        'tag': 'YouTube 發燒熱門',
                        'category': '熱門發燒'
                    })

            for key in obj:
                extract(obj[key])

        extract(data)
        return videos[:limit]

    except Exception as err:
        logger.error(f"[YouTubeCrawler] 抓取 Trending 失敗: {err}")
        return []

if __name__ == '__main__':
    # 簡單的測試執行
    async def main():
        print(await fetch_youtube_videos(limit=2))
        print(await fetch_youtube_trending(limit=2))
    
    asyncio.run(main())
