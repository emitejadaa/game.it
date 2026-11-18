/**
 * Disimulá — cliente: pantallas, modos, HUD, cámara y red.
 * Un solo GameClient interpreta los mensajes de la partida, vengan del servidor
 * (OnlineRoom) o de la MISMA lógica corriendo en la página (shared/logic.js) para
 * los modos sin conexión. La práctica es un arenero local sin partida.
 */
import { t, esc, applyTexts, fmtTime, TXT } from './i18n.js';
import { World, drawMapPreview, THREE } from './world.js';
import { Avatar } from './avatar.js';
import { Input } from './controls.js';
import { PaintUI } from './paint-ui.js';
import { sfx, whistleAt, music, local as vol, unlock } from './audio.js';
import { OnlineRoom, netText, defaultName, share, roomFromUrl } from '/shared/online.js';
import { Match } from './shared/logic.js';
import { Paint, deserializePaint } from './shared/paint.js';
import { walk } from './shared/geom.js';
import { getMap, MAP_IDS, raycastColor } from './shared/maps.js';
import { PARTS as BODY_PARTS } from './shared/body.js';
import { camoScore } from './shared/camo.js';
import { DEFAULTS, WHISTLES, SPEED, EYE, REACTIONS, autoSeekers } from './shared/rules.js';
import { BOT_NAMES, BOT_COLORS } from './shared/bots.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem(`gameit:disimula:${k}`)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`gameit:disimula:${k}`, JSON.stringify(v));
    } catch {}
  },
};
const opts = Object.assign({ name: '', sens: 1, music: 0.8, sfx: 1 }, store.get('opts', {}));
vol.music = opts.music;
vol.sfx = opts.sfx;

// ---------------------------------------------------------------- base 3D + entrada
const world = new World($('gl'));
const input = new Input($('gl'));
input.sens = opts.sens;
input.bindJoystick($('joystick'));

// ---------------------------------------------------------------- temporizadores pausables (modo local)
class Timers {
  constructor() {
    this.m = new Map();
    this.paused = false;
    this.base = performance.now();
    this.pausedAt = 0;
  }
  now() {
    return (this.pausedAt || performance.now()) - this.base;
  }
  set(k, ms, fn) {
    this.clear(k);
    const tm = { fn, left: ms, h: 0 };
    this.m.set(k, tm);
    if (!this.paused) this.arm(k, tm);
  }
  arm(k, tm) {
    tm.due = performance.now() + tm.left;
    tm.h = setTimeout(() => {
      this.m.delete(k);
      tm.fn();
    }, tm.left);
  }
  clear(k) {
    const tm = this.m.get(k);
    if (tm) clearTimeout(tm.h);
    this.m.delete(k);
  }
  clearAll() {
    for (const k of [...this.m.keys()]) this.clear(k);
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.pausedAt = performance.now();
    for (const tm of this.m.values()) {
      clearTimeout(tm.h);
      tm.left = Math.max(0, tm.due - this.pausedAt);
    }
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.base += performance.now() - this.pausedAt;
    this.pausedAt = 0;
    for (const [k, tm] of this.m) this.arm(k, tm);
  }
}

// ---------------------------------------------------------------- sesiones
class LocalSession {
  constructor(onMsg, onEnd, { settings, role, name }) {
    this.timers = new Timers();
    this.onMsg = onMsg;
    this.queue = [];
    const bots = [];
    for (let i = 0; i < settings.bots; i++) bots.push({ id: `bot${i}`, name: BOT_NAMES[i % BOT_NAMES.length], color: BOT_COLORS[i % BOT_COLORS.length], bot: settings.botLevel });
    // el orden decide los roles (rotación de rules.pickSeekers): primero van los buscadores de la ronda 1
    const me = { id: 'me', name, color: '#3ec1ff' };
    const n = bots.length + 1;
    const seekers = settings.seekers || autoSeekers(n);
    let players;
    if (role === 'seek') players = [me, ...bots];
    else if (role === 'hide') players = [...bots.slice(0, seekers), me, ...bots.slice(seekers)];
    else players = Math.random() < 0.5 ? [me, ...bots] : [...bots.slice(0, 1), me, ...bots.slice(1)];
    const io = {
      now: () => this.timers.now(),
      send: (id, m) => id === 'me' && this.deliver(m),
      broadcast: (m) => this.deliver(m),
      timer: (k, ms, fn) => this.timers.set(k, ms, fn),
      clear: (k) => this.timers.clear(k),
      end: (payload) => {
        this.deliver({ t: 'end', ...payload });
        onEnd?.(payload);
      },
    };
    this.match = new Match({ players, settings, io, seed: (Math.random() * 2 ** 31) >>> 0 });
    this.local = true;
  }
  deliver(m) {
    this.queue.push(m);
    if (this.flushing) return;
    this.flushing = true;
    queueMicrotask(() => {
      this.flushing = false;
      const q = this.queue.splice(0);
      for (const msg of q) this.onMsg(msg);
    });
  }
  start() {
    this.match.start();
  }
  send(msg) {
    this.match.handle('me', msg);
  }
  now() {
    return this.timers.now();
  }
  pause() {
    this.timers.pause();
  }
  resume() {
    this.timers.resume();
  }
  again() {
    this.match.start();
  }
  leave() {
    this.match.destroy();
    this.timers.clearAll();
  }
}

class PracticeSession {
  constructor() {
    this.local = true;
    this.practice = true;
  }
  send() {}
  now() {
    return performance.now();
  }
  pause() {}
  resume() {}
  leave() {}
}

// ---------------------------------------------------------------- GameClient
const HUD = {
  root: $('hud'),
  clock: $('ph-clock'),
  label: $('ph-label'),
  round: $('round-chip'),
  team: $('team-list'),
  cross: $('crosshair'),
  toasts: $('toasts'),
  big: $('big-msg'),
  stun: $('stun-overlay'),
  whistle: $('whistle-box'),
  whistleCount: $('whistle-count'),
  camo: $('camo-box'),
  camoBar: $('camo-bar'),
  camoVal: $('camo-val'),
  seekActs: $('seek-actions'),
  prepActs: $('prep-actions'),
  spect: $('spect-bar'),
  joy: $('joystick'),
  pauseBtn: $('b-pause'),
};

class GameClient {
  constructor(session, { myId, mode }) {
    this.session = session;
    this.myId = myId;
    this.mode = mode; // online | bots | practice
    this.players = new Map(); // id → { meta, avatar, buf, paint, mats }
    this.you = { team: null, spectator: false, caught: false };
    this.phase = 'idle';
    this.endsAt = 0;
    this.round = 0;
    this.rounds = 1;
    this.whistleCfg = DEFAULTS.whistle;
    this.pos = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.lastSent = 0;
    this.sentPos = null;
    this.camoT = 0;
    this.stunT = 0;
    this.zoomK = 0;
    this.whistleNextAt = 0;
    this.spectIdx = 0;
    this.spectFree = false;
    this.seekerViewIdx = -1;
    this.gallery = null;
    this.galleryShots = new Map();
    this.toastT = [];
    this.active = true;
    this.paintMode = true;
    HUD.root.hidden = false;
    HUD.pauseBtn.hidden = false;
  }

  // -------------------------------- utilidades
  me() {
    return this.players.get(this.myId);
  }
  myState() {
    const pu = paintUI;
    return { pos: [this.pos.x, this.pos.y, this.pos.z], yaw: this.myYawBody ?? this.yaw, pose: pu.pose, joints: pu.joints.slice() };
  }
  ensurePlayer(meta) {
    let p = this.players.get(meta.id);
    if (!p) {
      p = { meta, avatar: null, buf: [], paint: new Paint(), mats: {}, state: { pos: [0, -99, 0], yaw: 0, pose: 'stand', joints: [] } };
      this.players.set(meta.id, p);
    }
    p.meta = { ...p.meta, ...meta };
    return p;
  }
  avatarFor(p) {
    if (!p.avatar) {
      p.avatar = new Avatar(world, { name: p.meta.name, color: p.meta.color, seeker: p.meta.team === 'seek' });
      p.avatar.setState(p.state);
      p.avatar.setPaint(p.paint.data);
    }
    return p.avatar;
  }
  isMe(id) {
    return id === this.myId;
  }

