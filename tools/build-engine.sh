#!/bin/bash
# Builds the engine (eduke32.js, eduke32.wasm, eduke32.data) into build/engine/ from the
# eduke32-wasm v0.2.4 source with this repo's patches/ and engine/ JS library, the same way
# upstream's release CI does (.github/workflows/build.yml): Emscripten 6.0.5,
#   make PLATFORM=EMSCRIPTEN EM_SINGLE_FILE=0 NETDUKE32=1
# Emscripten 6.0.5 is installed into build/emsdk/ the first time (about 1 GB), so it never
# touches another emsdk on this machine.
#
# usage: tools/build-engine.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
TAG=v0.2.4
COMMIT=37b56eefaf8125eaa853c417512019cc7ad94b81
EMSDK_VERSION=6.0.5
SRC=build/eduke32-wasm

if [ ! -d build/emsdk ]; then
    git clone -q https://github.com/emscripten-core/emsdk.git build/emsdk
fi
if [ ! -f build/emsdk/.emscripten ] || ! grep -q "$EMSDK_VERSION" build/emsdk/upstream/emscripten/emscripten-version.txt 2>/dev/null; then
    build/emsdk/emsdk install "$EMSDK_VERSION"
    build/emsdk/emsdk activate "$EMSDK_VERSION" --embedded
fi

if [ ! -d "$SRC" ]; then
    git clone -q --branch "$TAG" --depth 1 https://github.com/DigitalCyberSoft/eduke32-wasm.git "$SRC"
fi
[ "$(git -C "$SRC" rev-parse HEAD)" = "$COMMIT" ] || { echo "$SRC is not $TAG ($COMMIT)"; exit 1; }
git -C "$SRC" checkout -q -- .
for p in patches/*.patch; do
    git -C "$SRC" apply --verbose "$ROOT/$p"
done
(cd "$SRC" && sha256sum -c assets/shareware/SHA256SUMS)

rm -f "$SRC/obj/build/rev.o"   # so the "Built <date>" stamp in the log is this build's

# shellcheck disable=SC1091
. build/emsdk/emsdk_env.sh >/dev/null 2>&1
emcc --version | head -1
make -C "$SRC" PLATFORM=EMSCRIPTEN EM_SINGLE_FILE=0 NETDUKE32=1 \
    LDFLAGS="--js-library $ROOT/engine/csp_run_script.js" -j"$(nproc)"

mkdir -p build/engine
cp "$SRC/eduke32.js" "$SRC/eduke32.wasm" "$SRC/eduke32.data" build/engine/
git -C "$SRC" rev-parse HEAD > build/engine/SOURCE
echo "build/engine/: $(du -sh build/engine | cut -f1) from $TAG + $(ls patches | wc -l) patch(es)"
