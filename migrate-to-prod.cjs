const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, async (err) => {
  if (err) {
    console.error('Error opening local SQLite database:', err.message);
    process.exit(1);
  }
  console.log('Connected to local SQLite database.');
  
  try {
    const users = await queryAll('SELECT * FROM users');
    const projects = await queryAll('SELECT * FROM projects');
    const allocations = await queryAll('SELECT * FROM allocations');
    const capacities = await queryAll('SELECT * FROM capacities');
    
    const payload = {
      email: 'radvancor@gmail.com',
      password: '80938093r',
      data: {
        users: users.map(u => ({ ...u, isDesigner: !!u.isDesigner })),
        projects: projects.map(p => ({ ...p, memberIds: JSON.parse(p.memberIds || '[]') })),
        allocations: allocations.map(a => ({
          id: a.id,
          projectId: a.projectId,
          designerId: a.designerId,
          startDate: a.startDate,
          endDate: a.endDate,
          hours: Number(a.hours),
          offsetHours: Number(a.offsetHours || 0)
        })),
        capacities: capacities.map(c => ({
          designerId: c.designerId,
          dailyCapacity: Number(c.dailyCapacity)
        }))
      }
    };
    
    console.log(`Loaded from local SQLite: ${users.length} users, ${projects.length} projects, ${allocations.length} allocations, ${capacities.length} capacities.`);
    
    console.log('Sending data to Vercel production Postgres database (https://allocater-five.vercel.app)...');
    
    const response = await fetch('https://allocater-five.vercel.app/api/migrate-from-sqlite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    if (response.ok && result.success) {
      console.log('SUCCESS! Postgres migration completed successfully:', result.message);
    } else {
      console.error('Migration failed:', result.error || result);
    }
  } catch (e) {
    console.error('Error during migration:', e);
  } finally {
    db.close();
  }
});

function queryAll(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}
