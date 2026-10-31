"""Render diagrams/*.svg to PNG at their real size (1x) with headless Chromium, and build the composite sheet.

python3 diagrams/source/render.py            # all sheets + verdict-system-sheet.png
python3 diagrams/source/render.py d1 d3      # only matching sheets (no composite)
"""
import os, sys, re
from playwright.sync_api import sync_playwright

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORDER = ['system-topology', 'case-lifecycle', 'appeal-ladder', 'data-boundary', 'viral-loop', 'revenue-flow', 'game-flows']


def size(svg):
    head = open(svg).read(400)
    return int(re.search(r'width="(\d+)"', head).group(1)), int(re.search(r'height="(\d+)"', head).group(1))


def main(only):
    with sync_playwright() as p:
        b = p.chromium.launch()
        names = [n for n in ORDER if not only or any(o in n for o in only)]
        for n in names:
            svg = os.path.join(D, n + '.svg')
            w, h = size(svg)
            pg = b.new_page(viewport={'width': w, 'height': h})
            pg.goto('file://' + svg)
            pg.wait_for_timeout(300)
            pg.screenshot(path=os.path.join(D, n + '.png'))
            pg.close()
            print('rendered', n, w, h)
        if not only:
            imgs = ''.join(f'<img src="file://{os.path.join(D, n + ".svg")}">' for n in ORDER)
            html = ('<html><body style="margin:0;background:#1B1340">'
                    '<div style="display:grid;grid-template-columns:1600px 1600px;gap:40px;padding:40px;width:3320px;box-sizing:border-box;align-items:start">'
                    f'{imgs}</div></body></html>')
            tmp = os.path.join(D, 'source', '_sheet.html')
            open(tmp, 'w').write(html)
            pg = b.new_page(viewport={'width': 3320, 'height': 800})
            pg.goto('file://' + tmp); pg.wait_for_timeout(600)
            pg.screenshot(path=os.path.join(D, 'verdict-system-sheet.png'), full_page=True)
            os.remove(tmp)
            print('rendered verdict-system-sheet.png')
        b.close()


if __name__ == '__main__':
    main(sys.argv[1:])
