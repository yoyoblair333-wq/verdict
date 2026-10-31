"""VERDICT diagram kit: one visual language for every sheet in diagrams/.

Grammar (shown in every sheet's legend):
  * Trust boundary  = dashed rounded box, dark tab with the zone name, "Controlled by ..." beside it,
                      and a "Never holds" note inside the zone.
  * Component       = white box. Data store = white box with a double left rule.
                      External service = blue-tint box. The Intelligent Contract = robe box.
  * Authority badge = robe pill with a key glyph: what this component is allowed to do.
  * Arrows          = solid ink: command / request (numbered when it is part of the main flow)
                      dotted ink: event / callback / async delivery
                      blue: read / observe only (never changes state)
  * Step number     = ink disc with a legal-pad numeral, placed at the start of the arrow's label.
  * Stamp red       = only for real stamps (UPHELD, OVERTURNED, NO MONEY ON OUTCOMES).
  * Redaction point = ink bar with its number (R1, R2 ...): where text is hidden or removed.

Fonts are subset from brand/source/fonts and embedded as WOFF, so each SVG renders the same everywhere.
"""
import base64, io, os, html, math
from fontTools.ttLib import TTFont
from fontTools import subset as ftsubset

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, '..', '..', 'brand', 'source', 'fonts')
OUT = os.path.dirname(HERE)

FN = {
    'bs900': ('VBS', 900, 'normal', 'big-shoulders-display-latin-900-normal.ttf'),
    'sg500': ('VSG', 500, 'normal', 'schibsted-grotesk-latin-500-normal.ttf'),
    'sg700': ('VSG', 700, 'normal', 'schibsted-grotesk-latin-700-normal.ttf'),
    'sg800': ('VSG', 800, 'normal', 'schibsted-grotesk-latin-800-normal.ttf'),
    'sg700i': ('VSG', 700, 'italic', 'schibsted-grotesk-latin-700-italic.ttf'),
}

# tokens
ROBE, DEEP, PAD, STAMP, DOCKET, RULE = '#1B1340', '#120C2E', '#F7E26B', '#E5242C', '#F4F6FF', '#8FA8F0'
INK = ROBE
MUTED = '#4A4378'
READ = '#4560C4'          # rule-blue, deepened so a 2px line holds 4.5:1 on docket
TINT = '#E4EAFC'          # external-service fill (rule-blue tint)
PADTINT = '#FCF3B8'       # public-on-chain fill (legal-pad tint)

JUR = {
    'judge': ('The Judge', 'Marlowe', '#F4F6FF'),
    'romantic': ('The Romantic', 'Dahlia', '#FF7AA8'),
    'realist': ('The Realist', 'Frank', '#58C4FF'),
    'petty': ('The Petty One', 'Tiff', '#B9F24A'),
    'philo': ('The Philosopher', 'Theo', '#B79CFF'),
    'chief': ('The Chief Justice', 'Augustine', '#F7E26B'),
    'wild': ('The Wildcard', 'Juno', '#FF9A3D'),
    'hist': ('The Historian', 'Ines', '#5FE3C4'),
    'contra': ('The Contrarian', 'Rook', '#E8B4F8'),
}

_metric = {}
def _font(k):
    if k not in _metric:
        t = TTFont(os.path.join(FONTS, FN[k][3]))
        _metric[k] = (t.getBestCmap(), t['hmtx'].metrics, t['head'].unitsPerEm)
    return _metric[k]

def tw(s, f='sg500', size=16, ls=0):
    cmap, hm, upm = _font(f)
    w = sum((hm[cmap[ord(c)]][0] if ord(c) in cmap else upm * .5) for c in s)
    return w / upm * size + ls * len(s)

def wrap(s, f, size, maxw):
    out = []
    for para in s.split('\n'):
        cur = ''
        for w in para.split():
            t = (cur + ' ' + w).strip()
            if tw(t, f, size) <= maxw: cur = t
            else:
                if cur: out.append(cur)
                cur = w
        out.append(cur)
    return out

