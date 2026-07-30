# RepChamp — Growth & Revenue Roadmap (v2)

Honest plan for turning a well-built app into real revenue. Split into **what's done
in code** and **what needs your business decisions**.

---

## The model (what changed)

**Old:** hard rep wall — pay after 5 push-ups. This is anti-habit and anti-viral; it
converts almost nobody on a new app and generates 1-star reviews.

**New (shipped): habit-first freemium.**
- **Free forever:** push-ups + squats, solo / versus / couple mode. This builds the daily
  habit and powers the invite loop (couple + duel invites = installs).
- **Pro sells depth:** the full exercise library, multi-week programmes, saved history and
  advanced stats. The paywall is an *invitation shown at the point of desire* (tapping a
  Pro exercise), always dismissible — never a trap.
- **Convert on an annual trial**, not a wall.

Why: every fitness app that hit real MRR (Strava, Ladder, Peloton, Fitbod) does freemium +
annual trial, not a hard wall. Let them in, hook them, convert on value.

---

## ✅ Done in code
- Removed the hard rep wall → freemium gate (`src/domain/paywallGate.ts`).
- Paywall is dismissible, leads with the free trial, annual pre-selected as the anchor.
- **"BEST VALUE · SAVE N%"** badge + **per-week price hint** on each plan (auto-computed
  from your real prices once they load).
- **Weekly package auto-supported** — the paywall renders every plan in your offering, and
  already labels WEEKLY/MONTHLY/ANNUAL/LIFETIME. Add a weekly plan in RevenueCat and it
  appears with no code change.
- Viral loop: **shareable "beat me" image card** after every workout (`ResultShareCard`).
- Retention: **🔥 solo streak** chip in the home header; weekly-recap + streak-at-risk
  push notifications already scheduled.

---

## 💵 Pricing to set (YOUR RevenueCat + Play Console steps)

Prices live in the store, not the app — the app displays whatever you configure. Recommended
ladder (tune to your market; these convert well for fitness):

| Plan | Price | Per week | Role |
|---|---|---|---|
| **Weekly** | **$4.99 / week** | $4.99 | The "expensive by design" anchor — makes annual look cheap |
| **Monthly** | **$12.99 / month** | ~$3.00 | Middle option |
| **Annual** | **$49.99 / year** | ~$0.96 | The one you actually want them on — SAVE ~80% vs weekly |

- Add a **7-day free trial** on the annual plan (RevenueCat → the annual product → intro
  offer → 7 days free). The app auto-shows "Start free trial".
- **Entitlement must be named `pro`** (the code checks `PRO_ENTITLEMENT = 'pro'`).
- Steps: Google Play Console → Monetize → Subscriptions → create **`rc_pro_monthly`**
  and **`rc_pro_annual`** (optional weekly later) → activate. RevenueCat → import those
  product IDs, attach entitlement `pro`, put them on the `current` offering. See
  `REVENUECAT_SETUP.md` / `PUBLISH_RUNBOOK.md`.

> Why weekly at $4.99: it's not meant to sell much — its job is to be the reference price
> that makes "$49.99/year" feel like a steal. This is standard pricing psychology.

---

## The path to real MRR (the honest math)

To reach **$100K/month** at ~$50/yr (~$4.15/mo effective): you need **~24,000 active
subscribers**. At a healthy 3–5% free→paid conversion, that's **~500K–800K engaged
installs**. That comes from two engines:

**1. Viral loop (free growth — your edge).** Couple mode and duels are *inherently* viral:
you can't use them alone, so every user invites someone. Make invites and share cards
relentless:
- ✅ share card after every workout (done)
- Next: prompt the couple invite earlier + reward both sides when a partner joins.

**2. Paid acquisition (once the loop + conversion are proven).** Only spend ad money after
you can measure: install → first workout → D1/D7 retention → trial → paid. Your PostHog
funnel already tracks these. Don't buy ads until the funnel converts organically.

---

## What to build next (ranked by revenue impact)

1. **Programmes as the core Pro offering** — "30 days to 50 push-ups". You have the ladder
   logic (`src/domain/programme.ts`); make completing/subscribing to programmes the main
   reason to go Pro. Highest-LTV fitness apps sell *guidance*, not just tracking.
2. **Onboarding → first rep in <30s** — the faster they feel a counted rep, the higher every
   downstream number. Trim any step before the first win.
3. **Reward the invite loop** — give both partners a bonus (XP, a free Pro week) when an
   invite converts. Turns growth into a habit.
4. **Weekly challenges / community** — recurring events drive retention and re-shares.
5. **Coaching / content** (bigger bet) — form tips, guided sessions. This is where the
   "massive money" apps separate from trackers.

---

## What still needs YOU (not code)
- RevenueCat products + prices + `pro` entitlement + 7-day trial (unblocks all revenue).
- App Store / Play listing, screenshots, data-safety form (`PUBLISH_RUNBOOK.md`).
- The decision to spend on ads — only after the organic funnel converts.
- Real Sentry DSN (production crash visibility).

## Bottom line
The product is good and the growth engine (couple/duel + share cards) is real. Revenue now
depends on: **(1) let people in free, (2) grow through the loop, (3) convert on the annual
trial, (4) sell programmes/coaching as the depth.** The code is set up for all four — the
remaining levers are your store/pricing setup and, later, ad spend.
