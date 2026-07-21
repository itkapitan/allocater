const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 5101;

// Support parsing large base64 avatar strings
app.use(express.json({ limit: '10mb' }));

// Open SQLite Database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
  } else {
    console.log('Connected to local SQLite database at:', dbPath);
    initializeDb();
  }
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

function initializeDb() {
  db.serialize(() => {
    // Create Tables
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      role TEXT,
      avatar TEXT,
      isDesigner INTEGER,
      color TEXT
    )`);

    // Ensure color column is added to users table if table already existed
    db.run(`ALTER TABLE users ADD COLUMN color TEXT`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT,
      color TEXT,
      memberIds TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS allocations (
      id TEXT PRIMARY KEY,
      projectId TEXT,
      designerId TEXT,
      startDate TEXT,
      endDate TEXT,
      hours REAL,
      offsetHours REAL
    )`);

    // Ensure offsetHours column exists if database table already existed
    db.run(`ALTER TABLE allocations ADD COLUMN offsetHours REAL`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS capacities (
      designerId TEXT PRIMARY KEY,
      dailyCapacity REAL
    )`);

    // Check if database is empty and pre-populate
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
      if (row && row.count === 0) {
        console.log('Database empty. Seeding initial planner mock data...');
        
        // Seed users
        const insertUser = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)');
        INITIAL_USERS.forEach((u) => insertUser.run(u.id, u.name, u.role, u.avatar, u.isDesigner, u.color || null));
        insertUser.finalize();

        // Seed projects
        const insertProj = db.prepare('INSERT INTO projects VALUES (?, ?, ?, ?)');
        INITIAL_PROJECTS.forEach((p) => insertProj.run(p.id, p.name, p.color, p.memberIds));
        insertProj.finalize();

        // Seed allocations
        const insertAlloc = db.prepare('INSERT INTO allocations VALUES (?, ?, ?, ?, ?, ?, ?)');
        INITIAL_ALLOCATIONS.forEach((a) => insertAlloc.run(a.id, a.projectId, a.designerId, a.startDate, a.endDate, a.hours, a.offsetHours || 0));
        insertAlloc.finalize();

        // Seed capacities
        const insertCap = db.prepare('INSERT INTO capacities VALUES (?, ?)');
        INITIAL_CAPACITIES.forEach((c) => insertCap.run(c.designerId, c.dailyCapacity));
        insertCap.finalize();
        
        console.log('Seeding completed successfully.');
      }
    });
  });
}

// Helper to run query as promise
const allQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// --- API Router Endpoints ---

// Get all planner data
app.get('/api/data', async (req, res) => {
  try {
    const rawUsers = await allQuery('SELECT * FROM users');
    const rawProjects = await allQuery('SELECT * FROM projects');
    const rawAllocations = await allQuery('SELECT * FROM allocations');
    const rawCapacities = await allQuery('SELECT * FROM capacities');

    // Parse structures
    const users = rawUsers.map((u) => ({
      ...u,
      isDesigner: !!u.isDesigner
    }));

    const projects = rawProjects.map((p) => ({
      ...p,
      memberIds: JSON.parse(p.memberIds || '[]')
    }));

    const capacities = {};
    rawCapacities.forEach((c) => {
      capacities[c.designerId] = c.dailyCapacity;
    });

    res.json({
      users,
      projects,
      allocations: rawAllocations,
      capacities
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to save base64 avatar to files
function saveAvatarFile(id, avatar) {
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

// User CRUD
app.post('/api/users', (req, res) => {
  const { id, name, role, avatar, isDesigner, color } = req.body;
  const savedAvatar = saveAvatarFile(id, avatar);
  db.run(
    'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, role, savedAvatar, isDesigner ? 1 : 0, color || null],
    (err) => {
      if (err) res.status(500).json({ error: err.message });
      else res.status(201).json({ id });
    }
  );
});

app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, role, avatar, isDesigner, color } = req.body;
  const savedAvatar = saveAvatarFile(id, avatar);
  db.run(
    'UPDATE users SET name = ?, role = ?, avatar = ?, isDesigner = ?, color = ? WHERE id = ?',
    [name, role, savedAvatar, isDesigner ? 1 : 0, color || null, id],
    (err) => {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ success: true });
    }
  );
});

app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  
  db.serialize(() => {
    // Delete user
    db.run('DELETE FROM users WHERE id = ?', [id]);
    
    // Delete their allocations
    db.run('DELETE FROM allocations WHERE designerId = ?', [id]);
    
    // Delete their capacities
    db.run('DELETE FROM capacities WHERE designerId = ?', [id]);

    // Remove user from all project members list
    db.all('SELECT * FROM projects', (err, rows) => {
      if (rows) {
        rows.forEach((proj) => {
          const list = JSON.parse(proj.memberIds || '[]');
          if (list.includes(id)) {
            const updatedList = list.filter((uid) => uid !== id);
            db.run('UPDATE projects SET memberIds = ? WHERE id = ?', [JSON.stringify(updatedList), proj.id]);
          }
        });
      }
    });

    res.json({ success: true });
  });
});

// Project CRUD
app.post('/api/projects', (req, res) => {
  const { id, name, color, memberIds } = req.body;
  db.run(
    'INSERT INTO projects VALUES (?, ?, ?, ?)',
    [id, name, color, JSON.stringify(memberIds)],
    (err) => {
      if (err) res.status(500).json({ error: err.message });
      else res.status(201).json({ id });
    }
  );
});

app.put('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  const { name, color, memberIds } = req.body;
  
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

  db.run(query, params, (err) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ success: true });
  });
});

app.delete('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  db.serialize(() => {
    db.run('DELETE FROM projects WHERE id = ?', [id]);
    db.run('DELETE FROM allocations WHERE projectId = ?', [id]);
    res.json({ success: true });
  });
});

// Allocations CRUD
app.post('/api/allocations', (req, res) => {
  const { id, projectId, designerId, startDate, endDate, hours, offsetHours } = req.body;
  db.run(
    'INSERT INTO allocations VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, projectId, designerId, startDate, endDate, hours, offsetHours || 0],
    (err) => {
      if (err) res.status(500).json({ error: err.message });
      else res.status(201).json({ id });
    }
  );
});

app.put('/api/allocations/:id', (req, res) => {
  const { id } = req.params;
  const { projectId, designerId, startDate, endDate, hours, offsetHours } = req.body;

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

  db.run(query, params, (err) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ success: true });
  });
});

app.delete('/api/allocations/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM allocations WHERE id = ?', [id], (err) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ success: true });
  });
});

// Capacity Put
app.put('/api/capacities/:id', (req, res) => {
  const { id } = req.params;
  const { dailyCapacity } = req.body;
  
  db.run(
    'INSERT INTO capacities VALUES (?, ?) ON CONFLICT(designerId) DO UPDATE SET dailyCapacity = ?',
    [id, dailyCapacity, dailyCapacity],
    (err) => {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ success: true });
    }
  );
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

// Start Express Server
app.listen(PORT, () => {
  console.log(`Planner Express Server running on port ${PORT}`);
});
