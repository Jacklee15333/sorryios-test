#!/usr/bin/env python3
"""
匹配问题诊断脚本 - spend time doing sth. 问题分析
"""
import sqlite3
import json

print("=" * 100)
print("匹配问题诊断报告")
print("=" * 100)

# ============================================================================
# 第1部分：数据库数据检查
# ============================================================================
print("\n" + "=" * 100)
print("第1部分：数据库数据检查")
print("=" * 100)

# 1.1 检查 matching.db 中的替换规则
print("\n[1.1] matching.db 中 'spend time doing sth.' 的替换规则")
print("-" * 100)

conn_matching = sqlite3.connect('/mnt/user-data/uploads/1769943153828_matching.db')
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
        print(f"  Target Text: {target_text}")
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
            except:
                print(f"  ⚠️ 无法解析JSON格式的target_text")
else:
    print("❌ 没有找到精确匹配的规则")
    print("正在检查模糊匹配...")
    
    cursor.execute("""
        SELECT id, original_text, original_type, action, target_text, notes 
        FROM matching_rules 
        WHERE original_text LIKE '%spend%time%doing%'
    """)
    fuzzy_rules = cursor.fetchall()
    
    if fuzzy_rules:
        print(f"✅ 找到 {len(fuzzy_rules)} 条可能相关的规则:")
        for rule in fuzzy_rules:
            rule_id, orig_text, orig_type, action, target_text, notes = rule
            print(f"\n  规则 ID {rule_id}:")
            print(f"    Original Text: {orig_text}")
            print(f"    Original Type: {orig_type}")

conn_matching.close()

# 1.2 检查 vocabulary.db 中的 patterns
print("\n[1.2] vocabulary.db patterns表 中 'spend time/money in doing sth.' 的数据")
print("-" * 100)

conn_vocab = sqlite3.connect('/mnt/user-data/uploads/1769943153828_vocabulary.db')
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
        print(f"  Example: {example}")
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
    print(f"  Example: {example}")
else:
    print("❌ 未找到ID=2152的短语")

conn_vocab.close()

# 1.4 检查 grammar.db 中的数据
print("\n[1.4] grammar.db 中 'spend/take/cost/pay辨析' 的数据")
print("-" * 100)

conn_grammar = sqlite3.connect('/mnt/user-data/uploads/1769943153828_grammar.db')
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
    print(f"  Definition: {definition[:200]}...")
    print(f"  Structure: {structure}")
    
    # 检查usage字段
    if usage:
        print(f"\n  Usage字段内容:")
        try:
            usage_list = json.loads(usage) if usage.startswith('[') else [usage]
            for i, u in enumerate(usage_list, 1):
                print(f"    [{i}] {u[:100]}...")
        except:
            print(f"    {usage[:200]}...")

conn_grammar.close()

# ============================================================================
# 第2部分：匹配流程分析
# ============================================================================
print("\n" + "=" * 100)
print("第2部分：匹配流程分析")
print("=" * 100)

print("""
根据 matchPattern 方法的流程：

1. 输入: "spend time doing sth." (type: pattern)

2. 第一步：matching.db 精确匹配
   - 查找 original_text = "spend time doing sth." AND original_type = "pattern"
   - 如果找到且 target_text 不为空：
     → 调用 _processAndApplyReplaceRule()
     → 解析 target_text JSON
     → 返回 replaced_multi: true

3. 第二步：vocabulary.db patterns表 精确匹配
   - 查找 pattern = "spend time doing sth."（忽略大小写）
   - 如果找到：直接返回 100% 匹配

4. 第三步：matching.db 模糊匹配
   - 调用 _findReplaceRuleFuzzyOnly()
   - 检查是否包含占位符（模板检测）
   - 如果是模板，跳过模糊匹配

5. 第四步：vocabulary.db patterns表 模糊匹配
   - 调用 _matchPatternInternal()
   - 使用 findBestMatch() 计算相似度
   
6. 第五步：如果patterns表找不到，尝试grammar库
   - 调用 _matchGrammarInternal()
   - 在 grammar.title, keywords, structure, usage 中查找
""")

# ============================================================================
# 第3部分：问题诊断
# ============================================================================
print("\n" + "=" * 100)
print("第3部分：问题诊断")
print("=" * 100)

