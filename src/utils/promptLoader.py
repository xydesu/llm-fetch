import os
import re
from typing import Dict, Any, List

try:
    from . import logger
except ImportError:
    import logging
    logger = logging.getLogger(__name__)

__dir__ = os.path.dirname(os.path.abspath(__file__))
PROMPTS_DIR = os.path.join(__dir__, '../../prompts')
PERSONAS_DIR = os.path.join(__dir__, '../../personas')

# 確保 prompts 資料夾存在
if not os.path.exists(PROMPTS_DIR):
    os.makedirs(PROMPTS_DIR, exist_ok=True)

def read_markdown_file(file_path: str) -> str:
    """讀取指定的 Markdown 提示詞檔案"""
    try:
        target_path = file_path
        if not os.path.isabs(target_path):
            if target_path.startswith('personas/'):
                target_path = os.path.join(__dir__, '../../', target_path)
            else:
                target_path = os.path.join(PROMPTS_DIR, target_path)
        
        if os.path.exists(target_path):
            with open(target_path, 'r', encoding='utf-8') as f:
                return f.read()
    except Exception as e:
        logger.error(f"[PromptLoader] 讀取 Markdown 檔案失敗 ({file_path}): {str(e)}")
    
    return ''

def write_markdown_file(file_path: str, content: str) -> bool:
    """寫入 Markdown 檔案"""
    try:
        target_path = file_path
        if not os.path.isabs(target_path):
            if target_path.startswith('personas/'):
                target_path = os.path.join(__dir__, '../../', target_path)
            else:
                target_path = os.path.join(PROMPTS_DIR, target_path)
        
        with open(target_path, 'w', encoding='utf-8') as f:
            f.write(content)
        logger.info(f"[PromptLoader] 成功更新與持久化 Markdown 檔案 ({os.path.basename(target_path)})")
        return True
    except Exception as e:
        logger.error(f"[PromptLoader] 寫入 Markdown 檔案失敗 ({file_path}): {str(e)}")
        return False

def parse_blocks(markdown_content: str) -> Dict[str, str]:
    """解析 Markdown 檔案中的「不可變核心」與「自我進化區塊」"""
    immutable_block = ''
    evolvable_block = ''
    
    immutable_match = re.search(r'===\s*核心不可變區塊開始\s*===([\s\S]*?)===\s*核心不可變區塊結束\s*===', markdown_content, re.IGNORECASE)
    if immutable_match:
        immutable_block = immutable_match.group(1).strip()
        
    evolvable_match = re.search(r'===\s*(?:自)?自我進化區塊開始\s*===([\s\S]*?)===\s*(?:自)?自我進化區塊結束\s*===', markdown_content, re.IGNORECASE)
    if evolvable_match:
        evolvable_block = evolvable_match.group(1).strip()
        
    return {
        'immutableBlock': immutable_block,
        'evolvableBlock': evolvable_block
    }

def get_rules_prompt() -> str:
    """獲取主對話規則提示詞 (prompts/rules.md)"""
    raw = read_markdown_file('rules.md')
    blocks = parse_blocks(raw)
    return f"{blocks['immutableBlock']}\n\n{blocks['evolvableBlock']}".strip()

def get_learning_prompt() -> str:
    """獲取知識學習規則提示詞 (prompts/learning_rules.md)"""
    raw = read_markdown_file('learning_rules.md')
    blocks = parse_blocks(raw)
    return f"{blocks['immutableBlock']}\n\n{blocks['evolvableBlock']}".strip()

def get_presence_prompt() -> str:
    """獲取 Presence 動態規則提示詞 (prompts/presence_rules.md)"""
    raw = read_markdown_file('presence_rules.md')
    blocks = parse_blocks(raw)
    return f"{blocks['immutableBlock']}\n\n{blocks['evolvableBlock']}".strip()

def get_reflection_prompt() -> str:
    """獲取反思規則提示詞 (prompts/reflection_rules.md)"""
    raw = read_markdown_file('reflection_rules.md')
    blocks = parse_blocks(raw)
    return f"{blocks['immutableBlock']}\n\n{blocks['evolvableBlock']}".strip()

def get_persona_prompt() -> str:
    """獲取小雪核心人設 (personas/xiaoxue.md)"""
    return read_markdown_file('personas/xiaoxue.md')

