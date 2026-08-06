# Release notes — 2.0.0 (versionCode 9)

## For Play Console

Paste this into **Release notes** on the internal-testing release. Play allows 500
characters per language; this is well inside that.

```
Faster, cleaner, and easier to start a set.

• The Train button now suggests what to do next — your usual exercise, an unclaimed
  daily challenge, or a duel waiting on your reply — and shows a badge when
  something needs you.
• Swipe the home banner to browse challenges.
• Invite links now open straight in the app instead of a browser tab.
• Profile pictures now sync properly across devices.
• Sharper spacing, larger tap targets and clearer text throughout.
• Fixed missed reps during fast sets, and a crash that could end a session early.
```

### Shorter variant, if you want one line

```
The Train button now suggests your next set, the home banner swipes, profile
pictures sync properly, and fast reps are counted more reliably.
```

---

## What actually changed (internal — do not paste)

Grouped by what a reviewer or tester would notice.

### Fixes a tester will see
- **Missed reps during fast sets.** The depth smoothing filter lagged the descent
  enough that a genuine rep never crossed the threshold to *start* — it went
  uncounted rather than being graded shallow. Filter retuned and the frame-skip
  ceiling is now derived per exercise.
- **Session crash.** A `SIGSEGV` in a Fabric shadow-tree commit, most likely the
  per-rep mount/unmount of the share-card compositor, which has since been
  removed. Circumstantial rather than proven — the trigger was never captured.
- **Duplicate accounts.** A failed username lookup reported "available", so a
  transient error let two athletes claim the same handle. Two `@champion`
  profiles in production came from exactly this.
- **Avatars were invisible to everyone but their owner.** Firebase Storage was
  never provisioned and needs a paid plan, so every upload failed silently and
  published `avatarUrl: null`. Avatars are now downscaled to 192x192 and stored
  on the profile document — no Storage, no upgrade.
- **The home tile called an unfinished day a regression.** One rep against a
  six-rep day showed a red "-5"; it now reads "5 to go" until the comparison is
  worth making.

### Interface
- Train button: ranked menu, one-tap resume, pending-work badge, locked exercises
  marked before you tap into a paywall.
- Home banner is a real paged carousel — it previously cross-faded on a timer with
  no gesture at all.
- 44pt minimum touch targets (measured on device at 44.2dp, not just in source).
- Spacing and corner radii moved onto a 4pt grid; 565 of 1121 spacing values were
  off-grid, which is what made screens look subtly mismatched.
- Smallest text raised to the design file's 9.5pt floor.
- 26MB of unreferenced assets removed.

### Removed
- The duel/together action-shot photo share. It worked and was verified on device,
  then removed on request. The result card falls back to the avatar, then initials.
  In-app privacy copy and `DATA_SAFETY.md` were corrected to match — they had
  promised an upload that no longer happens.

---

## Added in versionCode 9

- **Invite links open the app.** `assetlinks.json` had been served from
  repchamp.web.app all along, but `app.json` declared no `intentFilters`, so the
  app never claimed the domain and every https invite opened a browser tab. Both
  `/couple/join` and `/@username` now carry `autoVerify`.
- **`/@username` has a route at last.** The website deep-linked to
  `repchamp://modal/add-friend?u=…` while the app had nothing matching that path.
- **One support address.** `repchampapp@gmail.com` is gone from the site; the app,
  privacy policy and terms all point at the same mailbox.
- **Data Safety answers corrected** — they still described Firebase Storage and a
  `duelPhotos/` sweep, neither of which exists since the avatar migration.
  Declarations are unchanged (Photos Yes, Videos No); only the substantiation is.

## Before promoting past internal testing

1. ~~RevenueCat products are not registered~~ — **done 2026-08-02.** Products are
   live and the SDK finds the offering on device. The paywall has still never been
   *seen* rendering with prices; that is item 4 in `TEST_BEFORE_LAUNCH.md`.
2. ~~`app.json` still names the app "RepChamp"~~ — **done.** It is
   "Fitness Duel: RepChamp", matching the listing.
3. **This build has never run on a device.** Everything in `TEST_BEFORE_LAUNCH.md`
   is still unverified on real hardware — rep counting most of all. Internal
   testing is the cheap place to find that out.
4. **App Links only verify from a Play install.** A sideloaded AAB will not
   trigger Android's domain verification, so test invite links from the internal
   track, not a local install. Confirm with:
   `adb shell pm get-app-links gg.repchamp.app` — the domain should read
   `verified`.
