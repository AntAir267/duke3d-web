#!/bin/sh
# Builds Duke3D for the web.
#   ./build.sh          engine (tools/build-engine.sh) + dist/ (tools/build.py)
#   ./build.sh ship     the same, then put it on thegrandpricks.com/games/duke3d/ through the site
#                       repo's tools/ship-game.py (commit here first; it refuses uncommitted work)
set -e
cd "$(dirname "$0")"
target=${1:-web}

case $target in
web)
    tools/build-engine.sh
    python3 tools/build.py
    ;;
ship)
    "$0" web
    python3 "${SITE_REPO:-../thegrandpricks}/tools/ship-game.py" duke3d
    ;;
*)
    echo "unknown target $target (web or ship)"; exit 2 ;;
esac
