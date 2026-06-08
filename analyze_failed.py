#!/usr/bin/env python3
"""Analyze blocked Paperclip tasks - these are the real failures"""
import json
from collections import Counter, defaultdict
import re

with open(r'C:\Users\rus\Desktop\merge\all_issues.json', 'r') as f:
    issues = json.load(f)

total = len(issues)
done = [i for i in issues if i.get('status') == 'done']
blocked = [i for i in issues if i.get('status') == 'blocked']
cancelled = [i for i in issues if i.get('status') == 'cancelled']
todo = [i for i in issues if i.get('status') == 'todo']

print(f'Total tasks: {total}')
print(f'Done: {len(done)} ({len(done)/total*100:.1f}%)')
print(f'Blocked: {len(blocked)} ({len(blocked)/total*100:.1f}%)')
print(f'Cancelled: {len(cancelled)} ({len(cancelled)/total*100:.1f}%)')
print(f'Todo: {len(todo)} ({len(todo)/total*100:.1f}%)')
print()

# The real "failed" rate is blocked + cancelled
not_done = blocked + cancelled
success_rate = len(done) / total * 100
failure_rate = len(not_done) / total * 100
print(f'Real success rate: {success_rate:.1f}%')
print(f'Real failure rate: {failure_rate:.1f}%')
print()

# Extract patterns from blocked tasks
def extract_pattern(desc):
    desc_lower = desc.lower()
    if 'прочитай' in desc_lower and 'файл' in desc_lower:
        return 'file_read'
    if 'сколько файлов' in desc_lower or 'list_files' in desc_lower:
        return 'list_files'
    if any(c in desc for c in '+-*/') and any(c.isdigit() for c in desc):
        return 'calculate'
    if 'http' in desc_lower or 'github' in desc_lower or 'url' in desc_lower or 'repo' in desc_lower:
        return 'web_fetch'
    if 'hostname' in desc_lower or 'whoami' in desc_lower:
        return 'system_info'
    if 'конфиг' in desc_lower or 'config' in desc_lower:
        return 'config_read'
    if 'найди' in desc_lower or 'search' in desc_lower or 'функци' in desc_lower:
        return 'code_search'
    if 'docker' in desc_lower:
        return 'docker_ops'
    if 'deploy' in desc_lower or 'установ' in desc_lower:
        return 'deploy'
    if 'git' in desc_lower:
        return 'git_ops'
    # Check json-like descriptions for tool patterns
    if '"tool_name":"read_file"' in desc or '"tool_name": "read_file"' in desc:
        return 'file_read'
    if '"tool_name":"list_files"' in desc:
        return 'list_files'
    if '"tool_name":"calculate"' in desc:
        return 'calculate'
    if '"tool_name":"web_fetch"' in desc:
        return 'web_fetch'
    return 'other'

patterns = defaultdict(list)
for task in not_done:
    desc = task.get('description') or task.get('title') or ''
    pattern = extract_pattern(desc)
    patterns[pattern].append(desc)

print('=== BLOCKED TASK PATTERNS ===')
pattern_counts = {p: len(tasks) for p, tasks in patterns.items()}
for p, c in sorted(pattern_counts.items(), key=lambda x: -x[1]):
    print(f'\n{p}: {c} tasks')
    for ex in patterns[p][:3]:
        print(f'  -> {ex[:150]}')

# Save patterns for Critic
pattern_data = []
for p, c in sorted(pattern_counts.items(), key=lambda x: -x[1]):
    pattern_data.append({
        'pattern': p,
        'count': c,
        'examples': patterns[p][:3]
    })

with open(r'C:\Users\rus\Desktop\merge\failed_patterns.json', 'w') as f:
    json.dump({
        'total': total,
        'done': len(done),
        'blocked': len(blocked),
        'cancelled': len(cancelled),
        'todo': len(todo),
        'success_rate': round(success_rate, 1),
        'patterns': pattern_data
    }, f, indent=2, ensure_ascii=False)

print(f'\nSaved {len(pattern_data)} patterns to failed_patterns.json')
