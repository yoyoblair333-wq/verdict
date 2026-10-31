"""Renders PNGs of the security-game cards and the trust hero at real size, and the contact sheet
brand/previews/game-cards.png (headless Chromium via Playwright).

python3 brand/source/gen_games.py && python3 brand/source/previews_games.py
"""
import os
from playwright.sync_api import sync_playwright

B = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = ['card-game-redflag-scam.svg', 'card-game-redflag-sus.svg', 'card-game-redflag-legit.svg',
         'card-game-jailbreak-door.svg', 'card-game-jailbreak-bench.svg', 'card-game-jailbreak-patched.svg',
         'card-game-jailbreak-sealed.svg', 'card-game-hall-of-contempt.svg',
         'card-game-daily-redflag.svg', 'card-game-juror-quiz.svg']
HERO = 'trust-hero-try-to-rig-it.svg'
W, GAP = 420, 28

with sync_playwright() as p:
    b = p.chromium.launch()
    # real-size PNG beside each SVG
    for f, (w, h) in [(c, (1080, 1920)) for c in CARDS] + [(HERO, (1600, 900))]:
        pg = b.new_page(viewport={'width': w, 'height': h})
        pg.goto('file://' + os.path.join(B, f)); pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(B, f.replace('.svg', '.png')))
        pg.close()
        print('rendered', f)
    # contact sheet: the cards in a row, the hero underneath
    cards = ''.join(f'<img src="file://{os.path.join(B, c)}" style="width:{W}px;height:{W*16/9}px;display:block;box-shadow:6px 8px 0 rgba(18,12,46,.25)">' for c in CARDS)
    total = len(CARDS) * (W + GAP) + GAP
    html = ('<html><body style="margin:0;background:#F4F6FF">'
            f'<div style="display:flex;gap:{GAP}px;padding:{GAP}px {GAP}px 0;width:max-content">{cards}</div>'
            f'<div style="padding:{GAP}px"><img src="file://{os.path.join(B, HERO)}" style="width:{W*2+GAP}px;display:block;box-shadow:6px 8px 0 rgba(18,12,46,.25)"></div>'
            '</body></html>')
    tmp = os.path.join(B, 'source', '_game_cards.html')
    open(tmp, 'w').write(html)
    pg = b.new_page(viewport={'width': total, 'height': 400}, device_scale_factor=1.5)
    pg.goto('file://' + tmp); pg.wait_for_timeout(800)
    pg.screenshot(path=os.path.join(B, 'previews', 'game-cards.png'), full_page=True)
    b.close()
os.remove(tmp)
print('wrote brand/previews/game-cards.png')
