"""Screenshot the running web app once the map has really finished rendering.

Usage: shoot.py out.png [--w 1600 --h 950] [--click lng,lat] [--compare] [--mobile]
Drives the installed Microsoft Edge through Playwright (no browser download).
"""
import argparse
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("out"); ap.add_argument("--url", default="http://localhost:5173/")
ap.add_argument("--w", type=int, default=1600); ap.add_argument("--h", type=int, default=950)
ap.add_argument("--click"); ap.add_argument("--compare", action="store_true"); ap.add_argument("--mobile", action="store_true")
ap.add_argument("--scroll", type=int, default=0, help="scroll the side panel by N px")
ap.add_argument("--story", type=int, default=-1, help="story step to show (-1 closes the story)")
a = ap.parse_args()

IDLE = """() => { const m = window.__maps; if (!m) return false;
  const ok = (x) => x.loaded() && x.areTilesLoaded() && ['sar','cls'].every(id => !x.getSource(id) || x.isSourceLoaded(id));
  return ok(m.main) && !!m.main.getSource('cls'); }"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    size = {"width": 390, "height": 844} if a.mobile else {"width": a.w, "height": a.h}
    pg = b.new_page(viewport=size, device_scale_factor=1)
    errors = []
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(a.url)
    pg.wait_for_function(IDLE, timeout=90_000, polling=500)
    if a.story < 0 and pg.locator(".story").count():
        pg.locator(".story-x").click()
    for _ in range(max(a.story, 0)):
        pg.get_by_text("Next →").click(); pg.wait_for_timeout(1800)
    if a.compare:
        pg.get_by_text("Before / After").click()
    if a.click:
        lng, lat = map(float, a.click.split(","))
        pt = pg.evaluate(f"() => window.__maps.main.project([{lng}, {lat}])")
        pg.mouse.click(pt["x"], pt["y"])
    if a.scroll:
        pg.evaluate(f"document.querySelector('.panel').scrollTop = {a.scroll}")
    pg.wait_for_timeout(2500)
    pg.wait_for_function(IDLE, timeout=60_000, polling=500)
    pg.screenshot(path=a.out)
    print("saved", a.out, "| console errors:", errors[:5] or "none")
    b.close()
