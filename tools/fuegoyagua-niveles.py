# Fuego y Agua — arma los mapas de los templos con rectángulos, rampas y objetos, y escribe
# public/games/fuegoyagua/shared/levels.js (no se edita a mano). Las soluciones de cada nivel están en
# shared/solutions.js y las pruebas (npm test) comprueban que se ganan con todas las gemas.
#
#   python3 tools/fuegoyagua-niveles.py public/games/fuegoyagua/shared/levels.js
#
# Leyenda: # piedra · / y \ rampas · L lava · W agua · G barro · r/b gemas · F/A Llama y Gota · D/E puertas.
import json, sys

W, H = 36, 26

class Lv:
    def __init__(self, id, es, en, par):
        self.id, self.es, self.en, self.par = id, es, en, par
        self.g = [['.'] * W for _ in range(H)]
        self.objects = []
        self.rect(0, 0, W - 1, 0)
        self.rect(0, H - 1, W - 1, H - 1)
        self.rect(0, 0, 0, H - 1)
        self.rect(W - 1, 0, W - 1, H - 1)
    def rect(self, x0, y0, x1, y1, c='#'):
        for y in range(min(y0, y1), max(y0, y1) + 1):
            for x in range(min(x0, x1), max(x0, x1) + 1):
                self.g[y][x] = c
        return self
    def put(self, x, y, c):
        assert self.g[y][x] == '.', f'{self.id}: ocupado en {x},{y}: {self.g[y][x]}'
        self.g[y][x] = c
        return self
    def clear(self, x0, y0, x1, y1):
        return self.rect(x0, y0, x1, y1, '.')
    def ramp_up_right(self, x, y, n):
        # rampa que sube hacia la derecha: empieza en la baldosa (x, y) y sube una fila por columna; rellena abajo
        for i in range(n):
            self.g[y - i][x + i] = '/'
            for yy in range(y - i + 1, y + 1):
                self.g[yy][x + i] = '#'
        return self
    def ramp_up_left(self, x, y, n):
        # rampa que sube hacia la izquierda: empieza en (x, y) y sube una fila por columna hacia la izquierda
        for i in range(n):
            self.g[y - i][x - i] = '\\'
            for yy in range(y - i + 1, y + 1):
                self.g[yy][x - i] = '#'
        return self
    def door(self, k, x, y):
        # (x, y) = baldosa de abajo a la izquierda de la puerta (2x2); el piso tiene que estar en y+1
        assert self.g[y + 1][x] in '#' and self.g[y + 1][x + 1] in '#', f'{self.id}: la puerta {k} no tiene piso'
        self.put(x, y, 'D' if k == 'F' else 'E')
        return self
    def obj(self, **o):
        self.objects.append(o)
        return self
    def js(self):
        rows = [''.join(r) for r in self.g]
        return {'id': self.id, 'name': {'es': self.es, 'en': self.en}, 'par': self.par, 'map': rows, 'objects': self.objects}

levels = []

# ---------------------------------------------------------------- 1. La entrada
L = Lv('entrada', 'La entrada', 'The entrance', 35)
L.rect(1, 24, 34, 24)
L.rect(9, 24, 11, 24, 'W'); L.rect(16, 24, 18, 24, 'L')
L.rect(28, 22, 29, 23); L.rect(30, 20, 31, 23); L.rect(32, 18, 34, 23)
L.rect(1, 16, 28, 16); L.rect(14, 16, 16, 16, 'G')
L.rect(5, 14, 6, 15); L.rect(3, 12, 4, 15); L.rect(1, 10, 2, 15)
L.rect(6, 8, 34, 8)
L.door('F', 27, 7); L.door('W', 31, 7)
L.put(10, 20, 'r'); L.put(17, 20, 'b')
L.put(9, 15, 'r'); L.put(22, 15, 'b')
L.put(12, 7, 'b'); L.put(18, 7, 'r')
L.put(2, 23, 'F'); L.put(4, 23, 'A')
levels.append(L)

# ---------------------------------------------------------------- 2. Rampas
L = Lv('rampas', 'Rampas', 'Ramps', 30)
L.rect(1, 24, 34, 24)
L.rect(8, 24, 10, 24, 'W'); L.rect(15, 24, 17, 24, 'L')
L.put(20, 23, '/'); L.put(21, 23, '#'); L.put(22, 23, '\\')
L.ramp_up_right(26, 23, 6); L.rect(32, 18, 34, 23)
L.rect(1, 16, 28, 16); L.rect(23, 16, 25, 16, 'W'); L.rect(17, 16, 19, 16, 'G'); L.rect(10, 16, 12, 16, 'L')
L.ramp_up_left(7, 15, 6); L.rect(1, 10, 1, 15)
L.rect(5, 8, 34, 8); L.rect(13, 8, 15, 8, 'L'); L.rect(19, 8, 21, 8, 'W')
L.door('F', 27, 7); L.door('W', 31, 7)
L.put(9, 20, 'r'); L.put(16, 20, 'b'); L.put(21, 21, 'b')
L.put(24, 12, 'r'); L.put(18, 12, 'b'); L.put(11, 12, 'b')
L.put(14, 4, 'b'); L.put(20, 4, 'r')
L.put(3, 23, 'F'); L.put(5, 23, 'A')
levels.append(L)

