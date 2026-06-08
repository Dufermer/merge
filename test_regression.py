#!/usr/bin/env python3
"""Phase 1: Regression tests — runs 3 tests and reports results"""
import json, urllib.request, time, sys

API = "http://127.0.0.1:3100/api"
COMPANY = "793573ec-9d0c-44de-a5e6-477fbf16cb64"
CEO_ID = "687a5e35-bd16-4790-b503-3b12179e43d5"
TRANS_ID = "badd8cf8-b72d-492a-bdca-c29dd9bc16f0"

def create_issue(title, desc, assignee):
    body = json.dumps({"title": title, "description": desc, "assigneeAgentId": assignee}).encode()
    req = urllib.request.Request(f"{API}/companies/{COMPANY}/issues", data=body, headers={"Content-Type": "application/json"}, method="POST")
    d = json.loads(urllib.request.urlopen(req).read())
    return d["identifier"], d["id"]

def check_issue(issue_id):
    d = json.loads(urllib.request.urlopen(f"{API}/issues/{issue_id}").read())
    return d.get("status"), d.get("completedAt"), d.get("result"), d.get("activeRecoveryAction")

# Setup test files
import os
os.makedirs("data", exist_ok=True)
with open("data/regression_test.txt", "w") as f:
    f.write("Regression test OK")
with open("data/server_config.json", "w") as f:
    f.write('{"port": 8080, "host": "localhost", "debug": true}')
print("✅ Test files ready")

results = []

# === TEST 1.1: Math 2+5 ===
print("\n--- TEST 1.1: Math 2+5 ---")
id1, uid1 = create_issue("Reg Math 2+5", "сколько будет 2+5?", CEO_ID)
print(f"  Created: {id1}")
time.sleep(20)
status, comp, result, rec = check_issue(id1)
pass1 = status == "done" and not rec
results.append(("1.1", "Math 2+5", "✅ PASSED" if pass1 else "❌ FAILED", status, result, rec))
print(f"  Status: {status}, Recovery: {'YES' if rec else 'NONE'}")

# === TEST 1.2: File read via translator ===
print("\n--- TEST 1.2: File read via translator ---")
id2, uid2 = create_issue("Reg File Read", "прочитай файл data/regression_test.txt", TRANS_ID)
print(f"  Created: {id2}")
time.sleep(10)
status, comp, result, rec = check_issue(id2)
pass2 = status == "done" and not rec
results.append(("1.2", "File read via translator", "✅ PASSED" if pass2 else "❌ FAILED", status, result, rec))

# === TEST 1.3: DAG pipeline ===
print("\n--- TEST 1.3: DAG pipeline ---")
id3, uid3 = create_issue("Reg DAG", "прочитай файл data/server_config.json, найди там порт, умножь номер порта на 2", CEO_ID)
print(f"  Created: {id3}")
time.sleep(20)
status, comp, result, rec = check_issue(id3)
pass3 = status == "done" and not rec
results.append(("1.3", "DAG pipeline", "✅ PASSED" if pass3 else "❌ FAILED", status, result, rec))
print(f"  Status: {status}, Recovery: {'YES' if rec else 'NONE'}")

# Report
print("\n\n=== REGRESSION RESULTS ===")
for num, name, p, s, r, rec in results:
    print(f"  {num} {name}: {p} (status={s})")

all_pass = all("PASSED" in r[2] for r in results)
print(f"\n  ALL REGRESSION: {'✅ PASSED' if all_pass else '❌ SOME FAILED'}")
sys.exit(0 if all_pass else 1)
