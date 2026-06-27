import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// --- /cine — "salle de montage flottante" -----------------------------------
// One photogram per film floating in a dark space. Drag to roam, scroll to zoom,
// click a frame for the detail (poster + all frames + Letterboxd). React island.

const small = (url) => url.replace('/w1280/', '/w780/');

// --- date-driven frame rotation ----------------------------------------------
// Each film stores many frames; we show one that advances every 2 days. Seeded by
// the date (same for everyone on a given day, deterministic) and offset per film
// (via a slug hash) so the wall doesn't flip in unison. No rebuild/cron needed —
// the browser computes today's pick on load.
const ROTATE_DAYS = 2;
const PERIOD = Math.floor(Date.now() / (ROTATE_DAYS * 86400000));
const hashStr = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };
const frameIndex = (f) => (PERIOD + hashStr(f.slug)) % f.frames.length;
const frameOfDay = (f) => f.frames[frameIndex(f)];
// A sliding window of `n` frame indices centred on the active one, clamped to
// the ends, so the detail panel's contact strip follows navigation and always
// shows (and highlights) the current photogram.
const windowAround = (len, active, n = 5) => {
  const span = Math.min(n, len);
  const start = Math.max(0, Math.min(active - Math.floor(span / 2), len - span));
  return Array.from({ length: span }, (_, k) => start + k);
};

// Sticker colours for the list "index tabs" on the dossier.
const TABCOLORS = ['#f2c14e', '#86b3c4', '#e0937f', '#a7c489'];

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function useFrames(films) {
  return useMemo(() => {
    const rnd = mulberry32(7);
    const list = films.filter((f) => f.frames && f.frames.length);
    const N = list.length;
    // Random scatter (the "bordel") then relax overlaps so nothing stays hidden.
    const items = list.map((f) => {
      const w = 6 + rnd() * 3.2;
      const aspect = frameOfDay(f).aspect || 1.778;
      return {
        f, w, h: w / aspect,
        x: (rnd() - 0.5) * 52,
        y: (rnd() - 0.5) * 30,
        z: -rnd() * 8,
        rot: (rnd() - 0.5) * 0.22,
      };
    });
    const gap = 0.5;
    for (let it = 0; it < 80; it++) {
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const a = items[i], b = items[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const ox = (a.w + b.w) / 2 + gap - Math.abs(dx);
        const oy = (a.h + b.h) / 2 + gap - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox < oy) { const s = (dx < 0 ? -1 : 1) * ox / 2; a.x -= s; b.x += s; }
          else { const s = (dy < 0 ? -1 : 1) * oy / 2; a.y -= s; b.y += s; }
        }
      }
    }
    return items.map((it) => ({
      film: it.f,
      tex: small(frameOfDay(it.f).url),
      size: [it.w, it.h],
      pos: [it.x, it.y, it.z],
      rot: it.rot,
    }));
  }, [films]);
}

function Photogram({ item, movedRef, onSelect, setHover }) {
  const groupRef = useRef();
  const [map, setMap] = useState(null);
  const [hovered, setHovered] = useState(false);
  const [w, h] = item.size;

  useEffect(() => {
    let live = true;
    new THREE.TextureLoader().load(item.tex, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      if (live) setMap(t);
    });
    return () => { live = false; };
  }, [item.tex]);

  useFrame(() => {
    const s = THREE.MathUtils.lerp(groupRef.current.scale.x, hovered ? 1.05 : 1, 0.12);
    groupRef.current.scale.set(s, s, s);
  });

  return (
    <group ref={groupRef} position={item.pos} rotation={[0, item.rot, 0]}>
      {hovered && (
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[w + 0.12, h + 0.12]} />
          <meshBasicMaterial color="#e14b2a" />
        </mesh>
      )}
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); setHover(item.film.title); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); setHover(null); document.body.style.cursor = ''; }}
        onClick={(e) => { e.stopPropagation(); if (!movedRef.current) onSelect(item.film); }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial key={map ? 'tex' : 'placeholder'} map={map || null} color={map ? [1.12, 1.12, 1.12] : '#101015'} toneMapped={false} />
      </mesh>
    </group>
  );
}

