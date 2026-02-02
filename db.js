const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create/open database file
const dbPath = path.join(__dirname, 'yono777.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Initialize tables
function initializeTables() {
    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            language TEXT DEFAULT 'english',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('Error creating users table:', err);
    });

    // Conversation history
    db.run(`
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            userMessage TEXT NOT NULL,
            botResponse TEXT NOT NULL,
            category TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(userId)
        )
    `, (err) => {
        if (err) console.error('Error creating conversations table:', err);
    });

    // Deposit problems tracking
    db.run(`
        CREATE TABLE IF NOT EXISTS deposit_problems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL UNIQUE,
            orderNumber TEXT,
            description TEXT,
            status TEXT DEFAULT 'open',
            telegramNotified INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(userId)
        )
    `, (err) => {
        if (err) console.error('Error creating deposit_problems table:', err);
    });

    // User attempts (for rate limiting)
    db.run(`
        CREATE TABLE IF NOT EXISTS user_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            attemptType TEXT,
            count INTEGER DEFAULT 0,
            resetAt DATETIME,
            FOREIGN KEY (userId) REFERENCES users(userId)
        )
    `, (err) => {
        if (err) console.error('Error creating user_attempts table:', err);
    });

    // Deposits/Orders table (for file imports)
    db.run(`
        CREATE TABLE IF NOT EXISTS deposits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            orderNumber TEXT NOT NULL UNIQUE,
            deliveryType TEXT,
            amount REAL,
            paymentStatus TEXT,
            importDate TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('Error creating deposits table:', err);
        else console.log('Database tables initialized successfully');
    });

    // Withdrawals/Orders table (for file imports)
    db.run(`
        CREATE TABLE IF NOT EXISTS withdrawals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            orderNumber TEXT NOT NULL UNIQUE,
            deliveryType TEXT,
            amount REAL,
            paymentStatus TEXT,
            importDate TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('Error creating withdrawals table:', err);
        else console.log('Withdrawals table created successfully');
    });

    // Migration: ensure `importDate` column exists on older DBs
    db.serialize(() => {
        db.all("PRAGMA table_info('deposits')", (err, cols) => {
            if (err) {
                console.error('Error reading deposits table info:', err);
                return;
            }
            const hasImportDate = cols && cols.some(c => c.name === 'importDate');
            if (!hasImportDate) {
                console.log('Migrating deposits table: adding importDate column');
                db.run("ALTER TABLE deposits ADD COLUMN importDate TEXT", (alterErr) => {
                    if (alterErr) console.error('Error adding importDate column:', alterErr);
                    else console.log('Added importDate column to deposits table');
                });
            }
        });

        // Migration: ensure `importDate` column exists on withdrawals table
        db.all("PRAGMA table_info('withdrawals')", (err, cols) => {
            if (err) {
                console.error('Error reading withdrawals table info:', err);
                return;
            }
            const hasImportDate = cols && cols.some(c => c.name === 'importDate');
            if (!hasImportDate) {
                console.log('Migrating withdrawals table: adding importDate column');
                db.run("ALTER TABLE withdrawals ADD COLUMN importDate TEXT", (alterErr) => {
                    if (alterErr) console.error('Error adding importDate column to withdrawals:', alterErr);
                    else console.log('Added importDate column to withdrawals table');
                });
            }
        });
    });
}

