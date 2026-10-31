"""Regenerates the cards that come out of the GenLayer-fit brief (docs/DESIGN-genlayer-fit.md v1):
the two published Settle It cards, the weekly "Scams going around" digest and the pattern opt-in screen.

Run from anywhere:  python3 brand/source/gen_genlayer.py && python3 brand/source/previews_games.py
Shares the grid, fonts, seal, slips, bench, chips and footer geometry with gen.py and gen_games.py.

Rules baked in here (on top of the gen_games.py rules):
  * Published Settle It cards are the ONE place the front layer names GenLayer: the case really was re-heard
    on the network (brief section 1). Footer: check mark, "Checked by GenLayer · Finalized" and the receipt, shown as a
    short package digest (first 4 + last 4 hex). These are example cards, so the header says "Example card" and the
    receipt is a sample digest of the card's own invented content, marked "(example)". Never a VR- string or a {placeholder}.
  * Players appear by @username only, never a real-sounding first name (AUDIT-2 P2-8).
  * The network's ruling is the one that counts. When it differs from the preview, the preview is shown faded
    and struck through, and the headline says so. Appeals after publishing: 7 jurors next (brief section 1).
  * The digest is front layer. It does not claim a live ledger (the pattern ledger is in shadow mode, ADR-020 item 13):
    the one footer line is "Proof tab: patterns recorded on GenLayer when live", next to the empty ring, never the
    check mark. No receipts on the front. The counts are invented, so the header and every count say "Example".
  * Digest patterns are made up. Summaries carry no brand, name, number, link or amount (brief section 2);
    chips use only the fixed flag labels from relayer/src/lib/redflag.ts.
  * The opt-in screen has no default: both buttons are drawn identically, neither filled (playbook: no pre-ticked opt-ins).
"""
import os, re, sys, hashlib
from gen import width, wrap, C, JUR, TIER1, icon, slip as pad_slip, slip_h, E
from gen_games import (Card, header, headline, strip, stamp, split_line, juror_line, bench, cta,
                       centre, check_fit, CW)

FIX_MAX = 1008


# ---------------------------------------------------------------- shared pieces
def sample_receipt(*parts):
    """A sample receipt for an example card: first 4 + last 4 hex of sha256 over the card's invented content."""
    h = hashlib.sha256('|'.join(parts).encode()).hexdigest()
    return f'Receipt {h[:4]}…{h[-4:]} (example)'


def footer_network(c, line2, rc, fy=1812):
    """Published footer: the filled check mark (gen.py), the network line, the receipt, then provenance."""
    fy = fy  # two lines, same baseline as gen_games.footer()
    c.add(f'<rect x="72" y="{fy-38}" width="936" height="2" fill="{C["blue"]}" opacity=".35"/>')
    c.add(f'<path d="M74 {fy-12} l9 9 l17 -19" fill="none" stroke="{C["pad"]}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>')
    net = 'Checked by GenLayer · Finalized'
    assert width(net, 'sg800', 26) + width(rc, 'sg500', 26) + 40 < FIX_MAX - 114, 'footer overflow'
    c.text(114, fy, net, 26, 'sg b')
    c.text(1008, fy, rc, 26, 'sg', C['blue'], 'end')
    c.text(114, fy + 42, line2, 26, 'sg', C['blue'])
    return fy - 38


def proof_footer(c, line1, line2, fy=1812):
    """Front-layer footer that points to the Proof tab. Empty ring, never the check mark: it claims nothing live."""
    c.add(f'<rect x="72" y="{fy-38}" width="936" height="2" fill="{C["blue"]}" opacity=".35"/>')
    c.add(f'<circle cx="88" cy="{fy-9}" r="11" fill="none" stroke="{C["blue"]}" stroke-width="3"/>')
    assert width(line1, 'sg500', 26) <= FIX_MAX - 114, 'footer overflow'
    c.text(114, fy, line1, 26, 'sg', C['docket'])
    assert width(line2, 'sg500', 26) <= FIX_MAX - 114, 'footer overflow'
    c.text(114, fy + 42, line2, 26, 'sg', C['blue'])
    return fy - 38