# ---------------------------------------------------------------- 3. El ascensor
L = Lv('ascensor', 'El ascensor', 'The lift', 50)
L.rect(1, 24, 29, 24)
L.rect(33, 17, 34, 24)
L.rect(1, 16, 29, 16)
L.rect(13, 24, 15, 24, 'G')
L.rect(11, 16, 13, 16, 'L'); L.rect(18, 16, 20, 16, 'W')
L.rect(5, 14, 6, 15); L.rect(3, 12, 4, 15); L.rect(1, 10, 2, 15)
L.rect(6, 8, 34, 8)
L.door('F', 27, 7); L.door('W', 31, 7)
L.obj(t='mover', id='e', x=30, y=24, w=3, h=1, dy=-8, speed=3, color='#e0b23a')
L.obj(t='button', x=26, y=23, link='e', color='#e0b23a')
L.obj(t='button', x=25, y=15, link='e', color='#e0b23a')
L.put(14, 20, 'r'); L.put(20, 22, 'b'); L.put(8, 22, 'r')
L.put(12, 12, 'b'); L.put(19, 12, 'r')
L.put(14, 7, 'b'); L.put(20, 7, 'r')
L.put(2, 23, 'F'); L.put(4, 23, 'A')
levels.append(L)

# ---------------------------------------------------------------- 4. La palanca
L = Lv('palanca', 'La palanca', 'The lever', 40)
L.rect(1, 24, 34, 24)
L.rect(9, 24, 11, 24, 'L'); L.rect(16, 24, 18, 24, 'W')
L.rect(28, 22, 29, 23); L.rect(30, 20, 31, 23); L.rect(32, 18, 34, 23)
L.rect(1, 16, 28, 16); L.rect(18, 16, 20, 16, 'G')
L.rect(5, 14, 6, 15); L.rect(3, 12, 4, 15); L.rect(1, 10, 2, 15)
L.rect(6, 8, 34, 8)
L.door('F', 28, 7); L.door('W', 31, 7)
L.obj(t='lever', x=22, y=23, link='g1', color='#c94a3c')
L.obj(t='mover', id='g1', x=12, y=13, w=1, h=3, dy=-3, speed=2.5, color='#c94a3c')
L.obj(t='mover', id='g2', x=22, y=5, w=1, h=3, dy=-3, speed=3, color='#3d8bff')
L.obj(t='button', x=16, y=7, link='g2', color='#3d8bff')
L.obj(t='button', x=25, y=7, link='g2', color='#3d8bff')
L.put(10, 20, 'b'); L.put(17, 20, 'r')
L.put(19, 12, 'r'); L.put(8, 15, 'b')
L.put(11, 7, 'r'); L.put(19, 7, 'b')
L.put(2, 23, 'F'); L.put(4, 23, 'A')
levels.append(L)

# ---------------------------------------------------------------- 5. La caja
L = Lv('caja', 'La caja', 'The crate', 45)
L.rect(1, 24, 34, 24)
L.rect(11, 24, 13, 24, 'W'); L.rect(16, 24, 18, 24, 'L')
L.rect(30, 21, 34, 23); L.rect(32, 19, 34, 20)
L.rect(1, 17, 28, 17); L.rect(8, 17, 9, 17, 'G')
L.rect(5, 15, 6, 16); L.rect(3, 13, 4, 16); L.rect(1, 11, 2, 16)
L.rect(6, 9, 34, 9); L.rect(15, 9, 17, 9, 'G')
L.door('F', 27, 8); L.door('W', 31, 8)
L.obj(t='box', x=23, y=23)
L.obj(t='box', x=24, y=16)
L.obj(t='button', x=20, y=16, link='g', color='#7a5ce6')
L.obj(t='mover', id='g', x=13, y=14, w=1, h=3, dy=-3, speed=2.5, color='#7a5ce6')
L.put(12, 20, 'r'); L.put(17, 20, 'b')
L.put(8, 13, 'r'); L.put(9, 13, 'b')
L.put(16, 5, 'r'); L.put(22, 8, 'b')
L.put(2, 23, 'F'); L.put(4, 23, 'A')
levels.append(L)

