import re
from .urlMetadata import parse_url

def extract_urls_metadata(text):
    if not text:
        return {'texts': [], 'images': []}
        
    url_regex = re.compile(r'(https?://[^\s]+)')
    urls = url_regex.findall(text)
    
    unique_urls = list(dict.fromkeys(urls))[:2]
    results = []
    images = []
    
    for url in unique_urls:
        metadata = parse_url(url)
        if metadata:
            if metadata.get('text'):
                results.append(metadata['text'])
            if metadata.get('images'):
                images.extend(metadata['images'])
            
    return {'texts': results, 'images': images}
