"""Zero-dependency Python unit & mock-server tests for SermonTranslator."""

import base64
import io
import json
import os
import struct
import subprocess
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
ROOT_DIR = TESTS_DIR.parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

import mock_server  # noqa: E402
import sermon_dialogue  # noqa: E402


class TestSermonFixture(unittest.TestCase):
    def test_script_segments_have_required_translations(self):
        self.assertGreaterEqual(len(sermon_dialogue.SERMON_SCRIPT), 8)
        for seg in sermon_dialogue.SERMON_SCRIPT:
            self.assertTrue(seg["source_text"].strip())
            for lang in ("en", "pt", "fr"):
                self.assertIn(lang, seg["translations"])
                self.assertTrue(seg["translations"][lang].strip())

    def test_lookup_translation_exact_and_fallback(self):
        en = sermon_dialogue.lookup_translation("El Señor es mi pastor; nada me faltará.", "en")
        self.assertEqual(en, "The Lord is my shepherd; I shall not want.")
        pt = sermon_dialogue.lookup_translation("El Señor es mi pastor; nada me faltará.", "pt")
        self.assertEqual(pt, "O Senhor é o meu pastor; nada me faltará.")
        fb = sermon_dialogue.lookup_translation("Frase nueva de prueba.", "en")
        self.assertEqual(fb, "[MOCK EN] Frase nueva de prueba.")

    def test_pcm16_tone_generation_is_clean_and_faded(self):
        b64 = sermon_dialogue.generate_pcm16_tone_base64(duration_ms=100, sample_rate=24000)
        raw = base64.b64decode(b64)
        self.assertEqual(len(raw) % 2, 0)
        first_sample = struct.unpack_from("<h", raw, 0)[0]
        last_sample = struct.unpack_from("<h", raw, len(raw) - 2)[0]
        self.assertEqual(first_sample, 0)
        self.assertLessEqual(abs(last_sample), 10)


class _MockRequestSocket:
    def __init__(self, raw_request: bytes):
        self._rfile = io.BytesIO(raw_request)
        self._wfile = io.BytesIO()

    def makefile(self, mode: str, *args, **kwargs):
        return self._rfile if "r" in mode else self._wfile

    def sendall(self, data: bytes) -> None:
        self._wfile.write(data)

    def raw_response(self) -> bytes:
        return self._wfile.getvalue()


def _invoke_handler(method: str, path: str, body: dict = None):
    payload = json.dumps(body).encode("utf-8") if body is not None else b""
    headers = "{} {} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: {}\r\nContent-Type: application/json\r\n\r\n".format(
        method, path, len(payload)
    ).encode("ascii")
    sock = _MockRequestSocket(headers + payload)
    os.environ["MOCK_SERVER_QUIET"] = "1"
    mock_server.MockSermonHandler(sock, ("127.0.0.1", 0), None)
    raw = sock.raw_response()
    head, _, resp_body = raw.partition(b"\r\n\r\n")
    status_code = int(head.splitlines()[0].split()[1])
    return status_code, resp_body


class TestMockServerHTTP(unittest.TestCase):
    def test_index_and_mock_injection(self):
        status_plain, body_plain = _invoke_handler("GET", "/")
        self.assertEqual(status_plain, 200)
        self.assertNotIn("/tests/mock_client.js", body_plain.decode("utf-8"))

        status_mock, body_mock = _invoke_handler("GET", "/?mock=1")
        self.assertEqual(status_mock, 200)
        self.assertIn("/tests/mock_client.js", body_mock.decode("utf-8"))

    def test_mock_gemini_translate_and_tts(self):
        status_tr, body_tr = _invoke_handler(
            "POST",
            "/api/mock/gemini/generateContent",
            {
                "systemInstruction": {"parts": [{"text": "Target language: Portuguese (pt)."}]},
                "contents": [{"parts": [{"text": "El Señor es mi pastor; nada me faltará."}]}],
            },
        )
        self.assertEqual(status_tr, 200)
        data = json.loads(body_tr.decode("utf-8"))
        self.assertEqual(
            data["candidates"][0]["content"]["parts"][0]["text"],
            "O Senhor é o meu pastor; nada me faltará.",
        )

        status_tts, body_tts = _invoke_handler(
            "POST",
            "/api/mock/gemini/tts",
            {"contents": [{"parts": [{"text": "Amen."}]}]},
        )
        self.assertEqual(status_tts, 200)
        tts_data = json.loads(body_tts.decode("utf-8"))
        inline = tts_data["candidates"][0]["content"]["parts"][0]["inlineData"]
        self.assertIn("audio/L16", inline["mimeType"])
        self.assertGreater(len(base64.b64decode(inline["data"])), 100)


class TestAppIntegrity(unittest.TestCase):
    def test_app_js_syntax(self):
        res = subprocess.run(["node", "--check", str(ROOT_DIR / "app.js")], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, msg=res.stderr)

    def test_index_html_balanced(self):
        class TagChecker(HTMLParser):
            def __init__(self):
                super().__init__()
                self.stack = []
                self.void = {"meta", "link", "input", "br", "hr", "img", "source"}

            def handle_starttag(self, tag, attrs):
                if tag not in self.void:
                    self.stack.append(tag)

            def handle_endtag(self, tag):
                if tag in self.void:
                    return
                if not self.stack or self.stack[-1] != tag:
                    raise AssertionError("Mismatched </{}>; stack={}".format(tag, self.stack[-5:]))
                self.stack.pop()

        checker = TagChecker()
        checker.feed((ROOT_DIR / "index.html").read_text(encoding="utf-8"))
        self.assertEqual(checker.stack, [])


if __name__ == "__main__":
    unittest.main()
