"""Regenerates the VERDICT verdict-card SVGs in brand/.

Run from anywhere:  python3 brand/source/gen.py
Needs: fontTools (pip install fonttools). Fonts live in brand/source/fonts/ (SIL OFL 1.1,
licence files alongside). Each card embeds a WOFF subset of exactly the glyphs it uses,
so the SVGs render identically with no network or installed fonts.
"""
import base64, io, os, re, html, json, hashlib
from fontTools.ttLib import TTFont
from fontTools import subset as ftsubset

SP = os.path.dirname(os.path.abspath(__file__))
H = os.path.join(SP, 'fonts') + os.sep
OUT = os.path.dirname(SP) + os.sep

_metric = {}
def font(fn):
    if fn not in _metric:
        t = TTFont(H + fn)
        _metric[fn] = (t.getBestCmap(), t['hmtx'].metrics, t['head'].unitsPerEm)
    return _metric[fn]
FN = {'sg500': 'schibsted-grotesk-latin-500-normal.ttf', 'sg800': 'schibsted-grotesk-latin-800-normal.ttf',
      'sg700i': 'schibsted-grotesk-latin-700-italic.ttf', 'bs900': 'big-shoulders-display-latin-900-normal.ttf'}

def subset_b64(f, text):
    """WOFF (zlib) subset of font f covering the characters in text, base64-encoded."""
    opts = ftsubset.Options()
    opts.flavor = 'woff'
    opts.layout_features = ['kern', 'liga', 'calt']
    opts.name_IDs = ['*']          # keep copyright/licence name records (OFL)
    opts.notdef_outline = True
    t = TTFont(H + FN[f])
    sub = ftsubset.Subsetter(opts)
    sub.populate(text=''.join(sorted(set(text + ' '))))
    sub.subset(t)
    buf = io.BytesIO()
    t.flavor = 'woff'
    t.save(buf)
    return base64.b64encode(buf.getvalue()).decode()

def width(s, f, size, ls=0):
    cmap, hm, upm = font(FN[f])
    w = 0
    for ch in s:
        g = cmap.get(ord(ch))
        w += (hm[g][0] if g else upm * .5)
    return w / upm * size + ls * size * len(s)

def wrap(s, f, size, maxw):
    words, lines, cur = s.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if width(t, f, size) <= maxw:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

C = dict(robe='#1B1340', deep='#120C2E', pad='#F7E26B', stamp='#E5242C', docket='#F4F6FF', blue='#8FA8F0')
JUR = {
    'judge': ('The Judge', 'Marlowe', '#F4F6FF'),
    'romantic': ('The Romantic', 'Dahlia', '#FF7AA8'),
    'realist': ('The Realist', 'Frank', '#58C4FF'),
    'petty': ('The Petty One', 'Tiff', '#B9F24A'),
    'philo': ('The Philosopher', 'Theo', '#B79CFF'),
    'chief': ('The Chief Justice', 'Augustine', '#F7E26B'),   # Appeals Court + Supreme Court
    'wild': ('The Wildcard', 'Juno', '#FF9A3D'),              # Appeals Court + Supreme Court
    'hist': ('The Historian', 'Ines', '#5FE3C4'),             # Supreme Court only
    'contra': ('The Contrarian', 'Rook', '#E8B4F8'),          # Supreme Court only
}
TIER1 = ['judge', 'romantic', 'realist', 'petty', 'philo']
TIERS = {1: ('Settle It', TIER1),
         2: ('Appeals Court', ['chief'] + TIER1 + ['wild']),
         3: ('Supreme Court', ['chief'] + TIER1 + ['wild', 'hist', 'contra'])}

