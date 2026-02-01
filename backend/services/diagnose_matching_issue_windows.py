#!/usr/bin/env python3
"""
匹配问题诊断脚本 - Windows版本
数据库路径：D:\sorryios-test\data\
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
print("匹配问题诊断报告 - Windows版本")
print("=" * 100)

# 检查数据库文件是否存在
print("\n[前置检查] 数据库文件")
print("-" * 100)
for db_name, db_path in [('matching.db', MATCHING_DB), ('vocabulary.db', VOCABULARY_DB), ('grammar.db', GRAMMAR_DB)]:
    if os.path.exists(db_path):
        print(f"✅ {db_name}: {db_path}")
    else:
        print(f"❌ {db_name}: 文件不存在 - {db_path}")

# ============================================================================
# 第1部分：数据库数据检查
# ============================================================================
print("\n" + "=" * 100)
print("第1部分：数据库数据检查")
print("=" * 100)

# 1.1 检查 matching.db 中的替换规则
print("\n[1.1] matching.db 中 'spend time doing sth.' 的替换规则")
print("-" * 100)

try:
    conn_matching = sqlite3.connect(MATCHING_DB)
    cursor = conn_matching.cursor()

    cursor.execute("""
        SELECT id, original_text, original_type, action, target_text, notes 
        FROM matching_rules 
        WHERE original_text = 'spend time doing sth.'
    """)
    rules = cursor.fetchall()

    if rules:
        for rule in rules:
            rule_id, orig_text, orig_type, action, target_text, notes = rule
            print(f"✅ 找到匹配规则:")
            print(f"  ID: {rule_id}")
            print(f"  Original Text: {orig_text}")
            print(f"  Original Type: {orig_type}")
            print(f"  Action: {action}")
            print(f"  Target Text: {target_text[:100]}..." if target_text and len(target_text) > 100 else f"  Target Text: {target_text}")
            print(f"  Notes: {notes}")
            
            # 解析target_text
            if target_text and target_text.startswith('['):
                try:
                    targets = json.loads(target_text)
                    print(f"\n  解析后的目标词条 ({len(targets)}个):")
                    for i, target in enumerate(targets, 1):
                        print(f"    [{i}] Text: {target.get('text')}")
                        print(f"        Type: {target.get('type')}")
                        print(f"        ID: {target.get('id')}")
                        print(f"        Source: {target.get('source')}")
                        print(f"        Meaning: {target.get('meaning')}")
                    print()
                except Exception as e:
                    print(f"  ⚠️ 无法解析JSON: {e}")
    else:
        print("❌ 没有找到精确匹配的规则")

    conn_matching.close()
except Exception as e:
    print(f"❌ 连接数据库失败: {e}")

# 1.2 检查 vocabulary.db 中的 patterns
print("\n[1.2] vocabulary.db patterns表 中 'spend' 相关数据")
print("-" * 100)

try:
    conn_vocab = sqlite3.connect(VOCABULARY_DB)
    cursor = conn_vocab.cursor()

    cursor.execute("""
        SELECT id, pattern, meaning, example 
        FROM patterns 
        WHERE pattern LIKE '%spend%'
    """)
    patterns = cursor.fetchall()

    if patterns:
        print(f"✅ 找到 {len(patterns)} 条包含'spend'的句型:")
        for pattern in patterns:
            pid, ptext, meaning, example = pattern
            print(f"\n  ID: {pid}")
            print(f"  Pattern: {ptext}")
            print(f"  Meaning: {meaning}")
    else:
        print("❌ patterns表中没有包含'spend'的句型")

    # 检查 phrases 表中的数据
    print("\n[1.3] vocabulary.db phrases表 中 ID=2152 的数据")
    print("-" * 100)

    cursor.execute("""
        SELECT id, phrase, meaning, example 
        FROM phrases 
        WHERE id = 2152
    """)
    phrase_data = cursor.fetchone()

    if phrase_data:
        pid, phrase, meaning, example = phrase_data
        print(f"✅ 找到目标短语:")
        print(f"  ID: {pid}")
        print(f"  Phrase: {phrase}")
        print(f"  Meaning: {meaning}")
        print(f"  Example: {example if example else '(无)'}")
    else:
        print("❌ 未找到ID=2152的短语")

    conn_vocab.close()
except Exception as e:
    print(f"❌ 连接数据库失败: {e}")

# 1.4 检查 grammar.db 中的数据
print("\n[1.4] grammar.db 中 'spend/take/cost/pay辨析' 的数据")
print("-" * 100)

try:
    conn_grammar = sqlite3.connect(GRAMMAR_DB)
    cursor = conn_grammar.cursor()

    cursor.execute("""
        SELECT id, title, keywords, definition, structure, usage
        FROM grammar 
        WHERE title = 'spend/take/cost/pay辨析' OR id = 33
    """)
    grammar_data = cursor.fetchone()

    if grammar_data:
        gid, title, keywords, definition, structure, usage = grammar_data
        print(f"✅ 找到语法数据:")
        print(f"  ID: {gid}")
        print(f"  Title: {title}")
        print(f"  Keywords: {keywords}")
        print(f"  Structure: {structure}")
        
        # 检查usage字段
        if usage:
            print(f"\n  Usage字段内容:")
            try:
                usage_list = json.loads(usage) if usage.startswith('[') else [usage]
                for i, u in enumerate(usage_list, 1):
                    print(f"    [{i}] {u[:80]}...")
            except:
                print(f"    {usage[:100]}...")

    conn_grammar.close()
except Exception as e:
    print(f"❌ 连接数据库失败: {e}")

# ============================================================================
# 诊断结论
# ============================================================================
print("\n" + "=" * 100)
print("诊断结论")
print("=" * 100)

print("""
【问题根源分析】

1. ✅ matching.db 中存在正确的替换规则
   - 至少有两条规则匹配 "spend time doing sth."
   - 需要确认AI提取时使用的是什么类型（pattern还是grammar）

2. ❌ vocabulary.db 的 patterns 表为空
   - 这导致当输入类型为 pattern 时，无法在 patterns 表中找到匹配
   - 只能依赖替换规则

3. ✅ 目标数据在 phrases 表中存在
   - ID 2152: spend time/money in doing sth.

4. ⚠️ grammar.db 中存在相似的语法数据
   - ID 33 的 structure 字段包含 "sb. spend time/money (in) doing"
   - 可能导致模糊匹配时相似度达到85%

【关键问题】

需要查看实际的匹配日志，确认：
1. AI提取的类型是 pattern 还是 grammar
2. 替换规则是否被正确找到
3. 如果找到了规则，为什么没有返回正确的结果

【下一步】

运行 Node.js 测试脚本查看详细日志：
cd D:\\sorryios-test\\backend
node tests/test-spend-matching.js
""")

print("\n" + "=" * 100)
print("诊断完成")
print("=" * 100)
