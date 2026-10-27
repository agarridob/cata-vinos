#!/usr/bin/env python3
"""
Quita el fondo de una foto (botellas) con el modelo ONNX isnet-general-use.

Uso:  bgremove.py MODELO.onnx ENTRADA SALIDA.png

Lo lanza app.py como subproceso con el python de .bgremove-venv (onnxruntime,
numpy y pillow por pip): así el servicio sigue con el python de apt y la RAM
del modelo (~1 GB en el pico) se libera al terminar cada foto.
Ver `make bgremove-setup`.
"""
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

MODEL_SIZE = 1024   # isnet-general-use trabaja a 1024×1024
MAX_PX = 1600       # igual que el reducido del control
PAD = 0.03          # margen alrededor del recorte (fracción del lado mayor)


def remove_background(model_path, src, dst):
    img = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    img.thumbnail((MAX_PX, MAX_PX), Image.Resampling.LANCZOS)

    # Mismo preprocesado que rembg: escala a [0,1], resta 0.5, NCHW float32.
    x = np.asarray(img.resize((MODEL_SIZE, MODEL_SIZE), Image.Resampling.LANCZOS), dtype=np.float32)
    x = x / max(float(x.max()), 1e-6) - 0.5
    x = x.transpose(2, 0, 1)[np.newaxis]

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 2
    sess = ort.InferenceSession(model_path, opts, providers=['CPUExecutionProvider'])
    pred = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    pred = (pred - pred.min()) / max(float(pred.max() - pred.min()), 1e-6)

    mask = Image.fromarray((pred * 255).astype(np.uint8), 'L').resize(img.size, Image.Resampling.LANCZOS)
    out = img.convert('RGBA')
    out.putalpha(mask)

    # Recorta el aire transparente alrededor de la botella (con un pequeño margen).
    bbox = mask.point(lambda v: 255 if v > 16 else 0).getbbox()
    if bbox:
        pad = int(max(img.size) * PAD)
        l, t, r, b = bbox
        out = out.crop((max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad)))
    out.save(dst, 'PNG', optimize=True)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    remove_background(*sys.argv[1:])