def update_evolvable_section(file_name: str, new_evolvable_content: str, reason: str = '小雪自我進化修訂') -> bool:
    """更新指定 Markdown 檔案中的「自我進化區塊」，保持「核心不可變區塊」受保護不被篡改"""
    current_content = read_markdown_file(file_name)
    if not current_content:
        return False
        
    blocks = parse_blocks(current_content)
    old_evolvable_content = blocks.get('evolvableBlock', '')
    success = False
    
    # 檢查是否有自我進化區塊 (支援自自我錯字相容)
    if re.search(r'===\s*(?:自)?自我進化區塊開始\s*===', current_content, re.IGNORECASE):
        updated = re.sub(
            r'===\s*(?:自)?自我進化區塊開始\s*===[\s\S]*?===\s*(?:自)?自我進化區塊結束\s*===',
            f"=== 自我進化區塊開始 ===\n{new_evolvable_content.strip()}\n=== 自我進化區塊結束 ===",
            current_content,
            flags=re.IGNORECASE
        )
        success = write_markdown_file(file_name, updated)
    else:
        # 若檔案尚無進化區塊標籤，追加在檔尾
        updated = f"{current_content.strip()}\n\n=== 自我進化區塊開始 ===\n{new_evolvable_content.strip()}\n=== 自我進化區塊結束 ===\n"
        success = write_markdown_file(file_name, updated)
        
    if success:
        try:
            from ..db import sqlite
            sqlite.add_prompt_evolution_log(file_name, old_evolvable_content or '', new_evolvable_content.strip(), reason)
        except Exception as err:
            logger.warning(f"[PromptLoader] 記錄提示詞進化 DB Log 失敗: {str(err)}")
            
    return success

def get_all_prompt_files() -> List[Dict[str, str]]:
    """取得所有提示詞與人設檔案列表及解析後的區塊"""
    results = []
    if os.path.exists(PROMPTS_DIR):
        files = os.listdir(PROMPTS_DIR)
        for f in files:
            if f.endswith('.md'):
                raw = read_markdown_file(f)
                blocks = parse_blocks(raw)
                results.append({
                    'fileName': f,
                    'path': f"prompts/{f}",
                    'rawContent': raw,
                    'immutableBlock': blocks['immutableBlock'],
                    'evolvableBlock': blocks['evolvableBlock']
                })
                
    # 加入 personas/xiaoxue.md
    persona_raw = read_markdown_file('personas/xiaoxue.md')
    if persona_raw:
        blocks = parse_blocks(persona_raw)
        results.append({
            'fileName': 'personas/xiaoxue.md',
            'path': 'personas/xiaoxue.md',
            'rawContent': persona_raw,
            'immutableBlock': blocks['immutableBlock'],
            'evolvableBlock': blocks['evolvableBlock']
        })
        
    return results

def update_person_block(new_person_block_content: str) -> bool:
    """更新 personas/xiaoxue.md 中的人名穩定區塊"""
    file_path = 'personas/xiaoxue.md'
    current_content = read_markdown_file(file_path)
    if not current_content:
        return False
        
    updated = re.sub(
        r'===\s*人名穩定區塊開始\s*===[\s\S]*?===\s*人名穩定區塊結束\s*===',
        f"=== 人名穩定區塊開始 ===\n{new_person_block_content.strip()}\n=== 人名穩定區塊結束 ===",
        current_content,
        flags=re.IGNORECASE
    )
    return write_markdown_file(file_path, updated)

def render_template(template: str, variables: Dict[str, Any] = None) -> str:
    """將 {{named_placeholders}} 以執行期資料插值 (僅代換資料，不含任何指令文字)"""
    if variables is None:
        variables = {}
        
    template_str = str(template or '')
    
    def replacer(match):
        key = match.group(1)
        value = variables.get(key)
        return '' if value is None else str(value)
        
    return re.sub(r'{{([A-Za-z0-9_]+)}}', replacer, template_str)

def parse_named_sections(markdown_content: str) -> Dict[str, str]:
    """解析 Markdown 檔案中以 '## 名稱' 分段的多段式提示詞"""
    sections = {}
    lines = str(markdown_content or '').splitlines()
    current_name = None
    buffer = []
    
    def flush():
        if current_name:
            sections[current_name] = '\n'.join(buffer).strip()
            
    for line in lines:
        match = re.match(r'^##\s+([A-Za-z0-9_.\-]+)\s*$', line)
        if match:
            flush()
            current_name = match.group(1)
            buffer = []
        elif current_name:
            buffer.append(line)
            
    flush()
    return sections

def get_prompt_section(file_name: str, section_name: str) -> str:
    """取得 Markdown 檔案中指定具名區塊的原始內容"""
    sections = parse_named_sections(read_markdown_file(file_name))
    return sections.get(section_name, '')

def render_prompt_section(file_name: str, section_name: str, variables: Dict[str, Any] = None) -> str:
    """取得 Markdown 檔案中指定具名區塊並完成 {{placeholder}} 插值"""
    if variables is None:
        variables = {}
    return render_template(get_prompt_section(file_name, section_name), variables)

def get_prompt(file_name: str) -> str:
    """通用提示詞載入函式：傳入檔名 (如 'fact_extraction_rules.md')，回傳組合後的完整提示詞"""
    raw = read_markdown_file(file_name)
    blocks = parse_blocks(raw)
    if blocks['immutableBlock'] or blocks['evolvableBlock']:
        return f"{blocks['immutableBlock']}\n\n{blocks['evolvableBlock']}".strip()
    return raw.strip()

def render_prompt(file_name: str, variables: Dict[str, Any] = None) -> str:
    """
    Loads a Markdown prompt template and replaces {{named_placeholders}} with
    runtime context. Prompt instructions belong in Markdown; callers supply data only.
    """
    if variables is None:
        variables = {}
    return render_template(get_prompt(file_name), variables)
