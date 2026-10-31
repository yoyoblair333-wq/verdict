"""Builds the eight VERDICT architecture sheets in diagrams/.

python3 diagrams/source/build.py && python3 diagrams/source/render.py
"""
import sys
from kit import *

TB_DATE = '2026-10-31'


def tblock(s, x, y, sheet_name):
    return s.title_block(x, y, 1560 - x, [('Sheet', sheet_name), ('Product', 'VERDICT, Settle It, Live Court, Developer API'),
                                         ('Revision', f'r1, {TB_DATE}'), ('Source', 'diagrams/source/build.py')])


# =====================================================================================
def d1():
    s = Sheet(1, 'System topology', 'Three surfaces, one relayer, one Intelligent Contract. Who controls each zone, and what it never holds.', 1560)
    ZT = 172
    # ---------- clients ----------
    s.zone(40, ZT, 300, 640, 'Client surfaces', 'each user’s device',
           never='Relayer wallet key, Twitch OAuth tokens, payment IDs, the other side’s token.')
    c1 = s.node(64, ZT + 40, 252, 'Settle It web app', 'Browser. Writes the take, ticks consent and 18+, keeps its own side token.')
    c2 = s.node(64, c1['b'] + 22, 252, 'Live Court overlay', 'OBS browser source plus Twitch chat (!appeal). The host submits cases.')
    c3 = s.node(64, c2['b'] + 22, 252, 'Developer API clients', 'REST, MCP tool, n8n workflow. Authenticates with x-api-key.')
    # ---------- payment ----------
    PZ = 872
    s.zone(40, PZ, 300, 330, 'Payment provider', 'card processor', tone='ext',
           never='Case content and outcomes. Nothing it charges depends on a verdict.')
    pay = s.node(64, PZ + 40, 252, 'Web checkout', 'Credit packs and subscriptions. Sends a signed webhook.', kind='ext')
    # ---------- relayer ----------
    RX, RW = 372, 770
    s.zone(RX, ZT, RW, 1030, 'VERDICT relayer', 'VERDICT operator')
    LA, LB, LC = RX + 30, RX + 282, RX + 534
    LW, G = 222, 38
    y = ZT + 96
    edge = s.node(LA, y, LW, 'Edge API', 'Daily caps per IP and per key. Checks tokens against stored hashes.')
    mod = s.node(LA, edge['b'] + G, LW, 'Moderation pre-check', 'Length, injection patterns, PII. Fails with 422, before any gas.')
    con = s.node(LA, mod['b'] + G, LW, 'Consent check', 'Both sides agreed their take goes public on GenLayer, and are 18+.')
    pkg = s.node(LA, con['b'] + G, LW, 'Case packager', 'Canonical JSON, public fields only. Its sha256 digest is the receipt number.')
    out = s.node(LA, pkg['b'] + G, LW, 'Outbox', 'Package saved before broadcast. Retries reuse client_ref.', kind='store')
    cred = s.node(LA, out['b'] + G, LW, 'Credits ledger', '1 free appeal a day, then prepaid credit.', kind='store')

    vault = s.node(LB, y, LW, 'Secrets vault', 'Side-token hashes, API keys, Twitch OAuth tokens, payment IDs, IP addresses.', kind='secret', badge='Never sent on-chain')
    shadowsw = s.node(LB, 476, LW, 'Shadow mode switch', 'On by default: cases run end to end, nothing is published or resolved as official.')
    bc = s.node(LB, out['y'], LW, 'Broadcaster', 'genlayer-js: open_case, judge, appeal. value is always 0.', badge='Signs, pays gas')

    pub = s.node(LC, y, LW, 'Publisher', 'Card with receipt, signed webhooks, Twitch resolve after the appeal window.', badge='Resolves Predictions')
    gate = s.node(LC, pub['b'] + G, LW, 'Shadow gate', 'Shadow on: log and compare only. Off: hand to the Publisher.')
    inbox = s.node(LC, gate['b'] + G, LW, 'Inbox', 'Hash-chained. Each entry stores sha256(previous + this). An edit breaks the chain.', kind='store')
    watch = s.node(LC, inbox['b'] + G, LW, 'Finality watcher', 'Only FINALIZED with SUCCESS counts. Errors and timeouts are logged, never shown.')
    # ---------- twitch ----------
    GX, GW = 1172, 388
    s.zone(GX, ZT, GW, 286, 'Twitch (Helix API)', 'Twitch', tone='ext',
           never='Verdict authority or cash value. Channel Points only.')
    tw_ = s.node(GX + 24, ZT + 40, GW - 48, 'Channel Points Prediction', 'Create, lock, resolve, cancel. Stays locked through the appeal window.', kind='ext')
    # ---------- genlayer ----------
    GY = 506
    gm = s.mark()
    rec = s.node(GX + 28, watch['y'] + 6, GW - 52, 'Public record', 'Case package, receipt digest, every juror vote and tier. Anyone can read it.', kind='pub')
    ctr = s.node(GX + 28, max(bc['y'] - 10, rec['b'] + 40), GW - 52, 'JudgeRouter Intelligent Contract',
                 '5, 7 or 9 juror personas score both takes. Strict JSON, schema-checked.', kind='contract', badge='Writes the verdict')
    val = s.node(GX + 28, ctr['b'] + 44, GW - 52, 'Validators, each on its own AI model',
                 'The leader runs the panel, the others re-run it. The verdict stands only if they agree on the winner and on scores within 2 points.')
    s.under(gm, s.zone, GX, GY, GW, val['b'] + 28 - GY, 'GenLayer network', 'no single party', never_pos='top',
            never='Side tokens, API keys, Twitch tokens, payment IDs, IPs. No payable methods: it moves no money.')

    # ---------- arrows ----------
    bus_x = (c1['r'] + LA) / 2 + 2
    for c in (c1, c2, c3):
        s.arrow([(c['r'], c['cy']), (bus_x, c['cy'])], 'cmd', end=False)
    s.arrow([(bus_x, c3['cy']), (bus_x, edge['y'] + 30), (LA, edge['y'] + 30)], 'cmd')
    s.label(LA + 4, edge['y'] - 20, 'POST /cases: rubric, takes, consent, 18+', step=1)
    for a, b, n in ((edge, mod, 2), (mod, con, 3), (con, pkg, 4), (pkg, out, 5)):
        s.arrow([(a['cx'], a['b']), (a['cx'], b['y'])], 'cmd')
        s.step(a['cx'] + 26, (a['b'] + b['y']) / 2, n)
    s.arrow([(out['r'], out['cy']), (LB, out['cy'])], 'cmd')
    s.step((out['r'] + LB) / 2, out['cy'] - 22, 6)
    # 7 broadcast -> contract
    yb = bc['b'] - 26
    s.arrow([(bc['r'], yb), (ctr['x'], yb)], 'cmd')
    s.label(bc['r'] + 14, yb + 24, 'Signed tx: public fields + digest', step=7, size=13)
    # 8 contract <-> validators
    s.arrow([(ctr['cx'] - 50, ctr['b']), (ctr['cx'] - 50, val['y'])], 'cmd')
    s.arrow([(ctr['cx'] + 50, val['y']), (ctr['cx'] + 50, ctr['b'])], 'cmd')
    s.label(ctr['cx'] - 58, (ctr['b'] + val['y']) / 2, 'run panel', step=8, anchor='end', size=13)
    s.label(ctr['cx'] + 58, (ctr['b'] + val['y']) / 2, 'agree or reject', anchor='start', size=13)
    s.arrow([(ctr['cx'], ctr['y']), (ctr['cx'], rec['b'])], 'cmd')
    s.label(ctr['cx'] + 8, (ctr['y'] + rec['b']) / 2, 'only on agreement', size=13)
    # 9 watcher reads
    s.arrow([(rec['x'], watch['cy']), (watch['r'], watch['cy'])], 'read')
    s.label((watch['r'] + rec['x']) / 2, watch['cy'] - 24, 'status', step=9, anchor='middle', read=True, size=13)
    for a, b, n, t in ((watch, inbox, 10, 'FINALIZED, SUCCESS'), (inbox, gate, 11, ''), (gate, pub, 12, 'shadow off')):
        s.arrow([(a['cx'], a['y']), (a['cx'], b['b'])], 'cmd')
        s.label(a['cx'] + 10, (a['y'] + b['b']) / 2, t, step=n, size=13)
    s.arrow([(shadowsw['r'], gate['cy']), (LC, gate['cy'])], 'read')
    # 13 publisher -> client
    ty = ZT + 50
    s.arrow([(pub['x'] + 40, pub['y']), (pub['x'] + 40, ty), (bus_x + 16, ty), (bus_x + 16, c1['y'] + 22), (c1['r'], c1['y'] + 22)], 'event')
    s.label(LB + 6, ty, 'Verdict card, receipt pkg 9f86…0a08', step=13)
    # 14 publisher -> twitch
    s.arrow([(pub['r'] - 40, pub['y']), (pub['r'] - 40, ZT + 22), (GX - 16, ZT + 22), (GX - 16, tw_['cy']), (tw_['x'], tw_['cy'])], 'cmd')
    s.label(pub['r'] - 34, ZT + 22, 'resolve', step=14, size=13)
    # payments
    s.arrow([(pay['r'], pay['cy']), (pay['r'] + 40, pay['cy']), (pay['r'] + 40, cred['cy']), (LA, cred['cy'])], 'event')
    s.label(pay['r'] + 34, cred['cy'] - 40, 'signed webhook', anchor='middle', size=13)
    s.arrow([(52, ZT + 640), (52, pay['y'] + 24), (64, pay['y'] + 24)], 'cmd')
    s.label(62, PZ - 30, 'checkout', size=13)

    LY = val['b'] + 70
    s.H = LY + 220
    s.legend(40, LY, 900, extra=[('contract', 'Intelligent Contract'), ('store', 'Data store'), ('ext', 'External service'),
                                ('tag:pub', 'Public on-chain'), ('tag:secret', 'Secret, stays in relayer')], cols=3)
    tblock(s, 970, LY, 'D1 System topology')
    s.save('system-topology.svg')


