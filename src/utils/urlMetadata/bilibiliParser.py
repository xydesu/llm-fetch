import hashlib
import json
import os
import re
import time
import urllib.parse
import asyncio
import httpx
from bs4 import BeautifulSoup

from .. import logger
from .. import promptLoader

URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md'

# Wbi 簽名金鑰快取 (每日有效)
wbi_keys_cache = {'img_key': None, 'sub_key': None, 'timestamp': 0}

mixin_key_enc_tab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
]

def get_mixin_key(orig: str) -> str:
    return ''.join(orig[n] for n in mixin_key_enc_tab)[:32]

def enc_wbi(params: dict, img_key: str, sub_key: str) -> str:
    mixin_key = get_mixin_key(img_key + sub_key)
    curr_time = int(time.time())
    chr_filter = re.compile(r"[!'()*]")
    
    params['wts'] = curr_time
    
    # Sort keys
    sorted_keys = sorted(params.keys())
    
    query_parts = []
    for key in sorted_keys:
        val = str(params[key])
        val = chr_filter.sub('', val)
        query_parts.append(f"{urllib.parse.quote(key)}={urllib.parse.quote(val)}")
        
    query = '&'.join(query_parts)
    wbi_sign = hashlib.md5((query + mixin_key).encode('utf-8')).hexdigest()
    return f"{query}&w_rid={wbi_sign}"

async def get_wbi_keys(client: httpx.AsyncClient):
    global wbi_keys_cache
    now = int(time.time() * 1000)
    # 快取 6 小時
    if wbi_keys_cache['img_key'] and wbi_keys_cache['sub_key'] and now - wbi_keys_cache['timestamp'] < 6 * 60 * 60 * 1000:
        return wbi_keys_cache

    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        response = await client.get('https://api.bilibili.com/x/web-interface/nav', headers=headers)
        json_data = response.json()
        img_url = json_data['data']['wbi_img']['img_url']
        sub_url = json_data['data']['wbi_img']['sub_url']

        img_key = img_url[img_url.rfind('/') + 1:img_url.rfind('.')]
        sub_key = sub_url[sub_url.rfind('/') + 1:sub_url.rfind('.')]
        
        wbi_keys_cache = {
            'img_key': img_key,
            'sub_key': sub_key,
            'timestamp': now
        }
        return wbi_keys_cache
    except Exception as e:
        logger.warn(f"取得 Bilibili Wbi Keys 失敗: {e}")
        return None

async def resolve_b23_tv(client: httpx.AsyncClient, url: str) -> str:
    try:
        response = await client.get(url, follow_redirects=False)
        if 300 <= response.status_code < 400 and 'location' in response.headers:
            return response.headers['location']
    except Exception:
        pass
    return url

def match(url: str) -> bool:
    return bool(re.search(r'bilibili\.com/video/[BbaA][Vv]', url, re.I) or re.search(r'b23\.tv/', url, re.I))

