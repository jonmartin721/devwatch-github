#!/bin/bash
# Simple script to create placeholder icons

# Create a simple SVG and note
cat > icon.svg << 'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="#0366d6"/>
  <text x="64" y="80" font-family="Arial" font-size="60" fill="white" text-anchor="middle">G</text>
</svg>
SVG

echo "Created icon.svg"
echo "Convert to PNGs with: convert icon.svg -resize {16,32,48,128}x{16,32,48,128} icon{16,32,48,128}.png"
echo "Or open generate-icons.html in your browser"
