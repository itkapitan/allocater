const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
console.log('Connecting to local SQLite database at:', dbPath);

const db = new sqlite3.Database(dbPath, async (err) => {
  if (err) {
    console.error('Error opening local SQLite database:', err.message);
    process.exit(1);
  }
  
  try {
    // 0. Ensure schema is up-to-date locally before pulling
    console.log('Ensuring local SQLite schema is up-to-date...');
    await runQuery(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      role TEXT,
      avatar TEXT,
      isDesigner INTEGER,
      color TEXT
    )`);
    try {
      await runQuery(`ALTER TABLE users ADD COLUMN color TEXT`);
    } catch (e) {}

    await runQuery(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT,
      color TEXT,
      memberIds TEXT,
      sortOrder INTEGER DEFAULT 0
    )`);
    try {
      await runQuery(`ALTER TABLE projects ADD COLUMN sortOrder INTEGER DEFAULT 0`);
    } catch (e) {}

    await runQuery(`CREATE TABLE IF NOT EXISTS allocations (
      id TEXT PRIMARY KEY,
      projectId TEXT,
      designerId TEXT,
      startDate TEXT,
      endDate TEXT,
      hours REAL,
      offsetHours REAL
    )`);
    try {
      await runQuery(`ALTER TABLE allocations ADD COLUMN offsetHours REAL`);
    } catch (e) {}

    await runQuery(`CREATE TABLE IF NOT EXISTS capacities (
      designerId TEXT PRIMARY KEY,
      dailyCapacity REAL
    )`);

    // Ensure local board tables exist before pulling tasks
    await runQuery(`CREATE TABLE IF NOT EXISTS task_columns (
      id TEXT PRIMARY KEY,
      name TEXT,
      spaceId TEXT,
      sortOrder INTEGER,
      isDone INTEGER DEFAULT 0
    )`);

    await runQuery(`CREATE TABLE IF NOT EXISTS tasks (
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

    await runQuery(`CREATE TABLE IF NOT EXISTS task_attachments (
      id TEXT PRIMARY KEY,
      taskId TEXT,
      filename TEXT,
      fileurl TEXT
    )`);

    await runQuery(`CREATE TABLE IF NOT EXISTS task_links (
      id TEXT PRIMARY KEY,
      taskId TEXT,
      url TEXT,
      title TEXT
    )`);

    console.log('Fetching live data from production (https://allocater.radcor.pro)...');
    const response = await fetch('https://allocater.radcor.pro/api/data');
    if (!response.ok) {
      throw new Error(`Failed to fetch production data: ${response.status} ${response.statusText}`);
    }
    const prodData = await response.json();
    const { users, projects, allocations, capacities } = prodData;

    console.log('Fetching live tasks from production (https://allocater.radcor.pro)...');
    const tasksResponse = await fetch('https://allocater.radcor.pro/api/tasks/data');
    if (!tasksResponse.ok) {
      throw new Error(`Failed to fetch production tasks: ${tasksResponse.status} ${tasksResponse.statusText}`);
    }
    const prodTasksData = await tasksResponse.json();
    const { columns: prodCols, tasks: prodTasks, attachments: prodAttachs, links: prodLinks } = prodTasksData;
    
    console.log(`Successfully fetched from production:\n` +
      `- ${users ? users.length : 0} users\n` +
      `- ${projects ? projects.length : 0} projects\n` +
      `- ${allocations ? allocations.length : 0} allocations\n` +
      `- ${capacities ? Object.keys(capacities).length : 0} capacities\n` +
      `- ${prodCols ? prodCols.length : 0} task columns\n` +
      `- ${prodTasks ? prodTasks.length : 0} tasks\n` +
      `- ${prodAttachs ? prodAttachs.length : 0} attachments\n` +
      `- ${prodLinks ? prodLinks.length : 0} links`);
      
    // Wrap database operations in a transaction
    await runQuery('BEGIN TRANSACTION');
    
    // 1. Clear existing data
    console.log('Clearing local tables...');
    await runQuery('DELETE FROM users');
    await runQuery('DELETE FROM projects');
    await runQuery('DELETE FROM allocations');
    await runQuery('DELETE FROM capacities');
    await runQuery('DELETE FROM task_columns');
    await runQuery('DELETE FROM tasks');
    await runQuery('DELETE FROM task_attachments');
    await runQuery('DELETE FROM task_links');
    
    // 2. Insert Users
    if (users && users.length > 0) {
      console.log('Inserting users...');
      const stmt = db.prepare('INSERT INTO users (id, name, role, avatar, isDesigner, color) VALUES (?, ?, ?, ?, ?, ?)');
      for (const u of users) {
        stmt.run(u.id, u.name, u.role, u.avatar, u.isDesigner ? 1 : 0, u.color || null);
      }
      stmt.finalize();
    }
    
    // 3. Insert Projects
    if (projects && projects.length > 0) {
      console.log('Inserting projects...');
      const stmt = db.prepare('INSERT INTO projects (id, name, color, memberIds, sortOrder) VALUES (?, ?, ?, ?, ?)');
      for (const p of projects) {
        stmt.run(p.id, p.name, p.color, JSON.stringify(p.memberIds || []), p.sortOrder || 0);
      }
      stmt.finalize();
    }
    
    // 4. Insert Allocations
    if (allocations && allocations.length > 0) {
      console.log('Inserting allocations...');
      const stmt = db.prepare('INSERT INTO allocations (id, projectId, designerId, startDate, endDate, hours, offsetHours) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const a of allocations) {
        stmt.run(a.id, a.projectId, a.designerId, a.startDate, a.endDate, a.hours, a.offsetHours || 0);
      }
      stmt.finalize();
    }
    
    // 5. Insert Capacities
    if (capacities && Object.keys(capacities).length > 0) {
      console.log('Inserting capacities...');
      const stmt = db.prepare('INSERT INTO capacities (designerId, dailyCapacity) VALUES (?, ?)');
      for (const [designerId, dailyCapacity] of Object.entries(capacities)) {
        stmt.run(designerId, dailyCapacity);
      }
      stmt.finalize();
    }

    // 6. Insert Columns
    if (prodCols && prodCols.length > 0) {
      console.log('Inserting columns...');
      const stmt = db.prepare('INSERT INTO task_columns (id, name, spaceId, sortOrder, isDone) VALUES (?, ?, ?, ?, ?)');
      for (const c of prodCols) {
        stmt.run(c.id, c.name, c.spaceId, c.sortOrder || 0, c.isDone ? 1 : 0);
      }
      stmt.finalize();
    }

    // 7. Insert Tasks
    if (prodTasks && prodTasks.length > 0) {
      console.log('Inserting tasks...');
      const stmt = db.prepare('INSERT INTO tasks (id, title, description, projectId, designerId, columnId, sortOrder, createdAt, weekStart) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const t of prodTasks) {
        // Если у задачи на проде нет weekStart, ставим понедельник этой недели по умолчанию
        stmt.run(t.id, t.title, t.description || '', t.projectId, t.designerId || null, t.columnId, t.sortOrder || 0, t.createdAt || new Date().toISOString(), t.weekStart || '2026-07-27');
      }
      stmt.finalize();
    }

    // 8. Insert Attachments
    if (prodAttachs && prodAttachs.length > 0) {
      console.log('Inserting attachments...');
      const stmt = db.prepare('INSERT INTO task_attachments (id, taskId, filename, fileurl) VALUES (?, ?, ?, ?)');
      for (const a of prodAttachs) {
        stmt.run(a.id, a.taskId, a.fileName, a.fileUrl);
      }
      stmt.finalize();
    }

    // 9. Insert Links
    if (prodLinks && prodLinks.length > 0) {
      console.log('Inserting links...');
      const stmt = db.prepare('INSERT INTO task_links (id, taskId, url, title) VALUES (?, ?, ?, ?)');
      for (const l of prodLinks) {
        stmt.run(l.id, l.taskId, l.url, l.title);
      }
      stmt.finalize();
    }
    
    await runQuery('COMMIT');
    console.log('SUCCESS! Local SQLite database has been fully synchronized with production Postgres.');
  } catch (e) {
    console.error('Error during synchronization:', e);
    try {
      await runQuery('ROLLBACK');
      console.log('Transaction rolled back successfully.');
    } catch (rollbackErr) {
      console.error('Error during rollback:', rollbackErr);
    }
  } finally {
    db.close(() => {
      console.log('Connection to local SQLite database closed.');
    });
  }
});

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}
