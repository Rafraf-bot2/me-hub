import { useState, useEffect } from 'react';

// Île SPA du monde /sport. Le dock du bas = la tab bar.
// État d'onglet = hash de l'URL (/sport#muscu), source de vérité unique :
// clic → on écrit le hash ; hashchange (clic, back/forward, refresh) → on relit.
// Une seule data chargée (props), chaque onglet en réaffiche une tranche.

const TABS = [
  { id: 'apercu', icon: 'layout-grid', label: 'Aperçu' },
  { id: 'muscu', icon: 'barbell', label: 'Muscu' },
  { id: 'graille', icon: 'apple', label: 'Graille' },
  { id: 'coach', icon: 'message-circle', label: 'Coach' },
];
const TAB_IDS = TABS.map((t) => t.id);
const TONE = { alert: 'sp-flag-alert', good: 'sp-flag-good', warn: 'sp-flag-warn' };

const VITALS = [
  { label: 'balance kcal', icon: 'flame' },
  { label: 'pas', icon: 'walk' },
  { label: 'protéines', icon: 'meat' },
];

export default function SportApp({ sport: initial }) {
  // Data : le JSON SSR sert de fallback ; en prod on rafraîchit depuis /api/sport
  // (Cloudflare D1, gardé par Access). En dev /api/sport n'existe pas → on garde le fallback.
  const [sport, setSport] = useState(initial);
  const m = sport.muscu;
  const [tab, setTab] = useState('apercu');
  // generated_at peut être vide (stub de build) → date du jour en repli (pas d'Invalid Date)
  const genTs = Date.parse(sport.generated_at);
  const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' })
    .format(Number.isNaN(genTs) ? Date.now() : genTs);

  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.replace('#', '');
      setTab(TAB_IDS.includes(h) ? h : 'apercu');
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/sport', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && d.muscu) setSport(d); })
      .catch(() => {}); // pas d'API (dev) → on reste sur le fallback SSR
    return () => { alive = false; };
  }, []);

  const go = (id) => {
    window.location.hash = id;
  };

  return (
    <main className="sp-wrap">
      <header className="sp-head">
        <div className="sp-brand">
          <span className="sp-logo">SPORT</span>
          <span className="sp-date">{dateLabel}</span>
        </div>
        <a className="sp-back" href="/">
          <i className="ti ti-arrow-left" aria-hidden="true"></i> hub
        </a>
      </header>

      {tab === 'apercu' && <Apercu sport={sport} m={m} />}
      {tab === 'muscu' && <Muscu sport={sport} m={m} />}
      {tab === 'graille' && <Graille />}
      {tab === 'coach' && <Coach sport={sport} />}

      <nav className="sp-dock" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`sp-dock-btn ${tab === t.id ? 'sp-dock-active' : ''}`}
            aria-label={t.label}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => go(t.id)}
          >
            <i className={`ti ti-${t.icon}`} aria-hidden="true"></i>
          </button>
        ))}
      </nav>
    </main>
  );
}

function Apercu({ sport, m }) {
  return (
    <section className="sp-panel">
      <section className="sp-hero">
        <span className="sp-kicker">LE VERDICT</span>
        <div className="sp-hero-row">
          <h1 className="sp-verdict">
            {sport.verdict.line1}
            <br />
            {sport.verdict.line2}
          </h1>
          <div className="sp-hero-stat">
            <span className="sp-hero-num">{m.sessions}</span>
            <span className="sp-hero-lab">
              séances
              <br />
              ces 7 jours
            </span>
          </div>
        </div>
      </section>

      <div className="sp-tiles">
        {VITALS.map((v) => (
          <div key={v.label} className="sp-tile sp-cream sp-pend">
            <span className="sp-pend-val">—</span>
            <span className="sp-tile-lab">
              <i className={`ti ti-${v.icon} sp-lab-ic`} aria-hidden="true"></i>
              {v.label}
            </span>
            <span className="sp-pend-tag">
              <i className="ti ti-link" aria-hidden="true"></i> à connecter
            </span>
          </div>
        ))}
      </div>

      <Week sport={sport} m={m} />
    </section>
  );
}