# ---------------------------------------------------------------- 6. Caminos cruzados
L = Lv('cruzados', 'Caminos cruzados', 'Crossed paths', 20)
L.rect(1, 24, 34, 24)
L.rect(17, 1, 18, 23)                       # columna del medio: cada uno por su lado
L.rect(3, 24, 10, 24, 'L')                  # Gota no pasa
L.rect(25, 24, 32, 24, 'W')                 # Llama no pasa
L.rect(12, 22, 13, 23); L.rect(14, 20, 15, 23); L.rect(16, 18, 16, 23)
L.rect(22, 22, 23, 23); L.rect(20, 20, 21, 23); L.rect(19, 18, 19, 23)
L.rect(1, 16, 12, 16); L.rect(23, 16, 34, 16)
L.rect(5, 16, 7, 16, 'G'); L.rect(28, 16, 30, 16, 'G')
L.door('F', 2, 15); L.door('W', 32, 15)
L.obj(t='lever', x=1, y=23, link='gW', color='#ff6a2e')
L.obj(t='lever', x=34, y=23, link='gF', color='#2f8cff')
L.obj(t='mover', id='gF', x=10, y=13, w=1, h=3, dy=-3, speed=2.5, color='#2f8cff')
L.obj(t='mover', id='gW', x=25, y=13, w=1, h=3, dy=-3, speed=2.5, color='#ff6a2e')
L.put(6, 21, 'r'); L.put(29, 21, 'b')
L.put(6, 12, 'r'); L.put(29, 12, 'b')
L.put(8, 15, 'r'); L.put(27, 15, 'b')
L.put(11, 23, 'F'); L.put(24, 23, 'A')
levels.append(L)

# ---------------------------------------------------------------- 7. El vaivén
L = Lv('vaiven', 'El vaivén', 'The ferry', 65)
L.rect(1, 24, 34, 24); L.rect(12, 24, 14, 24, 'G')
L.rect(28, 22, 29, 23); L.rect(30, 20, 31, 23); L.rect(32, 18, 34, 23)
L.rect(1, 16, 28, 16)
L.rect(8, 16, 22, 16, 'G')                  # pozo de barro: no se salta
L.rect(5, 14, 6, 15); L.rect(3, 12, 4, 15); L.rect(1, 10, 2, 15)
L.rect(6, 8, 34, 8); L.rect(17, 8, 19, 8, 'L'); L.rect(23, 8, 25, 8, 'W')
L.door('F', 28, 7); L.door('W', 31, 7)
L.obj(t='lever', x=25, y=15, link='p', on=True, color='#56c93f')
L.obj(t='mover', id='p', x=19, y=14, w=4, h=1, dx=-12, speed=2.4, inv=True, color='#56c93f')
L.put(15, 10, 'r'); L.put(12, 10, 'b')
L.put(13, 20, 'r'); L.put(20, 22, 'b'); L.put(9, 22, 'b')
L.put(18, 4, 'b'); L.put(24, 4, 'r')
L.put(2, 23, 'F'); L.put(4, 23, 'A')
levels.append(L)

# ---------------------------------------------------------------- 8. Dos ascensores
L = Lv('ascensores', 'Dos ascensores', 'Two lifts', 45)
L.rect(1, 24, 2, 24); L.rect(6, 24, 29, 24)     # piso con los dos pozos de los ascensores (3-5 y 30-32)
L.rect(33, 17, 34, 24); L.rect(1, 17, 2, 23)
L.rect(13, 24, 15, 24, 'L'); L.rect(20, 24, 22, 24, 'W')
L.rect(6, 16, 29, 16); L.rect(7, 16, 9, 16, 'G'); L.rect(24, 16, 26, 16, 'W')
# pirámide en el medio: se sube de los dos lados
L.rect(11, 14, 12, 15); L.rect(13, 12, 14, 15); L.rect(15, 10, 18, 15); L.rect(19, 12, 20, 15); L.rect(21, 14, 22, 15)
L.rect(1, 8, 12, 8); L.rect(21, 8, 34, 8); L.rect(6, 8, 8, 8, 'W'); L.rect(26, 8, 28, 8, 'L')
L.door('F', 2, 7); L.door('W', 32, 7)
L.obj(t='mover', id='e1', x=30, y=24, w=3, h=1, dy=-8, speed=3, color='#e0b23a')
L.obj(t='mover', id='e2', x=3, y=24, w=3, h=1, dy=-8, speed=3, color='#56c93f')
L.obj(t='button', x=25, y=23, link='e1', color='#e0b23a')
L.obj(t='button', x=28, y=15, link='e2', color='#56c93f')
L.put(14, 20, 'r'); L.put(21, 20, 'b')
L.put(8, 12, 'r'); L.put(25, 12, 'b')
L.put(7, 4, 'r'); L.put(27, 4, 'b')
L.put(7, 23, 'F'); L.put(9, 23, 'A')
levels.append(L)

