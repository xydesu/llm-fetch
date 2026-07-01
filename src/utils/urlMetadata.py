import re
from .urlMetadata import parse_url

def extract_urls_metadata(text):
    if not text:
        return []
        
    url_regex = re.compile(r'(https?://[^\s]+)')
    urls = url_regex.findall(text)
    
    # 移除重複並限制最多處理 2 個 URL
    unique_urls = list(dict.fromkeys(urls))[:2]
    results = []
    
    for url in unique_urls:
        metadata_string = parse_url(url)
        if metadata_string:
            results.append(metadata_string)
            
    return results
