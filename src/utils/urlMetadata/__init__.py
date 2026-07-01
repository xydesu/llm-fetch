from . import bilibiliParser
from . import defaultParser

parsers = [
    bilibiliParser,
    defaultParser
]

def parse_url(url):
    for parser in parsers:
        if parser.match(url):
            return parser.parse(url)
    return None
