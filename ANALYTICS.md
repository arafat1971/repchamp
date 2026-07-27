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
| `home_hero_tapped` | hero CTA pressed (`kind`) | `app/(tabs)/index.tsx` |
| `couple_invite_created` | a pair code is minted | `couple-invite.tsx` |
| `couple_paired` | a partner joins (`via: code \| qr`) | `couple-invite.tsx`, `couple-scan.tsx` |
| `couple_nudge_sent` | 👋 nudge tapped | `couple-invite.tsx` |
| `paywall_viewed` | paywall opens (`source`) | `paywall.tsx` |

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
