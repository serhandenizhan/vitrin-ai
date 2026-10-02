"""ZAP taraması için SAHTE Supabase: yalnız JWKS verir, gerçek Supabase'e hiç gidilmez.

Kullanım: python fake_supabase.py <port>   (README'deki sırayla)
İmza anahtarı `.work/key.pem` (git'e girmez); token'ları `mint_sessions.py` bu anahtarla imzalar.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

WORK_DIR = Path(os.environ.get("ZAP_WORK_DIR", Path(__file__).with_name(".work")))
WORK_DIR.mkdir(parents=True, exist_ok=True)
KEY_FILE = WORK_DIR / "key.pem"
KID = "zap-tarama-anahtari"


def load_key():
    if KEY_FILE.exists():
        return serialization.load_pem_private_key(KEY_FILE.read_bytes(), password=None)
    key = ec.generate_private_key(ec.SECP256R1())
    KEY_FILE.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return key


KEY = load_key()
JWK = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(KEY.public_key()))
JWK.update({"kid": KID, "alg": "ES256", "use": "sig"})


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({"keys": [JWK]} if self.path.endswith("jwks.json") else {}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_POST = do_GET

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