def d2():
    s = Sheet(2, 'Case lifecycle', 'Every state a case can be in, who moves it, and the only path that ends in a published verdict.', 1600)
    # ---------- lane 1: relayer intake ----------
    Z1 = 172
    m1 = s.mark()
    R1 = Z1 + 62
    s.raw(f'<circle cx="74" cy="{R1+44}" r="11" fill="{INK}"/>')
    sub = s.state(104, R1, 196, 'Submitted', 'Both takes in, each sealed until the other answers.')
    mod = s.state(352, R1, 196, 'Moderation check', 'Length, injection patterns, PII.')
    con = s.state(600, R1, 196, 'Consent check', 'Both sides: public on GenLayer, 18+.')
    pkg = s.state(848, R1, 196, 'Packaged', 'Public fields + sha256 receipt, saved to the outbox.')
    rej1 = s.state(352, R1 + 152, 196, 'Rejected', '422. Nothing sent, no gas spent.', terminal=True, kind='bad')
    rej2 = s.state(600, R1 + 152, 196, 'Rejected', '422. Asks for consent, nothing sent.', terminal=True, kind='bad')
    rev = s.state(1096, R1, 444, 'REVOKED', 'Either side withdrew consent before FINALIZED. No card is published and the Twitch Prediction is canceled. Anything already broadcast stays on-chain, never shown as a verdict.', terminal=True, kind='bad', tag='Twitch: Prediction canceled')
    s.under(m1, s.zone, 40, Z1, 1520, rej2['b'] + 30 - Z1, 'Relayer intake', 'VERDICT operator')
    # ---------- lane 2: network ----------
    Z2 = rej2['b'] + 80
    m2 = s.mark()
    R2 = Z2 + 62
    pen = s.state(848, R2, 196, 'PENDING', 'Broadcast, waiting for a leader to run the panel.', kind='chain', tag='Twitch: locked')
    acc = s.state(1090, R2, 206, 'ACCEPTED', 'Validators agreed. Not final yet.', kind='chain')
    fs = s.state(1326, R2, 214, 'FINALIZED_SUCCESS', 'Final, contract returned. The only state that counts.', kind='chain')
    stale = s.state(848, pen['b'] + 60, 196, 'STALE', 'No finality before the deadline. No card; credit returned.', terminal=True, kind='bad', tag='Twitch: canceled')
    fe = s.state(1126, pen['b'] + 60, 210, 'FINALIZED_ERROR', 'Final, but the contract raised. No card; credit returned.', terminal=True, kind='bad', tag='Twitch: canceled')
    # what each status means for the UI (left side of the lane)
    s.text(72, R2 + 26, 'What the app shows', 16, 'sg800')
    rail = [('Submitted', 'PENDING'), ('Jury scoring', 'PENDING, leader running'), ('Network checking', 'ACCEPTED'), ('Finalized', 'FINALIZED_SUCCESS only')]
    for i, (a, b_) in enumerate(rail):
        yy = R2 + 56 + i * 46
        s.raw(f'<circle cx="86" cy="{yy}" r="9" fill="{PAD if i < 3 else INK}" stroke="{INK}" stroke-width="2"/>')
        if i < 3: s.raw(f'<rect x="85" y="{yy+9}" width="2" height="28" fill="{INK}"/>')
        s.text(106, yy + 5, a, 15, 'sg800')
        s.text(270, yy + 5, b_, 14, 'sg500', MUTED)
    s.text(72, R2 + 56 + 4 * 46 + 6, 'Status rail in the app and the Live Court overlay.', 13, 'sg700i', MUTED)
    s.under(m2, s.zone, 40, Z2, 1520, stale['b'] + 30 - Z2, 'GenLayer transaction', 'no single party', tone='chain')
    # ---------- lane 3: delivery ----------
    Z3 = stale['b'] + 80
    m3 = s.mark()
    R3 = Z3 + 62
    inb = s.state(1326, R3, 214, 'Inbox entry', 'Hash-chained to the entry before it.')
    gate = s.state(1096, R3, 210, 'Shadow gate', 'Shadow mode is on by default.')
    pubd = s.state(848, R3, 196, 'Published', 'Card with receipt pkg 9f86…0a08. Webhooks fire.')
    win = s.state(600, R3, 196, 'Appeal window', 'Losing side may appeal. Prediction stays locked.')
    clo = s.state(104, R3, 248, 'Case closed', 'Final standing verdict. One winner on stream.', terminal=True, tag='Twitch: Prediction resolved')
    shl = s.state(1096, gate['b'] + 60, 210, 'Shadow logged', 'Compared and logged. Not published, not resolved.', terminal=True)
    apf = s.state(600, win['b'] + 60, 196, 'Appeal filed', 'Side token of the losing side. Max 2.')
    s.under(m3, s.zone, 40, Z3, 1520, shl['b'] + 30 - Z3, 'Relayer delivery', 'VERDICT operator')

    # ---------- transitions ----------
    def h(a, b, y=None, **k):
        yy = y if y is not None else a['cy']
        if a['x'] < b['x']: s.arrow([(a['r'], yy), (b['x'], yy)], **k)
        else: s.arrow([(a['x'], yy), (b['r'], yy)], **k)
    s.arrow([(85, R1 + 44), (sub['x'], R1 + 44)], 'cmd')
    h(sub, mod, R1 + 44); s.step((sub['r'] + mod['x']) / 2, R1 + 20, 1)
    h(mod, con, R1 + 44); s.step((mod['r'] + con['x']) / 2, R1 + 20, 2)
    h(con, pkg, R1 + 44); s.step((con['r'] + pkg['x']) / 2, R1 + 20, 3)
    s.label((sub['r'] + mod['x']) / 2, R1 + 70, 'sent', anchor='middle', size=13)
    s.label((mod['r'] + con['x']) / 2, R1 + 70, 'pass', anchor='middle', size=13)
    s.label((con['r'] + pkg['x']) / 2, R1 + 70, 'pass', anchor='middle', size=13)
    s.arrow([(mod['cx'], mod['b']), (mod['cx'], rej1['y'])], 'cmd'); s.label(mod['cx'] + 8, (mod['b'] + rej1['y']) / 2, 'fail', size=13)
    s.arrow([(con['cx'], con['b']), (con['cx'], rej2['y'])], 'cmd'); s.label(con['cx'] + 8, (con['b'] + rej2['y']) / 2, 'missing', size=13)
    # withdrawals -> REVOKED
    h(pkg, rev, R1 + 44, style='event')
    s.label((pkg['r'] + rev['x']) / 2, R1 + 70, 'withdraw', anchor='middle', size=13)
    s.arrow([(pen['r'], pen['y'] + 22), (1070, pen['y'] + 22), (1070, rev['b'])], 'event')
    s.arrow([(acc['cx'] + 40, acc['y']), (acc['cx'] + 40, rev['b'])], 'event')
    s.label(acc['cx'] + 48, (rev['b'] + acc['y']) / 2, 'either side withdraws (before FINALIZED)', size=13)
    # broadcast
    s.arrow([(pkg['cx'], pkg['b']), (pkg['cx'], pen['y'])], 'cmd')
    s.label(pkg['cx'] - 10, (pkg['b'] + pen['y']) / 2 + 10, 'broadcast (shadow or live)', step=4, anchor='end', size=13)
    h(pen, acc, pen['cy'] + 14); s.step((pen['r'] + acc['x']) / 2, pen['cy'] - 10, 5)
    h(acc, fs, acc['cy'] + 14); s.step((acc['r'] + fs['x']) / 2, acc['cy'] - 10, 6)
    s.arrow([(pen['cx'], pen['b']), (pen['cx'], stale['y'])], 'cmd'); s.label(pen['cx'] + 8, (pen['b'] + stale['y']) / 2, 'deadline passes', size=13)
    s.arrow([(acc['x'] + 14, acc['b']), (acc['x'] + 14, stale['cy']), (stale['r'], stale['cy'])], 'cmd')
    s.arrow([(acc['cx'] + 40, acc['b']), (acc['cx'] + 40, fe['y'])], 'cmd'); s.label(acc['cx'] + 48, (acc['b'] + fe['y']) / 2, 'contract raised', size=13)
    # into delivery
    s.arrow([(fs['cx'], fs['b']), (fs['cx'], inb['y'])], 'cmd'); s.step(fs['cx'] + 24, (fs['b'] + inb['y']) / 2, 7)
    h(inb, gate, inb['cy']); s.step((inb['x'] + gate['r']) / 2, inb['cy'] - 24, 8)
    h(gate, pubd, gate['cy']); s.label((gate['x'] + pubd['r']) / 2, gate['cy'] - 24, 'off', step=9, anchor='middle', size=13)
    s.arrow([(gate['cx'], gate['b']), (gate['cx'], shl['y'])], 'cmd'); s.label(gate['cx'] + 8, (gate['b'] + shl['y']) / 2, 'on (default)', size=13)
    h(pubd, win, pubd['cy']); s.step((pubd['x'] + win['r']) / 2, pubd['cy'] - 24, 10)
    h(win, clo, win['cy']); s.label((win['x'] + clo['r']) / 2, win['cy'] - 26, 'window closes, or the Supreme Court ruled', step=11, anchor='middle', size=13, maxw=190)
    s.arrow([(win['cx'], win['b']), (win['cx'], apf['y'])], 'cmd'); s.label(win['cx'] + 8, (win['b'] + apf['y']) / 2, 'appeal', size=13)
    # appeal loop back to Packaged
    gy = (rej2['b'] + 30 + Z1 + 0) and (Z2 - 25)
    s.arrow([(apf['x'], apf['cy']), (24, apf['cy']), (24, gy), (pkg['x'] + 30, gy), (pkg['x'] + 30, pkg['b'])], 'cmd')
    s.label(120, gy, 'appeal re-enters as a new package: tier + 1, Appeals Court (7), then Supreme Court (9)', size=13)

    LY = shl['b'] + 80
    s.H = LY + 214
    s.legend(40, LY, 900, extra=[('terminal', 'Terminal state'), ('tag:pub', 'Network status (public)'), ('ghost', '')][:2], cols=3)
    tblock(s, 970, LY, 'D2 Case lifecycle')
    s.save('case-lifecycle.svg')


