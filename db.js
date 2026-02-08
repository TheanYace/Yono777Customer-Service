const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Enhanced database configuration with better performance settings
const DB_CONFIG = {
    timeout: 5000, // 5 second timeout for busy handlers
    retries: 3, // Number of retries for failed operations
    cacheSize: -64000, // 64MB cache (negative = KB)
    synchronous: 'NORMAL', // Balance between safety and performance
    tempStore: 'MEMORY', // Store temp tables in memory
    pageSize: 4096, // 4KB page size
    mmapSize: 268435456 // 256MB memory-mapped I/O
};

// Enhanced error handler
function handleDbError(err, operation, dbName) {
    if (err) {
        console.error(`[DB Error] ${dbName} - ${operation}:`, {
            message: err.message,
            code: err.code,
            stack: err.stack?.split('\n').slice(0, 3).join('\n')
        });
        return true; // Error occurred
    }
    return false; // No error
}

// Create/open main database file (for deposits, withdrawals, users, etc.)
const dbPath = path.join(__dirname, 'yono777.db');
let db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (handleDbError(err, 'Opening database', 'Main DB')) {
        process.exit(1);
    } else {
        console.log('✅ Connected to main SQLite database (yono777.db)');
        // Enhanced pragmas for better performance
        db.serialize(() => {
            db.run('PRAGMA journal_mode = WAL', (err) => handleDbError(err, 'Setting WAL mode', 'Main DB'));
            db.run('PRAGMA foreign_keys = ON', (err) => handleDbError(err, 'Enabling foreign keys', 'Main DB'));
            db.run(`PRAGMA cache_size = ${DB_CONFIG.cacheSize}`, (err) => handleDbError(err, 'Setting cache size', 'Main DB'));
            db.run(`PRAGMA synchronous = ${DB_CONFIG.synchronous}`, (err) => handleDbError(err, 'Setting synchronous', 'Main DB'));
            db.run(`PRAGMA temp_store = ${DB_CONFIG.tempStore}`, (err) => handleDbError(err, 'Setting temp store', 'Main DB'));
            db.run(`PRAGMA mmap_size = ${DB_CONFIG.mmapSize}`, (err) => handleDbError(err, 'Setting mmap size', 'Main DB'));
            db.run('PRAGMA busy_timeout = 5000', (err) => handleDbError(err, 'Setting busy timeout', 'Main DB'));
        });
    }
});

// Create/open separate database file for chat conversations
const chatDbPath = path.join(__dirname, 'yono777_chat.db');
let chatDb = new sqlite3.Database(chatDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (handleDbError(err, 'Opening chat database', 'Chat DB')) {
        process.exit(1);
    } else {
        console.log('✅ Connected to chat SQLite database (yono777_chat.db)');
        // Enhanced pragmas for better performance
        chatDb.serialize(() => {
            chatDb.run('PRAGMA journal_mode = WAL', (err) => handleDbError(err, 'Setting WAL mode', 'Chat DB'));
            chatDb.run('PRAGMA foreign_keys = ON', (err) => handleDbError(err, 'Enabling foreign keys', 'Chat DB'));
            chatDb.run(`PRAGMA cache_size = ${DB_CONFIG.cacheSize}`, (err) => handleDbError(err, 'Setting cache size', 'Chat DB'));
            chatDb.run(`PRAGMA synchronous = ${DB_CONFIG.synchronous}`, (err) => handleDbError(err, 'Setting synchronous', 'Chat DB'));
            chatDb.run(`PRAGMA temp_store = ${DB_CONFIG.tempStore}`, (err) => handleDbError(err, 'Setting temp store', 'Chat DB'));
            chatDb.run(`PRAGMA mmap_size = ${DB_CONFIG.mmapSize}`, (err) => handleDbError(err, 'Setting mmap size', 'Chat DB'));
            chatDb.run('PRAGMA busy_timeout = 5000', (err) => handleDbError(err, 'Setting busy timeout', 'Chat DB'));
        });
    }
});

