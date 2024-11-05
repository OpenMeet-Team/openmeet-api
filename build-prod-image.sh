#!/bin/bash

# this is copying from the github action, use that as a source of truth
GIT_REVISION=$(git rev-parse HEAD)
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
PACKAGE_JSON_B64=$(cat package.json | base64 -w 0)

echo "Building with:"
echo "  Git Revision: $GIT_REVISION"
echo "  Git Branch: $GIT_BRANCH"

# Build the image
docker build \
  --build-arg GIT_REVISION=$GIT_REVISION \
  --build-arg GIT_BRANCH=$GIT_BRANCH \
  --build-arg PACKAGE_JSON_B64=$PACKAGE_JSON_B64 \
  -t openmeet-api:local \
  .

echo "Done! Run with: docker run openmeet-api:local /bin/sh"