print("""
【问题分析】

输入: "spend time doing sth."
期望: 匹配到 "spend time/money in doing sth." (ID 2152, phrases表)
实际: 匹配到 "spend/take/cost/pay辨析" (ID 33, grammar表, 85%相似度)

【可能原因】

1. ⚠️ 替换规则未生效
   - matching.db 中虽然有规则 (ID 466)
   - 但可能在代码执行时未被正确触发
   
2. ⚠️ 模板检测误判
   - "spend time doing sth." 可能被判定为"通用模板"
   - 导致跳过了 matching.db 的模糊匹配
   
3. ⚠️ patterns表为空
   - vocabulary.db 的 patterns 表中没有任何包含 'spend' 的数据
   - 导致直接跳到了 grammar 库匹配
   
4. ⚠️ grammar库误匹配
   - grammar.usage 或 grammar.keywords 中可能包含相似的文本
   - 导致相似度达到85%

【需要验证的点】

✓ matching.db 规则 ID 466 存在且配置正确
✓ vocabulary.db phrases 表 ID 2152 存在且是目标数据
✗ vocabulary.db patterns 表为空（问题关键！）
✓ grammar.db ID 33 存在

【问题根源】

vocabulary.db 的 patterns 表中没有 "spend time/money in doing sth."
但 matching.db 的规则指向的是 phrases 表 (type: "phrase", id: 2152)

这说明：
1. 替换规则配置正确
2. 目标数据在 phrases 表中存在
3. 但由于输入类型是 'pattern'，所以先在 patterns 表中查找
4. patterns 表为空，导致继续模糊匹配
5. 模糊匹配时可能被"模板检测"跳过（因为包含 doing sth.）
6. 最终在 grammar 库中找到了相似度85%的结果

【解决方案】

需要检查：
1. 替换规则是否正确执行
2. _processAndApplyReplaceRule() 是否正确处理跨类型替换（pattern → phrase）
3. 模板检测逻辑是否错误跳过了替换规则的模糊匹配
""")

# ============================================================================
# 第4部分：详细的替换规则分析
# ============================================================================
print("\n" + "=" * 100)
print("第4部分：替换规则执行流程分析")
print("=" * 100)

conn_matching = sqlite3.connect('/mnt/user-data/uploads/1769943153828_matching.db')
cursor = conn_matching.cursor()

cursor.execute("""
    SELECT id, original_text, original_type, action, target_text 
    FROM matching_rules 
    WHERE original_text = 'spend time doing sth.' AND original_type = 'pattern'
""")
rule = cursor.fetchone()

if rule:
    rule_id, orig_text, orig_type, action, target_text = rule
    
    print(f"✅ 精确匹配规则:")
    print(f"  ID: {rule_id}")
    print(f"  Original: {orig_text} ({orig_type})")
    print(f"  Action: {action}")
    
    if target_text and target_text.startswith('['):
        targets = json.loads(target_text)
        target_item = targets[0]
        
        print(f"\n  替换目标:")
        print(f"    Text: {target_item['text']}")
        print(f"    Type: {target_item['type']}")  # 应该是 'phrase'
        print(f"    ID: {target_item['id']}")      # 应该是 2152
        
        print(f"\n  【关键问题】")
        print(f"  输入类型: pattern")
        print(f"  替换后类型: {target_item['type']}")
        print(f"  ")
        print(f"  这是一个跨类型替换：pattern → phrase")
        print(f"  ")
        print(f"  执行流程应该是:")
        print(f"  1. matchPattern('spend time doing sth.') 被调用")
        print(f"  2. 在 matching.db 中找到精确匹配 (ID {rule_id})")
        print(f"  3. 调用 _processAndApplyReplaceRule(rule, 'spend time doing sth.', 'pattern', false)")
        print(f"  4. 因为 target_text 是 JSON 数组，返回 replaced_multi: true")
        print(f"  5. batchMatch() 应该处理这个 replaced_multi 结果")
        print(f"  6. 对每个 target item 调用 _addMultiReplaceItem()")
        print(f"  7. _addMultiReplaceItem() 应该用 item.type='phrase' 去匹配")
        print(f"  8. 最终应该返回 phrases 表 ID 2152 的数据")
        
        print(f"\n  【可能的问题点】")
        print(f"  1. _processAndApplyReplaceRule 可能没有正确返回 replaced_multi")
        print(f"  2. batchMatch 可能没有正确处理 replaced_multi 的情况")
        print(f"  3. _addMultiReplaceItem 可能没有用正确的类型去匹配")

conn_matching.close()

print("\n" + "=" * 100)
print("诊断报告完成")
print("=" * 100)

print("""
【总结】

根据以上分析，问题的根源是：

1. ✅ matching.db 中存在正确的替换规则 (ID 466)
   - original_text: "spend time doing sth." (pattern类型)
   - target_text: "spend time/money in doing sth." (phrase类型, ID 2152)

2. ✅ vocabulary.db 中存在目标数据 (ID 2152)
   - phrase: "spend time/money in doing sth."
   - 数据完整

3. ❌ vocabulary.db patterns表为空
   - 没有 "spend time/money in doing sth." 的句型数据

4. 🤔 匹配流程可能的问题：
   - 替换规则配置的是跨类型替换（pattern → phrase）
   - 可能在执行过程中出现了问题
   - 导致没有正确匹配到目标短语

【下一步】

需要实际运行代码，添加详细的日志，查看：
1. matchPattern() 是否正确识别了替换规则
2. _processAndApplyReplaceRule() 是否正确处理了 JSON 数组
3. batchMatch() 是否正确处理了 replaced_multi
4. _addMultiReplaceItem() 是否使用了正确的类型进行匹配
5. 最终返回的匹配结果是什么

建议创建一个最小化的测试用例来复现这个问题。
""")
