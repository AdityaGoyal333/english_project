# Local server for Many Figs.
# Vercel uses api/paths.py instead. Both call api/_core.py.
# The API key is read from .env and never sent to the browser.

import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "api"))
from _core import build_reading, load_env

PORT = 8765


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # The page and the API share this origin.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        # Never serve the key file, even if someone requests it.
        name = self.path.split("?", 1)[0].lstrip("/")
        if name in (".env", ".env.example") or name.startswith(".git"):
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/paths":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > 80000:
            self.send_json(400, {"error": "The journey is missing or too long."})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            reading = build_reading(payload)
        except RuntimeError as error:
            self.send_json(400, {"error": str(error)})
            return
        except (json.JSONDecodeError, KeyError, TypeError):
            self.send_json(502, {"error": "The model returned something this page could not read."})
            return

        self.send_json(200, reading)

    def send_json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    load_env(os.path.join(ROOT, ".env"))
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("Many Figs is at http://127.0.0.1:%s" % PORT)
    server.serve_forever()
