#!/usr/bin/env python3
"""
Genera las versiones ligeras (WebP) de las fotos del carrusel del stand-by.

Uso:  standby_photos.py [CARPETA]      (por defecto static/standby)

Por cada NN.jpg/.jpeg/.png/.webp de la carpeta escribe w/NN-600.webp,
w/NN-900.webp y w/NN-1200.webp (ancho en px). La landing las sirve con srcset
para que el móvil no se baje la foto grande. Solo regenera las que estén
desfasadas respecto al original. Se ejecuta en local (el python del servidor no
tiene Pillow) y luego se sube la carpeta entera por scp. Ver `make standby-photos`.
"""
import os
import sys

from PIL import Image, ImageOps

WIDTHS = (600, 900, 1200)
QUALITY = 78
EXTS = ('.jpg', '.jpeg', '.png', '.webp')


def main(folder):
    out_dir = os.path.join(folder, 'w')
    os.makedirs(out_dir, exist_ok=True)
    made = 0
    for name in sorted(os.listdir(folder)):
        src = os.path.join(folder, name)
        if not (os.path.isfile(src) and name.lower().endswith(EXTS)):
            continue
        stem = os.path.splitext(name)[0]
        src_mtime = os.path.getmtime(src)
        img = None
        for w in WIDTHS:
            dst = os.path.join(out_dir, f'{stem}-{w}.webp')
            if os.path.exists(dst) and os.path.getmtime(dst) >= src_mtime:
                continue
            if img is None:
                img = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
            h = round(img.height * w / img.width)
            img.resize((w, h), Image.Resampling.LANCZOS).save(dst, 'WEBP', quality=QUALITY, method=6)
            made += 1
            print(f'  {dst} ({os.path.getsize(dst) // 1024} KB)')
    print(f'OK: {made} variante(s) nueva(s) en {out_dir}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join('static', 'standby'))