def chip_row(c, x0, y, items, size=30, row_h=64, maxx=FIX_MAX):
    """Flag-chip stickers (gen_games.chips geometry) with no label row. Returns the bottom."""
    x = x0
    for i, t in enumerate(items):
        w = width(t, 'sg800', size) + 56
        if x + w > maxx:
            x = x0; y += row_h + 14
        rot = (-2, 1.5, -1)[i % 3]
        cx, cy = x + w / 2, y + row_h / 2
        c.add(f'<g transform="rotate({rot} {cx} {cy})">'
              f'<rect x="{x+4}" y="{y+6}" width="{w}" height="{row_h}" rx="12" fill="#000" opacity=".28"/>'
              f'<rect x="{x}" y="{y}" width="{w}" height="{row_h}" rx="12" fill="{C["pad"]}"/>'
              f'<rect x="{x+16}" y="{y+row_h/2-8}" width="16" height="16" rx="3" fill="{C["stamp"]}" transform="rotate(45 {x+24} {y+row_h/2})"/>'
              f'<text x="{x+44}" y="{y+row_h/2+size*.36:.1f}" class="sg b" font-size="{size}" fill="{C["robe"]}">{E(t)}</text></g>')
        x += w + 20
    return y + row_h


def cat_icon(kind, cx, cy, s, col):
    """Scam-category icons on the same 48-unit grid as the juror icons: flat geometry, one colour."""
    u = s / 48.0
    X = lambda v: cx + (v - 24) * u
    Y = lambda v: cy + (v - 24) * u
    sw = 4 * u
    if kind == 'delivery':   # parcel: box, lid line, tape
        return (f'<rect x="{X(8)}" y="{Y(14)}" width="{32*u}" height="{24*u}" fill="none" stroke="{col}" stroke-width="{sw}"/>'
                f'<path d="M{X(8)} {Y(14)} L{X(14)} {Y(7)} H{X(34)} L{X(40)} {Y(14)}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-linejoin="miter"/>'
                f'<rect x="{X(21)}" y="{Y(14)}" width="{6*u}" height="{11*u}" fill="{col}"/>')
    if kind == 'account':    # padlock
        return (f'<path d="M{X(15)} {Y(22)} V{Y(16)} A{9*u} {9*u} 0 0 1 {X(33)} {Y(16)} V{Y(22)}" fill="none" stroke="{col}" stroke-width="{sw}"/>'
                f'<rect x="{X(10)}" y="{Y(22)}" width="{28*u}" height="{19*u}" rx="{2*u}" fill="{col}"/>'
                f'<rect x="{X(22)}" y="{Y(28)}" width="{4*u}" height="{7*u}" rx="{1*u}" fill="{C["deep"]}"/>')
    if kind == 'job':        # briefcase
        return (f'<rect x="{X(7)}" y="{Y(16)}" width="{34*u}" height="{24*u}" rx="{2*u}" fill="none" stroke="{col}" stroke-width="{sw}"/>'
                f'<path d="M{X(18)} {Y(16)} V{Y(10)} H{X(30)} V{Y(16)}" fill="none" stroke="{col}" stroke-width="{sw}"/>'
                f'<rect x="{X(7)}" y="{Y(25)}" width="{34*u}" height="{3.5*u}" fill="{col}"/>')
    raise ValueError(kind)


def never_row(c, x, y, t, size=34):
    """Crossed circle (the diagrams' 'never holds' glyph) and a line of text."""
    cx, cy = x + 16, y - size * .34
    c.add(f'<circle cx="{cx}" cy="{cy:.1f}" r="15" fill="none" stroke="{C["blue"]}" stroke-width="3.5"/>'
          f'<line x1="{cx-10.6:.1f}" y1="{cy+10.6:.1f}" x2="{cx+10.6:.1f}" y2="{cy-10.6:.1f}" stroke="{C["blue"]}" stroke-width="3.5"/>')
    c.text(x + 50, y, t, size, 'sg', C['docket'])


