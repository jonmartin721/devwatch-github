To generate icons for this extension:

1. Open generate-icons.html in your browser
2. Click "Generate Icons"
3. Right-click each icon and save it to this icons/ directory

Or use your own icons (16x16, 32x32, 48x48, 128x128 PNG format).

For now, placeholder icons will be auto-created if you have imagemagick:
  convert -size 128x128 xc:#0366d6 -fill white -gravity center -pointsize 72 -annotate +0+0 "G" icon128.png