const ZMIN = 6, ZMAX = 24;

function Rig({ movedRef, bounds }) {
  const { camera, gl, size } = useThree();
  const target = useRef({ x: 0, y: 0, z: 16 }); // left-drag pan + wheel zoom
  const pivot = useRef({ x: 0, y: 0 });          // middle-drag look-around (target)
  const pivotS = useRef({ x: 0, y: 0 });         // smoothed value used for lookAt
  const drag = useRef({ on: false, mode: null, x: 0, y: 0, moved: 0 });

  useEffect(() => {
    const el = gl.domElement;
    const clamp = THREE.MathUtils.clamp;
    // world units per screen pixel on the z=0 plane (where the frames sit)
    const wpp = (z) => (2 * Math.tan((camera.fov * Math.PI) / 180 / 2) * z) / size.height;

    const down = (e) => {
      const mode = e.button === 1 ? 'pivot' : 'pan'; // middle button = pivot
      if (mode === 'pivot') e.preventDefault();
      drag.current = { on: true, mode, x: e.clientX, y: e.clientY, moved: 0 };
      movedRef.current = false;
    };
    const up = () => { drag.current.on = false; drag.current.mode = null; };
    const move = (e) => {
      if (!drag.current.on) return;
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      drag.current.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.current.moved > 6) movedRef.current = true;
      if (drag.current.mode === 'pivot') {
        pivot.current.x = clamp(pivot.current.x + dx * 0.016, -7, 7); // look around (camera tilts)
        pivot.current.y = clamp(pivot.current.y - dy * 0.016, -5, 5);
      } else {
        const k = wpp(target.current.z); // flat 1:1 pan — content sticks to the cursor
        target.current.x = clamp(target.current.x - dx * k, -bounds.x, bounds.x);
        target.current.y = clamp(target.current.y + dy * k, -bounds.y, bounds.y);
      }
      drag.current.x = e.clientX; drag.current.y = e.clientY;
    };
    const wheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left - size.width / 2;
      const sy = e.clientY - rect.top - size.height / 2;
      const oldK = wpp(target.current.z);
      const wx = target.current.x + sx * oldK; // world point under cursor (before zoom)
      const wy = target.current.y - sy * oldK;
      target.current.z = clamp(target.current.z + e.deltaY * 0.012, ZMIN, ZMAX);
      const newK = wpp(target.current.z);
      target.current.x = clamp(wx - sx * newK, -bounds.x, bounds.x); // keep it under cursor
      target.current.y = clamp(wy + sy * newK, -bounds.y, bounds.y);
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    el.addEventListener('pointermove', move);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl, bounds, size.width, size.height]);

  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt * 0.5;
    const g = target.current;
    const driftX = Math.sin(t.current) * 0.1, driftY = Math.cos(t.current * 0.8) * 0.07;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, g.x + driftX, 0.06);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, g.y + driftY, 0.06);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, g.z, 0.1);
    // ease the look-around back to neutral unless actively pivoting
    if (drag.current.mode !== 'pivot') {
      pivot.current.x = THREE.MathUtils.lerp(pivot.current.x, 0, 0.02);
      pivot.current.y = THREE.MathUtils.lerp(pivot.current.y, 0, 0.02);
    }
    // smooth the pivot toward its target (same softness as the left-drag pan)
    pivotS.current.x = THREE.MathUtils.lerp(pivotS.current.x, pivot.current.x, 0.07);
    pivotS.current.y = THREE.MathUtils.lerp(pivotS.current.y, pivot.current.y, 0.07);
    // look target = straight ahead + pivot + gentle idle sway (the circular drift)
    const lx = camera.position.x + pivotS.current.x + Math.sin(t.current) * 0.32;
    const ly = camera.position.y + pivotS.current.y + Math.cos(t.current * 0.8) * 0.2;
    camera.lookAt(lx, ly, camera.position.z - 12);
  });

  return null;
}

