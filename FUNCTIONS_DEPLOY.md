# Deploying the challenge push function

The function is written, compiles, and is committed. It is **not deployed** —
that needs a billing decision only you can make.

## What is blocking

```
Error: Your project repchamp-14f78 must be on the Blaze (pay-as-you-go) plan
to complete this command. Required API cloudbuild.googleapis.com can't be
enabled until the upgrade is complete.
```

Cloud Functions cannot run on Spark at all, so there is no way around this
short of the client-side workaround the design deliberately rejected (see the
comment at the top of `functions/src/index.ts` — a duel has nowhere to publish
a push token that would not also hand it to strangers).

## What it would cost

Effectively nothing at your scale, but read this rather than take my word:

- Blaze includes the **same free tier** as Spark, then charges beyond it.
- Cloud Functions free tier: **2M invocations/month**. One challenge sent is
  one invocation.
- The function does two small Firestore reads and one HTTPS POST. No polling,
  no scheduled work, no idle cost — v2 functions scale to zero.
- `maxInstances: 10` is set in the code, which caps a runaway loop at ten
  concurrent containers rather than letting it scale indefinitely.

The real risk on Blaze is not this function; it is leaving something else
running by accident. Set a **budget alert** when you upgrade:

Firebase Console → ⚙ → Usage and billing → Details & settings → **Set budget
alert** (e.g. $5/month). It emails you; it does not hard-stop billing.

## Upgrading and deploying

1. https://console.firebase.google.com/project/repchamp-14f78/usage/details
2. Upgrade to **Blaze**, attach a card, set the budget alert above.
3. Then:

```bash
firebase deploy --only functions
```

First deploy takes a few minutes — it enables `cloudbuild` and
`artifactregistry`, builds a container, and creates the Firestore trigger.

## Confirming it works

```bash
firebase functions:log --only challengeOnCreate
```

Send a challenge from one account to another and watch for `challenge push
sent`. The other lines are all deliberate and tell you something specific:

| Log line | Meaning |
|---|---|
| `challenge push skipped: no usable token` | Target never granted notification permission, or has not opened the app since it was added |
| `challenge push suppressed: target blocked host` | Working as intended |
| `expo rejected challenge push` | Token went stale — `DeviceNotRegistered` is the usual `error` field |

## If you decide not to upgrade

Nothing breaks. Challenges still arrive through the in-app inbox poller in
`useIncomingDuelCount.ts` — a 45-second poll that only runs while the target
has the app open. The function is what makes a challenge reach a closed phone.

The alternative that needs no Blaze plan is publishing push tokens onto mutual
friend edges, the same trick couples use. It only covers people who have added
each other, so QR and matchmaking duels stay silent — which is why it was not
the first choice.