// Initialize tables
function initializeTables() {
    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            language TEXT DEFAULT 'english',
            openai_thread_id TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('Error creating users table:', err);
    });

    // Conversation history - moved to separate chat database
    // This table is now created in the chat database initialization

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
            attemptType TEXT NOT NULL,
            count INTEGER DEFAULT 0,
            resetAt DATETIME,
            FOREIGN KEY (userId) REFERENCES users(userId),
            UNIQUE(userId, attemptType)
        )
    `, (err) => {
        if (err) console.error('Error creating user_attempts table:', err);
    });
    
    // Add UNIQUE constraint if it doesn't exist (migration for existing databases)
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_attempts_unique ON user_attempts(userId, attemptType)', (err) => {
        if (err && !err.message.includes('already exists')) {
            console.error('Error creating unique index on user_attempts:', err.message);
        } else if (!err) {
            console.log('[DB] Created unique index on user_attempts(userId, attemptType)');
        }
    });

    // Deposits/Orders table (for file imports) - Enhanced with indexes
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
        if (err) {
            console.error('[DB] Error creating deposits table:', err.message);
        } else {
            console.log('[DB] Deposits table initialized successfully');
            // Create indexes for better query performance
            db.run('CREATE INDEX IF NOT EXISTS idx_deposits_orderNumber ON deposits(orderNumber)', (idxErr) => {
                if (idxErr) console.error('[DB] Error creating index on deposits.orderNumber:', idxErr.message);
            });
            db.run('CREATE INDEX IF NOT EXISTS idx_deposits_paymentStatus ON deposits(paymentStatus)', (idxErr) => {
                if (idxErr) console.error('[DB] Error creating index on deposits.paymentStatus:', idxErr.message);
            });
            db.run('CREATE INDEX IF NOT EXISTS idx_deposits_createdAt ON deposits(createdAt DESC)', (idxErr) => {
                if (idxErr) console.error('[DB] Error creating index on deposits.createdAt:', idxErr.message);
            });
        }
    });

    // Withdrawals/Orders table (for file imports) - Enhanced with indexes
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
        if (err) {
            console.error('[DB] Error creating withdrawals table:', err.message);
        } else {
            console.log('[DB] Withdrawals table created successfully');
            // Create indexes for better query performance
            db.run('CREATE INDEX IF NOT EXISTS idx_withdrawals_orderNumber ON withdrawals(orderNumber)', (idxErr) => {
                if (idxErr) console.error('[DB] Error creating index on withdrawals.orderNumber:', idxErr.message);
            });
            db.run('CREATE INDEX IF NOT EXISTS idx_withdrawals_paymentStatus ON withdrawals(paymentStatus)', (idxErr) => {
                if (idxErr) console.error('[DB] Error creating index on withdrawals.paymentStatus:', idxErr.message);
            });
            db.run('CREATE INDEX IF NOT EXISTS idx_withdrawals_createdAt ON withdrawals(createdAt DESC)', (idxErr) => {
                if (idxErr) console.error('[DB] Error creating index on withdrawals.createdAt:', idxErr.message);
            });
        }
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

    getOpenAIThreadId(userId, callback) {
        db.get('SELECT openai_thread_id FROM users WHERE userId = ?', [userId], (err, row) => {
            if (err) {
                console.error('Error fetching OpenAI thread ID:', err);
                return callback(err, null);
            }
            callback(null, row ? row.openai_thread_id : null);
        });
    },

    setOpenAIThreadId(userId, threadId, callback) {
        db.run('UPDATE users SET openai_thread_id = ? WHERE userId = ?', [threadId, userId], (err) => {
            if (err) {
                console.error('Error setting OpenAI thread ID:', err);
            }
            if (callback) callback(err);
        });
    },

    updateUserLanguage(userId, language, callback) {
        db.run('UPDATE users SET language = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?', 
            [language, userId], 
            (err) => {
                if (callback) callback(err);
            });
    },

    // Conversations - using separate chat database - Enhanced with validation
    addConversation(userId, userMessage, botResponse, category, fileType, callback) {
        // Input validation
        if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
            const err = new Error('Invalid userId');
            if (callback) return callback(err, null);
            return;
        }
        
        // Sanitize inputs (basic sanitization)
        const sanitizedUserId = userId.trim().substring(0, 255);
        const sanitizedUserMessage = userMessage ? String(userMessage).trim().substring(0, 10000) : '';
        const sanitizedBotResponse = botResponse ? String(botResponse).trim().substring(0, 10000) : '';
        const sanitizedCategory = category ? String(category).trim().substring(0, 100) : null;
        const sanitizedFileType = fileType ? String(fileType).trim().substring(0, 50) : null;
        
        chatDb.run(
            'INSERT INTO conversations (userId, userMessage, botResponse, category, fileType) VALUES (?, ?, ?, ?, ?)',
            [sanitizedUserId, sanitizedUserMessage, sanitizedBotResponse, sanitizedCategory, sanitizedFileType],
            function(err) {
                if (err) {
                    console.error('[DB] Error adding conversation to chat database:', err.message);
                }
                if (callback) callback(err, this.lastID);
            }
        );
    },

    getConversationHistory(userId, limit, callback) {
        // Input validation
        if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
            return callback(new Error('Invalid userId'), []);
        }
        
        // Validate and sanitize limit
        const safeLimit = Math.max(0, Math.min(parseInt(limit) || 0, 10000)); // Max 10k messages
        
        // If limit is 0 or negative, load all messages (no limit) - but cap at 10k for safety
        const query = safeLimit > 0 
            ? 'SELECT * FROM conversations WHERE userId = ? ORDER BY timestamp DESC LIMIT ?'
            : 'SELECT * FROM conversations WHERE userId = ? ORDER BY timestamp DESC LIMIT 10000';
        const params = safeLimit > 0 ? [userId.trim(), safeLimit] : [userId.trim()];
        
        chatDb.all(query, params, (err, rows) => {
            if (err) {
                console.error('[DB] Error fetching conversation history from chat database:', err.message);
                return callback(err, []);
            }
            // Reverse to get chronological order
            callback(null, rows ? rows.reverse() : []);
        });
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
             ON CONFLICT(userId, attemptType) DO UPDATE SET count = count + 1`,
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

    // Get total message count (from chat database)
    getTotalMessages(callback) {
        chatDb.get('SELECT COUNT(*) as total FROM conversations', [], (err, row) => {
            if (err) {
                console.error('Error counting messages:', err);
                return callback(err, 0);
            }
            callback(null, row ? row.total : 0);
        });
    },

    // Get message count by category (from chat database)
    getMessagesByCategory(callback) {
        chatDb.all(
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

    // Get user statistics (from chat database)
    getUserStatistics(callback) {
        chatDb.get(
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

    // Get messages per user (from chat database)
    getMessagesByUser(callback) {
        chatDb.all(
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
        
        // Get total messages (from chat database)
        chatDb.get('SELECT COUNT(*) as total FROM conversations', [], (err, row) => {
            if (!err) stats.totalMessages = row ? row.total : 0;
            
            // Get total users (from chat database)
            chatDb.get('SELECT COUNT(DISTINCT userId) as total FROM conversations', [], (err, row) => {
                if (!err) stats.totalUsers = row ? row.total : 0;
                
                // Get registered users (from main database)
                db.get('SELECT COUNT(*) as total FROM users', [], (err, row) => {
                    if (!err) stats.registeredUsers = row ? row.total : 0;
                    
                    // Get open problems (from main database)
                    db.get('SELECT COUNT(*) as total FROM deposit_problems WHERE status = ?', ['open'], (err, row) => {
                        if (!err) stats.openProblems = row ? row.total : 0;
                        
                        // Get resolved problems (from main database)
                        db.get('SELECT COUNT(*) as total FROM deposit_problems WHERE status = ?', ['resolved'], (err, row) => {
                            if (!err) stats.resolvedProblems = row ? row.total : 0;
                            
                            callback(null, stats);
                        });
                    });
                });
            });
        });
    },

    // Deposits/Orders import - Enhanced with better error handling and validation
    importDeposits(deposits, callback) {
        const start = Date.now();
        let successCount = 0;
        let errorCount = 0;
        let duplicateCount = 0;
        const errors = [];

        // Enhanced helper function to parse date from Excel with better validation
        const parseExcelDate = (dateValue) => {
            if (!dateValue) return null;
            if (typeof dateValue === 'string') {
                // Try ISO format first
                let date = new Date(dateValue);
                if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
                    return date.toISOString().split('T')[0];
                }
                // Try DD/MM/YYYY or MM/DD/YYYY
                const dateMatch = dateValue.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
                if (dateMatch) {
                    const [, d, m, y] = dateMatch;
                    date = new Date(y, m - 1, d);
                    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
                }
                return null;
            }
            if (typeof dateValue === 'number') {
                // Excel serial date (days since 1900-01-01)
                const excelEpoch = new Date(1900, 0, 1);
                const date = new Date(excelEpoch.getTime() + (dateValue - 2) * 24 * 60 * 60 * 1000); // -2 for Excel bug
                if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
                    return date.toISOString().split('T')[0];
                }
            }
            return null;
        };

        // Enhanced validation
        const validateDeposit = (deposit, index) => {
            const issues = [];
            if (!deposit.orderNumber || typeof deposit.orderNumber !== 'string' || deposit.orderNumber.trim().length === 0) {
                issues.push('Missing or invalid order number');
            }
            if (deposit.amount !== null && deposit.amount !== undefined) {
                const amount = parseFloat(deposit.amount);
                if (isNaN(amount) || amount < 0) {
                    issues.push('Invalid amount');
                }
            }
            return issues;
        };

        if (!Array.isArray(deposits) || deposits.length === 0) {
            return process.nextTick(() => callback(null, { successCount: 0, errorCount: 0, duplicateCount: 0, errors: [], total: 0 }));
        }

        // Use a transaction + prepared statement for performance
        // INSERT OR IGNORE will skip duplicates instead of replacing them
        db.serialize(() => {
            db.run('BEGIN TRANSACTION', (beginErr) => {
                if (beginErr) {
                    console.error('[DB] Error beginning transaction:', beginErr.message);
                    return callback(beginErr);
                }

                const stmt = db.prepare('INSERT OR IGNORE INTO deposits (orderNumber, deliveryType, amount, paymentStatus, importDate) VALUES (?, ?, ?, ?, ?)');
                let processedCount = 0;
                let finalized = false;
                const totalToProcess = deposits.length;

                const checkAndFinalize = () => {
                    if (processedCount === totalToProcess && !finalized) {
                        finalized = true;
                        stmt.finalize((finalErr) => {
                            if (finalErr) {
                                console.error('[DB] Error finalizing statement:', finalErr.message);
                                return db.run('ROLLBACK', () => callback(finalErr));
                            }
                            db.run('COMMIT', (commitErr) => {
                                const durationMs = Date.now() - start;
                                if (commitErr) {
                                    console.error('[DB] Error committing transaction:', commitErr.message);
                                    return callback(commitErr);
                                }
                                console.log(`[DB] importDeposits: processed ${deposits.length} rows in ${durationMs}ms (imported: ${successCount}, duplicates: ${duplicateCount}, errors: ${errorCount})`);
                                callback(null, { successCount, errorCount, duplicateCount, errors, total: deposits.length, durationMs });
                            });
                        });
                    }
                };

                deposits.forEach((deposit, index) => {
                    // Validate before processing
                    const validationIssues = validateDeposit(deposit, index);
                    if (validationIssues.length > 0) {
                        errorCount++;
                        errors.push(`Row ${index + 1}: ${validationIssues.join(', ')}`);
                        processedCount++;
                        checkAndFinalize();
                        return;
                    }

                    const { orderNumber, deliveryType, amount, paymentStatus, importDate } = deposit;
                    const parsedDate = parseExcelDate(importDate);
                    const parsedAmount = amount !== null && amount !== undefined ? parseFloat(amount) : null;
                    
                    try {
                        stmt.run([
                            orderNumber.trim(), 
                            deliveryType ? String(deliveryType).trim() : null, 
                            parsedAmount, 
                            paymentStatus ? String(paymentStatus).trim() : null, 
                            parsedDate
                        ], function(err) {
                            processedCount++;
                            if (err) {
                                errorCount++;
                                errors.push(`Row ${index + 1}: ${err.message}`);
                            } else {
                                // Check if row was actually inserted (changes > 0) or ignored (duplicate)
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
        if (!orderNumber || typeof orderNumber !== 'string' || orderNumber.trim().length === 0) {
            return callback(new Error('Invalid order number'), null);
        }
        
        // Use parameterized query to prevent SQL injection
        const normalizedOrderNumber = orderNumber.trim().toUpperCase();
        db.get('SELECT * FROM deposits WHERE orderNumber = ?', [normalizedOrderNumber], (err, row) => {
            if (err) {
                console.error('[DB] Error fetching deposit:', err.message);
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

// Initialize chat database tables - Enhanced with better indexes
function initializeChatTables() {
    // Conversation history table in separate chat database
    // Use serialize to ensure table is created before indexes
    chatDb.serialize(() => {
        chatDb.run(`
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                userMessage TEXT NOT NULL,
                botResponse TEXT NOT NULL,
                category TEXT,
                fileType TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('[DB] Error creating conversations table in chat database:', err.message);
            } else {
                console.log('[DB] Chat database conversations table created successfully');
                
                // Create multiple indexes for faster queries
                const indexes = [
                    { name: 'idx_userId_timestamp', sql: 'CREATE INDEX IF NOT EXISTS idx_userId_timestamp ON conversations(userId, timestamp DESC)' },
                    { name: 'idx_userId', sql: 'CREATE INDEX IF NOT EXISTS idx_userId ON conversations(userId)' },
                    { name: 'idx_timestamp', sql: 'CREATE INDEX IF NOT EXISTS idx_timestamp ON conversations(timestamp DESC)' },
                    { name: 'idx_category', sql: 'CREATE INDEX IF NOT EXISTS idx_category ON conversations(category)' }
                ];
                
                let indexCount = 0;
                indexes.forEach(({ name, sql }) => {
                    chatDb.run(sql, (idxErr) => {
                        indexCount++;
                        if (idxErr) {
                            console.error(`[DB] Error creating index ${name}:`, idxErr.message);
                        } else {
                            console.log(`[DB] Index ${name} created successfully`);
                        }
                        if (indexCount === indexes.length) {
                            console.log('[DB] All chat database indexes created');
                            // Add fileType column if it doesn't exist (migration for existing databases)
                            chatDb.run('ALTER TABLE conversations ADD COLUMN fileType TEXT', (alterErr) => {
                                if (alterErr && !alterErr.message.includes('duplicate column')) {
                                    console.error('[DB] Error adding fileType column:', alterErr.message);
                                } else if (!alterErr) {
                                    console.log('[DB] Added fileType column to conversations table');
                                }
                            });
                        }
                    });
                });
            }
        });
        
        // Add openai_thread_id column to users table if it doesn't exist (migration)
        db.run('ALTER TABLE users ADD COLUMN openai_thread_id TEXT', (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
                console.error('[DB] Error adding openai_thread_id column:', alterErr.message);
            } else if (!alterErr) {
                console.log('[DB] Added openai_thread_id column to users table');
            }
        });
    });
}

// Initialize both databases
initializeTables();
initializeChatTables();

// Export
module.exports = {
    db,
    chatDb,
    dbHelpers,
    initializeTables,
    initializeChatTables
};

