"""Next `/api/*` vekil rotalarından OpenAPI tanımı üretir (ZAP aktif taraması için).

HTML bağlantılarında görünmeyen vekil uçlarını ZAP'in bulması için. Rota listesi dosya
sisteminden okunur (elle yazılmaz); gövde/sorgu alanları kabaca tahmindir: amaç ZAP'in
her uca geçerli biçimli girdi vermesi. Yeni bir `route.ts` eklenince kendiliğinden girer;
çok parçalı (multipart) olanlar ve sorgu alanları aşağıdaki tablolarda elle tutulur.
Kullanım: python gen_next_openapi.py <çıktı.json>
"""
import json
import re
import sys
from pathlib import Path

API = Path(__file__).resolve().parents[3] / "frontend" / "src" / "app" / "api"
MULTIPART = {
    ("POST", "/api/projects"): {"result": "binary", "thumbnail": "binary"},
    ("POST", "/api/remove-background"): {"file": "binary"},
    ("POST", "/api/admin/backgrounds"): {"file": "binary", "name": "string"},
}
QUERY = {
    "/api/admin/stats": ["days"], "/api/admin/audit": ["action", "page", "actor"],
    "/api/admin/users": ["query", "page"], "/api/projects": ["limit", "cursor"],
    "/api/billing/history": ["limit", "before"], "/api/cmyk": ["format"],
}
paths: dict = {}
for route in sorted(API.rglob("route.ts")):
    rel = "/api/" + "/".join(route.relative_to(API).parts[:-1])
    rel = re.sub(r"\[(\w+)\]", r"{\1}", rel).rstrip("/")
    for m in re.findall(r"export async function (GET|POST|PATCH|DELETE|PUT)", route.read_text(encoding="utf-8")):
        op: dict = {"responses": {"200": {"description": "ok"}}}
        params = [{"name": n, "in": "path", "required": True, "schema": {"type": "string"}}
                  for n in re.findall(r"\{(\w+)\}", rel)]
        params += [{"name": q, "in": "query", "schema": {"type": "string"}} for q in QUERY.get(rel, [])]
        if params:
            op["parameters"] = params
        if (m, rel) in MULTIPART:
            props = {k: ({"type": "string", "format": "binary"} if v == "binary" else {"type": v})
                     for k, v in MULTIPART[(m, rel)].items()}
            op["requestBody"] = {"content": {"multipart/form-data": {"schema": {"type": "object", "properties": props}}}}
        elif rel == "/api/cmyk" and m == "POST":
            op["requestBody"] = {"content": {"application/octet-stream": {"schema": {"type": "string", "format": "binary"}}}}
        elif m in ("POST", "PATCH", "DELETE"):
            op["requestBody"] = {"content": {"application/json": {"schema": {
                "type": "object", "additionalProperties": True,
                "properties": {"email": {"type": "string"}, "amount": {"type": "integer"}, "reason": {"type": "string"},
                               "message": {"type": "string"}, "kind": {"type": "string"}, "idempotencyKey": {"type": "string"}}}}}}
        paths.setdefault(rel, {})[m.lower()] = op
out = Path(sys.argv[1])
out.write_text(json.dumps({"openapi": "3.0.0", "info": {"title": "Next vekilleri", "version": "1"}, "paths": paths}, indent=1), encoding="utf-8")
print(len(paths), "yol,", sum(len(v) for v in paths.values()), "işlem ->", out)