def _subset(k, text):
    opts = ftsubset.Options(); opts.flavor = 'woff'
    opts.layout_features = ['kern', 'liga', 'calt', 'tnum']
    opts.name_IDs = ['*']; opts.notdef_outline = True
    t = TTFont(os.path.join(FONTS, FN[k][3]))
    sub = ftsubset.Subsetter(opts); sub.populate(text=''.join(sorted(set(text + ' 0123456789'))))
    sub.subset(t); buf = io.BytesIO(); t.flavor = 'woff'; t.save(buf)
    return base64.b64encode(buf.getvalue()).decode()

E = html.escape
def f2(v): return f'{v:.1f}'.rstrip('0').rstrip('.')


class Sheet:
    def __init__(self, sheet_no, title, subtitle, H, W=1600, total=7):
        self.W, self.H, self.total = W, H, total
        self.no, self.title, self.subtitle = sheet_no, title, subtitle
        self.el, self.top = [], []      # top = drawn after everything (labels over lines)
        self.used = {k: '' for k in FN}
        self._header()

    # ---------- primitives ----------
    def text(self, x, y, s, size=16, f='sg500', fill=INK, anchor='start', ls=0, layer=None, opacity=None):
        self.used[f] += s
        fam, wt, st, _ = FN[f]
        a = '' if anchor == 'start' else f' text-anchor="{anchor}"'
        l = f' letter-spacing="{ls}"' if ls else ''
        o = f' opacity="{opacity}"' if opacity is not None else ''
        cls = {'bs900': 'b9', 'sg500': 's5', 'sg700': 's7', 'sg800': 's8', 'sg700i': 's7i'}[f]
        (layer if layer is not None else self.el).append(
            f'<text x="{f2(x)}" y="{f2(y)}" class="{cls}" font-size="{size}" fill="{fill}"{a}{l}{o}>{E(s)}</text>')
        return tw(s, f, size, ls)

    def lines(self, x, y, ls_, size=15, lh=20, f='sg500', fill=INK, anchor='start', layer=None):
        for i, l in enumerate(ls_):
            self.text(x, y + i * lh, l, size, f, fill, anchor, layer=layer)
        return len(ls_) * lh

    def raw(self, s, layer=None):
        (layer if layer is not None else self.el).append(s)

    # ---------- header / title block ----------
    def _header(self):
        W = self.W
        self.raw(f'<rect width="{W}" height="__H__" fill="{DOCKET}"/>')
        self.raw('<defs>'
                 f'<pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1" fill="{RULE}" opacity=".45"/></pattern>'
                 f'<pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="8" fill="{INK}" opacity=".22"/></pattern>'
                 f'<pattern id="hatchw" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="8" fill="#ffffff" opacity=".16"/></pattern>'
                 f'<marker id="aCmd" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L12 6 L0 12 Z" fill="{INK}"/></marker>'
                 f'<marker id="aEvt" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1 L11 6 L1 11" fill="none" stroke="{INK}" stroke-width="2.2"/></marker>'
                 f'<marker id="aRead" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L12 6 L0 12 Z" fill="{READ}"/></marker>'
                 f'<marker id="aPad" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L12 6 L0 12 Z" fill="{PAD}"/></marker>'
                 '</defs>')
        self.raw(f'<rect x="0" y="118" width="{W}" height="__HD__" fill="url(#dots)"/>')
        seal(self, 70, 62, 30)
        self.text(116, 82, self.title, 52, 'bs900')
        self.text(116 + tw(self.title, 'bs900', 52) + 22, 80, self.subtitle, 18, 'sg500', MUTED)
        self.text(W - 40, 56, f'Sheet {self.no} of {self.total}', 16, 'sg800', anchor='end')
        self.text(W - 40, 80, 'VERDICT architecture', 15, 'sg500', MUTED, anchor='end')
        self.raw(f'<rect x="40" y="114" width="{W-80}" height="3" fill="{INK}"/>')

    def title_block(self, x, y, w, rows):
        """engineering-drawing title block, bottom right. rows: list of (label, value)"""
        h = 30 * len(rows) + 8
        self.raw(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff" stroke="{INK}" stroke-width="2"/>')
        for i, (k, v) in enumerate(rows):
            yy = y + 4 + i * 30
            if i: self.raw(f'<rect x="{x}" y="{yy}" width="{w}" height="1" fill="{INK}" opacity=".35"/>')
            self.text(x + 12, yy + 20, k, 13, 'sg500', MUTED)
            self.text(x + 112, yy + 20, v, 14, 'sg800')
        return h

    def under(self, idx, fn, *a, **k):
        """draw fn(...) into the element list at position idx (so a zone sized late still sits behind its nodes)"""
        keep, self.el = self.el, []
        r = fn(*a, **k)
        new, self.el = self.el, keep
        self.el[idx:idx] = new
        return r

    def mark(self):
        return len(self.el)

    # ---------- zones ----------
    def zone(self, x, y, w, h, name, owner, never=None, never_w=None, tone='plain', never_pos='bottom'):
        fill = {'plain': '#ffffff', 'chain': PADTINT, 'ext': TINT, 'secret': '#ffffff'}[tone]
        op = {'plain': .55, 'chain': .55, 'ext': .6, 'secret': .55}[tone]
        self.raw(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{fill}" fill-opacity="{op}" stroke="{INK}" stroke-width="2.2" stroke-dasharray="12 7"/>')
        tw_ = tw(name, 'sg800', 17) + 28
        self.raw(f'<path d="M{x+18} {y+1} h{tw_} v22 a6 6 0 0 1 -6 6 h{-(tw_-12)} a6 6 0 0 1 -6 -6 Z" fill="{INK}"/>')
        self.raw(f'<rect x="{x+18}" y="{y-14}" width="{tw_}" height="16" rx="6" fill="{INK}"/>')
        self.text(x + 32, y + 8, name, 17, 'sg800', DOCKET)
        ow = tw(owner, 'sg700i', 14)
        self.raw(f'<rect x="{x+18+tw_+6}" y="{y-10}" width="{ow+12}" height="22" fill="{DOCKET}"/>')
        self.text(x + 18 + tw_ + 12, y + 6, owner, 14, 'sg700i', MUTED)
        if never:
            nw = never_w or (w - 36)
            nl = wrap(never, 'sg500', 14, nw - 46)
            nh = 40 + len(nl) * 19
            ny = y + h - nh - 16 if never_pos == 'bottom' else y + 40
            self.never_box(x + 18, ny, nw, nl)
            return ny + nh

    def never_box(self, x, y, w, nl):
        nh = 40 + len(nl) * 19
        self.raw(f'<rect x="{x}" y="{y}" width="{w}" height="{nh}" rx="6" fill="#fff" stroke="{INK}" stroke-width="1.5"/>')
        cx, cy = x + 20, y + 21
        self.raw(f'<circle cx="{cx}" cy="{cy}" r="9" fill="none" stroke="{INK}" stroke-width="2.2"/><line x1="{cx-6.3}" y1="{cy+6.3}" x2="{cx+6.3}" y2="{cy-6.3}" stroke="{INK}" stroke-width="2.2"/>')
        self.text(x + 38, y + 26, 'Never holds', 14, 'sg800')
        self.lines(x + 38, y + 46, nl, 14, 19)
        return nh

    # ---------- nodes ----------
    def node(self, x, y, w, title, body='', kind='proc', badge=None, h=None, tsize=18, bsize=15):
        pad = 16 + (12 if kind == 'store' else 0)
        tl = wrap(title, 'sg800', tsize, w - pad - 14)
        bl = wrap(body, 'sg500', bsize, w - pad - 14) if body else []
        lh = round(bsize * 1.33)
        need = 14 + len(tl) * (tsize + 4) + (6 + len(bl) * lh if bl else 0) + (36 if badge else 0) + 12
        h = h or need
        fill, stroke, tc, bc = {'proc': ('#fff', INK, INK, INK), 'store': ('#fff', INK, INK, INK),
                                'ext': (TINT, INK, INK, INK), 'contract': (ROBE, ROBE, PAD, DOCKET),
                                'pub': (PADTINT, INK, INK, INK), 'secret': (ROBE, ROBE, DOCKET, DOCKET),
                                'ghost': ('#fff', INK, INK, MUTED)}[kind]
        dash = ' stroke-dasharray="5 4"' if kind == 'ghost' else ''
        self.raw(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="{stroke}" stroke-width="2"{dash}/>')
        if kind == 'secret':
            self.raw(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="url(#hatchw)"/>')
        if kind == 'store':
            self.raw(f'<rect x="{x+7}" y="{y}" width="2" height="{h}" fill="{INK}"/><rect x="{x+12}" y="{y}" width="2" height="{h}" fill="{INK}"/>')
        ty = y + 14 + tsize
        for i, l in enumerate(tl):
            self.text(x + pad, ty + i * (tsize + 4), l, tsize, 'sg800', tc)
        by = ty + (len(tl) - 1) * (tsize + 4) + 8 + lh
        self.lines(x + pad, by - 2, bl, bsize, lh, 'sg500', bc)
        if badge:
            self.badge(x + pad, y + h - 38, badge, dark=(kind in ('contract', 'secret')))
        n = dict(x=x, y=y, w=w, h=h, cx=x + w / 2, cy=y + h / 2, r=x + w, b=y + h)
        return n

    def state(self, x, y, w, name, desc='', terminal=False, kind='plain', h=None, tag=None):
        """state-machine state: pill-cornered box. terminal = double border. kind: plain | chain | ext | bad"""
        dl = wrap(desc, 'sg500', 14, w - 32) if desc else []
        h = h or (16 + 22 + (6 + len(dl) * 19 if dl else 0) + (30 if tag else 0) + 14)
        fill = {'plain': '#fff', 'chain': PADTINT, 'ext': TINT, 'bad': '#fff'}[kind]
        self.raw(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="{fill}" stroke="{INK}" stroke-width="2"/>')
        if kind == 'bad':
            self.raw(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="url(#hatch)" opacity=".5"/>')
        if terminal:
            self.raw(f'<rect x="{x+5}" y="{y+5}" width="{w-10}" height="{h-10}" rx="14" fill="none" stroke="{INK}" stroke-width="1.4"/>')
        self.text(x + 16, y + 34, name, 17, 'sg800')
        self.lines(x + 16, y + 58, dl, 14, 19)
        if tag:
            self.tag(x + 16, y + h - 36, tag, 'plain', 12)
        return dict(x=x, y=y, w=w, h=h, cx=x + w / 2, cy=y + h / 2, r=x + w, b=y + h)

    def badge(self, x, y, s, dark=False):
        w = tw(s, 'sg800', 13) + 40
        bg, fg = (PAD, ROBE) if dark else (ROBE, PAD)
        self.raw(f'<rect x="{x}" y="{y}" width="{w}" height="26" rx="13" fill="{bg}"/>')
        # key glyph
        kx, ky = x + 15, y + 13
        self.raw(f'<circle cx="{kx-2}" cy="{ky}" r="4.2" fill="none" stroke="{fg}" stroke-width="2"/><path d="M{kx+2} {ky} h8 M{kx+7} {ky} v3.5 M{kx+10} {ky} v3" stroke="{fg}" stroke-width="2" fill="none"/>')
        self.text(x + 30, y + 18, s, 13, 'sg800', fg)
        return w

    def tag(self, x, y, s, kind='pub', size=13, anchor='start'):
        """small data-class tag: pub / conf / secret"""
        w = tw(s, 'sg800', size) + 18
        if anchor == 'end': x -= w
        fill, fg, st = {'pub': (PAD, INK, INK), 'conf': (TINT, INK, READ), 'secret': (ROBE, DOCKET, ROBE),
                        'plain': ('#fff', INK, INK)}[kind]
        self.raw(f'<rect x="{x}" y="{y}" width="{w}" height="{size+11}" rx="4" fill="{fill}" stroke="{st}" stroke-width="1.5"/>')
        self.text(x + 9, y + size + 4, s, size, 'sg800', fg)
        return w

    # ---------- arrows ----------
    def arrow(self, pts, style='cmd', label=None, at=None, step=None, anchor='start', lsize=14, end=True, start=False, width=None, maxw=None, color=None):
        d = 'M' + ' L'.join(f'{f2(a)} {f2(b)}' for a, b in pts)
        col = color or (READ if style == 'read' else INK)
        sw = width or (2.4 if style == 'cmd' else 2.2)
        dash = ' stroke-dasharray="1.5 6" stroke-linecap="round"' if style == 'event' else ''
        mk = {'cmd': 'aCmd', 'event': 'aEvt', 'read': 'aRead', 'pad': 'aPad'}[style if not color == PAD else 'pad']
        me = f' marker-end="url(#{mk})"' if end else ''
        ms = f' marker-start="url(#{mk})"' if start else ''
        self.raw(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-linejoin="round"{dash}{me}{ms}/>')
        if label or step:
            if at is None:
                # midpoint of the longest segment
                best = max(range(len(pts) - 1), key=lambda i: math.dist(pts[i], pts[i + 1]))
                at = ((pts[best][0] + pts[best + 1][0]) / 2, (pts[best][1] + pts[best + 1][1]) / 2)
            self.label(at[0], at[1], label, step, anchor, lsize, maxw, read=(style == 'read'))

    def label(self, x, y, s, step=None, anchor='start', size=14, maxw=None, read=False, bg=DOCKET):
        """label centred vertically on y. anchor start: x = left edge; middle: centred; end: right edge."""
        ls = wrap(s, 'sg500', size, maxw) if (s and maxw) else ([s] if s else [])
        lh = size + 5
        tw_ = max([tw(l, 'sg500', size) for l in ls] or [0])
        sw = 30 if step is not None else 0
        W = tw_ + sw + (12 if ls else 4)
        H = max(len(ls) * lh + 6, 28)
        x0 = x if anchor == 'start' else x - W / 2 if anchor == 'middle' else x - W
        y0 = y - H / 2
        L = self.top
        L.append(f'<rect x="{f2(x0)}" y="{f2(y0)}" width="{f2(W)}" height="{f2(H)}" rx="4" fill="{bg}" opacity=".96"/>')
        if step is not None:
            L.append(f'<circle cx="{f2(x0+15)}" cy="{f2(y)}" r="13" fill="{INK}"/>')
            self.text(x0 + 15, y + 5, str(step), 14 if len(str(step)) < 2 else 12.5, 'sg800', PAD, 'middle', layer=L)
        ty = y - (len(ls) - 1) * lh / 2 + size * .36
        for i, l in enumerate(ls):
            self.text(x0 + sw + 6, ty + i * lh, l, size, 'sg500', READ if read else INK, layer=L)
        return W, H

    def step(self, x, y, n, layer=None):
        L = layer if layer is not None else self.top
        L.append(f'<circle cx="{f2(x)}" cy="{f2(y)}" r="13" fill="{INK}"/>')
        self.text(x, y + 5, str(n), 14 if len(str(n)) < 2 else 12.5, 'sg800', PAD, 'middle', layer=L)

    # ---------- legend ----------
    def legend(self, x, y, w, extra=(), cols=2, base=None):
        items = [('zone', 'Trust boundary: who controls it'), ('never', 'What a zone never holds'),
                 ('cmd', 'Command or request'), ('event', 'Event, callback, async delivery'),
                 ('read', 'Read or observe only'), ('step', 'Step in the main flow'),
                 ('badge', 'Authority: what it may do')]
        if base is not None: items = [i for i in items if i[0] in base]
        items += list(extra)
        rows = math.ceil(len(items) / cols)
        h = 46 + rows * 32
        self.raw(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff" stroke="{INK}" stroke-width="2"/>')
        self.text(x + 16, y + 28, 'Legend', 16, 'sg800')
        cw = (w - 32) / cols
        for i, (k, s) in enumerate(items):
            cx = x + 16 + (i // rows) * cw
            cy = y + 56 + (i % rows) * 32
            gx = cx
            if k == 'zone':
                self.raw(f'<rect x="{gx}" y="{cy-11}" width="44" height="22" rx="5" fill="none" stroke="{INK}" stroke-width="2" stroke-dasharray="7 4"/>')
            elif k == 'never':
                self.raw(f'<circle cx="{gx+22}" cy="{cy}" r="9" fill="none" stroke="{INK}" stroke-width="2.2"/><line x1="{gx+15.7}" y1="{cy+6.3}" x2="{gx+28.3}" y2="{cy-6.3}" stroke="{INK}" stroke-width="2.2"/>')
            elif k in ('cmd', 'event', 'read'):
                self.arrow([(gx, cy), (gx + 44, cy)], k)
            elif k == 'step':
                self.step(gx + 22, cy, 1, layer=self.el)
            elif k == 'badge':
                self.raw(f'<rect x="{gx}" y="{cy-11}" width="44" height="22" rx="11" fill="{ROBE}"/>')
                self.raw(f'<circle cx="{gx+15}" cy="{cy}" r="4" fill="none" stroke="{PAD}" stroke-width="2"/><path d="M{gx+19} {cy} h12 M{gx+27} {cy} v3.5" stroke="{PAD}" stroke-width="2"/>')
            elif k.startswith('tag:'):
                kind = k[4:]
                fill, st = {'pub': (PAD, INK), 'conf': (TINT, READ), 'secret': (ROBE, ROBE)}[kind]
                self.raw(f'<rect x="{gx}" y="{cy-11}" width="44" height="22" rx="4" fill="{fill}" stroke="{st}" stroke-width="1.5"/>')
                if kind == 'secret':
                    self.raw(f'<rect x="{gx}" y="{cy-11}" width="44" height="22" rx="4" fill="url(#hatchw)"/>')
            elif k == 'contract':
                self.raw(f'<rect x="{gx}" y="{cy-11}" width="44" height="22" rx="4" fill="{ROBE}"/>')
            elif k == 'store':
                self.raw(f'<rect x="{gx}" y="{cy-11}" width="44" height="22" rx="4" fill="#fff" stroke="{INK}" stroke-width="2"/><rect x="{gx+6}" y="{cy-11}" width="2" height="22" fill="{INK}"/><rect x="{gx+10}" y="{cy-11}" width="2" height="22" fill="{INK}"/>')
            elif k == 'ext':
                self.raw(f'<rect x="{gx}" y="{cy-11}" width="44" height="22" rx="4" fill="{TINT}" stroke="{INK}" stroke-width="2"/>')
            elif k == 'ghost':
                self.raw(f'<rect x="{gx}" y="{cy-11}" width="44" height="22" rx="4" fill="#fff" stroke="{INK}" stroke-width="2" stroke-dasharray="5 4"/>')
            elif k == 'terminal':
                self.raw(f'<rect x="{gx}" y="{cy-11}" width="44" height="22" rx="11" fill="#fff" stroke="{INK}" stroke-width="2"/><rect x="{gx+4}" y="{cy-7}" width="36" height="14" rx="7" fill="none" stroke="{INK}" stroke-width="1.5"/>')
            elif k == 'measure':
                self.raw(f'<path d="M{gx+22} {cy-12} L{gx+34} {cy} L{gx+22} {cy+12} L{gx+10} {cy} Z" fill="{PAD}" stroke="{INK}" stroke-width="2"/>')
            elif k == 'money':
                self.raw(f'<rect x="{gx}" y="{cy-11}" width="44" height="22" rx="4" fill="#fff" stroke="{INK}" stroke-width="2"/><text x="{gx+22}" y="{cy+6}" text-anchor="middle" class="s8" font-size="15" fill="{INK}">$</text>')
                self.used['sg800'] += '$'
            elif k == 'hashonly':
                self.raw(f'<rect x="{gx}" y="{cy-11}" width="44" height="22" rx="11" fill="#fff" stroke="{ROBE}" stroke-width="1.6" stroke-dasharray="4 3"/>')
            elif k == 'nevericon':
                self.raw(f'<circle cx="{gx+22}" cy="{cy}" r="8" fill="none" stroke="{MUTED}" stroke-width="2"/><line x1="{gx+16.4}" y1="{cy+5.6}" x2="{gx+27.6}" y2="{cy-5.6}" stroke="{MUTED}" stroke-width="2"/>')
            elif k == 'chainline':
                self.raw(f'<rect x="{gx+19}" y="{cy-13}" width="6" height="26" fill="{INK}"/>')
            elif k == 'newseat':
                self.raw(f'<circle cx="{gx+22}" cy="{cy}" r="7" fill="{PAD}" stroke="{ROBE}" stroke-width="2"/>')
            elif k == 'redact':
                redact_mark(self, gx + 22, cy, 'R', layer=self.el)
            elif k == 'stamp':
                self.raw(f'<rect x="{gx+2}" y="{cy-10}" width="40" height="20" rx="3" fill="none" stroke="{STAMP}" stroke-width="3" transform="rotate(-6 {gx+22} {cy})"/>')
            self.text(gx + 58, cy + 5, s, 14, 'sg500')
        return h

    # ---------- output ----------
    def save(self, name):
        body = '\n'.join(self.el + self.top).replace('__HD__', str(self.H - 118)).replace('__H__', str(self.H))
        fonts = ''.join(
            f"@font-face{{font-family:'{fam}';src:url(data:font/woff;base64,{_subset(k, self.used[k])}) format('woff');font-weight:{wt};font-style:{st}}}"
            for k, (fam, wt, st, _) in FN.items() if self.used[k])
        css = (fonts + ".b9{font-family:'VBS','Big Shoulders Display',Impact,sans-serif;font-weight:900}"
               ".s5,.s7,.s8,.s7i{font-family:'VSG','Schibsted Grotesk',Arial,sans-serif}"
               ".s5{font-weight:500}.s7{font-weight:700}.s8{font-weight:800}.s7i{font-weight:700;font-style:italic}")
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.W}" height="{self.H}" viewBox="0 0 {self.W} {self.H}" '
               f'role="img" aria-label="VERDICT: {E(self.title)}">\n<title>VERDICT: {E(self.title)}</title>\n<style>{css}</style>\n{body}\n</svg>\n')
        p = os.path.join(OUT, name)
        with open(p, 'w') as fh: fh.write(svg)
        print(f'{name}: {self.W}x{self.H}, {len(svg)//1024} KB')
        return p


def redact_mark(sh, cx, cy, n, layer=None):
    """Redaction point: an ink bar (the redaction itself) carrying its number in legal-pad."""
    L = layer if layer is not None else sh.top
    w = 22 + tw(str(n), 'sg800', 13)
    L.append(f'<rect x="{f2(cx-w/2)}" y="{f2(cy-11)}" width="{f2(w)}" height="22" rx="3" fill="{INK}"/>'
             f'<rect x="{f2(cx-w/2+4)}" y="{f2(cy-2)}" width="5" height="4" fill="{PAD}"/>')
    sh.text(cx + 4, cy + 5, str(n), 13, 'sg800', PAD, 'middle', layer=L)


def seal(sh, cx, cy, r, layer=None):
    """VERDICT seal (same geometry as brand/source/gen.py)."""
    u = r / 50.0; k = 0.82; oy = -5
    o = [f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{ROBE}"/>',
         f'<circle cx="{cx}" cy="{cy}" r="{r*.88:.2f}" fill="none" stroke="{PAD}" stroke-width="{1.8*u:.2f}"/>']
    for i in range(5):
        a = math.radians(140 - i * 25)
        o.append(f'<circle cx="{cx+math.cos(a)*r*.72:.2f}" cy="{cy+math.sin(a)*r*.72:.2f}" r="{3.4*u:.2f}" fill="{PAD}"/>')
    P = lambda x, y: f'{cx+x*u*k:.2f} {cy+(y*k+oy)*u:.2f}'
    o.append(f'<path d="M{P(-24,-14)} L{P(-12,-14)} L{P(0,16)} L{P(-6,30)} Z" fill="{PAD}"/>')
    o.append(f'<path d="M{P(-6,30)} L{P(0,16)} L{P(16,-16)} L{P(22,-12)} L{P(2,30)} Z" fill="{PAD}"/>')
    o.append(f'<g transform="translate({cx+19*u*k:.2f} {cy+(-18*k+oy)*u:.2f}) rotate(27)"><rect x="{-15*u*k:.2f}" y="{-6.5*u*k:.2f}" width="{30*u*k:.2f}" height="{13*u*k:.2f}" rx="{2*u*k:.2f}" fill="{PAD}"/>'
             f'<rect x="{-8*u*k:.2f}" y="{-6.5*u*k:.2f}" width="{2.4*u*k:.2f}" height="{13*u*k:.2f}" fill="{ROBE}"/><rect x="{5.6*u*k:.2f}" y="{-6.5*u*k:.2f}" width="{2.4*u*k:.2f}" height="{13*u*k:.2f}" fill="{ROBE}"/></g>')
    sh.raw(''.join(o), layer)


def icon(kind, cx, cy, s, col):
    """juror icons, same geometry as app/artifact.html iconSVG() and brand/source/gen.py icon()."""
    u = s / 48.0
    X = lambda v: f2(cx + (v - 24) * u); Y = lambda v: f2(cy + (v - 24) * u); U = lambda v: f2(v * u)
    if kind == 'judge':
        return (f'<rect x="{X(9)}" y="{Y(8)}" width="{U(30)}" height="{U(4)}" fill="{col}"/>' +
                ''.join(f'<rect x="{X(x)}" y="{Y(14)}" width="{U(5)}" height="{U(20)}" fill="{col}"/>' for x in (12, 21.5, 31)) +
                f'<rect x="{X(7)}" y="{Y(36)}" width="{U(34)}" height="{U(5)}" fill="{col}"/>')
    if kind == 'romantic':
        return ''.join(f'<circle cx="{X(a)}" cy="{Y(24)}" r="{U(11)}" fill="none" stroke="{col}" stroke-width="{U(4)}"/>' for a in (18, 30))
    if kind == 'realist':
        return (f'<rect x="{X(11)}" y="{Y(9)}" width="{U(26)}" height="{U(30)}" fill="none" stroke="{col}" stroke-width="{U(4)}"/>'
                f'<rect x="{X(16)}" y="{Y(17)}" width="{U(16)}" height="{U(3.5)}" fill="{col}"/><rect x="{X(16)}" y="{Y(25)}" width="{U(10)}" height="{U(3.5)}" fill="{col}"/>')
    if kind == 'petty':
        return (''.join(f'<rect x="{X(x)}" y="{Y(10)}" width="{U(3.6)}" height="{U(28)}" fill="{col}"/>' for x in (11, 18.5, 26, 33.5)) +
                f'<line x1="{X(6)}" y1="{Y(33)}" x2="{X(42)}" y2="{Y(15)}" stroke="{col}" stroke-width="{U(4)}" stroke-linecap="round"/>')
    if kind == 'philo':
        return (f'<circle cx="{f2(cx)}" cy="{f2(cy)}" r="{U(14)}" fill="none" stroke="{col}" stroke-width="{U(4)}"/>'
                f'<circle cx="{X(31)}" cy="{Y(17)}" r="{U(4.5)}" fill="{col}"/>')
    if kind == 'chief':
        return ''.join(f'<path d="M{X(x)} {Y(34)} L{X(x+6)} {Y(14)} L{X(x+12)} {Y(34)} Z" fill="{col}"/>' for x in (6, 18, 30))
    if kind == 'wild':
        return ''.join(f'<circle cx="{X(a)}" cy="{Y(b)}" r="{U(4.5)}" fill="{col}"/>' for a, b in ((14, 14), (24, 24), (34, 34)))
    if kind == 'hist':
        return ''.join(f'<rect x="{X(9)}" y="{Y(y)}" width="{U(30)}" height="{U(5)}" fill="{col}"/>' for y in (11, 21.5, 32))
    if kind == 'contra':
        return f'<path d="M{X(24)} {Y(7)} L{X(41)} {Y(24)} L{X(24)} {Y(41)} L{X(7)} {Y(24)} Z" fill="none" stroke="{col}" stroke-width="{U(4)}"/>'
    return ''
