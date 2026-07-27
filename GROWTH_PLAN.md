# RepChamp — Audit & Revenue Plan

_Written 2026-07-26. Based on an audit of the actual codebase, not aspiration._

## Where the app actually stands

**Strengths (real, keep investing):**
- On-device pose counting — no video ever leaves the phone. A privacy story most
  competitors cannot match. This is the trust anchor and a marketing headline.
- Design quality is genuinely good: coherent token system, Skia glow overlays,
  motion primitives, consistent typography.
- **Couple mode is the differentiator.** A shared streak that only survives if
  *both* partners train is emotionally sticky and inherently viral — the mode
  cannot be used alone, so every activation brings a second install.
- Engineering hygiene is strong: 260 tests, 0 type errors, pure/testable domain
  layer split from services.

**Blocking gaps (ordered by revenue impact):**

| Gap | Reality today | Why it blocks revenue |
|---|---|---|
| **No payments** | `app/modal/paywall.tsx` is a mock — buttons set local state and close. No billing SDK anywhere. | You cannot collect $1, let alone $300K/mo. |
| **No analytics** | Zero events instrumented. | Cannot see activation, retention, or drop-off. Optimising blind is guesswork. |
| **No crash reporting** | None. | Production breakage is invisible. |
| **Weak accounts** | Anonymous auth only. | Lose phone → lose streak, couple bond, history. Kills long-term retention and trust. |
| **Thin personalisation** | Onboarding collects goal/weekly target, then little adapts. | Generic experience → weak D30 retention. |
| **Only 4 exercises** | push, squat, shoulder, stretch | Not enough depth to justify a subscription. |
| **No legal/trust surface** | No privacy policy, no data export/delete. | App Store/Play rejection risk; erodes trust. |

## The honest math on $300K MRR

At ~$8/month, $300K MRR ≈ **37,500 active subscribers**. At an optimistic 4%
free→paid conversion, that implies **~940K active users**. This is a multi-year
outcome for a category-leading app, not a feature checklist. Treat $300K MRR as
the destination; the plan below targets the **first $10K MRR**, which is the only
milestone that actually predicts the rest.

**A note on "2026 trending features":** I have not browsed the web in this
session and my knowledge has a cutoff, so I will not hand you a list of "last
month's trends" dressed up as research — that would be fabrication. Everything
below is grounded in what your codebase lacks and in durable retention/monetisation
mechanics. If you want a live trend scan, say so and I'll research it properly
with sources.

---

## Phase 1 — Make money possible (Weeks 1–2) · MUST DO FIRST

**STATUS (2026-07-26): code-complete.** RevenueCat + real paywall + Pro entitlement
layer + gating (`src/domain/pro.ts`, `src/services/purchases.ts`, `src/state/proStore.ts`,
rewritten `app/modal/paywall.tsx`) ✅. PostHog analytics with a live key + the full funnel
instrumented ✅. Sentry crash reporting ✅. Google sign-in already existed ✅. Remaining =
your store/dashboard setup: `REVENUECAT_SETUP.md` (RevenueCat products + keys) and
`ANALYTICS.md`. Then one native rebuild.

Nothing else matters until you can charge.

1. **Real subscriptions via RevenueCat** (`react-native-purchases`)
   - Wire `paywall.tsx` to actual products; add restore-purchases (Apple requires it).
   - Products: Monthly $7.99 / Annual $39.99 (~58% off, anchors annual) / Lifetime $79.
   - Gate: **couple mode is free** (it's the viral loop — never gate growth).
     Paywall *depth*: full exercise library, form-report history, advanced stats,
     custom programmes.
   - Free trial: 7 days on annual only.
2. **Analytics — PostHog or Amplitude.** Instrument the funnel that matters:
   `onboarding_complete → first_session_started → first_rep_counted →
   first_session_finished → couple_invite_sent → couple_paired → paywall_viewed →
   trial_started → subscribed`. Without this you cannot improve anything.
3. **Crash reporting — Sentry.** Non-negotiable before any real user volume.
4. **Real accounts.** Upgrade anonymous → Google/Apple sign-in (Apple sign-in is
   *required* by App Store if you offer Google). Preserve the anonymous uid on
   upgrade so streaks survive.

## Phase 2 — Earn retention (Weeks 3–6)

**STATUS (2026-07-26): code-complete.** Adaptive programme (`src/domain/programme.ts`,
fixed 4-week ladders) ✅. Exercise library 4→10 (6 new tested analyzers, Pro-gated) ✅.
Couple depth: levels + badges (`coupleLevel`/`coupleBadges` in `couple.ts`, surfaced on
the couple screen) ✅. Weekly recap: couple section + a weekly local push (`scheduleWeeklyRecap`) ✅.


5. **Personalised programme.** Use the onboarding goal + weekly target to generate
   an adaptive 4-week plan; adjust difficulty from actual rep/form history
   (`repCounter` records already capture peak depth, tempo, alignment — the data
   is there, it just isn't used). This is the single biggest D30 lever.
6. **Exercise library → 15–20 movements.** Lunges, plank (time-based), sit-ups,
   burpees, glute bridge, pike push-up, mountain climbers. Your `ExerciseDefinition`
   abstraction already supports adding these cleanly — each is a new analyzer.
7. **Weekly recap + progress.** You have `modal/recap.tsx` — make it a real weekly
   "here's what you two did" moment, push-notified. Emotional payoff drives return.
8. **Couple depth** (lean into the differentiator): couple levels, milestone badges
   ("1,000 reps together"), anniversary moments, a shared calendar heatmap.

## Phase 3 — Growth loops (Weeks 7–10)

9. **Finish the share card as an image.** Currently text-only. Add
   `react-native-view-shot` to render the couple card to PNG → Instagram/WhatsApp.
   Visual shares are the outbound loop.
10. **Deep-link invites.** `repchamp://couple/join?code=XXXX` so a shared link
    opens straight into pairing (QR already exists — this covers remote partners).
11. **Move matchmaking to a Cloud Function.** Currently a documented client-side
    demo with a rules concession. Needed before strangers can safely match.

## Phase 4 — Trust & scale (Weeks 11–12)

12. **Privacy policy + terms + in-app data export/delete.** Store requirement and
    a real trust signal — pair it with your on-device story.
13. **Firebase App Check** to block non-app clients from writing scores.
14. **Server-side XP validation.** The client ceiling in `firestore.rules` is a
    stopgap; leaderboards will be cheated at scale.

---

## What I'd build first, concretely

If you want the highest-leverage next commit: **RevenueCat + real paywall +
PostHog funnel.** That converts the app from a well-built prototype into a
business that can measure and charge. Everything in Phase 2+ is optimisation on
top of a loop you can't currently see or monetise.

## Immediate loose ends (from the last session)

- The `expo-camera` QR-scanner build never completed — needs
  `npx expo prebuild --clean && npm run android` to finish and verify.
- Upload the FCM service-account JSON to Expo (Credentials → Android → FCM V1)
  so push nudges actually deliver.
