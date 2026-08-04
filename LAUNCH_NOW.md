# Launch checklist — internal testing first

Everything needed to publish, in order, with the reason each step exists.
Written 2026-08-04 against a green tree: 638 tests, 0 type errors.

The route is **internal testing → verify → promote to production**. Internal
testing review is usually hours; production review is days, and a rejection
restarts that clock. Publishing straight to production means the first person
to run the release binary does so after it is already public.

---

## 1. Register the signing fingerprint  ✅ *done 2026-08-04*

Registered and confirmed on device — the app signs in as a real account, which
is what proves it. `npm run check-signing` reports every fingerprint present.

Kept here because the same trap catches the next keystore: Google Sign-In
fails at *runtime* without this, and the failure names nothing.

The fingerprint that was missing:

```
FE:AE:F1:72:39:57:F2:21:31:62:BD:6D:E6:57:31:72:BB:ED:F0:21
```

Firebase Console → Project settings → Your apps → `gg.repchamp.app` →
**Add fingerprint** → paste → Save → **Download google-services.json** and
replace the one in the repo root.

```bash
open "https://console.firebase.google.com/project/repchamp-14f78/settings/general"
```

Confirm before building — `google-services.json` is read at build time, so a
missing fingerprint means rebuilding:

```bash
npm run check-signing
```

> If `eas credentials -p android --profile production` shows a *different*
> SHA-1, register that one too. The upload key cannot be changed after the
> first Play release without a key-reset request to Google, so it is worth
> being certain now rather than after.

---

## 2. Build a fresh production AAB  ⬜

The existing AAB predates 24 commits. Among them is the fix for a bug where
adding a friend, joining a duel, and matchmaking all failed with
`permission-denied` — shipping that build would ship that bug.

```bash
eas build --platform android --profile production
```

15–25 minutes. Produces a signed `.aab`; `autoIncrement` handles versionCode.

---

## 3. Upload to internal testing  ⬜

Play Console → **Testing → Internal testing** → Create new release → upload
the `.aab`.

Release notes are drafted in `RELEASE_NOTES.md` — paste the block under
"For Play Console".

---

## 4. Fill the store listing  ⬜

Every answer is already worked out, derived from the code rather than guessed.
Paste, do not improvise — a listing that overstates what the app does is the
common cause of both rejections and refund complaints.

| Console section | Source |
| --- | --- |
| Store listing (name, descriptions) | `STORE_LISTING.md` |
| Store settings (category, tags, contact) | `STORE_LISTING.md` § Filling in the Play Console form |
| Data safety | `DATA_SAFETY.md` |
| Content rating + target audience | `CONTENT_RATING.md` |
| App icon | `store/icon-512.png` |
| Feature graphic | `store/feature-graphic.png` |
| Phone screenshots | `store/screenshots/*.png` |

Two that are easy to get wrong:

- **Data safety** — if you submitted this before the duel action-shot feature
  was removed, submit it again. The old answers overstate what is collected.
- **Screenshots** — upload the composited files, not raw captures. Play
  enforces a rule its upload form does not state: the long side may be at most
  twice the short side, and a raw 1080×2400 grab is 2.22×.

---

## 5. Verify on a real install  ⬜

The point of the internal track. Install from Play — not a sideload — and
check the things that have never been seen working:

- **Google Sign-In** completes (step 1 is what makes this possible)
- **Add a friend** succeeds — this was `permission-denied` until `a7f7e50`
- **Profile photo** appears on a second device — needed the rules fix in
  `5898d61`
- **Duel QR**: one phone shows the code, the other scans, both land in the
  same live race
- **A purchase** goes through. This *only* works from a Play track, and only
  for an account added under Setup → Licence testing. `ITEM_UNAVAILABLE` on a
  sideloaded build is expected and is not a bug.

---

## 6. Promote to production  ⬜

Once the above passes: Play Console → Internal testing → **Promote release**
→ Production. Set countries and pricing (the app is free with an in-app
subscription).

Consider a **staged rollout** (start at 20%). It lets you halt on a crash
spike instead of shipping a bad build to everyone at once.

---

## Known gaps at launch

Worth deciding on deliberately rather than discovering later.

- **Two screenshots short.** Three are uploaded, which clears Play's minimum,
  but the two strongest are missing because both need a second person in
  frame: a live session with the pose skeleton, and a couple streak. The
  session shot is the clearest single image of what the app does and should
  lead the listing once it exists. Screenshots move install conversion more
  than any words in the listing.
- **Partly verified on device, as of 2026-08-04.** Google Sign-In works — the
  app signs in as a real account. The FAB hint pill renders, and seeing it
  exposed a layout bug no amount of reading the code would have: it sat beside
  the button, over the Squats card, because the pill is wider than the disc it
  was right-aligned to (`c605599`).

  Still unwatched: the block-check fix, avatar sync between devices, the duel
  QR round trip, and the couple hero card. All tested, rules deployed, none
  seen working. Step 5 is where that changes.

- **Rep counting was broken on the Pixel 7a until `52f5673`.** The
  `android-gpu` delegate there never settles — it does not fail, it waits —
  so the CPU fallback never ran and no session could start. Worth re-checking
  on any device the app has not run on: the fix makes a hang behave like a
  rejection, but the underlying GPU behaviour is the vendor's, not ours.
