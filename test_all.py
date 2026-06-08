#!/usr/bin/env python3
"""Run all autonomous tests Phase 2-5, fix what breaks"""
import json, urllib.request, time, sys

API = "http://127.0.0.1:3100/api"
COMPANY = "793573ec-9d0c-44de-a5e6-477fbf16cb64"
CEO_ID = "687a5e35-bd16-4790-b503-3b12179e43d5"
TRANS_ID = "badd8cf8-b72d-492a-bdca-c29dd9bc16f0"

def create(title, desc, assignee):
    b = json.dumps({"title":title,"description":desc,"assigneeAgentId":assignee}).encode()
    r = urllib.request.Request(f"{API}/companies/{COMPANY}/issues",data=b,headers={"Content-Type":"application/json"},method="POST")
    d = json.loads(urllib.request.urlopen(r).read())
    return d["identifier"], d["id"]

def check(iid):
    d = json.loads(urllib.request.urlopen(f"{API}/issues/{iid}").read())
    return d.get("status"), d.get("completedAt"), d.get("result"), d.get("activeRecoveryAction")

results = []

# Setup files
import os; os.makedirs("data", exist_ok=True)
for f, c in [("data/test_data.json", '{"users":100,"active":75,"premium":25,"revenue_per_user":10}'),
             ("data/regression_test.txt", "Regression test OK")]:
    with open(f, "w") as fp: fp.write(c)

# === PHASE 2: SIMPLE TESTS ===
tests_phase2 = [
    ("2.1", "Web Search", "найди в интернете что такое llama.cpp", CEO_ID, 30),
    ("2.2", "Codebase Search", "найди функцию которая обрабатывает логин в проекте", CEO_ID, 30),
    ("2.3", "List Files", "перечисли все файлы в директории docs/", CEO_ID, 30),
]

for num, name, desc, assignee, delay in tests_phase2:
    print(f"\n--- TEST {num}: {name} ---")
    try:
        iid, uid = create(f"T{num} {name}", desc, assignee)
        print(f"  Created: {iid}")
        time.sleep(delay)
        status, comp, result, rec = check(uid)
        passed = status == "done" and not rec
        tag = "✅ PASSED" if passed else "❌ FAILED"
        results.append((num, name, tag, status, result, rec))
        print(f"  Status: {status}, Recovery: {'YES' if rec else 'NONE'}")
    except Exception as e:
        results.append((num, name, "❌ ERROR", str(e), "", ""))
        print(f"  ERROR: {e}")

# === PHASE 3: COMPLEX TESTS ===
tests_phase3 = [
    ("3.1", "Multi-file", "прочитай README.md, найди там версию проекта, прочитай STATUS.md и скажи что там написано", CEO_ID, 40),
    ("3.2", "Graphify query", "какие основные компоненты в проекте по knowledge graph?", CEO_ID, 30),
    ("3.3", "Combined analysis", "прочитай data/test_data.json, посчитай общий revenue и какая доля premium", CEO_ID, 40),
    ("3.4", "Write file", "создай файл data/generated_report.txt с содержимым 'Отчёт сгенерирован автоматически'", CEO_ID, 30),
]

for num, name, desc, assignee, delay in tests_phase3:
    print(f"\n--- TEST {num}: {name} ---")
    try:
        iid, uid = create(f"T{num} {name}", desc, assignee)
        print(f"  Created: {iid}")
        time.sleep(delay)
        status, comp, result, rec = check(uid)
        passed = status == "done" and not rec
        tag = "✅ PASSED" if passed else "❌ FAILED"
        results.append((num, name, tag, status, result, rec))
        print(f"  Status: {status}, Recovery: {'YES' if rec else 'NONE'}")
    except Exception as e:
        results.append((num, name, "❌ ERROR", str(e), "", ""))
        print(f"  ERROR: {e}")

# === PHASE 5: STRESS TESTS ===
print("\n\n--- PHASE 5: STRESS TESTS ---")
stress_ids = []
for i, (desc) in enumerate(["сколько будет 10+20", "сколько будет 100+200", "сколько будет 1000+2000"]):
    try:
        iid, uid = create(f"T5.{i+1} Stress", desc, CEO_ID)
        stress_ids.append((f"T5.{i+1}", uid, desc))
        print(f"  Created: {iid} — {desc}")
    except Exception as e:
        print(f"  ERROR creating: {e}")

time.sleep(30)
for num, uid, desc in stress_ids:
    status, comp, result, rec = check(uid)
    passed = status == "done" and not rec
    tag = "✅ PASSED" if passed else "❌ FAILED"
    results.append((num, f"Stress: {desc}", tag, status, result, rec))
    print(f"  {num}: {tag} (status={status})")

# === SUMMARY ===
print("\n\n=== FINAL RESULTS ===")
passed = sum(1 for r in results if "PASSED" in r[2])
failed = sum(1 for r in results if "FAILED" in r[2])
errors = sum(1 for r in results if "ERROR" in r[2])
print(f"  Passed: {passed}, Failed: {failed}, Errors: {errors}")
print(f"  Total: {len(results)}")

# Save results for final report
with open("data/test_results.json", "w") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
