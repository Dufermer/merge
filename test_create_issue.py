#!/usr/bin/env python3
"""Create Config Analysis Fixed issue via Paperclip API"""
import json, urllib.request, sys

api = "http://127.0.0.1:3100/api"
company = "793573ec-9d0c-44de-a5e6-477fbf16cb64"
ceo_id = "687a5e35-bd16-4790-b503-3b12179e43d5"

# Use raw string to avoid escape issues with Windows paths
desc = r"прочитай файл C:\Users\rus\Desktop\merge\data\server_config.json, найди там порт, умножь номер порта на 10"

body = json.dumps({
    "title": "Config Analysis Fixed",
    "description": desc,
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
    print(f"✅ Issue created: {issue_id}")
    print(f"   Desc: {data.get('description','')[:50]}...")
    with open("C:\\Users\\rus\\Desktop\\merge\\data\\test3_v2_issue.txt", "w") as f:
        f.write(issue_id)
except Exception as e:
    print(f"❌ Failed: {e}")
    sys.exit(1)
