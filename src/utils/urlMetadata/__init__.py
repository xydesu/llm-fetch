from . import bilibiliParser
from . import defaultParser
from . import twitterParser
from . import youtubeParser
from . import facebookParser

parsers = [
    facebookParser,
    youtubeParser,
    twitterParser,
    bilibiliParser,
    defaultParser
]

def parse_url(url):
    if not url.startswith('http://') and not url.startswith('https://'):
        url = 'https://' + url
        
    for parser in parsers:
        if parser.match(url):
            return parser.parse(url)
    return None
