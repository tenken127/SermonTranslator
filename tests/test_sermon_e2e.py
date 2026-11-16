"""Playwright + pytest end-to-end regression tests using offline prescripted sermon data.

Install once:
  pip install -r tests/requirements.txt
  playwright install chromium

Run:
  pytest tests/test_sermon_e2e.py -v
"""

import json
import os
import sys
import threading
from pathlib import Path

import pytest

TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

import mock_server  # noqa: E402
import sermon_dialogue  # noqa: E402

playwright_sync = pytest.importorskip("playwright.sync_api")


@pytest.fixture(scope="module")
def local_app_url():
    os.environ["MOCK_SERVER_QUIET"] = "1"
    server = mock_server.create_server("127.0.0.1", 0)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield "http://127.0.0.1:{}/?mock=1".format(port)
    server.shutdown()
    server.server_close()


def test_prescripted_sermon_e2e_flow(local_app_url):
    with playwright_sync.sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(local_app_url, wait_until="networkidle")

        # 1. Verify Audience View audio defaults to OFF
        mute_btn = page.locator("#btn-audience-mute")
        assert mute_btn.get_attribute("aria-pressed") == "true"
        assert "OFF" in mute_btn.inner_text()

        # 2. Verify male & female voice personas exist
        persona_values = page.locator("#tts-voice-persona option").evaluate_all(
            "els => els.map(e => e.value)"
        )
        for voice in ("Charon", "Orus", "Alnilam", "Kore"):
            assert voice in persona_values

        # 3. Fill Pastor View Sermon Prompting context & trigger prescripted lines
        page.fill("#sermon-topic-input", sermon_dialogue.SERMON_METADATA["title"])
        page.fill("#sermon-terms-input", sermon_dialogue.SERMON_METADATA["key_terms"])
        page.fill("#sermon-context-input", sermon_dialogue.SERMON_METADATA["context"])

        first_seg = sermon_dialogue.SERMON_SCRIPT[2]  # Psalm 23:1
        page.evaluate("(txt) => processSpokenText(txt)", first_seg["source_text"])

        page.wait_for_function(
            "(expected) => document.querySelector('#speaker-stream-box').innerText.includes(expected)",
            arg=first_seg["translations"]["en"],
        )
        assert first_seg["translations"]["en"] in page.locator("#listener-stream-box").inner_text()

        # 4. Navigate Pastor -> Audience -> Admin -> Pastor and verify translation continues
        page.click("#tab-listener")
        assert "active" in (page.locator("#view-listener").get_attribute("class") or "")

        # Toggle Audience Audio ON & adjust volume
        mute_btn.click()
        assert mute_btn.get_attribute("aria-pressed") == "false"
        page.locator("#audience-volume-slider").fill("65")
        page.locator("#audience-volume-slider").dispatch_event("input")
        assert page.locator("#audience-volume-label").inner_text() == "65%"

        page.click("#tab-admin")
        assert "active" in (page.locator("#view-admin").get_attribute("class") or "")

        # Trigger another prescripted line after navigation
        second_seg = sermon_dialogue.SERMON_SCRIPT[3]
        page.evaluate("(txt) => processSpokenText(txt)", second_seg["source_text"])
        page.wait_for_function(
            "(expected) => document.querySelector('#listener-stream-box').innerText.includes(expected)",
            arg=second_seg["translations"]["en"],
        )

        browser.close()
