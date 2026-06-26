import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// --- /cine — "salle de montage flottante" -----------------------------------
// One photogram per film floating in a dark space. Drag to roam, scroll to zoom,
// click a frame for the detail (poster + all frames + Letterboxd). React island.

const small = (url) => url.replace('/w1280/', '/w780/');
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
      const aspect = f.frames[0].aspect || 1.778;
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
      tex: small(it.f.frames[0].url),
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
          <meshBasicMaterial color="#d8b25a" />
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
      {films.flatMap((f) =>
        (f.frames || []).map((fr, i) => (
          <a key={f.slug + i} href={f.letterboxd} target="_blank" rel="noreferrer" className="cn-cell">
            <img src={small(fr.url)} alt={f.title} loading="lazy" />
            <span>{f.title} · {f.year}</span>
          </a>
        ))
      )}
    </div>
  );
}

export default function CineSpace({ films }) {
  const [eligible, setEligible] = useState(null);
  const [selected, setSelected] = useState(null);
  const [about, setAbout] = useState(false);
  const [hover, setHover] = useState(null);
  const movedRef = useRef(false);
  const items = useFrames(films);
  const bounds = useMemo(() => {
    let x = 6, y = 4;
    items.forEach((it) => { x = Math.max(x, Math.abs(it.pos[0])); y = Math.max(y, Math.abs(it.pos[1])); });
    return { x: x + 2, y: y + 2 };
  }, [items]);

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const big = matchMedia('(min-width: 768px)').matches;
    let webgl = false;
    try { webgl = !!document.createElement('canvas').getContext('webgl'); } catch {}
    setEligible(big && !reduced && webgl);
  }, []);

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
          <div className="cn-detail">
            {selected.poster && <img className="cn-poster" src={selected.poster} alt="" />}
            <div className="cn-info">
              <div className="cn-dtitle">{selected.title}</div>
              <div className="cn-dmeta">
                {selected.year}
                {selected.rating ? ` · ${'★'.repeat(Math.floor(selected.rating))}${selected.rating % 1 ? '½' : ''}` : ''}
                {selected.lists.map((l) => ` · ${l.name} #${l.rank}`).join('')}
              </div>
              <div className="cn-frames">
                {selected.frames.map((fr, i) => <img key={i} src={small(fr.url)} alt="" />)}
              </div>
              <div className="cn-actions">
                <a href={selected.letterboxd} target="_blank" rel="noreferrer" className="cn-lb">view on Letterboxd ↗</a>
                <button onClick={() => setSelected(null)}>close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {about && (
        <div className="cn-overlay" onClick={(e) => e.target === e.currentTarget && setAbout(false)}>
          <div className="cn-aboutpane">
            <div className="cn-alabel">ABOUT</div>
            <p>Ici ton pavé. Pourquoi le cinéma, ce que tu cherches dans une image — cadrage, lumière, grain. (Texte à écrire.)</p>
            <button onClick={() => setAbout(false)}>close</button>
          </div>
        </div>
      )}
    </>
  );
}
