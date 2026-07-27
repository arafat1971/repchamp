#!/usr/bin/env bash
#
# Downloads the MoveNet SinglePose pose-estimation model used for on-device rep
# counting. The model is ~3 MB and is deliberately NOT committed to the repo —
# run this once after cloning, and again if you switch model variants.
#
# One phone tracks one athlete: in couple mode each partner films themselves on
# their own device, so a single-person model is all this app needs. (An earlier
# MultiPose experiment — two people in one frame — was dropped as impractical:
# framing two bodies pushes the phone too far back to see the screen.)
#
# Lightning  : fastest, ~192x192 input. Default; holds 30fps on mid-range phones.
# Thunder    : ~2.5x slower, ~256x256 input, noticeably better on partial occlusion.
#
# Usage:
#   ./scripts/fetch-model.sh            # lightning (default)
#   ./scripts/fetch-model.sh thunder
set -euo pipefail

VARIANT="${1:-lightning}"
DEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/assets/models"
DEST="$DEST_DIR/movenet.tflite"

case "$VARIANT" in
  lightning)
    URL="https://tfhub.dev/google/lite-model/movenet/singlepose/lightning/tflite/int8/4?lite-format=tflite"
    INPUT_SIZE=192
    ;;
  thunder)
    URL="https://tfhub.dev/google/lite-model/movenet/singlepose/thunder/tflite/int8/4?lite-format=tflite"
    INPUT_SIZE=256
    ;;
  *)
    echo "Unknown variant '$VARIANT'. Use 'lightning' or 'thunder'." >&2
    exit 1
    ;;
esac

mkdir -p "$DEST_DIR"
echo "Fetching MoveNet $VARIANT (${INPUT_SIZE}x${INPUT_SIZE}) …"
curl -fSL --retry 3 "$URL" -o "$DEST"

SIZE=$(wc -c < "$DEST" | tr -d ' ')
if [ "$SIZE" -lt 100000 ]; then
  echo "Downloaded file is only ${SIZE} bytes — that is not a valid model. Aborting." >&2
  rm -f "$DEST"
  exit 1
fi

echo "✓ Saved $DEST (${SIZE} bytes)"
echo
echo "If you switched variants, update MODEL_INPUT_SIZE in src/vision/poseDetector.ts to ${INPUT_SIZE}."