  toast(txt, ms = 2600) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = txt;
    HUD.toasts.append(d);
    setTimeout(() => d.remove(), ms);
  }
  bigMsg(txt, ms = 2200) {
    HUD.big.textContent = txt;
    HUD.big.hidden = false;
    clearTimeout(this.bigT);
    this.bigT = setTimeout(() => (HUD.big.hidden = true), ms);
  }

  // -------------------------------- mensajes de la partida
  handle(msg) {
    const h = this[`on_${msg.t}`];
    if (h) h.call(this, msg);
  }

  on_state(m) {
    world.setMap(m.map);
    this.mapId = m.map;
    this.phase = m.phase;
    this.endsAt = m.endsAt;
    this.round = m.round;
    this.rounds = m.rounds;
    this.whistleCfg = m.whistle;
    this.on_pl(m);
    this.on_you(m.you);
    if (m.hiders) for (const hm of m.hiders) this.on_hider(hm);
    if (m.movers) for (const mv of m.movers) this.on_mv({ ...mv, snap: true });
    this.refreshHud();
  }

  on_pl(m) {
    const seen = new Set();
    for (const meta of m.players) {
      seen.add(meta.id);
      const p = this.ensurePlayer(meta);
      if (p.avatar) {
        p.avatar.setSeeker(meta.team === 'seek');
        if (meta.team === 'hide' && this.phase === 'prep' && (this.you.team === 'hide' || this.you.spectator)) p.avatar.showName(!this.isMe(meta.id));
      }
    }
    for (const [id, p] of this.players) {
      if (!seen.has(id)) {
        p.avatar?.dispose();
        this.players.delete(id);
      }
    }
    this.refreshTeamList();
  }

  on_you(m) {
    const wasSpect = this.you.spectator || this.you.caught;
    this.you = { team: m.team, spectator: m.spectator, caught: m.caught };
    if (m.pos) {
      this.pos = { x: m.pos[0], y: m.pos[1], z: m.pos[2] };
      this.yaw = m.yaw ?? 0;
      input.yaw = this.yaw + Math.PI;
      this.sentPos = null;
    }
    if (!wasSpect && (m.spectator || m.caught)) this.pickSpectTarget(0);
    this.applyMode();
  }

  on_phase(m) {
    if (this.mapId !== m.map) {
      world.setMap(m.map);
      this.mapId = m.map;
    }
    const prev = this.phase;
    this.phase = m.phase;
    this.endsAt = m.endsAt;
    this.round = m.round;
    this.rounds = m.rounds;
    this.whistleCfg = m.whistle;
    this.gallery = null;
    if (m.phase === 'prep') {
      // ronda nueva: pinturas en blanco y avatares visibles
      for (const p of this.players.values()) {
        p.paint.clear();
        p.mats = {};
        p.state.pose = 'stand';
        p.state.joints = [];
        if (p.avatar) {
          p.avatar.group.visible = true;
          p.avatar.setPaint(p.paint.data);
          p.avatar.setMats({});
          p.avatar.setState(p.state);
          p.avatar.highlight(false);
        }
      }
      paintUI.pose = 'stand';
      paintUI.joints = [0, 0, 0, 0, 0, 0];
      paintUI.mats = {};
      paintUI.sync();
      ownPaint.clear();
      this.whistleNextAt = 0;
      this.seekerViewIdx = -1;
      hideScreens();
      this.bigMsg(this.you.team === 'seek' ? t('waitSeek') : t('prepTitle'));
      sfx.go();
      music('calm');
    } else if (m.phase === 'seek') {
      hideScreens();
      this.whistleNextAt = this.whistleCfg ? this.session.now() + this.whistleCfg * 1000 : 0;
      if (this.you.team === 'hide' && !this.you.caught) {
        this.bigMsg(t('frozen'));
        sfx.freeze();
      } else if (this.you.team === 'seek') {
        this.bigMsg(t('seekTitle'));
        sfx.go();
        if (!input.touch) setTimeout(() => !input.locked && this.toast(t('clickToLock'), 3200), 700);
      }
      this.warned30 = false;
      music('calm');
    } else if (m.phase === 'over') music(null);
    if (prev !== m.phase) this.applyMode();
    this.refreshHud();
  }

  on_hider(m) {
    const p = this.ensurePlayer({ id: m.id });
    p.state = { pos: m.pos, yaw: m.yaw, pose: m.pose, joints: m.joints };
    p.mats = m.mats || {};
    if (!this.isMe(m.id)) {
      deserializePaint(m.paint, p.paint.data);
      const av = this.avatarFor(p);
      av.setState(p.state);
      av.setPaint(p.paint.data);
      av.setMats(p.mats);
      av.showName(false);
      if (this.you.spectator || this.you.caught) av.highlight(true);
    }
  }

  on_mv(m) {
    if (this.isMe(m.id)) return;
    const p = this.ensurePlayer({ id: m.id });
    p.buf.push({ at: performance.now(), p: m.p, yaw: m.yaw });
    if (p.buf.length > 6) p.buf.shift();
    if (m.snap) {
      p.state.pos = m.p;
      p.state.yaw = m.yaw;
      this.avatarFor(p).setState(p.state);
    } else this.avatarFor(p);
  }

  on_pose(m) {
    if (this.isMe(m.id)) return;
    const p = this.ensurePlayer({ id: m.id });
    p.state.pose = m.pose;
    p.state.yaw = m.yaw;
    p.state.joints = m.joints;
    this.avatarFor(p).setState(p.state);
  }

  on_pp(m) {
    if (this.isMe(m.id)) return;
    const p = this.ensurePlayer({ id: m.id });
    for (const op of m.ops) p.paint.apply(op, { state: p.state, map: world.map });
    this.avatarFor(p).setPaint(p.paint.data);
  }

  on_mats(m) {
    if (this.isMe(m.id)) return;
    const p = this.ensurePlayer({ id: m.id });
    p.mats = m.mats;
    this.avatarFor(p).setMats(m.mats);
  }

  on_undo(m) {
    if (this.isMe(m.id)) return;
    const p = this.ensurePlayer({ id: m.id });
    p.paint.undo({ state: p.state, map: world.map });
    this.avatarFor(p).setPaint(p.paint.data);
  }
  on_redo(m) {
    if (this.isMe(m.id)) return;
    const p = this.ensurePlayer({ id: m.id });
    p.paint.redo({ state: p.state, map: world.map });
    this.avatarFor(p).setPaint(p.paint.data);
  }

  on_whistle(m) {
    world.ripple(m.p[0], m.p[1], m.p[2]);
    const cam = world.camera.position;
    // el paneo va en el espacio de la cámara (derecha = cos ry, −sin ry)
    const ry = world.camera.rotation.y;
    const dx = m.p[0] - cam.x;
    const dz = m.p[2] - cam.z;
    whistleAt(dx * Math.cos(ry) - dz * Math.sin(ry), m.p[1] - cam.y, dx * -Math.sin(ry) + dz * -Math.cos(ry));
    if (this.isMe(m.id)) this.whistleNextAt = this.session.now() + (m.next || this.whistleCfg * 1000);
    else if (this.you.team === 'seek') this.toast(t('whistled'));
  }

  on_caught(m) {
    const p = this.players.get(m.id);
    const by = m.by && this.players.get(m.by);
    if (p) {
      p.meta.caught = true;
      const av = this.avatarFor(p);
      av.surprise();
      world.burst(p.state.pos[0], p.state.pos[1] + 1, p.state.pos[2], p.meta.color || '#fff', 22);
      setTimeout(() => {
        if (p.meta.caught && this.phase === 'seek') av.group.visible = false;
      }, 900);
    }
    sfx.catch();
    if (this.isMe(m.id)) {
      this.bigMsg(t('found'));
      sfx.found();
      this.you.caught = true;
      this.pickSpectTarget(0);
      this.applyMode();
    } else if (m.by && this.isMe(m.by)) {
      this.bigMsg(t('youCaught', { n: esc(p?.meta.name || '?') }));
    } else if (m.by) {
      this.toast(t('caughtBy', { a: esc(by?.meta.name || '?'), b: esc(p?.meta.name || '?') }));
    }
    this.refreshTeamList();
  }

  on_stun(m) {
    if (this.isMe(m.id)) {
      this.stunT = m.until / 1000;
      this.toast(t('stunned'));
      sfx.stun();
    }
  }

  on_mark(m) {
    const p = this.players.get(m.id);
    world.markPing(m.p[0], m.p[1], m.p[2], p?.meta.color || '#ffd166');
    sfx.mark();
  }

  on_react(m) {
    const p = this.players.get(m.id);
    this.toast(`${esc(p?.meta.name || '?')} ${REACTIONS[m.e]}`, 1700);
    sfx.react();
  }

  on_fix(m) {
    this.pos = { x: m.p[0], y: m.p[1], z: m.p[2] };
    this.sentPos = null;
  }

  on_round(m) {
    this.phase = 'reveal';
    this.gallery = m;
    this.galleryShots.clear();
    this.galleryIdx = -1;
    this.galleryStart = 0;
    // todos los escondites visibles para el recorrido
    for (const g of m.gallery) {
      const p = this.players.get(g.id);
      if (!p) continue;
      p.state = { pos: g.pos, yaw: g.yaw, pose: g.pose, joints: g.joints };
      const av = this.avatarFor(p);
      av.group.visible = true;
      av.setState(p.state);
      av.highlight(false);
      av.showName(true);
    }
    music(null);
    sfx[m.winner === 'seekers' ? (this.you.team === 'seek' ? 'win' : 'lose') : this.you.team === 'hide' ? 'win' : 'lose']();
    this.bigMsg(m.winner === 'seekers' ? t('seekersWin') : t('hidersWin'), 2600);
    this.applyMode();
    setTimeout(() => this.showRoundScreen(), 1200);
  }

  on_end(m) {
    this.phase = 'over';
    this.gallery = null;
    music(null);
    showFinal(m, this);
    this.applyMode();
  }

  on_chat(m) {
    this.toast(`<b>${esc(m.name)}</b> ${esc(m.text)}`, 3500);
  }

  // -------------------------------- HUD y modos
  refreshHud() {
    const seek = this.phase === 'seek';
    const prep = this.phase === 'prep';
    HUD.label.textContent = prep ? (this.you.team === 'seek' ? t('waitSeekSub') : t('prepSub')) : seek ? (this.you.team === 'seek' ? t('seekSub') : '') : '';
    HUD.round.textContent = this.mode === 'practice' ? t('mPractice') : t('roundOf', { a: this.round + 1, b: this.rounds });
    this.refreshTeamList();
  }

  refreshTeamList() {
    const rows = [...this.players.values()]
      .filter((p) => p.meta.team)
      .map((p) => {
        const role = p.meta.team === 'seek' ? '🔍' : '🎨';
        const cls = p.meta.caught ? 'tp out' : 'tp';
        return `<div class="${cls}"><i style="background:${p.meta.color}"></i>${role} ${esc(p.meta.name || '')}${p.meta.connected === false ? ' ⚠' : ''}<span class="role">${p.meta.score ?? 0}</span></div>`;
      });
    HUD.team.innerHTML = rows.join('');
    const alive = [...this.players.values()].filter((p) => p.meta.team === 'hide' && !p.meta.caught).length;
    if (this.phase === 'seek' && this.you.team === 'seek') HUD.label.textContent = t('hidersLeft', { n: alive });
  }

  /** Configura cámara, HUD y entradas según fase + rol. */
  applyMode() {
    const prep = this.phase === 'prep';
    const seek = this.phase === 'seek';
    const spect = this.you.spectator || this.you.caught;
    const hiding = this.you.team === 'hide' && !spect;
    const seeking = this.you.team === 'seek' && !spect;
    const practice = this.mode === 'practice';

    const paintOpen = (prep || practice) && hiding;
    // en celular el panel de pintura ocupa media pantalla y taparía el joystick: en "Mover" se esconde y aparece el joystick
    const panelShown = paintOpen && !(input.touch && !this.paintMode);
    $('paint-ui').hidden = !panelShown;
    HUD.prepActs.hidden = !paintOpen;
    HUD.camo.hidden = !(practice || (prep && hiding));
    HUD.whistle.hidden = !(seek && hiding && !this.you.caught);
    HUD.seekActs.hidden = !(seek && seeking);
    HUD.cross.hidden = !(seek && seeking);
    HUD.spect.hidden = !spect || this.phase === 'reveal' || this.phase === 'over';
    HUD.joy.hidden = !input.touch || !((paintOpen && !panelShown) || (seek && seeking) || (spect && this.spectFree));
    document.body.classList.toggle('has-panel', panelShown);
    document.body.classList.toggle('has-prep', paintOpen);
    document.body.classList.toggle('has-spect', !HUD.spect.hidden);
    syncInset();

    if (seek && seeking) {
      input.mode = 'fps';
      input.paintMode = false;
      if (!input.touch) input.lock();
    } else if (paintOpen) {
      input.mode = 'orbit';
      input.paintMode = this.paintMode && this.seekerViewIdx < 0;
      input.unlock();
    } else if (spect && this.spectFree) {
      input.mode = 'fps';
      input.paintMode = false;
      input.unlock();
    } else if (spect) {
      input.mode = 'orbit';
      input.paintMode = false;
      input.unlock();
    } else {
      input.mode = 'none';
      input.unlock();
    }
    syncGameplay();
  }

  pickSpectTarget(dir) {
    const list = [...this.players.values()].filter((p) => p.meta.team && !p.meta.caught && !this.isMe(p.meta.id));
    if (!list.length) return;
    this.spectIdx = (this.spectIdx + dir + list.length) % list.length;
    const p = list[this.spectIdx];
    $('sp-name').textContent = p.meta.name;
    // los espectadores ven a los escondidos resaltados
    for (const q of this.players.values()) if (q.avatar && q.meta.team === 'hide') q.avatar.highlight(true);
  }

  showRoundScreen() {
    const m = this.gallery;
    if (!m) return;
    $('re-title').textContent = m.winner === 'seekers' ? t('seekersWin') : t('hidersWin');
    $('re-sub').textContent = `${t('roundOf', { a: m.round + 1, b: m.rounds })} · ${m.reason === 'all' ? t('allCaught') : t('timeUp')}`;
    const g = $('re-gallery');
    g.innerHTML = '';
    for (const e of m.gallery) {
      const p = this.players.get(e.id);
      const d = document.createElement('div');
      d.className = 'shot' + (m.bestCamo === e.id ? ' best' : '');
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 112;
      d.append(c);
      this.galleryShots.set(e.id, c);
      // dibuja el escondite ya mismo (sin esperar a que la cámara lo recorra)
      this.snapSpot(e, c);
      const cap = document.createElement('div');
      cap.className = 'cap';
      const when = e.survived ? t('survived') : t('caughtAt', { t: fmtTime(e.survivedMs) });
      cap.innerHTML = `<span><i style="color:${p?.meta.color}">●</i> ${esc(p?.meta.name || '?')}</span><span>${e.score} · ${when} · +${e.pts}</span>`;
      d.append(cap);
      g.append(d);
    }
    const sc = [...this.players.values()].filter((p) => p.meta.team).sort((a, b) => (m.scores[b.meta.id] || 0) - (m.scores[a.meta.id] || 0));
    $('re-points').innerHTML = sc
      .map((p, i) => `<li${m.bestCamo === p.meta.id ? ' class="win"' : ''}><span class="pos">${i + 1}</span><i class="dot" style="background:${p.meta.color}"></i>${esc(p.meta.name)}${m.bestCamo === p.meta.id ? ` · 🏅 ${t('bestCamo')}` : ''}<b class="pts">${m.scores[p.meta.id] || 0}</b></li>`)
      .join('');
    $('re-next').textContent = '';
    show('roundend');
  }

  // -------------------------------- por cuadro
  frame(dt, nowPerf) {
    const now = this.session.now();
    const seeking = this.phase === 'seek' && this.you.team === 'seek' && !this.you.spectator && !this.you.caught;
    const prepping = (this.phase === 'prep' || this.mode === 'practice') && this.you.team === 'hide' && !this.you.spectator;
    const spect = this.you.spectator || this.you.caught;

    // reloj y avisos
    if (this.endsAt && this.phase !== 'reveal' && this.phase !== 'over') {
      const left = this.endsAt - now;
      HUD.clock.textContent = fmtTime(left);
      $('phase-timer').classList.toggle('low', left < 15000);
      const sLeft = Math.ceil(left / 1000);
      if (this.lastS !== sLeft) {
        this.lastS = sLeft;
        if (sLeft <= 5 && sLeft > 0) sfx.tick();
        if (this.phase === 'seek' && sLeft === 30) {
          this.toast(t('left30'));
          if (!this.warned30) music('tense');
          this.warned30 = true;
        }
      }
    } else HUD.clock.textContent = this.mode === 'practice' ? '∞' : '';

    // silbido propio
    if (!HUD.whistle.hidden) {
      const leftW = this.whistleCfg ? Math.max(0, this.whistleNextAt - now) : 0;
      HUD.whistleCount.textContent = this.whistleCfg ? Math.ceil(leftW / 1000) : '—';
    }

    // mareo
    if (this.stunT > 0) {
      this.stunT -= dt;
      HUD.stun.hidden = this.stunT <= 0;
    }

    // movimiento propio
    const canWalk = (seeking || prepping) && this.stunT <= 0 && this.seekerViewIdx < 0;
    if (canWalk) {
      const mv = input.moveVec();
      if (mv.x || mv.y) {
        const camYaw = input.mode === 'fps' ? input.yaw : input.orbit.theta;
        const sp = (this.you.team === 'hide' ? SPEED.hider : SPEED.seeker) * dt;
        const fx = Math.sin(camYaw);
        const fz = Math.cos(camYaw);
        // adelante = hacia donde mira la cámara (−sin, −cos); derecha = (cos, −sin)
        const dx = (mv.y * fx + mv.x * fz) * sp;
        const dz = (mv.y * fz - mv.x * fx) * sp;
        walk(world.map, this.pos, dx, dz);
        if (prepping) this.myYawBody = Math.atan2(dx, dz);
        this.movedAt = nowPerf;
      }
      if (seeking) this.myYawBody = input.yaw + Math.PI;
      // envío (15 Hz buscando, 8 Hz preparando)
      const rate = seeking ? 66 : 125;
      if (nowPerf - this.lastSent > rate) {
        const ps = this.sentPos;
        const changed = !ps || Math.abs(ps[0] - this.pos.x) > 0.01 || Math.abs(ps[2] - this.pos.z) > 0.01 || Math.abs((this.sentYaw ?? 99) - this.myYawBody) > 0.03;
        if (changed) {
          this.lastSent = nowPerf;
          this.sentPos = [r2(this.pos.x), r2(this.pos.y), r2(this.pos.z)];
          this.sentYaw = this.myYawBody ?? 0;
          this.session.send({ t: 'mv', p: this.sentPos, yaw: r2(this.sentYaw), pitch: r2(input.pitch) });
        }
      }
    }

    // interpolación de los demás (y del propio avatar en tercera persona)
    const renderAt = nowPerf - 130;
    for (const p of this.players.values()) {
      if (this.isMe(p.meta.id)) continue;
      if (p.buf.length) {
        let a = p.buf[0];
        let b = p.buf[p.buf.length - 1];
        for (let i = 0; i < p.buf.length - 1; i++)
          if (p.buf[i].at <= renderAt && p.buf[i + 1].at >= renderAt) {
            a = p.buf[i];
            b = p.buf[i + 1];
            break;
          }
        const span = Math.max(1, b.at - a.at);
        const k = Math.max(0, Math.min(1, (renderAt - a.at) / span));
        const px = a.p[0] + (b.p[0] - a.p[0]) * k;
        const py = a.p[1] + (b.p[1] - a.p[1]) * k;
        const pz = a.p[2] + (b.p[2] - a.p[2]) * k;
        let dy = b.yaw - a.yaw;
        dy = ((dy + Math.PI) % (Math.PI * 2)) - Math.PI;
        const av = this.avatarFor(p);
        av.speed = Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]) / (span / 1000);
        p.state.pos = [px, py, pz];
        p.state.yaw = a.yaw + dy * k;
        av.setState(p.state);
        if (p.buf.length && nowPerf - p.buf[p.buf.length - 1].at > 600) {
          p.buf.length = 0;
          av.speed = 0;
        }
      }
      p.avatar?.update(dt, nowPerf / 1000);
    }

    // avatar propio
    const meP = this.me();
    if (meP) {
      const av = this.avatarFor(meP);
      meP.state = this.myState();
      av.setState(meP.state);
      av.speed = this.movedAt && nowPerf - this.movedAt < 120 ? SPEED.hider : 0;
      av.setPaint(ownPaint.data);
      av.group.visible = !seeking && !(spect && false);
      av.update(dt, nowPerf / 1000);
    }

    // cámara
    this.updateCamera(dt, seeking, prepping, spect);

    // medidor de camuflaje (práctica y preparación propia)
    if (!HUD.camo.hidden && (this.camoT -= dt) <= 0) {
      this.camoT = 1.1;
      const sc = camoScore(world.map, this.myState(), ownPaint, paintUI.mats, 3);
      HUD.camoBar.style.width = `${sc}%`;
      HUD.camoVal.textContent = sc;
    }

    // recorrido de la galería al final de la ronda
    if (this.phase === 'reveal' && this.gallery) this.galleryFly(dt, nowPerf);
  }

  updateCamera(dt, seeking, prepping, spect) {
    const cam = world.camera;
    const targetFov = seeking && (input.zoomHeld || this.zoomBtn) ? 36 : 78;
    cam.fov += (targetFov - cam.fov) * (1 - Math.exp(-dt * 10));
    cam.updateProjectionMatrix();
    if (this.phase === 'reveal' && this.gallery) return; // la maneja galleryFly
    if (seeking) {
      cam.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
      cam.rotation.set(input.pitch, input.yaw, 0);
    } else if (prepping) {
      if (this.seekerViewIdx >= 0) {
        const vp = this.seekerViews[this.seekerViewIdx];
        cam.position.set(vp[0], vp[1], vp[2]);
        cam.lookAt(this.pos.x, this.pos.y + 0.9, this.pos.z);
      } else {
        input.orbitCam(cam, this.pos.x, this.pos.y + 1.0, this.pos.z);
      }
    } else if (this.phase === 'prep' && this.you.team === 'seek') {
      // pantalla de espera del buscador: órbita lenta sobre su entrada
      const t0 = performance.now() / 4000;
      const s = world.map?.spawnS[0] || [0, 0, 0];
      cam.position.set(s[0] + Math.sin(t0) * 2.2, s[1] + 2.4, s[2] + Math.cos(t0) * 2.2);
      cam.lookAt(s[0], s[1] + 1, s[2]);
    } else if (spect) {
      if (this.spectFree) {
        cam.rotation.set(input.pitch, input.yaw, 0);
        const mv = input.moveVec();
        if (mv.x || mv.y) {
          const sp = 7 * dt;
          const dir = new THREE.Vector3();
          cam.getWorldDirection(dir);
          cam.position.addScaledVector(dir, -mv.y * sp);
          cam.position.x += Math.cos(input.yaw) * mv.x * sp;
          cam.position.z -= Math.sin(input.yaw) * mv.x * sp;
        }
      } else {
        const list = [...this.players.values()].filter((p) => p.meta.team && !p.meta.caught && !this.isMe(p.meta.id));
        const p = list[this.spectIdx % Math.max(1, list.length)];
        if (p) {
          $('sp-name').textContent = p.meta.name;
          input.orbitCam(cam, p.state.pos[0], p.state.pos[1] + 1.1, p.state.pos[2]);
        }
      }
    }
  }

  galleryFly(dt, nowPerf) {
    const m = this.gallery;
    const idx = Math.min(m.gallery.length - 1, Math.floor((nowPerf - (this.galleryStart ||= nowPerf)) / 3400));
    const e = m.gallery[idx];
    if (!e) return;
    const cam = world.camera;
    const ang = G.prefs.reducedMotion ? 0.8 : (nowPerf / 2600) % (Math.PI * 2); // con "reducir movimiento" la cámara no gira
    const r = 2.6;
    cam.position.set(e.pos[0] + Math.sin(ang) * r, e.pos[1] + 1.75, e.pos[2] + Math.cos(ang) * r);
    cam.lookAt(e.pos[0], e.pos[1] + 0.8, e.pos[2]);
    if (idx !== this.galleryIdx) {
      this.galleryIdx = idx;
      this.shotAt = nowPerf + 350;
    }
    // una foto del escondite para la galería, ya recorrido por la cámara
    if (this.shotAt && nowPerf > this.shotAt) {
      this.shotAt = 0;
      this.snapSpot(e, this.galleryShots.get(e.id));
    }
  }

  /** Dibuja un escondite en un canvas: apunta la cámara, renderiza y copia el recorte central. */
  snapSpot(e, c) {
    if (!c) return;
    const cam = world.camera;
    const savedPos = cam.position.clone();
    const savedRot = cam.rotation.clone();
    cam.position.set(e.pos[0] + 2, e.pos[1] + 1.7, e.pos[2] + 2);
    cam.lookAt(e.pos[0], e.pos[1] + 0.9, e.pos[2]);
    world.render();
    const g = c.getContext('2d');
    const src = world.renderer.domElement;
    const ar = c.width / c.height;
    const sw = Math.min(src.width, src.height * ar);
    g.drawImage(src, (src.width - sw) / 2, (src.height - sw / ar) / 2, sw, sw / ar, 0, 0, c.width, c.height);
    cam.position.copy(savedPos);
    cam.rotation.copy(savedRot);
  }

  dispose() {
    for (const p of this.players.values()) p.avatar?.dispose();
    this.players.clear();
    world.clearFx();
    world.setMap(null);
    HUD.root.hidden = true;
    HUD.pauseBtn.hidden = true;
    $('paint-ui').hidden = true;
    HUD.stun.hidden = true;
    HUD.big.hidden = true;
    document.body.classList.remove('has-panel', 'has-prep', 'has-spect');
    syncInset();
    music(null);
    input.mode = 'none';
    input.unlock();
  }
}
const r2 = (v) => Math.round(v * 100) / 100;

