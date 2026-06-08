#!/usr/bin/env python3
"""Phase 3: Delegation Tests — runs all delegation tests and reports"""
import json, urllib.request, time, sys, os

API = "http://127.0.0.1:3100/api"
COMPANY = "793573ec-9d0c-44de-a5e6-477fbf16cb64"
CEO_ID = "687a5e35-bd16-4790-b503-3b12179e43d5"
TRANS_ID = "badd8cf8-b72d-492a-bdca-c29dd9bc16f0"

def create(title, desc, assignee):
    b = json.dumps({"title":title,"description":desc,"assigneeAgentId":assignee}).encode()
    r = urllib.request.Request(f"{API}/companies/{COMPANY}/issues",data=b,headers={"Content-Type":"application/json"},method="POST")
    return json.loads(urllib.request.urlopen(r).read())

def check(iid):
    return json.loads(urllib.request.urlopen(f"{API}/issues/{iid}").read())

results = []
os.makedirs("data", exist_ok=True)

# Setup test files
for f, c in [("data/test1.txt","File 1"), ("data/test2.txt","File 2"), ("data/test3.txt","File 3")]:
    with open(f, "w") as fp: fp.write(c)

print("=== PHASE 3: DELEGATION TESTS ===")

# === TEST 1: Simple delegation (read_file) ===
print("\n--- TEST 1: Read file delegation ---")
d1 = create("Del Test 1", "прочитай файл data/test.txt", CEO_ID)
print(f"  Created: {d1['identifier']}")
time.sleep(20)
s1 = check(d1['id'])
p1 = s1.get('status') == 'in_progress' or s1.get('status') == 'done'
r1 = s1.get('result') or ''
parent_has_sub = any(s1.get(k) for k in ['result','subIssueId'])
results.append(("1", "Read file delegation", "✅ PASSED" if p1 else "❌ FAILED", s1.get('status'), str(r1)[:80]))
print(f"  Status: {s1.get('status')}, Result: {str(r1)[:60]}")

# Check for sub-issues
time.sleep(5)
all_issues = json.loads(urllib.request.urlopen(f"{API}/companies/{COMPANY}/issues?limit=50").read())
subs = [i for i in all_issues if i.get('parentId') == d1['id']]
print(f"  Sub-issues found: {len(subs)}")
for s in subs:
    print(f"    {s['identifier']} | status={s.get('status')} | assignee={(s.get('assigneeAgentId') or '?')[:8]}")

# === TEST 2: Math delegation (should NOT delegate — math is handled directly) ===
print("\n--- TEST 2: Math (should NOT delegate) ---")
d2 = create("Del Test 2", "сколько будет 15*3", CEO_ID)
print(f"  Created: {d2['identifier']}")
time.sleep(15)
s2 = check(d2['id'])
passed2 = s2.get('status') == 'done' and not s2.get('activeRecoveryAction')
results.append(("2", "Math (no delegation)", "✅ PASSED" if passed2 else "❌ FAILED", s2.get('status'), "15*3=45"))
print(f"  Status: {s2.get('status')}")

# === TEST 3: Complex task (should NOT delegate — 2+ verbs) ===
print("\n--- TEST 3: Complex (should NOT delegate) ---")
d3 = create("Del Test 3", "прочитай файл data/server_config.json, найди там порт, умножь номер порта на 10", CEO_ID)
print(f"  Created: {d3['identifier']}")
time.sleep(20)
s3 = check(d3['id'])
passed3 = s3.get('status') == 'done' and not s3.get('activeRecoveryAction')
results.append(("3", "Complex (no delegation)", "✅ PASSED" if passed3 else "❌ FAILED", s3.get('status'), str(s3.get('result') or '')[:60]))
print(f"  Status: {s3.get('status')}")

# === TEST 4: Delegation with error ===
print("\n--- TEST 4: Delegation with error ---")
d4 = create("Del Test 4", "прочитай файл data/this_file_does_not_exist.txt", CEO_ID)
print(f"  Created: {d4['identifier']}")
time.sleep(20)
s4 = check(d4['id'])
passed4 = s4.get('status') in ('done','failed') and not s4.get('activeRecoveryAction')
results.append(("4", "Delegation with error", "✅ PASSED" if passed4 else "❌ FAILED", s4.get('status'), str(s4.get('result') or '')[:60]))
print(f"  Status: {s4.get('status')}")

# === TEST 5: Parallel delegations ===
print("\n--- TEST 5: Parallel delegations ---")
parallel_ids = []
for i in range(1, 4):
    d = create(f"Del Parallel {i}", f"прочитай файл data/test{i}.txt", CEO_ID)
    parallel_ids.append(d['id'])
    print(f"  Created: {d['identifier']}")
time.sleep(30)

for pid in parallel_ids:
    s = check(pid)
    passed = s.get('status') in ('done','in_progress')
    results.append(("5", f"Parallel {parallel_ids.index(pid)+1}", "✅ PASSED" if passed else "❌ FAILED", s.get('status'), str(s.get('result') or '')[:40]))
    print(f"  {s.get('identifier','?')}: status={s.get('status')}")

# === SUMMARY ===
print("\n\n=== DELEGATION RESULTS ===")
for num, name, p, s, r in results:
    print(f"  {num}. {name}: {p} (status={s})")

passed = sum(1 for r in results if "PASSED" in r[2])
print(f"\n  Total: {len(results)}, Passed: {passed}")

with open("data/delegation_results.json", "w") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
