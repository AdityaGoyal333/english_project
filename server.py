# Local server for Many Figs.
# Serves the page, and sends the confirmed goal and journey to OpenAI.
# The API key is read from .env and never sent to the browser.

import json
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8765

SYSTEM = """You draw several trajectories from a person's real past to one goal. Return only JSON.

You are given their goal, the full resume, and the full short note. Read all of it.
Do not invent jobs, degrees, or events that are not in that text.

The destination is their goal. Do not replace it.
"done" is what they have already done, taken from the resume or the note. 3 to 6 short items.
Each done item has source "Resume" or "This year".
A stall mentioned in the note is not a done item. It is a bend one trajectory can go around.
A missing credential is remaining distance, not a failure.

Return 3 trajectories. Each one is a different route, and every route ends at the same goal.
Give each trajectory a short name that comes from this person's situation.
One trajectory must still reach the goal even if a stall they described stays stalled.
Each trajectory has 2 or 3 future steps. Steps are moves still ahead, not a repeat of the resume.

Shape:
{"done":[{"text":"short fact","source":"Resume"}],"trajectories":[{"title":"short name","why":"one sentence","steps":[{"text":"future step"}]}]}
"""


def load_env(path):
    """Read KEY=value lines into the environment. Existing vars win."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def clean(value, limit):
    text = " ".join(str(value).split())
    return text[:limit]


def clip(value, limit):
    """Keep the user's line breaks. The model should see the whole document."""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "").strip()
    return text[:limit]


def ask_openai(payload):
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("Add your OpenAI API key to the .env file, then restart the server.")

    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    body = json.dumps({
        "model": model,
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": json.dumps(payload)},
        ],
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        message = "OpenAI refused the request. Check the key in .env."
        try:
            message = json.loads(detail)["error"]["message"]
        except (json.JSONDecodeError, KeyError, TypeError):
            pass
        raise RuntimeError(clean(message, 180)) from error

    content = raw["choices"][0]["message"]["content"]
    return normalize(json.loads(content), payload["goal"])


def normalize(reading, goal):
    """Turn the model JSON into a graph: done on the left, trajectories, one goal."""
    done = []
    for item in reading.get("done", [])[:6]:
        if isinstance(item, str):
            text, source = clean(item, 90), "Resume"
        else:
            text = clean(item.get("text", ""), 90)
            source = item.get("source") if item.get("source") in ("Resume", "This year") else "Resume"
        if text:
            done.append({"text": text, "source": source})

    raw = reading.get("trajectories") or reading.get("paths") or []
    trajectories = []
    for path in raw[:4]:
        steps = []
        for step in path.get("steps", [])[:3]:
            text = clean(step if isinstance(step, str) else step.get("text", ""), 90)
            if text:
                steps.append({"text": text})
        if not steps:
            continue
        trajectories.append({
            "title": clean(path.get("title", ""), 32) or "Path",
            "why": clean(path.get("why", ""), 160),
            "steps": steps,
        })
    if len(trajectories) < 2:
        raise RuntimeError("The model did not return enough trajectories.")

    return {"goal": goal, "done": done, "trajectories": trajectories}


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
            goal = clip(payload.get("goal", ""), 400)
            resume = clip(payload.get("resume", ""), 20000)
            note = clip(payload.get("note", ""), 8000)
            if not goal or not resume or not note:
                raise RuntimeError("The paths need a goal, a resume, and a note.")
            reading = ask_openai({
                "goal": goal,
                "resume": resume,
                "note": note,
            })
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
