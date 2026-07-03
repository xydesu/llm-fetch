import os
import re
import time
import hashlib
import requests
import urllib.parse
from ..logger import logger

wbi_keys_cache = {'img_key': None, 'sub_key': None, 'timestamp': 0}

mixin_key_enc_tab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
]

def get_mixin_key(orig):
    return ''.join([orig[n] for n in mixin_key_enc_tab])[:32]

def enc_wbi(params, img_key, sub_key):
    mixin_key = get_mixin_key(img_key + sub_key)
    curr_time = int(time.time())
    
    params['wts'] = curr_time
    query_items = []
    for k in sorted(params.keys()):
        v = str(params[k])
        v = re.sub(r"[!'()*]", '', v)
        query_items.append(f"{urllib.parse.quote(k)}={urllib.parse.quote(v)}")
    
    query = '&'.join(query_items)
    wbi_sign = hashlib.md5((query + mixin_key).encode('utf-8')).hexdigest()
    return query + '&w_rid=' + wbi_sign

def get_wbi_keys():
    global wbi_keys_cache
    now = time.time()
    if wbi_keys_cache['img_key'] and wbi_keys_cache['sub_key'] and now - wbi_keys_cache['timestamp'] < 6 * 3600:
        return wbi_keys_cache

    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        res = requests.get('https://api.bilibili.com/x/web-interface/nav', headers=headers, timeout=5)
        res.raise_for_status()
        json_data = res.json()
        img_url = json_data['data']['wbi_img']['img_url']
        sub_url = json_data['data']['wbi_img']['sub_url']
        
        wbi_keys_cache = {
            'img_key': img_url[img_url.rfind('/') + 1: img_url.rfind('.')],
            'sub_key': sub_url[sub_url.rfind('/') + 1: sub_url.rfind('.')],
            'timestamp': now
        }
        return wbi_keys_cache
    except Exception as e:
        logger.warning(f"取得 Bilibili Wbi Keys 失敗: {str(e)}")
        return None

def resolve_b23_tv(url):
    try:
        res = requests.get(url, allow_redirects=False, timeout=5)
        if 300 <= res.status_code < 400 and 'location' in res.headers:
            return res.headers['location']
    except Exception:
        pass
    return url

def match(url):
    return bool(re.search(r'bilibili\.com/video/[BbaA][Vv]', url, re.IGNORECASE) or re.search(r'b23\.tv/', url, re.IGNORECASE))

def parse(url):
    try:
        if 'b23.tv' in url:
            url = resolve_b23_tv(url)
            
        bvid_match = re.search(r'/video/(BV[a-zA-Z0-9]+)', url, re.IGNORECASE)
        if not bvid_match:
            return None
        bvid = bvid_match.group(1)
        
        headers = {'User-Agent': 'Mozilla/5.0'}
        view_res = requests.get(f'https://api.bilibili.com/x/web-interface/view?bvid={bvid}', headers=headers, timeout=5)
        view_json = view_res.json()
        
        if view_json['code'] != 0:
            logger.warning(f"Bilibili 影片解析失敗 ({bvid}): {view_json.get('message', '')}")
            return None
            
        video_data = view_json['data']
        title = video_data.get('title', '')
        up_name = video_data['owner']['name']
        desc = video_data.get('desc', '')
        cid = video_data.get('cid')
        up_mid = video_data['owner']['mid']
        
        desc_preview = desc[:100] + ('...' if len(desc) > 100 else '')
        result_text = f"[Bilibili 影片: {title} | UP主: {up_name} | 描述: {desc_preview}]"
        
        sessdata = os.environ.get('BILIBILI_SESSDATA')
        if sessdata:
            keys = get_wbi_keys()
            if keys:
                params = {'bvid': bvid, 'cid': cid, 'up_mid': up_mid}
                query = enc_wbi(params, keys['img_key'], keys['sub_key'])
                
                conclusion_res = requests.get(
                    f'https://api.bilibili.com/x/web-interface/view/conclusion/get?{query}',
                    headers={'User-Agent': 'Mozilla/5.0', 'Cookie': f'SESSDATA={sessdata}'},
                    timeout=5
                )
                conclusion_json = conclusion_res.json()
                
                if conclusion_json['code'] == 0 and conclusion_json.get('data', {}).get('model_result'):
                    model_result = conclusion_json['data']['model_result']
                    summary = model_result.get('summary', '')
                    if summary:
                        result_text += f"\n[AI 總結: {summary}]"
                        
                    outline = model_result.get('outline', [])
                    if outline:
                        outline_texts = [f"- {part['title']}" for part in outline if 'title' in part]
                        if outline_texts:
                            result_text += f"\n[影片提綱:\n{chr(10).join(outline_texts)}]"
                elif conclusion_json['code'] == -101:
                    logger.warning("Bilibili AI 總結失敗: 帳號未登入 (SESSDATA 可能過期)")
                    result_text += "\n[系統提示: Bilibili SESSDATA 已失效，無法取得 AI 總結]"
                    
        return {
            'text': result_text,
            'images': []
        }
    except Exception as e:
        logger.warning(f"Bilibili 網址處理失敗 ({url}): {str(e)}")
        return None
