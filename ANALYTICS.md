# Analytics

Product analytics via **PostHog** (HTTP capture — no native module, no rebuild).

## What's instrumented

The funnel that predicts revenue, end to end:

| Event | Fires when | Where |
|---|---|---|
| `app_opened` | app launch | `app/_layout.tsx` |
| `onboarding_completed` | finish onboarding | _(add when wiring onboarding)_ |
| `session_started` | a set begins | `app/session/index.tsx` |
| `session_finished` | a set ends | `app/session/index.tsx` |
| `home_hero_shown` | the adaptive hero renders (`kind`) | `app/(tabs)/index.tsx` |
| `invite_card_shown` / `invite_card_tapped` / `invite_card_dismissed` | the standing "Train with someone" card for solo athletes renders / its CTA is tapped (`source`: `card`, `rail` or `hydration` — the three Home surfaces that open the invite) / "Not now" is tapped | `app/(tabs)/index.tsx` |
| `home_hero_tapped` | hero CTA pressed (`kind`) | `app/(tabs)/index.tsx` |
| `couple_invite_created` | a pair code is minted | `couple-invite.tsx` |
| `couple_paired` | a partner joins (`via: code \| qr`) | `couple-invite.tsx`, `couple-scan.tsx` |
| `couple_nudge_sent` | 👋 nudge tapped | `couple-invite.tsx` |
| `paywall_viewed` | paywall opens (`source`) | `paywall.tsx` |
| `pro_moment_shown` / `_tapped` / `_dismissed` | peak-moment Pro card on the result screen (`kind`) | `app/session/result.tsx` |
| `annual_offer_shown` / `_tapped` / `_dismissed` / `annual_switched` | monthly → annual switch card in Settings → Subscription | `AnnualUpgradeCard.tsx` |
| `win_back_shown` / `_tapped` / `_dismissed` | lapsed-Pro card on Home (`kind`) | `WinBackCard.tsx` |
| `trial_started` / `subscribed` | purchase succeeded (`plan`, `source`) | `paywall.tsx` |
| `first_rep_counted` | first rep of **a session** | `app/session/index.tsx` |
| `first_rep_ever` | first rep of the athlete's **life** — once, ever | `app/session/index.tsx` |

### The activation funnel

`onboarding_step` (25 named screens) → `onboarding_completed` → **`first_rep_ever`**.

That last step is the one `GROWTH_v2.md` ranks second overall, and until
`first_rep_ever` existed it was not computable: `first_rep_counted` fires on the
first rep of *every* session, so a regular emits it several times a week and it
could never serve as a terminal step or a denominator. The two events are kept
separate rather than merged behind a flag — "did this set start producing reps"
is a real question worth keeping.

The decision lives in `src/domain/activation.ts` (pure, tested); the marker is
an MMKV key, not a `profileStore` field, because it is instrumentation and the
store deliberately does not import analytics.

`home_hero_shown` ÷ `home_hero_tapped`, split by `kind`, gives **hero CTR per
state** — the direct measure of whether the Home redesign works.

## How it's built

`src/lib/analytics.ts`:
- **Typed event catalogue** (`AnalyticsEvents`) — `track()` only accepts known
  events with correct props. New events are added there, not inline, so the data
  can't fragment into mistyped one-off names.
- **Batched HTTP capture** to PostHog's `/batch/` endpoint every 10s (or at 20
  queued events). No native SDK → no rebuild, and swappable for any HTTP-ingest
  provider by editing this one file.
- **No-ops when unconfigured**, exactly like the Firebase services. Instrumenting
  is always safe; the key lights it up with zero call-site changes.

## The one manual step

Set a real PostHog project key so events actually send:

1. Create a free project at <https://posthog.com> (US cloud → `us.i.posthog.com`,
   which `analytics.ts` already targets; change `POSTHOG_HOST` for EU).
2. Copy the **Project API key** (starts `phc_...`).
3. Replace the placeholder in `app.json`:
   ```json
   "extra": { ..., "posthogKey": "phc_YOUR_REAL_KEY" }
   ```
4. `npx expo prebuild --clean` isn't needed (JS-only) — but the value is read from
   `expoConfig.extra` at bundle time, so reload the bundle (or rebuild) after
   changing it.

Until then, every `track()` call is a safe no-op.

## Next (per GROWTH_PLAN.md)

Add `trial_started` and `subscribed` when RevenueCat lands — the catalogue
already declares them, so it's two call sites, not a new integration.


### Pro funnel by source (PostHog → SQL insight)

Which surface earns? One row per paywall `source` — rep wall, form report,
`moment-personal-best`, `moment-streak`, `moment-first-win`, and so on.

```sql
SELECT
  properties.source AS source,
  countIf(event = 'paywall_viewed')    AS views,
  countIf(event = 'paywall_dismissed') AS dismissed,
  countIf(event = 'purchase_cancelled') AS store_cancelled,
  countIf(event = 'subscribed')        AS subscribed,
  round(100 * countIf(event = 'subscribed') / nullIf(countIf(event = 'paywall_viewed'), 0), 1) AS conv_pct
FROM events
WHERE timestamp > now() - INTERVAL 30 DAY
  AND event IN ('paywall_viewed','paywall_dismissed','purchase_cancelled','subscribed')
GROUP BY source
ORDER BY views DESC
```

Moment cards, before the paywall — tap-through per kind:

```sql
SELECT
  properties.kind AS kind,
  countIf(event = 'pro_moment_shown')     AS shown,
  countIf(event = 'pro_moment_tapped')    AS tapped,
  countIf(event = 'pro_moment_dismissed') AS dismissed,
  round(100 * countIf(event = 'pro_moment_tapped') / nullIf(countIf(event = 'pro_moment_shown'), 0), 1) AS tap_pct
FROM events
WHERE timestamp > now() - INTERVAL 30 DAY AND event LIKE 'pro_moment_%'
GROUP BY kind
```

`subscribed` only carries `source` from builds after this change; older rows
group under a null source. Read nothing into a source with fewer than ~50 views.
