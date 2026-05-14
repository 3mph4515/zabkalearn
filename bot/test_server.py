#!/usr/bin/env python3
"""Mini-server for editor UI testing — no Telegram dependencies.
Serves index.html, CSS, and bundled JS. Stubs out /api/* endpoints
so the UI can run without the real scheduler.
"""
import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JS_DIR = os.path.join(BASE_DIR, "static", "js")
TEST_PRESETS_FILE = os.path.join(BASE_DIR, ".test_presets.json")


def bundle_js() -> str:
    parts = []
    for fname in sorted(f for f in os.listdir(JS_DIR) if f.endswith(".js")):
        with open(os.path.join(JS_DIR, fname), "r", encoding="utf-8") as f:
            parts.append(f"// === bundled: {fname} ===\n{f.read()}")
    return "\n".join(parts)


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, ctype: str = "text/plain"):
        self.send_response(status)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, payload: dict, status: int = 200):
        self._send(status, json.dumps(payload).encode("utf-8"), "application/json")

    def _file(self, path: str, ctype: str):
        try:
            with open(path, "rb") as f:
                self._send(200, f.read(), ctype)
        except FileNotFoundError:
            self._send(404, b"not found")

    def do_GET(self):
        p = self.path.split("?", 1)[0]
        if p in ("/", "/editor"):
            self._file(os.path.join(BASE_DIR, "index.html"), "text/html")
            return
        if p == "/static/js/editor-bundle.js":
            self._send(200, bundle_js().encode("utf-8"), "application/javascript")
            return
        if p.startswith("/static/"):
            self._file(os.path.join(BASE_DIR, p[1:]), self._ctype(p))
            return
        if p == "/api/status":
            self._json({"ok": True, "account": "@local_test"})
            return
        if p == "/api/scheduled":
            self._json({"ok": True, "messages": []})
            return
        if p == "/api/word-history":
            self._json({"ok": True, "items": [
                {"word": "rozsądny", "date": "2026-04-12T08:00:00", "key": "rozsądny"},
                {"word": "cegła", "date": "2026-04-13T08:00:00", "key": "cegła"},
            ]})
            return
        if p == "/api/check-word":
            self._json({"ok": True, "exists": False, "matches": []})
            return
        if p == "/api/presets":
            presets = []
            if os.path.exists(TEST_PRESETS_FILE):
                try:
                    with open(TEST_PRESETS_FILE, "r", encoding="utf-8") as f:
                        presets = json.load(f)
                except Exception:
                    pass
            self._json({"ok": True, "presets": presets})
            return
        self._send(404, b"not found")

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length)
        p = self.path.split("?", 1)[0]
        if p == "/api/schedule":
            self._json({"ok": True, "results": [{"ok": True}]})
            return
        if p == "/api/tts-preview":
            self._send(200, b"\x00" * 100, "audio/mpeg")
            return
        if p == "/api/tts-test-all":
            self._json({"ok": True, "count": 10, "results": [{"ok": True}] * 10})
            return
        if p == "/api/presets":
            try:
                data = json.loads(body or b"{}")
                presets = data.get("presets")
                if isinstance(presets, list):
                    with open(TEST_PRESETS_FILE, "w", encoding="utf-8") as f:
                        json.dump(presets, f, ensure_ascii=False)
                    self._json({"ok": True})
                    return
            except Exception:
                pass
            self._json({"ok": False, "error": "Bad payload"}, status=400)
            return
        self._send(404, b"not found")

    def do_DELETE(self):
        length = int(self.headers.get("Content-Length") or 0)
        _ = self.rfile.read(length)
        self._json({"ok": True})

    @staticmethod
    def _ctype(path: str) -> str:
        if path.endswith(".css"): return "text/css"
        if path.endswith(".js"): return "application/javascript"
        if path.endswith(".svg"): return "image/svg+xml"
        if path.endswith(".png"): return "image/png"
        if path.endswith(".html"): return "text/html"
        return "application/octet-stream"

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8181"))
    print(f"Test editor → http://127.0.0.1:{port}/editor")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