/** Corre la imagen 3D al centro del espacio libre: con el panel de pintura a un costado (o abajo, en vertical) el personaje no queda tapado. */
function syncInset() {
  const el = $('paint-ui');
  if (el.hidden) return world.setInset(0, 0);
  const r = el.getBoundingClientRect();
  if (r.width > innerWidth * 0.6) world.setInset(0, innerHeight - r.top); // hoja de abajo (vertical)
  else world.setInset(r.right, 0); // panel a la izquierda
}

// ---------------------------------------------------------------- pintura propia
const ownPaint = new Paint();
let client = null;
let session = null;
let online = null;

const paintUI = new PaintUI($('paint-ui'), {
  raycastAvatar(x, y) {
    const me = client?.me();
    if (!me?.avatar) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), world.camera);
    const hits = ray.intersectObjects(me.avatar.meshes, false);
    if (!hits.length || !hits[0].uv) return null;
    const uv = hits[0].uv;
    const tx = Math.min(127, Math.max(0, Math.floor(uv.x * 128)));
    const ty = Math.min(127, Math.max(0, Math.floor((1 - uv.y) * 128)));
    const part = me.avatar.meshes.indexOf(hits[0].object);
    const rect = part >= 0 ? mePartRect(part) : null;
    if (!rect) return null;
    return { part, tx, ty, u: (tx - rect[0] + 0.5) / rect[2], v: 1 - (ty - rect[1] + 0.5) / rect[3] };
  },
  pickScene(x, y, seen) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), world.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    const hit = raycastColor(world.map, o.x, o.y, o.z, d.x, d.y, d.z, 60);
    if (!hit) return null;
    const c = seen ? hit.lit : hit.color;
    return [Math.round(Math.min(255, c[0])), Math.round(Math.min(255, c[1])), Math.round(Math.min(255, c[2]))];
  },
  send(op) {
    if (!client) return;
    ownPaint.apply(op, { state: client.myState(), map: world.map });
    client.me() && client.avatarFor(client.me()).setPaint(ownPaint.data);
    session?.send({ t: 'pp', ops: [op] });
  },
  undo() {
    if (ownPaint.undo({ state: client?.myState(), map: world.map })) {
      session?.send({ t: 'undo' });
      client?.me() && client.avatarFor(client.me()).setPaint(ownPaint.data);
    }
  },
  redo() {
    if (ownPaint.redo({ state: client?.myState(), map: world.map })) {
      session?.send({ t: 'redo' });
      client?.me() && client.avatarFor(client.me()).setPaint(ownPaint.data);
    }
  },
  clearAll() {
    this.send(['c']); // borrar todo es una operación más (sincronizada y deshacible)
  },
  pose(pose, joints, yaw) {
    if (!client) return;
    client.myYawBody = yaw;
    session?.send({ t: 'pose', pose, joints, yaw: r2(yaw) });
    sfx.pose();
  },
  mats(mats) {
    session?.send({ t: 'mats', mats });
    client?.me() && client.avatarFor(client.me()).setMats(mats);
  },
});
function mePartRect(i) {
  return client?.me()?.avatar ? PART_RECTS[i] : null;
}
const PART_RECTS = BODY_PARTS.map((p) => p.rect);