def bench(s, x, y, w, seats, new=()):
    """robe bench band with juror seats (icons and colours as on the cards)"""
    n = len(seats); cw = (w - 28) / n
    r = {5: 25, 7: 22, 9: 19}[n]
    stagger = n > 5
    h = 2 * r + (74 if stagger else 64)
    s.raw(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{ROBE}"/>')
    for i, k in enumerate(seats):
        role, first, col = JUR[k]
        cx, cy = x + 14 + cw * i + cw / 2, y + r + 14
        s.raw(f'<circle cx="{f2(cx)}" cy="{cy}" r="{r}" fill="{DEEP}" stroke="{col}" stroke-width="3"/>')
        s.raw(icon(k, cx, cy, r * 1.15, col))
        if k in new:
            s.raw(f'<circle cx="{f2(cx + r*.74)}" cy="{f2(cy - r*.74)}" r="7" fill="{PAD}" stroke="{ROBE}" stroke-width="2"/>')
        if stagger:
            if i % 2: s.raw(f'<rect x="{f2(cx-0.75)}" y="{cy+r+4}" width="1.5" height="16" fill="{col}" opacity=".6"/>')
            s.text(cx, cy + r + (20 if i % 2 == 0 else 40), first, 13, 'sg800', col, 'middle')
        else:
            s.text(cx, cy + r + 20, first, 13, 'sg800', col, 'middle')
            s.text(cx, cy + r + 38, role.replace('The ', ''), 11, 'sg500', RULE, 'middle')
    return h


def validator_strip(s, x, y, w):
    """five validator glyphs, each a different inner mark (each on its own model), plus the agreement rule"""
    marks = ['<circle cx="0" cy="0" r="4" fill="{c}"/>', '<rect x="-4" y="-4" width="8" height="8" fill="{c}"/>',
             '<path d="M0 -5 L5 4 L-5 4Z" fill="{c}"/>', '<path d="M-5 0 H5 M0 -5 V5" stroke="{c}" stroke-width="2.4"/>',
             '<path d="M0 -5 L5 0 L0 5 L-5 0Z" fill="{c}"/>']
    s.raw(f'<rect x="{x}" y="{y}" width="{w}" height="88" rx="8" fill="#fff" stroke="{INK}" stroke-width="1.5"/>')
    for i, m in enumerate(marks):
        cx, cy = x + 24 + i * 30, y + 26
        s.raw(f'<rect x="{cx-11}" y="{cy-11}" width="22" height="22" rx="4" fill="{PADTINT}" stroke="{INK}" stroke-width="1.6"/>')
        s.raw(f'<g transform="translate({cx} {cy})">' + m.format(c=INK) + '</g>')
    cx = x + 24 + 5 * 30 + 6
    s.raw(f'<path d="M{cx} {y+26} l6 6 l12 -13" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>')
    s.text(cx + 30, y + 31, 'Validators must agree', 14, 'sg800')
    s.lines(x + 13, y + 58, wrap('Each on its own AI model. Same winner, scores within 2 points, or it does not stand.', 'sg500', 13, w - 26)[:2], 13, 17)


def d3():
    s = Sheet(3, 'Appeal ladder', '5, then 7, then 9 juror personas. Losing side only, at most two appeals, every tier re-checked by the network.', 1500)
    T = [
        dict(name='Verdict', sub='Settle It, tier 1', seats=['judge', 'romantic', 'realist', 'petty', 'philo'], new=(),
             who='Either side, once both takes are in.', price='Free, within the daily case cap. The relayer pays gas.', top=470),
        dict(name='Appeals Court', sub='First appeal, tier 2', seats=['chief', 'judge', 'romantic', 'realist', 'petty', 'philo', 'wild'], new=('chief', 'wild'),
             who='Losing side only, proven by its side token.', price='1 free appeal a day, then $1.99 of prepaid credit.', top=360),
        dict(name='Supreme Court', sub='Second and final appeal, tier 3', seats=['chief', 'judge', 'romantic', 'realist', 'petty', 'philo', 'wild', 'hist', 'contra'], new=('hist', 'contra'),
             who='The side that lost at the Appeals Court.', price='Daily free appeal if unused, then $4.99 of prepaid credit.', top=250),
    ]
    PWS = [440, 500, 540]
    FLOOR = 0
    boxes = []
    x = 40
    T[0]['top'], T[1]['top'], T[2]['top'] = 430, 350, 270
    for i, t in enumerate(T):
        PW = PWS[i]; y = t['top']
        m = s.mark()
        s.text(x + 34, y + 66, t['name'], 44, 'bs900')
        s.text(x + 34, y + 92, t['sub'] + f', {len(t["seats"])} jurors', 15, 'sg700i', MUTED)
        if i:
            sx, sy = x + PW - 100, y + 56
            s.raw(f'<g transform="rotate(-6 {sx} {sy})"><rect x="{sx-78}" y="{sy-30}" width="156" height="60" rx="5" fill="none" stroke="{STAMP}" stroke-width="3.5"/>'
                  f'<text x="{sx}" y="{sy-5}" text-anchor="middle" class="b9" font-size="19" fill="{STAMP}" letter-spacing="2">UPHELD</text>'
                  f'<text x="{sx}" y="{sy+19}" text-anchor="middle" class="b9" font-size="19" fill="{STAMP}" letter-spacing="2">OVERTURNED</text></g>')
            s.used['bs900'] += 'UPHELDOVERTURNED'
        bh = bench(s, x + 30, y + 112, PW - 60, t['seats'], t['new'])
        ny = y + 112 + bh + 26
        if t['new']:
            s.raw(f'<circle cx="{x+40}" cy="{ny-5}" r="7" fill="{PAD}" stroke="{ROBE}" stroke-width="2"/>')
            s.text(x + 54, ny, 'New: ' + ', '.join(f'{JUR[k][1]} ({JUR[k][0].replace("The ", "")})' for k in t['new']), 14, 'sg800')
        else:
            s.text(x + 34, ny, 'Five personas, one lens each. Not five models.', 14, 'sg800')
        validator_strip(s, x + 30, ny + 20, PW - 60)
        ph = ny + 20 + 88 + 22 - (y + 12)
        s.under(m, s.raw, f'<rect x="{x}" y="{y}" width="{PW}" height="__FLOOR{i}__" fill="{ROBE}"/><rect x="{x+12}" y="{y+12}" width="{PW-24}" height="{ph}" rx="10" fill="#fff"/>')
        ty = y + 12 + ph + 40
        s.text(x + 30, ty, 'Who can trigger it', 14, 'sg800', PAD)
        s.lines(x + 30, ty + 22, wrap(t['who'], 'sg500', 16, PW - 60), 16, 22, 'sg500', DOCKET)
        s.text(x + 30, ty + 70, 'Price', 14, 'sg800', PAD)
        pl = wrap(t['price'], 'sg500', 16, PW - 60)
        s.lines(x + 30, ty + 92, pl, 16, 22, 'sg500', DOCKET)
        FLOOR = max(FLOOR, ty + 92 + 22 * len(pl) + 10)
        boxes.append((x, y, PW))
        x += PW + 20
    FLOOR += 50
    foot = ['Card footer: “Appeal to a higher court”', 'Card footer: “Appeal to the Supreme Court”', 'Card footer: “Case closed.” No higher court.']
    for i, (bx, by, bw) in enumerate(boxes):
        s.el = [e.replace(f'__FLOOR{i}__', str(FLOOR - by)) for e in s.el]
        s.raw(f'<rect x="{bx+30}" y="{FLOOR-62}" width="{bw-60}" height="1.5" fill="{RULE}" opacity=".5"/>')
        s.text(bx + 30, FLOOR - 26, foot[i], 15, 'sg700i', RULE)
    # appeal arrows between tiers
    for i in (0, 1):
        x, y, PW = boxes[i]; nx, ny, _ = boxes[i + 1]
        ay = ny - 44
        s.arrow([(x + PW - 60, y - 4), (x + PW - 60, ay), (nx + 60, ay), (nx + 60, ny - 4)], 'cmd', width=3)
        s.label(x + PW - 52, ay, ('Appeal 1' if i == 0 else 'Appeal 2, the last one'), step=i + 1, anchor='start', size=15)
    s.text(40, 176, 'How to read this', 18, 'sg800')
    s.lines(40, 204, wrap('Each step up seats more jurors and is heard from scratch. Only the side that lost can climb, and never more than twice. Every tier is a new transaction, so every tier is re-checked by the network before it stands.', 'sg500', 16, 380), 16, 23)
    x3, y3, PW = boxes[2]
    s.raw(f'<rect x="{x3+PW-170}" y="{y3-48}" width="170" height="36" rx="18" fill="{PAD}" stroke="{INK}" stroke-width="2"/>')
    s.text(x3 + PW - 85, y3 - 24, 'Case closed', 16, 'sg800', INK, 'middle')
    # floor
    s.raw(f'<rect x="40" y="{FLOOR}" width="1520" height="3" fill="{INK}"/>')
    # rules row
    RY = FLOOR + 40
    cols = [('Settle It', 'Only the loser’s screen shows the appeal button. The invite link carries each side’s own token.'),
            ('Live Court', 'The losing side’s chat types !appeal. Included in the streamer’s tier; viewers never pay. The Prediction stays locked until the case is final.'),
            ('Developer API', 'POST /cases/:id/appeal with the losing side’s x-side-token. 1 free per key a day, then the same credit prices.')]
    cw = (1520 - 2 * 24) / 3
    for i, (h_, b_) in enumerate(cols):
        x = 40 + i * (cw + 24)
        s.raw(f'<rect x="{x}" y="{RY}" width="{cw}" height="132" rx="8" fill="#fff" stroke="{INK}" stroke-width="2"/>')
        s.text(x + 18, RY + 32, h_, 18, 'sg800')
        s.lines(x + 18, RY + 58, wrap(b_, 'sg500', 15, cw - 36), 15, 20)
    NY = RY + 160
    s.raw(f'<rect x="40" y="{NY}" width="1520" height="56" rx="8" fill="{ROBE}"/>')
    s.text(64, NY + 35, 'No money on outcomes.', 18, 'sg800', PAD)
    s.text(64 + tw('No money on outcomes.', 'sg800', 18) + 14, NY + 35,
           'No refund, credit or reward for winning an appeal, no penalty for losing one. The only refund is technical: if the appeal transaction fails.', 15, 'sg500', DOCKET)
    LY = NY + 90
    s.H = LY + 214
    s.legend(40, LY, 900, extra=[('stamp', 'Stamp: compares with the tier below'), ('newseat', 'Seat added at this tier')], cols=3, base=('cmd', 'step'))
    tblock(s, 970, LY, 'D3 Appeal ladder')
    s.save('appeal-ladder.svg')


def never_icon(s, cx, cy, r=8):
    s.raw(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{MUTED}" stroke-width="2"/><line x1="{cx-r*.7:.1f}" y1="{cy+r*.7:.1f}" x2="{cx+r*.7:.1f}" y2="{cy-r*.7:.1f}" stroke="{MUTED}" stroke-width="2"/>')


def d4():
    s = Sheet(4, 'Data boundary', 'What data exists, how it is classified, and where each piece is allowed to live.', 1700)
    # ---------- class definitions ----------
    defs = [('pub', 'PUBLIC-ON-CHAIN', 'Anyone can read it, forever. It cannot be erased from the chain. Only what both sides agreed to make public, with nothing that identifies a person.'),
            ('conf', 'CONFIDENTIAL', 'Lives in the relayer database. Operator access only. Never put in a transaction, never sent to GenLayer.'),
            ('secret', 'SECRET', 'Never leaves the relayer. Stored as a hash or in the secrets vault, never logged, never on-chain, never in a webhook.')]
    cw = (1520 - 40) / 3
    for i, (k, h, b_) in enumerate(defs):
        x = 40 + i * (cw + 20); y = 160
        fill = {'pub': PADTINT, 'conf': TINT, 'secret': ROBE}[k]
        fg = DOCKET if k == 'secret' else INK
        s.raw(f'<rect x="{x}" y="{y}" width="{cw}" height="132" rx="8" fill="{fill}" stroke="{ROBE}" stroke-width="2"/>')
        if k == 'secret': s.raw(f'<rect x="{x}" y="{y}" width="{cw}" height="132" rx="8" fill="url(#hatchw)"/>')
        s.tag(x + 18, y + 18, h, 'plain' if k == 'secret' else k, 14)
        s.lines(x + 18, y + 72, wrap(b_, 'sg500', 16, cw - 36), 16, 22, 'sg500', fg)
    # ---------- matrix ----------
    cols = ['Client device', 'Relayer', 'GenLayer chain', 'Twitch', 'Payment provider']
    owners = ['each user', 'VERDICT operator', 'no single party', 'Twitch', 'processor']
    MX, MW = 600, 960
    cwid = MW / 5
    TY = 340
    # column heads
    for i, (c, o) in enumerate(zip(cols, owners)):
        x = MX + i * cwid
        if c == 'GenLayer chain':
            s.raw(f'<rect x="{x}" y="{TY}" width="{cwid}" height="__MH__" fill="{PADTINT}"/>')
        s.text(x + cwid / 2, TY + 30, c, 16, 'sg800', INK, 'middle')
        s.text(x + cwid / 2, TY + 50, o, 13, 'sg700i', MUTED, 'middle')
    s.text(40, TY + 30, 'Data item', 16, 'sg800')
    s.text(40, TY + 50, 'and what it contains', 13, 'sg700i', MUTED)
    s.raw(f'<rect x="40" y="{TY+64}" width="1520" height="2" fill="{INK}"/>')
    H, V, X = 'hold', 'hash', None
    rows = [
        ('pub', [('Rubric', 'preset key or custom text', [H, H, H, X, X]),
                 ('Takes', 'up to 280 characters each, normalised', [H, H, H, X, X]),
                 ('Handles', 'the name each side chose; never a full name', [H, H, H, H, X]),
                 ('Provenance', 'submitted by participants, or by the host', [H, H, H, X, X]),
                 ('Receipt digest', 'sha256 of the case package', [H, H, H, X, X]),
                 ('Verdict', 'juror votes, split, scores, reason, tier history', [H, H, H, H, X]),
                 ('Transaction hash and status', 'PENDING to FINALIZED', [H, H, H, X, X]),
                 ('client_ref', 'random idempotency key, carries no identity', [X, H, H, X, X])]),
        ('conf', [('Consent and 18+ records', 'who agreed, and when', [H, H, X, X, X]),
                  ('Rejected submissions', 'moderation failures are never broadcast', [H, H, X, X, X]),
                  ('Credit balance and appeal usage', 'free appeal used today, credit left', [X, H, X, X, X]),
                  ('Prediction and channel IDs', 'to lock, resolve or cancel', [X, H, X, H, X]),
                  ('Callback URLs and referral tags', 'webhook targets, ref links for K-factor', [H, H, X, X, X])]),
        ('secret', [('Side tokens', 'one per side; proves who may appeal', [H, V, X, X, X]),
                    ('API keys', 'developer access', [H, V, X, X, X]),
                    ('Twitch OAuth tokens', 'issued by Twitch to the relayer', [X, H, X, H, X]),
                    ('Payment IDs', 'customer and charge references', [X, H, X, X, H]),
                    ('IP addresses', 'rate limits only', [X, H, X, X, X]),
                    ('Relayer wallet key', 'signs transactions, pays gas', [X, H, X, X, X])]),
    ]
    y = TY + 66
    RH = 46
    for k, items in rows:
        name = {'pub': 'PUBLIC-ON-CHAIN', 'conf': 'CONFIDENTIAL', 'secret': 'SECRET'}[k]
        y += 12
        s.tag(40, y + 4, name, k, 13)
        y += 36
        for (item, note, cells) in items:
            s.raw(f'<rect x="40" y="{y}" width="1520" height="1" fill="{INK}" opacity=".18"/>')
            s.text(40, y + 21, item, 15, 'sg800')
            s.text(40, y + 39, note, 13, 'sg500', MUTED)
            for i, c in enumerate(cells):
                cx = MX + i * cwid + cwid / 2; cy = y + RH / 2
                if c == H:
                    fill = {'pub': PAD, 'conf': TINT, 'secret': ROBE}[k]
                    st = {'pub': INK, 'conf': READ, 'secret': ROBE}[k]
                    s.raw(f'<rect x="{cx-30}" y="{cy-12}" width="60" height="24" rx="12" fill="{fill}" stroke="{st}" stroke-width="1.6"/>')
                    s.text(cx, cy + 5, 'holds', 13, 'sg800', DOCKET if k == 'secret' else INK, 'middle')
                elif c == V:
                    s.raw(f'<rect x="{cx-44}" y="{cy-12}" width="88" height="24" rx="12" fill="#fff" stroke="{ROBE}" stroke-width="1.6" stroke-dasharray="4 3"/>')
                    s.text(cx, cy + 5, 'hash only', 13, 'sg800', INK, 'middle')
                elif i == 2:
                    never_icon(s, cx, cy)
            y += RH
    s.raw(f'<rect x="40" y="{y}" width="1520" height="2" fill="{INK}"/>')
    MH = y - TY
    s.el = [e.replace('__MH__', str(MH)) for e in s.el]
    # the chain boundary
    bx = MX + 2 * cwid
    s.raw(f'<rect x="{bx-3}" y="{TY}" width="6" height="{MH}" fill="{INK}"/>')
    # allow-list callout
    s.raw(f'<path d="M{bx} {TY-2} l-9 -14 h18 Z" fill="{INK}"/>')
    s.text(bx - 14, TY - 8, 'Chain boundary: the case packager allow-list.', 13, 'sg800', INK, 'end')
    s.text(bx + 14, TY - 8, 'Only PUBLIC-ON-CHAIN rows cross it.', 13, 'sg800', INK, 'start')
    # notes
    NY = y + 34
    notes = [('Receipt number', 'The digest is computed over the public fields only, so anyone can recompute it from the chain and match the card.'),
             ('Consent first', 'Nothing is broadcast until both sides tick: “My take becomes public on GenLayer and can’t be erased from the chain.”'),
             ('Withdrawal', 'A side can withdraw before FINALIZED. The card is never published, but anything already broadcast stays on-chain.')]
    nw = (1520 - 40) / 3
    for i, (h_, b_) in enumerate(notes):
        x = 40 + i * (nw + 20)
        s.raw(f'<rect x="{x}" y="{NY}" width="{nw}" height="118" rx="8" fill="#fff" stroke="{INK}" stroke-width="2"/>')
        s.text(x + 18, NY + 32, h_, 17, 'sg800')
        s.lines(x + 18, NY + 58, wrap(b_, 'sg500', 15, nw - 36), 15, 20)
    LY = NY + 150
    s.H = LY + 180
    s.legend(40, LY, 900, extra=[('tag:pub', 'Public on-chain: holds'), ('tag:conf', 'Confidential: holds'), ('tag:secret', 'Secret: holds'),
                                ('hashonly', 'Stores only a SHA-256 hash'), ('nevericon', 'Never on-chain'), ('chainline', 'Chain boundary')], cols=3, base=())
    tblock(s, 970, LY, 'D4 Data boundary')
    s.save('data-boundary.svg')


def d5():
    s = Sheet(5, 'Viral loop', 'Every case needs an opponent, and every verdict makes a card. Two loops, measured separately.', 1500)
    nodes = [('Argue', 'Two people disagree in a chat or a comment thread.'),
             ('Invite', 'A writes a take. The link carries B’s own side token: “Their case is sealed.”'),
             ('Opponent joins', 'B answers before seeing A’s take. 24 hours, or a no-show card.'),
             ('Jury', 'Five juror personas reveal one by one. The network checks.'),
             ('Card', '9:16 verdict card with its receipt. One tap to post.'),
             ('Appeal', 'The losing side only: 7 jurors, then 9.'),
             ('Second card', 'UPHELD or OVERTURNED, linked back to card one.'),
             ('New users', 'Viewers with their own argument tap “Settle yours”.')]
    NW, G = 262, (1520 - 4 * 262) / 3
    TOPY, BOTY = 270, 580
    N = []
    for i, (h_, b_) in enumerate(nodes):
        col = i if i < 4 else 7 - i
        x = 40 + col * (NW + G)
        y = TOPY if i < 4 else BOTY
        N.append(s.node(x, y, NW, h_, b_, kind='pub' if i in (4, 6) else 'proc', h=118))
    ev = ['case_created, invite_sent', 'invite_opened', 'opponent_signed_up', 'verdict_viewed', 'appeal_filed', 'appeal verdict', 'card2_shared', 'signup: card_link']
    for i in range(3):
        a_, b_ = N[i], N[i + 1]
        s.arrow([(a_['r'], a_['cy']), (b_['x'], b_['cy'])], 'cmd', width=3)
        s.label((a_['r'] + b_['x']) / 2, a_['cy'] - 26, ev[i], step=i + 1, anchor='middle', size=13, maxw=150)
    for i in range(4, 7):
        a_, b_ = N[i], N[i + 1]
        s.arrow([(a_['x'], a_['cy']), (b_['r'], b_['cy'])], 'cmd', width=3)
        s.label((a_['x'] + b_['r']) / 2, a_['cy'] - 26, ev[i], step=i + 1, anchor='middle', size=13, maxw=150)
    # turns
    s.arrow([(N[3]['cx'], N[3]['b']), (N[4]['cx'], N[4]['y'])], 'cmd', width=3)
    s.label(N[3]['cx'] - 12, (N[3]['b'] + N[4]['y']) / 2, ev[3], step=4, anchor='end', size=13)
    s.arrow([(N[7]['cx'], N[7]['y']), (N[0]['cx'], N[0]['b'])], 'cmd', width=3)
    s.label(N[7]['cx'] + 12, (N[7]['y'] + N[0]['b']) / 2, ev[7], step=8, size=13)
    # K_opp loop above
    ky = TOPY - 70
    s.arrow([(N[2]['cx'], N[2]['y']), (N[2]['cx'], ky), (N[0]['cx'] + 40, ky), (N[0]['cx'] + 40, N[0]['y'])], 'event', width=2.6)
    # K_card loop below
    cy_ = BOTY + 118 + 70
    s.arrow([(N[4]['cx'], N[4]['b']), (N[4]['cx'], cy_), (N[7]['cx'] + 40, cy_), (N[7]['cx'] + 40, N[7]['b'])], 'event', width=2.6)
    s.arrow([(N[6]['cx'], N[6]['b']), (N[6]['cx'], cy_)], 'event', width=2.6, end=False)
    def diamond(x, y, txt, sub):
        s.raw(f'<path d="M{x} {y-22} L{x+22} {y} L{x} {y+22} L{x-22} {y} Z" fill="{PAD}" stroke="{INK}" stroke-width="2.6"/>', s.top)
        s.label(x + 30, y, '', anchor='start')
        w = tw(txt, 'sg800', 18)
        s.top.append(f'<rect x="{x+28}" y="{y-16}" width="{w + tw(sub, "sg500", 14) + 30}" height="32" rx="4" fill="{DOCKET}"/>')
        s.text(x + 34, y + 6, txt, 18, 'sg800', layer=s.top)
        s.text(x + 34 + w + 12, y + 5, sub, 14, 'sg500', MUTED, layer=s.top)
    mid = (N[0]['cx'] + 40 + N[2]['cx']) / 2
    diamond(mid - 120, ky, 'K_opp', 'the opponent is now a user, and starts cases of their own')
    mid2 = (N[7]['cx'] + 40 + N[4]['cx']) / 2
    diamond(mid2 - 120, cy_, 'K_card', 'card_shared: posted cards bring viewers who settle their own')
    # centre band
    s.text(800, (TOPY + 118 + BOTY) / 2 + 10, 'K_total = K_opp + K_card', 30, 'sg800', INK, 'middle')
    s.text(800, (TOPY + 118 + BOTY) / 2 + 40, 'counted by weekly signup cohort, never all-time', 15, 'sg700i', MUTED, 'middle')
    # measurement panel
    PY = cy_ + 70
    blocks = [('K_opp, the opponent loop', 'Cases created per new user, times the share of opponents who are new signups, times the completion rate.'),
              ('K_card, the broadcast loop', 'Cards posted publicly per new user, times installs per posted card. Second cards count.'),
              ('Cycle time', 'Median minutes from case_created to opponent_signed_up. Shorter beats higher.'),
              ('Attribution', 'Every link carries ref and case IDs. Signups are tagged opp_invite, card_link, tiktok_bio, streamer, or genlayer.')]
    bw = (1520 - 3 * 20) / 4
    for i, (h_, b_) in enumerate(blocks):
        x = 40 + i * (bw + 20)
        s.raw(f'<rect x="{x}" y="{PY}" width="{bw}" height="128" rx="8" fill="#fff" stroke="{INK}" stroke-width="2"/>')
        s.raw(f'<path d="M{x+26} {PY+18} l10 10 l-10 10 l-10 -10 Z" fill="{PAD}" stroke="{INK}" stroke-width="1.8"/>')
        s.text(x + 46, PY + 34, h_, 16, 'sg800')
        s.lines(x + 18, PY + 62, wrap(b_, 'sg500', 15, bw - 36), 15, 20)
    TY_ = PY + 156
    s.raw(f'<rect x="40" y="{TY_}" width="1520" height="168" rx="8" fill="#fff" stroke="{INK}" stroke-width="2"/>')
    s.text(64, TY_ + 34, 'Targets', 18, 'sg800')
    s.text(64, TY_ + 58, 'From marketing/viral-playbook.md.', 13, 'sg700i', MUTED)
    s.text(64, TY_ + 78, 'Sustained K above 1 is rare.', 13, 'sg700i', MUTED)
    hdr = ['Milestone', 'K_opp', 'K_card', 'K_total', 'Cycle time']
    rows = [('Launch week, honest goal', '0.25', '0.05', '0.30', 'under 24h'), ('Week 4', '0.35', '0.10', '0.45', 'under 12h'), ('Week 8, stretch', '0.45', '0.25', '0.70', 'under 6h')]
    cx_ = [420, 760, 900, 1040, 1220]
    yy = TY_ + 34
    for j, h_ in enumerate(hdr):
        s.text(cx_[j], yy, h_, 14, 'sg800', MUTED)
    for r_ in rows:
        s.raw(f'<rect x="420" y="{yy+12}" width="1116" height="1" fill="{INK}" opacity=".25"/>')
        yy += 40
        for j, v in enumerate(r_):
            s.text(cx_[j], yy, v, 16, 'sg800' if j == 3 else 'sg500')
    LY = TY_ + 200
    s.H = LY + 180
    s.legend(40, LY, 900, extra=[('measure', 'Measurement point'), ('tag:pub', 'A shareable card')], cols=3, base=('cmd', 'event', 'step'))
    tblock(s, 970, LY, 'D5 Viral loop')
    s.save('viral-loop.svg')


def money(s, pts, label=None, at=None, anchor='start', dotted=False):
    s.arrow(pts, 'event' if dotted else 'cmd', width=3.2)
    if label:
        x, y = at
        w = tw(label, 'sg800', 13) + 40
        x0 = x if anchor == 'start' else x - w / 2 if anchor == 'middle' else x - w
        s.top.append(f'<rect x="{x0:.1f}" y="{y-14}" width="{w:.1f}" height="28" rx="14" fill="#fff" stroke="{INK}" stroke-width="1.6"/>')
        s.top.append(f'<circle cx="{x0+15:.1f}" cy="{y}" r="9" fill="{PAD}" stroke="{INK}" stroke-width="1.6"/>')
        s.text(x0 + 15, y + 4.5, '$', 12, 'sg800', INK, 'middle', layer=s.top)
        s.text(x0 + 30, y + 5, label, 13, 'sg800', INK, layer=s.top)


def d6():
    s = Sheet(6, 'Revenue flow', 'People pay for services. Nothing anyone pays or receives depends on how a verdict comes out.', 1700)
    ZT = 172
    rows = [
        ('Settle It players', 'Anyone 18+ who lost a case.', 'Appeal credits',
         '1 free appeal a day, then $1.99 for the Appeals Court and $4.99 for the Supreme Court. Sold in packs of $4.99, $11.99 and $24.99. No cash value, spent only on appeals.', 'packs'),
        ('Friend groups', 'Regulars, roommates, Discord servers.', 'Subscriptions',
         'Court Pass $4.99 a month or $39 a year. Group Court $9.99 a month, shared appeal credit, up to 25 people.', 'monthly'),
        ('Streamers', 'Twitch channels running Live Court.', 'Live Court tiers',
         'Free, 10 contests a month. Pro $14.99 a month, auto-resolves Predictions. Studio $49 a month, live appeals. Viewers never pay.', 'monthly'),
        ('Sponsors', 'Brands buying a sponsored case.', 'Sponsor packages',
         'Bailiff $250 per stream, Docket $900 a month, Season $3,500 a quarter, Supreme Sponsor from $5,000. Prizes are separate.', 'invoice'),
        ('Developers', 'Apps, n8n workflows, MCP agents.', 'Developer API',
         'Verified judgment $0.25 a call, 20 free a month. Team $49 a month. Quick judgment $0.01 is roadmap, labeled not network-checked.', 'metered'),
    ]
    mA = s.mark()
    PA, PB = [], []
    y = ZT + 52
    for (payer, pdesc, prod, pdet, how) in rows:
        pb = s.node(400, y, 470, prod, pdet, kind='proc', bsize=15)
        pa = s.node(64, pb['cy'] - 46, 246, payer, pdesc, h=92)
        PA.append(pa); PB.append(pb)
        y = pb['b'] + 26
    s.under(mA, s.zone, 40, ZT, 294, y - ZT + 4, 'Who pays', 'customers, all 18+')
    s.under(mA, s.zone, 376, ZT, 518, y - ZT + 4, 'What they buy', 'VERDICT pricing')
    # payment provider + revenue
    CX = 940
    mC = s.mark()
    pp = s.node(CX + 24, ZT + 52, 270, 'Payment provider', 'Web checkout for packs, subscriptions and tiers. Metered billing for the API, invoiced monthly. Card fee 2.9% + $0.30, which is why appeals are sold in packs.', kind='ext', h=PB[2]['b'] - ZT - 52)
    rev = s.node(CX + 24, pp['b'] + 40, 270, 'VERDICT revenue', 'Operator account. Never paid out to players.', kind='store')
    cost = s.node(CX + 24, rev['b'] + 40, 270, 'Costs', 'GenLayer gas, paid by the relayer wallet for every case, whatever the result. Model and hosting costs.')
    s.under(mC, s.zone, CX, ZT, 1560 - CX, cost['b'] + 30 - ZT, 'Payment provider and VERDICT', 'processor, then operator')
    for pa, pb in zip(PA, PB):
        s.arrow([(pa['r'], pa['cy']), (pb['x'], pa['cy'])], 'cmd')
    for i, (pb, r_) in enumerate(zip(PB, rows)):
        yy = min(max(pb['cy'], pp['y'] + 30), pp['b'] - 30) if i < 3 else None
        if i < 3:
            money(s, [(pb['r'], pb['cy']), (pp['x'], pb['cy'])], r_[4], ((pb['r'] + pp['x']) / 2, pb['cy']), 'middle')
    # sponsors invoice + API metered go into payment provider bottom via a bus
    bx = pp['x'] - 30
    for pb, r_ in ((PB[3], rows[3]), (PB[4], rows[4])):
        money(s, [(pb['r'], pb['cy']), (bx, pb['cy']), (bx, pp['b'] - 24), (pp['x'], pp['b'] - 24)], None)
        s.label(pb['r'] + 10, pb['cy'] - 18, r_[4], size=13)
    money(s, [(pp['cx'], pp['b']), (pp['cx'], rev['y'])], 'net of fees', (pp['cx'] + 10, (pp['b'] + rev['y']) / 2))
    money(s, [(rev['cx'], rev['b']), (rev['cx'], cost['y'])], 'pays', (rev['cx'] + 10, (rev['b'] + cost['y']) / 2))
    # sponsor revenue share back to streamers
    money(s, [(PB[3]['x'], PB[3]['cy'] + 20), (360, PB[3]['cy'] + 20), (360, PA[2]['cy'] + 16), (PA[2]['r'], PA[2]['cy'] + 16)], None, dotted=True)
    s.label(300, (PA[2]['b'] + PA[3]['y']) / 2, '50 to 60% of the fee', anchor='end', size=13)

    # ---------- the wall ----------
    WY = max(y, cost['b'] + 30) + 150
    s.raw(f'<rect x="40" y="{WY}" width="1520" height="6" fill="{INK}"/><rect x="40" y="{WY+12}" width="1520" height="2" fill="{INK}"/>')
    sx, sy = 800, WY + 8
    sw = tw('NO MONEY ON OUTCOMES', 'bs900', 46, 4) + 56
    s.raw(f'<g transform="rotate(-3 {sx} {sy})"><rect x="{sx-sw/2}" y="{sy-36}" width="{sw}" height="72" rx="8" fill="{DOCKET}" stroke="{STAMP}" stroke-width="6"/>'
          f'<text x="{sx+2}" y="{sy+17}" text-anchor="middle" class="b9" font-size="46" fill="{STAMP}" letter-spacing="4">NO MONEY ON OUTCOMES</text></g>')
    s.used['bs900'] += 'NO MONEY ON OUTCOMES'
    s.text(40, WY - 16, 'Every money arrow stays above this line.', 15, 'sg800')
    s.text(1560, WY - 16, 'Below it: what a verdict decides, and what it never moves.', 15, 'sg800', INK, 'end')
    # ---------- outcome side ----------
    OZ = WY + 80
    mO = s.mark()
    ow = (1520 - 48 - 3 * 20) / 4
    outs = [('Verdict', 'The JudgeRouter contract has no payable methods. Every transaction is sent with value 0.', 'contract'),
            ('UPHELD or OVERTURNED', 'No refund, credit or reward for winning an appeal. No charge or penalty for losing one.', 'proc'),
            ('Twitch Prediction', 'Channel Points only, which have no cash value. Never Bits or paid currency.', 'ext'),
            ('Sponsor prizes', 'Paid by the sponsor, fixed in advance, free to enter, passed straight through. Under $5,000 a contest; counsel first.', 'ext')]
    ON = []
    for i, (h_, b_, k) in enumerate(outs):
        ON.append(s.node(64 + i * (ow + 20), OZ + 52, ow, h_, b_, kind=k, h=150))
    s.under(mO, s.zone, 40, OZ, 1520, ON[0]['b'] + 26 - OZ, 'Outcomes', 'decided by the network, worth nothing in money')
    # the one allowed crossing: technical refund
    rn = s.node(400, WY - 136, 470, 'Technical refund only', 'If an appeal transaction fails, the free appeal or credit goes back to the ledger. Never because of the result.', h=88, bsize=14)
    s.arrow([(480, ON[1]['y']), (480, rn['b'])], 'event', width=2.6)
    s.label(490, (OZ + ON[1]['y']) / 2 + 6, 'transaction failed', size=13)
    LY = ON[0]['b'] + 70
    s.H = LY + 180
    s.legend(40, LY, 900, extra=[('money', 'Money moves'), ('stamp', 'The outcome boundary'), ('contract', 'Intelligent Contract'), ('ext', 'External')], cols=3, base=('zone', 'cmd', 'event'))
    tblock(s, 970, LY, 'D6 Revenue flow')
    s.text(40, LY - 18, 'Prices are recommendations from business/monetization.md, marked there as assumptions to validate.', 13, 'sg700i', MUTED)
    s.save('revenue-flow.svg')


# =====================================================================================
def d7():
    """Both security games, from paste or attempt to card. Sources: marketing/security-games-playbook.md
    sections 2, 3 and 8; docs/DECISIONS.md ADR-013 (Quick Verdict), ADR-014, ADR-015, ADR-018."""
    s = Sheet(7, 'Game flows', 'Red Flag Court and Jailbreak the Jury: where each step runs, where text is hidden, and the one path to a public record.', 1600)
    def lane_title(y, t, sub):
        s.text(40, y, t, 34, 'bs900')
        s.text(40 + tw(t, 'bs900', 34) + 16, y - 2, sub, 15, 'sg700i', MUTED)
    def h(a, b, y=None, **k):
        yy = y if y is not None else a['cy']
        s.arrow([(a['r'], yy), (b['x'], yy)], **k)
    def v(a, b, x=None, **k):
        xx = x if x is not None else a['cx']
        s.arrow([(xx, a['b']), (xx, b['y'])], **k)

    # ================= A. Red Flag Court =================
    lane_title(168, 'A. Red Flag Court', 'Quick Verdict, off-chain, no receipt, no appeals. The message never goes on-chain; an opt-in pattern record can (Sheet 8).')
    ZA = 222
    m = s.mark()
    a1 = s.node(64, ZA + 46, 252, 'Paste the message', 'Up to 1,000 characters. Court is 18+. 10 checks a day.')
    a2 = s.node(64, a1['b'] + 40, 252, 'Browser redaction', 'Phones, emails, handles, names, companies hidden. Links removed whole and never opened. Card, SSN, password removed.')
    a3 = s.node(64, a2['b'] + 40, 252, 'Preview and approve', 'Tap any word to hide it. Unticked box: send the cleaned-up version. Only the cleaned text leaves.')
    s.under(m, s.zone, 40, ZA, 300, a3['b'] + 26 - ZA, 'Player’s device', 'the player')
    m = s.mark()
    RX = 380
    b1 = s.node(RX + 26, ZA + 46, 236, 'Relayer redaction', 'redact.ts runs again before moderation and the model call. Redact, don’t reject.')
    b2 = s.node(RX + 26, b1['b'] + 40, 236, 'Help-line check', 'Threats, extortion, self-harm: no ruling, no card. Shows the 988 help line.', kind='ghost')
    b3 = s.node(RX + 300, ZA + 46, 236, 'Quick Verdict', 'Five juror personas, one run, off-chain. No validators, no chain write. Rail: Submitted, Jury scoring, Done.', kind='secret', badge='Off-chain only')
    b4 = s.node(RX + 574, ZA + 46, 220, 'Post-checks in code', 'Any Scam vote blocks LOOKS LEGIT. Money, investment, crypto: SUS or SCAM. Flags from the 16 fixed codes.')
    b5 = s.node(RX + 574, b4['b'] + 40, 220, 'Kept after the response', 'Ruling and flag codes only. Message text is not kept.', kind='store')
    s.under(m, s.zone, RX, ZA, 820, max(b2['b'] + 130, b5['b'] + 26, b3['b'] + 26) - ZA, 'VERDICT relayer', 'VERDICT operator',
            never='Opened links. The message after the response. Any on-chain post.', never_w=236, never_pos='bottom')
    m = s.mark()
    CX = 1240
    c1 = s.node(CX + 24, ZA + 46, 272, 'Ruling card', 'SCAM, SUS or LOOKS LEGIT (never green), vote line, top 3 flags, one juror line. Quick Verdict, not network-checked.')
    c2 = s.node(CX + 24, c1['b'] + 40, 272, 'Warn someone', '1:1 share. Landing: “Someone sent you this to warn you.”', kind='ghost')
    s.under(m, s.zone, CX, ZA, 320, max(c2['b'] + 26, b2['b'] + 26) - ZA, 'Share card', 'the player chooses')
    ZAb = max(c2['b'] + 26, b2['b'] + 130, a3['b'] + 26, b5['b'] + 26)

    v(a1, a2); s.step(a1['cx'] + 24, (a1['b'] + a2['y']) / 2, 1)
    v(a2, a3); s.step(a2['cx'] + 24, (a2['b'] + a3['y']) / 2, 2)
    s.arrow([(a3['r'], a3['cy']), (RX - 14, a3['cy']), (RX - 14, b1['cy']), (b1['x'], b1['cy'])], 'cmd')
    s.step(RX - 14, (b1['cy'] + a3['cy']) / 2, 3)
    v(b1, b2); s.label(b1['cx'] + 8, (b1['b'] + b2['y']) / 2, 'flagged', size=13)
    h(b1, b3, b1['y'] + 40); s.step((b1['r'] + b3['x']) / 2, b1['y'] + 18, 4)
    h(b3, b4, b3['y'] + 40); s.step((b3['r'] + b4['x']) / 2, b3['y'] + 18, 5)
    v(b4, b5, b4['x'] + 40, style='event')
    s.arrow([(b4['r'], b4['y'] + 40), (c1['x'], b4['y'] + 40)], 'cmd'); s.step((b4['r'] + c1['x']) / 2, b4['y'] + 18, 6)
    v(c1, c2, style='event')
    redact_mark(s, a2['r'] - 22, a2['y'], 'R1')
    redact_mark(s, b1['r'] - 22, b1['y'], 'R2')
    redact_mark(s, c1['r'] - 22, c1['y'], 'R3')

    # ================= B. Jailbreak the Jury =================
    YB = ZAb + 92
    lane_title(YB, 'B. Jailbreak the Jury', 'All daily play runs in the practice court. Only opted-in, bench-caught finalists ever reach a public network (ADR-015).')
    ZB = YB + 54
    m = s.mark()
    p1 = s.node(64, ZB + 46, 252, 'Write an attempt', 'Weekly case with a secret rule. Up to 280 characters, 10 a day (3 for new accounts). Unticked consent.')
    s.under(m, s.zone, 40, ZB, 300, p1['b'] + 26 - ZB, 'Player’s device', 'the player')
    m = s.mark()
    d1 = s.node(RX + 26, ZB + 46, 236, 'Door check', 'Relayer blocklist. No juror reads it, no chain is touched.')
    d2 = s.node(RX + 26, d1['b'] + 40, 236, 'Stopped at the door', 'CAUGHT card. No split, no bench. Roast labelled “Tiff’s take on your attempt”.')
    d3 = s.node(RX + 26, d2['b'] + 40, 236, 'Blocked', 'Breaks the rules of play. No score, no card.', kind='ghost')
    s.under(m, s.zone, RX, ZB, 270, d3['b'] + 26 - ZB, 'Relayer', 'VERDICT operator')
    m = s.mark()
    PX = RX + 290
    j1 = s.node(PX + 20, ZB + 46, 236, 'Jury scoring', 'Same judge_router.py and contractCodeDigest as real cases, on a private localnet.', kind='contract')
    j2 = s.node(PX + 20, j1['b'] + 40, 236, 'Caught by the bench', 'CAUGHT card with the real 5–0 split and the five seats.')
    j3 = s.node(PX + 20, j2['b'] + 40, 236, 'Hall of Contempt', 'Fridays. Separate Hall opt-in, handles only, staff pick on stated criteria.')
    j4 = s.node(PX + 20, j3['b'] + 40, 236, 'Replay against the testnet config', 'Run again in the practice court first. Anything that gets through goes to the patch queue.')
    k1 = s.node(PX + 316, ZB + 46, 226, 'OVERRULED or MISTRIAL', 'Fair argument, rule held. Or checks disagreed: the attempt is refunded.', kind='ghost')
    k2 = s.node(PX + 316, k1['b'] + 40, 226, 'SEALED', 'Got through, or moved even one juror. Never shown, never Hall-eligible.', kind='secret')
    k3 = s.node(PX + 316, k2['b'] + 40, 226, 'Patch queue', 'Private. The text stays sealed until the fix ships.', kind='store')
    k4 = s.node(PX + 316, k3['b'] + 40, 226, 'PATCHED card', 'Stamp after the fix ships, never green. “Credited to @handle” only with opt-in.')
    nl = wrap('Any write to a public network. Player text outside the red-team store.', 'sg500', 14, 226 - 46)
    nh = s.never_box(k4['x'], k4['b'] + 24, 226, nl)
    PB = max(j4['b'] + 26, k4['b'] + 24 + nh + 20) - 92
    s.under(m, s.zone, PX, ZB, 564, PB + 92 - ZB, 'Practice court', 'VERDICT operator, private localnet')
    m = s.mark()
    TX = PX + 590
    t1 = s.node(TX + 24, j4['y'] - 120, 252, 'Re-run opt-in', 'Separate, unticked: the text becomes public and permanent.')
    t2 = s.node(TX + 24, t1['b'] + 120, 252, 'Testnet re-run', 'GenLayer test network re-runs the whole jury. A trick has to work every time.', kind='pub')
    t3 = s.node(TX + 24, t2['b'] + 40, 252, 'Hall card with receipt', '“Re-checked on GenLayer testnet” and a VR- receipt. The only game card that has one.', kind='pub')
    s.under(m, s.zone, TX, t2['y'] - 46, 300, t3['b'] + 26 - (t2['y'] - 46), 'Testnet', 'no single party', tone='chain')
    ZBb = max(PB + 92 + 44, t3['b'] + 26)

    s.arrow([(p1['r'], d1['y'] + 40), (d1['x'], d1['y'] + 40)], 'cmd'); s.step((p1['r'] + d1['x']) / 2, d1['y'] + 18, 1)
    v(d1, d2); s.label(d1['cx'] + 8, (d1['b'] + d2['y']) / 2, 'blocklist hit', size=13)
    s.arrow([(d1['x'] + 30, d1['b']), (d1['x'] + 30, d1['b'] + 14), (d1['x'] - 12, d1['b'] + 14), (d1['x'] - 12, d3['cy']), (d3['x'], d3['cy'])], 'cmd')
    s.label(d1['x'] - 4, (d2['b'] + d3['y']) / 2, 'out of order', size=13)
    s.arrow([(d1['r'], d1['y'] + 40), (j1['x'], d1['y'] + 40)], 'cmd'); s.step((d1['r'] + j1['x']) / 2, d1['y'] + 18, 2)
    v(j1, j2); s.label(j1['cx'] + 8, (j1['b'] + j2['y']) / 2, 'all five caught it', step=3, size=13)
    s.arrow([(j1['r'], j1['y'] + 40), (k1['x'], j1['y'] + 40)], 'cmd')
    s.arrow([(j1['r'], j1['b'] - 24), (k1['x'] - 14, j1['b'] - 24), (k1['x'] - 14, k2['cy']), (k2['x'], k2['cy'])], 'cmd')
    v(j2, j3, style='event'); s.label(j2['cx'] + 8, (j2['b'] + j3['y']) / 2, 'nominated', step=4, size=13)
    v(j3, j4); s.label(j3['cx'] + 8, (j3['b'] + j4['y']) / 2, 'finalist', step=5, size=13)
    v(k2, k3); v(k3, k4, style='event'); s.label(k3['cx'] + 8, (k3['b'] + k4['y']) / 2, 'fix ships', size=13)
    gx = (j4['r'] + k3['x']) / 2
    s.arrow([(j4['r'], j4['y'] + 30), (gx, j4['y'] + 30), (gx, k3['cy']), (k3['x'], k3['cy'])], 'cmd')
    s.label(gx, (j4['y'] + 30 + k3['cy']) / 2, 'got through', anchor='middle', size=13, maxw=64)
    cyy = PB + 92 + 30
    s.arrow([(j4['x'] + 40, j4['b']), (j4['x'] + 40, cyy), (TX - 18, cyy), (TX - 18, t1['cy']), (t1['x'], t1['cy'])], 'cmd')
    s.label(j4['x'] + 60, cyy, 'clean replay', step=6, size=13)
    v(t1, t2, t1['r'] - 24); s.label(t1['r'] - 32, (t1['b'] + t2['y'] - 46) / 2, 'player opts in', step=7, anchor='end', size=13)
    v(t2, t3, t2['r'] - 24); s.step(t2['r'] - 50, (t2['b'] + t3['y']) / 2, 8)
    redact_mark(s, j2['r'] - 22, j2['y'], 'R4')
    redact_mark(s, k2['r'] - 22, k2['y'], 'R5')

    # ---------- redaction key ----------
    KY = ZBb + 44
    keys = [('R1', 'Browser hides personal details before anything leaves the device.'),
            ('R2', 'Relayer redacts again before moderation and the model call.'),
            ('R3', 'Red Flag cards never show the message, the sender or anything redacted.'),
            ('R4', 'Caught cards show the trick as an ink bar (strikethrough only for public categories).'),
            ('R5', 'Sealed text is never shown anywhere; PATCHED cards keep it as a bar.')]
    s.text(40, KY, 'Redaction points', 16, 'sg800')
    for i, (k, t) in enumerate(keys):
        col, row = i % 2, i // 2
        x, y = 40 + col * 780, KY + 34 + row * 32
        redact_mark(s, x + 22, y - 5, k, layer=s.el)
        s.text(x + 52, y, t, 14, 'sg500')
    LY = KY + 34 + 3 * 32 + 20
    s.H = LY + 200
    s.legend(40, LY, 900, extra=[('contract', 'Same contract as real cases'), ('store', 'Private store'), ('tag:secret', 'Private, never shown'),
                                ('tag:pub', 'Public on the test network'), ('ghost', 'No card or no ruling'), ('redact', 'Redaction point')],
             cols=3, base=('zone', 'never', 'cmd', 'event', 'step', 'badge'))
    s.title_block(970, LY, 590, [('Sheet', 'D7 Game flows'), ('Product', 'Red Flag Court, Jailbreak the Jury'),
                                 ('Revision', f'r1, {TB_DATE}'), ('Source', 'diagrams/source/build.py')])
    s.save('game-flows.svg')


# =====================================================================================
def d8():
    """Every point where VERDICT creates an on-chain GenLayer decision. Source: docs/DESIGN-genlayer-fit.md v1
    (sections 1, 2 and 4), marketing/security-games-playbook.md (Hall re-run, weekly testnet re-check)."""
    s = Sheet(8, 'GenLayer decisions', 'Every point where VERDICT asks the network for a decision, what triggers it, and what never does.', 1600)
    ZT = 176
    rows = [
        # group, trigger (device), gate (relayer), decision (network), network tag
        ('Settle It', ('Tap Publish', 'Either side, on a finished Quick Verdict (the private preview).'),
         ('Both sides consent', 'Notice publish-onchain-v1. Waits for the other side. Free: VERDICT pays, 3 a day per user.'),
         ('Publish: Tier 1 re-hearing', '5 jurors plus validator agreement, via open_case_package. Its ruling replaces the preview.'), 'Target network'),
        (None, ('Appeal 1', 'Losing side only, after publishing. Unpublished cases cannot appeal.'),
         ('Daily free appeal or $1.99', 'Checked by the payment provider before the call. Max 2 appeals.'),
         ('Tier 2: Appeals Court', '7 jurors plus validator agreement. Card: UPHELD or OVERTURNED.'), 'Target network'),
        (None, ('Appeal 2', 'Losing side again, after Tier 2.'),
         ('$4.99', 'Same payment check. This is the last appeal.'),
         ('Tier 3: Supreme Court', '9 seats plus validator agreement. Final. Case closed.'), 'Target network'),
        ('Jailbreak the Jury', ('Hall finalist opts in', 'Separate unticked consent: the text becomes public and permanent.'),
         ('Clean replay first', 'Replayed in the practice court. Anything that gets through goes to the patch queue instead.'),
         ('Hall of Contempt re-run', 'The whole jury re-runs on the test network. Card gets a VR- receipt.'), 'Testnet'),
        (None, ('Self-chosen re-check', 'A player picks one caught attempt. 1 a week, resets Monday.'),
         ('Re-check opt-in', 'Unticked: “I understand. Make it public.” Same clean-replay rule.'),
         ('Jailbreak re-check', 'Re-run on the test network. A trick has to work every time.'), 'Testnet'),
        ('Red Flag Court', ('Tap “Help warn others”', 'After a SCAM or SUS ruling only. Off by default. 5 a day per user.'),
         ('Pattern record', 'Redacted twice, then an abstract summary of 200 characters or fewer. No message, sender, user id or hash.'),
         ('pattern_ledger: new record', 'Validators agree: no personal data, brand, link, number or amount, AND a coherent scam pattern. Else [REJECTED].'), 'Shadow until counsel'),
        (None, ('Same pattern again', 'A later opt-in whose codes and category match a stored pattern.'),
         ('Dedup proposal', 'The leader proposes “same as id N”; validators check the proposal.'),
         ('pattern_ledger: sighting', 'The existing record’s sightings count goes up by 1. No new record.'), 'Shadow until counsel'),
    ]
    X1, W1, X2, W2, X3, W3 = 64, 300, 432, 380, 900, 456
    NH, PITCH, GAP_G = 112, 140, 40
    y = ZT + 70
    placed = []
    for g, a, b, c, net in rows:
        if g:
            if placed: y += GAP_G
            placed.append(('group', g, y))
            y += 30
        placed.append(('row', (a, b, c, net), y))
        y += PITCH
    ZB = y - PITCH + NH + 30
    s.zone(40, ZT, 348, ZB - ZT, 'Player’s device', 'the player')
    s.zone(408, ZT, 428, ZB - ZT, 'VERDICT relayer', 'VERDICT operator')
    s.zone(876, ZT, 684, ZB - ZT, 'GenLayer', 'no single party', tone='chain')
    n = 0
    for kind, v, yy in placed:
        if kind == 'group':
            s.text(X1, yy + 4, v, 22, 'bs900')
            continue
        (a, b, c, net) = v
        n += 1
        na = s.node(X1, yy, W1, a[0], a[1], h=NH)
        nb = s.node(X2, yy, W2, b[0], b[1], h=NH)
        nc = s.node(X3, yy, W3, c[0], c[1], kind='contract', h=NH)
        s.tag(1544, yy + 10, net, 'pub', 12, anchor='end')
        s.arrow([(na['r'], na['cy']), (nb['x'], nb['cy'])], 'cmd')
        s.arrow([(nb['r'], nb['cy']), (nc['x'], nc['cy'])], 'cmd')
        s.step((nb['r'] + nc['x']) / 2, nb['cy'] - 22, n)
    # what comes back out, and what never becomes a decision
    OY = ZB + 56
    s.text(40, OY, 'What the decisions feed', 16, 'sg800')
    outs = [('Published card', '“Checked by GenLayer · Finalized”, receipt VR-. “The network overruled the preview” when the winner changes.'),
            ('Appeal cards', 'UPHELD or OVERTURNED, same footer and a new receipt.'),
            ('Hall and re-check cards', '“Re-checked on GenLayer testnet” with a VR- receipt, marked Proof.'),
            ('Scams going around digest', 'top_patterns_since feeds the weekly digest. Footer: Recorded on GenLayer · Proof tab.')]
    ow = (1520 - 3 * 20) / 4
    ob = 0
    for i, (t, b) in enumerate(outs):
        nn = s.node(40 + i * (ow + 20), OY + 18, ow, t, b, kind='pub', h=110)
        ob = nn['b']
    NY = ob + 40
    nl = wrap('Quick Verdict previews · Red Flag rulings and message text · daily Jailbreak play, door checks and practice court '
              '· SEALED attempts · unpublished cases (they cannot be appealed: “Appeal” means “Publish first”).', 'sg500', 14, 1000 - 46)
    nh = max(44 + len(nl) * 19, 120)
    s.raw(f'<rect x="40" y="{NY}" width="1000" height="{nh}" rx="6" fill="#fff" stroke="{INK}" stroke-width="1.5"/>')
    s.raw(f'<circle cx="60" cy="{NY+21}" r="9" fill="none" stroke="{INK}" stroke-width="2.2"/><line x1="53.7" y1="{NY+27.3}" x2="66.3" y2="{NY+14.7}" stroke="{INK}" stroke-width="2.2"/>')
    s.text(78, NY + 26, 'Never a GenLayer decision', 14, 'sg800')
    s.lines(78, NY + 48, nl, 14, 19)
    mw = 1520 - 1000 - 20
    s.raw(f'<rect x="1060" y="{NY}" width="{mw}" height="{nh}" rx="6" fill="{ROBE}"/>')
    s.text(1080, NY + 34, 'Key metric', 15, 'sg800', PAD)
    s.text(1080, NY + 70, 'On-chain decisions per week', 24, 'bs900', DOCKET)
    s.text(1080, NY + 96, f'= the sum of steps 1 to {n}, counted every time.', 14, 'sg500', DOCKET)
    LY = NY + nh + 36
    s.H = LY + 180
    s.legend(40, LY, 900, extra=[('contract', 'A GenLayer decision (validators must agree)'), ('tag:pub', 'Where it runs (public, permanent)')], cols=3, base=('zone', 'cmd', 'step'))
    s.title_block(970, LY, 590, [('Sheet', 'D8 GenLayer decisions'), ('Product', 'Settle It, Jailbreak the Jury, Red Flag Court'),
                                 ('Revision', f'r1, {TB_DATE}'), ('Source', 'diagrams/source/build.py')])
    s.save('genlayer-decisions.svg')


if __name__ == '__main__':
    which = sys.argv[1:] or ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8']
    for w in which:
        globals()[w]()