# ---------------------------------------------------------------- published Settle It
def published(fname, case_no, rubric, a, b, preview, votes, ruling, by, head, cta_txt):
    """a, b: (name, take). preview: (winner, split) from the private Quick Verdict.
    votes: the network jury, (juror, voted_for) in seat order."""
    ca = sum(1 for _, v in votes if v == a[0]); cb = len(votes) - ca
    winner = a[0] if ca > cb else b[0]
    overruled = preview[0] != winner
    c = Card()
    header(c, 'Settle It', f'Example card · Case {case_no}', C['pad'])
    y = headline(c, head, 300, 112)
    c.text(72, y + 62, rubric, 40, 'sg b', C['pad'])
    y += 62
    m = len(c.s)
    # both takes on the legal pad; the WINNER stamp follows the network, never the preview
    size = 32
    g1, h1 = pad_slip(72, y + 30, 936, a[0], a[1], -1.0, winner == a[0], size); c.add(g1)
    g2, h2 = pad_slip(72, y + 30 + h1 + 20, 936, b[0], b[1], 0.9, winner == b[0], size); c.add(g2)
    y = y + 30 + h1 + 20 + h2
    # the preview row: faded and struck when overruled, plain with a check when confirmed
    py = y + 70
    lab = 'Quick preview'
    c.text(72, py, lab, 30, 'sg', C['blue'])
    px = 72 + width(lab, 'sg500', 30) + 24
    pt = f'{preview[1]} for {preview[0]}'
    tail = width('replaced' if overruled else 'same answer', 'sg700i', 30) + (26 if overruled else 78)
    pfs = 64
    while px + width(pt, 'bs900', pfs) + tail > FIX_MAX and pfs > 40: pfs -= 2   # keep the tail inside the margin
    assert px + width(pt, 'bs900', pfs) + tail <= FIX_MAX, 'preview row overflow'
    pw = width(pt, 'bs900', pfs)
    if overruled:
        c.text(px, py + 8, pt, pfs, 'bs', C['docket'], extra=' opacity=".42"')
        c.add(f'<rect x="{px-6:.1f}" y="{py-14}" width="{pw+12:.1f}" height="7" rx="2" fill="{C["stamp"]}" transform="rotate(-3 {px+pw/2:.1f} {py-10})"/>')
        c.text(px + pw + 26, py, 'replaced', 30, 'sg i', C['blue'])
    else:
        c.text(px, py + 8, pt, pfs, 'bs', C['docket'])
        cx = px + pw + 30
        c.add(f'<path d="M{cx} {py-14} l11 11 l21 -24" fill="none" stroke="{C["pad"]}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>')
        c.text(cx + 48, py, 'same answer', 30, 'sg i', C['blue'])
    y = py + 8
    # the network split, the one that counts
    y = split_line(c, y + 30, f'{max(ca, cb)}–{min(ca, cb)}', 'The network rules', f'for {winner}', size=184)
    y = juror_line(c, y + 16, ruling, by)
    y = bench(c, y + 24, votes)
    FL_TOP = 1812 - 38
    cy = FL_TOP - 40 - 86
    y = centre(c, m, y, cy)
    footer_network(c, 'Published by both sides · Submitted by participants',
                   sample_receipt(case_no, rubric, a[0], a[1], b[0], b[1]))
    check_fit(fname, y, cy)
    cta(c, cy, cta_txt)
    c.save(fname)


# ---------------------------------------------------------------- Scams going around (digest)
PATTERNS = [  # made up, counts included (shown as 'Example'); fixed flag labels only; no brand, name, number, link or amount in the summary
    ('delivery', 'Delivery', 37, ['Fake urgency', 'Asks for money', '“Click this link”'],
     'A text says your parcel is stuck and asks for a small fee to release it.'),
    ('account', 'Account lock', 24, ['Threatens a loss', 'Asks for a code'],
     'A message says your account is locked and asks you to send back a code.'),
    ('job', 'Job offer', 19, ['Too good to be true', 'Pay to get paid', 'Move to another app'],
     'A stranger offers easy work from home, then asks you to pay for training first.'),
]


