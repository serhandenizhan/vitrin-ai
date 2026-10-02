"""Bir kimlik (user | admin) için ZAP Otomasyon Çerçevesi planı üretir: `.work/reports/plan-<kimlik>.yaml`.

Plan: çerez ekleme (replacer) -> OpenAPI içe aktarma (Next vekilleri) -> örümcek -> pasif
tarama -> aktif tarama -> JSON+HTML rapor. Kullanım: python make_plan.py <user|admin>
"""
import json
import os
import sys
from pathlib import Path

WORK = Path(os.environ.get("ZAP_WORK_DIR", Path(__file__).with_name(".work")))
who = sys.argv[1]
cookie = json.loads((WORK / "sessions.json").read_text(encoding="utf-8"))[who]["cookie"]
T = os.environ.get("ZAP_FRONTEND_URL", "http://host.docker.internal:3012")
plan = f"""---
env:
  contexts:
    - name: vitrin
      urls: ["{T}"]
      includePaths: ["{T}.*"]
  parameters:
    failOnError: false
    progressToStdout: true
jobs:
  - type: replacer
    parameters: {{deleteAllRules: true}}
    rules:
      - description: oturum-cerezi
        matchType: req_header
        matchString: Cookie
        matchRegex: false
        replacementString: "{cookie}"
  - type: openapi
    parameters:
      apiFile: /zap/wrk/next-openapi.json
      targetUrl: {T}
      context: vitrin
  - type: spider
    parameters: {{context: vitrin, maxDuration: 3}}
  - type: passiveScan-wait
    parameters: {{maxDuration: 5}}
  - type: activeScan
    parameters: {{context: vitrin, maxScanDurationInMins: 20, maxRuleDurationInMins: 3}}
    policyDefinition:
      defaultStrength: medium
      defaultThreshold: medium
      rules:
        # DOM tabanlı XSS kuralı Firefox/Selenium ister; x86 imaj ARM Mac'te emülasyonla
        # çalıştığı için tarayıcı zaman aşımına uğrayıp ZAP'i düşürüyor. Sunucu tarafı
        # yansıyan/kalıcı XSS kuralları AÇIK kalır. Linux/x86'da bu satır kaldırılabilir.
        - {{id: 40026, threshold: "off"}}
  - type: report
    parameters: {{template: traditional-json, reportDir: /zap/wrk, reportFile: frontend-{who}.json}}
  - type: report
    parameters: {{template: traditional-html, reportDir: /zap/wrk, reportFile: frontend-{who}.html}}
"""
reports = WORK / "reports"
reports.mkdir(parents=True, exist_ok=True)
(reports / f"plan-{who}.yaml").write_text(plan, encoding="utf-8")
print("plan yazıldı:", reports / f"plan-{who}.yaml")