def icon(kind, cx, cy, s, col):
    """geometric juror icons, drawn in a box of size s centred at cx,cy"""
    u = s / 48.0
    def X(v): return cx + (v - 24) * u
    def Y(v): return cy + (v - 24) * u
    if kind == 'judge':  # column
        r = [f'<rect x="{X(9)}" y="{Y(8)}" width="{30*u}" height="{4*u}" fill="{col}"/>']
        for x in (12, 21.5, 31):
            r.append(f'<rect x="{X(x)}" y="{Y(14)}" width="{5*u}" height="{20*u}" fill="{col}"/>')
        r.append(f'<rect x="{X(7)}" y="{Y(36)}" width="{34*u}" height="{5*u}" fill="{col}"/>')
        return ''.join(r)
    if kind == 'romantic':  # two overlapping circles
        return (f'<circle cx="{X(18)}" cy="{Y(24)}" r="{11*u}" fill="none" stroke="{col}" stroke-width="{4*u}"/>'
                f'<circle cx="{X(30)}" cy="{Y(24)}" r="{11*u}" fill="none" stroke="{col}" stroke-width="{4*u}"/>')
    if kind == 'realist':  # receipt: square with line
        return (f'<rect x="{X(11)}" y="{Y(9)}" width="{26*u}" height="{30*u}" fill="none" stroke="{col}" stroke-width="{4*u}"/>'
                f'<rect x="{X(16)}" y="{Y(17)}" width="{16*u}" height="{3.5*u}" fill="{col}"/>'
                f'<rect x="{X(16)}" y="{Y(25)}" width="{10*u}" height="{3.5*u}" fill="{col}"/>')
    if kind == 'petty':  # tally
        r = ''.join(f'<rect x="{X(x)}" y="{Y(10)}" width="{3.6*u}" height="{28*u}" fill="{col}"/>' for x in (11, 18.5, 26, 33.5))
        return r + f'<line x1="{X(6)}" y1="{Y(33)}" x2="{X(42)}" y2="{Y(15)}" stroke="{col}" stroke-width="{4*u}" stroke-linecap="round"/>'
    if kind == 'philo':  # orbit
        return (f'<circle cx="{cx}" cy="{cy}" r="{14*u}" fill="none" stroke="{col}" stroke-width="{4*u}"/>'
                f'<circle cx="{X(31)}" cy="{Y(17)}" r="{4.5*u}" fill="{col}"/>')
    if kind == 'chief':  # crown triangles
        return ''.join(f'<path d="M{X(x)} {Y(34)} L{X(x+6)} {Y(14)} L{X(x+12)} {Y(34)} Z" fill="{col}"/>' for x in (6, 18, 30))
    if kind == 'wild':
        return ''.join(f'<circle cx="{X(x)}" cy="{Y(y)}" r="{4.5*u}" fill="{col}"/>' for x, y in ((14, 14), (24, 24), (34, 34)))
    if kind == 'hist':  # stack of case files
        return ''.join(f'<rect x="{X(9)}" y="{Y(y)}" width="{30*u}" height="{5*u}" fill="{col}"/>' for y in (11, 21.5, 32))
    if kind == 'contra':  # diamond
        return (f'<path d="M{X(24)} {Y(7)} L{X(41)} {Y(24)} L{X(24)} {Y(41)} L{X(7)} {Y(24)} Z" fill="none" '
                f'stroke="{col}" stroke-width="{4*u}" stroke-linejoin="miter"/>')
    return ''