// pintar arrastrando (el Input manda los gestos)
input.onDrag = (x, y, phase) => {
  if (client && !$('paint-ui').hidden) paintUI.drag(x, y, phase);
};
input.onTap = (x, y) => {
  if (!client) return;
  if (client.phase === 'seek' && client.you.team === 'seek' && !client.you.caught && client.stunT <= 0) {
    // atrapar: rayo contra los escondidos
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), world.camera);
    let best = null;
    for (const p of client.players.values()) {
      if (p.meta.team !== 'hide' || p.meta.caught || client.isMe(p.meta.id) || !p.avatar?.group.visible) continue;
      const hits = ray.intersectObjects(p.avatar.meshes, false);
      if (hits.length && (!best || hits[0].distance < best.d)) best = { id: p.meta.id, d: hits[0].distance };
    }
    const scene = raycastColor(world.map, world.camera.position.x, world.camera.position.y, world.camera.position.z, ...ray.ray.direction.toArray(), 60);
    const wallD = scene ? scene.t : 99;
    if (best && best.d < 2.9 && best.d < wallD + 0.1) session.send({ t: 'catch', id: best.id });
    else if (wallD < 2.9 || (best && best.d < 6)) session.send({ t: 'catch' }); // manotazo al aire cerca: mareo
  } else if (!$('paint-ui').hidden && paintUI.tool !== 'brush' && paintUI.tool !== 'pattern' && paintUI.tool !== 'eraser') {
    paintUI.drag(x, y, 'start');
  }
};
input.onKey = (code, down) => {
  if (!client || !down) return;
  if (code === 'KeyQ' && client.you.team === 'hide') session?.send({ t: 'whistle' });
  if (code === 'KeyE' && client.you.team === 'seek') sendMark();
  if (code === 'KeyF') client.zoomBtn = !client.zoomBtn;
  if (code === 'Tab' && client.phase === 'prep' && client.you.team === 'hide') {
    client.paintMode = !client.paintMode;
    syncPrepButtons();
    client.applyMode();
  }
  if (code === 'Escape' && input.mode !== 'fps') openPause();
};
input.onUnlock = () => {
  if (client && client.phase === 'seek' && client.you.team === 'seek' && !client.you.caught && !anyScreen()) openPause();
};

