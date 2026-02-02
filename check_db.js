const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'yono777.db');
console.log('Checking DB:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(2);
  }
});

db.serialize(() => {
  console.log('\nPRAGMA table_info(\'deposits\'):\n');
  db.all("PRAGMA table_info('deposits')", (err, cols) => {
    if (err) {
      console.error('Error reading table info:', err.message);
    } else {
      if (!cols || cols.length === 0) {
        console.log('No deposits table found or table empty.');
      } else {
        cols.forEach(c => console.log(`${c.cid}: ${c.name} (${c.type})${c.notnull ? ' NOT NULL' : ''}`));
      }
    }

    console.log('\nCounting rows in deposits...');
    db.get('SELECT COUNT(*) as cnt FROM deposits', (err, row) => {
      if (err) {
        console.error('Error counting deposits:', err.message);
      } else {
        console.log('Total rows:', row.cnt);
      }

      console.log('\nFirst 20 rows from deposits (if any):\n');
      db.all('SELECT * FROM deposits ORDER BY createdAt DESC LIMIT 20', (err, rows) => {
        if (err) {
          console.error('Error querying deposits:', err.message);
        } else if (!rows || rows.length === 0) {
          console.log('No rows returned.');
        } else {
          rows.forEach((r, i) => {
            console.log(`Row ${i + 1}:`, r);
          });
        }

        // Also show a sample PRAGMA output again to ensure importDate presence
        db.all("PRAGMA table_info('deposits')", (err2, cols2) => {
          if (!err2 && cols2) {
            const hasImportDate = cols2.some(c => c.name === 'importDate');
            console.log('\nimportDate column present?:', hasImportDate);
          }

          db.close((closeErr) => {
            if (closeErr) console.error('Error closing DB:', closeErr.message);
            else console.log('\nDone.');
            process.exit(0);
          });
        });
      });
    });
  });
});
