import urllib.parse
import logging
import requests
from bs4 import BeautifulSoup

# 對應 const logger = require('../logger');
logger = logging.getLogger(__name__)

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7'
}

def fetch_twitter_trends(region='japan', limit=15):
    """
    抓取 Twitter / X 即時趨勢話題 (支援 Japan 與 Global)
    :param region: 'japan' 或 'global'
    :param limit: 取得筆數
    :return: List of dicts representing trends
    """
    try:
        target_url = 'https://trends24.in/' if region == 'global' else f'https://trends24.in/{region}/'
        
        res = requests.get(target_url, headers=DEFAULT_HEADERS, timeout=10.0)
        res.raise_for_status()

        html = res.text
        soup = BeautifulSoup(html, 'html.parser')
        trends = []

        trend_card_list = soup.select_one('.trend-card__list')
        if trend_card_list:
            for el in trend_card_list.find_all('li'):
                if len(trends) >= limit:
                    break
                
                a_tag = el.find('a')
                topic = a_tag.text.strip() if a_tag else ''
                
                tweet_count_tag = el.select_one('.tweet-count')
                tweet_count = tweet_count_tag.text.strip() if tweet_count_tag else ''
                
                if topic:
                    trends.append({
                        'topic': topic,
                        'tweetCount': tweet_count or None,
                        'tag': 'Twitter 熱門標籤' if topic.startswith('#') else 'ACG 與社群流行趨勢',
                        'category': '推特熱搜' if topic.startswith('#') else '社群熱門趨勢',
                        'desc': f'Twitter 即時熱門話題，累計約 {tweet_count} 則推文' if tweet_count else 'Twitter 即時熱榜話題',
                        'url': f'https://twitter.com/search?q={urllib.parse.quote(topic)}'
                    })

        logger.info(f'[TwitterCrawler] 成功取得 Twitter ({region}) {len(trends)} 則即時真實趨勢')
        return trends
    except Exception as err:
        logger.error(f'[TwitterCrawler] 取得 Twitter ({region}) 趨勢失敗: {err}')
        return []