function sendMark() {
  if (!client || client.phase !== 'seek') return;
  const dir = new THREE.Vector3();
  world.camera.getWorldDirection(dir);
  const o = world.camera.position;
  const hit = raycastColor(world.map, o.x, o.y, o.z, dir.x, dir.y, dir.z, 30);
  if (hit) session.send({ t: 'mark', p: [r2(hit.x), r2(hit.y + 0.02), r2(hit.z)] });
}

// botones del HUD
$('b-whistle').onclick = () => session?.send({ t: 'whistle' });
$('b-mark').onclick = () => sendMark();
$('b-zoom').onclick = () => client && (client.zoomBtn = !client.zoomBtn);
$('b-paintmode').onclick = () => {
  client.paintMode = true;
  syncPrepButtons();
  client.applyMode();
  sfx.ui();
};
$('b-movemode').onclick = () => {
  client.paintMode = false;
  syncPrepButtons();
  client.applyMode();
  sfx.ui();
};
function syncPrepButtons() {
  $('b-paintmode').classList.toggle('on', client?.paintMode);
  $('b-movemode').classList.toggle('on', client && !client.paintMode);
}
$('b-seekerview').onclick = () => {
  if (!client) return;
  unlock();
  sfx.ui();
  if (client.seekerViewIdx < 0) {
    // puestos de observación: a 3 m y 6 m en 4 direcciones a altura de ojos + la entrada
    const p = client.pos;
    const map = world.map;
    client.seekerViews = [];
    for (const d of [3, 6]) for (let a = 0; a < 4; a++) {
      const ang = (a / 4) * Math.PI * 2;
      client.seekerViews.push([p.x + Math.sin(ang) * d, p.y + EYE, p.z + Math.cos(ang) * d]);
    }
    const s = map.spawnS[0];
    client.seekerViews.push([s[0], s[1] + EYE, s[2]]);
    client.seekerViewIdx = 0;
  } else {
    client.seekerViewIdx++;
    if (client.seekerViewIdx >= client.seekerViews.length) client.seekerViewIdx = -1;
  }
  $('b-seekerview').textContent = client.seekerViewIdx < 0 ? t('seekerView') : `${t('seekerViewOff')} · ${client.seekerViewIdx + 1}/${client.seekerViews.length}`;
  client.applyMode();
};
$('sp-prev').onclick = () => {
  client?.pickSpectTarget(-1);
  sfx.ui();
};
$('sp-next').onclick = () => {
  client?.pickSpectTarget(1);
  sfx.ui();
};
$('sp-free').onclick = () => {
  if (!client) return;
  client.spectFree = !client.spectFree;
  if (client.spectFree) {
    const c = world.camera.position;
    input.yaw = world.camera.rotation.y;
  }
  $('sp-free').classList.toggle('main', client.spectFree);
  client.applyMode();
  sfx.ui();
};
{
  const rb = $('react-bar');
  REACTIONS.forEach((e, i) => {
    const b = document.createElement('button');
    b.textContent = e;
    b.onclick = () => session?.send({ t: 'react', e: i });
    rb.append(b);
  });
}
$('sp-prev').textContent = t('specPrev');
$('sp-next').textContent = t('specNext');

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  syncGameplay();
}
function hideScreens() {
  show(null);
}
const anyScreen = () => $$('.screen.on').length > 0;
function syncGameplay() {
  G.gameplay(!!client && (client.phase === 'prep' || client.phase === 'seek') && !anyScreen());
}

