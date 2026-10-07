# Pricing setup — exact values to enter (2026-10-04)

Audit of Play Console (read-only, 2026-10-04): one subscription, `rc_pro_monthly`
(base plan `monthly-plan`), ~USD 8.99/month, BDT 1,100 in Bangladesh, **no trial
offer, no yearly plan, no one-time products**. The paywall sorts yearly first and
badges savings/trial, so it currently shows a lone expensive monthly plan.

Nothing below is applied yet. The paywall needs no code change once these exist.

## 1. Play Console → Monetise with Play → Subscriptions

**Monthly** (`rc_pro_monthly` → `monthly-plan` → Set prices)
- USD 4.99. Let Play convert other regions, then override:
- Bangladesh: BDT 299

**Yearly** (Create subscription)
- Product ID: `rc_pro_yearly`, name "Pro Yearly", benefits: full exercise library, form reports, guided programmes
- Base plan ID: `yearly-plan`, Yearly auto-renewing, grace 7 days, resubscribe Allow
- USD 39.99 (about 33% off 12 x 4.99 — the paywall only shows a savings badge when yearly is cheaper per week)
- Bangladesh: BDT 2,499
- Activate the base plan

**Free trial** (on `yearly-plan` → Add offer)
- Offer ID `trial-7d`, eligibility: new customer acquisition, phase: free trial, 7 days
- Activate. The paywall reads trial length from the product, so no copy changes.

## 2. RevenueCat dashboard

- Products → add `rc_pro_yearly:yearly-plan` for the Play app
- Entitlements → `pro` → attach the yearly product (monthly already attached)
- Offerings → the **current** offering → add package Annual -> `rc_pro_yearly`, keep Monthly -> `rc_pro_monthly`
- Check for an orphaned product: REVENUECAT_SETUP.md says "both products" but Play had one.

## 3. Play store listing text

Paste the "Full description" block from STORE_LISTING.md (free section now says
"first 50 reps", Pro is described as an auto-renewing subscription).

## 4. Ship the app copy fix

The in-app copy fix (paywall "Free to start" row, onboarding line) needs a new build
before users see it. Follow RELEASE checklist: deploy rules first, then the AAB.
