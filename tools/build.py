#!/usr/bin/env python3
"""Assembles dist/ from the engine build (tools/build-engine.sh -> build/engine/) and web/.

  1. build/engine/eduke32.js, eduke32.wasm, eduke32.data: checked (the .data must be the stock
     shareware DUKE3D.GRP, and eduke32.js must not eval anything) and copied as they are.
  2. web/ (the page, credits, license texts) is copied over as-is.
  3. dist/_headers gets the Content-Security-Policy, with hashes for the page's inline scripts
     and its one inline event handler computed from the built page.
Upstream's eduke32-net.js (online play) and grp-manifest.json are not part of this build.

usage: python3 tools/build.py
"""
import base64
import hashlib
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENGINE = ROOT / "build" / "engine"
DIST = ROOT / "dist"
GRP_SHA256 = "f943d0c2e2a0803a644a2107c81ea897dec87596d9dd1a6a432131ad6f5818d6"  # Duke Nukem 3D shareware 1.3D DUKE3D.GRP
CSP = ("default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
       "script-src 'self' 'wasm-unsafe-eval' 'unsafe-hashes' {hashes} https://static.cloudflareinsights.com; "
       "connect-src 'self' https://cloudflareinsights.com; media-src 'self' blob:; "
       "base-uri 'self'; form-action 'self'; frame-ancestors 'self'")


def csp_hashes(html):
    """'sha256-...' sources for every inline <script> body and on*="..." handler in the page."""
    bodies = re.findall(r"<script>(.*?)</script>", html, re.S)
    if len(bodies) != len(re.findall(r"<script\b(?![^>]*\bsrc=)", html)):
        sys.exit("index.html: an inline <script> with attributes; csp_hashes() doesn't handle that")
    bodies += re.findall(r"\son[a-z]+=\"([^\"]*)\"", html)
    return " ".join("'sha256-" + base64.b64encode(hashlib.sha256(b.encode()).digest()).decode() + "'"
                    for b in bodies)


def main():
    files = {n: ENGINE / n for n in ("eduke32.js", "eduke32.wasm", "eduke32.data")}
    if not all(f.exists() for f in files.values()):
        sys.exit("no engine build in build/engine/; run tools/build-engine.sh first")
    built = files["eduke32.wasm"].stat().st_mtime
    newer = [f for d in ("engine", "patches") for f in (ROOT / d).iterdir() if f.stat().st_mtime > built]
    if newer:
        sys.exit(f"{newer[0].relative_to(ROOT)} changed after the engine build; run tools/build-engine.sh")
    if hashlib.sha256(files["eduke32.data"].read_bytes()).hexdigest() != GRP_SHA256:
        sys.exit("eduke32.data is not the stock shareware DUKE3D.GRP")
    js = files["eduke32.js"].read_text()
    if "eval(" in js or "new Function" in js:
        sys.exit("eduke32.js evaluates strings; was it linked with engine/csp_run_script.js?")

    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir()
    for f in sorted((ROOT / "web").iterdir()):
        if f.is_file():
            shutil.copy2(f, DIST / f.name)
    hashes = csp_hashes((DIST / "index.html").read_text())
    (DIST / "_headers").write_text(f"/*\n  Content-Security-Policy: {CSP.format(hashes=hashes)}\n  X-Robots-Tag: noindex\n")
    for name in ("eduke32.data", "eduke32.js", "eduke32.wasm"):  # wasm last: its mtime marks the build
        shutil.copyfile(files[name], DIST / name)
    size = sum(f.stat().st_size for f in DIST.iterdir())
    print(f"dist/: {len(list(DIST.iterdir()))} files, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
