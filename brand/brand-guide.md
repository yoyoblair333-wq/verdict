# VERDICT — Brand Guide v0.1

> Five AI jurors. Checked by a network nobody controls. Appeal to a higher court.

VERDICT is the app where two people stop arguing and let a jury of five AI jurors settle it. You each write your take, the jury votes, and you get a verdict card built to be screenshotted, stitched and argued about in the comments.

The audience is TikTok, 18–40, and comes from social video communities. They know group-chat fights, receipts and "be honest, who's wrong here." They do not want wallets, tokens or chain names. GenLayer is the engine underneath and the honest selling point: every verdict is re-checked by a network of independent AIs that nobody controls, and it has a public record. Consumer UI never says blockchain, validator, consensus or gas. Everyone using VERDICT is 18+ at launch.

**What we can and can't claim.** A VERDICT jury is five AI juror *personas*. The verdict is computed inside a GenLayer Intelligent Contract and only stands if GenLayer's independent validators, each running its own AI model, agree with it. Appeals escalate to bigger panels. Say "five AI jurors", "checked by a network nobody controls", "every verdict has a public record". Never say "five different AI models vote", "nobody can rig it", "injection-proof", "no other app can", or "the first"; never name model vendors.

---

## 1. Name

**Recommendation: VERDICT.** It is one word you can shout, it is the noun you share ("look at this verdict"), and it puts the outcome first, which is what people post. It works as a verb in captions ("we got verdicted") and holds up as a brand on a Twitch overlay.

