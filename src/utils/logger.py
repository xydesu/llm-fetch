import os
import sys
import logging
from datetime import datetime

log_dir = os.path.join(os.path.dirname(__file__), '../../logs')
os.makedirs(log_dir, exist_ok=True)

class CustomFormatter(logging.Formatter):
    COLORS = {
        'INFO': '\x1b[36m',   # Cyan
        'WARNING': '\x1b[33m',# Yellow
        'ERROR': '\x1b[31m',  # Red
        'DEBUG': '\x1b[90m',  # Gray
        'RESET': '\x1b[0m'
    }

    def format(self, record):
        log_fmt = f"{self.COLORS.get(record.levelname, self.COLORS['RESET'])}[{record.levelname}]{self.COLORS['RESET']} [%(asctime)s] %(message)s"
        formatter = logging.Formatter(log_fmt, datefmt='%Y-%m-%d %H:%M:%S')
        return formatter.format(record)

def get_logger():
    logger = logging.getLogger('LLMFetch')
    if not logger.handlers:
        logger.setLevel(logging.DEBUG)
        
        ch = logging.StreamHandler(sys.stdout)
        ch.setLevel(logging.DEBUG)
        ch.setFormatter(CustomFormatter())
        logger.addHandler(ch)
        
        log_date = datetime.now().strftime('%Y-%m-%d')
        log_file = os.path.join(log_dir, f'bot-{log_date}.log')
        fh = logging.FileHandler(log_file, encoding='utf-8')
        fh.setLevel(logging.INFO)
        fh_formatter = logging.Formatter('[%(asctime)s] [%(levelname)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
        fh.setFormatter(fh_formatter)
        logger.addHandler(fh)
        
    return logger

logger = get_logger()