# ---------------------------------------------------------------- 9. Compuertas
L = Lv('compuertas', 'Compuertas', 'Floodgates', 50)
L.rect(1, 24, 34, 24); L.rect(7, 24, 9, 24, 'G')
L.rect(28, 22, 29, 23); L.rect(30, 20, 31, 23); L.rect(32, 18, 34, 23)
L.rect(1, 16, 28, 16); L.rect(18, 16, 20, 16, 'L'); L.rect(10, 16, 12, 16, 'W')
L.rect(5, 14, 6, 15); L.rect(3, 12, 4, 15); L.rect(1, 10, 2, 15)
L.rect(6, 8, 34, 8)
L.door('F', 31, 7); L.door('W', 33, 7)
# en fila: cada uno sostiene la compuerta del otro
L.obj(t='mover', id='c1', x=11, y=5, w=1, h=3, dy=-3, speed=3.5, color='#ff6a2e')
L.obj(t='mover', id='c2', x=18, y=5, w=1, h=3, dy=-3, speed=3.5, color='#2f8cff')
L.obj(t='mover', id='c3', x=25, y=5, w=1, h=3, dy=-3, speed=3.5, color='#e0b23a')
L.obj(t='button', x=8, y=7, link='c1', color='#ff6a2e')
L.obj(t='button', x=14, y=7, link=['c1', 'c2'], color='#2f8cff')
L.obj(t='button', x=21, y=7, link=['c2', 'c3'], color='#e0b23a')
L.obj(t='button', x=28, y=7, link='c3', color='#e0b23a')
L.put(7, 20, 'b'); L.put(9, 20, 'r')
L.put(19, 12, 'r'); L.put(11, 12, 'b')
L.put(16, 7, 'r'); L.put(23, 7, 'b')
L.put(2, 23, 'F'); L.put(4, 23, 'A')
levels.append(L)

# ---------------------------------------------------------------- 10. La cima
L = Lv('cima', 'La cima', 'The summit', 80)
L.rect(1, 24, 34, 24); L.rect(5, 24, 7, 24, 'W'); L.rect(9, 24, 11, 24, 'L')
L.rect(30, 21, 34, 23); L.rect(32, 19, 34, 20)    # paredón: hace falta la caja
L.obj(t='box', x=20, y=23)
L.obj(t='mover', id='pc', x=26, y=21, w=1, h=3, dy=-3, speed=3, color='#7a5ce6')  # compuerta antes del paredón
L.obj(t='button', x=15, y=23, link='pc', color='#7a5ce6')
L.obj(t='button', x=33, y=18, link='pc', color='#7a5ce6')
L.rect(1, 17, 28, 17); L.rect(8, 17, 21, 17, 'G')  # pozo de barro: se cruza en la plataforma
L.obj(t='lever', x=24, y=16, link='fe', on=True, color='#56c93f')
L.obj(t='mover', id='fe', x=18, y=15, w=4, h=1, dx=-11, speed=2.6, inv=True, color='#56c93f')
L.rect(5, 15, 6, 16); L.rect(3, 13, 4, 16); L.rect(1, 11, 2, 16)
L.rect(6, 9, 34, 9); L.rect(14, 9, 15, 9, 'L'); L.rect(19, 9, 20, 9, 'W')
L.obj(t='mover', id='k1', x=23, y=6, w=1, h=3, dy=-3, speed=3.5, color='#ff6a2e')
L.obj(t='mover', id='k2', x=28, y=6, w=1, h=3, dy=-3, speed=3.5, color='#2f8cff')
L.obj(t='button', x=21, y=8, link='k1', color='#ff6a2e')
L.obj(t='button', x=25, y=8, link=['k1', 'k2'], color='#2f8cff')
L.obj(t='button', x=30, y=8, link='k2', color='#2f8cff')
L.door('F', 31, 8); L.door('W', 33, 8)
L.put(6, 20, 'r'); L.put(10, 20, 'b')
L.put(14, 11, 'r'); L.put(10, 11, 'b')
L.put(14, 5, 'b'); L.put(19, 5, 'r')
L.put(2, 23, 'F'); L.put(3, 23, 'A')
levels.append(L)

out = '// Generado con tools/fuegoyagua-niveles.py: no editar a mano.\nexport const LEVELS = '+ json.dumps([l.js() for l in levels], ensure_ascii=False, indent=1) + ';\n'
if len(sys.argv) > 1:
    open(sys.argv[1], 'w').write(out)
for l in levels:
    print(l.id)
    print('\n'.join(''.join(r) for r in l.g))
