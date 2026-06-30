-- Schéma D1 du monde /sport (store privé, jamais exposé — gardé par Cloudflare Access).
-- Appliquer : wrangler d1 execute me-sport --remote --file=db/schema.sql
--   (et --local pour la base miniflare de `wrangler pages dev`).

-- Health Connect : 1 ligne par jour (steps + nutrition + poids). Via /ingest/health.
CREATE TABLE IF NOT EXISTS daily (
  date       TEXT PRIMARY KEY,   -- YYYY-MM-DD (heure locale)
  steps      INTEGER,
  kcal_in    INTEGER,
  kcal_out   INTEGER,
  protein_g  REAL,
  carbs_g    REAL,
  fat_g      REAL,
  weight_kg  REAL,
  updated_at TEXT
);

-- Hevy : 1 ligne par séance. `raw` = objet enrichi complet (cat, muscles, prs…)
-- relu tel quel par /api/sport (buildDashboard). Via /ingest/hevy.
CREATE TABLE IF NOT EXISTS workouts (
  id           TEXT PRIMARY KEY,
  date         TEXT,             -- YYYY-MM-DD (heure locale)
  title        TEXT,
  duration_min INTEGER,
  sets         INTEGER,
  volume_kg    REAL,
  group_tag    TEXT,             -- push | pull | legs | core | other
  prs          INTEGER,
  raw          TEXT,             -- JSON enrichi (source de vérité pour l'agrégation)
  updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);

-- Brief hebdo du coach (Palier B — routine Claude Code). 1 ligne par semaine.
CREATE TABLE IF NOT EXISTS coach_briefs (
  week         TEXT PRIMARY KEY, -- ex. 2026-W27
  verdict      TEXT,
  flags        TEXT,             -- JSON
  body         TEXT,             -- le brief rédigé
  generated_at TEXT
);
