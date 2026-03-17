import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("market_intel.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS competitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    industry TEXT,
    domain TEXT,
    executive_summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competitor_id INTEGER,
    title TEXT NOT NULL,
    summary TEXT,
    url TEXT,
    published_date TEXT,
    sentiment TEXT,
    region TEXT DEFAULT 'global',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
    UNIQUE(competitor_id, url, region)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    content TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS geographies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_insights_unique ON insights(competitor_id, url, region);
`);

// Seed initial geographies if empty
const geoCount = db.prepare("SELECT COUNT(*) as count FROM geographies").get() as { count: number };
if (geoCount.count === 0) {
  const insertGeo = db.prepare("INSERT INTO geographies (name) VALUES (?)");
  ['Canada', 'USA', 'Europe'].forEach(name => insertGeo.run(name));
}

// Seed initial competitors if empty or ensure specific ones exist
const seedCompetitors = [
  { name: 'Bell AI Fabric', industry: 'Telecommunications', domain: 'bell.ca' },
  { name: 'TELUS AI Factory', industry: 'Telecommunications', domain: 'telus.com' },
  { name: 'Cohere', industry: 'AI Technology', domain: 'cohere.com' },
  { name: 'ThinkOn', industry: 'Cloud Services', domain: 'thinkon.com' },
  { name: 'Microsoft', industry: 'Technology', domain: 'microsoft.com' },
  { name: 'Qscale', industry: 'AI Infrastructure', domain: 'qscale.com' },
  { name: 'Equinix', industry: 'Digital Infrastructure', domain: 'equinix.ca' },
  { name: 'eStruxture', industry: 'Data Centers', domain: 'estruxture.com' },
  { name: 'Thomson Reuters', industry: 'Information Services', domain: 'thomsonreuters.ca' }
];

seedCompetitors.forEach(comp => {
  const exists = db.prepare("SELECT COUNT(*) as count FROM competitors WHERE name = ?").get(comp.name) as { count: number };
  if (exists.count === 0) {
    db.prepare("INSERT INTO competitors (name, industry, domain) VALUES (?, ?, ?)").run(comp.name, comp.industry, comp.domain);
  } else {
    // Update domain if it's missing
    db.prepare("UPDATE competitors SET domain = ? WHERE name = ? AND (domain IS NULL OR domain = '')").run(comp.domain, comp.name);
  }
});

// Migration: Add region column if it doesn't exist
const tableInfo = db.prepare("PRAGMA table_info(insights)").all() as any[];
const hasRegion = tableInfo.some(col => col.name === 'region');
if (!hasRegion) {
  db.exec("ALTER TABLE insights ADD COLUMN region TEXT DEFAULT 'global'");
}

// Migration: Add domain column if it doesn't exist
const compTableInfo = db.prepare("PRAGMA table_info(competitors)").all() as any[];
const hasDomain = compTableInfo.some(col => col.name === 'domain');
if (!hasDomain) {
  db.exec("ALTER TABLE competitors ADD COLUMN domain TEXT");
}

// Migration: Add executive_summary column if it doesn't exist
const hasExecSummary = compTableInfo.some(col => col.name === 'executive_summary');
if (!hasExecSummary) {
  db.exec("ALTER TABLE competitors ADD COLUMN executive_summary TEXT");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/competitors", (req, res) => {
    const competitors = db.prepare("SELECT * FROM competitors ORDER BY name ASC").all();
    res.json(competitors);
  });

  app.post("/api/competitors", (req, res) => {
    const { name, industry } = req.body;
    try {
      const info = db.prepare("INSERT INTO competitors (name, industry) VALUES (?, ?)").run(name, industry);
      res.json({ id: info.lastInsertRowid, name, industry });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/competitors/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM insights WHERE competitor_id = ?").run(req.params.id);
      db.prepare("DELETE FROM competitors WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/competitors/:id/summary", (req, res) => {
    const { executive_summary } = req.body;
    try {
      db.prepare("UPDATE competitors SET executive_summary = ? WHERE id = ?").run(executive_summary, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/insights/:competitorId", (req, res) => {
    const insights = db.prepare("SELECT * FROM insights WHERE competitor_id = ? ORDER BY published_date DESC").all(req.params.competitorId);
    res.json(insights);
  });

  app.post("/api/insights", (req, res) => {
    const { competitor_id, title, summary, url, published_date, sentiment } = req.body;
    try {
      const info = db.prepare(`
        INSERT OR IGNORE INTO insights (competitor_id, title, summary, url, published_date, sentiment)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(competitor_id, title, summary, url, published_date, sentiment);
      res.json({ id: info.lastInsertRowid });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/market-insights", (req, res) => {
    const region = req.query.region || 'canada';
    const insights = db.prepare("SELECT * FROM insights WHERE competitor_id IS NULL AND region = ? ORDER BY published_date DESC").all(region);
    res.json(insights);
  });

  app.post("/api/market-insights", (req, res) => {
    const { title, summary, url, published_date, sentiment, region = 'canada' } = req.body;
    try {
      const info = db.prepare(`
        INSERT OR IGNORE INTO insights (competitor_id, title, summary, url, published_date, sentiment, region)
        VALUES (NULL, ?, ?, ?, ?, ?, ?)
      `).run(title, summary, url, published_date, sentiment, region);
      res.json({ id: info.lastInsertRowid });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/geographies", (req, res) => {
    const geographies = db.prepare("SELECT * FROM geographies ORDER BY name ASC").all();
    res.json(geographies);
  });

  app.post("/api/geographies", (req, res) => {
    const { name } = req.body;
    try {
      const info = db.prepare("INSERT INTO geographies (name) VALUES (?)").run(name);
      res.json({ id: info.lastInsertRowid, name });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/geographies/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM geographies WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/reports/:id", (req, res) => {
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
    res.json(report || { content: null });
  });

  app.post("/api/reports/:id", (req, res) => {
    const { content } = req.body;
    db.prepare(`
      INSERT INTO reports (id, content, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP
    `).run(req.params.id, content);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