| Candidate | What it gets right | Why it loses |
|---|---|---|
| **Settle It** | Says exactly what the product does. Great as a button. | Reads as a feature, not a brand. **Keep it as the name of the core surface.** |
| **Hung Jury** | Funny, ownable, built-in joke. | Names the one outcome the product never gives (a jury that can't decide), and the double meaning will cause trouble on TikTok's moderation. |
| **Objection!** | Pure courtroom drama, good energy. | It's the protest, not the answer. People share answers. Also heavily tied to an existing game franchise. |

Usage: **VERDICT** in all caps as the wordmark only. In running text write "Verdict" ("Get a Verdict"). Surfaces: **Settle It** (1v1 cases), **Appeals Court** (first appeal, 7 jurors), **Supreme Court** (second and final appeal, 9 jurors), **Live Court** (Twitch).

---

## 2. Voice: courtroom drama meets group chat

The jury talks like your funniest friends wearing robes. Big formal frame, small petty sentences.

| Do | Don't |
|---|---|
| "The court has reviewed the receipts. Jordan, you were wrong in 4K." | "Our AI analysis indicates Party A's position is less supported." |
| "Order in the chat." | "Please wait while we process your request." |
| "Appeal to a higher court" / "Appeal to the Supreme Court" | "Retry with more models" |
| "Overturned. The higher court has seen things." | "Result changed." |
| Plain verbs, sentence case, short | Legal jargon you'd have to look up, crypto words, hashtags in UI |

Rules:
1. Every ruling is one line and under 110 characters. It has to fit on the card at phone size.
2. Rubrics judge takes, never people: "Who's right?", "Better roast", "Pettiest text", "Better comeback". No rubric asks who is toxic, guilty or the worse person, and no stamp declares a person GUILTY. Roasts can't target identity: race, religion, gender, sexuality, disability or body. The jury is petty, not cruel.
3. Use the handle or first name each player chose for themselves. "Sam" is funnier than "Party B." Never print the full real name of anyone, and never name a third party who isn't playing.
4. Courtroom words are for framing (court, ruling, appeal, receipts, the bench). Feelings stay group-chat.
5. On sensitive topics (self-harm, abuse, threats) the jury declines to rule and shows a plain help line. That copy is not funny.

Core copy set: *Summon the jury* · *The jury is deliberating* · *Order in the chat* · *The court rules for {name}* · *Appeal to a higher court* · *Appeal to the Supreme Court* · *Upheld* · *Overturned* · *Case closed*.

---

## 3. Color

The palette comes from the actual objects of a courtroom: the judge's robe, the yellow legal pad, the red rubber stamp, the blue rules on the pad.

| Token | Hex | Role |
|---|---|---|
| `robe` | `#1B1340` | Primary ground. The card background, dark-mode surface, logo seal. A violet-indigo, not black. |
| `robe-deep` | `#120C2E` | Dark-mode page background, overlay panels. |
| `legal-pad` | `#F7E26B` | The takes are written on legal-pad slips. Also the split number and primary button. |
| `stamp` | `#E5242C` | Rubber-stamp red. Only for stamps (WINNER, UPHELD, OVERTURNED) and the pad's margin line. Never for errors or buttons. |
| `docket` | `#F4F6FF` | Paper-white with a cool cast. Light-mode page, text on robe. |
| `rule-blue` | `#8FA8F0` | Legal-pad ruled lines, secondary text on robe, dividers. |
| `ink` | `#1B1340` | Text on paper and pad (same as robe, so the system has one dark). |

Juror colors (each persona owns one; used only for that juror's seat, icon and vote chip):

| Juror | Hex |
|---|---|
| The Judge | `#F4F6FF` |
| The Romantic | `#FF7AA8` |
| The Realist | `#58C4FF` |
| The Petty One | `#B9F24A` |
| The Philosopher | `#B79CFF` |
| The Chief Justice (Appeals + Supreme) | `#F7E26B` |
| The Wildcard (Appeals + Supreme) | `#FF9A3D` |
| The Historian (Supreme only) | `#5FE3C4` |
| The Contrarian (Supreme only) | `#E8B4F8` |

Contrast: all juror colors pass 4.5:1 as text on `robe` (Historian 10.9:1, Contrarian 10.1:1). `legal-pad` on `robe` is 11.9:1. `ink` on `legal-pad` is 11.9:1.

**Game stamp tokens** (ADR-014 item 14, ADR-018 item 4). The security games add two stamp colors beside `stamp` red. **No stamp is ever green**, because green reads as "go" or "safe".

| Token | Hex | Used for | Contrast (WCAG 2.1) |
|---|---|---|---|
| `stamp` | `#E5242C` | SCAM, CAUGHT, PATCHED (and WINNER, UPHELD, OVERTURNED) | 3.8:1 on `robe`, 4.1:1 on `robe-deep`. Passes AA for large text (3:1); stamps are always ≥ 40px Big Shoulders 900. |
| `stamp-amber` | `#FFB020` | SUS | 9.5:1 on `robe`, 10.3:1 on `robe-deep`. AA and AAA at any size. |
| `stamp-amber-ink` | `#8A4B00` | SUS on light surfaces (`docket`, `legal-pad`) | 6.3:1 on `docket`, 5.2:1 on `legal-pad`. AA at any size. |
| `stamp-neutral` | `#C9CFE8` | LOOKS LEGIT, SEALED, OVERRULED, MISTRIAL; "What still to check" chips | 11.2:1 on `robe`, 12.1:1 on `robe-deep`. AA and AAA at any size. |
| `stamp-neutral-ink` | `#1B1340` (= `ink`) | Neutral stamps on light surfaces | 16.0:1 on `docket`, 13.2:1 on `legal-pad`. |

`stamp-amber` sits close to the Wildcard's orange (`#FF9A3D`, 1.2:1 apart), so never put a SUS stamp next to Juno's seat without the word on it; the stamp always carries its word, never color alone. The light-surface `-ink` variants exist because `stamp-amber` and `stamp-neutral` fail on paper (1.7:1 and 1.4:1 on `docket`).

---

## 4. Typography (Google Fonts)

Two families, clearly different.

- **Big Shoulders Display**, weight 900. Condensed, civic, made for Chicago's public signage. Used for the wordmark, the split ("4–1"), stamps and timers. Tight tracking (−0.01em), never below 40px. It's the voice of the court.
- **Schibsted Grotesk**, 500 / 700 / 800, plus 700 italic. A newspaper grotesk built for a news publisher, so it reads as "reported fact." Used for everything people type and every ruling. Rulings are 700 italic, as if read aloud from the bench.

Scale (app, 16px base, ratio ~1.25): 13 / 16 / 20 / 25 / 31 / 39 / 61 / 96.
Card scale (1080×1920): takes 36–40, juror names 26, ruling 46–52, rubric 64, split 300.

No all-caps small labels. All caps is reserved for the wordmark and stamps, because stamps are all caps in real life.

---

## 5. The jury

Five seats, five personalities. Each juror is a persona: a judging lens written into the contract's prompt, so the same five names appear on every card and in the contract's output (`juror_names`). The personas are not separate AI models. The honesty claim is different and stronger: the whole panel's verdict only stands if GenLayer's independent validators, each running its own AI model, re-run it and agree. The persona gives each vote a face and a voice; the network is what keeps it honest.

The ladder: **Verdict** 5 jurors → **Appeals Court** 7 (adds Augustine and Juno) → **Supreme Court** 9 (adds Ines and Rook), final. Up to 2 appeals per case, losing side only.

Icons are flat geometric marks, drawn with simple shapes so they work at 24px and in canvas, and they never use emoji.

| Seat | Name | Icon | Personality | Voice sample | Sits on |
|---|---|---|---|---|---|
| 1 | **The Judge** (Judge Marlowe) | A column: three vertical bars on a base | Procedural, dry, fair. Weighs who is being reasonable and consistent. Breaks no ties with feelings. | "Sustained. Sam stayed on topic. Jordan brought a second argument to the first argument." | All tiers |
| 2 | **The Romantic** (Dahlia) | Two overlapping circles | Reads for feelings, effort and intent. Forgives a lot for sincerity. | "He texted 'happy birthday' with no emoji. That's restraint. That's growth. I'm for him." | All tiers |
| 3 | **The Realist** (Frank) | A square with one line through it (a receipt) | Facts, receipts, logistics. Hates vague claims. | "Show me the timestamps or sit down." | All tiers |
| 4 | **The Petty One** (Tiff) | Tally marks, four bars and a slash | Keeps score. Rewards wit, punishes "k." Loves a comeback. | "Replying 'noted' at 2am is a war crime and I respect it." | All tiers |
| 5 | **The Philosopher** (Theo) | A ring with a dot inside (an orbit) | Zooms out. Asks what this fight is really about. Occasionally sides with nobody, then picks one. | "Is anyone ever really 'just asking'? No. Sam wins." | All tiers |
| 6 | **The Chief Justice** (Augustine) | Three triangles in a row (a crown) | Rarely speaks. Final word. | "This court has seen enough." | Appeals Court, Supreme Court |
| 7 | **The Wildcard** (Juno) | Three diagonal dice pips | Steelmans the underdog first, then decides honestly. The reason an appeal *can* flip, not a thumb on the scale. | "Everyone's being so normal about this. Let me read it again." | Appeals Court, Supreme Court |
| 8 | **The Historian** (Ines) | Three stacked horizontal bars (a stack of case files) | Thinks in precedent. Which take would hold up if this argument came back next month? | "This exact fight happened in 2019. It ended the same way. Sam." | Supreme Court |
| 9 | **The Contrarian** (Rook) | A square rotated 45° (a chess-board diamond) | Questions the obvious answer and only keeps it if it survives. | "Everyone thinks Jordan won. Let's check. ...Fine. Jordan." | Supreme Court |

A seat's persona and lens stay fixed, so the audience gets attached to *Tiff*. Consumer UI never names model vendors. A "How the jury works" sheet can say: "Five AI jurors, each with its own lens, rule on your case. Then a network of independent AIs re-checks the verdict before it stands, and every verdict has a public record. Appeal, and a bigger panel hears it again."

---

## 6. Logo: the seal

The mark is a round court seal in `robe` with a thin `legal-pad` inner ring. Inside, a **V** whose right stroke is a gavel handle, with the banded gavel head at its top. It reads as V for Verdict, as a check mark (a vote), and as a gavel mid-swing. Five `legal-pad` dots curve along the bottom of the ring like seats on a bench, one per Tier 1 juror.

- Minimum size: 24px for the mark, 96px wide for mark + wordmark.
- Clear space: the diameter of one juror dot × 4 on all sides.
- One-color versions: all `robe` on light, all `docket` on dark. The dots stay.
- Never rotate the seal, recolor the dots per juror, or add a halo, gradient or shadow.

Files: `logo.svg` (mark + wordmark, wordmark converted to outlines so it needs no font), `logo-mark.svg` (seal only, for avatars and app icons).

---

## 7. The verdict card (1080×1920)

The card is the product. It has to be readable at 360px wide in a TikTok frame, which is a 1/3 scale, so nothing on it is smaller than 26px at full size.

Top to bottom:
1. Wordmark and case number.
2. Rubric as the headline ("Who's right?").
3. Two legal-pad slips with each take, a red margin line and blue rules. The winning slip gets the red stamp.
4. The split, huge ("4–1"), and who it's for.
5. The ruling: one italic line from the lead juror.
6. The bench: five seats, each juror's icon, name and vote.
7. The appeal bar: "Appeal to a higher court" (Tier 1) or "Appeal to the Supreme Court" (Appeals Court card).
8. The receipt footer (26px, under a thin rule): "Checked by the GenLayer network · Finalized" with a legal-pad check, the receipt number on the right ("Receipt pkg 9f86…0a08", the first and last four hex of the case package's sha256), and the provenance line below it: "Submitted by participants" (Settle It, API) or "Submitted by host" (Live Court). Only a FINALIZED_SUCCESS verdict gets the check and the receipt. Provenance says who typed the takes; it never implies more assurance than that. The browser prototype prints "Simulated in your browser · Not checked by the network" and "No receipt" instead, with an empty ring in place of the check.

The winning slip's stamp always reads **WINNER**: it marks the better take, not a person. There is no GUILTY stamp and no "toxic" rubric.

Appeals Court cards use the same layout with 7 seats and a thin gold rule under the header. Supreme Court cards have 9 seats, a thick gold rule and "Case closed" instead of an appeal bar. Both show an **UPHELD** or **OVERTURNED** stamp across the split, comparing against the verdict just before.

Long takes shrink the slip text (36px down to a 26px floor) rather than pushing the bench off the card.

Files: `verdict-card-template.svg` (placeholders in braces), `card-example-relationship.svg`, `card-example-relationship-appeals.svg` (Appeals Court, 7 seats, UPHELD), `card-example-roast.svg` (Live Court, submitted by host), `card-example-petty.svg`, and `card-example-petty-supreme.svg` (Supreme Court, 9 seats). The SVGs embed subsetted fonts so they render the same everywhere.

> **To regenerate:** run `python3 brand/source/gen.py` (needs `fonttools`). It subsets the fonts in `brand/source/fonts/` (SIL OFL 1.1, licence files alongside) into each card, and prints a warning if a bench would hit the footer. `brand/source/logo.py` rebuilds `logo.svg` and `logo-mark.svg`. `card-example-petty-supreme.svg` is the 9-seat Supreme Court card (final, OVERTURNED). `python3 brand/source/previews.py` rebuilds `previews/cards.png`; `python3 brand/source/app_previews.py` rebuilds the app and overlay previews with the local fonts.

**Network status rail.** The app's deliberation screen, its result screen and the Live Court overlay show four steps: Submitted, Jury scoring, Network checking, Finalized (with a check). It mirrors the relayer's finality watcher: only FINALIZED with SUCCESS lights the last step, and the vote reveal starts only after it, so the reveal never fakes suspense about an undecided result. In the prototype the rail is simulated and says so in a caption under it.

**Consent before the jury.** Each side's slip carries the checkbox "My take becomes public on GenLayer and can't be erased from the chain. I can withdraw before the verdict is final." plus one "We're both 18 or older." box; Summon the jury refuses to run without all three.

Architecture diagrams in the same palette live in `diagrams/` (see its README).

**Security-game cards** (playbook §2, §3, §5; ADR-013 to ADR-018). Same grid, fonts, seal and bench as the verdict card, built by `brand/source/gen_games.py`:

| File | What it is |
|---|---|
| `card-game-redflag-scam.svg` | Red Flag Court, SCAM 5–0, the "Warn someone" variant: headline "Someone sent you this to warn you.", the action line "Don't reply. Don't click. Don't pay." in big type, top 3 flag chips, one Tiff line. All Red Flag cards carry the readable "[DOMAIN]/redflag" CTA, "Or search VERDICT Red Flag" and "We never ask you to log in from this card." |
| `card-game-redflag-sus.svg` | Red Flag Court, SUS 3–2 ("3 Sus · 2 Scam"), amber stamp. |
| `card-game-redflag-legit.svg` | Red Flag Court, LOOKS LEGIT 5–0, neutral stamp, "Nothing jumped out. If money's involved, call them on a number you already have." and two "What still to check" chips. |
| `card-game-jailbreak-door.svg` | Contempt of Court, CAUGHT, stopped at the door. No split, no bench; the juror line is labelled "Tiff's take on your attempt" and "A roast, not a vote". Public-category trick in strikethrough. |
| `card-game-jailbreak-bench.svg` | Contempt of Court, CAUGHT by the bench, real 5–0 split and five seats. Trick as an ink bar. |
| `card-game-jailbreak-patched.svg` | Sealed attempt after the fix: whole trick as ink bars, faded SEALED stamp under "PATCHED — credited to @player". |
| `card-game-jailbreak-sealed.svg` | "You found a hole" trophy: trick category, date, "Patch pending". Never the trick text. |
| `card-game-daily-redflag.svg` | Daily Red Flag "Spot 4 of 5 flags": made-up text thread with numbered flag markers and a "Show my family" button. |
| `card-game-juror-quiz.svg` | "Which juror are you?" result: one juror, three traits, "Take the quiz →". |
| `card-game-hall-of-contempt.svg` | Weekly Hall: three caught fails (Most creative / confident / polite). Only the re-run finalist says "Re-checked on GenLayer testnet" with a `VR-{receipt}` placeholder, labelled "Proof". |
| `trust-hero-try-to-rig-it.svg` | 1600×900 hero for the "Try to rig it." trust page. |

Rules the generator enforces: Red Flag cards never show message text, the sender, anything redacted or a receipt; every Quick Verdict and practice-court card has the empty ring, never the network check; only the testnet re-run line gets the check mark. All handles and examples are invented. `python3 brand/source/gen_games.py && python3 brand/source/previews_games.py` rebuilds the SVGs, a PNG beside each, and `previews/game-cards.png`; the generator stops with an error if content would run into the CTA bar.

---

## 8. Motion: the jury deliberating

The deliberation is the one big motion moment. Everything else in the app barely moves.

1. **Lights down (0–400ms).** The page dims to `robe`. The bench appears with five unlit seats.
2. **Seats light one by one (≈700ms each).** Each juror's ring fills with their color, and a line of status copy names what they're doing ("Tiff is counting the 'k's"). The pacing is uneven on purpose (600, 900, 650, 1100, 750ms) so it feels like thinking, not a loader.
3. **Hush (≈800ms).** All seats lit, a slow pulse on the whole bench, copy reads "Order in the chat."
4. **Votes flip (≈650ms apart).** Each seat flips like a placard to show the name it voted for and a one-line quote. A tally under the bench counts up with a short tick.
5. **The slam.** The split number scales from 1.4 to 1.0 in 180ms with a hard ease-out, the page shakes 2px for 120ms, and the stamp lands rotated −8° with a quick overshoot. Nothing else moves at this moment.
6. **Settle.** The card slides up. Buttons appear last.

Easing: `cubic-bezier(.2,.8,.2,1)` for entrances, `cubic-bezier(.5,0,.75,0)` (hard in) for the slam. No bounce on text.

Reduced motion: skip shakes and scaling, keep the order of reveals with cross-fades at 150ms, and cut total time to under 2 seconds.

Appeals Court: same sequence with 7 seats and a longer hush (1.4s). Supreme Court: 9 seats, hush 1.8s. The UPHELD/OVERTURNED stamp is the slam.

---

## 9. Live Court (Twitch)

The overlay sits in the bottom third and the top-right corner, leaving the streamer's face clear. Contestants on the pad slips left and right, the bench and live tally in the middle, the timer in Big Shoulders. When chat appeals, the header switches to "Appeals Court in session" with a gold rule and the seven-seat bench; a second appeal brings "Supreme Court in session" and nine seats. Viewers back a side with Channel Points (no cash value); the Prediction resolves only once the appeal window has closed or the case is final, so the stream never shows two winners. The background is transparent and every panel is solid `robe-deep`, so it reads on any stream.