function Week({ sport, m }) {
  return (
    <section className="sp-block sp-darkblock">
      <div className="sp-block-head">
        <span className="sp-block-title">7 derniers jours</span>
        <span className="sp-via">VIA HEVY</span>
      </div>
      <div className="sp-week">
        {sport.week.days.map((d) => (
          <div className="sp-day" key={d.date}>
            <div
              className={`sp-daycell ${
                d.sessions.length ? `sp-day-on sp-day-${d.sessions[0].group_tag}` : 'sp-day-off'
              }`}
            >
              {d.sessions.length > 0 && (
                <>
                  <i className="ti ti-barbell sp-day-ic" aria-hidden="true"></i>
                  <span className="sp-day-tag">
                    {d.sessions[0].group_tag}
                    {d.sessions.length > 1 ? ` +${d.sessions.length - 1}` : ''}
                  </span>
                </>
              )}
            </div>
            <span className={`sp-day-lab ${d.sessions.length ? 'sp-day-lab-on' : ''}`}>
              {d.letter}
              <br />
              {d.day}
            </span>
          </div>
        ))}
      </div>
      <div className="sp-week-cap">
        {m.sessions} séance{m.sessions > 1 ? 's' : ''} · {sport.week.rest} jours de repos
        {m.split.legs === 0 ? ' · jambes zappées' : ''}
      </div>
    </section>
  );
}

const STATS = [
  { key: 'volume_t', label: 'volume', unit: 't', icon: 'weight' },
  { key: 'minutes', label: 'temps', unit: 'min', icon: 'clock' },
  { key: 'prs', label: 'records', unit: '', icon: 'trophy' },
];
const GROUPS = [
  { key: 'push', label: 'Push' },
  { key: 'pull', label: 'Pull' },
  { key: 'legs', label: 'Jambes' },
  { key: 'core', label: 'Core' },
];
// muscle Hevy → label FR (pour la légende de la carte)
const FR = {
  chest: 'pecs', shoulders: 'épaules', triceps: 'triceps', biceps: 'biceps',
  lats: 'dos', upper_back: 'haut du dos', lower_back: 'lombaires', forearms: 'avant-bras',
  traps: 'trapèzes', quadriceps: 'quadris', hamstrings: 'ischios', glutes: 'fessiers',
  calves: 'mollets', abdominals: 'abdos', abductors: 'abducteurs', adductors: 'adducteurs',
};

