# Live Duel — Two-Person Test Checklist

The one thing automated tests can't cover: **two real people, two phones, both doing
push-ups in a live head-to-head duel**. The real-time sync that carries reps between the
two phones is already proven by automated tests (`src/services/__tests__/duelService.test.ts`
→ "real-time head-to-head competition"). This checklist verifies the last mile — the camera
rep-counting and the live experience — before you publish.

Do this once with a friend. Budget ~10 minutes.

---

## Before you start

- **Two phones**, each with RepChamp installed and signed in as a **different** account.
  (Two Google accounts, or one Google + one anonymous — they must be different users.)
- **Both phones on the internet** (Firebase must be reachable — Wi-Fi or cellular).
- **Enough space** for each person to be fully in-frame doing push-ups (phone propped up,
  camera seeing your whole body from the side).
- Good lighting. Pose detection needs to see you clearly.

Call the two people **A** (the challenger) and **B** (the friend).

---

## Steps

### 1. A challenges B
On **Phone A**:
1. Go to the **Friends** tab (or Arena → "Find an opponent" for the picker).
2. Tap **Duel a friend** / pick B from the list → **Duel**.
3. Choose exercise **Push-Ups** and a duration (start with **20s**).
4. Send the challenge. Phone A now sits in the **waiting room**.

### 2. B accepts
On **Phone B**:
1. A notification / the **bell** on Home shows **1 pending** challenge. Tap it.
   (Or open the **Notifications** screen from the bell.)
2. Tap the incoming challenge from A → **Accept / Join**.
3. Both phones should now enter the **duel session** together (camera opens on each).

> ✅ **Checkpoint 1:** Both phones left the lobby and opened the camera at the same time.
> If B never sees the challenge, check both are signed in as different users and online.

### 3. Race
1. Let the countdown finish on both phones.
2. **Both people do push-ups** at the same time, each in their own camera.
3. Watch each screen's HUD: **your reps** and **your opponent's reps** side by side.

> ✅ **Checkpoint 2 (the key one):** As A does a push-up, **B's screen shows A's rep count
> tick up within about a second** — and vice-versa. This is the real-time competition working.
> A small delay (network latency) is normal; a rep that never appears is not.

> ✅ **Checkpoint 3:** Your own reps count correctly as you do clean push-ups. If counting is
> off, it's a camera/framing issue (angle, lighting, whole body in frame), not the duel.

### 4. Finish
1. When the clock hits zero (or someone taps finish), both phones go to the **result screen**.
2. Both should show the **same winner** — the person with more reps (a forfeit always loses;
   equal reps = draw).

> ✅ **Checkpoint 4:** Both phones agree on the winner and the final scores. XP is awarded to
> the winner. (The winner is computed once, in a transaction, so the two phones can't disagree.)

---

## What "pass" looks like

- [ ] Both phones entered the session together (Checkpoint 1)
- [ ] Each phone showed the **other** person's reps updating live during the race (Checkpoint 2)
- [ ] Each phone counted its **own** reps correctly (Checkpoint 3)
- [ ] Both phones showed the **same** winner and scores at the end (Checkpoint 4)

If all four pass, real-time live competition works end-to-end for real users.

---

## If something's off

| Symptom | Likely cause | Fix |
|---|---|---|
| B never sees the challenge | Same account on both / one offline | Use two different accounts; check internet |
| Opponent reps never move | Network, or one phone lost connection | Check both online; retry on Wi-Fi |
| Reps miscount | Camera framing / lighting | Prop phone to the side, whole body in frame, brighter light |
| Winner differs between phones | Should be impossible (settled in a transaction) | Note it and report — this would be a real bug |

## Notes for scale

- **"Duel a friend"** (targeted) is the path above and works fully client-side.
- **"Find an opponent"** (open queue) pairs two strangers. It works client-side today but is
  the pragmatic demo pairing flagged in `firestore.rules` / `FIREBASE_SETUP.md`; move `tryPair`
  into a Cloud Function before relying on stranger-matchmaking at volume.
