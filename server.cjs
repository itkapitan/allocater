const express = require('express');
const path = require('path');
const fs = require('fs');
const { put } = require('@vercel/blob');
const { fileURLToPath } = require('url');

const app = express();
const PORT = process.env.PORT || 5101;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// A middleware to block incoming requests until the DB has finished initializing (highly relevant for Serverless)
app.use(async (req, res, next) => {
  try {
    await dbInitPromise;
    next();
  } catch (err) {
    console.error('Database initialization failed:', err);
    res.status(500).json({ error: 'Database initialization failed: ' + err.message });
  }
});

// Detect if we should use PostgreSQL (Vercel/Neon) or local SQLite
const isPostgres = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);

let db = null;
let pgPool = null;

let resolveDbInit = null;
let rejectDbInit = null;
const dbInitPromise = new Promise((resolve, reject) => {
  resolveDbInit = resolve;
  rejectDbInit = reject;
});

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
      sortOrder INTEGER DEFAULT 0,
      spaceId TEXT,
      isArchived INTEGER DEFAULT 0,
      taskNumber TEXT,
      figmaLink TEXT
    )`);

    try {
      await executeQuery(`ALTER TABLE projects ADD COLUMN sortOrder INTEGER DEFAULT 0`);
    } catch (e) {
      // Ignored if column already exists
    }

    try {
      await executeQuery(`ALTER TABLE projects ADD COLUMN spaceId TEXT`);
    } catch (e) {
      // Ignored if column already exists
    }

    try {
      await executeQuery(`ALTER TABLE projects ADD COLUMN isArchived INTEGER DEFAULT 0`);
    } catch (e) {
      // Ignored if column already exists
    }

    try {
      await executeQuery(`ALTER TABLE projects ADD COLUMN taskNumber TEXT`);
    } catch (e) {
      // Ignored if column already exists
    }

    try {
      await executeQuery(`ALTER TABLE projects ADD COLUMN figmaLink TEXT`);
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

    await executeQuery(`CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      name TEXT,
      memberIds TEXT,
      autoTransferIncomplete INTEGER DEFAULT 0
    )`);

    try {
      await executeQuery(`ALTER TABLE spaces ADD COLUMN autoTransferIncomplete INTEGER DEFAULT 0`);
    } catch (e) {
      // Ignored if column already exists
    }

    await executeQuery(`CREATE TABLE IF NOT EXISTS task_columns (
      id TEXT PRIMARY KEY,
      name TEXT,
      spaceId TEXT,
      sortOrder INTEGER,
      isDone INTEGER DEFAULT 0,
      isProgress INTEGER DEFAULT 0
    )`);

    try {
      await executeQuery(`ALTER TABLE task_columns ADD COLUMN isProgress INTEGER DEFAULT 0`);
    } catch (e) {
      // Ignored if column already exists
    }

    await executeQuery(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      projectId TEXT,
      designerId TEXT,
      columnId TEXT,
      sortOrder INTEGER,
      createdAt TEXT,
      weekStart TEXT
    )`);

    try {
      await executeQuery(`ALTER TABLE tasks ADD COLUMN weekStart TEXT`);
    } catch (e) {
      // Ignored if column already exists
    }

    // Миграция старых задач для проставления дефолтной недели текущего спринта
    await executeQuery(`UPDATE tasks SET weekStart = '2026-07-27' WHERE weekStart IS NULL OR weekStart = ''`);

    await executeQuery(`CREATE TABLE IF NOT EXISTS task_attachments (
      id TEXT PRIMARY KEY,
      taskId TEXT,
      fileName TEXT,
      fileUrl TEXT
    )`);

    await executeQuery(`CREATE TABLE IF NOT EXISTS task_links (
      id TEXT PRIMARY KEY,
      taskId TEXT,
      url TEXT,
      title TEXT
    )`);

    try {
      await executeQuery(`CREATE TABLE IF NOT EXISTS task_images (
        filename TEXT PRIMARY KEY,
        mimetype TEXT,
        data TEXT
      )`);
    } catch (e) {
      console.error('Error creating task_images table in initializeDb:', e);
    }

    try {
      if (isPostgres) {
        await executeQuery(`CREATE TABLE IF NOT EXISTS project_orders (
          projectid TEXT,
          weekstart TEXT,
          sortorder INTEGER,
          PRIMARY KEY (projectid, weekstart)
        )`);
      } else {
        await executeQuery(`CREATE TABLE IF NOT EXISTS project_orders (
          projectId TEXT,
          weekStart TEXT,
          sortOrder INTEGER,
          PRIMARY KEY (projectId, weekStart)
        )`);
      }
    } catch (e) {
      console.error('Error creating project_orders table in initializeDb:', e);
    }

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

    // Check and seed default space if empty
    const spaceRows = await executeQuery('SELECT COUNT(*) as count FROM spaces');
    const spaceCount = spaceRows && spaceRows[0] ? parseInt(spaceRows[0].count || spaceRows[0].COUNT || Object.values(spaceRows[0])[0] || 0, 10) : 0;
    if (spaceCount === 0) {
      console.log('Seeding initial space...');
      // Get all current user IDs
      const allUsers = await executeQuery('SELECT id FROM users');
      const allUserIds = allUsers.map((u) => u.id);
      
      await executeQuery(
        'INSERT INTO spaces (id, name, memberIds) VALUES (?, ?, ?)',
        ['1', 'Дизайнери', JSON.stringify(allUserIds)]
      );
      
      // Associate all existing projects with the default space
      await executeQuery("UPDATE projects SET spaceId = '1' WHERE spaceId IS NULL OR spaceId = ''");
    }

    // Сидинг колонок задач по умолчанию для пространства '1'
    const columnRows = await executeQuery('SELECT COUNT(*) as count FROM task_columns');
    const columnCount = columnRows && columnRows[0] ? parseInt(columnRows[0].count || columnRows[0].COUNT || Object.values(columnRows[0])[0] || 0, 10) : 0;
    if (columnCount === 0) {
      console.log('Seeding initial task columns...');
      const defaultCols = [
        { id: 'col-todo', name: 'Нужно сделать', spaceId: '1', sortOrder: 0, isDone: 0 },
        { id: 'col-progress', name: 'В работе', spaceId: '1', sortOrder: 1, isDone: 0 },
        { id: 'col-done', name: 'Выполнено', spaceId: '1', sortOrder: 2, isDone: 1 },
      ];
      for (const col of defaultCols) {
        await executeQuery(
          'INSERT INTO task_columns (id, name, spaceId, sortOrder, isDone) VALUES (?, ?, ?, ?, ?)',
          [col.id, col.name, col.spaceId, col.sortOrder, col.isDone]
        );
      }
    }
    if (resolveDbInit) resolveDbInit();
  } catch (err) {
    console.error('Error initializing database:', err);
    if (rejectDbInit) rejectDbInit(err);
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

app.get('/api/data', async (req, res) => {
  try {
    const rawUsers = await executeQuery('SELECT * FROM users');
    const rawProjects = await executeQuery('SELECT * FROM projects ORDER BY sortOrder ASC, id ASC');
    const rawAllocations = await executeQuery('SELECT * FROM allocations');
    const rawCapacities = await executeQuery('SELECT * FROM capacities');
    const rawSpaces = await executeQuery('SELECT * FROM spaces');
    const rawProjectOrders = await executeQuery('SELECT * FROM project_orders');

    // Parse structures
    const users = rawUsers.map((u) => ({
      ...u,
      isDesigner: !!u.isdesigner || !!u.isDesigner
    }));

    const projects = rawProjects.map((p) => ({
      ...p,
      memberIds: JSON.parse(p.memberids || p.memberIds || '[]'),
      spaceId: p.spaceid || p.spaceId || '1',
      isArchived: !!p.isarchived || !!p.isArchived,
      taskNumber: p.tasknumber !== undefined ? p.tasknumber : p.taskNumber || '',
      figmaLink: p.figmalink !== undefined ? p.figmalink : p.figmaLink || ''
    }));

    const spaces = rawSpaces.map((s) => ({
      id: s.id,
      name: s.name,
      memberIds: JSON.parse(s.memberids || s.memberIds || '[]'),
      autoTransferIncomplete: s.autotransferincomplete !== undefined ? s.autotransferincomplete : s.autoTransferIncomplete
    }));

    const capacities = {};
    rawCapacities.forEach((c) => {
      capacities[c.designerid || c.designerId] = c.dailycapacity || c.dailyCapacity;
    });

    const projectOrders = (rawProjectOrders || []).map((po) => ({
      projectId: po.projectid !== undefined ? po.projectid : po.projectId,
      weekStart: po.weekstart !== undefined ? po.weekstart : po.weekStart,
      sortOrder: po.sortorder !== undefined ? po.sortorder : po.sortOrder
    }));

    res.json({
      users,
      projects,
      spaces,
      allocations: rawAllocations.map(a => ({
        id: a.id,
        projectId: a.projectid || a.projectId,
        designerId: a.designerid || a.designerId,
        startDate: a.startdate || a.startDate,
        endDate: a.enddate || a.endDate,
        hours: Number(a.hours),
        offsetHours: Number(a.offsethours || a.offsetHours || 0)
      })),
      capacities,
      projectOrders
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

// Generic base64 image upload route for tasks body/description editor
app.post('/api/upload', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }
    let ext = 'png';
    let mimetype = 'image/png';
    let base64Data = '';
    
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,([\s\S]+)$/);
    if (matches && matches.length === 3) {
      mimetype = matches[1];
      ext = mimetype.split('/')[1] || 'png';
      if (ext === 'jpeg') ext = 'jpg';
      base64Data = matches[2].replace(/\s/g, '');
    } else {
      base64Data = image.replace(/\s/g, '');
    }
    const filename = `img_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
    const buffer = Buffer.from(base64Data, 'base64');
    
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`uploads/${filename}`, buffer, {
        access: 'public',
      });
      return res.json({ url: blob.url });
    } else {
      try {
        const targetDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.writeFileSync(path.join(targetDir, filename), buffer);
        return res.json({ url: `/uploads/${filename}` });
      } catch (fsErr) {
        console.warn('Local filesystem write failed, falling back to database storage:', fsErr.message);
        try {
          await executeQuery(
            'INSERT INTO task_images (filename, mimetype, data) VALUES (?, ?, ?)',
            [filename, mimetype, base64Data]
          );
        } catch (dbErr) {
          const errMsg = dbErr.message || '';
          if (errMsg.includes('relation "task_images" does not exist') || errMsg.includes('no such table: task_images')) {
            console.log('task_images table does not exist, creating it dynamically...');
            await executeQuery(`CREATE TABLE IF NOT EXISTS task_images (
              filename TEXT PRIMARY KEY,
              mimetype TEXT,
              data TEXT
            )`);
            // Retry the insert
            await executeQuery(
              'INSERT INTO task_images (filename, mimetype, data) VALUES (?, ?, ?)',
              [filename, mimetype, base64Data]
            );
          } else {
            throw dbErr;
          }
        }
        return res.json({ url: `/api/uploads/${filename}` });
      }
    }
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload image', details: err.message, stack: err.stack });
  }
});

// Route to serve uploaded images stored in the database
app.get('/api/uploads/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const rows = await executeQuery('SELECT mimetype, data FROM task_images WHERE filename = ?', [filename]);
    if (!rows || rows.length === 0) {
      return res.status(404).send('File not found');
    }
    const row = rows[0];
    const mimetype = row.mimetype || row.MIMETYPE || row.mimeType || 'image/png';
    const data = row.data || row.DATA;
    const buffer = Buffer.from(data, 'base64');
    res.setHeader('Content-Type', mimetype);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.send(buffer);
  } catch (err) {
    console.error('Serve file error:', err);
    res.status(500).send('Internal server error');
  }
});

// Helper to search for a file recursively in a directory
function findFileRecursive(dir, filename) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
        const found = findFileRecursive(fullPath, filename);
        if (found) return found;
      } else if (file.toLowerCase() === filename.toLowerCase()) {
        return fullPath;
      }
    }
  } catch (err) {
    // ignored
  }
  return null;
}

// Endpoint to import task from JSON and upload local images to public/uploads or DB
app.post('/api/tasks/import-json', async (req, res) => {
  try {
    const { title, editorData } = req.body;
    if (!editorData || !editorData.blocks) {
      return res.status(400).json({ error: 'Invalid editorData format' });
    }

    const blocks = editorData.blocks;
    for (const block of blocks) {
      if (block.type === 'image' && block.data) {
        const fileUrl = block.data.file ? block.data.file.url : '';
        const caption = block.data.caption || '';
        
        let filenameToFind = null;
        
        // 1. Try to extract filename from URL (if it is a path or filename)
        if (fileUrl && !fileUrl.startsWith('data:')) {
          const baseName = path.basename(fileUrl);
          if (/\.(jpg|jpeg|png|webp|gif)$/i.test(baseName)) {
            filenameToFind = baseName;
          }
        }
        
        // 2. If url is a placeholder (starts with data:image/gif or similar),
        // try to extract the filename from the caption!
        if (!filenameToFind || fileUrl.startsWith('data:image/gif')) {
          const match = caption.match(/([a-zA-Z0-9_\-\s]+\.(?:jpg|jpeg|png|webp|gif))/i);
          if (match) {
            filenameToFind = match[1].trim();
          }
        }

        if (filenameToFind) {
          let resolvedPath = null;
          
          // If the URL was a local path, check direct existence
          if (fileUrl && !fileUrl.startsWith('data:')) {
            let directPath = fileUrl;
            if (directPath.startsWith('file:')) {
              try {
                directPath = fileURLToPath(directPath);
              } catch (e) {
                directPath = decodeURIComponent(directPath.replace(/^file:\/\/\/?/, ''));
                if (!/^[a-zA-Z]:/.test(directPath) && !directPath.startsWith('/')) {
                  directPath = '/' + directPath;
                }
              }
            } else {
              try {
                directPath = decodeURIComponent(directPath);
              } catch (e) {}
            }
            if (fs.existsSync(directPath)) {
              resolvedPath = directPath;
            }
          }
          
          // If not found directly, search recursively in standard folders
          if (!resolvedPath) {
            const homeDir = require('os').homedir();
            const searchRoots = [
              path.join(homeDir, 'Documents', 'Screen Video'),
              path.join(homeDir, 'Downloads'),
              path.join(homeDir, 'Desktop')
            ];
            for (const root of searchRoots) {
              if (fs.existsSync(root)) {
                resolvedPath = findFileRecursive(root, filenameToFind);
                if (resolvedPath) {
                  break;
                }
              }
            }
          }

          if (resolvedPath && fs.existsSync(resolvedPath)) {
            try {
              const buffer = fs.readFileSync(resolvedPath);
              const extname = path.extname(resolvedPath).toLowerCase().replace('.', '');
              let mimetype = 'image/png';
              if (extname === 'jpg' || extname === 'jpeg') mimetype = 'image/jpeg';
              else if (extname === 'gif') mimetype = 'image/gif';
              else if (extname === 'webp') mimetype = 'image/webp';
              
              const ext = extname || 'png';
              const filename = `img_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
              
              let newUrl = '';
              if (process.env.BLOB_READ_WRITE_TOKEN) {
                const { put } = await import('@vercel/blob');
                const blob = await put(`uploads/${filename}`, buffer, {
                  access: 'public',
                });
                newUrl = blob.url;
              } else {
                try {
                  const targetDir = path.join(__dirname, 'public', 'uploads');
                  if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                  }
                  fs.writeFileSync(path.join(targetDir, filename), buffer);
                  newUrl = `/uploads/${filename}`;
                } catch (fsErr) {
                  console.warn('Local filesystem write failed for imported image, falling back to database storage:', fsErr.message);
                  const base64Data = buffer.toString('base64');
                  try {
                    await executeQuery(
                      'INSERT INTO task_images (filename, mimetype, data) VALUES (?, ?, ?)',
                      [filename, mimetype, base64Data]
                    );
                  } catch (dbErr) {
                    const errMsg = dbErr.message || '';
                    if (errMsg.includes('relation "task_images" does not exist') || errMsg.includes('no such table: task_images')) {
                      await executeQuery(`CREATE TABLE IF NOT EXISTS task_images (
                        filename TEXT PRIMARY KEY,
                        mimetype TEXT,
                        data TEXT
                      )`);
                      await executeQuery(
                        'INSERT INTO task_images (filename, mimetype, data) VALUES (?, ?, ?)',
                        [filename, mimetype, base64Data]
                      );
                    } else {
                      throw dbErr;
                    }
                  }
                  newUrl = `/api/uploads/${filename}`;
                }
              }
              if (!block.data.file) block.data.file = {};
              block.data.file.url = newUrl;
            } catch (fileErr) {
              console.error(`Import JSON: Failed to read local file ${resolvedPath}:`, fileErr);
            }
          } else {
            console.warn(`Import JSON: Could not locate screenshot file on local machine: ${filenameToFind}`);
          }
        }
      }
    }

    res.json({
      title: title || 'Нова задача',
      editorData
    });
  } catch (err) {
    console.error('Import JSON error:', err);
    res.status(500).json({ error: 'Failed to import JSON data', details: err.message });
  }
});