function Muscu({ sport, m }) {
  const muscles = m.muscles ?? {};
  const entries = Object.entries(muscles);
  const top = entries.length ? entries.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;

  return (
    <section className="sp-panel">
      <Week sport={sport} m={m} />

      <div className="sp-tiles">
        {STATS.map((s) => (
          <div key={s.key} className="sp-tile sp-cream">
            <span className="sp-tile-num">
              {m[s.key]}
              {s.unit && <span className="sp-unit">{s.unit}</span>}
            </span>
            <span className="sp-tile-lab">
              <i className={`ti ti-${s.icon} sp-lab-ic`} aria-hidden="true"></i>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <section className="sp-block sp-darkblock">
        <div className="sp-block-head">
          <span className="sp-block-title">Carte musculaire</span>
          <span className="sp-via">7 DERNIERS JOURS</span>
        </div>
        <MuscleMap muscles={muscles} />
        <div className="sp-week-cap">
          {top
            ? <>Plus sollicité : <b className="sp-hot">{FR[top[0]] ?? top[0]}</b>{m.split.legs === 0 ? ' · jambes zappées' : ''}</>
            : 'Aucune série cette semaine.'}
        </div>

        <div className="sp-bars">
          {GROUPS.map((g) => {
            const sets = m.split[g.key] ?? 0;
            const max = Math.max(1, ...Object.values(m.split));
            return (
              <div className="sp-bar-row" key={g.key}>
                <span className="sp-bar-lab">{g.label}</span>
                <div className="sp-bar-track">
                  <div
                    className={`sp-bar-fill ${g.key === 'legs' && sets === 0 ? 'sp-bar-empty' : ''}`}
                    style={{ width: `${sets ? Math.max(6, (sets / max) * 100) : 0}%` }}
                  />
                </div>
                <span className="sp-bar-val">{sets || '—'}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="sp-block sp-darkblock">
        <span className="sp-kicker sp-muted">SÉANCES RÉCENTES</span>
        <div className="sp-recent">
          {sport.recent.map((r, i) => (
            <div key={`${r.date}-${i}`} className={`sp-row ${i < sport.recent.length - 1 ? 'sp-row-div' : ''}`}>
              <div className={`sp-row-tag sp-tag-${r.group_tag}`}>
                <i className="ti ti-barbell" aria-hidden="true"></i>
              </div>
              <div className="sp-row-main">
                <div className="sp-row-title">
                  {r.title}
                  {r.prs > 0 && <span className="sp-pr"> · {r.prs} record</span>}
                </div>
                <div className="sp-row-sub">
                  {r.date.slice(8)}/{r.date.slice(5, 7)} · {r.sets} séries · {r.volume_t}t
                </div>
              </div>
              <span className="sp-row-dur">
                {r.duration_min}
                <span className="sp-unit-sm">min</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

// Carte musculaire face/dos. Chaque zone s'allume selon les séries de la semaine.
function MuscleMap({ muscles }) {
  const max = Math.max(1, ...Object.values(muscles));
  const lit = (key) => {
    const s = muscles[key] || 0;
    return { fill: 'var(--fluo)', fillOpacity: s ? 0.3 + 0.65 * Math.min(s / max, 1) : 0.06 };
  };
  return (
    <div className="sp-mapwrap">
      <svg className="sp-map" viewBox="0 0 200 210" role="img" aria-label="Carte musculaire face et dos">
        {/* ---- FACE ---- */}
        <g className="sp-fig">
          <circle className="sp-sil" cx="48" cy="16" r="12" />
          <path className="sp-sil" d="M30 30 Q48 25 66 30 L70 52 L64 108 Q48 116 32 108 L26 52 Z" />
          <path className="sp-sil" d="M30 33 L17 40 L12 90 L20 92 L27 50 Z" />
          <path className="sp-sil" d="M66 33 L79 40 L84 90 L76 92 L69 50 Z" />
          <path className="sp-sil" d="M33 110 L30 116 L29 192 L41 192 L44 118 Z" />
          <path className="sp-sil" d="M63 110 L66 116 L67 192 L55 192 L52 118 Z" />
          {/* muscles */}
          <ellipse style={lit('shoulders')} cx="28" cy="38" rx="8" ry="6" />
          <ellipse style={lit('shoulders')} cx="68" cy="38" rx="8" ry="6" />
          <rect style={lit('chest')} x="33" y="40" width="14" height="14" rx="4" />
          <rect style={lit('chest')} x="49" y="40" width="14" height="14" rx="4" />
          <ellipse style={lit('biceps')} cx="18" cy="58" rx="5" ry="11" />
          <ellipse style={lit('biceps')} cx="78" cy="58" rx="5" ry="11" />
          <ellipse style={lit('forearms')} cx="15" cy="80" rx="4.5" ry="11" />
          <ellipse style={lit('forearms')} cx="81" cy="80" rx="4.5" ry="11" />
          <rect style={lit('abdominals')} x="40" y="56" width="16" height="28" rx="3" />
          <ellipse style={lit('quadriceps')} cx="37" cy="150" rx="8.5" ry="26" />
          <ellipse style={lit('quadriceps')} cx="59" cy="150" rx="8.5" ry="26" />
        </g>
        {/* ---- DOS ---- */}
        <g className="sp-fig" transform="translate(104 0)">
          <circle className="sp-sil" cx="48" cy="16" r="12" />
          <path className="sp-sil" d="M30 30 Q48 25 66 30 L70 52 L64 108 Q48 116 32 108 L26 52 Z" />
          <path className="sp-sil" d="M30 33 L17 40 L12 90 L20 92 L27 50 Z" />
          <path className="sp-sil" d="M66 33 L79 40 L84 90 L76 92 L69 50 Z" />
          <path className="sp-sil" d="M33 110 L30 116 L29 192 L41 192 L44 118 Z" />
          <path className="sp-sil" d="M63 110 L66 116 L67 192 L55 192 L52 118 Z" />
          {/* muscles */}
          <path style={lit('traps')} d="M37 31 L59 31 L54 46 L48 50 L42 46 Z" />
          <ellipse style={lit('shoulders')} cx="28" cy="38" rx="8" ry="6" />
          <ellipse style={lit('shoulders')} cx="68" cy="38" rx="8" ry="6" />
          <path style={lit('lats')} d="M34 48 L46 50 L44 78 L31 70 Z" />
          <path style={lit('lats')} d="M62 48 L50 50 L52 78 L65 70 Z" />
          <path style={lit('lower_back')} d="M42 80 L54 80 L52 100 L44 100 Z" />
          <ellipse style={lit('triceps')} cx="18" cy="58" rx="5" ry="11" />
          <ellipse style={lit('triceps')} cx="78" cy="58" rx="5" ry="11" />
          <ellipse style={lit('forearms')} cx="15" cy="80" rx="4.5" ry="11" />
          <ellipse style={lit('forearms')} cx="81" cy="80" rx="4.5" ry="11" />
          <rect style={lit('glutes')} x="34" y="104" width="13" height="14" rx="5" />
          <rect style={lit('glutes')} x="49" y="104" width="13" height="14" rx="5" />
          <ellipse style={lit('hamstrings')} cx="37" cy="142" rx="8" ry="20" />
          <ellipse style={lit('hamstrings')} cx="59" cy="142" rx="8" ry="20" />
          <ellipse style={lit('calves')} cx="36" cy="178" rx="6.5" ry="14" />
          <ellipse style={lit('calves')} cx="60" cy="178" rx="6.5" ry="14" />
        </g>
        <text className="sp-map-cap" x="48" y="207">FACE</text>
        <text className="sp-map-cap" x="152" y="207">DOS</text>
      </svg>
    </div>
  );
}

function Graille() {
  return (
    <section className="sp-panel">
      <Soon icon="apple" title="Graille" text="Calories, macros et repas — branchés dès que Health Connect remonte." />
    </section>
  );
}

function Coach({ sport }) {
  const flags = sport.flags ?? [];
  return (
    <section className="sp-panel">
      <section className="sp-hero">
        <span className="sp-kicker">LE COACH DIT</span>
        <h1 className="sp-verdict sp-verdict-sm">
          {sport.verdict.line1}
          <br />
          {sport.verdict.line2}
        </h1>
      </section>

      {flags.length > 0 && (
        <div className="sp-flags">
          {flags.map((f, i) => (
            <span key={i} className={`sp-flag ${TONE[f.tone] ?? ''}`}>
              <i className={`ti ti-${f.icon}`} aria-hidden="true"></i>
              {f.text}
            </span>
          ))}
        </div>
      )}

      <Soon icon="message-circle" title="Brief hebdo" text="Le coach écrira un brief complet chaque dimanche soir." />
    </section>
  );
}

function Soon({ icon, title, text }) {
  return (
    <section className="sp-block sp-darkblock sp-soon">
      <i className={`ti ti-${icon} sp-soon-ic`} aria-hidden="true"></i>
      <div className="sp-soon-main">
        <span className="sp-soon-title">{title}</span>
        <span className="sp-soon-text">{text}</span>
      </div>
      <span className="sp-soon-tag">bientôt</span>
    </section>
  );
}
