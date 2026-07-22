const express = require('express');
const path = require('path');
const fs = require('fs');
const { put } = require('@vercel/blob');

const app = express();
const PORT = process.env.PORT || 5101;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Detect if we should use PostgreSQL (Vercel/Neon) or local SQLite
const isPostgres = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);

let db = null;
let pgPool = null;

// Initial mock data definitions
const INITIAL_USERS = [
  { id: "1", name: "Rodion Bychkoviak", role: "UI/UX Designer", avatar: "/avatars/rodion.png", isDesigner: 1, color: "indigo" },
  { id: "2", name: "Yevhen Pavlenko", role: "UI/UX Designer", avatar: "/avatars/yevhen.png", isDesigner: 1, color: "emerald" },
  { id: "3", name: "Anton Sakhatskyi", role: "UI/UX Designer", avatar: "/avatars/anton.png", isDesigner: 1, color: "orange" },
  { id: "4", name: "Vadym Blyzniuk", role: "Implementation Consultant", avatar: "/avatars/vadym.png", isDesigner: 0 },
  { id: "5", name: "Olena Shyliuk", role: "Implementation Consultant", avatar: "/avatars/olena.png", isDesigner: 0 },
  { id: "6", name: "Taras Kahnii", role: "Team Lead ES", avatar: "/avatars/taras.png", isDesigner: 0 },
  { id: "7", name: "Andrii Zamorylo", role: "Business Analyst ES", avatar: "/avatars/andrii.png", isDesigner: 0 },
  { id: "8", name: "Valerii Hovzan", role: "Business Analyst ES", avatar: "/avatars/valerii.png", isDesigner: 0 },
  { id: "9", name: "Serhii Pankyn", role: "Head of ST-DEV", avatar: "/avatars/serhii.png", isDesigner: 0 },
  { id: "10", name: "Iryna Kovalova", role: "MST-CORP Head of Sales", avatar: "/avatars/iryna.png", isDesigner: 0 },
  { id: "11", name: "Kyrylo Radkevych", role: "System Analyst ST-DEV", avatar: "/avatars/kyrylo.png", isDesigner: 0 },
  { id: "12", name: "Artem Solonko", role: "Business Analyst CRMS", avatar: "/avatars/artem.png", isDesigner: 0 },
  { id: "13", name: "Oleh Khrapov", role: "Middle Engineer НИРП", avatar: "/avatars/oleh.png", isDesigner: 0 },
  { id: "14", name: "Anna Shevchenko", role: "Senior Business Analyst HRS", avatar: "ASh", isDesigner: 0 }
];

const INITIAL_PROJECTS = [
  { id: "p1", name: "Master ЛК", color: "indigo", memberIds: JSON.stringify(["1", "10", "11"]) },
  { id: "p2", name: "Master AI", color: "blue", memberIds: JSON.stringify(["1", "10", "11"]) },
  { id: "p3", name: "LMS", color: "emerald", memberIds: JSON.stringify(["2", "13"]) },
  { id: "p4", name: "УТП - Продажі", color: "orange", memberIds: JSON.stringify(["2", "12"]) },
  { id: "p5", name: "УТП - Довідники", color: "rose", memberIds: JSON.stringify(["3", "4"]) },
  { id: "p6", name: "ЦОД - 360", color: "teal", memberIds: JSON.stringify(["2", "14"]) }
];

const INITIAL_ALLOCATIONS = [
  { id: "a1", projectId: "p1", designerId: "1", startDate: "2026-07-20", endDate: "2026-07-22", hours: 0 },
  { id: "a2", projectId: "p2", designerId: "1", startDate: "2026-07-20", endDate: "2026-07-22", hours: 0 },
  { id: "a3", projectId: "p3", designerId: "2", startDate: "2026-07-20", endDate: "2026-07-22", hours: 0 },
  { id: "a4", projectId: "p4", designerId: "2", startDate: "2026-07-20", endDate: "2026-07-22", hours: 0 },
  { id: "a5", projectId: "p5", designerId: "3", startDate: "2026-07-20", endDate: "2026-07-22", hours: 0 },
  { id: "a6", projectId: "p6", designerId: "2", startDate: "2026-07-20", endDate: "2026-07-22", hours: 0 }
];

const INITIAL_CAPACITIES = [
  { designerId: "1", dailyCapacity: 4 },
  { designerId: "2", dailyCapacity: 8 },
  { designerId: "3", dailyCapacity: 8 }
];