def digest(fname):
    c = Card()
    header(c, 'Red Flag Court', 'Example card · sample week')
    y = headline(c, 'Scams going around this week', 300, 120)
    m = len(c.s)
    y += 52
    for kind, cat, seen, flags, summary in PATTERNS:
        top = y
        inner = []   # draw after the panel so it sits on top
        mark = len(c.s)
        # row 1: icon, category, seen count
        icx, icy = 72 + 24 + 40, top + 24 + 40
        c.add(f'<circle cx="{icx}" cy="{icy}" r="40" fill="{C["robe"]}" stroke="{C["pad"]}" stroke-width="4"/>' + cat_icon(kind, icx, icy, 50, C['pad']))
        c.text(202, top + 24 + 57, cat, 48, 'bs', C['pad'])
        st = f'Example: seen {seen} times'
        sw = width(st, 'sg800', 30) + 44
        c.add(f'<rect x="{1008-24-sw:.1f}" y="{top+24+16}" width="{sw:.1f}" height="48" rx="24" fill="none" stroke="{C["docket"]}" stroke-width="3"/>')
        c.text(1008 - 24 - sw / 2, top + 24 + 51, st, 30, 'sg b', C['docket'], 'middle')
        yy = top + 24 + 80 + 14
        # summary, big print
        lines = wrap(summary, 'sg800', 39, CW - 56)
        for i, l in enumerate(lines):
            c.text(100, yy + 39 + i * 52, l, 39, 'sg b')
        yy += 39 + (len(lines) - 1) * 52 + 26
        yy = chip_row(c, 100, yy, flags, 27, 54, 1008 - 24)
        bottom = yy + 26
        c.s.insert(mark, f'<rect x="72" y="{top}" width="936" height="{bottom-top}" rx="18" fill="{C["deep"]}"/>'
                         f'<rect x="72" y="{top}" width="8" height="{bottom-top}" rx="4" fill="{C["stamp"]}"/>')
        y = bottom + 20
    y -= 20
    # the action line, big print
    fs = 90
    act = 'Never reply, click or pay.'
    while width(act, 'bs900', fs) > CW and fs > 60: fs -= 2
    c.text(72, y + 30 + fs * .85, act, fs, 'bs', C['pad'])
    y += 30 + fs * .85
    FL_TOP = 1812 - 38
    cy = FL_TOP - 40 - 96
    y = centre(c, m, y, cy)
    c.add(f'<rect x="72" y="{cy}" width="936" height="96" rx="48" fill="{C["pad"]}"/>')
    c.text(540, cy + 62, 'Send this to my family', 46, 'sg b', C['robe'], 'middle')
    proof_footer(c, 'Proof tab: patterns recorded on GenLayer when live', 'Patterns only. Never a message, a sender or a name.')
    check_fit(fname, y, cy)
    c.save(fname)