function openPause() {
  if (!client || anyScreen()) return;
  $('pause-hint').textContent = client.mode === 'online' ? t('pausedOnline') : '';
  if (session?.pause && client.mode !== 'online') session.pause();
  input.unlock();
  show('pause');
}
$('p-resume').onclick = () => {
  if (session?.resume && client?.mode !== 'online') session.resume();
  hideScreens();
  client?.applyMode();
};
$('p-quit').onclick = () => quitToMenu();
// regla de la plataforma: el botón de salir del menú de pausa del juego vuelve al menú del portal
$('p-exit').onclick = () => G.exit();
$('b-pause').onclick = () => openPause();
G.onPause(() => client && client.mode !== 'online' && session?.pause?.());
G.onResume(() => client && client.mode !== 'online' && !anyScreen() && !rotating() && session?.resume?.());

// celular parado: el cartel "Girá el celular" tapa el juego (CSS); una partida local se frena mientras está a la vista.
// Online no se puede frenar (la partida sigue en el servidor), igual que con la pausa del portal.
const portraitTouch = matchMedia('(orientation: portrait) and (pointer: coarse)');
const rotating = () => portraitTouch.matches && !document.body.classList.contains('igual');
function syncRotate() {
  if (!client || client.mode === 'online' || !session?.pause) return;
  if (rotating()) session.pause();
  else if (!anyScreen() && !G.paused) session.resume();
}
portraitTouch.addEventListener('change', syncRotate);
$('rotate-ok').onclick = () => {
  document.body.classList.add('igual');
  syncRotate();
};

function quitToMenu() {
  if (client) {
    client.dispose();
    client = null;
  }
  if (session) {
    session.leave();
    session = null;
  }
  if (online) {
    online.leave();
  }
  menuScene(true);
  show('home');
  syncGameplay();
}

// ---------------------------------------------------------------- menú con escena de fondo
let menuOn = false;
let menuAvatars = [];
function menuScene(on) {
  if (on === menuOn) return;
  menuOn = on;
  for (const a of menuAvatars) a.dispose();
  menuAvatars = [];
  if (!on) return;
  world.setMap('mansion');
  const a = new Avatar(world, { name: '', color: '#3ec1ff' });
  a.setState({ pos: [-6.2, 0, 1.4], yaw: Math.PI * 0.9, pose: 'wall', joints: [] });
  const pr = new Paint();
  pr.apply(['P', 99, 3, -6.2, 1.6, 5], { state: { pos: [-6.2, 0, 1.4], yaw: Math.PI * 0.9, pose: 'wall', joints: [] }, map: getMap('mansion') });
  a.setPaint(pr.data);
  const b = new Avatar(world, { name: '', color: '#ffc93c', seeker: true });
  b.setState({ pos: [-4.4, 0, -1.2], yaw: 2.6, pose: 'stand', joints: [] });
  b.setName('???', '#ffc93c');
  menuAvatars = [a, b];
}

// ---------------------------------------------------------------- lobby online
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom('disimula', {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined) $('on-status').textContent = txt;
    },
    onRoom: onRoomView,
    onMessage: onOnlineMsg,
  });
  return online;
}

function myName() {
  return ($('on-name').value || opts.name || defaultName()).trim().slice(0, 16);
}

function onOnlineMsg(m) {
  if (m.t === 'list') return renderRoomList(m.rooms);
  if (m.t === 'error') {
    const txt = netText(m.code);
    $('on-status').textContent = txt;
    $('lobby-status').textContent = m.code === 'need_players' ? t('needPlayers') : txt;
    return;
  }
  if (m.t === 'closed' || m.t === 'kicked') {
    quitToMenu();
    show('online');
    $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
    return;
  }
  if (m.t === 'end') {
    ensureClient();
    client.handle(m);
    return;
  }
  // mensajes de la partida
  if (['state', 'phase', 'you', 'pl', 'hider', 'mv', 'pose', 'pp', 'mats', 'undo', 'redo', 'whistle', 'caught', 'stun', 'mark', 'react', 'fix', 'round', 'chat'].includes(m.t)) {
    ensureClient();
    client.handle(m);
  }
}

function ensureClient() {
  if (client) return client;
  menuScene(false);
  session = {
    send: (msg) => online.send(msg),
    now: () => online.serverNow(),
    leave: () => online.leave(),
  };
  client = new GameClient(session, { myId: online.myId, mode: 'online' });
  hideScreens();
  return client;
}

