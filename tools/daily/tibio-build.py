#!/usr/bin/env python3
"""
Datos de Tibio (public/games/tibio/data/): vocabulario y vectores de palabras es / en.

Fuente de los vectores: fastText "common crawl" (cc.es.300.vec / cc.en.300.vec), de Facebook AI Research,
licencia CC BY-SA 3.0 (https://fasttext.cc/docs/en/crawl-vectors.html). Esos archivos están ordenados por
frecuencia, así que solo hace falta el principio de cada uno (no se descargan enteros):

  curl -sL https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.es.300.vec.gz | gunzip | head -n 60001 > cc.es.head.vec
  curl -sL https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.en.300.vec.gz | gunzip | head -n 60001 > cc.en.head.vec

Uso (necesita numpy; en un venv: python3 -m venv v && v/bin/pip install numpy):

  python3 tools/daily/tibio-build.py <carpeta con cc.es.head.vec y cc.en.head.vec> [es|en]

Qué hace, para cada idioma:
  1. Vocabulario: palabras de la cabecera del archivo (en orden de frecuencia) que están en el diccionario de
     Mecha Corta, en minúsculas, solo letras, 3 o más letras. Dos grafías que se escriben igual sin tildes
     ("esta" / "está") se funden en la más frecuente (se muestra con su tilde). Se queda con VOCAB palabras.
  2. Reducción: centra, normaliza, quita los primeros componentes principales (que casi no distinguen
     significados) y proyecta a DIMS dimensiones con PCA; vuelve a normalizar y cuantiza a int8.
  3. Escribe vectors-<lang>.bin (N x DIMS bytes con signo, fila por palabra), words-<lang>.txt (una palabra por
     línea, con tilde, mismo orden) y meta-<lang>.json (N, dims, escala). La norma no se guarda: el navegador la calcula.

Las palabras secretas (secrets-<lang>.json) NO se generan: son ~730 palabras comunes elegidas a mano (sin plurales,
nombres propios ni palabras ofensivas), normalizadas y mezcladas una vez con semilla fija. El desafío n.º N es
secrets[(N - 1) % largo]. tests/tibio.test.mjs revisa que todas estén en el vocabulario. Para sumar palabras,
agregarlas AL FINAL (si no, cambian los desafíos de los días siguientes). Si se regenera el vocabulario, volver a
correr esa prueba: una secreta que ya no esté en el vocabulario hay que reemplazarla.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/games/tibio/data'
DICT = ROOT / 'public/games/mecha/dict'
VOCAB = {'es': 30000, 'en': 30000}
DIMS = 96
DROP = 3  # componentes principales que se descartan ("all-but-the-top")
LETTERS = {'es': re.compile(r'^[a-záéíóúüñ]+$'), 'en': re.compile(r'^[a-z]+$')}


def norm(w, lang):
  """Igual que norm() de public/shared/words5/norm.js."""
  s = w.lower().replace('ñ', '\u0001')
  s = ''.join(c for c in unicodedata.normalize('NFD', s) if not unicodedata.combining(c))
  s = s.replace('\u0001', 'ñ')
  return re.sub(r'[^a-zñ]' if lang == 'es' else r'[^a-z]', '', s)


def decode_dict(path):
  """Diccionario de Mecha Corta (codificación de prefijo, base 36) -> conjunto de palabras."""
  words, prev = set(), ''
  for line in path.read_text(encoding='utf8').split('\n'):
    if not line:
      continue
    prev = prev[: int(line[0], 36)] + line[1:]
    words.add(prev)
  return words


def build(lang, src):
  dic = decode_dict(DICT / f'{lang}.txt')
  keys, shown, rows = {}, [], []
  with open(src, encoding='utf8') as f:
    next(f)  # encabezado "N 300"
    for line in f:
      tok, _, rest = line.partition(' ')
      if len(tok) < 3 or tok != tok.lower() or not LETTERS[lang].match(tok):
        continue
      k = norm(tok, lang)
      if len(k) < 3 or k in keys or k not in dic:
        continue
      keys[k] = len(shown)
      shown.append(tok)
      rows.append(np.fromstring(rest, sep=' ', dtype=np.float32))
      if len(shown) >= VOCAB[lang]:
        break
  X = np.vstack(rows)
  X /= np.linalg.norm(X, axis=1, keepdims=True)
  X -= X.mean(axis=0)
  # PCA por autovalores de la covarianza (300 x 300)
  w, V = np.linalg.eigh(X.T @ X / len(X))
  V = V[:, ::-1]
  Y = X @ V[:, DROP : DROP + DIMS]
  Y /= np.linalg.norm(Y, axis=1, keepdims=True)
  scale = 127.0 / float(np.abs(Y).max())
  Q = np.clip(np.round(Y * scale), -127, 127).astype(np.int8)
  OUT.mkdir(parents=True, exist_ok=True)
  (OUT / f'vectors-{lang}.bin').write_bytes(Q.tobytes())
  (OUT / f'words-{lang}.txt').write_text('\n'.join(shown) + '\n', encoding='utf8')
  (OUT / f'meta-{lang}.json').write_text(json.dumps({'n': len(shown), 'dims': DIMS, 'scale': round(scale, 3)}) + '\n')
  print(f'{lang}: {len(shown)} palabras, {DIMS} dims, {Q.nbytes / 1e6:.2f} MB de vectores')


if __name__ == '__main__':
  src = Path(sys.argv[1])
  for lang in sys.argv[2:] or ['es', 'en']:
    build(lang, src / f'cc.{lang}.head.vec')
