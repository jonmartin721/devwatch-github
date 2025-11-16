#!/bin/bash

# Package extension for distribution
echo "Packaging GitHub Devwatch extension..."

# Create dist directory
mkdir -p dist

# Copy necessary files
zip -r dist/github-devwatch.zip \
  manifest.json \
  background.js \
  popup/ \
  options/ \
  shared/ \
  icons/ \
  -x "*.DS_Store" \
  -x "**/.git*"

echo "✓ Extension packaged to dist/github-devwatch.zip"
echo "Load this in Chrome via chrome://extensions/ (Developer mode)"
