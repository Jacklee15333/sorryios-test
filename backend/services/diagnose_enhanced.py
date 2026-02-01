#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
匹配问题诊断脚本 - Windows增强版
查看所有包含 'spend' 的规则
"""
import sqlite3
import json
import os

# Windows数据库路径
DATA_DIR = r'D:\sorryios-test\data'
MATCHING_DB = os.path.join(DATA_DIR, 'matching.db')
VOCABULARY_DB = os.path.join(DATA_DIR, 'vocabulary.db')
GRAMMAR_DB = os.path.join(DATA_DIR, 'grammar.db')

print("=" * 100)
print("匹配问题详细诊断报告")
print("=" * 100)

# ============================================================================
# 第1部分：查看所有包含 'spend' 的替换规则
# ============================================================================
print("\n" + "=" * 100)
print("第1部分：matching.db 中所有包含 'spend' 的规则")
print("=" * 100)

try:
    conn_matching = sqlite3.connect(MATCHING_DB)
    cursor = conn_matching.cursor()

    # 查看所有包含 spend 的规则
    cursor.execute("""
        SELECT id, original_text, original_type, action, target_text, notes 
        FROM matching_rules 
        WHERE LOWER(original_text) LIKE '%spend%'
        ORDER BY id
    """)
    rules = cursor.fetchall()

    if rules:
        print(f"\n✅ 找到 {len(rules)} 条包含 'spend' 的规则:\n")
        
        for rule in rules:
            rule_id, orig_text, orig_type, action, target_text, notes = rule
            print("=" * 80)
            print(f"规则 ID: {rule_id}")
            print(f"Original Text: [{orig_text}]")  # 用方括号显示，方便看空格
            print(f"Original Text (repr): {repr(orig_text)}")  # 显示真实字符
            print(f"Original Type: {orig_type}")
            print(f"Action: {action}")
            
            if target_text:
                if len(target_text) > 200:
                    print(f"Target Text: {target_text[:200]}...")
                else:
                    print(f"Target Text: {target_text}")
                
                # 尝试解析JSON
                if target_text.startswith('['):
                    try:
                        targets = json.loads(target_text)
                        print(f"\n  目标词条 ({len(targets)}个):")
                        for i, target in enumerate(targets, 1):
                            print(f"    [{i}] {target.get('text')} ({target.get('type')}, ID {target.get('id')})")
                    except:
                        pass
            else:
                print(f"Target Text: (空 - 排除规则)")
            
            if notes:
                print(f"Notes: {notes}")
            print()
    else:
        print("\n❌ 没有找到任何包含 'spend' 的规则")
        print("请检查 matching.db 数据库是否正确")

    # 统计信息
    cursor.execute("SELECT COUNT(*) FROM matching_rules")
    total = cursor.fetchone()[0]
    print(f"\n📊 统计: matching_rules 表中共有 {total} 条规则")

    conn_matching.close()
    
except Exception as e:
    print(f"❌ 连接数据库失败: {e}")

# ============================================================================
# 第2部分：精确匹配测试
# ============================================================================
print("\n" + "=" * 100)
print("第2部分：精确匹配测试")
print("=" * 100)

test_texts = [
    'spend time doing sth.',
    'spend time doing sth',  # 无点号
    ' spend time doing sth.',  # 前面有空格
    'spend time doing sth. ',  # 后面有空格
]

test_types = ['pattern', 'grammar', 'phrase']

try:
    conn_matching = sqlite3.connect(MATCHING_DB)
    cursor = conn_matching.cursor()
    
    for text in test_texts:
        for typ in test_types:
            cursor.execute("""
                SELECT id FROM matching_rules 
                WHERE original_text = ? AND original_type = ?
            """, (text, typ))
            result = cursor.fetchone()
            
            status = f"✅ ID {result[0]}" if result else "❌"
            print(f"{status}  Text: [{text}]  Type: {typ}")
    
    conn_matching.close()
    
except Exception as e:
    print(f"❌ 测试失败: {e}")

# ============================================================================
# 第3部分：模糊匹配测试（大小写不敏感）
# ============================================================================
print("\n" + "=" * 100)
print("第3部分：模糊匹配测试")
print("=" * 100)

try:
    conn_matching = sqlite3.connect(MATCHING_DB)
    cursor = conn_matching.cursor()
    
    test_text = 'spend time doing sth.'
    
    for typ in test_types:
        cursor.execute("""
            SELECT id, original_text FROM matching_rules 
            WHERE LOWER(TRIM(original_text)) = LOWER(TRIM(?)) 
            AND LOWER(TRIM(original_type)) = LOWER(TRIM(?))
        """, (test_text, typ))
        result = cursor.fetchone()
        
        if result:
            print(f"✅ Type: {typ}  →  ID {result[0]}  Original: [{result[1]}]")
        else:
            print(f"❌ Type: {typ}  →  未找到")
    
    conn_matching.close()
    
except Exception as e:
    print(f"❌ 测试失败: {e}")

# ============================================================================
# 第4部分：建议
# ============================================================================
print("\n" + "=" * 100)
print("诊断建议")
print("=" * 100)

print("""
根据上述结果：

1. 如果第1部分显示有规则，但第2/3部分显示未找到
   → 说明文本有细微差异（空格、换行符等）
   → 需要检查数据库中实际存储的文本

2. 如果第1部分就没有找到任何规则
   → 说明规则根本不存在
   → 需要手动添加规则

3. 查看第1部分输出的 original_text (repr)
   → 可以看到真实的字符，包括隐藏的空格、换行等

建议的解决方案：
1. 如果规则不存在，需要添加规则
2. 如果规则存在但匹配不到，需要修复 findRule() 的匹配逻辑
3. 或者直接在 patterns 表中添加数据，避免依赖替换规则
""")

print("\n" + "=" * 100)
print("诊断完成")
print("=" * 100)
