from . import bilibiliParser
from . import defaultParser
from . import twitterParser

parsers = [
    twitterParser,
    bilibiliParser,
    defaultParser
]

def parse_url(url):
    for parser in parsers:
        if parser.match(url):
            return parser.parse(url)
    return None