function ContactSheet({ films }) {
  return (
    <div className="cn-sheet">
      {films.filter((f) => f.frames && f.frames.length).map((f) => (
        <a key={f.slug} href={f.letterboxd} target="_blank" rel="noreferrer" className="cn-cell">
          <img src={small(frameOfDay(f).url)} alt={f.title} loading="lazy" />
          <span>{f.title} · {f.year}</span>
        </a>
      ))}
    </div>
  );
}

export default function CineSpace({ films }) {
  const [eligible, setEligible] = useState(null);
  const [selected, setSelected] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [about, setAbout] = useState(false);
  const [hover, setHover] = useState(null);
  const movedRef = useRef(false);
  const stageRef = useRef();
  const cursorRef = useRef();
  const items = useFrames(films);
  const bounds = useMemo(() => {
    let x = 6, y = 4;
    items.forEach((it) => { x = Math.max(x, Math.abs(it.pos[0])); y = Math.max(y, Math.abs(it.pos[1])); });
    return { x: x + 2, y: y + 2 };
  }, [items]);

  // When a film opens, start the projector on today's frame-of-day.
  useEffect(() => { if (selected) setActiveIdx(frameIndex(selected)); }, [selected]);

  // Escape closes whichever overlay is open.
  useEffect(() => {
    if (!selected && !about) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { setSelected(null); setAbout(false); }
      if (selected) {
        if (e.key === 'ArrowLeft') setActiveIdx((i) => Math.max(0, i - 1));
        if (e.key === 'ArrowRight') setActiveIdx((i) => Math.min(selected.frames.length - 1, i + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, about]);

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const big = matchMedia('(min-width: 768px)').matches;
    let webgl = false;
    try { webgl = !!document.createElement('canvas').getContext('webgl'); } catch {}
    setEligible(big && !reduced && webgl);
  }, []);

  // Hover-to-navigate on the hero print: a directional arrow cursor that points
  // left/right depending on the mouse half, and hides when there's nothing left
  // that way (no wrap). Cursor element is moved imperatively to avoid re-renders.
  const navAt = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    const left = (e.clientX - r.left) < r.width / 2;
    const avail = left ? activeIdx > 0 : activeIdx < selected.frames.length - 1;
    return { left, avail, r };
  };
  const onStageMove = (e) => {
    const cur = cursorRef.current, st = stageRef.current;
    if (!cur || !st) return;
    const { left, avail, r } = navAt(e);
    if (!avail) { cur.style.display = 'none'; st.style.cursor = 'default'; return; }
    st.style.cursor = 'none';
    cur.style.display = 'flex';
    cur.textContent = left ? '←' : '→';
    cur.style.left = `${e.clientX - r.left}px`;
    cur.style.top = `${e.clientY - r.top}px`;
  };
  const onStageLeave = () => { if (cursorRef.current) cursorRef.current.style.display = 'none'; };
  const onStageClick = (e) => {
    const { left, avail } = navAt(e);
    if (!avail) return;
    setActiveIdx((i) => left ? Math.max(0, i - 1) : Math.min(selected.frames.length - 1, i + 1));
  };

  if (eligible === null) return null;
  if (!eligible) return <ContactSheet films={films} />;

  return (
    <>
      <Canvas
        camera={{ fov: 55, position: [0, 0, 16], near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ scene }) => { scene.fog = new THREE.FogExp2(0x08080b, 0.012); }}
      >
        <Rig movedRef={movedRef} bounds={bounds} />
        {items.map((it, i) => (
          <Photogram key={i} item={it} movedRef={movedRef} onSelect={setSelected} setHover={setHover} />
        ))}
      </Canvas>

      <div className="cn-vig" />
      <div className="cn-hud cn-tl">
        <div className="cn-title">CINÉ — RAFRAF</div>
        <div className="cn-sub">{items.length} FRAMES · BEST OF + LISTES</div>
      </div>
      <button className="cn-hud cn-tr cn-btn" onClick={() => setAbout(true)}>→ ABOUT</button>
      <div className="cn-hud cn-bl cn-hint">drag to roam · scroll to zoom · click a frame</div>
      <div className="cn-hud cn-br cn-hov" style={{ opacity: hover ? 1 : 0 }}>{hover?.toUpperCase()}</div>

      {selected && (
        <div className="cn-overlay" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="cn-dossier">
            <button className="cn-close" onClick={() => setSelected(null)} aria-label="Fermer">✕</button>

            <div className="cn-left">
              <div className="cn-poster-tape">
                <span className="cn-tape" />
                {selected.poster
                  ? <img className="cn-poster" src={selected.poster} alt={`Affiche — ${selected.title}`} />
                  : <div className="cn-poster cn-poster-ph" />}
              </div>
              {selected.rating ? (
                <div className="cn-stamp">{'★'.repeat(Math.floor(selected.rating))}{selected.rating % 1 ? '½' : ''}</div>
              ) : null}
              {selected.lists?.length > 0 && (
                <div className="cn-tabs">
                  {selected.lists.map((l, i) => (
                    <span
                      key={l.list}
                      className="cn-tab"
                      style={{ background: TABCOLORS[i % TABCOLORS.length], transform: `rotate(${(i % 2 ? 1 : -1) * (1.5 + i)}deg)` }}
                    >
                      {l.name} <b>#{l.rank}</b>
                    </span>
                  ))}
                </div>
              )}
              {selected.director && <div className="cn-scribble">réal. {selected.director}</div>}
            </div>

            <div className="cn-right">
              <div>
                <h2 className="cn-dtitle">{selected.title}</h2>
                <div className="cn-typed">
                  {selected.year}{selected.runtime ? ` · ${selected.runtime} min` : ''} · {selected.frames.length} photogrammes
                </div>
              </div>

              <div className="cn-print-hero">
                <div className="cn-stage" ref={stageRef} onMouseMove={onStageMove} onMouseLeave={onStageLeave} onClick={onStageClick}>
                  <img key={activeIdx} src={selected.frames[activeIdx]?.url} alt="" />
                  <div className="cn-cursor" ref={cursorRef} aria-hidden="true">→</div>
                </div>
                <span className="cn-print-cap">nº {String(activeIdx + 1).padStart(2, '0')} / {selected.frames.length}</span>
              </div>

              <div className="cn-prints">
                {windowAround(selected.frames.length, activeIdx).map((idx, k) => (
                  <button
                    key={idx}
                    className={'cn-thumb' + (idx === activeIdx ? ' is-active' : '')}
                    onClick={() => setActiveIdx(idx)}
                    style={{ transform: `rotate(${[-3, 2, -1.5, 3, -2][k % 5]}deg)` }}
                    aria-label={`Photogramme ${k + 1}`}
                  >
                    <img src={small(selected.frames[idx].url)} alt="" loading="lazy" />
                  </button>
                ))}
              </div>

              <a href={selected.letterboxd} target="_blank" rel="noreferrer" className="cn-lb">voir sur Letterboxd ↗</a>
            </div>
          </div>
        </div>
      )}

      {about && (
        <div className="cn-overlay" onClick={(e) => e.target === e.currentTarget && setAbout(false)}>
          <div className="cn-aboutpane">
            <div className="cn-alabel">À propos</div>
            <p>Ici ton pavé. Pourquoi le cinéma, ce que tu cherches dans une image — cadrage, lumière, grain. (Texte à écrire.)</p>
            <div className="cn-asign">— rafraf</div>
            <button onClick={() => setAbout(false)}>fermer</button>
          </div>
        </div>
      )}
    </>
  );
}
