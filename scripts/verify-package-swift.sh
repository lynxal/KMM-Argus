#!/usr/bin/env bash
# Checks that Package.swift's binaryTarget checksum is the SHA-256 of the asset
# its own url points at. That is the one property SPM actually verifies, and the
# one :verifyVersionPins cannot check: the value is the hash of a zip CI has not
# built yet at the time the version is bumped.
#
# Passes quietly when the asset is not there yet. That is the normal state
# between bumping argus.version and cutting the release -- and, because Maven
# Central needs a manual Publish and then mirror time, that window is not short.
# Failing during it would train everyone to ignore this check.
#
# What it does catch: a release cut and then step 7 forgotten, so Package.swift
# on main names the new asset while hashing the old one. SPM reports that as an
# opaque checksum mismatch, which is what 1.0.1 shipped with until it was fixed.
#
# Usage:  scripts/verify-package-swift.sh [path/to/Package.swift]
# Exit:   0 pass or not-yet-released, 1 mismatch or malformed

set -euo pipefail

MANIFEST="${1:-Package.swift}"

if [[ ! -f "$MANIFEST" ]]; then
    echo "FAIL: $MANIFEST not found" >&2
    exit 1
fi

url=$(sed -n 's/.*url:[[:space:]]*"\([^"]*\)".*/\1/p' "$MANIFEST" | head -1)
checksum=$(sed -n 's/.*checksum:[[:space:]]*"\([^"]*\)".*/\1/p' "$MANIFEST" | head -1)

if [[ -z "$url" || -z "$checksum" ]]; then
    echo "FAIL: could not read url and checksum from $MANIFEST." >&2
    echo "      Found url='$url' checksum='$checksum'. Has binaryTarget changed shape?" >&2
    exit 1
fi

echo "url:      $url"
echo "checksum: $checksum"

# Shape is :verifyVersionPins' job, but this script also runs on a schedule
# where that task is not invoked, so it must not silently compare garbage.
if [[ ! "$checksum" =~ ^[0-9a-f]{64}$ ]]; then
    echo "FAIL: checksum is not 64 lowercase hex characters." >&2
    exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# One GET, following redirects. `tail -c 3` because curl emits %{http_code} once
# per transfer and -L makes each redirect hop a transfer -- a GitHub release URL
# redirects to objects.githubusercontent.com, so a bare %{http_code} yields
# something like "302200" and no comparison against "200" can ever be true.
#
# curl's own exit status is kept separate from the HTTP status on purpose: a
# timeout or DNS failure must not be reported as a checksum mismatch. This check
# runs on a schedule, and a flaky network crying "SPM is broken" is how a useful
# check turns into one nobody reads. Retried, then treated as inconclusive.
status=""
rc=1
for attempt in 1 2 3; do
    set +e
    status=$(curl -sL --max-time 120 --retry 2 --retry-delay 3 \
        -o "$tmp/asset.zip" -w '%{http_code}' "$url" | tail -c 3)
    rc=$?
    set -e
    [[ $rc -eq 0 ]] && break
    echo "  curl exit $rc on attempt $attempt; retrying" >&2
    sleep 5
done

if [[ $rc -ne 0 ]]; then
    echo "SKIP: could not reach the asset (curl exit $rc) after 3 attempts." >&2
    echo "      Network problem, not a checksum problem. Nothing was verified." >&2
    exit 0
fi

if [[ "$status" == "404" ]]; then
    echo "SKIP: asset not published yet (HTTP 404). Normal before the release is cut."
    exit 0
fi

if [[ "$status" != "200" ]]; then
    echo "FAIL: asset URL returned HTTP $status. Expected 200, or 404 if unreleased." >&2
    exit 1
fi

# swift package compute-checksum is a plain SHA-256 of the file, so these agree
# with it and the script stays runnable on a machine with no Swift toolchain.
if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$tmp/asset.zip" | awk '{print $1}')
else
    actual=$(shasum -a 256 "$tmp/asset.zip" | awk '{print $1}')
fi

if [[ "$actual" != "$checksum" ]]; then
    echo "FAIL: checksum does not match the hosted asset." >&2
    echo "      Package.swift: $checksum" >&2
    echo "      hosted asset:  $actual" >&2
    echo "      SPM will refuse to resolve this package. If a release was just cut," >&2
    echo "      this is release checklist step 7 -- paste the hosted value above into" >&2
    echo "      Package.swift's binaryTarget and commit to main." >&2
    exit 1
fi

echo "OK: checksum matches the hosted asset."
