"""Re-renders the app previews in brand/previews/ from app/index.html and app/overlay.html.
Google Fonts are swapped for the local OFL fonts in brand/source/fonts so the shots match production without network.

python3 brand/source/app_previews.py
"""
import os, base64
from playwright.sync_api import sync_playwright

B = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(os.path.dirname(B), 'app')
F = os.path.join(B, 'source', 'fonts')
faces = [('Big Shoulders Display', 800, 'normal', 'big-shoulders-display-latin-800-normal.ttf'),
         ('Big Shoulders Display', 900, 'normal', 'big-shoulders-display-latin-900-normal.ttf'),
         ('Schibsted Grotesk', 500, 'normal', 'schibsted-grotesk-latin-500-normal.ttf'),
         ('Schibsted Grotesk', 700, 'normal', 'schibsted-grotesk-latin-700-normal.ttf'),
         ('Schibsted Grotesk', 800, 'normal', 'schibsted-grotesk-latin-800-normal.ttf'),
         ('Schibsted Grotesk', 700, 'italic', 'schibsted-grotesk-latin-700-italic.ttf')]
CSS = ''.join(f"@font-face{{font-family:'{n}';font-weight:{w};font-style:{s};src:url(data:font/ttf;base64,{base64.b64encode(open(os.path.join(F, f), 'rb').read()).decode()})}}" for n, w, s, f in faces)
INIT = "document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=%r;document.head.appendChild(s);});" % CSS


def page(b, w, h, scheme='light', dpr=1):
    ctx = b.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme, device_scale_factor=dpr)
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
    ctx.route('https://fonts.gstatic.com/**', lambda r: r.abort())
    ctx.add_init_script(INIT)
    return ctx.new_page()


with sync_playwright() as p:
    b = p.chromium.launch()
    for scheme in ('light', 'dark'):
        pg = page(b, 375, 760, scheme, 2)
        pg.goto('file://' + os.path.join(APP, 'index.html')); pg.wait_for_timeout(900)
        pg.check('#consentA'); pg.check('#consentB'); pg.check('#age18')
        pg.screenshot(path=os.path.join(B, 'previews', f'app-compose-{scheme}.png'), full_page=True)
    # an overturned Appeals Court card straight from the app's canvas renderer
    pg = page(b, 375, 760)
    pg.goto('file://' + os.path.join(APP, 'index.html')); pg.wait_for_timeout(900)
    data = pg.evaluate("""async () => {
      await document.fonts.ready;
      const v = window.__verdict;
      // find a rubric where the Appeals Court overturns the case of the day (the simulator is deterministic)
      let c, t1, t2;
      outer: for(const nb of ['Marcus', 'Marc', 'Marco', 'Mark', 'Max', 'Mo', 'Miles', 'Malik']){
        for(const r of ['right', 'petty', 'roast', 'comeback']){
          c = {rubric:r, a:v.CASE_OF_DAY.a, b:{name:nb, take:v.CASE_OF_DAY.b.take}};
          t1 = v.deliberate(c, 1, null); t2 = v.deliberate(c, 2, t1);
          if(t2.winner !== t1.winner) break outer;
        }
      }
      const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920;
      v.drawCard(cv, c, t2, {caseNo:'5175-A', tier:2, stamp: t2.winner === t1.winner ? 'UPHELD' : 'OVERTURNED'});
      return cv.toDataURL('image/png');
    }""")
    open(os.path.join(B, 'previews', 'app-card-overturned.png'), 'wb').write(base64.b64decode(data.split(',')[1]))
    pg = page(b, 1920, 1080)
    pg.goto('file://' + os.path.join(APP, 'overlay.html') + '?preview&supreme&hold'); pg.wait_for_timeout(19500)
    pg.screenshot(path=os.path.join(B, 'previews', 'overlay-supreme.png'))
    b.close()
print('wrote app previews')
