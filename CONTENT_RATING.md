# Play Store — Content rating questionnaire answers

Fill **Play Console → App content → Content rating**. Answers below are derived
from what the code actually does, same rule as `DATA_SAFETY.md`: an inaccurate
rating gets the listing pulled after launch, which is worse than a slow one.

Expected outcome: **PEGI 3 / ESRB Everyone / USK 0** or the local equivalent.
Nothing in the app is violent, sexual, or substance-related.

---

## Category

**Health & Fitness** — not "Social", even though the app has social features.
The questionnaire branches on this, and Health & Fitness is the honest fit.

---

## The answers

Almost everything is **No**. The questions that are not are the ones that
matter, so they are listed first with their justification.

### Questions to answer YES

**Does the app allow users to interact or exchange content with other users?**
→ **Yes.**

Athletes see each other's display names on leaderboards, send and accept duel
invites, pair in couple mode, and send nudges. That is user-to-user
interaction even though there is no free-text chat.

**Can users share their personal information with other users?**
→ **Yes** (display name and profile photo are visible to other athletes).

Scoped narrowly: a chosen display name and an optional avatar. No email, no
location, no contact details are ever exposed to another user.

**Does the app share the user's current location with other users?**
→ **No.** The app does not collect location at all.

**Is the app's primary purpose to facilitate user interaction?**
→ **No.** The primary purpose is rep counting; duels are a feature on top.

### Digital purchases

**Does the app offer digital purchases?**
→ **Yes.** RepChamp Pro is an auto-renewing subscription
(`rc_pro_monthly`, `rc_pro_annual`) sold through Google Play Billing.

### Everything else

Answer **No** to all of:

- Violence — realistic, fantasy, or cartoon; blood; gore
- Sexual content, nudity, suggestive themes
- Profanity, crude humour
- Controlled substances — drugs, alcohol, tobacco references
- Gambling, simulated gambling, contests or sweepstakes
- Horror, frightening or disturbing content
- Discrimination or hate content
- User-generated content that is *unmoderated and public* — see the note below
- Ads (the app serves none)

---

## The UGC follow-up, if it appears

Because you answered yes to user interaction, Play may ask what moderation
exists. It does exist, and it is in `src/domain/safety.ts`:

- **Report** — athletes can report a peer, rate-limited to 10 reports per 24h
  and one per target per 24h, so the queue cannot be flooded.
- **Block** — an athlete can block a peer, removing them from their surfaces.
- **Name filtering** — `src/domain/safety.ts` rejects reserved and blocked
  language at the point a display name is chosen, before it can ever reach a
  leaderboard.

Say plainly that there is no free-text chat. It is the strongest answer
available, because the usual UGC risk surface simply does not exist here.

---

## The AI opponents, if asked

Not a rating question, but it comes up in review often enough to prepare for.

The AI partners in `src/domain/phantomRoster.ts` are every one `isAI: true` and
displayed with an AI badge. They are not presented as human, which is what
Play's fake-engagement policy and App Store 3.2.2 actually prohibit. Racing a
clearly labelled bot is legitimate; the listing says so too.

---

## Target audience

**Play Console → App content → Target audience and content.**

Select **18 and over**, or **16+** at the youngest. Reasons to keep it out of
the child bands:

- The app has a subscription, and child-directed apps face far stricter
  billing rules.
- It requests camera access, which triggers additional scrutiny for minors.
- Strenuous exercise carries an injury risk the in-app disclaimer already
  names.

Declaring a child audience would pull the app into Google Play Families policy
and the Designed for Families programme. Nothing about the app needs that, and
it would add review requirements for no gain.

**Do not** tick "appeal to children" — the cartoon icon is stylised branding,
not child-directed design.