# ---------------------------------------------------------------- opt-in screen
def optin(fname):
    """Screen mock: the SCAM result dimmed behind a bottom sheet asking to save the pattern. No default."""
    c = Card()
    header(c, 'Red Flag Court', 'Your result')
    # the result behind the sheet, dimmed
    c.add('<g opacity=".32">')
    stamp(c, 540, 330, 'SCAM', C['stamp'], 150, rot=-3, maxw=600)
    c.text(72, 520, "Don't reply. Don't click. Don't pay.", 72, 'bs', C['pad'])
    c.add('</g>')
    c.add(f'<rect x="0" y="0" width="1080" height="1920" fill="{C["deep"]}" opacity=".35"/>')
    # bottom sheet
    st = 600
    c.add(f'<rect x="0" y="{st}" width="1080" height="{1920-st+40}" rx="44" fill="{C["deep"]}"/>'
          f'<rect x="0" y="{st}" width="1080" height="3" rx="1.5" fill="{C["blue"]}" opacity=".35"/>'
          f'<rect x="490" y="{st+22}" width="100" height="10" rx="5" fill="{C["blue"]}" opacity=".55"/>')
    y = headline(c, 'Help warn others?', st + 160, 120)
    c.text(72, y + 70, 'We save only the pattern,', 46, 'sg b', C['pad'])
    c.text(72, y + 128, 'never your message.', 46, 'sg b', C['pad'])
    y += 128
    # what would be saved
    c.text(72, y + 82, 'What we would save', 30, 'sg', C['blue'])
    top = y + 108
    mark = len(c.s)
    icx, icy = 72 + 28 + 36, top + 28 + 36
    c.add(f'<circle cx="{icx}" cy="{icy}" r="36" fill="{C["deep"]}" stroke="{C["pad"]}" stroke-width="3"/>' + cat_icon('delivery', icx, icy, 44, C['pad']))
    c.text(188, top + 28 + 50, 'Delivery', 40, 'bs', C['pad'])
    yy = top + 28 + 72 + 16
    for i, l in enumerate(wrap('A text says your parcel is stuck and asks for a small fee to release it.', 'sg500', 34, CW - 56)):
        c.text(100, yy + 34 + i * 46, l, 34, 'sg i')
    yy += 34 + i * 46 + 26
    yy = chip_row(c, 100, yy, ['Fake urgency', 'Asks for money'], 26, 54, 1008 - 28)
    bottom = yy + 28
    c.s.insert(mark, f'<rect x="72" y="{top}" width="936" height="{bottom-top}" rx="18" fill="{C["robe"]}" stroke="{C["blue"]}" stroke-width="2" stroke-opacity=".45"/>')
    y = bottom
    # what is never saved
    c.text(72, y + 72, 'Never saved', 30, 'sg', C['blue'])
    nx = 72
    for t in ['Your message', 'Who sent it', 'Your number']:
        never_row(c, nx, y + 128, t, 32)
        nx += 50 + width(t, 'sg500', 32) + 40
    assert nx - 40 <= FIX_MAX, 'never row overflow'
    y += 128
    for i, l in enumerate(wrap('The pattern is public and permanent. It can show up in the weekly scam list.', 'sg500', 30, CW)):
        c.text(72, y + 64 + i * 42, l, 30, 'sg', C['blue'])
    y += 64 + i * 42
    # two equal buttons: nothing pre-selected
    by = 1920 - 72 - 46 - 2 * 96 - 22
    assert y < by - 40, f'opt-in overflow {y} vs {by}'
    for j, t in enumerate(['Yes, save the pattern', 'No thanks']):
        yb = by + j * (96 + 22)
        c.add(f'<rect x="72" y="{yb}" width="936" height="96" rx="48" fill="none" stroke="{C["pad"]}" stroke-width="4"/>')
        c.text(540, yb + 62, t, 42, 'sg b', C['pad'], 'middle')
    c.text(540, by + 2 * 96 + 22 + 48, 'Nothing is saved until you choose. Off unless you say yes.', 26, 'sg', C['blue'], 'middle')
    print(f'{fname}: content bottom {y:.0f}, buttons {by}')
    c.save(fname)


if __name__ == '__main__':
    published('card-published-overruled.svg', '#0733', "Who's right? Pizza night",
              ('@pizza_math', 'They ate most of the pizza. I ordered and I paid. We split it by slices eaten.'),
              ('@split_it_fair', 'We agreed to split it evenly before it arrived. A deal is a deal, even after you see the box.'),
              ('@pizza_math', '3–2'),
              [('judge', '@split_it_fair'), ('romantic', '@pizza_math'), ('realist', '@split_it_fair'), ('petty', '@split_it_fair'), ('philo', '@split_it_fair')],
              'You shook on it before the box opened.', 'realist',
              'The network overruled the preview.', 'Think the network got it wrong? Appeal to 7 jurors.')
    published('card-published-confirmed.svg', '#0812', "Who's right? The thermostat",
              ('@bill_payer', 'I pay the heating bill, so the thermostat stays at a normal number. Sweaters exist.'),
              ('@see_my_breath', 'They call a cold flat “normal.” I can see my breath in the kitchen. That is not a vibe.'),
              ('@bill_payer', '4–1'),
              [(k, '@bill_payer') for k in TIER1],
              'Whoever pays the bill sets the dial.', 'judge',
              'Confirmed by the network 5–0', 'Think the network got it wrong? Appeal to 7 jurors.')
    digest('card-redflag-digest.svg')
    optin('card-redflag-optin.svg')
    print('wrote 4 SVGs')