// Project CRUD
app.post('/api/projects', async (req, res) => {
  const { id, name, color, memberIds, spaceId, taskNumber, figmaLink } = req.body;
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
      'INSERT INTO projects (id, name, color, memberIds, sortOrder, spaceId, isArchived, taskNumber, figmaLink) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, color, JSON.stringify(memberIds), newSortOrder, spaceId || '1', 0, taskNumber || '', figmaLink || '']
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Spaces CRUD
app.post('/api/spaces', async (req, res) => {
  const { id, name, memberIds, autoTransferIncomplete } = req.body;
  try {
    await executeQuery(
      'INSERT INTO spaces (id, name, memberIds, autoTransferIncomplete) VALUES (?, ?, ?, ?)',
      [id, name, JSON.stringify(memberIds), autoTransferIncomplete || 0]
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/spaces/:id', async (req, res) => {
  const { id } = req.params;
  const { name, memberIds, autoTransferIncomplete } = req.body;
  try {
    let query = 'UPDATE spaces SET ';
    const params = [];
    if (name !== undefined) {
      query += 'name = ?, ';
      params.push(name);
    }
    if (memberIds !== undefined) {
      query += 'memberIds = ?, ';
      params.push(JSON.stringify(memberIds));
    }
    if (autoTransferIncomplete !== undefined) {
      query += 'autoTransferIncomplete = ?, ';
      params.push(autoTransferIncomplete);
    }
    query = query.slice(0, -2) + ' WHERE id = ?';
    params.push(id);
    
    await executeQuery(query, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/spaces/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Get all projects in this space
    const projs = await executeQuery('SELECT id FROM projects WHERE spaceId = ?', [id]);
    if (projs && projs.length > 0) {
      const projIds = projs.map(p => p.id);
      // 2. Delete allocations of these projects
      for (const pid of projIds) {
        await executeQuery('DELETE FROM allocations WHERE projectId = ?', [pid]);
      }
      // 3. Delete projects
      await executeQuery('DELETE FROM projects WHERE spaceId = ?', [id]);
    }
    // 4. Delete the space
    await executeQuery('DELETE FROM spaces WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update projects sort order
app.put('/api/projects/order', async (req, res) => {
  const { ids, weekStart } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Некоректні IDs' });
  }
  try {
    if (weekStart) {
      for (let i = 0; i < ids.length; i++) {
        const projectId = ids[i];
        if (isPostgres) {
          await executeQuery(
            `INSERT INTO project_orders (projectid, weekstart, sortorder) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (projectid, weekstart) 
             DO UPDATE SET sortorder = EXCLUDED.sortorder`,
            [projectId, weekStart, i]
          );
        } else {
          await executeQuery(
            `INSERT OR REPLACE INTO project_orders (projectId, weekStart, sortOrder) 
             VALUES (?, ?, ?)`,
            [projectId, weekStart, i]
          );
        }
      }
    } else {
      for (let i = 0; i < ids.length; i++) {
        await executeQuery('UPDATE projects SET sortOrder = ? WHERE id = ?', [i, ids[i]]);
      }
    }
    res.json({ success: true, message: 'Порядок проектів успішно збережено' });
  } catch (err) {
    console.error('Error updating projects order:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
    const { name, color, memberIds, isArchived, taskNumber, figmaLink } = req.body;
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
      if (isArchived !== undefined) {
        query += 'isArchived = ?, ';
        params.push(isArchived ? 1 : 0);
      }
      if (taskNumber !== undefined) {
        query += 'taskNumber = ?, ';
        params.push(taskNumber);
      }
      if (figmaLink !== undefined) {
        query += 'figmaLink = ?, ';
        params.push(figmaLink);
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

// --- Tasks & Columns API (Kanban Tracker) ---

app.get('/api/tasks/data', async (req, res) => {
  try {
    const columns = await executeQuery('SELECT * FROM task_columns ORDER BY sortOrder ASC');
    const tasks = await executeQuery('SELECT * FROM tasks ORDER BY sortOrder ASC');
    const attachments = await executeQuery('SELECT * FROM task_attachments');
    const links = await executeQuery('SELECT * FROM task_links');
    
    res.json({
      columns: columns.map(c => ({
        id: c.id,
        name: c.name,
        spaceId: c.spaceid || c.spaceId,
        sortOrder: c.sortorder || c.sortOrder,
        isDone: c.isdone !== undefined ? !!c.isdone : !!c.isDone,
        isProgress: c.isprogress !== undefined ? !!c.isprogress : !!c.isProgress
      })),
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        projectId: t.projectid || t.projectId,
        designerId: t.designerid || t.designerId,
        columnId: t.columnid || t.columnId,
        sortOrder: t.sortorder || t.sortOrder,
        createdAt: t.createdat || t.createdAt,
        weekStart: t.weekstart || t.weekStart
      })),
      attachments: attachments.map(a => ({
        id: a.id,
        taskId: a.taskid || a.taskId,
        fileName: a.filename || a.fileName,
        fileUrl: a.fileurl || a.fileUrl
      })),
      links: links.map(l => ({
        id: l.id,
        taskId: l.taskid || l.taskId,
        url: l.url,
        title: l.title
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/task-columns', async (req, res) => {
  const { id, name, spaceId, sortOrder, isDone, isProgress } = req.body;
  try {
    await executeQuery(
      'INSERT INTO task_columns (id, name, spaceId, sortOrder, isDone, isProgress) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, spaceId, sortOrder, isDone ? 1 : 0, isProgress ? 1 : 0]
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/task-columns/:id', async (req, res) => {
  const { id } = req.params;
  const { name, sortOrder, isDone, isProgress } = req.body;
  try {
    let query = 'UPDATE task_columns SET ';
    const params = [];
    if (name !== undefined) {
      query += 'name = ?, ';
      params.push(name);
    }
    if (sortOrder !== undefined) {
      query += 'sortOrder = ?, ';
      params.push(sortOrder);
    }
    if (isDone !== undefined) {
      query += 'isDone = ?, ';
      params.push(isDone ? 1 : 0);
    }
    if (isProgress !== undefined) {
      query += 'isProgress = ?, ';
      params.push(isProgress ? 1 : 0);
    }
    query = query.slice(0, -2) + ' WHERE id = ?';
    params.push(id);
    await executeQuery(query, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/task-columns/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await executeQuery('DELETE FROM task_columns WHERE id = ?', [id]);
    await executeQuery('DELETE FROM tasks WHERE columnId = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { id, title, description, projectId, designerId, columnId, sortOrder, createdAt, weekStart } = req.body;
  try {
    await executeQuery(
      'INSERT INTO tasks (id, title, description, projectId, designerId, columnId, sortOrder, createdAt, weekStart) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, description || '', projectId, designerId || null, columnId, sortOrder, createdAt || new Date().toISOString(), weekStart]
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to extract image URLs from Editor.js JSON description
function getImageUrlsFromDescription(description) {
  const urls = [];
  if (!description) return urls;
  const trimmed = description.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const data = JSON.parse(trimmed);
      if (data && data.blocks) {
        data.blocks.forEach((block) => {
          if (block.type === 'image' && block.data && block.data.file && block.data.file.url) {
            urls.push(block.data.file.url);
          }
        });
      }
    } catch (e) {
      // Ignored
    }
  }
  return urls;
}

// Helper to delete an image file from local uploads, database, or Vercel Blob
function deleteUploadFile(fileUrl) {
  if (!fileUrl) return;
  if (fileUrl.startsWith('/uploads/')) {
    const filename = fileUrl.replace('/uploads/', '');
    const filepath = path.join(__dirname, 'public', 'uploads', filename);
    if (fs.existsSync(filepath)) {
      try {
        fs.unlinkSync(filepath);
        console.log(`Deleted local file: ${filepath}`);
      } catch (err) {
        console.error(`Failed to delete local file ${filepath}:`, err);
      }
    }
  } else if (fileUrl.startsWith('/api/uploads/')) {
    const filename = fileUrl.replace('/api/uploads/', '');
    executeQuery('DELETE FROM task_images WHERE filename = ?', [filename])
      .then(() => {
        console.log(`Deleted database file: ${filename}`);
      })
      .catch((err) => {
        console.error(`Failed to delete database file ${filename}:`, err);
      });
  } else if (fileUrl.includes('vercel-storage.com') || fileUrl.includes('public.blob.vercel-storage.com')) {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      import('@vercel/blob').then(({ del }) => {
        del(fileUrl).then(() => {
          console.log(`Deleted Vercel Blob file: ${fileUrl}`);
        }).catch((err) => {
          console.error(`Failed to delete Vercel Blob file ${fileUrl}:`, err);
        });
      });
    }
  }
}

// Compare old and new descriptions and delete images that were removed
async function cleanupDeletedImages(oldDesc, newDesc) {
  const oldUrls = getImageUrlsFromDescription(oldDesc);
  const newUrls = getImageUrlsFromDescription(newDesc);
  const deletedUrls = oldUrls.filter((url) => !newUrls.includes(url));
  deletedUrls.forEach((url) => {
    deleteUploadFile(url);
  });
}

app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, projectId, designerId, columnId, sortOrder, weekStart } = req.body;
  try {
    let query = 'UPDATE tasks SET ';
    const params = [];
    if (title !== undefined) {
      query += 'title = ?, ';
      params.push(title);
    }
    if (description !== undefined) {
      // Get old description to cleanup deleted images
      const oldRows = await executeQuery('SELECT description FROM tasks WHERE id = ?', [id]);
      const oldDesc = oldRows && oldRows[0] ? oldRows[0].description : '';
      cleanupDeletedImages(oldDesc, description);

      query += 'description = ?, ';
      params.push(description);
    }
    if (projectId !== undefined) {
      query += 'projectId = ?, ';
      params.push(projectId);
    }
    if (designerId !== undefined) {
      query += 'designerId = ?, ';
      params.push(designerId);
    }
    if (columnId !== undefined) {
      query += 'columnId = ?, ';
      params.push(columnId);
    }
    if (sortOrder !== undefined) {
      query += 'sortOrder = ?, ';
      params.push(sortOrder);
    }
    if (weekStart !== undefined) {
      query += 'weekStart = ?, ';
      params.push(weekStart);
    }
    query = query.slice(0, -2) + ' WHERE id = ?';
    params.push(id);
    await executeQuery(query, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Get old description to delete any images before deleting the task
    const oldRows = await executeQuery('SELECT description FROM tasks WHERE id = ?', [id]);
    const oldDesc = oldRows && oldRows[0] ? oldRows[0].description : '';
    const urls = getImageUrlsFromDescription(oldDesc);
    urls.forEach((url) => {
      deleteUploadFile(url);
    });

    await executeQuery('DELETE FROM tasks WHERE id = ?', [id]);
    await executeQuery('DELETE FROM task_attachments WHERE taskId = ?', [id]);
    await executeQuery('DELETE FROM task_links WHERE taskId = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks/:id/attachments', async (req, res) => {
  const { id } = req.params;
  const { fileName, fileUrl } = req.body;
  const attachmentId = `attach-${Date.now()}`;
  try {
    await executeQuery(
      'INSERT INTO task_attachments (id, taskId, fileName, fileUrl) VALUES (?, ?, ?, ?)',
      [attachmentId, id, fileName, fileUrl]
    );
    res.status(201).json({ id: attachmentId, fileName, fileUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/attachments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await executeQuery('DELETE FROM task_attachments WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks/:id/links', async (req, res) => {
  const { id } = req.params;
  const { url, title } = req.body;
  const linkId = `link-${Date.now()}`;
  try {
    await executeQuery(
      'INSERT INTO task_links (id, taskId, url, title) VALUES (?, ?, ?, ?)',
      [linkId, id, url, title || url]
    );
    res.status(201).json({ id: linkId, url, title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/links/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await executeQuery('DELETE FROM task_links WHERE id = ?', [id]);
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
