# Vercel serves this file at /api/paths.
# The browser posts the goal, resume, and note. The reply is always JSON.

import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import build_reading


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
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