// Unified database query helper
async function executeQuery(sql, params = []) {
  if (isPostgres) {
    let pgSql = sql;
    let index = 1;
    // Replace SQLite '?' placeholders with Postgres '$1', '$2', etc.
    while (pgSql.includes('?')) {
      pgSql = pgSql.replace('?', `$${index++}`);
    }

    // Special translation for ON CONFLICT SQLite syntax to Postgres syntax
    if (pgSql.toLowerCase().includes('on conflict(designerid)')) {
      pgSql = 'INSERT INTO capacities (designerId, dailyCapacity) VALUES ($1, $2) ON CONFLICT (designerId) DO UPDATE SET dailyCapacity = EXCLUDED.dailyCapacity';
      // In Postgres, we only need 2 parameters: designerId and dailyCapacity
      return (await pgPool.query(pgSql, [params[0], params[1]])).rows;
    }

    const result = await pgPool.query(pgSql, params);
    return result.rows;
  } else {
    return new Promise((resolve, reject) => {
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
      if (isSelect) {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      } else {
        db.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      }
    });
  }
}

async function initializeDb() {
  try {
    // Create Tables
    await executeQuery(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      role TEXT,
      avatar TEXT,
      isDesigner INTEGER,
      color TEXT
    )`);

    try {
      await executeQuery(`ALTER TABLE users ADD COLUMN color TEXT`);
    } catch (e) {
      // Ignored if column already exists
    }

    await executeQuery(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT,
      color TEXT,
      memberIds TEXT,
      sortOrder INTEGER DEFAULT 0
    )`);

    try {
      await executeQuery(`ALTER TABLE projects ADD COLUMN sortOrder INTEGER DEFAULT 0`);
    } catch (e) {
      // Ignored if column already exists
    }

    await executeQuery(`CREATE TABLE IF NOT EXISTS allocations (
      id TEXT PRIMARY KEY,
      projectId TEXT,
      designerId TEXT,
      startDate TEXT,
      endDate TEXT,
      hours REAL,
      offsetHours REAL
    )`);

    try {
      await executeQuery(`ALTER TABLE allocations ADD COLUMN offsetHours REAL`);
    } catch (e) {
      // Ignored if column already exists
    }

    await executeQuery(`CREATE TABLE IF NOT EXISTS capacities (
      designerId TEXT PRIMARY KEY,
      dailyCapacity REAL
    )`);

    // Check and seed users if empty
    const userRows = await executeQuery('SELECT COUNT(*) as count FROM users');
    const userCount = userRows && userRows[0] ? parseInt(userRows[0].count || userRows[0].COUNT || Object.values(userRows[0])[0] || 0, 10) : 0;
    if (userCount === 0) {
      console.log('Seeding initial users...');
      for (const u of INITIAL_USERS) {
        await executeQuery(
          'INSERT INTO users (id, name, role, avatar, isDesigner, color) VALUES (?, ?, ?, ?, ?, ?)',
          [u.id, u.name, u.role, u.avatar, u.isDesigner, u.color || null]
        );
      }
    }

    // Check and seed projects if empty
    const projectRows = await executeQuery('SELECT COUNT(*) as count FROM projects');
    const projectCount = projectRows && projectRows[0] ? parseInt(projectRows[0].count || projectRows[0].COUNT || Object.values(projectRows[0])[0] || 0, 10) : 0;
    if (projectCount === 0) {
      console.log('Seeding initial projects...');
      for (const p of INITIAL_PROJECTS) {
        await executeQuery(
          'INSERT INTO projects (id, name, color, memberIds) VALUES (?, ?, ?, ?)',
          [p.id, p.name, p.color, p.memberIds]
        );
      }
    }

    // Check and seed allocations if empty
    const allocationRows = await executeQuery('SELECT COUNT(*) as count FROM allocations');
    const allocationCount = allocationRows && allocationRows[0] ? parseInt(allocationRows[0].count || allocationRows[0].COUNT || Object.values(allocationRows[0])[0] || 0, 10) : 0;
    if (allocationCount === 0) {
      console.log('Seeding initial allocations...');
      for (const a of INITIAL_ALLOCATIONS) {
        await executeQuery(
          'INSERT INTO allocations (id, projectId, designerId, startDate, endDate, hours, offsetHours) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [a.id, a.projectId, a.designerId, a.startDate, a.endDate, a.hours, a.offsetHours || 0]
        );
      }
    }

    // Check and seed capacities if empty
    const capacityRows = await executeQuery('SELECT COUNT(*) as count FROM capacities');
    const capacityCount = capacityRows && capacityRows[0] ? parseInt(capacityRows[0].count || capacityRows[0].COUNT || Object.values(capacityRows[0])[0] || 0, 10) : 0;
    if (capacityCount === 0) {
      console.log('Seeding initial capacities...');
      for (const c of INITIAL_CAPACITIES) {
        await executeQuery(
          'INSERT INTO capacities (designerId, dailyCapacity) VALUES (?, ?)',
          [c.designerId, c.dailyCapacity]
        );
      }
    }
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

// Database Connection
if (isPostgres) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });
  console.log('Connected to Vercel/Neon Postgres database.');
  initializeDb();
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'database.sqlite');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
    } else {
      console.log('Connected to local SQLite database at:', dbPath);
      initializeDb();
    }
  });
}

