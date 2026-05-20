#!/usr/bin/env bash
# Build the six @atmo-dev/contrail* packages from a sibling fork worktree
# and place the resulting tarballs under vendor/ with stable filenames.
#
# Local: assumes ../contrail-pr30 exists (override with CONTRAIL_DIR).
# Stable names (atmo-dev-contrail.tgz, etc.) let package.json pin paths
# without churn across fork bumps.
#
# vendor/*.tgz are TRACKED in git so CI (deploy-to-dev.yml: npm ci +
# docker build) can resolve the file: deps without a fork checkout.
#
# Regeneration workflow on a fork bump:
#   scripts/prepare-contrail-deps.sh
#   npm install                                     # only touches lockfile entries for the tarballs
#   git add vendor/*.tgz package-lock.json
#   git commit -m "chore(contrail): bump fork pin to <new-sha>"
#
# Drop this script + vendor/ entirely once @atmo-dev/contrail* publish
# to npm (post PR #44 merge).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRAIL_DIR="${CONTRAIL_DIR:-$REPO_ROOT/../contrail-pr30}"

if [[ ! -d "$CONTRAIL_DIR" ]]; then
  echo "error: CONTRAIL_DIR not found: $CONTRAIL_DIR" >&2
  echo "       set CONTRAIL_DIR or check out the fork next to openmeet-api-contrail-live-ingest" >&2
  exit 1
fi

echo "building @atmo-dev/contrail* from $CONTRAIL_DIR ($(git -C "$CONTRAIL_DIR" rev-parse --short HEAD))"
cd "$CONTRAIL_DIR"
pnpm install --frozen-lockfile
pnpm -r --filter "@atmo-dev/contrail" --filter "@atmo-dev/contrail-base" --filter "@atmo-dev/contrail-appview" --filter "@atmo-dev/contrail-authority" --filter "@atmo-dev/contrail-record-host" --filter "@atmo-dev/contrail-community" build

mkdir -p "$REPO_ROOT/vendor"

for pkg in contrail contrail-base contrail-appview contrail-authority contrail-record-host contrail-community; do
  cd "$CONTRAIL_DIR/packages/$pkg"
  packed=$(pnpm pack --silent | tail -1)
  dest="$REPO_ROOT/vendor/atmo-dev-${pkg}.tgz"
  mv "$packed" "$dest"
  echo "wrote $dest"
done
