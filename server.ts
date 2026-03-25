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
    logo_url TEXT,
    head_office TEXT,
    website TEXT,
    description TEXT,
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

  CREATE TABLE IF NOT EXISTS markets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    region_code TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_insights_unique ON insights(competitor_id, url, region);
`);

// Seed initial competitors if empty or ensure specific ones exist
const seedCompetitors = [
  { 
    name: 'Bell AI Fabric', 
    industry: 'Telecommunications', 
    domain: 'bell.ca',
    logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Bell_logo.svg/1200px-Bell_logo.svg.png',
    head_office: 'Montreal, Quebec, Canada',
    website: 'https://www.bell.ca',
    description: 'Bell is Canada\'s largest communications company, providing advanced broadband wireless, TV, Internet, media and business communication services.'
  },
  { 
    name: 'TELUS AI Factory', 
    industry: 'Telecommunications', 
    domain: 'telus.com',
    logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/TELUS_logo.svg/1200px-TELUS_logo.svg.png',
    head_office: 'Vancouver, British Columbia, Canada',
    website: 'https://www.telus.com',
    description: 'TELUS is a dynamic, world-leading communications and information technology company with $16 billion in annual revenue and 15.2 million customer connections.'
  },
  { 
    name: 'Cohere', 
    industry: 'AI Technology', 
    domain: 'cohere.com',
    logo_url: 'https://images.crunchbase.com/image/upload/c_pad,h_170,w_170,f_auto,b_white,q_auto:eco,dpr_1/v1503525235/y6v4v4v4v4v4v4v4v4v4.png',
    head_office: 'Toronto, Ontario, Canada',
    website: 'https://www.cohere.com',
    description: 'Cohere is the leading AI platform for enterprise. Our world-class large language models (LLMs) and RAG capabilities are optimized for business use cases.'
  },
  { 
    name: 'ThinkOn', 
    industry: 'Cloud Services', 
    domain: 'thinkon.com',
    logo_url: 'https://thinkon.com/wp-content/uploads/2020/03/ThinkOn-Logo-Horizontal-RGB-1.png',
    head_office: 'Etobicoke, Ontario, Canada',
    website: 'https://www.thinkon.com',
    description: 'ThinkOn is a wholesale provider of cloud infrastructure and data management services with a focus on security and data sovereignty.'
  },
  { 
    name: 'Microsoft', 
    industry: 'Technology', 
    domain: 'microsoft.com',
    logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Microsoft_logo.svg/1200px-Microsoft_logo.svg.png',
    head_office: 'Redmond, Washington, USA',
    website: 'https://www.microsoft.com',
    description: 'Microsoft enables digital transformation for the era of an intelligent cloud and an intelligent edge. Its mission is to empower every person and every organization on the planet to achieve more.'
  },
  { 
    name: 'Qscale', 
    industry: 'AI Infrastructure', 
    domain: 'qscale.com',
    logo_url: 'https://www.qscale.com/hubfs/QScale_Logo_Horizontal_Color_RGB.png',
    head_office: 'Lévis, Quebec, Canada',
    website: 'https://www.qscale.com',
    description: 'QScale designs, builds and operates high-performance computing (HPC) centers that are tailored to the needs of AI and other data-intensive applications.'
  },
  { 
    name: 'Equinix', 
    industry: 'Digital Infrastructure', 
    domain: 'equinix.ca',
    logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Equinix_logo.svg/1200px-Equinix_logo.svg.png',
    head_office: 'Redwood City, California, USA',
    website: 'https://www.equinix.ca',
    description: 'Equinix is the world\'s digital infrastructure company, enabling digital leaders to harness a trusted platform to bring together and interconnect the foundational infrastructure that powers their success.'
  },
  { 
    name: 'eStruxture', 
    industry: 'Data Centers', 
    domain: 'estruxture.com',
    logo_url: 'https://www.estruxture.com/wp-content/uploads/2017/06/estruxture-logo.png',
    head_office: 'Montreal, Quebec, Canada',
    website: 'https://www.estruxture.com',
    description: 'eStruxture is the largest Canadian-owned cloud and carrier-neutral data center provider. Our solutions are designed to give you more: more locations, more capacity, more connectivity.'
  }
];

// Remove Thomson Reuters if it exists
db.prepare("DELETE FROM competitors WHERE name = 'Thomson Reuters'").run();

// Seed initial markets
const seedMarkets = [
  { name: 'Canada', region_code: 'canada' },
  { name: 'Global', region_code: 'global' }
];

seedMarkets.forEach(market => {
  const exists = db.prepare("SELECT COUNT(*) as count FROM markets WHERE name = ?").get(market.name) as { count: number };
  if (exists.count === 0) {
    db.prepare("INSERT INTO markets (name, region_code) VALUES (?, ?)").run(market.name, market.region_code);
  }
});

seedCompetitors.forEach(comp => {
  const exists = db.prepare("SELECT COUNT(*) as count FROM competitors WHERE name = ?").get(comp.name) as { count: number };
  if (exists.count === 0) {
    db.prepare("INSERT INTO competitors (name, industry, domain, logo_url, head_office, website, description) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      comp.name, comp.industry, comp.domain, comp.logo_url, comp.head_office, comp.website, comp.description
    );
  } else {
    // Update missing fields
    db.prepare(`
      UPDATE competitors 
      SET domain = COALESCE(NULLIF(domain, ''), ?),
          logo_url = COALESCE(NULLIF(logo_url, ''), ?),
          head_office = COALESCE(NULLIF(head_office, ''), ?),
          website = COALESCE(NULLIF(website, ''), ?),
          description = COALESCE(NULLIF(description, ''), ?)
      WHERE name = ?
    `).run(comp.domain, comp.logo_url, comp.head_office, comp.website, comp.description, comp.name);
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

// Migration: Add new columns if they don't exist
['logo_url', 'head_office', 'website', 'description'].forEach(colName => {
  const hasCol = compTableInfo.some(col => col.name === colName);
  if (!hasCol) {
    db.exec(`ALTER TABLE competitors ADD COLUMN ${colName} TEXT`);
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/competitors", (req, res) => {
    const competitors = db.prepare("SELECT * FROM competitors ORDER BY name ASC").all();
    res.json(competitors);
  });

  app.get("/api/markets", (req, res) => {
    const markets = db.prepare("SELECT * FROM markets ORDER BY name ASC").all();
    res.json(markets);
  });

  app.post("/api/markets", (req, res) => {
    const { name } = req.body;
    const region_code = name.toLowerCase().replace(/\s+/g, '_');
    try {
      const info = db.prepare("INSERT INTO markets (name, region_code) VALUES (?, ?)").run(name, region_code);
      res.json({ id: info.lastInsertRowid, name, region_code });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/markets/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM markets WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
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
