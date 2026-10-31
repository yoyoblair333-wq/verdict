"""Renders brand/previews/cards.png from the card SVGs (headless Chromium via Playwright).

python3 brand/source/gen.py && python3 brand/source/previews.py
"""
import os
from playwright.sync_api import sync_playwright

B = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = ['card-example-relationship.svg', 'card-example-relationship-appeals.svg', 'card-example-roast.svg',
         'card-example-petty.svg', 'card-example-petty-supreme.svg']
# verdict-card-template.svg is the field spec with {placeholders}; it is never rendered into a PNG.
W, GAP = 420, 28

html = ('<html><body style="margin:0;background:#F4F6FF">'
        f'<div style="display:flex;gap:{GAP}px;padding:{GAP}px;width:max-content">'
        + ''.join(f'<img src="file://{os.path.join(B, c)}" style="width:{W}px;height:{W*16/9}px;display:block;box-shadow:6px 8px 0 rgba(18,12,46,.25)">' for c in CARDS)
        + '</div></body></html>')
tmp = os.path.join(B, 'source', '_cards.html')
open(tmp, 'w').write(html)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': len(CARDS) * (W + GAP) + GAP, 'height': int(W * 16 / 9) + 2 * GAP}, device_scale_factor=1.5)
    pg.goto('file://' + tmp); pg.wait_for_timeout(800)
    pg.screenshot(path=os.path.join(B, 'previews', 'cards.png'))
    # one full-size card for close inspection (not committed)
    pg2 = b.new_page(viewport={'width': 1080, 'height': 1920})
    for c in ('card-example-relationship-appeals.svg', 'card-example-petty-supreme.svg', 'card-example-roast.svg'):
        pg2.goto('file://' + os.path.join(B, c)); pg2.wait_for_timeout(300)
        pg2.screenshot(path=os.path.join(os.environ.get('VERDICT_SCRATCH', '/tmp'), c.replace('.svg', '.png')))
    b.close()
os.remove(tmp)
print('wrote brand/previews/cards.png')
