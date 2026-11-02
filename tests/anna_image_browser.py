"""Exercise the real Anna image canvas functions without provider requests."""
import functools
import http.server
import json
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(
    ("127.0.0.1", 0), functools.partial(Handler, directory=ROOT)
)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
base = f"http://127.0.0.1:{server.server_port}"
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.route("**/*", lambda route: route.continue_()
                   if route.request.url.startswith(base + "/") else route.abort())
        page.goto(base + "/tests/anna-image-canvas.html")
        page.wait_for_function("window.canvasResult !== undefined")
        result = page.evaluate("window.canvasResult")
        browser.close()
        print(json.dumps(result, indent=2))
        assert result["passed"], result.get("error")
finally:
    server.shutdown()
    server.server_close()
