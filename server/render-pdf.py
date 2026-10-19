import json
import os
import sys

import fitz

pdf_path, out_dir, max_pages_raw, dpi_raw = sys.argv[1:5]
max_pages = max(1, min(100, int(max_pages_raw)))
dpi = max(72, min(220, int(dpi_raw)))
os.makedirs(out_dir, exist_ok=True)
doc = fitz.open(pdf_path)
pages = []
try:
    count = min(doc.page_count, max_pages)
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    for index in range(count):
        page = doc[index]
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        filename = f"page-{index + 1:03d}.jpg"
        pix.save(os.path.join(out_dir, filename), jpg_quality=86)
        pages.append({"file": filename, "width": pix.width, "height": pix.height})
finally:
    doc.close()
with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as handle:
    json.dump({"pages": pages}, handle)