def seal(cx, cy, r, ring=C['robe'], fill=C['robe'], mark=C['pad'], dots=C['pad'], stroke_bg=None):
    """VERDICT seal: disc, inner ring, V whose right stroke is a gavel handle, five juror dots on the lower arc (the bench)"""
    import math
    u = r / 50.0
    out = [f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>']
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{r*0.88:.2f}" fill="none" stroke="{mark}" stroke-width="{1.8*u:.2f}"/>')
    for i in range(5):
        a = math.radians(140 - i * 25)
        out.append(f'<circle cx="{cx + math.cos(a)*r*0.72:.2f}" cy="{cy + math.sin(a)*r*0.72:.2f}" r="{3.4*u:.2f}" fill="{dots}"/>')
    k = 0.82; oy = -5
    def P(x, y): return f'{cx + x*u*k:.2f} {cy + (y*k + oy)*u:.2f}'
    out.append(f'<path d="M{P(-24,-14)} L{P(-12,-14)} L{P(0,16)} L{P(-6,30)} Z" fill="{mark}"/>')
    out.append(f'<path d="M{P(-6,30)} L{P(0,16)} L{P(16,-16)} L{P(22,-12)} L{P(2,30)} Z" fill="{mark}"/>')
    out.append(f'<g transform="translate({cx + 19*u*k:.2f} {cy + (-18*k + oy)*u:.2f}) rotate(27)"><rect x="{-15*u*k:.2f}" y="{-6.5*u*k:.2f}" width="{30*u*k:.2f}" height="{13*u*k:.2f}" rx="{2*u*k:.2f}" fill="{mark}"/>'
               f'<rect x="{-8*u*k:.2f}" y="{-6.5*u*k:.2f}" width="{2.4*u*k:.2f}" height="{13*u*k:.2f}" fill="{fill}"/>'
               f'<rect x="{5.6*u*k:.2f}" y="{-6.5*u*k:.2f}" width="{2.4*u*k:.2f}" height="{13*u*k:.2f}" fill="{fill}"/></g>')
    return ''.join(out)

def style(used):
    """used: dict font-key -> text drawn in that font"""
    F = {k: subset_b64(k, used.get(k, '')) for k in FN}
    return ('<style>'
            f"@font-face{{font-family:'BS';src:url(data:font/woff;base64,{F['bs900']}) format('woff');font-weight:900}}"
            f"@font-face{{font-family:'SG';src:url(data:font/woff;base64,{F['sg500']}) format('woff');font-weight:500}}"
            f"@font-face{{font-family:'SG';src:url(data:font/woff;base64,{F['sg800']}) format('woff');font-weight:800}}"
            f"@font-face{{font-family:'SG';src:url(data:font/woff;base64,{F['sg700i']}) format('woff');font-weight:700;font-style:italic}}"
            ".bs{font-family:'BS','Big Shoulders Display',Impact,sans-serif;font-weight:900}"
            ".sg{font-family:'SG','Schibsted Grotesk',Arial,sans-serif;font-weight:500}"
            ".b{font-weight:800}.i{font-style:italic;font-weight:700}"
            '</style>')

E = html.escape

def slip_h(take, w, size):
    lh = round(size*1.36)
    return 134 + lh * len(wrap(take, 'sg500', size, w - 130)) + 18

def slip(x, y, w, name, take, rot, won, size=36):
    lh = round(size*1.36)
    lines = wrap(take, 'sg500', size, w - 130)
    h = slip_h(take, w, size)
    cx, cy = x + w/2, y + h/2
    g = [f'<g transform="rotate({rot} {cx} {cy})">']
    g.append(f'<rect x="{x+6}" y="{y+10}" width="{w}" height="{h}" fill="#000" opacity=".28"/>')
    g.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{C["pad"]}"/>')
    ly = y + 134 + 14
    g.append(f'<rect x="{x}" y="{y+92}" width="{w}" height="2" fill="{C["blue"]}" opacity=".7"/>')
    for i in range(len(lines)):
        g.append(f'<rect x="{x}" y="{ly + i*lh}" width="{w}" height="2" fill="{C["blue"]}" opacity=".7"/>')
    g.append(f'<rect x="{x+70}" y="{y}" width="3" height="{h}" fill="{C["stamp"]}" opacity=".85"/>')
    g.append(f'<rect x="{x+76}" y="{y}" width="2" height="{h}" fill="{C["stamp"]}" opacity=".5"/>')
    g.append(f'<text x="{x+100}" y="{y+68}" class="sg b" font-size="38" fill="{C["robe"]}">{E(name)}</text>')
    for i, l in enumerate(lines):
        g.append(f'<text x="{x+100}" y="{y+134 + i*lh}" class="sg" font-size="{size}" fill="{C["robe"]}">{E(l)}</text>')
    if won:
        sx, sy = x + w - 150, y + 48
        g.append(f'<g transform="rotate(-8 {sx} {sy})"><rect x="{sx-110}" y="{sy-33}" width="220" height="66" fill="{C["pad"]}" stroke="{C["stamp"]}" stroke-width="7" rx="6"/>'
                 f'<text x="{sx}" y="{sy+19}" text-anchor="middle" class="bs" font-size="54" fill="{C["stamp"]}" letter-spacing="4">WINNER</text></g>')
    g.append('</g>')
    return ''.join(g), h

def receipt(rubric, a, b, tier, surface):
    """Case package digest shown on the card as its receipt number: sha256 of the canonical public fields
    (sorted keys, no whitespace), shortened to first 4 + last 4 hex. Mirrors the relayer's case packager."""
    pkg = {'rubric': rubric, 'entries': [a[1], b[1]], 'names': [a[0], b[0]], 'tier': tier, 'surface': surface}
    h = hashlib.sha256(json.dumps(pkg, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    return f'{h[:4]}…{h[-4:]}'


def card(rubric, case_no, a, b, votes, ruling, by, fname, tier=1, stamp=None, template=False, surface='settle'):
    """Mirrors drawCard() in app/artifact.html.
    votes: list of (juror_key, voted_for_name) in seat order; tier 1 = 5 seats, 2 = 7, 3 = 9 (final).
    surface: 'settle' (submitted by participants) or 'live' (Live Court, submitted by the host).
    Every example card is a finalized verdict, so it carries the network line and the receipt."""
    W, Hh = 1080, 1920
    seats = [v[0] for v in votes] if votes else TIERS[tier][1]
    assert len(seats) == len(TIERS[tier][1]), f'{fname}: tier {tier} needs {len(TIERS[tier][1])} seats'
    hi_tier = tier > 1
    s = [f'<rect width="{W}" height="{Hh}" fill="{C["robe"]}"/>']
    s.append('<defs><pattern id="pin" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="1.4" height="18" fill="#ffffff" opacity=".035"/></pattern></defs>')
    s.append(f'<rect width="{W}" height="{Hh}" fill="url(#pin)"/>')
    # header
    s.append(seal(108, 112, 42))
    s.append(f'<text x="166" y="134" class="bs" font-size="64" fill="{C["docket"]}" letter-spacing="3">VERDICT</text>')
    court = TIERS[tier][0] if (tier > 1 or surface != 'live') else 'Live Court'
    s.append(f'<text x="1008" y="106" text-anchor="end" class="sg b" font-size="28" fill="{C["pad"] if hi_tier else C["blue"]}">{court}</text>')
    s.append(f'<text x="1008" y="142" text-anchor="end" class="sg" font-size="26" fill="{C["blue"]}">{"Template" if template else "Example card"} · Case {E(case_no)}</text>')
    rule_h = 8 if tier == 3 else 4 if tier == 2 else 2
    s.append(f'<rect x="72" y="182" width="936" height="{rule_h}" fill="{C["pad"] if hi_tier else C["blue"]}" opacity="{1 if hi_tier else .45}"/>')
    # rubric
    rs = 120
    while width(rubric, 'bs900', rs) > 936 and rs > 70: rs -= 4
    s.append(f'<text x="72" y="306" class="bs" font-size="{rs}" fill="{C["docket"]}">{E(rubric)}</text>')
    winner = None
    if votes:
        ca = sum(1 for v in votes if v[1] == a[0]); cb = len(votes) - ca
        winner = a[0] if ca > cb else b[0]
    y = 352
    rl = wrap(f'“{ruling}”', 'sg700i', 46, 936)
    # Largest take size (36 down to the 26px floor) that keeps the bench clear of the footer.
    n_seats = len(seats)
    r_seat = {5: 50, 7: 42}.get(n_seats, 34)
    foot_top = 1748 if tier == 3 else 1686
    def bench_bottom_for(sz):
        return (y + slip_h(a[1], 936, sz) + 26 + slip_h(b[1], 936, sz) + 40 + 214 + (110 if stamp else 0)
                + 84 + (len(rl)-1)*58 + 48 + 40 + 74 + r_seat + 102)
    size = 36
    while bench_bottom_for(size) > foot_top - 24 and size > 26: size -= 1
    g1, h1 = slip(72, y, 936, a[0], a[1], -1.2, winner == a[0] and not template, size)
    s.append(g1)
    y2 = y + h1 + 26
    g2, h2 = slip(72, y2, 936, b[0], b[1], 1.0, winner == b[0] and not template, size)
    s.append(g2)
    # split
    top = y2 + h2 + 40
    if template:
        split, line2 = '?–?', 'for {name}'
    else:
        split, line2 = f'{max(ca, cb)}–{min(ca, cb)}', f'for {winner}'
    line1 = 'The court rules'
    bl = top + 214
    s.append(f'<text x="60" y="{bl}" class="bs" font-size="270" fill="{C["pad"]}" letter-spacing="-4">{split}</text>')
    sw = width(split, 'bs900', 270, -4/270) + 60 + 40
    s.append(f'<text x="{sw}" y="{bl-100}" class="sg" font-size="40" fill="{C["blue"]}">{line1}</text>')
    fs = 72
    while width(line2, 'sg800', fs) > 1008 - sw and fs > 44: fs -= 2
    s.append(f'<text x="{sw}" y="{bl-24}" class="sg b" font-size="{fs}" fill="{C["docket"]}">{E(line2)}</text>')
    if stamp:
        stx, sty = 540, bl + 70
        tw = width(stamp, 'bs900', 90, 16/90) - 16
        bw = tw + 90
        s.append(f'<g transform="rotate(-4 {stx} {sty})"><rect x="{stx-bw/2}" y="{sty-50}" width="{bw}" height="100" rx="8" fill="none" stroke="{C["stamp"]}" stroke-width="8"/>'
                 f'<text x="{stx}" y="{sty+32}" text-anchor="middle" class="bs" font-size="90" fill="{C["stamp"]}" letter-spacing="16" dx="8">{stamp}</text></g>')
        bl += 110
    # ruling
    ry = bl + 84
    for i, l in enumerate(rl):
        s.append(f'<text x="72" y="{ry + i*58}" class="sg i" font-size="46" fill="{C["docket"]}">{E(l)}</text>')
    ry2 = ry + (len(rl)-1)*58 + 48
    s.append(f'<text x="72" y="{ry2}" class="sg" font-size="30" fill="{C["blue"]}">{E(by)}</text>')
    # bench
    by0 = ry2 + 40
    s.append(f'<rect x="72" y="{by0}" width="936" height="2" fill="{C["blue"]}" opacity=".45"/>')
    n = len(seats); cw = 936 / n
    r = {5: 50, 7: 42}.get(n, 34)
    nf = {5: 30, 7: 23}.get(n, 20); vf = {5: 28, 7: 24}.get(n, 20)
    pad_x = 36 if n == 5 else 18
    for i, k in enumerate(seats):
        _, first, col = JUR[k]
        cx = 72 + cw*i + cw/2
        cy = by0 + 74
        s.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{C["deep"]}" stroke="{col}" stroke-width="5"/>')
        s.append(icon(k, cx, cy, r*1.15, col))
        nfs = nf
        while width(first, 'sg800', nfs) > cw - 14 and nfs > 18: nfs -= 1   # keep neighbouring names apart
        s.append(f'<text x="{cx}" y="{cy + r + 40}" text-anchor="middle" class="sg b" font-size="{nfs}" fill="{col}">{first}</text>')
        vt = votes[i][1] if votes else '—'
        vfs = vf
        while width(vt, 'sg800', vfs) > cw - pad_x and vfs > 16: vfs -= 1   # shrink a long @handle before truncating it
        while width(vt, 'sg800', vfs) > cw - pad_x and len(vt) > 3: vt = vt[:-2] + '…'
        vw = min(cw - 6, width(vt, 'sg800', vfs) + pad_x)
        s.append(f'<rect x="{cx - vw/2}" y="{cy + r + 56}" width="{vw}" height="46" rx="23" fill="{C["pad"] if not template else "none"}" stroke="{C["pad"]}" stroke-width="2"/>')
        s.append(f'<text x="{cx}" y="{cy + r + {5: 88, 7: 87}.get(n, 86)}" text-anchor="middle" class="sg b" font-size="{vfs}" fill="{C["robe"] if not template else C["pad"]}">{E(vt)}</text>')
    bench_bottom = by0 + 74 + r + 102
    # footer: appeal bar (tier 1, 2) or case closed (tier 3), then the network line and provenance
    if tier == 3:
        ay = 1748
        s.append(f'<text x="540" y="{ay+22}" text-anchor="middle" class="sg b" font-size="34" fill="{C["pad"]}">Case closed. Settle yours on Verdict.</text>')
    else:
        ay = 1686
        s.append(f'<rect x="72" y="{ay}" width="936" height="86" rx="43" fill="none" stroke="{C["pad"]}" stroke-width="4"/>')
        s.append(f'<text x="540" y="{ay+57}" text-anchor="middle" class="sg b" font-size="38" fill="{C["pad"]}">{"Appeal to the Supreme Court" if tier == 2 else "Appeal to a higher court"}</text>')
    fy = 1830
    s.append(f'<rect x="72" y="{fy-38}" width="936" height="2" fill="{C["blue"]}" opacity=".35"/>')
    net = 'Checked by the GenLayer network · {status}' if template else 'Checked by the GenLayer network · Finalized'
    rc = 'Receipt {digest}' if template else f'Receipt {receipt(rubric, a, b, tier, surface)}'
    rc2 = '' if template else '(example)'   # invented case: the receipt is a sample digest, said under it
    prov = 'Submitted by host' if surface == 'live' else 'Submitted by participants'
    assert width(net, 'sg500', 26) + width(rc, 'sg500', 26) + 30 <= 1008 - 114, f'{fname}: footer overflow'
    # check mark
    s.append(f'<path d="M74 {fy-12} l9 9 l17 -19" fill="none" stroke="{C["pad"]}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>')
    s.append(f'<text x="114" y="{fy}" class="sg" font-size="26" fill="{C["docket"]}">{E(net)}</text>')
    s.append(f'<text x="1008" y="{fy}" text-anchor="end" class="sg" font-size="26" fill="{C["blue"]}">{E(rc)}</text>')
    s.append(f'<text x="114" y="{fy+42}" class="sg" font-size="26" fill="{C["blue"]}">{E(prov)}</text>')
    if rc2:
        s.append(f'<text x="1008" y="{fy+42}" text-anchor="end" class="sg i" font-size="26" fill="{C["blue"]}">{E(rc2)}</text>')
    s.append('</svg>')
    body = '\n'.join(s)
    used = html.unescape(''.join(re.findall(r'>([^<]+)</text>', body)))
    head = f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{Hh}" viewBox="0 0 {W} {Hh}">'
    with open(OUT + fname, 'w') as fh:
        fh.write(head + '\n' + style({k: used for k in FN}) + '\n' + body)
    flag = '' if bench_bottom < ay - 10 else '  <-- BENCH OVERLAPS FOOTER'
    print(f'{fname}: tier {tier}, take size {size}, bench bottom {bench_bottom:.0f}, footer top {ay}{flag}')


if __name__ == '__main__':
    # Template only: the {placeholders} are the field spec. It is never rendered into a PNG (previews.py skips it).
    card("Who's right?", '#0000', ('{@handle A}', '{Take A, up to 280 characters. Lines wrap on the legal pad.}'),
         ('{@handle B}', '{Take B, up to 280 characters.}'), [], '{One-line ruling from the lead juror, up to 110 characters.}',
         '{Juror name}, {seat}', 'verdict-card-template.svg', template=True)
    # Example cards: invented cases, players shown by @username only (never a real-sounding first name).
    card("Who's right?", '#0417',
         ('@list_keeper', "He forgot our anniversary but remembered his fantasy draft down to the minute. I'm not mad, I'm just keeping a list."),
         ('@draft_day', "It was a Tuesday. We don't even celebrate the first date, we celebrate the first text. Nobody agreed on a date."),
         [('judge', '@list_keeper'), ('romantic', '@list_keeper'), ('realist', '@draft_day'), ('petty', '@list_keeper'), ('philo', '@list_keeper')],
         "@draft_day set a draft alarm and not an anniversary alarm. The court has seen the priorities.",
         'Marlowe, The Judge', 'card-example-relationship.svg')
    # Roasts target takes and habits, never identity, bodies or appearance (brand guide, voice rule 2).
    card('Better roast', '#0952',
         ('@reply_all_hero', "@tab_hoarder has 47 browser tabs open and says he's “getting to them.” That's not a to-do list, that's a hostage situation."),
         ('@tab_hoarder', "@reply_all_hero hits reply-all to say “thanks!” to 300 people. Every time. IT has a folder just for him."),
         [('judge', '@tab_hoarder'), ('romantic', '@reply_all_hero'), ('realist', '@reply_all_hero'), ('petty', '@reply_all_hero'), ('philo', '@reply_all_hero')],
         "Forty-seven tabs as a hostage situation had a setup and a payoff. Reply-all was a rerun.",
         'Tiff, The Petty One', 'card-example-roast.svg', surface='live')
    # The relationship case after @draft_day's appeal: the Appeals Court (7 seats) upholds for @list_keeper.
    card("Who's right?", '#0417-A',
         ('@list_keeper', "He forgot our anniversary but remembered his fantasy draft down to the minute. I'm not mad, I'm just keeping a list."),
         ('@draft_day', "It was a Tuesday. We don't even celebrate the first date, we celebrate the first text. Nobody agreed on a date."),
         [('chief', '@list_keeper'), ('judge', '@list_keeper'), ('romantic', '@list_keeper'), ('realist', '@draft_day'), ('petty', '@list_keeper'), ('philo', '@list_keeper'), ('wild', '@draft_day')],
         "Seven jurors looked again. Same answer. @draft_day, it’s time.",
         'Augustine, The Chief Justice', 'card-example-relationship-appeals.svg', tier=2, stamp='UPHELD')
    card('Pettiest text', '#1203',
         ('@noted', "Replied 'noted.' to my roommate's 600-word dishes manifesto. Then did the dishes. Loudly."),
         ('@hoodie', "Sent my ex a calendar invite titled 'Return my hoodie' with a 15-minute reminder. Recurring weekly."),
         [('judge', '@hoodie'), ('romantic', '@noted'), ('realist', '@hoodie'), ('petty', '@hoodie'), ('philo', '@hoodie')],
         "A recurring calendar invite is not a text, it's a lifestyle. @hoodie is building a petty empire.",
         'Tiff, The Petty One', 'card-example-petty.svg')
    # Same case after two appeals: Tier 1 and the Appeals Court went to @hoodie; the Supreme Court (9, final) overturns.
    card('Pettiest text', '#1203-S',
         ('@noted', "Replied 'noted.' to my roommate's 600-word dishes manifesto. Then did the dishes. Loudly."),
         ('@hoodie', "Sent my ex a calendar invite titled 'Return my hoodie' with a 15-minute reminder. Recurring weekly."),
         [('chief', '@noted'), ('judge', '@noted'), ('romantic', '@noted'), ('realist', '@hoodie'), ('petty', '@noted'),
          ('philo', '@hoodie'), ('wild', '@noted'), ('hist', '@noted'), ('contra', '@hoodie')],
         "Precedent is clear: a calendar invite is planning. One word, then loud dishes? That is art.",
         'Ines, The Historian', 'card-example-petty-supreme.svg', tier=3, stamp='OVERTURNED')
