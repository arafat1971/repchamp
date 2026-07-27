#!/usr/bin/env bash
#
# Streams the rep-detection signal while you train.
#
# Shows smoothed depth, movement phase, rep count and tracking state so the
# signal can be checked against what the athlete is actually doing — plus every
# completed rep with its peak depth, duration and alignment:
#
#   [RepChamp] camera frame: rgb-rgba-8-bit 144x176 stride=576 -> 192x192 RGB
#   [pose] depth=0.12 up reps=0 tracking=y conf=0.71
#   [pose] REP 1 peak=0.93 full 1240ms align=0.88
#
# A development build routes console output through Metro, not logcat, so this
# tails Metro rather than `adb logcat`.
#
#   ./scripts/trace-reps.sh metro.log    # tail a captured Metro log
#   ./scripts/trace-reps.sh              # explains how to capture one
#
# Requires POSE_TRACE = true in src/vision/usePoseSession.ts (the default).
set -euo pipefail

FILTER='\[pose\]|\[RepChamp\]'

if [ $# -ge 1 ]; then
  echo "Watching $1 — start a session and begin your set. Ctrl-C to stop."
  tail -f "$1" | grep --line-buffered -aE "$FILTER"
else
  cat <<'MSG'
No log file given.

Console output from a development build appears in the terminal running
`npx expo start` — watch that window while you train and look for lines
beginning with [pose] and [RepChamp].

To capture to a file instead, restart Metro with its output redirected:

    npx expo start --dev-client > metro.log 2>&1 &
    ./scripts/trace-reps.sh metro.log
MSG
fi
