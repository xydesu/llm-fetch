from typing import Optional, Dict, Any

from . import defaultParser
from . import bilibiliParser
from . import twitterParser
from . import youtubeParser
from . import facebookParser
from . import threadsParser
from . import instagramParser
from . import discordParser
from . import googleMapsParser

# 專用解析器清單，優先順序由上到下
dedicatedParsers = [
    discordParser, # Discord 內部連結優先處理，避免被通用爬蟲誤爬
    googleMapsParser, # Google Maps 連結優先處理，避免回退通用爬蟲誤抓 staticmap
    youtubeParser,
    twitterParser,
    bilibiliParser,
    facebookParser,
    threadsParser,
    instagramParser
]

def isValidMetadata(metadata: Optional[Dict[str, Any]]) -> bool:
    """
    驗證解析結果是否包含有效的 metadata（包含文字或圖片）
    """
    if not metadata or not isinstance(metadata, dict):
        return False
    
    text = metadata.get('text')
    hasText = isinstance(text, str) and len(text.strip()) > 0
    
    images = metadata.get('images')
    hasImages = isinstance(images, list) and len(images) > 0
    
    return bool(hasText or hasImages)

async def parseUrl(url: str, context: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """
    解析網址並擷取 metadata
    """
    if context is None:
        context = {}

    if not url or not isinstance(url, str):
        return None

    # 確保網址包含 protocol
    if not url.startswith('http://') and not url.startswith('https://'):
        url = 'https://' + url

    # 依序檢查專用解析器
    for parser in dedicatedParsers:
        try:
            if parser.match(url):
                metadata = await parser.parse(url, context)
                if isValidMetadata(metadata):
                    return metadata
                # 專用解析器匹配但明確未取得有效內容（例如已判定看不到內容或受限），直接結束，絕不回退至 defaultParser
                return None
        except Exception:
            # 專用解析器執行異常，直接結束，避免回退造成宣傳圖誤爬
            return None

    # 當無專用解析器匹配時，回退使用通用解析器
    try:
        fallbackMetadata = await defaultParser.parse(url)
        return fallbackMetadata if isValidMetadata(fallbackMetadata) else None
    except Exception:
        return None

__all__ = ['parseUrl']
