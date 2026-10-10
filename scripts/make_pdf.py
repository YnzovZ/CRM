"""Maakt samenvatting/kernpunten-ynzo.pdf van de samenvattingspagina.

Gebruik (vanuit de root van de repo):
    python3 -m http.server 8765 &
    python3 scripts/make_pdf.py
Vereist: pip install playwright, Chromium in /opt/pw-browsers/chromium.
"""
import os
from playwright.sync_api import sync_playwright

URL = os.environ.get("PDF_URL", "http://localhost:8765/samenvatting/")
OUT = os.path.join(os.path.dirname(__file__), "..", "samenvatting", "kernpunten-ynzo.pdf")
WIDTH = 540

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium"), args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": WIDTH, "height": 900})
    page.goto(URL, wait_until="networkidle")
    page.emulate_media(media="print")
    page.evaluate("document.fonts.ready")
    height = page.evaluate("document.querySelector('.page').getBoundingClientRect().height")
    # Eén lange pagina, net als de handout: leest prettig door op een telefoon.
    page.pdf(path=OUT, width=f"{WIDTH}px", height=f"{int(height) + 2}px", print_background=True,
             margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})
    browser.close()
print("PDF gemaakt:", os.path.normpath(OUT))