// Helper to save base64 avatar to files or Vercel Blob
async function saveAvatarFile(id, avatar) {
  if (avatar && avatar.startsWith('data:image/')) {
    try {
      const matches = avatar.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const type = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        
        let ext = 'png';
        if (type.includes('jpeg') || type.includes('jpg')) ext = 'jpg';
        else if (type.includes('webp')) ext = 'webp';
        
        const filename = `${id}.${ext}`;

        // If Vercel Blob is configured (production), use it
        if (process.env.BLOB_READ_WRITE_TOKEN) {
          const blob = await put(`avatars/${filename}`, buffer, {
            access: 'public',
            contentType: type,
            token: process.env.BLOB_READ_WRITE_TOKEN
          });
          return blob.url;
        }
        
        // Otherwise save locally (development)
        const targetDir = path.join(__dirname, 'public', 'avatars');
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        
        fs.writeFileSync(path.join(targetDir, filename), buffer);
        return `/avatars/${filename}`;
      }
    } catch (err) {
      console.error('Failed to save avatar file:', err);
    }
  }
  return avatar;
}

// --- API Router Endpoints ---

// Get all planner data
app.get('/api/data', async (req, res) => {
  try {
    const rawUsers = await executeQuery('SELECT * FROM users');
    const rawProjects = await executeQuery('SELECT * FROM projects ORDER BY sortOrder ASC, id ASC');
    const rawAllocations = await executeQuery('SELECT * FROM allocations');
    const rawCapacities = await executeQuery('SELECT * FROM capacities');

    // Parse structures
    const users = rawUsers.map((u) => ({
      ...u,
      isDesigner: !!u.isdesigner || !!u.isDesigner
    }));

    const projects = rawProjects.map((p) => ({
      ...p,
      memberIds: JSON.parse(p.memberids || p.memberIds || '[]')
    }));

    const capacities = {};
    rawCapacities.forEach((c) => {
      capacities[c.designerid || c.designerId] = c.dailycapacity || c.dailyCapacity;
    });

    res.json({
      users,
      projects,
      allocations: rawAllocations.map(a => ({
        id: a.id,
        projectId: a.projectid || a.projectId,
        designerId: a.designerid || a.designerId,
        startDate: a.startdate || a.startDate,
        endDate: a.enddate || a.endDate,
        hours: Number(a.hours),
        offsetHours: Number(a.offsethours || a.offsetHours || 0)
      })),
      capacities
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User CRUD
app.post('/api/users', async (req, res) => {
  const { id, name, role, avatar, isDesigner, color } = req.body;
  try {
    const savedAvatar = await saveAvatarFile(id, avatar);
    await executeQuery(
      'INSERT INTO users (id, name, role, avatar, isDesigner, color) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, role, savedAvatar, isDesigner ? 1 : 0, color || null]
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, role, avatar, isDesigner, color } = req.body;
  try {
    const savedAvatar = await saveAvatarFile(id, avatar);
    await executeQuery(
      'UPDATE users SET name = ?, role = ?, avatar = ?, isDesigner = ?, color = ? WHERE id = ?',
      [name, role, savedAvatar, isDesigner ? 1 : 0, color || null, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Delete user
    await executeQuery('DELETE FROM users WHERE id = ?', [id]);
    // Delete their allocations
    await executeQuery('DELETE FROM allocations WHERE designerId = ?', [id]);
    // Delete their capacities
    await executeQuery('DELETE FROM capacities WHERE designerId = ?', [id]);

    // Remove user from all project members list
    const projects = await executeQuery('SELECT * FROM projects');
    if (projects) {
      for (const proj of projects) {
        const memberIdsStr = proj.memberids || proj.memberIds || '[]';
        const list = JSON.parse(memberIdsStr);
        if (list.includes(id)) {
          const updatedList = list.filter((uid) => uid !== id);
          await executeQuery('UPDATE projects SET memberIds = ? WHERE id = ?', [JSON.stringify(updatedList), proj.id]);
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Project CRUD
app.post('/api/projects', async (req, res) => {
  const { id, name, color, memberIds } = req.body;
  try {
    const maxRow = await executeQuery('SELECT MAX(sortOrder) as maxSort FROM projects');
    let maxSort = 0;
    if (maxRow && maxRow[0]) {
      const val = maxRow[0].maxsort !== undefined ? maxRow[0].maxsort : maxRow[0].maxSort;
      if (val !== null && val !== undefined) {
        maxSort = Number(val);
      }
    }
    const newSortOrder = maxSort + 1;

    await executeQuery(
      'INSERT INTO projects (id, name, color, memberIds, sortOrder) VALUES (?, ?, ?, ?, ?)',
      [id, name, color, JSON.stringify(memberIds), newSortOrder]
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update projects sort order
app.put('/api/projects/order', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Некоректні IDs' });
  }
  try {
    for (let i = 0; i < ids.length; i++) {
      await executeQuery('UPDATE projects SET sortOrder = ? WHERE id = ?', [i, ids[i]]);
    }
    res.json({ success: true, message: 'Порядок проектів успішно збережено' });
  } catch (err) {
    console.error('Error updating projects order:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  const { name, color, memberIds } = req.body;
  try {
    let query = 'UPDATE projects SET ';
    const params = [];
    
    if (name !== undefined) {
      query += 'name = ?, ';
      params.push(name);
    }
    if (color !== undefined) {
      query += 'color = ?, ';
      params.push(color);
    }
    if (memberIds !== undefined) {
      query += 'memberIds = ?, ';
      params.push(JSON.stringify(memberIds));
    }
    
    query = query.slice(0, -2) + ' WHERE id = ?';
    params.push(id);

    await executeQuery(query, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await executeQuery('DELETE FROM projects WHERE id = ?', [id]);
    await executeQuery('DELETE FROM allocations WHERE projectId = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Allocations CRUD
app.post('/api/allocations', async (req, res) => {
  const { id, projectId, designerId, startDate, endDate, hours, offsetHours } = req.body;
  try {
    await executeQuery(
      'INSERT INTO allocations (id, projectId, designerId, startDate, endDate, hours, offsetHours) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, projectId, designerId, startDate, endDate, hours, offsetHours || 0]
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/allocations/:id', async (req, res) => {
  const { id } = req.params;
  const { projectId, designerId, startDate, endDate, hours, offsetHours } = req.body;
  try {
    let query = 'UPDATE allocations SET ';
    const params = [];
    
    if (projectId !== undefined) {
      query += 'projectId = ?, ';
      params.push(projectId);
    }
    if (designerId !== undefined) {
      query += 'designerId = ?, ';
      params.push(designerId);
    }
    if (startDate !== undefined) {
      query += 'startDate = ?, ';
      params.push(startDate);
    }
    if (endDate !== undefined) {
      query += 'endDate = ?, ';
      params.push(endDate);
    }
    if (hours !== undefined) {
      query += 'hours = ?, ';
      params.push(hours);
    }
    if (offsetHours !== undefined) {
      query += 'offsetHours = ?, ';
      params.push(offsetHours);
    }
    
    query = query.slice(0, -2) + ' WHERE id = ?';
    params.push(id);

    await executeQuery(query, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/allocations/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await executeQuery('DELETE FROM allocations WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Capacity Put
app.put('/api/capacities/:id', async (req, res) => {
  const { id } = req.params;
  const { dailyCapacity } = req.body;
  try {
    await executeQuery(
      'INSERT INTO capacities (designerId, dailyCapacity) VALUES (?, ?) ON CONFLICT(designerId) DO UPDATE SET dailyCapacity = ?',
      [id, dailyCapacity, dailyCapacity]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin login route
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (email === 'radvancor@gmail.com' && password === '80938093r') {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Невірний email або пароль' });
  }
});

// Debug endpoint
app.get('/api/debug', async (req, res) => {
  try {
    const envKeys = Object.keys(process.env).filter(k => !k.includes('PASSWORD') && !k.includes('TOKEN') && !k.includes('SECRET'));
    let dbStatus = 'unknown';
    let dbError = null;
    let tablesInfo = {};
    
    try {
      if (isPostgres) {
        const client = await pgPool.connect();
        dbStatus = 'postgres-connected';
        client.release();
        
        // Fetch tables list
        const tables = await executeQuery("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
        tablesInfo.tables = tables.map(t => t.table_name);
        
        // Count users
        try {
          const userCount = await executeQuery("SELECT COUNT(*) as count FROM users");
          tablesInfo.userCount = userCount;
        } catch (e) {
          tablesInfo.userCountError = e.message;
        }
      } else {
        dbStatus = 'sqlite-connected';
        const tables = await executeQuery("SELECT name FROM sqlite_master WHERE type='table'");
        tablesInfo.tables = tables.map(t => t.name);
      }
    } catch (e) {
      dbStatus = 'connection-failed';
      dbError = e.message;
    }
    
    res.json({
      isPostgres,
      dbStatus,
      dbError,
      envKeys,
      tablesInfo,
      vercelEnv: process.env.VERCEL || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Migration endpoint from SQLite to Postgres
app.post('/api/migrate-from-sqlite', async (req, res) => {
  const { email, password, data } = req.body;
  if (email !== 'radvancor@gmail.com' || password !== '80938093r') {
    return res.status(401).json({ error: 'Невірні адмін-дані' });
  }
  
  if (!isPostgres) {
    return res.status(400).json({ error: 'Цей ендпоінт призначений тільки для продакшн бази Postgres' });
  }
  
  try {
    const { users, projects, allocations, capacities } = data;
    
    // 1. Migrate users
    if (users && users.length > 0) {
      for (const u of users) {
        await executeQuery(
          `INSERT INTO users (id, name, role, avatar, isDesigner, color) 
           VALUES (?, ?, ?, ?, ?, ?) 
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, avatar = EXCLUDED.avatar, isDesigner = EXCLUDED.isDesigner, color = EXCLUDED.color`,
          [u.id, u.name, u.role, u.avatar, u.isDesigner ? 1 : 0, u.color || null]
        );
      }
    }
    
    // 2. Migrate projects
    if (projects && projects.length > 0) {
      for (const p of projects) {
        await executeQuery(
          `INSERT INTO projects (id, name, color, memberIds, sortOrder) 
           VALUES (?, ?, ?, ?, ?) 
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, memberIds = EXCLUDED.memberIds, sortOrder = EXCLUDED.sortOrder`,
          [p.id, p.name, p.color, typeof p.memberIds === 'string' ? p.memberIds : JSON.stringify(p.memberIds), p.sortOrder || 0]
        );
      }
    }
    
    // 3. Migrate allocations
    if (allocations && allocations.length > 0) {
      // Clear allocations and recreate them
      await executeQuery('DELETE FROM allocations');
      for (const a of allocations) {
        await executeQuery(
          `INSERT INTO allocations (id, projectId, designerId, startDate, endDate, hours, offsetHours) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [a.id, a.projectId, a.designerId, a.startDate, a.endDate, a.hours, a.offsetHours || 0]
        );
      }
    }
    
    // 4. Migrate capacities
    if (capacities) {
      const capEntries = Array.isArray(capacities) ? capacities : Object.entries(capacities).map(([designerId, dailyCapacity]) => ({ designerId, dailyCapacity }));
      for (const c of capEntries) {
        await executeQuery(
          `INSERT INTO capacities (designerId, dailyCapacity) 
           VALUES (?, ?) 
           ON CONFLICT (designerId) DO UPDATE SET dailyCapacity = EXCLUDED.dailyCapacity`,
          [c.designerId, c.dailyCapacity]
        );
      }
    }
    
    res.json({ success: true, message: 'Дані успішно імпортовані в Postgres' });
  } catch (err) {
    console.error('Migration failed:', err);
    res.status(500).json({ error: err.message });
  }
});



// Start Express Server
app.listen(PORT, () => {
  console.log(`Planner Express Server running on port ${PORT}`);
});