// Database helper functions
const dbHelpers = {
    // Users
    getOrCreateUser(userId, language = 'english', callback) {
        db.get('SELECT * FROM users WHERE userId = ?', [userId], (err, row) => {
            if (err) {
                console.error('Error fetching user:', err);
                return callback(err, null);
            }
            
            if (row) {
                return callback(null, row);
            }
            
            // Create new user
            db.run('INSERT INTO users (userId, language) VALUES (?, ?)', [userId, language], (err) => {
                if (err) {
                    console.error('Error creating user:', err);
                    return callback(err, null);
                }
                
                db.get('SELECT * FROM users WHERE userId = ?', [userId], (err, newRow) => {
                    callback(err, newRow);
                });
            });
        });
    },

    updateUserLanguage(userId, language, callback) {
        db.run('UPDATE users SET language = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?', 
            [language, userId], 
            (err) => {
                if (callback) callback(err);
            });
    },

    // Conversations
    addConversation(userId, userMessage, botResponse, category, callback) {
        db.run(
            'INSERT INTO conversations (userId, userMessage, botResponse, category) VALUES (?, ?, ?, ?)',
            [userId, userMessage, botResponse, category],
            function(err) {
                if (err) console.error('Error adding conversation:', err);
                if (callback) callback(err, this.lastID);
            }
        );
    },

    getConversationHistory(userId, limit, callback) {
        db.all(
            'SELECT * FROM conversations WHERE userId = ? ORDER BY timestamp DESC LIMIT ?',
            [userId, limit],
            (err, rows) => {
                if (err) {
                    console.error('Error fetching conversation history:', err);
                    return callback(err, []);
                }
                // Reverse to get chronological order
                callback(null, rows ? rows.reverse() : []);
            }
        );
    },

    // Deposit problems
    recordDepositProblem(userId, orderNumber, description, callback) {
        db.run(
            `INSERT INTO deposit_problems (userId, orderNumber, description) 
             VALUES (?, ?, ?)
             ON CONFLICT(userId) DO UPDATE SET 
             orderNumber = excluded.orderNumber,
             description = excluded.description,
             updatedAt = CURRENT_TIMESTAMP`,
            [userId, orderNumber, description],
            (err) => {
                if (err) console.error('Error recording deposit problem:', err);
                if (callback) callback(err);
            }
        );
    },

    getDepositProblem(userId, callback) {
        db.get('SELECT * FROM deposit_problems WHERE userId = ?', [userId], (err, row) => {
            if (err) console.error('Error fetching deposit problem:', err);
            callback(err, row || null);
        });
    },

    updateDepositProblemStatus(userId, status, callback) {
        db.run(
            'UPDATE deposit_problems SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?',
            [status, userId],
            (err) => {
                if (err) console.error('Error updating deposit problem status:', err);
                if (callback) callback(err);
            }
        );
    },

    markDepositNotified(userId, callback) {
        db.run(
            'UPDATE deposit_problems SET telegramNotified = 1 WHERE userId = ?',
            [userId],
            (err) => {
                if (err) console.error('Error marking deposit as notified:', err);
                if (callback) callback(err);
            }
        );
    },

    // Attempts tracking
    incrementAttempt(userId, attemptType, callback) {
        db.run(
            `INSERT INTO user_attempts (userId, attemptType, count) 
             VALUES (?, ?, 1)
             ON CONFLICT(userId) DO UPDATE SET count = count + 1`,
            [userId, attemptType],
            (err) => {
                if (err) console.error('Error incrementing attempt:', err);
                if (callback) callback(err);
            }
        );
    },

    getAttemptCount(userId, attemptType, callback) {
        db.get(
            'SELECT count FROM user_attempts WHERE userId = ? AND attemptType = ?',
            [userId, attemptType],
            (err, row) => {
                if (err) {
                    console.error('Error fetching attempt count:', err);
                    return callback(err, 0);
                }
                callback(null, row ? row.count : 0);
            }
        );
    },

    resetAttempts(userId, attemptType, callback) {
        db.run(
            'DELETE FROM user_attempts WHERE userId = ? AND attemptType = ?',
            [userId, attemptType],
            (err) => {
                if (err) console.error('Error resetting attempts:', err);
                if (callback) callback(err);
            }
        );
    },

    // Get all users
    getAllUsers(callback) {
        db.all('SELECT * FROM users ORDER BY createdAt DESC', [], (err, rows) => {
            if (err) {
                console.error('Error fetching users:', err);
                return callback(err, []);
            }
            callback(null, rows || []);
        });
    },

    // Get total message count
    getTotalMessages(callback) {
        db.get('SELECT COUNT(*) as total FROM conversations', [], (err, row) => {
            if (err) {
                console.error('Error counting messages:', err);
                return callback(err, 0);
            }
            callback(null, row ? row.total : 0);
        });
    },

    // Get message count by category
    getMessagesByCategory(callback) {
        db.all(
            'SELECT category, COUNT(*) as count FROM conversations GROUP BY category ORDER BY count DESC',
            [],
            (err, rows) => {
                if (err) {
                    console.error('Error fetching category stats:', err);
                    return callback(err, []);
                }
                callback(null, rows || []);
            }
        );
    },

    // Get user statistics
    getUserStatistics(callback) {
        db.get(
            'SELECT COUNT(DISTINCT userId) as totalUsers FROM conversations',
            [],
            (err, row) => {
                if (err) {
                    console.error('Error fetching user stats:', err);
                    return callback(err, 0);
                }
                callback(null, row ? row.totalUsers : 0);
            }
        );
    },

    // Get messages per user
    getMessagesByUser(callback) {
        db.all(
            'SELECT userId, COUNT(*) as messageCount, MAX(timestamp) as lastMessage FROM conversations GROUP BY userId ORDER BY messageCount DESC',
            [],
            (err, rows) => {
                if (err) {
                    console.error('Error fetching user messages:', err);
                    return callback(err, []);
                }
                callback(null, rows || []);
            }
        );
    },

    // Get open deposit problems
    getOpenDepositProblems(callback) {
        db.all(
            'SELECT * FROM deposit_problems WHERE status = ? ORDER BY createdAt DESC',
            ['open'],
            (err, rows) => {
                if (err) {
                    console.error('Error fetching open problems:', err);
                    return callback(err, []);
                }
                callback(null, rows || []);
            }
        );
    },

    // Get comprehensive statistics
    getComprehensiveStats(callback) {
        const stats = {};
        
        // Get total messages
        db.get('SELECT COUNT(*) as total FROM conversations', [], (err, row) => {
            if (!err) stats.totalMessages = row ? row.total : 0;
            
            // Get total users
            db.get('SELECT COUNT(DISTINCT userId) as total FROM conversations', [], (err, row) => {
                if (!err) stats.totalUsers = row ? row.total : 0;
                
                // Get registered users
                db.get('SELECT COUNT(*) as total FROM users', [], (err, row) => {
                    if (!err) stats.registeredUsers = row ? row.total : 0;
                    
                    // Get open problems
                    db.get('SELECT COUNT(*) as total FROM deposit_problems WHERE status = ?', ['open'], (err, row) => {
                        if (!err) stats.openProblems = row ? row.total : 0;
                        
                        // Get resolved problems
                        db.get('SELECT COUNT(*) as total FROM deposit_problems WHERE status = ?', ['resolved'], (err, row) => {
                            if (!err) stats.resolvedProblems = row ? row.total : 0;
                            
                            callback(null, stats);
                        });
                    });
                });
            });
        });
    },

    // Deposits/Orders import
    importDeposits(deposits, callback) {
        const start = Date.now();
        let successCount = 0;
        let errorCount = 0;
        let duplicateCount = 0;
        const errors = [];

        // Helper function to parse date from Excel
        const parseExcelDate = (dateValue) => {
            if (!dateValue) return null;
            if (typeof dateValue === 'string') {
                const date = new Date(dateValue);
                if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
                return dateValue;
            }
            if (typeof dateValue === 'number') {
                const excelEpoch = new Date(1900, 0, 1);
                const date = new Date(excelEpoch.getTime() + (dateValue - 1) * 24 * 60 * 60 * 1000);
                if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
            }
            return null;
        };

        if (!Array.isArray(deposits) || deposits.length === 0) {
            return process.nextTick(() => callback(null, { successCount: 0, errorCount: 0, duplicateCount: 0, errors: [], total: 0 }));
        }

        // Use a transaction + prepared statement for performance
        // INSERT OR IGNORE will skip duplicates instead of replacing them
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            const stmt = db.prepare('INSERT OR IGNORE INTO deposits (orderNumber, deliveryType, amount, paymentStatus, importDate) VALUES (?, ?, ?, ?, ?)');
            let processedCount = 0;
            let finalized = false;
            const totalToProcess = deposits.length;

            const checkAndFinalize = () => {
                if (processedCount === totalToProcess && !finalized) {
                    finalized = true;
                    stmt.finalize((finalErr) => {
                        if (finalErr) console.error('Error finalizing statement:', finalErr.message);
                        db.run('COMMIT', (commitErr) => {
                            const durationMs = Date.now() - start;
                            if (commitErr) {
                                console.error('Error committing transaction:', commitErr.message);
                                return callback(commitErr);
                            }
                            console.log(`importDeposits: processed ${deposits.length} rows in ${durationMs}ms (imported: ${successCount}, duplicates: ${duplicateCount}, errors: ${errorCount})`);
                            callback(null, { successCount, errorCount, duplicateCount, errors, total: deposits.length, durationMs });
                        });
                    });
                }
            };

            deposits.forEach((deposit, index) => {
                const { orderNumber, deliveryType, amount, paymentStatus, importDate } = deposit;
                if (!orderNumber) {
                    errorCount++;
                    errors.push(`Row ${index + 1}: Missing order number`);
                    processedCount++;
                    checkAndFinalize();
                    return;
                }

                const parsedDate = parseExcelDate(importDate);
                try {
                    stmt.run([orderNumber, deliveryType || null, amount || null, paymentStatus || null, parsedDate || null], function(err) {
                        processedCount++;
                        if (err) {
                            errorCount++;
                            errors.push(`Row ${index + 1}: ${err.message}`);
                        } else {
                            // Check if row was actually inserted (changes > 0) or ignored (duplicate)
                            // For INSERT OR IGNORE: changes = 1 if inserted, changes = 0 if ignored (duplicate)
                            if (this.changes > 0) {
                                successCount++;
                            } else {
                                duplicateCount++;
                            }
                        }
                        checkAndFinalize();
                    });
                } catch (e) {
                    processedCount++;
                    errorCount++;
                    errors.push(`Row ${index + 1}: ${e.message}`);
                    checkAndFinalize();
                }
            });
        });
    },

    // Paginated deposits query for browsing
    getDepositsPaged(limit = 50, offset = 0, callback) {
        db.all('SELECT * FROM deposits ORDER BY createdAt DESC LIMIT ? OFFSET ?', [limit, offset], (err, rows) => {
            if (err) {
                console.error('Error fetching paged deposits:', err);
                return callback(err, []);
            }
            callback(null, rows || []);
        });
    },

    getAllDeposits(callback) {
        db.all('SELECT * FROM deposits ORDER BY createdAt DESC', [], (err, rows) => {
            if (err) {
                console.error('Error fetching deposits:', err);
                return callback(err, []);
            }
            callback(null, rows || []);
        });
    },

    getDepositByOrderNumber(orderNumber, callback) {
        db.get('SELECT * FROM deposits WHERE orderNumber = ?', [orderNumber], (err, row) => {
            if (err) {
                console.error('Error fetching deposit:', err);
                return callback(err, null);
            }
            callback(null, row);
        });
    },

    // Withdrawals/Orders import
    importWithdrawals(withdrawals, callback) {
        const start = Date.now();
        let successCount = 0;
        let errorCount = 0;
        let duplicateCount = 0;
        const errors = [];

        // Helper function to parse date from Excel
        const parseExcelDate = (dateValue) => {
            if (!dateValue) return null;
            if (typeof dateValue === 'string') {
                const date = new Date(dateValue);
                if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
                return dateValue;
            }
            if (typeof dateValue === 'number') {
                const excelEpoch = new Date(1900, 0, 1);
                const date = new Date(excelEpoch.getTime() + (dateValue - 1) * 24 * 60 * 60 * 1000);
                if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
            }
            return null;
        };

        if (!Array.isArray(withdrawals) || withdrawals.length === 0) {
            return process.nextTick(() => callback(null, { successCount: 0, errorCount: 0, duplicateCount: 0, errors: [], total: 0 }));
        }

        // Use a transaction + prepared statement for performance
        // INSERT OR IGNORE will skip duplicates instead of replacing them
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            const stmt = db.prepare('INSERT OR IGNORE INTO withdrawals (orderNumber, deliveryType, amount, paymentStatus, importDate) VALUES (?, ?, ?, ?, ?)');
            let processedCount = 0;
            let finalized = false;
            const totalToProcess = withdrawals.length;

            const checkAndFinalize = () => {
                if (processedCount === totalToProcess && !finalized) {
                    finalized = true;
                    stmt.finalize((finalErr) => {
                        if (finalErr) console.error('Error finalizing statement:', finalErr.message);
                        db.run('COMMIT', (commitErr) => {
                            const durationMs = Date.now() - start;
                            if (commitErr) {
                                console.error('Error committing transaction:', commitErr.message);
                                return callback(commitErr);
                            }
                            console.log(`importWithdrawals: processed ${withdrawals.length} rows in ${durationMs}ms (imported: ${successCount}, duplicates: ${duplicateCount}, errors: ${errorCount})`);
                            callback(null, { successCount, errorCount, duplicateCount, errors, total: withdrawals.length, durationMs });
                        });
                    });
                }
            };

            withdrawals.forEach((withdrawal, index) => {
                const { orderNumber, deliveryType, amount, paymentStatus, importDate } = withdrawal;
                if (!orderNumber) {
                    errorCount++;
                    errors.push(`Row ${index + 1}: Missing order number`);
                    processedCount++;
                    checkAndFinalize();
                    return;
                }

                const parsedDate = parseExcelDate(importDate);
                try {
                    stmt.run([orderNumber, deliveryType || null, amount || null, paymentStatus || null, parsedDate || null], function(err) {
                        processedCount++;
                        if (err) {
                            errorCount++;
                            errors.push(`Row ${index + 1}: ${err.message}`);
                        } else {
                            // Check if row was actually inserted (changes > 0) or ignored (duplicate)
                            // For INSERT OR IGNORE: changes = 1 if inserted, changes = 0 if ignored (duplicate)
                            if (this.changes > 0) {
                                successCount++;
                            } else {
                                duplicateCount++;
                            }
                        }
                        checkAndFinalize();
                    });
                } catch (e) {
                    processedCount++;
                    errorCount++;
                    errors.push(`Row ${index + 1}: ${e.message}`);
                    checkAndFinalize();
                }
            });
        });
    },

    // Paginated withdrawals query for browsing
    getWithdrawalsPaged(limit = 50, offset = 0, callback) {
        db.all('SELECT * FROM withdrawals ORDER BY createdAt DESC LIMIT ? OFFSET ?', [limit, offset], (err, rows) => {
            if (err) {
                console.error('Error fetching paged withdrawals:', err);
                return callback(err, []);
            }
            callback(null, rows || []);
        });
    },

    getAllWithdrawals(callback) {
        db.all('SELECT * FROM withdrawals ORDER BY createdAt DESC', [], (err, rows) => {
            if (err) {
                console.error('Error fetching withdrawals:', err);
                return callback(err, []);
            }
            callback(null, rows || []);
        });
    },

    getWithdrawalByOrderNumber(orderNumber, callback) {
        db.get('SELECT * FROM withdrawals WHERE orderNumber = ?', [orderNumber], (err, row) => {
            if (err) {
                console.error('Error fetching withdrawal:', err);
                return callback(err, null);
            }
            callback(null, row);
        });
    }
};

// Export
module.exports = {
    db,
    dbHelpers,
    initializeTables
};

