"""Zero-dependency Python mock server & offline sermon replay harness.

Usage:
  python3 tests/mock_server.py --port 8787
Then open:
  http://127.0.0.1:8787/?mock=1
"""

import argparse
import json
import mimetypes
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qs, urlparse

TESTS_DIR = Path(__file__).resolve().parent
ROOT_DIR = TESTS_DIR.parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

import sermon_dialogue  # noqa: E402


def extract_target_lang_from_prompt(prompt_text: str) -> str:
    """Extract language code like (en), (pt), (fr) from systemInstruction."""
    match = re.search(r"Target language:\s*[^()]*\(([a-zA-Z-]+)\)", prompt_text or "")
    if match:
        return match.group(1).lower()
    return "en"


class MockSermonHandler(BaseHTTPRequestHandler):
    """Serves static app files plus deterministic mock AI/TTS API endpoints."""

    def log_message(self, format: str, *args) -> None:
        if os.environ.get("MOCK_SERVER_QUIET") != "1":
            super().log_message(format, *args)

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8", errors="replace")
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        req_path = parsed.path
        query = parse_qs(parsed.query)

        if req_path == "/api/mock/sermon":
            self._send_json(
                200,
                {
                    "metadata": sermon_dialogue.SERMON_METADATA,
                    "segments": sermon_dialogue.SERMON_SCRIPT,
                },
            )
            return

        rel = "index.html" if req_path == "/" else req_path.lstrip("/")
        safe_path = (ROOT_DIR / rel).resolve()
        if not str(safe_path).startswith(str(ROOT_DIR.resolve())) or not safe_path.is_file():
            self.send_error(404, "Not Found")
            return

        data = safe_path.read_bytes()
        if safe_path.name == "index.html" and query.get("mock") == ["1"]:
            html = data.decode("utf-8")
            inject = '<script src="/tests/mock_client.js"></script>\n</body>'
            html = html.replace("</body>", inject)
            data = html.encode("utf-8")

        ctype, _ = mimetypes.guess_type(str(safe_path))
        if safe_path.suffix == ".js":
            ctype = "application/javascript; charset=utf-8"
        elif safe_path.suffix == ".css":
            ctype = "text/css; charset=utf-8"
        elif safe_path.suffix == ".html":
            ctype = "text/html; charset=utf-8"

        self.send_response(200)
        self.send_header("Content-Type", ctype or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        req_path = urlparse(self.path).path
        body = self._read_json_body()

        if req_path == "/api/mock/gemini/generateContent":
            sys_parts = (body.get("systemInstruction") or {}).get("parts") or [{}]
            sys_text = sys_parts[0].get("text", "")
            target_lang = extract_target_lang_from_prompt(sys_text)
            user_parts = ((body.get("contents") or [{}])[0]).get("parts") or [{}]
            source_text = user_parts[0].get("text", "")
            translated = sermon_dialogue.lookup_translation(source_text, target_lang)
            self._send_json(
                200,
                {
                    "candidates": [
                        {"content": {"parts": [{"text": translated}]}}
                    ]
                },
            )
            return

        if req_path == "/api/mock/gemini/tts":
            pcm_b64 = sermon_dialogue.generate_pcm16_tone_base64(duration_ms=220, freq_hz=440.0)
            self._send_json(
                200,
                {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "inlineData": {
                                            "mimeType": "audio/L16;codec=pcm;rate=24000",
                                            "data": pcm_b64,
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                },
            )
            return

        if req_path == "/api/mock/openai":
            messages = body.get("messages") or []
            sys_msg = next((m.get("content", "") for m in messages if m.get("role") == "system"), "")
            user_msg = next((m.get("content", "") for m in messages if m.get("role") == "user"), "")
            target_lang = extract_target_lang_from_prompt(sys_msg)
            translated = sermon_dialogue.lookup_translation(user_msg, target_lang)
            self._send_json(
                200,
                {"choices": [{"message": {"content": translated}}]},
            )
            return

        if req_path == "/api/mock/deepl":
            texts = body.get("text") or [""]
            target_lang = (body.get("target_lang") or "EN").lower()
            translated = sermon_dialogue.lookup_translation(texts[0], target_lang)
            self._send_json(200, {"translations": [{"text": translated}]})
            return

        if req_path == "/api/mock/cloud-tts":
            # Cloud TTS expects MP3 or audioContent; return 404 so Gemini TTS path or native fallback is tested cleanly
            self._send_json(404, {"error": {"message": "Mock Cloud TTS disabled; use Gemini TTS mock"}})
            return

        self.send_error(404, "Unknown mock endpoint")


def create_server(host: str = "127.0.0.1", port: int = 8787) -> ThreadingHTTPServer:
    """Create and return the configured ThreadingHTTPServer instance."""
    return ThreadingHTTPServer((host, port), MockSermonHandler)


def main(argv: Optional[list] = None) -> None:
    parser = argparse.ArgumentParser(description="SermonTranslator Offline Mock Server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args(argv)

    server = create_server(args.host, args.port)
    url = "http://{}:{}/?mock=1".format(args.host, args.port)
    print("Mock SermonTranslator server running at {}".format(url))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down mock server.")
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
