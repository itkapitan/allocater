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

    console.log('Fetching live data from production (https://allocater.radcor.pro)...');
    const response = await fetch('https://allocater.radcor.pro/api/data');
    if (!response.ok) {
      throw new Error(`Failed to fetch production data: ${response.status} ${response.statusText}`);
    }
    
    const prodData = await response.json();
    const { users, projects, allocations, capacities } = prodData;
    
    console.log(`Successfully fetched from production:\n` +
      `- ${users ? users.length : 0} users\n` +
      `- ${projects ? projects.length : 0} projects\n` +
      `- ${allocations ? allocations.length : 0} allocations\n` +
      `- ${capacities ? Object.keys(capacities).length : 0} capacities`);
      
    // Wrap database operations in a transaction
    await runQuery('BEGIN TRANSACTION');
    
    // 1. Clear existing data
    console.log('Clearing local tables...');
    await runQuery('DELETE FROM users');
    await runQuery('DELETE FROM projects');
    await runQuery('DELETE FROM allocations');
    await runQuery('DELETE FROM capacities');
    
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