async def parse(url: str):
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            # 解析短網址
            if 'b23.tv' in url:
                url = await resolve_b23_tv(client, url)

            # 提取 bvid
            bvid_match = re.search(r'/video/(BV[a-zA-Z0-9]+)', url, re.I)
            if not bvid_match:
                return None
            bvid = bvid_match.group(1)

            title = ''
            up_name = promptLoader.render_prompt_section(URL_CONTEXT_PROMPT_FILE, 'bilibili_unknown_up') if hasattr(promptLoader, 'render_prompt_section') else promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'bilibili_unknown_up')
            desc = ''
            pic_url = ''
            cid = None
            up_mid = None

            def render_prompt(*args, **kwargs):
                if hasattr(promptLoader, 'render_prompt_section'):
                    return promptLoader.render_prompt_section(*args, **kwargs)
                return promptLoader.renderPromptSection(*args, **kwargs)

            # 1. 優先嘗試 API 讀取
            try:
                keys = await get_wbi_keys(client)
                api_url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
                if keys:
                    query = enc_wbi({'bvid': bvid}, keys['img_key'], keys['sub_key'])
                    api_url = f"https://api.bilibili.com/x/web-interface/wbi/view?{query}"

                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.bilibili.com/'
                }
                view_res = await client.get(api_url, headers=headers)
                text = view_res.text
                if text.startswith('{'):
                    view_json = view_res.json()
                    if view_json.get('code') == 0 and view_json.get('data'):
                        video_data = view_json['data']
                        title = video_data.get('title', '')
                        
                        owner = video_data.get('owner', {})
                        up_name = owner.get('name') or render_prompt(URL_CONTEXT_PROMPT_FILE, 'bilibili_unknown_up')
                        desc = video_data.get('desc', '')
                        pic_url = video_data.get('pic', '').strip()
                        cid = video_data.get('cid')
                        up_mid = owner.get('mid')
            except Exception as api_err:
                logger.debug(f"[Bilibili] API 解析失敗，啟動網頁 HTML 備援: {api_err}")

            # 2. 若 API 遭風控或失敗，使用原生 HTML OpenGraph 進行備援解析
            if not title:
                try:
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept-Language': 'zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7'
                    }
                    page_res = await client.get(f"https://www.bilibili.com/video/{bvid}", headers=headers)
                    if page_res.status_code == 200:
                        soup = BeautifulSoup(page_res.text, 'html.parser')
                        
                        og_title = soup.select_one('meta[property="og:title"]')
                        soup_title = soup.title
                        title = (og_title['content'] if og_title and og_title.get('content') else (soup_title.text if soup_title else ''))
                        title = re.sub(r'_哔哩哔哩_bilibili$', '', title, flags=re.I).strip()
                        
                        og_desc = soup.select_one('meta[property="og:description"]')
                        meta_desc = soup.select_one('meta[name="description"]')
                        desc = (og_desc['content'] if og_desc and og_desc.get('content') else (meta_desc['content'] if meta_desc and meta_desc.get('content') else '')).strip()
                        
                        og_image = soup.select_one('meta[property="og:image"]')
                        pic_url = (og_image['content'] if og_image and og_image.get('content') else '').strip()
                        
                        author_meta = soup.select_one('meta[name="author"]')
                        author = (author_meta['content'] if author_meta and author_meta.get('content') else '').strip()
                        up_name = author or render_prompt(URL_CONTEXT_PROMPT_FILE, 'bilibili_up_fallback')
                        
                except Exception as html_err:
                    logger.warn(f"[Bilibili] HTML 備援解析失敗: {html_err}")

            if not title:
                return None

            images = []
            if pic_url:
                if pic_url.startswith('//'):
                    pic_url = 'https:' + pic_url
                images.append(pic_url)

            description_text = desc[:100] + (render_prompt(URL_CONTEXT_PROMPT_FILE, 'description_ellipsis') if len(desc) > 100 else '')
            
            result_text = render_prompt(URL_CONTEXT_PROMPT_FILE, 'bilibili_video', {
                'title': title,
                'up_name': up_name,
                'description': description_text
            })

            # 3. 取得 AI 總結 (需要 SESSDATA)
            sessdata = os.environ.get('BILIBILI_SESSDATA')
            if sessdata:
                if keys:
                    params = {'bvid': bvid, 'cid': cid, 'up_mid': up_mid}
                    query = enc_wbi(params, keys['img_key'], keys['sub_key'])
                    
                    headers = {
                        'User-Agent': 'Mozilla/5.0',
                        'Cookie': f'SESSDATA={sessdata}'
                    }
                    conclusion_res = await client.get(f"https://api.bilibili.com/x/web-interface/view/conclusion/get?{query}", headers=headers)
                    conclusion_json = conclusion_res.json()
                    logger.debug(f"Conclusion JSON: {json.dumps(conclusion_json)}")

                    if conclusion_json.get('code') == 0 and conclusion_json.get('data') and conclusion_json['data'].get('model_result'):
                        model_result = conclusion_json['data']['model_result']
                        summary = model_result.get('summary', '')
                        
                        if summary:
                            result_text += '\n' + render_prompt(URL_CONTEXT_PROMPT_FILE, 'bilibili_ai_summary', {'summary': summary})

                        # 加入提綱
                        outline = model_result.get('outline', [])
                        if outline:
                            outline_texts = []
                            for part in outline:
                                if part.get('title'):
                                    outline_texts.append(render_prompt(URL_CONTEXT_PROMPT_FILE, 'bilibili_outline_item', {'title': part['title']}))
                            if outline_texts:
                                result_text += '\n' + render_prompt(URL_CONTEXT_PROMPT_FILE, 'bilibili_outline', {'outline': '\n'.join(outline_texts)})
                    elif conclusion_json.get('code') == -101:
                        logger.warn("Bilibili AI 總結失敗: 帳號未登入 (SESSDATA 可能過期)")
                        result_text += '\n' + render_prompt(URL_CONTEXT_PROMPT_FILE, 'bilibili_sessdata_invalid')

            return {
                'text': result_text,
                'images': images
            }
            
    except Exception as err:
        logger.warn(f"Bilibili 網址處理失敗 ({url}): {err}")
        return None
