#!/usr/bin/env python3
"""Create TEST 3 issue via Paperclip API (no shell escaping issues)"""
import json, urllib.request, sys

api = "http://127.0.0.1:3100/api"
company = "793573ec-9d0c-44de-a5e6-477fbf16cb64"
ceo_id = "687a5e35-bd16-4790-b503-3b12179e43d5"

# Read the config file content first to verify it exists
try:
    with open("C:\\Users\\rus\\Desktop\\merge\\data\\server_config.json") as f:
        config = json.load(f)
    print(f"✅ Config file OK: port={config['port']}, host={config['host']}")
except Exception as e:
    print(f"❌ Config file error: {e}")
    sys.exit(1)

# Create the issue
body = json.dumps({
    "title": "Config Analysis",
    "description": "прочитай файл C:\\Users\\rus\\Desktop\\merge\\data\\server_config.json, найди там порт, умножь на 10",
    "assigneeAgentId": ceo_id,
}).encode("utf-8")

req = urllib.request.Request(
    f"{api}/companies/{company}/issues",
    data=body,
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    resp = urllib.request.urlopen(req, timeout=10)
    data = json.loads(resp.read())
    issue_id = data.get("identifier", "?")
    print(f"✅ Issue created: {issue_id} (ID: {data.get('id','?')[:12]}...)")
    print(f"   Title: {data.get('title','?')}")
    print(f"   Assignee: {data.get('assigneeAgentId','?')[:8]}...")
    with open("C:\\Users\\rus\\Desktop\\merge\\data\\test3_issue.txt", "w") as f:
        f.write(issue_id)
except Exception as e:
    print(f"❌ Failed to create issue: {e}")
    sys.exit(1)