function onRoomView(room) {
  if (room.state === 'lobby') {
    if (client) {
      // la partida volvió al lobby (revancha)
      client.dispose();
      client = null;
      session = null;
      menuScene(true);
    }
    renderLobby(room);
  } else if (room.state === 'finished' && client) {
    // la pantalla final ya la muestra el mensaje 'end'
  }
}

const SETTING_DEFS = [
  ['map', 'sMap', MAP_IDS, (v) => G.t(getMap(v).name)],
  ['maxPlayers', 'sPlayers', [2, 4, 6, 8, 10], (v) => v],
  ['prep', 'sPrep', [45, 60, 90, 120, 180], (v) => t('secs', { n: v })],
  ['seek', 'sSeek', [60, 120, 180, 240, 360], (v) => fmtTime(v * 1000)],
  ['seekers', 'sSeekers', [0, 1, 2, 3, 4], (v) => (v === 0 ? t('sAuto') : v)],
  ['rounds', 'sRounds', [1, 2, 3, 5, 10], (v) => v],
  ['whistle', 'sWhistle', WHISTLES, (v) => (v === 0 ? t('sOff') : t('secs', { n: v }))],
  ['bots', 'sBots', [0, 1, 2, 3, 4, 6, 8], (v) => v],
  ['botLevel', 'sBotLevel', [1, 2, 3], (v) => t(`lv${v}`)],
];

function renderSettings(el, st, editable, onChange) {
  el.innerHTML = SETTING_DEFS.map(
    ([key, lbl, vals, fmt]) => `
    <div class="set" data-k="${key}"><span>${t(lbl)}</span><div class="seg">
      ${vals.map((v) => `<button data-v="${v}" ${editable ? '' : 'disabled'} class="${String(st[key]) === String(v) ? 'on' : ''}">${fmt(v)}</button>`).join('')}
    </div></div>`,
  ).join('');
  if (editable)
    el.onclick = (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      const k = b.closest('.set').dataset.k;
      const v = k === 'map' ? b.dataset.v : Number(b.dataset.v);
      sfx.ui();
      onChange(k, v);
    };
}

function renderLobby(room) {
  $('lobby-code').textContent = room.code;
  const st = room.settings || {};
  $('lobby-players').innerHTML = room.players
    .map((p, i) => {
      const tags = [p.id === online.myId ? t('you') : '', p.id === room.host ? t('host') : '', i >= (st.maxPlayers || 10) ? t('spectator') : ''].filter(Boolean).join(' · ');
      return `<li class="${p.connected ? '' : 'off'}"><i class="dot" style="background:${p.color}"></i><span>${esc(p.name)}</span><small>${tags}</small></li>`;
    })
    .join('') +
    Array.from({ length: Math.min(st.bots || 0, 10 - room.players.length) }, (_, i) => `<li><i class="dot" style="background:${BOT_COLORS[i % BOT_COLORS.length]}"></i><span>${BOT_NAMES[i % BOT_NAMES.length]}</span><small>${t('bot')} ${t(`lv${st.botLevel || 2}`)}</small></li>`).join('');
  renderSettings($('lobby-settings'), st, online.isHost, (k, v) => online.send({ t: 'settings', settings: { ...st, [k]: v } }));
  $('lobby-start').hidden = !online.isHost;
  const enough = room.players.filter((p) => p.connected).length + Math.min(st.bots || 0, 10 - room.players.length) >= 2;
  $('lobby-status').textContent = online.isHost ? (enough ? '' : t('needPlayers')) : t('waitingHost');
  show('lobby');
}

function renderRoomList(rooms) {
  const ul = $('room-list');
  if (!rooms.length) {
    ul.innerHTML = `<li class="empty">${t('noRooms')}</li>`;
    return;
  }
  ul.innerHTML = rooms
    .map((r) => `<li><b>${esc(r.name || r.code)}</b><small>${G.t(getMap(r.map || 'mansion').name)} · ${r.n}/${r.max} ${t('players')}${r.state === 'playing' ? ' · ' + t('inRound') : ''}</small><button class="pill main" data-join="${r.code}">${t('join')}</button></li>`)
    .join('');
}

$('on-create').onclick = () => {
  unlock();
  opts.name = myName();
  store.set('opts', opts);
  ensureOnline().create(myName(), { public: false });
};
$('on-create-pub').onclick = () => {
  unlock();
  opts.name = myName();
  store.set('opts', opts);
  ensureOnline().create(myName(), { public: true, name: `${myName()}` });
};
$('on-join').onclick = () => {
  unlock();
  const raw = $('on-code').value.trim();
  const m = /room=([A-Za-z0-9]{4,6})/.exec(raw);
  const code = (m ? m[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (code.length === 5) ensureOnline().join(code, myName());
};
$('on-refresh').onclick = () => {
  sfx.ui();
  ensureOnline().send({ t: 'list', game: 'disimula' });
};
$('room-list').onclick = (e) => {
  const b = e.target.closest('[data-join]');
  if (b) {
    unlock();
    ensureOnline().join(b.dataset.join, myName());
  }
};
$('lobby-share').onclick = async () => {
  const r = await share('disimula', online.room?.code);
  $('lobby-status').textContent = r === 'copied' ? t('copied') : '';
};
$('lobby-start').onclick = () => {
  unlock();
  online.send({ t: 'start' });
};
$('lobby-leave').onclick = () => {
  online.leave();
  show('online');
};

// ---------------------------------------------------------------- pantalla final
function showFinal(m, cl) {
  $('final-list').innerHTML = m.standings
    .map((s, i) => `<li class="${i === 0 ? 'win' : ''}"><span class="pos">${i + 1}</span><i class="dot" style="background:${s.color}"></i>${esc(s.name)}${s.bot ? ' 🤖' : ''}<b class="pts">${s.score}</b></li>`)
    .join('');
  const meRow = m.standings.find((s) => cl && (s.id === cl.myId || s.id === 'me'));
  const st = meRow?.stats;
  $('final-stats').innerHTML = st
    ? `<div class="st"><small>${t('stCatches')}</small><b>${st.catches}</b></div>
       <div class="st"><small>${t('stHidden')}</small><b>${fmtTime(st.hiddenMs)}</b></div>
       <div class="st"><small>${t('stMisses')}</small><b>${st.misses}</b></div>
       <div class="st"><small>${t('stCamo')}</small><b>${st.camo}</b></div>`
    : '';
  $('f-again').hidden = client?.mode === 'online' && !online?.isHost;
  $('f-lobby').hidden = client?.mode !== 'online';
  show('final');
  sfx[meRow && m.standings[0] && meRow.id === m.standings[0].id ? 'win' : 'ok']();
}
$('f-again').onclick = () => {
  unlock();
  if (client?.mode === 'online') online.send({ t: 'again' });
  else if (session?.again) {
    hideScreens();
    session.again();
  }
};
$('f-lobby').onclick = () => {
  if (client?.mode === 'online') online.send({ t: 'rematch' });
};
$('f-menu').onclick = () => quitToMenu();

// ---------------------------------------------------------------- práctica y bots
let botsCfg = Object.assign({ map: 'mansion', role: 'hide', bots: 4, botLevel: 2, prep: 60, seek: 120, rounds: 3, whistle: 45, seekers: 0, maxPlayers: 10 }, store.get('bots', {}));

function mapButtons(el, selected, onPick) {
  el.innerHTML = '';
  for (const id of MAP_IDS) {
    const b = document.createElement('button');
    b.className = id === selected ? 'on' : '';
    const c = document.createElement('canvas');
    c.width = 180;
    c.height = 84;
    drawMapPreview(c, id);
    const lbl = document.createElement('b');
    lbl.textContent = G.t(getMap(id).name);
    b.append(c, lbl);
    b.onclick = () => {
      sfx.ui();
      onPick(id);
    };
    el.append(b);
  }
}

function renderBotsSetup() {
  const el = $('bots-settings');
  el.innerHTML = `
    <div class="set"><span>${t('sMap')}</span><div class="maps" id="bots-maps"></div></div>
    <div class="set"><span>${t('botsRole')}</span><div class="seg" data-k="role">
      <button data-v="hide">${t('roleHide')}</button><button data-v="seek">${t('roleSeek')}</button><button data-v="mix">${t('roleMix')}</button>
    </div></div>
    <div class="set"><span>${t('botsCount')}</span><div class="seg" data-k="bots">${[2, 3, 4, 5, 7, 9].map((n) => `<button data-v="${n}">${n}</button>`).join('')}</div></div>
    <div class="set"><span>${t('sBotLevel')}</span><div class="seg" data-k="botLevel">${[1, 2, 3].map((n) => `<button data-v="${n}">${t(`lv${n}`)}</button>`).join('')}</div></div>
    <div class="set"><span>${t('sPrep')}</span><div class="seg" data-k="prep">${[45, 60, 90, 120].map((n) => `<button data-v="${n}">${t('secs', { n })}</button>`).join('')}</div></div>
    <div class="set"><span>${t('sSeek')}</span><div class="seg" data-k="seek">${[60, 120, 180, 240].map((n) => `<button data-v="${n}">${fmtTime(n * 1000)}</button>`).join('')}</div></div>
    <div class="set"><span>${t('sRounds')}</span><div class="seg" data-k="rounds">${[1, 3, 5].map((n) => `<button data-v="${n}">${n}</button>`).join('')}</div></div>
    <div class="set"><span>${t('sWhistle')}</span><div class="seg" data-k="whistle">${WHISTLES.map((n) => `<button data-v="${n}">${n === 0 ? t('sOff') : t('secs', { n })}</button>`).join('')}</div></div>`;
  mapButtons(el.querySelector('#bots-maps'), botsCfg.map, (id) => {
    botsCfg.map = id;
    renderBotsSetup();
  });
  $$('.seg', el).forEach((seg) => {
    const k = seg.dataset.k;
    $$('button', seg).forEach((b) => b.classList.toggle('on', String(botsCfg[k]) === b.dataset.v));
    seg.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      botsCfg[k] = k === 'role' ? b.dataset.v : Number(b.dataset.v);
      sfx.ui();
      store.set('bots', botsCfg);
      renderBotsSetup();
    };
  });
}

$('bots-go').onclick = () => {
  unlock();
  store.set('bots', botsCfg);
  startLocal();
};

function startLocal() {
  menuScene(false);
  const settings = { ...DEFAULTS, ...botsCfg, public: false };
  session = new LocalSession((m) => client?.handle(m), null, { settings, role: botsCfg.role, name: opts.name || defaultName() });
  client = new GameClient(session, { myId: 'me', mode: 'bots' });
  hideScreens();
  session.start();
}

function startPractice(mapId) {
  menuScene(false);
  session = new PracticeSession();
  client = new GameClient(session, { myId: 'me', mode: 'practice' });
  client.handle({ t: 'pl', players: [{ id: 'me', name: opts.name || defaultName(), color: '#3ec1ff', team: 'hide', caught: false, score: 0, connected: true, spectator: false }] });
  client.handle({ t: 'state', phase: 'prep', round: 0, rounds: 1, map: mapId, whistle: 0, endsAt: 0, players: [{ id: 'me', name: opts.name || defaultName(), color: '#3ec1ff', team: 'hide', connected: true }], you: { team: 'hide', spectator: false, caught: false, pos: getMap(mapId).spawnH[0], yaw: 0 } });
  hideScreens();
}

// ---------------------------------------------------------------- opciones y ayuda
function renderOptions() {
  const el = $('options-body');
  el.innerHTML = `
    <label class="field"><span>${t('optName')}</span><input id="opt-name" maxlength="16" value="${esc(opts.name || defaultName())}" /></label>
    <div class="jrow"><span>${t('optMusic')}</span><input id="opt-music" type="range" min="0" max="100" value="${Math.round(opts.music * 100)}"/></div>
    <div class="jrow"><span>${t('optSfx')}</span><input id="opt-sfx" type="range" min="0" max="100" value="${Math.round(opts.sfx * 100)}"/></div>
    <div class="jrow"><span>${t('optSens')}</span><input id="opt-sens" type="range" min="30" max="250" value="${Math.round(opts.sens * 100)}"/></div>`;
  $('opt-name').onchange = (e) => {
    opts.name = e.target.value.trim().slice(0, 16);
    store.set('opts', opts);
  };
  $('opt-music').oninput = (e) => {
    opts.music = vol.music = e.target.value / 100;
    store.set('opts', opts);
  };
  $('opt-sfx').oninput = (e) => {
    opts.sfx = vol.sfx = e.target.value / 100;
    store.set('opts', opts);
    sfx.ui();
  };
  $('opt-sens').oninput = (e) => {
    opts.sens = input.sens = e.target.value / 100;
    store.set('opts', opts);
  };
}

// navegación
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) {
    unlock();
    sfx.ui();
    const k = go.dataset.go;
    if (k === 'modes') return show('modes');
    if (k === 'help') {
      $('help-body').innerHTML = G.t(TXT.helpBody).map((l) => `<p>${l}</p>`).join('');
      $('ctrl-body').innerHTML = G.t(TXT.ctrlBody).map((l) => `<p>${l}</p>`).join('');
      return show('help');
    }
    if (k === 'options') {
      renderOptions();
      return show('options');
    }
  }
  const mode = e.target.closest('[data-mode]');
  if (mode) {
    unlock();
    sfx.ui();
    const k = mode.dataset.mode;
    $('on-name').value = opts.name || defaultName();
    if (k === 'online') {
      $('online-title').textContent = t('mOnline');
      $('public-zone').hidden = true;
      $('online-private').hidden = false;
      return show('online');
    }
    if (k === 'public') {
      $('online-title').textContent = t('mPublic');
      $('public-zone').hidden = false;
      $('online-private').hidden = true;
      ensureOnline().send({ t: 'list', game: 'disimula' });
      return show('online');
    }
    if (k === 'practice') {
      mapButtons($('practice-maps'), null, (id) => startPractice(id));
      return show('practice');
    }
    if (k === 'bots') {
      renderBotsSetup();
      return show('bots');
    }
  }
  if (e.target.closest('[data-back]')) {
    sfx.ui();
    if (client) {
      hideScreens();
      client.applyMode();
    } else show('home');
  }
});

// ---------------------------------------------------------------- bucle principal
let last = performance.now();
let menuT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.paused && client?.mode !== 'online') {
    return;
  }
  if (client) {
    client.frame(dt, now);
  } else if (menuOn) {
    if (!G.prefs.reducedMotion) menuT += dt;
    const cam = world.camera;
    cam.position.set(-6.2 + Math.sin(menuT * 0.12) * 4.2, 1.7 + Math.sin(menuT * 0.07) * 0.3, 3.6 + Math.cos(menuT * 0.1) * 1.6);
    cam.lookAt(-5.6, 1.1, 0.2);
    for (const a of menuAvatars) a.update(dt, now / 1000);
  }
  world.update(dt);
  world.autoScale(dt);
  world.render();
}

// ---------------------------------------------------------------- arranque
G.onPrefs(() => {
  document.documentElement.lang = G.prefs.lang;
  applyTexts();
  $('home-title').textContent = t('title');
  if (!client && anyScreen()) applyTexts();
}, true);
addEventListener('resize', () => {
  world.resize();
  syncInset();
});
addEventListener('keydown', (e) => {
  if (e.code === 'Tab' && client) e.preventDefault();
});

menuScene(true);
const urlCode = roomFromUrl();
if (urlCode) {
  $('on-name').value = opts.name || defaultName();
  $('on-code').value = urlCode;
  $('online-title').textContent = t('mOnline');
  $('public-zone').hidden = true;
  show('online');
  ensureOnline().join(urlCode, myName());
} else if (ensureOnline().resume()) {
  show('online');
} else {
  show('home');
}
requestAnimationFrame(frame);
G.gameplay(false);
G.ready();

if (/[?&]debug\b/.test(location.search)) window.__disimula = { get client() { return client; }, get session() { return session; }, get online() { return online; }, world, input, paintUI, ownPaint, startPractice, startLocal };
