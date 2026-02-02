require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const TelegramBot = require('node-telegram-bot-api');
const { db, dbHelpers, initializeTables } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initializeTables();

// Configure multer for file uploads
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID || 'YOUR_TELEGRAM_GROUP_ID';

// Initialize Telegram Bot
let telegramBot = null;
if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN') {
    try {
        telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
        console.log('Telegram bot initialized successfully');
        
        // Handle incoming messages from Telegram
        telegramBot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            // Support text commands sent as plain text or as a caption on media/files
            const rawText = msg.text || msg.caption || '';
            const text = (rawText || '').toString().trim();
            const userId = msg.from && msg.from.id ? msg.from.id.toString() : 'unknown';

            console.log('[Telegram] Received message:', {
                chatId,
                textPreview: text.slice(0, 200),
                hasCaption: !!msg.caption,
                entities: msg.entities || null,
                from: msg.from ? { id: msg.from.id, username: msg.from.username } : null
            });
            
            // Normalize command (handle '/cmd@BotUsername' and additional args)
            const commandOnly = text.split(' ')[0].split('@')[0];

            // If a file/document was sent with a caption that requests import, download and process it
            if ((msg.document || (msg.photo && msg.photo.length)) && (commandOnly === '/importSuccessDeposit' || text.includes('/importSuccessDeposit'))) {
                try {
                    const fileId = msg.document ? msg.document.file_id : msg.photo[msg.photo.length - 1].file_id;
                    console.log('[Telegram] Document detected, downloading file id:', fileId);

                    // Get a direct file link from Telegram
                    const fileLink = await telegramBot.getFileLink(fileId);
                    console.log('[Telegram] File link:', fileLink);

                    // Download file into buffer
                    const https = require('https');
                    const downloadBuffer = (url) => new Promise((resolve, reject) => {
                        https.get(url, (res) => {
                            const chunks = [];
                            res.on('data', (chunk) => chunks.push(chunk));
                            res.on('end', () => resolve(Buffer.concat(chunks)));
                            res.on('error', reject);
                        }).on('error', reject);
                    });

                    const fileBuffer = await downloadBuffer(fileLink);
                    // Try to parse as Excel
                    let workbook;
                    try {
                        workbook = XLSX.read(fileBuffer, { type: 'buffer' });
                    } catch (parseError) {
                        console.error('[Telegram] Error parsing Excel from Telegram file:', parseError.message);
                        await telegramBot.sendMessage(chatId, '❌ Could not parse the attached file. Please send a valid Excel (XLSX/XLS/CSV) file.');
                        return;
                    }

                    const sheetName = workbook.SheetNames[0];
                    if (!sheetName) {
                        await telegramBot.sendMessage(chatId, '❌ No sheets found in the attached file.');
                        return;
                    }

                    const sheet = workbook.Sheets[sheetName];
                    const data = XLSX.utils.sheet_to_json(sheet);
                    const deposits = data.map(row => {
                        // Parse 支付时间 (Payment Time) - format: "2026-02-01 00:00:30"
                        // Extract just the date part for importDate
                        const paymentTime = row['支付时间'] || row['支付时间'] || '';
                        let importDate = null;
                        if (paymentTime) {
                            const datePart = paymentTime.toString().split(' ')[0];
                            if (datePart) {
                                importDate = datePart;
                            }
                        }
                        
                        return {
                            orderNumber: row['订单号'] || row['orderNumber'] || row['Order Number'],
                            deliveryType: row['支付VIP等级'] || row['交付VII'] || row['deliveryType'] || row['Delivery Type'] || null,
                            amount: parseFloat(row['金额'] || row['amount'] || row['Amount']) || null,
                            paymentStatus: row['支付状态'] || row['paymentStatus'] || row['Payment Status'] || row['交付状态'] || null,
                            importDate: importDate || row['日期'] || row['date'] || row['Date'] || null
                        };
                    });

                    // Import into DB (log start)
                    console.log(`[Telegram] Starting import of ${deposits.length} rows from attached file (chat ${chatId})`);
                    
                    // Estimate time: approximately 2-5ms per record
                    const estimatedTimeMs = Math.max(100, deposits.length * 3);
                    const estimatedTimeSec = (estimatedTimeMs / 1000).toFixed(1);
                    const estimatedMessage = `⏳ Starting import of ${deposits.length} records...\nEstimated time: ~${estimatedTimeSec} seconds`;
                    await telegramBot.sendMessage(chatId, estimatedMessage);
                    
                    const importStart = Date.now();
                    dbHelpers.importDeposits(deposits, async (err, result) => {
                        const duration = Date.now() - importStart;
                        if (err) {
                            console.error('[Telegram] importDeposits error:', err);
                            await telegramBot.sendMessage(chatId, `❌ Import failed: ${err.message}`);
                            return;
                        }
                        const reply = `✅ Import completed!\n\n📊 Results:\n• Imported: ${result.successCount}\n• Duplicates (skipped): ${result.duplicateCount || 0}\n• Errors: ${result.errorCount}\n• Time: ${(duration / 1000).toFixed(2)}s`;
                        console.log('[Telegram] importDeposits result:', result);
                        await telegramBot.sendMessage(chatId, reply);
                    });

                    return;
                } catch (e) {
                    console.error('[Telegram] Error handling attached file:', e);
                    telegramBot.sendMessage(chatId, '❌ Error downloading or processing attached file');
                    return;
                }
            }

            // If a file/document was sent with a caption that requests withdrawal import
            if ((msg.document || (msg.photo && msg.photo.length)) && (commandOnly === '/importSuccessWithdrawal' || text.includes('/importSuccessWithdrawal'))) {
                try {
                    const fileId = msg.document ? msg.document.file_id : msg.photo[msg.photo.length - 1].file_id;
                    console.log('[Telegram] Withdrawal document detected, downloading file id:', fileId);

                    // Get a direct file link from Telegram
                    const fileLink = await telegramBot.getFileLink(fileId);
                    console.log('[Telegram] File link:', fileLink);

                    // Download file into buffer
                    const https = require('https');
                    const downloadBuffer = (url) => new Promise((resolve, reject) => {
                        https.get(url, (res) => {
                            const chunks = [];
                            res.on('data', (chunk) => chunks.push(chunk));
                            res.on('end', () => resolve(Buffer.concat(chunks)));
                            res.on('error', reject);
                        }).on('error', reject);
                    });

                    const fileBuffer = await downloadBuffer(fileLink);
                    // Try to parse as Excel
                    let workbook;
                    try {
                        workbook = XLSX.read(fileBuffer, { type: 'buffer' });
                    } catch (parseError) {
                        console.error('[Telegram] Error parsing Excel from Telegram file:', parseError.message);
                        await telegramBot.sendMessage(chatId, '❌ Could not parse the attached file. Please send a valid Excel (XLSX/XLS/CSV) file.');
                        return;
                    }

                    const sheetName = workbook.SheetNames[0];
                    if (!sheetName) {
                        await telegramBot.sendMessage(chatId, '❌ No sheets found in the attached file.');
                        return;
                    }

                    const sheet = workbook.Sheets[sheetName];
                    const data = XLSX.utils.sheet_to_json(sheet);
                    const withdrawals = data.map(row => {
                        // Parse 支付VIP等到账金额 (Payment VIP to account amount) - format: "4 1000.00"
                        // First number is deliveryType, second is amount
                        const paymentAmount = row['支付VIP等到账金额'] || row['支付VIP等到账金额'] || '';
                        let deliveryType = null;
                        let amount = null;
                        
                        if (paymentAmount) {
                            const parts = paymentAmount.toString().trim().split(/\s+/);
                            if (parts.length >= 2) {
                                deliveryType = parts[0];
                                amount = parseFloat(parts[1]) || null;
                            } else if (parts.length === 1) {
                                // If only one part, try to parse as amount
                                amount = parseFloat(parts[0]) || null;
                            }
                        }
                        
                        return {
                            orderNumber: row['订单号'] || row['orderNumber'] || row['Order Number'],
                            deliveryType: deliveryType || row['交付VII'] || row['deliveryType'] || row['Delivery Type'] || null,
                            amount: amount || parseFloat(row['金额'] || row['amount'] || row['Amount']) || null,
                            paymentStatus: row['状态'] || row['paymentStatus'] || row['Payment Status'] || row['交付状态'] || null,
                            importDate: row['回调时间'] || row['date'] || row['Date'] || row['日期'] || null
                        };
                    });

                    // Import into DB (log start)
                    console.log(`[Telegram] Starting withdrawal import of ${withdrawals.length} rows from attached file (chat ${chatId})`);
                    
                    // Estimate time: approximately 2-5ms per record
                    const estimatedTimeMs = Math.max(100, withdrawals.length * 3);
                    const estimatedTimeSec = (estimatedTimeMs / 1000).toFixed(1);
                    const estimatedMessage = `⏳ Starting withdrawal import of ${withdrawals.length} records...\nEstimated time: ~${estimatedTimeSec} seconds`;
                    await telegramBot.sendMessage(chatId, estimatedMessage);
                    
                    const importStart = Date.now();
                    dbHelpers.importWithdrawals(withdrawals, async (err, result) => {
                        const duration = Date.now() - importStart;
                        if (err) {
                            console.error('[Telegram] importWithdrawals error:', err);
                            await telegramBot.sendMessage(chatId, `❌ Import failed: ${err.message}`);
                            return;
                        }
                        const reply = `✅ Withdrawal import completed!\n\n📊 Results:\n• Imported: ${result.successCount}\n• Duplicates (skipped): ${result.duplicateCount || 0}\n• Errors: ${result.errorCount}\n• Time: ${(duration / 1000).toFixed(2)}s`;
                        console.log('[Telegram] importWithdrawals result:', result);
                        await telegramBot.sendMessage(chatId, reply);
                    });

                    return;
                } catch (e) {
                    console.error('[Telegram] Error handling attached withdrawal file:', e);
                    telegramBot.sendMessage(chatId, '❌ Error downloading or processing attached file');
                    return;
                }
            }

            // Handle /start command
            if (commandOnly === '/start') {
                telegramBot.sendMessage(chatId, '👋 Welcome to YONO777™ Customer Support!\n\nI\'m here 24/7 to help with:\n• Deposit issues\n• Withdrawal problems\n• Bonus questions\n• Account settings\n\nSend me a message or use /help');
            }
            // Handle /help command
            else if (commandOnly === '/help') {
                telegramBot.sendMessage(chatId, '📞 Available Commands:\n\n/start - Welcome message\n/stats - View statistics\n/deposits - View imported deposits\n/importSuccessDeposit - Show import success details\n/importSuccessWithdrawal - Show import success details for withdrawals\n/clear - Clear conversation history\n\nOr just ask me anything! 🤖');
            }
            // Handle /clear command
            else if (commandOnly === '/clear') {
                telegramUserContexts.delete(userId);
                telegramBot.sendMessage(chatId, '🗑️ Conversation history cleared!');
            }
            // Handle /stats command
            else if (commandOnly === '/stats') {
                dbHelpers.getComprehensiveStats((err, stats) => {
                    if (err) {
                        telegramBot.sendMessage(chatId, '❌ Error fetching stats');
                        return;
                    }
                    const statsMsg = `📊 YONO777 Statistics:\n\n📝 Total Messages: ${stats.totalMessages}\n👥 Active Users: ${stats.totalUsers}\n📋 Registered Users: ${stats.registeredUsers}\n🔴 Open Issues: ${stats.openProblems}\n🟢 Resolved Issues: ${stats.resolvedProblems}`;
                    telegramBot.sendMessage(chatId, statsMsg);
                });
            }
            // Handle /deposits command
            else if (commandOnly === '/deposits') {
                dbHelpers.getAllDeposits((err, deposits) => {
                    if (err) {
                        telegramBot.sendMessage(chatId, '❌ Error fetching deposits');
                        return;
                    }
                    let depositsMsg = `📥 Imported Deposits: ${deposits.length} records\n\n`;
                    deposits.slice(0, 5).forEach((d, i) => {
                        depositsMsg += `${i+1}. Order: ${d.orderNumber} | Amount: ${d.amount || 'N/A'} | Status: ${d.paymentStatus || 'N/A'}\n`;
                    });
                    if (deposits.length > 5) {
                        depositsMsg += `\n... and ${deposits.length - 5} more records`;
                    }
                    telegramBot.sendMessage(chatId, depositsMsg);
                });
            }
            // Handle /importSuccessDeposit command (show recently imported deposits)
            else if (commandOnly === '/importSuccessDeposit') {
                console.log(`[Telegram] /importSuccessDeposit command received from ${chatId}`);
                dbHelpers.getAllDeposits((err, deposits) => {
                    console.log(`[Telegram] getAllDeposits callback - err: ${err ? err.message : 'none'}, deposits: ${deposits ? deposits.length : 0}`);
                    if (err) {
                        console.error('[Telegram] Error fetching deposits:', err);
                        telegramBot.sendMessage(chatId, '❌ Error fetching deposits').catch(e => console.error('Send error:', e));
                        return;
                    }
                    if (!deposits || deposits.length === 0) {
                        console.log('[Telegram] No deposits found, sending empty message');
                        telegramBot.sendMessage(chatId, '📭 No deposits imported yet').catch(e => console.error('Send error:', e));
                        return;
                    }
                    console.log(`[Telegram] Found ${deposits.length} deposits, formatting message...`);
                    let successMsg = `✅ Successfully Imported Deposits\n\n`;
                    successMsg += `📊 Total: ${deposits.length} orders\n`;
                    successMsg += `📋 Latest Imports:\n\n`;
                    
                    const limit = Math.min(10, deposits.length);
                    for (let i = 0; i < limit; i++) {
                        const d = deposits[i];
                        successMsg += `${i+1}. Order: ${d.orderNumber}\n`;
                        successMsg += `   Amount: ${d.amount || 'N/A'}\n`;
                        successMsg += `   Status: ${d.paymentStatus || 'Pending'}\n`;
                        successMsg += `   Date: ${d.importDate || 'N/A'}\n\n`;
                    }
                    
                    if (deposits.length > 10) {
                        successMsg += `... and ${deposits.length - 10} more orders`;
                    }
                    console.log('[Telegram] Sending message with length:', successMsg.length);
                    telegramBot.sendMessage(chatId, successMsg).catch(e => console.error('Send error:', e));
                });
            }
            // Handle /importSuccessWithdrawal command (show recently imported withdrawals)
            else if (commandOnly === '/importSuccessWithdrawal') {
                console.log(`[Telegram] /importSuccessWithdrawal command received from ${chatId}`);
                dbHelpers.getAllWithdrawals((err, withdrawals) => {
                    console.log(`[Telegram] getAllWithdrawals callback - err: ${err ? err.message : 'none'}, withdrawals: ${withdrawals ? withdrawals.length : 0}`);
                    if (err) {
                        console.error('[Telegram] Error fetching withdrawals:', err);
                        telegramBot.sendMessage(chatId, '❌ Error fetching withdrawals').catch(e => console.error('Send error:', e));
                        return;
                    }
                    if (!withdrawals || withdrawals.length === 0) {
                        console.log('[Telegram] No withdrawals found, sending empty message');
                        telegramBot.sendMessage(chatId, '📭 No withdrawals imported yet').catch(e => console.error('Send error:', e));
                        return;
                    }
                    console.log(`[Telegram] Found ${withdrawals.length} withdrawals, formatting message...`);
                    let successMsg = `✅ Successfully Imported Withdrawals\n\n`;
                    successMsg += `📊 Total: ${withdrawals.length} orders\n`;
                    successMsg += `📋 Latest Imports:\n\n`;
                    
                    const limit = Math.min(10, withdrawals.length);
                    for (let i = 0; i < limit; i++) {
                        const w = withdrawals[i];
                        successMsg += `${i+1}. Order: ${w.orderNumber}\n`;
                        successMsg += `   Amount: ${w.amount || 'N/A'}\n`;
                        successMsg += `   Status: ${w.paymentStatus || 'Pending'}\n`;
                        successMsg += `   Date: ${w.importDate || 'N/A'}\n\n`;
                    }
                    
                    if (withdrawals.length > 10) {
                        successMsg += `... and ${withdrawals.length - 10} more orders`;
                    }
                    console.log('[Telegram] Sending message with length:', successMsg.length);
                    telegramBot.sendMessage(chatId, successMsg).catch(e => console.error('Send error:', e));
                });
            }
            // Regular message response
            else if (text.trim()) {
                telegramBot.sendMessage(chatId, '👋 Message received! Type /help for available commands.');
            }
        });
        
    } catch (error) {
        console.error('Error initializing Telegram bot:', error.message);
    }
} else {
    console.warn('Telegram bot token not configured. Set TELEGRAM_BOT_TOKEN environment variable.');
}

// Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true
}));
app.use(bodyParser.json());
app.use(express.static('public'));

// Health check route
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        publicDir: path.join(__dirname, 'public')
    });
});

// Helper function to serve HTML files with fallback
function serveHtmlFile(res, filename, fallbackContent) {
    const fs = require('fs');
    const filePath = path.join(__dirname, 'public', filename);
    
    if (fs.existsSync(filePath)) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return res.setHeader('Content-Type', 'text/html').send(content);
        } catch (err) {
            console.error(`Error reading ${filename}:`, err);
        }
    }
    
    // Fallback to inline content if file doesn't exist
    res.setHeader('Content-Type', 'text/html');
    res.send(fallbackContent);
}

// Temporary debug endpoint to inspect deposits in DB
app.get('/debug/deposits', (req, res) => {
    dbHelpers.getAllDeposits((err, deposits) => {
        if (err) return res.status(500).json({ error: err.message });
        const latest = deposits.slice(0, 20);
        return res.json({ total: deposits.length, latest });
    });
});

// Language Detection and Multilingual Support
class LanguageDetector {
    // Detect language from text - STRICT detection
    detectLanguage(text) {
        const trimmedText = text.trim();
        if (!trimmedText) return 'english';
        
        const lowerText = trimmedText.toLowerCase();
        
        // Check for Devanagari script (Hindi, Marathi, Nepali) - STRICT
        if (/[\u0900-\u097F]/.test(trimmedText)) {
            // If Devanagari script is present, it's Hindi
            return 'hindi';
        }
        
        // Check for Telugu script
        if (/[\u0C00-\u0C7F]/.test(trimmedText)) {
            return 'telugu';
        }
        
        // Check for Tamil script
        if (/[\u0B80-\u0BFF]/.test(trimmedText)) {
            return 'tamil';
        }
        
        // Check for Bengali script
        if (/[\u0980-\u09FF]/.test(trimmedText)) {
            return 'bengali';
        }
        
        // Check for Gujarati script
        if (/[\u0A80-\u0AFF]/.test(trimmedText)) {
            return 'gujarati';
        }
        
        // Check for Kannada script
        if (/[\u0C80-\u0CFF]/.test(trimmedText)) {
            return 'kannada';
        }
        
        // Check for Malayalam script
        if (/[\u0D00-\u0D7F]/.test(trimmedText)) {
            return 'malayalam';
        }
        
        // Check for Punjabi (Gurmukhi) script
        if (/[\u0A00-\u0A7F]/.test(trimmedText)) {
            return 'punjabi';
        }
        
        // Check for Odia script
        if (/[\u0B00-\u0B7F]/.test(trimmedText)) {
            return 'odia';
        }
        
        // Check for Urdu/Arabic script
        if (/[\u0600-\u06FF]/.test(trimmedText)) {
            return 'urdu';
        }
        
        // Check for Hindi words in Roman script - STRICT matching
        // Only if significant Hindi words are present
        const hindiRomanWords = ['kaise', 'kya', 'hai', 'aap', 'main', 'kyun', 'kab', 'kahan', 'kaun', 'kisne', 'kisko', 'kiski', 'hoga', 'hogi', 'honge', 'hain', 'ho', 'tha', 'thi', 'the', 'raha', 'rahi', 'rahe', 'kar', 'karne', 'karna', 'kiya', 'kiye', 'kiyi', 'mujhe', 'tumhe', 'usko', 'unko', 'inke', 'unke', 'mera', 'meri', 'mere', 'tera', 'teri', 'tere', 'hamara', 'hamari', 'hamare', 'kya', 'kyun', 'kahan', 'kaise', 'kab', 'kitna', 'kitni', 'kitne'];
        const hindiWordCount = hindiRomanWords.filter(word => {
            // Use word boundaries to avoid partial matches
            const regex = new RegExp('\\b' + word + '\\b', 'i');
            return regex.test(lowerText);
        }).length;
        
        // If 2 or more Hindi words found, it's Hindi
        if (hindiWordCount >= 2) {
            return 'hindi';
        }
        
        // Check for Telugu words in Roman script - STRICT matching
        const teluguRomanWords = ['ela', 'emi', 'enduku', 'evaru', 'eppudu', 'ekkada', 'unnaru', 'unnayi', 'undhi', 'chey', 'cheyali', 'cheyandi', 'vachindi', 'vacharu', 'nuvvu', 'meeru', 'naaku', 'meeku', 'vaadu', 'aame', 'vaallu'];
        const teluguWordCount = teluguRomanWords.filter(word => {
            const regex = new RegExp('\\b' + word + '\\b', 'i');
            return regex.test(lowerText);
        }).length;
        
        // If 2 or more Telugu words found, it's Telugu
        if (teluguWordCount >= 2) {
            return 'telugu';
        }
        
        // Check if text contains only English characters, numbers, and common punctuation
        // If it's mostly English words, it's English
        const englishPattern = /^[a-zA-Z0-9\s.,!?'"\-:;()]+$/;
        if (englishPattern.test(trimmedText)) {
            // Additional check: if it looks like English (common English words)
            const commonEnglishWords = ['the', 'is', 'are', 'was', 'were', 'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should', 'may', 'might', 'this', 'that', 'these', 'those', 'what', 'when', 'where', 'who', 'why', 'how', 'help', 'need', 'want', 'deposit', 'withdraw', 'account', 'bonus', 'problem', 'issue', 'error', 'please', 'thank', 'you', 'your', 'my', 'me', 'i', 'we', 'they'];
            const englishWordCount = commonEnglishWords.filter(word => {
                const regex = new RegExp('\\b' + word + '\\b', 'i');
                return regex.test(lowerText);
            }).length;
            
            // If it has English structure and words, it's English
            if (englishWordCount > 0 || trimmedText.split(/\s+/).length > 2) {
                return 'english';
            }
        }
        
        // Default to English if no clear language detected
        return 'english';
    }
}

// Multilingual Response Templates
class MultilingualResponses {
    constructor() {
        this.responses = {
            english: {
                greeting: "Hello! 🌟 Welcome to Yono777! I'm so happy you're here and I'm excited to help you today. How can I assist you?",
                security: "I completely understand your concern about security - that's very important! For your protection, I cannot access your password, OTP, or PIN. But don't worry - our security team is here to help! Please contact them if you need to reset your credentials, and they'll take great care of you.",
                escalation: "I want to make sure you get the best help possible! I'm connecting you with our expert support team right now. They'll take wonderful care of you - please hold for just a moment! 💙",
                apology: "I'm truly sorry you're experiencing this inconvenience - I can only imagine how frustrating that must be. But don't worry, I'm here for you and I'm going to do everything I can to help resolve this quickly!",
                closing: "I'm so glad I could help! Is there anything else you'd like to know? I'm here for you anytime! 😊",
                deposit: {
                    how: "Great! I'd be happy to help you with your deposit! You can easily deposit using UPI, bank transfer, or e-wallets - we've made it super convenient for you! Just head to the Deposit section in your account. Which payment method sounds best to you?",
                    fail: "Oh no, I'm really sorry you're having trouble with your deposit - that must be frustrating! Let's get this sorted out together. Please double-check that your payment details are correct and that you have sufficient balance. If it's still not working, I'll personally make sure our payment team looks into this right away for you!",
                    general: "I'm here to help you with your deposit! I want to make sure everything goes smoothly for you. What specific issue are you experiencing? Please share the details and I'll take care of it!"
                },
                withdrawal: {
                    time: "I understand you're eager to get your withdrawal - and I'm here to help! Withdrawals are typically processed within 24-48 hours, which I know can feel like a long time. To make sure everything goes smoothly, please ensure your bank details are verified. Is your account already verified?",
                    fail: "I'm really sorry about this delay - I know how important it is to get your money when you need it. Let's check a few things together: please verify that your bank details are correct and that your account is fully verified. I'm going to escalate this to our finance team right away so they can review it personally and get this resolved for you quickly!",
                    general: "I completely understand your concern about withdrawals - your money matters! I'm here to help you every step of the way. What specific issue are you facing? Let me know and I'll make sure we get it sorted out for you!"
                },
                account: {
                    update: "Of course! I'm happy to guide you through updating your bank details. It's really simple - just go to Account Settings > Banking Details. You'll need to verify your identity, which helps keep your account safe. Would you like me to walk you through the verification process step by step? I'm here to help!",
                    restrict: "I'm really sorry to hear about this - I can imagine how concerning that must be. Account restrictions usually happen due to verification requirements or security measures to protect you. But don't worry - I'm going to escalate this to our account team right away so they can review your case personally and help get this resolved for you!",
                    general: "Your account is important to us, and I'm here to help! I want to make sure everything is working perfectly for you. What specific issue are you experiencing with your account? Share the details and I'll take care of it right away!"
                },
                bonus: {
                    wagering: "Great question! I'm happy to explain this for you. Wagering requirements do vary by bonus - typically, bonuses require 30x to 50x wagering before withdrawal. I know it can be a bit confusing, but it's designed to be fair for everyone! Please check the specific terms in your bonus details. Which bonus are you curious about? I'm here to help clarify anything!",
                    missing: "Oh, I'm so sorry you didn't receive your bonus - that's really disappointing! Let me help you figure this out. Please check if you met all the eligibility requirements first. I'm going to escalate this to our promotions team right away so they can personally review your case and make sure you get what you deserve!",
                    general: "I love helping with bonuses - they're exciting! All bonuses have specific terms and wagering requirements, and I'm here to explain everything clearly for you. What would you like to know? Ask me anything!"
                },
                technical: "I'm really sorry you're experiencing technical difficulties - I know how frustrating that can be! Let's try a quick fix first: please try refreshing the page or clearing your browser cache. If the problem continues, don't worry - I'm going to escalate this to our technical team immediately so they can help you right away!",
                complaint: "I'm truly sorry you're having this issue - I can understand how upsetting this must be. Please know that I'm here for you and I'm going to do everything I can to help resolve this. Can you please share more details about what happened? The more I know, the better I can help you!",
                responsible: {
                    exclusion: "I really appreciate you thinking about responsible gaming - that shows great self-awareness! Self-exclusion is absolutely available, and I'm here to help you set it up. You can find it in Account Settings > Responsible Gaming. Would you like me to guide you through the process step by step? I'm here to support you.",
                    limit: "That's wonderful that you're thinking about setting limits - I'm proud of you for taking this step! You can set deposit limits, loss limits, and session time limits in Account Settings > Responsible Gaming. Which limit would you like to set? I'm here to help you through the process!",
                    general: "I'm so glad you're thinking about responsible gaming - that's really important! We care about your wellbeing. We offer self-exclusion, deposit limits, and session time limits to help you stay in control. What would you like to know more about? I'm here to support you every step of the way!"
                },
                general: "I'm so happy you reached out! I'm here for you and I genuinely want to help. Could you please share a bit more about what you need assistance with? The more details you give me, the better I can help you! 😊"
            },
            hindi: {
                greeting: "नमस्ते! 🌟 Yono777 में आपका बहुत-बहुत स्वागत है! मैं आपसे मिलकर बहुत खुश हूं और आज आपकी मदद करने के लिए उत्साहित हूं। मैं आपकी कैसे सहायता कर सकता हूं?",
                security: "मैं आपकी सुरक्षा की चिंता को पूरी तरह समझता हूं - यह बहुत महत्वपूर्ण है! आपकी सुरक्षा के लिए, मैं आपका पासवर्ड, OTP, या PIN नहीं मांग सकता। लेकिन चिंता न करें - हमारी सुरक्षा टीम आपकी मदद के लिए यहां है! कृपया उनसे संपर्क करें यदि आपको अपनी साख रीसेट करने की आवश्यकता है, और वे आपका बहुत अच्छी तरह से ख्याल रखेंगे!",
                escalation: "मैं चाहता हूं कि आपको सबसे अच्छी मदद मिले! मैं अभी आपको हमारी विशेषज्ञ सहायता टीम से जोड़ रहा हूं। वे आपका बहुत अच्छा ख्याल रखेंगे - कृपया थोड़ी देर प्रतीक्षा करें! 💙",
                apology: "मुझे वाकई खेद है कि आप इस असुविधा का सामना कर रहे हैं - मैं समझ सकता हूं कि यह कितना निराशाजनक हो सकता है। लेकिन चिंता न करें, मैं आपके लिए यहां हूं और मैं जल्द से जल्द इसे हल करने के लिए हर संभव प्रयास करूंगा!",
                closing: "मुझे खुशी है कि मैं आपकी मदद कर सका! क्या आज मैं आपकी और किसी चीज़ में मदद कर सकता हूं? मैं हमेशा आपके लिए यहां हूं! 😊",
                deposit: {
                    how: "बहुत बढ़िया! मैं आपकी जमा राशि में मदद करने के लिए खुश हूं! आप आसानी से UPI, बैंक ट्रांसफर, या e-wallets का उपयोग करके जमा कर सकते हैं - हमने इसे आपके लिए बहुत सुविधाजनक बनाया है! बस अपने खाते में जमा अनुभाग पर जाएं। आप कौन सी भुगतान विधि उपयोग करना चाहेंगे?",
                    fail: "अरे नहीं, मुझे वाकई खेद है कि आपको अपनी जमा राशि में परेशानी हो रही है - यह निराशाजनक हो सकता है! चलिए इसे एक साथ ठीक करते हैं। कृपया दोबारा जांचें कि आपका भुगतान विवरण सही है और आपके पास पर्याप्त शेष है। यदि यह अभी भी काम नहीं कर रहा है, तो मैं व्यक्तिगत रूप से सुनिश्चित करूंगा कि हमारी भुगतान टीम आपके लिए तुरंत इसे देखे!",
                    general: "मैं आपकी जमा राशि में मदद करने के लिए यहां हूं! मैं चाहता हूं कि सब कुछ आपके लिए सुचारू रूप से चले। आप किस विशिष्ट समस्या का सामना कर रहे हैं? कृपया विवरण साझा करें और मैं इसे तुरंत देखूंगा!"
                },
                withdrawal: {
                    time: "मैं समझता हूं कि आप अपनी निकासी पाने के लिए उत्सुक हैं - और मैं मदद करने के लिए यहां हूं! निकासी आमतौर पर 24-48 घंटों के भीतर संसाधित की जाती है, जो मुझे पता है कि लंबा लग सकता है। सुनिश्चित करने के लिए कि सब कुछ सुचारू रूप से चले, कृपया सुनिश्चित करें कि आपके बैंक विवरण सत्यापित हैं। क्या आपका खाता पहले से ही सत्यापित है?",
                    fail: "मुझे इस देरी के लिए वाकई खेद है - मुझे पता है कि जब आपको पैसे की जरूरत हो तो अपना पैसा पाना कितना महत्वपूर्ण है। चलिए कुछ चीजें एक साथ जांचते हैं: कृपया सुनिश्चित करें कि आपके बैंक विवरण सही हैं और आपका खाता पूरी तरह से सत्यापित है। मैं इसे तुरंत हमारी वित्त टीम को स्थानांतरित कर रहा हूं ताकि वे व्यक्तिगत रूप से इसकी समीक्षा कर सकें और आपके लिए इसे जल्दी हल कर सकें!",
                    general: "मैं निकासी के बारे में आपकी चिंता को पूरी तरह समझता हूं - आपका पैसा मायने रखता है! मैं हर कदम पर आपकी मदद करने के लिए यहां हूं। आप किस विशिष्ट समस्या का सामना कर रहे हैं? मुझे बताएं और मैं सुनिश्चित करूंगा कि हम इसे आपके लिए ठीक कर दें!"
                },
                account: {
                    update: "बिल्कुल! मैं आपके बैंक विवरण अपडेट करने में आपकी मदद करने के लिए खुश हूं। यह वास्तव में सरल है - बस खाता सेटिंग्स > बैंकिंग विवरण पर जाएं। आपको अपनी पहचान सत्यापित करनी होगी, जो आपके खाते को सुरक्षित रखने में मदद करती है। क्या आप चाहेंगे कि मैं आपको सत्यापन प्रक्रिया के माध्यम से कदम दर कदम मार्गदर्शन करूं? मैं मदद करने के लिए यहां हूं!",
                    restrict: "मुझे यह सुनकर वाकई खेद है - मैं कल्पना कर सकता हूं कि यह कितना चिंताजनक हो सकता है। खाता प्रतिबंध आमतौर पर सत्यापन आवश्यकताओं या आपकी सुरक्षा के लिए सुरक्षा उपायों के कारण होते हैं। लेकिन चिंता न करें - मैं इसे तुरंत हमारी खाता टीम को स्थानांतरित कर रहा हूं ताकि वे व्यक्तिगत रूप से आपके मामले की समीक्षा कर सकें और आपके लिए इसे हल करने में मदद कर सकें!",
                    general: "आपका खाता हमारे लिए महत्वपूर्ण है, और मैं मदद करने के लिए यहां हूं! मैं चाहता हूं कि सब कुछ आपके लिए पूरी तरह से काम करे। आप अपने खाते के साथ किस विशिष्ट समस्या का सामना कर रहे हैं? विवरण साझा करें और मैं इसे तुरंत देखूंगा!"
                },
                bonus: {
                    wagering: "बहुत अच्छा सवाल! मैं आपके लिए इसे समझाने में खुश हूं। वेजरिंग आवश्यकताएं बोनस के अनुसार भिन्न होती हैं - आमतौर पर, बोनस निकासी से पहले 30x से 50x वेजरिंग की आवश्यकता होती है। मुझे पता है कि यह थोड़ा भ्रमित करने वाला हो सकता है, लेकिन यह सभी के लिए निष्पक्ष होने के लिए डिज़ाइन किया गया है! कृपया अपने बोनस विवरण में विशिष्ट शर्तें जांचें। आप किस बोनस के बारे में जिज्ञासु हैं? मैं किसी भी चीज़ को स्पष्ट करने में मदद करने के लिए यहां हूं!",
                    missing: "ओह, मुझे वाकई खेद है कि आपको बोनस नहीं मिला - यह वाकई निराशाजनक है! मुझे आपको इसे समझने में मदद करने दें। कृपया पहले जांचें कि क्या आपने सभी पात्रता आवश्यकताओं को पूरा किया है। मैं इसे तुरंत हमारी प्रचार टीम को स्थानांतरित कर रहा हूं ताकि वे व्यक्तिगत रूप से आपके मामले की समीक्षा कर सकें और सुनिश्चित कर सकें कि आपको वह मिले जिसके आप हकदार हैं!",
                    general: "मुझे बोनस में मदद करना पसंद है - वे रोमांचक हैं! सभी बोनस की विशिष्ट शर्तें और वेजरिंग आवश्यकताएं होती हैं, और मैं आपके लिए सब कुछ स्पष्ट रूप से समझाने के लिए यहां हूं। आप क्या जानना चाहेंगे? मुझसे कुछ भी पूछें!"
                },
                technical: "मुझे वाकई खेद है कि आप तकनीकी कठिनाइयों का सामना कर रहे हैं - मुझे पता है कि यह कितना निराशाजनक हो सकता है! चलिए पहले एक त्वरित समाधान आजमाते हैं: कृपया पृष्ठ को रीफ्रेश करने या अपने ब्राउज़र कैश को साफ़ करने का प्रयास करें। यदि समस्या जारी रहती है, तो चिंता न करें - मैं इसे तुरंत हमारी तकनीकी टीम को स्थानांतरित कर रहा हूं ताकि वे आपकी तुरंत मदद कर सकें!",
                complaint: "मुझे वाकई खेद है कि आपको यह समस्या हो रही है - मैं समझ सकता हूं कि यह कितना परेशान करने वाला हो सकता है। कृपया जान लें कि मैं आपके लिए यहां हूं और मैं इसे हल करने के लिए हर संभव प्रयास करूंगा। क्या आप कृपया क्या हुआ इसके बारे में अधिक विवरण साझा कर सकते हैं? जितना अधिक मैं जानूंगा, उतना बेहतर मैं आपकी मदद कर सकूंगा!",
                responsible: {
                    exclusion: "मैं वाकई सराहना करता हूं कि आप जिम्मेदार गेमिंग के बारे में सोच रहे हैं - यह बहुत अच्छी आत्म-जागरूकता दिखाता है! स्व-बहिष्करण बिल्कुल उपलब्ध है, और मैं इसे सेट करने में आपकी मदद करने के लिए यहां हूं। आप इसे खाता सेटिंग्स > जिम्मेदार गेमिंग में पा सकते हैं। क्या आप चाहेंगे कि मैं आपको प्रक्रिया के माध्यम से कदम दर कदम मार्गदर्शन करूं? मैं आपका समर्थन करने के लिए यहां हूं।",
                    limit: "यह अद्भुत है कि आप सीमाएं निर्धारित करने के बारे में सोच रहे हैं - मैं आपके इस कदम पर गर्व करता हूं! आप खाता सेटिंग्स > जिम्मेदार गेमिंग में जमा सीमा, हानि सीमा, और सत्र समय सीमा सेट कर सकते हैं। आप कौन सी सीमा सेट करना चाहेंगे? मैं प्रक्रिया के माध्यम से आपकी मदद करने के लिए यहां हूं!",
                    general: "मुझे खुशी है कि आप जिम्मेदार गेमिंग के बारे में सोच रहे हैं - यह वाकई महत्वपूर्ण है! हम आपकी भलाई की परवाह करते हैं। हम आपको नियंत्रण में रहने में मदद करने के लिए स्व-बहिष्करण, जमा सीमा, और सत्र समय सीमा प्रदान करते हैं। आप और क्या जानना चाहेंगे? मैं हर कदम पर आपका समर्थन करने के लिए यहां हूं!"
                },
                general: "मुझे खुशी है कि आपने संपर्क किया! मैं आपके लिए यहां हूं और मैं वास्तव में मदद करना चाहता हूं। क्या आप कृपया थोड़ा और साझा कर सकते हैं कि आपको किस सहायता की आवश्यकता है? जितना अधिक विवरण आप मुझे देंगे, उतना बेहतर मैं आपकी मदद कर सकूंगा! 😊"
            },
            telugu: {
                greeting: "నమస్కారం! 🌟 Yono777కు మీకు చాలా స్వాగతం! మిమ్మల్ని కలవడం చాలా ఆనందంగా ఉంది మరియు ఈ రోజు మీకు సహాయం చేయడానికి నేను ఉత్సాహంగా ఉన్నాను. నేను మీకు ఎలా సహాయం చేయగలను?",
                security: "మీ భద్రత గురించి మీ ఆందోళనను నేను పూర్తిగా అర్థం చేసుకుంటున్నాను - ఇది చాలా ముఖ్యమైనది! మీ రక్షణ కోసం, నేను మీ పాస్వర్డ్, OTP, లేదా PINని అడగలేను. కానీ చింతించకండి - మా భద్రతా బృందం మీకు సహాయం చేయడానికి ఇక్కడ ఉంది! మీరు మీ ధృవీకరణలను రీసెట్ చేయవలసి ఉంటే, దయచేసి వారిని సంప్రదించండి, మరియు వారు మీకు చాలా బాగా జాగ్రత్త తీసుకుంటారు!",
                escalation: "మీకు ఉత్తమ సహాయం లభించేలా నేను కోరుకుంటున్నాను! నేను మిమ్మల్ని మా నిపుణ మద్దతు బృందంతో ఇప్పుడే కనెక్ట్ చేస్తున్నాను. వారు మీకు చాలా బాగా జాగ్రత్త తీసుకుంటారు - దయచేసి కొద్ది సేపు వేచి ఉండండి! 💙",
                apology: "మీరు ఈ అసౌకర్యాన్ని ఎదుర్కొంటున్నారని నేను నిజంగా విచారిస్తున్నాను - ఇది ఎంత నిరాశాజనకంగా ఉంటుందో నేను అర్థం చేసుకున్నాను. కానీ చింతించకండి, నేను మీ కోసం ఇక్కడ ఉన్నాను మరియు దీన్ని త్వరగా పరిష్కరించడానికి నేను చేయగలిగిన ప్రతిదీ చేస్తాను!",
                closing: "నేను మీకు సహాయం చేయగలిగానని నేను సంతోషిస్తున్నాను! ఈ రోజు నేను మీకు మరేదైనా సహాయం చేయగలనా? నేను ఎప్పుడూ మీ కోసం ఇక్కడ ఉన్నాను! 😊",
                deposit: {
                    how: "గొప్ప! మీ జమతో మీకు సహాయం చేయడానికి నేను సంతోషిస్తున్నాను! మీరు UPI, బ్యాంక్ బదిలీ, లేదా e-wallets ఉపయోగించి సులభంగా జమ చేయవచ్చు - మేము దీన్ని మీ కోసం చాలా సౌకర్యవంతంగా చేసాము! మీ ఖాతాలో జమ విభాగానికి వెళ్లండి. మీరు ఏ చెల్లింపు పద్ధతిని ఉపయోగించాలనుకుంటున్నారు?",
                    fail: "ఓహ్ లేదు, మీ జమతో మీకు సమస్య ఎదుర్కొంటున్నారని నేను నిజంగా విచారిస్తున్నాను - ఇది నిరాశాజనకంగా ఉంటుంది! దీన్ని కలిసి పరిష్కరిద్దాం. దయచేసి మీ చెల్లింపు వివరాలు సరైనవి మరియు మీకు తగినంత బ్యాలెన్స్ ఉందని రెండుసార్లు తనిఖీ చేయండి. ఇది ఇంకా పని చేయకపోతే, మా చెల్లింపు బృందం మీ కోసం వెంటనే దీన్ని చూస్తుందని నేను వ్యక్తిగతంగా నిర్ధారిస్తాను!",
                    general: "మీ జమతో మీకు సహాయం చేయడానికి నేను ఇక్కడ ఉన్నాను! మీ కోసం ప్రతిదీ సజావుగా జరగాలని నేను కోరుకుంటున్నాను. మీరు ఏ నిర్దిష్ట సమస్యను ఎదుర్కొంటున్నారు? దయచేసి వివరాలను భాగస్వామ్యం చేయండి మరియు నేను వెంటనే దీన్ని చూస్తాను!"
                },
                withdrawal: {
                    time: "మీరు మీ ఉపసంహరణను పొందడానికి ఆత్రుతగా ఉన్నారని నేను అర్థం చేసుకున్నాను - మరియు నేను సహాయం చేయడానికి ఇక్కడ ఉన్నాను! ఉపసంహరణలు సాధారణంగా 24-48 గంటలలో ప్రాసెస్ చేయబడతాయి, ఇది సుదీర్ఘంగా అనిపించవచ్చు. ప్రతిదీ సజావుగా జరగడానికి, దయచేసి మీ బ్యాంక్ వివరాలు ధృవీకరించబడ్డాయని నిర్ధారించండి. మీ ఖాతా ఇప్పటికే ధృవీకరించబడిందా?",
                    fail: "ఈ ఆలస్యం కోసం నేను నిజంగా విచారిస్తున్నాను - మీకు డబ్బు అవసరమైనప్పుడు మీ డబ్బును పొందడం ఎంత ముఖ్యమైనదో నాకు తెలుసు. కొన్ని విషయాలను కలిసి తనిఖీ చేద్దాం: దయచేసి మీ బ్యాంక్ వివరాలు సరైనవి మరియు మీ ఖాతా పూర్తిగా ధృవీకరించబడిందని నిర్ధారించండి. వారు వ్యక్తిగతంగా దీన్ని సమీక్షించి మీ కోసం దీన్ని త్వరగా పరిష్కరించగలిగేలా నేను దీన్ని మా ఫైనాన్స్ బృందానికి వెంటనే బదిలీ చేస్తున్నాను!",
                    general: "మీ ఉపసంహరణ గురించి మీ ఆందోళనను నేను పూర్తిగా అర్థం చేసుకున్నాను - మీ డబ్బు ముఖ్యమైనది! ప్రతి అడుగులో మీకు సహాయం చేయడానికి నేను ఇక్కడ ఉన్నాను. మీరు ఏ నిర్దిష్ట సమస్యను ఎదుర్కొంటున్నారు? నాకు చెప్పండి మరియు మేము దీన్ని మీ కోసం పరిష్కరిస్తామని నేను నిర్ధారిస్తాను!"
                },
                account: {
                    update: "ఖచ్చితంగా! మీ బ్యాంక్ వివరాలను నవీకరించడంలో మీకు మార్గదర్శకత్వం చేయడానికి నేను సంతోషిస్తున్నాను. ఇది నిజంగా సులభం - ఖాతా సెట్టింగ్‌లు > బ్యాంకింగ్ వివరాలకు వెళ్లండి. మీరు మీ గుర్తింపును ధృవీకరించాలి, ఇది మీ ఖాతాను సురక్షితంగా ఉంచడంలో సహాయపడుతుంది. మీరు ధృవీకరణ ప్రక్రియ ద్వారా నన్ను దశలవారీగా మార్గదర్శకత్వం చేయాలని కోరుకుంటారా? నేను సహాయం చేయడానికి ఇక్కడ ఉన్నాను!",
                    restrict: "ఇది వినడం నేను నిజంగా విచారిస్తున్నాను - ఇది ఎంత ఆందోళన కలిగించేదిగా ఉంటుందో నేను ఊహించగలను. ఖాతా పరిమితులు సాధారణంగా ధృవీకరణ అవసరాలు లేదా మీ రక్షణ కోసం భద్రతా చర్యల కారణంగా ఉంటాయి. కానీ చింతించకండి - వారు వ్యక్తిగతంగా మీ కేసును సమీక్షించి మీ కోసం దీన్ని పరిష్కరించడంలో సహాయపడేలా నేను దీన్ని మా ఖాతా బృందానికి వెంటనే బదిలీ చేస్తున్నాను!",
                    general: "మీ ఖాతా మాకు ముఖ్యమైనది, మరియు సహాయం చేయడానికి నేను ఇక్కడ ఉన్నాను! మీ కోసం ప్రతిదీ పూర్తిగా పని చేస్తుందని నేను కోరుకుంటున్నాను. మీరు మీ ఖాతాతో ఏ నిర్దిష్ట సమస్యను ఎదుర్కొంటున్నారు? వివరాలను భాగస్వామ్యం చేయండి మరియు నేను వెంటనే దీన్ని చూస్తాను!"
                },
                bonus: {
                    wagering: "గొప్ప ప్రశ్న! మీ కోసం దీన్ని వివరించడానికి నేను సంతోషిస్తున్నాను. వేజరింగ్ అవసరాలు బోనస్ ప్రకారం మారుతూ ఉంటాయి - సాధారణంగా, బోనస్‌లు ఉపసంహరణకు ముందు 30x నుండి 50x వేజరింగ్ అవసరం. ఇది కొంచెం గందరగోళంగా ఉంటుందని నాకు తెలుసు, కానీ ఇది అందరికీ న్యాయంగా ఉండేలా రూపొందించబడింది! దయచేసి మీ బోనస్ వివరాలలో నిర్దిష్ట నిబంధనలను తనిఖీ చేయండి. మీరు ఏ బోనస్ గురించి ఆసక్తిగా ఉన్నారు? ఏదైనా స్పష్టం చేయడంలో నేను సహాయం చేయడానికి ఇక్కడ ఉన్నాను!",
                    missing: "ఓహ్, మీకు బోనస్ రాలేదని నేను నిజంగా విచారిస్తున్నాను - ఇది నిజంగా నిరాశాజనకం! దీన్ని గుర్తించడంలో మీకు సహాయం చేయనివ్వండి. దయచేసి మీరు అన్ని అర్హత అవసరాలను తీర్చారో మొదట తనిఖీ చేయండి. వారు వ్యక్తిగతంగా మీ కేసును సమీక్షించి మీరు అర్హత కలిగిన దాన్ని మీరు పొందేలా నిర్ధారించడానికి నేను దీన్ని మా ప్రచార బృందానికి వెంటనే బదిలీ చేస్తున్నాను!",
                    general: "బోనస్‌లతో సహాయం చేయడం నాకు ఇష్టం - అవి ఉత్తేజకరమైనవి! అన్ని బోనస్‌లకు నిర్దిష్ట నిబంధనలు మరియు వేజరింగ్ అవసరాలు ఉన్నాయి, మరియు మీ కోసం ప్రతిదీ స్పష్టంగా వివరించడానికి నేను ఇక్కడ ఉన్నాను. మీరు ఏమి తెలుసుకోవాలనుకుంటున్నారు? నాతో ఏదైనా అడగండి!"
                },
                technical: "మీరు సాంకేతిక ఇబ్బందులను ఎదుర్కొంటున్నారని నేను నిజంగా విచారిస్తున్నాను - ఇది ఎంత నిరాశాజనకంగా ఉంటుందో నాకు తెలుసు! మొదట ఒక త్వరిత పరిష్కారాన్ని ప్రయత్నిద్దాం: దయచేసి పేజీని రిఫ్రెష్ చేయడానికి లేదా మీ బ్రౌజర్ క్యాష్‌ను క్లియర్ చేయడానికి ప్రయత్నించండి. సమస్య కొనసాగితే, చింతించకండి - వారు మీకు వెంటనే సహాయం చేయగలిగేలా నేను దీన్ని మా సాంకేతిక బృందానికి వెంటనే బదిలీ చేస్తున్నాను!",
                complaint: "మీకు ఈ సమస్య ఎదుర్కొంటున్నారని నేను నిజంగా విచారిస్తున్నాను - ఇది ఎంత బాధాకరంగా ఉంటుందో నేను అర్థం చేసుకున్నాను. దయచేసి తెలుసుకోండి నేను మీ కోసం ఇక్కడ ఉన్నాను మరియు దీన్ని పరిష్కరించడానికి నేను చేయగలిగిన ప్రతిదీ చేస్తాను. దయచేసి ఏమి జరిగిందో గురించి మరిన్ని వివరాలను భాగస్వామ్యం చేయగలరా? నేను ఎంత ఎక్కువ తెలుసుకుంటే, అంత బాగా నేను మీకు సహాయం చేయగలను!",
                responsible: {
                    exclusion: "మీరు బాధ్యతాయుత గేమింగ్ గురించి ఆలోచిస్తున్నారని నేను నిజంగా అభినందిస్తున్నాను - ఇది గొప్ప స్వీయ-అవగాహనను చూపుతుంది! స్వీయ-మినహాయింపు ఖచ్చితంగా అందుబాటులో ఉంది, మరియు దీన్ని సెటప్ చేయడంలో మీకు సహాయం చేయడానికి నేను ఇక్కడ ఉన్నాను. మీరు దీన్ని ఖాతా సెట్టింగ్‌లు > బాధ్యతాయుత గేమింగ్‌లో కనుగొనవచ్చు. మీరు ప్రక్రియ ద్వారా నన్ను దశలవారీగా మార్గదర్శకత్వం చేయాలని కోరుకుంటారా? నేను మీకు మద్దతు ఇవ్వడానికి ఇక్కడ ఉన్నాను.",
                    limit: "మీరు పరిమితులను సెట్ చేయడం గురించి ఆలోచిస్తున్నారు అద్భుతం - మీరు ఈ అడుగు వేస్తున్నందుకు నేను గర్విస్తున్నాను! మీరు ఖాతా సెట్టింగ్‌లు > బాధ్యతాయుత గేమింగ్‌లో జమ పరిమితులు, నష్ట పరిమితులు, మరియు సెషన్ సమయ పరిమితులను సెట్ చేయవచ్చు. మీరు ఏ పరిమితిని సెట్ చేయాలనుకుంటున్నారు? ప్రక్రియ ద్వారా మీకు సహాయం చేయడానికి నేను ఇక్కడ ఉన్నాను!",
                    general: "మీరు బాధ్యతాయుత గేమింగ్ గురించి ఆలోచిస్తున్నారని నేను చాలా సంతోషిస్తున్నాను - ఇది నిజంగా ముఖ్యమైనది! మేము మీ శ్రేయస్సు గురించి శ్రద్ధ వహిస్తాము. మీరు నియంత్రణలో ఉండడంలో సహాయపడేందుకు మేము స్వీయ-మినహాయింపు, జమ పరిమితులు, మరియు సెషన్ సమయ పరిమితులను అందిస్తాము. మీరు మరిన్ని ఏమి తెలుసుకోవాలనుకుంటున్నారు? ప్రతి అడుగులో మీకు మద్దతు ఇవ్వడానికి నేను ఇక్కడ ఉన్నాను!"
                },
                general: "మీరు సంప్రదించినందుకు నేను చాలా సంతోషిస్తున్నాను! నేను మీ కోసం ఇక్కడ ఉన్నాను మరియు నేను నిజంగా సహాయం చేయాలనుకుంటున్నాను. మీకు ఏ సహాయం అవసరమో దాని గురించి మీరు కొంచెం ఎక్కువ భాగస్వామ్యం చేయగలరా? మీరు నాకు ఎంత ఎక్కువ వివరాలు ఇస్తే, అంత బాగా నేను మీకు సహాయం చేయగలను! 😊"
            }
        };
    }
    
    getResponse(language, category, subcategory = null) {
        const lang = this.responses[language] || this.responses.english;
        
        if (subcategory && lang[category] && lang[category][subcategory]) {
            return lang[category][subcategory];
        }
        
        if (lang[category]) {
            return typeof lang[category] === 'string' ? lang[category] : lang[category].general || lang.general;
        }
        
        return lang.general || this.responses.english.general;
    }
}

// AI Agent Class
class Yono777SupportAgent {
    constructor() {
        // Database will replace these Maps for persistence
        this.conversationHistory = new Map(); // in-memory cache for active sessions
        this.attemptCount = new Map(); // in-memory cache
        this.isFirstMessage = new Map(); // in-memory flag
        this.depositProblems = new Map(); // in-memory cache
        this.languageDetector = new LanguageDetector();
        this.multilingual = new MultilingualResponses();
    }

    // Classify user issue (multilingual)
    classifyIssue(message, language) {
        const lowerMessage = message.toLowerCase();
        
        // Multilingual keywords
        const depositKeywords = {
            english: ['deposit', 'add money', 'fund', 'add cash', 'top up'],
            hindi: ['जमा', 'पैसा जोड़', 'फंड', 'जमा कर', 'top up'],
            telugu: ['జమ', 'డిపాజిట్', 'ఫండ్', 'డబ్బు జోడించు', 'top up'],
            tamil: ['வைப்பு', 'பணம் சேர்', 'நிதி', 'டெபாசிட்'],
            bengali: ['জমা', 'টাকা যোগ', 'ফান্ড', 'ডিপোজিট'],
            gujarati: ['જમા', 'પૈસા ઉમેરો', 'ફંડ', 'ડિપોઝિટ'],
            kannada: ['ಠೇವಣಿ', 'ಹಣ ಸೇರಿಸಿ', 'ನಿಧಿ', 'ಡಿಪಾಜಿಟ್'],
            malayalam: ['ഡെപ്പോസിറ്റ്', 'പണം ചേർക്കുക', 'ഫണ്ട്'],
            punjabi: ['ਜਮ੍ਹਾ', 'ਪੈਸਾ ਜੋੜੋ', 'ਫੰਡ', 'ਡਿਪਾਜਿਟ'],
            urdu: ['جمع', 'پیسہ شامل', 'فنڈ']
        };
        
        const withdrawalKeywords = {
            english: ['withdraw', 'cash out', 'payout', 'withdrawal', 'money out'],
            hindi: ['निकासी', 'पैसा निकाल', 'निकाल', 'वापसी'],
            telugu: ['ఉపసంహరణ', 'డబ్బు తీసుకో', 'విడుదల', 'తీసుకో'],
            tamil: ['திரும்பப்பெற', 'பணம் எடு', 'வெளியேற்றம்'],
            bengali: ['উত্তোলন', 'টাকা তুলুন', 'পে-আউট'],
            gujarati: ['પાછું લો', 'પૈસા કાઢો', 'પે-આઉટ'],
            kannada: ['ಹಿಂಪಡೆಯಿರಿ', 'ಹಣ ಹಿಂಪಡೆ', 'ಪೇ-ಆಉಟ್'],
            malayalam: ['പിൻവലിക്കുക', 'പണം എടുക്കുക', 'പേ-ഔട്ട്'],
            punjabi: ['ਵਾਪਸੀ', 'ਪੈਸਾ ਕੱਢੋ', 'ਪੇ-ਆਉਟ'],
            urdu: ['واپسی', 'پیسہ نکالیں', 'پے آؤٹ']
        };
        
        const accountKeywords = {
            english: ['account', 'profile', 'bank detail', 'restrict', 'lock', 'block'],
            hindi: ['खाता', 'प्रोफाइल', 'बैंक विवरण', 'प्रतिबंध', 'लॉक', 'ब्लॉक'],
            telugu: ['ఖాతా', 'ప్రొఫైల్', 'బ్యాంక్ వివరాలు', 'పరిమితి', 'లాక్', 'బ్లాక్'],
            tamil: ['கணக்கு', 'சுயவிவரம்', 'வங்கி விவரங்கள்', 'கட்டுப்பாடு', 'பூட்டு'],
            bengali: ['অ্যাকাউন্ট', 'প্রোফাইল', 'ব্যাঙ্ক বিবরণ', 'সীমাবদ্ধ', 'লক'],
            gujarati: ['એકાઉન્ટ', 'પ્રોફાઇલ', 'બેંક વિગતો', 'પ્રતિબંધ', 'લૉક'],
            kannada: ['ಖಾತೆ', 'ಪ್ರೊಫೈಲ್', 'ಬ್ಯಾಂಕ್ ವಿವರಗಳು', 'ಪ್ರತಿಬಂಧ', 'ಲಾಕ್'],
            malayalam: ['അക്കൗണ്ട്', 'പ്രൊഫൈൽ', 'ബാങ്ക് വിവരങ്ങൾ', 'നിയന്ത്രണം', 'ലോക്ക്'],
            punjabi: ['ਖਾਤਾ', 'ਪ੍ਰੋਫਾਈਲ', 'ਬੈਂਕ ਵਿਵਰਣ', 'ਪ੍ਰਤਿਬੰਧ', 'ਲਾਕ'],
            urdu: ['اکاؤنٹ', 'پروفائل', 'بینک کی تفصیلات', 'پابندی', 'لاک']
        };
        
        const bonusKeywords = {
            english: ['bonus', 'promo', 'wagering', 'free spin', 'reward'],
            hindi: ['बोनस', 'प्रोमो', 'वेजरिंग', 'मुफ्त स्पिन', 'इनाम'],
            telugu: ['బోనస్', 'ప్రోమో', 'వేజరింగ్', 'ఉచిత స్పిన్', 'బహుమతి'],
            tamil: ['போனஸ்', 'ப்ரோமோ', 'வேஜரிங்', 'இலவச சுழற்சி', 'வெகுமதி'],
            bengali: ['বোনাস', 'প্রোমো', 'ওয়েজারিং', 'ফ্রি স্পিন', 'পুরস্কার'],
            gujarati: ['બોનસ', 'પ્રોમો', 'વેજરિંગ', 'મફત સ્પિન', 'ઇનામ'],
            kannada: ['ಬೋನಸ್', 'ಪ್ರೋಮೋ', 'ವೇಜರಿಂಗ್', 'ಉಚಿತ ಸ್ಪಿನ್', 'ಬಹುಮಾನ'],
            malayalam: ['ബോണസ്', 'പ്രോമോ', 'വേജറിംഗ്', 'സൗജന്യ സ്പിൻ', 'പുരസ്കാരം'],
            punjabi: ['ਬੋਨਸ', 'ਪ੍ਰੋਮੋ', 'ਵੇਜਰਿੰਗ', 'ਮੁਫ਼ਤ ਸਪਿਨ', 'ਇਨਾਮ'],
            urdu: ['بونس', 'پرومو', 'ویجرنگ', 'مفت اسپن', 'انعام']
        };
        
        const technicalKeywords = {
            english: ['bug', 'error', 'not working', 'technical', 'problem', 'issue'],
            hindi: ['बग', 'त्रुटि', 'काम नहीं', 'तकनीकी', 'समस्या'],
            telugu: ['బగ్', 'దోషం', 'పని చేయడం లేదు', 'సాంకేతిక', 'సమస్య'],
            tamil: ['பிழை', 'பிழை', 'வேலை செய்யவில்லை', 'தொழில்நுட்ப', 'பிரச்சனை'],
            bengali: ['বাগ', 'ত্রুটি', 'কাজ করছে না', 'প্রযুক্তিগত', 'সমস্যা'],
            gujarati: ['બગ', 'ભૂલ', 'કામ કરતું નથી', 'ટેકનિકલ', 'સમસ્યા'],
            kannada: ['ಬಗ್', 'ದೋಷ', 'ಕೆಲಸ ಮಾಡುತ್ತಿಲ್ಲ', 'ತಾಂತ್ರಿಕ', 'ಸಮಸ್ಯೆ'],
            malayalam: ['ബഗ്', 'പിശക്', 'പ്രവർത്തിക്കുന്നില്ല', 'സാങ്കേതിക', 'പ്രശ്നം'],
            punjabi: ['ਬਗ', 'ਗਲਤੀ', 'ਕੰਮ ਨਹੀਂ ਕਰ ਰਿਹਾ', 'ਤਕਨੀਕੀ', 'ਸਮੱਸਿਆ'],
            urdu: ['بگ', 'خرابی', 'کام نہیں کر رہا', 'تکنیکی', 'مسئلہ']
        };
        
        const complaintKeywords = {
            english: ['complain', 'unfair', 'wrong', 'issue with', 'dissatisfied'],
            hindi: ['शिकायत', 'अनुचित', 'गलत', 'समस्या', 'असंतुष्ट'],
            telugu: ['ఫిర్యాదు', 'అన్యాయం', 'తప్పు', 'సమస్య', 'అసంతృప్తి'],
            tamil: ['புகார்', 'நியாயமற்ற', 'தவறு', 'பிரச்சனை', 'அதிருப்தி'],
            bengali: ['অভিযোগ', 'অন্যায়', 'ভুল', 'সমস্যা', 'অসন্তুষ্ট'],
            gujarati: ['ફરિયાદ', 'અન્યાય', 'ખોટું', 'સમસ્યા', 'અસંતુષ્ટ'],
            kannada: ['ದೂರು', 'ಅನ್ಯಾಯ', 'ತಪ್ಪು', 'ಸಮಸ್ಯೆ', 'ಅಸಂತೃಪ್ತಿ'],
            malayalam: ['പരാതി', 'അനീതി', 'തെറ്റ്', 'പ്രശ്നം', 'അതൃപ്തി'],
            punjabi: ['ਸ਼ਿਕਾਇਤ', 'ਗੈਰ-ਨਿਰਪੱਖ', 'ਗਲਤ', 'ਸਮੱਸਿਆ', 'ਅਸੰਤੁਸ਼ਟ'],
            urdu: ['شکایت', 'ناانصافی', 'غلط', 'مسئلہ', 'غیر مطمئن']
        };
        
        const responsibleKeywords = {
            english: ['responsible', 'self-exclusion', 'limit', 'gambling problem', 'addiction'],
            hindi: ['जिम्मेदार', 'स्व-बहिष्करण', 'सीमा', 'जुआ समस्या', 'लत'],
            telugu: ['బాధ్యతాయుత', 'స్వీయ-మినహాయింపు', 'పరిమితి', 'జూదం సమస్య', 'వ్యసనం'],
            tamil: ['பொறுப்பு', 'சுய-விலக்கு', 'வரம்பு', 'சூதாட்ட பிரச்சனை', 'பழக்கம்'],
            bengali: ['দায়িত্বশীল', 'স্ব-বহিষ্কার', 'সীমা', 'জুয়া সমস্যা', 'আসক্তি'],
            gujarati: ['જવાબદાર', 'સ્વ-બહિષ્કાર', 'મર્યાદા', 'જુગાર સમસ્યા', 'લત'],
            kannada: ['ಜವಾಬ್ದಾರಿ', 'ಸ್ವ-ಬಹಿಷ್ಕಾರ', 'ಮಿತಿ', 'ಜೂಜು ಸಮಸ್ಯೆ', 'ವ್ಯಸನ'],
            malayalam: ['ഉത്തരവാദിത്തം', 'സ്വയം-ഒഴിവാക്കൽ', 'പരിധി', 'ജൂതാട്ടം പ്രശ്നം', 'വ്യസനം'],
            punjabi: ['ਜ਼ਿੰਮੇਵਾਰ', 'ਸਵੈ-ਬਹਿਸ਼ਕਾਰ', 'ਸੀਮਾ', 'ਜੂਆ ਸਮੱਸਿਆ', 'ਲਤ'],
            urdu: ['ذمہ دار', 'خود خارج', 'حد', 'جوا مسئلہ', 'لت']
        };
        
        const keywords = {
            deposit: depositKeywords[language] || depositKeywords.english,
            withdrawal: withdrawalKeywords[language] || withdrawalKeywords.english,
            account: accountKeywords[language] || accountKeywords.english,
            bonus: bonusKeywords[language] || bonusKeywords.english,
            technical: technicalKeywords[language] || technicalKeywords.english,
            complaint: complaintKeywords[language] || complaintKeywords.english,
            responsible: responsibleKeywords[language] || responsibleKeywords.english
        };
        
        // Check each category
        if (keywords.deposit.some(keyword => lowerMessage.includes(keyword))) {
            return 'deposit';
        }
        if (keywords.withdrawal.some(keyword => lowerMessage.includes(keyword))) {
            return 'withdrawal';
        }
        if (keywords.account.some(keyword => lowerMessage.includes(keyword))) {
            return 'account';
        }
        if (keywords.bonus.some(keyword => lowerMessage.includes(keyword))) {
            return 'bonus';
        }
        if (keywords.technical.some(keyword => lowerMessage.includes(keyword))) {
            return 'technical issue';
        }
        if (keywords.complaint.some(keyword => lowerMessage.includes(keyword))) {
            return 'complaint';
        }
        if (keywords.responsible.some(keyword => lowerMessage.includes(keyword))) {
            return 'responsible gaming';
        }
        
        return 'general info';
    }

    // Check if escalation is needed (multilingual)
    needsEscalation(message, issueType, userId, language) {
        const lowerMessage = message.toLowerCase();
        
        const humanKeywords = {
            english: ['human', 'agent', 'manager', 'supervisor', 'person', 'real person'],
            hindi: ['मानव', 'एजेंट', 'मैनेजर', 'सुपरवाइजर', 'व्यक्ति', 'असली व्यक्ति'],
            telugu: ['మానవ', 'ఏజెంట్', 'మేనేజర్', 'సూపర్వైజర్', 'వ్యక్తి', 'నిజమైన వ్యక్తి'],
            tamil: ['மனித', 'ஏஜென்ட்', 'மேலாளர்', 'மேற்பார்வையாளர்', 'நபர்', 'உண்மையான நபர்'],
            bengali: ['মানুষ', 'এজেন্ট', 'ম্যানেজার', 'সুপারভাইজার', 'ব্যক্তি', 'আসল ব্যক্তি'],
            gujarati: ['માનવ', 'એજન્ટ', 'મેનેજર', 'સુપરવાઇઝર', 'વ્યક્તિ', 'વાસ્તવિક વ્યક્તિ'],
            kannada: ['ಮಾನವ', 'ಏಜೆಂಟ್', 'ಮ್ಯಾನೇಜರ್', 'ಸೂಪರ್ವೈಸರ್', 'ವ್ಯಕ್ತಿ', 'ನಿಜವಾದ ವ್ಯಕ್ತಿ'],
            malayalam: ['മനുഷ്യൻ', 'ഏജന്റ്', 'മാനേജർ', 'സൂപ്പർവൈസർ', 'വ്യക്തി', 'യഥാർത്ഥ വ്യക്തി'],
            punjabi: ['ਮਨੁੱਖ', 'ਏਜੰਟ', 'ਮੈਨੇਜਰ', 'ਸੁਪਰਵਾਈਜ਼ਰ', 'ਵਿਅਕਤੀ', 'ਅਸਲ ਵਿਅਕਤੀ'],
            urdu: ['انسان', 'ایجنٹ', 'مینیجر', 'سپروائزر', 'شخص', 'حقیقی شخص']
        };
        
        const legalKeywords = {
            english: ['lawyer', 'legal', 'sue', 'court', 'lawsuit', 'attorney'],
            hindi: ['वकील', 'कानूनी', 'मुकदमा', 'अदालत', 'मुकदमा', 'वकील'],
            telugu: ['న్యాయవాది', 'చట్టపరమైన', 'దావా', 'కోర్టు', 'దావా', 'న్యాయవాది'],
            tamil: ['வழக்கறிஞர்', 'சட்ட', 'வழக்கு', 'நீதிமன்றம்', 'வழக்கு', 'வழக்கறிஞர்'],
            bengali: ['আইনজীবী', 'আইনি', 'মামলা', 'আদালত', 'মামলা', 'আইনজীবী'],
            gujarati: ['વકીલ', 'કાનૂની', 'મુકદ્દમો', 'કોર્ટ', 'મુકદ્દમો', 'વકીલ'],
            kannada: ['ವಕೀಲ', 'ಕಾನೂನು', 'ಮೊಕದ್ದಮೆ', 'ನ್ಯಾಯಾಲಯ', 'ಮೊಕದ್ದಮೆ', 'ವಕೀಲ'],
            malayalam: ['വക്കീൽ', 'നിയമപരമായ', 'വ്യവഹാരം', 'കോടതി', 'വ്യവഹാരം', 'വക്കീൽ'],
            punjabi: ['ਵਕੀਲ', 'ਕਾਨੂੰਨੀ', 'ਮੁਕੱਦਮਾ', 'ਕੋਰਟ', 'ਮੁਕੱਦਮਾ', 'ਵਕੀਲ'],
            urdu: ['وکیل', 'قانونی', 'مقدمہ', 'عدالت', 'مقدمہ', 'وکیل']
        };
        
        const disputeKeywords = {
            english: ['dispute', 'chargeback', 'fraud', 'scam', 'cheat'],
            hindi: ['विवाद', 'चार्जबैक', 'धोखाधड़ी', 'स्कैम', 'धोखा'],
            telugu: ['వివాదం', 'చార్జ్‌బ్యాక్', 'వంచన', 'స్కామ్', 'మోసం'],
            tamil: ['விவாதம்', 'சார்ஜ்பேக்', 'மோசடி', 'ஸ்காம்', 'ஏமாற்று'],
            bengali: ['বিবাদ', 'চার্জব্যাক', 'জালিয়াতি', 'স্ক্যাম', 'প্রতারণা'],
            gujarati: ['વિવાદ', 'ચાર્જબેક', 'ઘોંઘાટ', 'સ્કેમ', 'ઠગાઈ'],
            kannada: ['ವಿವಾದ', 'ಚಾರ್ಜ್‌ಬ್ಯಾಕ್', 'ವಂಚನೆ', 'ಸ್ಕ್ಯಾಮ್', 'ಮೋಸ'],
            malayalam: ['വിവാദം', 'ചാർജ്‌ബാക്ക്', 'വഞ്ചന', 'സ്കാം', 'ചതി'],
            punjabi: ['ਵਿਵਾਦ', 'ਚਾਰਜਬੈਕ', 'ਧੋਖਾਧੜੀ', 'ਸਕੈਮ', 'ਧੋਖਾ'],
            urdu: ['تنازع', 'چارج بیک', 'دھوکہ دہی', 'سکیم', 'دھوکہ']
        };
        
        const suspendKeywords = {
            english: ['suspend', 'ban', 'terminate', 'close account', 'block account'],
            hindi: ['निलंबित', 'प्रतिबंध', 'समाप्त', 'खाता बंद', 'खाता ब्लॉक'],
            telugu: ['సస్పెండ్', 'నిషేధం', 'ముగింపు', 'ఖాతా మూసివేయి', 'ఖాతా బ్లాక్'],
            tamil: ['இடைநீக்கம்', 'தடை', 'முடிவு', 'கணக்கு மூடு', 'கணக்கு தடை'],
            bengali: ['স্থগিত', 'নিষেধ', 'সমাপ্ত', 'অ্যাকাউন্ট বন্ধ', 'অ্যাকাউন্ট ব্লক'],
            gujarati: ['સસ્પેન્ડ', 'પ્રતિબંધ', 'સમાપ્ત', 'એકાઉન્ટ બંધ', 'એકાઉન્ટ બ્લૉક'],
            kannada: ['ನಿಲ್ಲಿಸಿ', 'ನಿಷೇಧ', 'ಮುಕ್ತಾಯ', 'ಖಾತೆ ಮುಚ್ಚಿ', 'ಖಾತೆ ಬ್ಲಾಕ್'],
            malayalam: ['സസ്പെൻഡ്', 'നിരോധനം', 'അവസാനിക്കുക', 'അക്കൗണ്ട് അടയ്ക്കുക', 'അക്കൗണ്ട് ബ്ലോക്ക്'],
            punjabi: ['ਸਸਪੈਂਡ', 'ਪ੍ਰਤਿਬੰਧ', 'ਸਮਾਪਤ', 'ਖਾਤਾ ਬੰਦ', 'ਖਾਤਾ ਬਲਾਕ'],
            urdu: ['معطل', 'پابندی', 'ختم', 'اکاؤنٹ بند', 'اکاؤنٹ بلاک']
        };
        
        const keywords = {
            human: humanKeywords[language] || humanKeywords.english,
            legal: legalKeywords[language] || legalKeywords.english,
            dispute: disputeKeywords[language] || disputeKeywords.english,
            suspend: suspendKeywords[language] || suspendKeywords.english
        };
        
        // Check for explicit requests
        if (keywords.human.some(keyword => lowerMessage.includes(keyword))) {
            return true;
        }
        
        // Check for legal threats
        if (keywords.legal.some(keyword => lowerMessage.includes(keyword))) {
            return true;
        }
        
        // Check for payment disputes
        if (keywords.dispute.some(keyword => lowerMessage.includes(keyword))) {
            return true;
        }
        
        // Check for account suspension
        if (keywords.suspend.some(keyword => lowerMessage.includes(keyword))) {
            return true;
        }
        
        // Check attempt count
        const attempts = this.attemptCount.get(userId) || 0;
        if (attempts >= 3) {
            return true;
        }
        
        // System errors
        const systemKeywords = {
            english: ['system', 'server', 'database', 'crash'],
            hindi: ['सिस्टम', 'सर्वर', 'डेटाबेस', 'क्रैश'],
            telugu: ['సిస్టమ్', 'సర్వర్', 'డేటాబేస్', 'క్రాష్'],
            tamil: ['அமைப்பு', 'சர்வர்', 'தரவுத்தளம்', 'விபத்து'],
            bengali: ['সিস্টেম', 'সার্ভার', 'ডাটাবেস', 'ক্র্যাশ'],
            gujarati: ['સિસ્ટમ', 'સર્વર', 'ડેટાબેસ', 'ક્રેશ'],
            kannada: ['ವ್ಯವಸ್ಥೆ', 'ಸರ್ವರ್', 'ಡೇಟಾಬೇಸ್', 'ಕ್ರ್ಯಾಶ್'],
            malayalam: ['സിസ്റ്റം', 'സെർവർ', 'ഡാറ്റാബേസ്', 'ക്രാഷ്'],
            punjabi: ['ਸਿਸਟਮ', 'ਸਰਵਰ', 'ਡੇਟਾਬੇਸ', 'ਕ੍ਰੈਸ਼'],
            urdu: ['سسٹم', 'سرور', 'ڈیٹا بیس', 'کریش']
        };
        
        const sysKw = systemKeywords[language] || systemKeywords.english;
        if (issueType === 'technical issue' && sysKw.some(keyword => lowerMessage.includes(keyword))) {
            return true;
        }
        
        return false;
    }

    // Generate response based on issue type (multilingual)
    generateResponse(message, issueType, userId, language) {
        const lowerMessage = message.toLowerCase();
        
        // Multilingual keywords for subcategories
        const howKeywords = {
            english: ['how', 'method', 'way', 'process'],
            hindi: ['कैसे', 'विधि', 'तरीका', 'प्रक्रिया'],
            telugu: ['ఎలా', 'పద్ధతి', 'మార్గం', 'ప్రక్రియ'],
            tamil: ['எப்படி', 'முறை', 'வழி', 'செயல்முறை'],
            bengali: ['কীভাবে', 'পদ্ধতি', 'উপায়', 'প্রক্রিয়া'],
            gujarati: ['કેવી રીતે', 'પદ્ધતિ', 'માર્ગ', 'પ્રક્રિયા'],
            kannada: ['ಹೇಗೆ', 'ವಿಧಾನ', 'ಮಾರ್ಗ', 'ಪ್ರಕ್ರಿಯೆ'],
            malayalam: ['എങ്ങനെ', 'രീതി', 'വഴി', 'പ്രക്രിയ'],
            punjabi: ['ਕਿਵੇਂ', 'ਵਿਧੀ', 'ਤਰੀਕਾ', 'ਪ੍ਰਕਿਰਿਆ'],
            urdu: ['کیسے', 'طریقہ', 'راستہ', 'عمل']
        };
        
        const failKeywords = {
            english: ['fail', 'error', 'not working', 'problem', 'issue'],
            hindi: ['असफल', 'त्रुटि', 'काम नहीं', 'समस्या'],
            telugu: ['విఫలం', 'దోషం', 'పని చేయడం లేదు', 'సమస్య'],
            tamil: ['தோல்வி', 'பிழை', 'வேலை செய்யவில்லை', 'பிரச்சனை'],
            bengali: ['ব্যর্থ', 'ত্রুটি', 'কাজ করছে না', 'সমস্যা'],
            gujarati: ['અસફળ', 'ભૂલ', 'કામ કરતું નથી', 'સમસ્યા'],
            kannada: ['ವಿಫಲ', 'ದೋಷ', 'ಕೆಲಸ ಮಾಡುತ್ತಿಲ್ಲ', 'ಸಮಸ್ಯೆ'],
            malayalam: ['പരാജയം', 'പിശക്', 'പ്രവർത്തിക്കുന്നില്ല', 'പ്രശ്നം'],
            punjabi: ['ਅਸਫਲ', 'ਗਲਤੀ', 'ਕੰਮ ਨਹੀਂ ਕਰ ਰਿਹਾ', 'ਸਮੱਸਿਆ'],
            urdu: ['ناکام', 'خرابی', 'کام نہیں کر رہا', 'مسئلہ']
        };
        
        const timeKeywords = {
            english: ['how long', 'time', 'when', 'duration', 'when will'],
            hindi: ['कितना समय', 'समय', 'कब', 'अवधि'],
            telugu: ['ఎంత సమయం', 'సమయం', 'ఎప్పుడు', 'వ్యవధి'],
            tamil: ['எவ்வளவு நேரம்', 'நேரம்', 'எப்போது', 'காலம்'],
            bengali: ['কতক্ষণ', 'সময়', 'কখন', 'স্থায়িত্ব'],
            gujarati: ['કેટલો સમય', 'સમય', 'ક્યારે', 'અવધિ'],
            kannada: ['ಎಷ್ಟು ಸಮಯ', 'ಸಮಯ', 'ಎಂದು', 'ಅವಧಿ'],
            malayalam: ['എത്ര സമയം', 'സമയം', 'എപ്പോൾ', 'കാലാവധി'],
            punjabi: ['ਕਿੰਨਾ ਸਮਾਂ', 'ਸਮਾਂ', 'ਕਦੋਂ', 'ਮਿਆਦ'],
            urdu: ['کتنا وقت', 'وقت', 'کب', 'مدت']
        };
        
        const langKeywords = {
            how: howKeywords[language] || howKeywords.english,
            fail: failKeywords[language] || failKeywords.english,
            time: timeKeywords[language] || timeKeywords.english
        };
        
        // Handle deposits
        if (issueType === 'deposit') {
            if (langKeywords.how.some(keyword => lowerMessage.includes(keyword))) {
                return this.multilingual.getResponse(language, 'deposit', 'how');
            }
            if (langKeywords.fail.some(keyword => lowerMessage.includes(keyword))) {
                // Check if order number exists in database first
                const orderNumber = this.extractOrderNumber(message);
                if (orderNumber) {
                    // Check database - if found, don't send to Telegram
                    // Note: This is async, but we return the response immediately
                    // The Telegram notification will be skipped if order is found
                    this.checkOrderNumberInDatabase(orderNumber, (err, orderData) => {
                        if (!err && orderData && orderData.found) {
                            // Order found in database - don't send to Telegram
                            console.log(`[Agent] Order ${orderNumber} found in ${orderData.type} database, skipping Telegram notification for deposit problem`);
                            return;
                        } else {
                            // Order not found - send to Telegram as problem
                            console.log(`[Agent] Order ${orderNumber} not found in database, sending to Telegram as deposit problem`);
                            this.handleDepositProblem(userId, message, orderNumber);
                        }
                    });
                } else {
                    // No order number - send to Telegram as problem
                    this.handleDepositProblem(userId, message, null);
                }
                return this.multilingual.getResponse(language, 'deposit', 'fail');
            }
            return this.multilingual.getResponse(language, 'deposit', 'general');
        }
        
        // Handle withdrawals
        if (issueType === 'withdrawal') {
            if (langKeywords.time.some(keyword => lowerMessage.includes(keyword))) {
                return this.multilingual.getResponse(language, 'withdrawal', 'time');
            }
            if (langKeywords.fail.some(keyword => lowerMessage.includes(keyword))) {
                return this.multilingual.getResponse(language, 'withdrawal', 'fail');
            }
            return this.multilingual.getResponse(language, 'withdrawal', 'general');
        }
        
        // Handle account issues
        if (issueType === 'account') {
            const updateKeywords = {
                english: ['bank detail', 'update', 'change', 'modify'],
                hindi: ['बैंक विवरण', 'अपडेट', 'बदल', 'संशोधन'],
                telugu: ['బ్యాంక్ వివరాలు', 'నవీకరణ', 'మార్పు', 'సవరణ'],
                tamil: ['வங்கி விவரங்கள்', 'புதுப்பிப்பு', 'மாற்றம்', 'திருத்தம்'],
                bengali: ['ব্যাঙ্ক বিবরণ', 'আপডেট', 'পরিবর্তন', 'সংশোধন'],
                gujarati: ['બેંક વિગતો', 'અપડેટ', 'બદલો', 'સુધારો'],
                kannada: ['ಬ್ಯಾಂಕ್ ವಿವರಗಳು', 'ನವೀಕರಣ', 'ಬದಲಾವಣೆ', 'ಸಂಶೋಧನೆ'],
                malayalam: ['ബാങ്ക് വിവരങ്ങൾ', 'അപ്ഡേറ്റ്', 'മാറ്റം', 'പരിഷ്കരണം'],
                punjabi: ['ਬੈਂਕ ਵਿਵਰਣ', 'ਅਪਡੇਟ', 'ਬਦਲੋ', 'ਸੁਧਾਰ'],
                urdu: ['بینک کی تفصیلات', 'اپ ڈیٹ', 'تبدیلی', 'ترمیم']
            };
            
            const restrictKeywords = {
                english: ['restrict', 'lock', 'block', 'ban'],
                hindi: ['प्रतिबंध', 'लॉक', 'ब्लॉक', 'प्रतिबंध'],
                telugu: ['పరిమితి', 'లాక్', 'బ్లాక్', 'నిషేధం'],
                tamil: ['கட்டுப்பாடு', 'பூட்டு', 'தடை', 'தடை'],
                bengali: ['সীমাবদ্ধ', 'লক', 'ব্লক', 'নিষেধ'],
                gujarati: ['પ્રતિબંધ', 'લૉક', 'બ્લૉક', 'પ્રતિબંધ'],
                kannada: ['ಪ್ರತಿಬಂಧ', 'ಲಾಕ್', 'ಬ್ಲಾಕ್', 'ನಿಷೇಧ'],
                malayalam: ['നിയന്ത്രണം', 'ലോക്ക്', 'ബ്ലോക്ക്', 'നിരോധനം'],
                punjabi: ['ਪ੍ਰਤਿਬੰਧ', 'ਲਾਕ', 'ਬਲਾਕ', 'ਪ੍ਰਤਿਬੰਧ'],
                urdu: ['پابندی', 'لاک', 'بلاک', 'پابندی']
            };
            
            const updateKw = updateKeywords[language] || updateKeywords.english;
            const restrictKw = restrictKeywords[language] || restrictKeywords.english;
            
            if (updateKw.some(keyword => lowerMessage.includes(keyword))) {
                return this.multilingual.getResponse(language, 'account', 'update');
            }
            if (restrictKw.some(keyword => lowerMessage.includes(keyword))) {
                return this.multilingual.getResponse(language, 'account', 'restrict');
            }
            return this.multilingual.getResponse(language, 'account', 'general');
        }
        
        // Handle bonuses
        if (issueType === 'bonus') {
            const wageringKeywords = {
                english: ['wagering', 'requirement', 'wager', 'rollover'],
                hindi: ['वेजरिंग', 'आवश्यकता', 'वेजर', 'रोलओवर'],
                telugu: ['వేజరింగ్', 'అవసరం', 'వేజర్', 'రోల్ఓవర్'],
                tamil: ['வேஜரிங்', 'தேவை', 'வேஜர்', 'ரோல்ஓவர்'],
                bengali: ['ওয়েজারিং', 'প্রয়োজনীয়তা', 'ওয়েজার', 'রোলওভার'],
                gujarati: ['વેજરિંગ', 'જરૂરિયાત', 'વેજર', 'રોલઓવર'],
                kannada: ['ವೇಜರಿಂಗ್', 'ಅವಶ್ಯಕತೆ', 'ವೇಜರ್', 'ರೋಲ್ಓವರ್'],
                malayalam: ['വേജറിംഗ്', 'ആവശ്യകത', 'വേജർ', 'റോൾഓവർ'],
                punjabi: ['ਵੇਜਰਿੰਗ', 'ਲੋੜ', 'ਵੇਜਰ', 'ਰੋਲਓਵਰ'],
                urdu: ['ویجرنگ', 'ضرورت', 'ویجر', 'رول اوور']
            };
            
            const missingKeywords = {
                english: ['not receive', 'missing', 'did not get', 'not credited'],
                hindi: ['नहीं मिला', 'गायब', 'नहीं मिला', 'क्रेडिट नहीं'],
                telugu: ['రాలేదు', 'లేదు', 'లభించలేదు', 'క్రెడిట్ కాలేదు'],
                tamil: ['பெறவில்லை', 'காணவில்லை', 'கிடைக்கவில்லை', 'கடன் இல்லை'],
                bengali: ['পাইনি', 'হারিয়ে গেছে', 'পাইনি', 'ক্রেডিট হয়নি'],
                gujarati: ['મળ્યું નથી', 'ખૂટતું', 'મળ્યું નથી', 'ક્રેડિટ થયું નથી'],
                kannada: ['ಸಿಗಲಿಲ್ಲ', 'ಕಾಣೆಯಾಗಿದೆ', 'ಸಿಗಲಿಲ್ಲ', 'ಕ್ರೆಡಿಟ್ ಆಗಿಲ್ಲ'],
                malayalam: ['ലഭിച്ചില്ല', 'കാണാതായി', 'ലഭിച്ചില്ല', 'ക്രെഡിറ്റ് ചെയ്തില്ല'],
                punjabi: ['ਨਹੀਂ ਮਿਲਿਆ', 'ਗੁੰਮ', 'ਨਹੀਂ ਮਿਲਿਆ', 'ਕ੍ਰੈਡਿਟ ਨਹੀਂ'],
                urdu: ['نہیں ملا', 'غائب', 'نہیں ملا', 'کریڈٹ نہیں']
            };
            
            const wagerKw = wageringKeywords[language] || wageringKeywords.english;
            const missKw = missingKeywords[language] || missingKeywords.english;
            
            if (wagerKw.some(keyword => lowerMessage.includes(keyword))) {
                return this.multilingual.getResponse(language, 'bonus', 'wagering');
            }
            if (missKw.some(keyword => lowerMessage.includes(keyword))) {
                return this.multilingual.getResponse(language, 'bonus', 'missing');
            }
            return this.multilingual.getResponse(language, 'bonus', 'general');
        }
        
        // Handle technical issues
        if (issueType === 'technical issue') {
            return this.multilingual.getResponse(language, 'technical');
        }
        
        // Handle complaints
        if (issueType === 'complaint') {
            return this.multilingual.getResponse(language, 'complaint');
        }
        
        // Handle responsible gaming
        if (issueType === 'responsible gaming') {
            const exclusionKeywords = {
                english: ['self-exclusion', 'exclusion', 'self ban'],
                hindi: ['स्व-बहिष्करण', 'बहिष्करण', 'स्व प्रतिबंध'],
                telugu: ['స్వీయ-మినహాయింపు', 'మినహాయింపు', 'స్వీయ నిషేధం'],
                tamil: ['சுய-விலக்கு', 'விலக்கு', 'சுய தடை'],
                bengali: ['স্ব-বহিষ্কার', 'বহিষ্কার', 'স্ব নিষেধ'],
                gujarati: ['સ્વ-બહિષ્કાર', 'બહિષ્કાર', 'સ્વ પ્રતિબંધ'],
                kannada: ['ಸ್ವ-ಬಹಿಷ್ಕಾರ', 'ಬಹಿಷ್ಕಾರ', 'ಸ್ವ ನಿಷೇಧ'],
                malayalam: ['സ്വയം-ഒഴിവാക്കൽ', 'ഒഴിവാക്കൽ', 'സ്വയം നിരോധനം'],
                punjabi: ['ਸਵੈ-ਬਹਿਸ਼ਕਾਰ', 'ਬਹਿਸ਼ਕਾਰ', 'ਸਵੈ ਪ੍ਰਤਿਬੰਧ'],
                urdu: ['خود خارج', 'خارج', 'خود پابندی']
            };
            
            const limitKw = {
                english: ['limit', 'restriction', 'cap'],
                hindi: ['सीमा', 'प्रतिबंध', 'कैप'],
                telugu: ['పరిమితి', 'ప్రతిబంధం', 'క్యాప్'],
                tamil: ['வரம்பு', 'கட்டுப்பாடு', 'வரம்பு'],
                bengali: ['সীমা', 'সীমাবদ্ধতা', 'ক্যাপ'],
                gujarati: ['મર્યાદા', 'પ્રતિબંધ', 'કેપ'],
                kannada: ['ಮಿತಿ', 'ಪ್ರತಿಬಂಧ', 'ಕ್ಯಾಪ್'],
                malayalam: ['പരിധി', 'നിയന്ത്രണം', 'കാപ്പ്'],
                punjabi: ['ਸੀਮਾ', 'ਪ੍ਰਤਿਬੰਧ', 'ਕੈਪ'],
                urdu: ['حد', 'پابندی', 'کیپ']
            };
            
            const exclKw = exclusionKeywords[language] || exclusionKeywords.english;
            const limKw = limitKw[language] || limitKw.english;
            
            if (exclKw.some(keyword => lowerMessage.includes(keyword))) {
                return this.multilingual.getResponse(language, 'responsible', 'exclusion');
            }
            if (limKw.some(keyword => lowerMessage.includes(keyword))) {
                return this.multilingual.getResponse(language, 'responsible', 'limit');
            }
            return this.multilingual.getResponse(language, 'responsible', 'general');
        }
        
        // Handle general info
        return this.multilingual.getResponse(language, 'general');
    }

    // Main chat handler (multilingual)
    handleMessage(message, userId) {
        // Detect language from current message - STRICT detection per message
        const detectedLanguage = this.languageDetector.detectLanguage(message);
        
        // Initialize user session
        if (!this.conversationHistory.has(userId)) {
            this.conversationHistory.set(userId, []);
            this.isFirstMessage.set(userId, true);
            this.attemptCount.set(userId, 0);
        }
        
        // Use the detected language for THIS message only - no persistence
        const language = detectedLanguage;
        const isFirst = this.isFirstMessage.get(userId);
        this.isFirstMessage.set(userId, false);
        
        // First message greeting - use detected language
        if (isFirst) {
            const greeting = this.multilingual.getResponse(language, 'greeting');
            this.conversationHistory.get(userId).push({ role: 'user', message });
            this.conversationHistory.get(userId).push({ role: 'assistant', message: greeting });
            return greeting;
        }
        
        // Check for sensitive information requests (security)
        const lowerMessage = message.toLowerCase();
        const securityKeywords = {
            english: ['password', 'otp', 'pin', 'passcode'],
            hindi: ['पासवर्ड', 'otp', 'pin', 'पासकोड'],
            telugu: ['పాస్‌వర్డ్', 'otp', 'pin', 'పాస్‌కోడ్'],
            tamil: ['கடவுச்சொல்', 'otp', 'pin', 'பாஸ்கோட்'],
            bengali: ['পাসওয়ার্ড', 'otp', 'pin', 'পাসকোড'],
            gujarati: ['પાસવર્ડ', 'otp', 'pin', 'પાસકોડ'],
            kannada: ['ಪಾಸ್‌ವರ್ಡ್', 'otp', 'pin', 'ಪಾಸ್‌ಕೋಡ್'],
            malayalam: ['പാസ്‌വേഡ്', 'otp', 'pin', 'പാസ്‌കോഡ്'],
            punjabi: ['ਪਾਸਵਰਡ', 'otp', 'pin', 'ਪਾਸਕੋਡ'],
            urdu: ['پاس ورڈ', 'otp', 'pin', 'پاس کوڈ']
        };
        
        const secKw = securityKeywords[language] || securityKeywords.english;
        if (secKw.some(keyword => lowerMessage.includes(keyword))) {
            return this.multilingual.getResponse(language, 'security');
        }
        
        // Classify issue
        const issueType = this.classifyIssue(message, language);
        
        // Check if escalation is needed
        if (this.needsEscalation(message, issueType, userId, language)) {
            this.attemptCount.set(userId, 0);
            const escalationMsg = this.multilingual.getResponse(language, 'escalation');
            this.conversationHistory.get(userId).push({ role: 'user', message });
            this.conversationHistory.get(userId).push({ role: 'assistant', message: escalationMsg });
            return escalationMsg;
        }
        
        // Increment attempt count
        const attempts = this.attemptCount.get(userId) + 1;
        this.attemptCount.set(userId, attempts);
        
        // Generate response
        let response = this.generateResponse(message, issueType, userId, language);
        
        // Handle angry/frustrated users
        const angryKeywords = {
            english: ['angry', 'frustrated', 'upset', 'terrible', 'worst', 'horrible', 'bad service'],
            hindi: ['गुस्सा', 'निराश', 'परेशान', 'भयानक', 'सबसे खराब', 'भयानक', 'खराब सेवा'],
            telugu: ['కోపం', 'నిరాశ', 'చిరాకు', 'భయంకరం', 'చెత్త', 'భయంకరం', 'చెడు సేవ'],
            tamil: ['கோபம்', 'ஏமாற்றம்', 'கவலை', 'பயங்கரமான', 'மோசமான', 'பயங்கரமான', 'மோசமான சேவை'],
            bengali: ['রাগ', 'হতাশ', 'বিরক্ত', 'ভয়ানক', 'সবচেয়ে খারাপ', 'ভয়ানক', 'খারাপ সেবা'],
            gujarati: ['ગુસ્સો', 'નિરાશ', 'પરેશાન', 'ભયાનક', 'સૌથી ખરાબ', 'ભયાનક', 'ખરાબ સેવા'],
            kannada: ['ಕೋಪ', 'ನಿರಾಶೆ', 'ಚಡಪಡಿಸು', 'ಭಯಾನಕ', 'ಕೆಟ್ಟ', 'ಭಯಾನಕ', 'ಕೆಟ್ಟ ಸೇವೆ'],
            malayalam: ['കോപം', 'നിരാശ', 'ക്ഷുഭിത', 'ഭയാനകം', 'മോശം', 'ഭയാനകം', 'മോശം സേവനം'],
            punjabi: ['ਗੁੱਸਾ', 'ਨਿਰਾਸ਼', 'ਪਰੇਸ਼ਾਨ', 'ਭਿਆਨਕ', 'ਸਭ ਤੋਂ ਮਾੜਾ', 'ਭਿਆਨਕ', 'ਮਾੜੀ ਸੇਵਾ'],
            urdu: ['غصہ', 'مایوس', 'پریشان', 'خوفناک', 'بدترین', 'خوفناک', 'خراب سروس']
        };
        
        const angryKw = angryKeywords[language] || angryKeywords.english;
        const isAngry = angryKw.some(keyword => lowerMessage.includes(keyword));
        
        if (isAngry) {
            const apology = this.multilingual.getResponse(language, 'apology');
            response = apology + " " + response;
        }
        
        // Store conversation
        this.conversationHistory.get(userId).push({ role: 'user', message });
        this.conversationHistory.get(userId).push({ role: 'assistant', message: response });
        
        return response;
    }

    // Check if conversation should close
    shouldClose(userId) {
        const history = this.conversationHistory.get(userId) || [];
        const userMessages = history.filter(h => h.role === 'user');
        
        // If user hasn't responded in last 2 assistant messages
        if (history.length >= 2) {
            const lastTwo = history.slice(-2);
            if (lastTwo.every(msg => msg.role === 'assistant')) {
                return true;
            }
        }
        
        return false;
    }

    // Get closing message (multilingual) - uses last detected language
    getClosingMessage(userId) {
        // Get language from last user message
        const history = this.conversationHistory.get(userId) || [];
        const lastUserMessage = history.filter(h => h.role === 'user').pop();
        if (lastUserMessage) {
            const language = this.languageDetector.detectLanguage(lastUserMessage.message);
            return this.multilingual.getResponse(language, 'closing');
        }
        return this.multilingual.getResponse('english', 'closing');
    }

    // Extract order number from message (same logic as TelegramNotifier)
    extractOrderNumber(message) {
        if (!message) return null;
        
        // Specific patterns for order numbers:
        // Deposit: s05 + 19 digits (e.g., s052602010000079447000)
        // Withdrawal: d05 + 19 digits (e.g., d052602010000019998882)
        const patterns = [
            /(s05\d{19})/i,  // Deposit: s05 followed by exactly 19 digits
            /(d05\d{19})/i,  // Withdrawal: d05 followed by exactly 19 digits
            // Fallback patterns for other formats
            /order[:\s#]*(s05\d{19})/i,
            /order[:\s#]*(d05\d{19})/i,
            /order[:\s#]*([A-Z0-9]{6,})/i,
            /txn[:\s#]*([A-Z0-9]{6,})/i,
            /transaction[:\s#]*([A-Z0-9]{6,})/i,
            /ref[:\s#]*([A-Z0-9]{6,})/i,
            /reference[:\s#]*([A-Z0-9]{6,})/i,
            /#([A-Z0-9]{6,})/
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                const orderNum = match[1].trim();
                // Validate format: s05/d05 + 19 digits = 22 characters total
                if ((orderNum.match(/^s05\d{19}$/i) || orderNum.match(/^d05\d{19}$/i))) {
                    return orderNum;
                }
            }
        }

        return null;
    }

    // Check order number in database (deposits and withdrawals)
    checkOrderNumberInDatabase(orderNumber, callback) {
        if (!orderNumber) {
            return callback(null, { found: false, type: null, data: null });
        }

        // Check deposits first
        dbHelpers.getDepositByOrderNumber(orderNumber, (err, deposit) => {
            if (err) {
                console.error('Error checking deposit:', err);
                // Continue to check withdrawals even if deposit check fails
            }
            
            if (deposit) {
                return callback(null, { found: true, type: 'deposit', data: deposit });
            }

            // Check withdrawals
            dbHelpers.getWithdrawalByOrderNumber(orderNumber, (err, withdrawal) => {
                if (err) {
                    console.error('Error checking withdrawal:', err);
                    return callback(null, { found: false, type: null, data: null });
                }

                if (withdrawal) {
                    return callback(null, { found: true, type: 'withdrawal', data: withdrawal });
                }

                // Not found in either
                return callback(null, { found: false, type: null, data: null });
            });
        });
    }

    // Generate response based on order number lookup
    generateOrderNumberResponse(orderData, language) {
        const { found, type, data } = orderData;

        if (!found) {
            const notFoundMessages = {
                english: "I couldn't find any record for that order number in our system. Please double-check the order number and try again, or contact our support team for assistance.",
                hindi: "मुझे हमारे सिस्टम में उस ऑर्डर नंबर के लिए कोई रिकॉर्ड नहीं मिला। कृपया ऑर्डर नंबर को दोबारा जांचें और पुनः प्रयास करें, या सहायता के लिए हमारी सहायता टीम से संपर्क करें।",
                telugu: "నేను మా సిస్టమ్‌లో ఆ ఆర్డర్ నంబర్ కోసం ఏ రికార్డ్ కనుగొనలేదు. దయచేసి ఆర్డర్ నంబర్‌ను రెండుసార్లు తనిఖీ చేయండి మరియు మళ్లీ ప్రయత్నించండి, లేదా సహాయం కోసం మా మద్దతు బృందాన్ని సంప్రదించండి।"
            };
            return notFoundMessages[language] || notFoundMessages.english;
        }

        const amount = data.amount ? `₹${data.amount.toLocaleString()}` : 'N/A';
        const status = data.paymentStatus || 'Pending';
        const date = data.importDate || data.createdAt || 'N/A';
        const vipLevel = data.deliveryType || 'N/A';

        // Determine success status based on payment status
        const isSuccess = status && (
            status.toLowerCase().includes('paid') || 
            status.toLowerCase().includes('已支付') ||
            status.toLowerCase().includes('success') ||
            status.toLowerCase().includes('completed') ||
            status.toLowerCase().includes('审核通过')
        );
        const statusEmoji = isSuccess ? '✅' : '⏳';
        const statusText = isSuccess ? 'SUCCESS' : status.toUpperCase();

        if (type === 'deposit') {
            const depositMessages = {
                english: `${statusEmoji} **DEPOSIT STATUS: ${statusText}**\n\n📋 Order Number: ${data.orderNumber}\n💰 Amount: ${amount}\n⭐ VIP Level: ${vipLevel}\n📊 Payment Status: ${status}\n📅 Payment Date: ${date}\n\n${isSuccess ? '✅ Your deposit transaction is already successful and has been processed in our system!\n\nThank you for reaching out to us. If you have any other questions, feel free to ask!' : '⏳ Your deposit is being processed. Please wait for confirmation.\n\nThank you for reaching out to us!'}`,
                hindi: `${statusEmoji} **जमा स्थिति: ${statusText}**\n\n📋 ऑर्डर नंबर: ${data.orderNumber}\n💰 राशि: ${amount}\n⭐ VIP स्तर: ${vipLevel}\n📊 भुगतान स्थिति: ${status}\n📅 भुगतान तारीख: ${date}\n\n${isSuccess ? '✅ आपका जमा लेनदेन पहले से ही सफल है और हमारे सिस्टम में संसाधित किया गया है!\n\nहमसे संपर्क करने के लिए धन्यवाद। यदि आपके कोई अन्य प्रश्न हैं, तो कृपया पूछें!' : '⏳ आपकी जमा राशि प्रसंस्करण में है। कृपया पुष्टि की प्रतीक्षा करें।\n\nहमसे संपर्क करने के लिए धन्यवाद!'}`,
                telugu: `${statusEmoji} **జమ స్థితి: ${statusText}**\n\n📋 ఆర్డర్ నంబర్: ${data.orderNumber}\n💰 మొత్తం: ${amount}\n⭐ VIP స్థాయి: ${vipLevel}\n📊 చెల్లింపు స్థితి: ${status}\n📅 చెల్లింపు తేదీ: ${date}\n\n${isSuccess ? '✅ మీ జమ లావాదేవీ ఇప్పటికే విజయవంతంగా ఉంది మరియు మా సిస్టమ్‌లో ప్రాసెస్ చేయబడింది!\n\nమాతో సంప్రదించినందుకు ధన్యవాదాలు. మీకు ఇతర ప్రశ్నలు ఉంటే, దయచేసి అడగండి!' : '⏳ మీ జమ ప్రాసెస్ అవుతోంది. దయచేసి నిర్ధారణ కోసం వేచి ఉండండి।\n\nమాతో సంప్రదించినందుకు ధన్యవాదాలు!'}`
            };
            return depositMessages[language] || depositMessages.english;
        } else if (type === 'withdrawal') {
            const withdrawalMessages = {
                english: `${statusEmoji} **WITHDRAWAL STATUS: ${statusText}**\n\n📋 Order Number: ${data.orderNumber}\n💰 Amount: ${amount}\n📊 Payment Status: ${status}\n📅 Payment Date: ${date}\n\n${isSuccess ? '✅ Your withdrawal transaction is already successful and has been processed in our system!\n\nThank you for reaching out to us. If you have any other questions, feel free to ask!' : '⏳ Your withdrawal is being processed. Please wait for confirmation.\n\nThank you for reaching out to us!'}`,
                hindi: `${statusEmoji} **निकासी स्थिति: ${statusText}**\n\n📋 ऑर्डर नंबर: ${data.orderNumber}\n💰 राशि: ${amount}\n📊 भुगतान स्थिति: ${status}\n📅 भुगतान तारीख: ${date}\n\n${isSuccess ? '✅ आपका निकासी लेनदेन पहले से ही सफल है और हमारे सिस्टम में संसाधित किया गया है!\n\nहमसे संपर्क करने के लिए धन्यवाद। यदि आपके कोई अन्य प्रश्न हैं, तो कृपया पूछें!' : '⏳ आपकी निकासी प्रसंस्करण में है। कृपया पुष्टि की प्रतीक्षा करें।\n\nहमसे संपर्क करने के लिए धन्यवाद!'}`,
                telugu: `${statusEmoji} **ఉపసంహరణ స్థితి: ${statusText}**\n\n📋 ఆర్డర్ నంబర్: ${data.orderNumber}\n💰 మొత్తం: ${amount}\n📊 చెల్లింపు స్థితి: ${status}\n📅 చెల్లింపు తేదీ: ${date}\n\n${isSuccess ? '✅ మీ ఉపసంహరణ లావాదేవీ ఇప్పటికే విజయవంతంగా ఉంది మరియు మా సిస్టమ్‌లో ప్రాసెస్ చేయబడింది!\n\nమాతో సంప్రదించినందుకు ధన్యవాదాలు. మీకు ఇతర ప్రశ్నలు ఉంటే, దయచేసి అడగండి!' : '⏳ మీ ఉపసంహరణ ప్రాసెస్ అవుతోంది. దయచేసి నిర్ధారణ కోసం వేచి ఉండండి।\n\nమాతో సంప్రదించినందుకు ధన్యవాదాలు!'}`
            };
            return withdrawalMessages[language] || withdrawalMessages.english;
        }

        return "I found a record, but I'm not sure of the type. Please contact support for more details.";
    }

    // Extract order number from conversation history
    extractOrderNumberFromHistory(userId) {
        const history = this.conversationHistory.get(userId) || [];
        const allMessages = history.map(h => h.message).join(' ');
        
        // Extract from all messages combined
        return this.extractOrderNumber(allMessages);
    }

    // Get all order numbers from conversation history
    getAllOrderNumbersFromHistory(userId) {
        const history = this.conversationHistory.get(userId) || [];
        const orderNumbers = new Set();
        
        history.forEach(entry => {
            if (entry.role === 'user') {
                const orderNumber = this.extractOrderNumber(entry.message);
                if (orderNumber) {
                    orderNumbers.add(orderNumber);
                }
            }
        });
        
        return Array.from(orderNumbers);
    }

    // Handle deposit problem - send notification to Telegram
    async handleDepositProblem(userId, message, orderNumber = null) {
        // If no order number provided, try to extract from conversation history
        if (!orderNumber) {
            orderNumber = this.extractOrderNumberFromHistory(userId);
        }
        
        // Save deposit problem to database (async, no need to wait)
        dbHelpers.recordDepositProblem(userId, orderNumber, message, (err) => {
            if (err) console.error('Error recording deposit problem:', err);
        });
        
        // Also cache in memory for quick access
        this.depositProblems.set(userId, {
            userId,
            message,
            orderNumber,
            timestamp: new Date().toISOString(),
            notified: false
        });
        
        // Send notification to Telegram
        telegramNotifier.sendDepositProblemNotification(userId, message, orderNumber)
            .then(success => {
                if (success) {
                    // Mark as notified in database
                    dbHelpers.markDepositNotified(userId, (err) => {
                        if (err) console.error('Error marking deposit as notified:', err);
                    });
                    const problemData = this.depositProblems.get(userId);
                    if (problemData) {
                        problemData.notified = true;
                        this.depositProblems.set(userId, problemData);
                    }
                }
            })
            .catch(error => {
                console.error('Error in handleDepositProblem:', error);
            });
    }
}

// Initialize agent
const agent = new Yono777SupportAgent();

// Telegram Notification Service
class TelegramNotifier {
    constructor(bot, groupId) {
        this.bot = bot;
        this.groupId = groupId;
    }

    // Extract order number from message
    extractOrderNumber(message) {
        // Common patterns for order numbers
        const patterns = [
            /order[:\s#]*([A-Z0-9]{6,})/i,
            /order[:\s#]*(\d{6,})/i,
            /txn[:\s#]*([A-Z0-9]{6,})/i,
            /transaction[:\s#]*([A-Z0-9]{6,})/i,
            /ref[:\s#]*([A-Z0-9]{6,})/i,
            /reference[:\s#]*([A-Z0-9]{6,})/i,
            /#([A-Z0-9]{6,})/,
            /([A-Z]{2,}\d{4,})/,
            /(\d{8,})/
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }

        return null;
    }

    // Format deposit problem notification
    formatDepositNotification(userId, message, orderNumber, receiptUrl = null) {
        const timestamp = new Date().toLocaleString();
        let notification = `🚨 *DEPOSIT PROBLEM DETECTED*\n\n`;
        notification += `👤 *User ID:* ${userId}\n`;
        notification += `⏰ *Time:* ${timestamp}\n`;
        
        if (orderNumber) {
            notification += `📋 *Order Number:* ${orderNumber}\n`;
        }
        
        notification += `\n💬 *User Message:*\n${message}\n`;
        
        if (receiptUrl) {
            notification += `\n📎 *Receipt:* [View Receipt](${receiptUrl})`;
        }
        
        return notification;
    }

    // Send notification to Telegram group
    async sendDepositProblemNotification(userId, message, orderNumber = null, receiptUrl = null) {
        if (!this.bot || !this.groupId) {
            console.log('Telegram not configured. Notification would be sent:', {
                userId,
                message,
                orderNumber,
                receiptUrl
            });
            return false;
        }

        try {
            const notification = this.formatDepositNotification(userId, message, orderNumber, receiptUrl);
            
            const options = {
                parse_mode: 'Markdown',
                disable_web_page_preview: false
            };

            await this.bot.sendMessage(this.groupId, notification, options);
            console.log('Deposit problem notification sent to Telegram group');
            return true;
        } catch (error) {
            console.error('Error sending Telegram notification:', error.message);
            return false;
        }
    }

    // Send receipt image to Telegram group
    async sendReceiptImage(userId, orderNumber, imageBuffer, caption = '') {
        if (!this.bot || !this.groupId) {
            console.log('Telegram not configured. Receipt would be sent');
            return false;
        }

        try {
            const fullCaption = `📎 *Receipt for Order:* ${orderNumber}\n${caption}`;
            
            await this.bot.sendPhoto(this.groupId, imageBuffer, {
                caption: fullCaption,
                parse_mode: 'Markdown'
            });
            
            console.log('Receipt image sent to Telegram group');
            return true;
        } catch (error) {
            console.error('Error sending receipt image:', error.message);
            return false;
        }
    }

    // Send video to Telegram group
    async sendVideo(userId, videoBuffer, caption = '', filename = 'video.mp4') {
        if (!this.bot || !this.groupId) {
            console.log('Telegram not configured. Video would be sent');
            return false;
        }

        try {
            await this.bot.sendVideo(this.groupId, videoBuffer, {
                caption: caption,
                parse_mode: 'Markdown'
            });
            
            console.log('Video sent to Telegram group');
            return true;
        } catch (error) {
            console.error('Error sending video:', error.message);
            return false;
        }
    }

    // Send document/file to Telegram group
    async sendDocument(userId, fileBuffer, caption = '', filename = 'file') {
        if (!this.bot || !this.groupId) {
            console.log('Telegram not configured. Document would be sent');
            return false;
        }

        try {
            await this.bot.sendDocument(this.groupId, fileBuffer, {
                caption: caption,
                parse_mode: 'Markdown',
                filename: filename
            });
            
            console.log('Document sent to Telegram group');
            return true;
        } catch (error) {
            console.error('Error sending document:', error.message);
            return false;
        }
    }
}

// Initialize Telegram Notifier
const telegramNotifier = new TelegramNotifier(telegramBot, TELEGRAM_GROUP_ID);

// API Routes
app.post('/api/chat', async (req, res) => {
    try {
        const { message, userId } = req.body;
        
        if (!message || !userId) {
            return res.status(400).json({ error: 'Message and userId are required' });
        }
        
        // Check for order number first
        const orderNumber = agent.extractOrderNumber(message);
        let response;
        
        if (orderNumber) {
            // Check database for order number
            await new Promise((resolve) => {
                agent.checkOrderNumberInDatabase(orderNumber, (err, orderData) => {
                    if (err) {
                        console.error('Error checking order number:', err);
                        // Continue with normal response
                        response = agent.handleMessage(message, userId);
                        resolve();
                    } else if (orderData.found) {
                        // Found order number in database - skip Telegram notifications
                        console.log(`[API] Order ${orderNumber} found in ${orderData.type} database - skipping Telegram notification`);
                        const language = agent.languageDetector.detectLanguage(message);
                        response = agent.generateOrderNumberResponse(orderData, language);
                        
                        // Store conversation
                        if (!agent.conversationHistory.has(userId)) {
                            agent.conversationHistory.set(userId, []);
                        }
                        agent.conversationHistory.get(userId).push({ role: 'user', message });
                        agent.conversationHistory.get(userId).push({ role: 'assistant', message: response });
                        
                        // Classify issue for storage
                        const category = agent.classifyIssue(message, language);
                        
                        // Save conversation to database
                        dbHelpers.addConversation(userId, message, response, category, (err) => {
                            if (err) console.error('Error saving conversation:', err);
                        });
                        
                        resolve();
                    } else {
                        // Order number not found, continue with normal response
                        response = agent.handleMessage(message, userId);
                        
                        // Save conversation for order number not found case
                        const language = agent.languageDetector.detectLanguage(message);
                        const category = agent.classifyIssue(message, language);
                        dbHelpers.addConversation(userId, message, response, category, (err) => {
                            if (err) console.error('Error saving conversation:', err);
                        });
                        
                        resolve();
                    }
                });
            });
        } else {
            // No order number found, use normal response
            response = agent.handleMessage(message, userId);
            
            // Save conversation
            const language = agent.languageDetector.detectLanguage(message);
            const category = agent.classifyIssue(message, language);
            dbHelpers.addConversation(userId, message, response, category, (err) => {
                if (err) console.error('Error saving conversation:', err);
            });
        }
        
        // Get or create user in database
        const language = agent.languageDetector.detectLanguage(message);
        dbHelpers.getOrCreateUser(userId, language, (err, user) => {
            if (err) console.error('Error getting user:', err);
        });
        
        // Calculate typing delay based on response length (simulate human typing)
        // Average typing speed: ~200 words per minute = ~3.3 words per second
        // Add minimum delay of 1.5 seconds and maximum of 5 seconds
        const wordCount = response.split(/\s+/).length;
        const baseDelay = 1500; // Minimum 1.5 seconds
        const typingDelay = Math.min(wordCount * 300, 5000); // ~300ms per word, max 5 seconds
        const totalDelay = baseDelay + typingDelay;
        
        // Wait before sending response to simulate human typing
        await new Promise(resolve => setTimeout(resolve, totalDelay));
        
        res.json({
            response,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error handling chat:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get conversation history endpoint
app.get('/api/history/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        dbHelpers.getConversationHistory(userId, 50, (err, history) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch history' });
            }
            
            res.json({
                userId,
                history: history || [],
                total: history ? history.length : 0
            });
        });
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get deposit problem status
app.get('/api/deposit-problem/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        dbHelpers.getDepositProblem(userId, (err, problem) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch problem' });
            }
            
            res.json({
                userId,
                problem: problem || null
            });
        });
    } catch (error) {
        console.error('Error fetching deposit problem:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to upload receipt
app.post('/api/upload-receipt', upload.single('receipt'), async (req, res) => {
    try {
        const { userId, orderNumber } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        
        // Extract order number from multiple sources (priority order):
        // 1. Explicitly provided in request body
        // 2. From deposit problems cache
        // 3. From conversation history (scan all messages)
        let extractedOrderNumber = orderNumber;
        
        if (!extractedOrderNumber && agent.depositProblems && agent.depositProblems.has(userId)) {
            extractedOrderNumber = agent.depositProblems.get(userId).orderNumber;
        }
        
        if (!extractedOrderNumber) {
            // Extract from conversation history
            extractedOrderNumber = agent.extractOrderNumberFromHistory(userId);
        }
        
        // Get all order numbers from history for context
        const allOrderNumbers = agent.getAllOrderNumbersFromHistory(userId);
        
        // Build caption with order number and conversation context
        let caption = `👤 *User ID:* ${userId}\n⏰ *Timestamp:* ${new Date().toLocaleString()}`;
        
        if (extractedOrderNumber) {
            caption += `\n📋 *Order Number:* ${extractedOrderNumber}`;
        }
        
        if (allOrderNumbers.length > 1) {
            caption += `\n📋 *All Order Numbers Found:* ${allOrderNumbers.join(', ')}`;
        }
        
        // Get recent conversation context (last 3 user messages)
        const history = agent.conversationHistory.get(userId) || [];
        const recentUserMessages = history
            .filter(h => h.role === 'user')
            .slice(-3)
            .map(h => h.message);
        
        if (recentUserMessages.length > 0) {
            caption += `\n\n💬 *Recent Messages:*\n${recentUserMessages.map((msg, idx) => `${idx + 1}. ${msg.substring(0, 100)}${msg.length > 100 ? '...' : ''}`).join('\n')}`;
        }
        
        // Send receipt to Telegram
        const success = await telegramNotifier.sendReceiptImage(
            userId,
            extractedOrderNumber || 'N/A',
            req.file.buffer,
            caption
        );
        
        if (success) {
            res.json({
                success: true,
                message: 'Receipt uploaded and sent to support team',
                orderNumber: extractedOrderNumber,
                allOrderNumbers: allOrderNumbers
            });
        } else {
            res.status(500).json({ error: 'Failed to send receipt' });
        }
    } catch (error) {
        console.error('Error uploading receipt:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint: List all users
app.get('/api/users', (req, res) => {
    try {
        dbHelpers.getAllUsers((err, users) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch users' });
            }
            
            res.json({
                totalUsers: users.length,
                users: users
            });
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint: Get statistics
app.get('/api/statistics', (req, res) => {
    try {
        dbHelpers.getComprehensiveStats((err, stats) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch statistics' });
            }
            
            res.json({
                timestamp: new Date().toISOString(),
                statistics: stats
            });
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint: Get messages by category
app.get('/api/statistics/categories', (req, res) => {
    try {
        dbHelpers.getMessagesByCategory((err, categories) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch categories' });
            }
            
            res.json({
                categories: categories
            });
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint: Get messages by user
app.get('/api/statistics/users', (req, res) => {
    try {
        dbHelpers.getMessagesByUser((err, users) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch user stats' });
            }
            
            res.json({
                userStats: users
            });
        });
    } catch (error) {
        console.error('Error fetching user stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint: Get open deposit problems
app.get('/api/problems/open', (req, res) => {
    try {
        dbHelpers.getOpenDepositProblems((err, problems) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch problems' });
            }
            
            res.json({
                totalOpenProblems: problems.length,
                problems: problems
            });
        });
    } catch (error) {
        console.error('Error fetching problems:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get deposit problem status
app.get('/api/deposit-problem/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        
        if (agent.depositProblems && agent.depositProblems.has(userId)) {
            const problem = agent.depositProblems.get(userId);
            res.json({
                exists: true,
                orderNumber: problem.orderNumber,
                timestamp: problem.timestamp,
                notified: problem.notified
            });
        } else {
            res.json({ exists: false });
        }
    } catch (error) {
        console.error('Error getting deposit problem:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to upload UID files
app.post('/api/upload-uid-files', upload.array('files', 10), async (req, res) => {
    try {
        const { userId, uid, concern } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files provided' });
        }
        
        // Extract order number from conversation history
        const extractedOrderNumber = agent.extractOrderNumberFromHistory(userId);
        const allOrderNumbers = agent.getAllOrderNumbersFromHistory(userId);
        
        // Get recent conversation context
        const history = agent.conversationHistory.get(userId) || [];
        const recentUserMessages = history
            .filter(h => h.role === 'user')
            .slice(-3)
            .map(h => h.message);
        
        // Send files to Telegram group
        let successCount = 0;
        const fileInfo = [];
        
        for (const file of req.files) {
            try {
                const fileType = file.mimetype;
                const isImage = fileType.startsWith('image/');
                const isVideo = fileType.startsWith('video/');
                
                // Build caption with order number and context
                let caption = `👤 *User ID:* ${userId}\n📋 *UID:* ${uid || 'Not provided'}\n📝 *Concern:* ${concern || 'N/A'}\n📄 *File:* ${file.originalname}\n⏰ *Time:* ${new Date().toLocaleString()}`;
                
                if (extractedOrderNumber) {
                    caption += `\n📋 *Order Number:* ${extractedOrderNumber}`;
                }
                
                if (allOrderNumbers.length > 1) {
                    caption += `\n📋 *All Order Numbers Found:* ${allOrderNumbers.join(', ')}`;
                }
                
                if (recentUserMessages.length > 0) {
                    caption += `\n\n💬 *Recent Messages:*\n${recentUserMessages.map((msg, idx) => `${idx + 1}. ${msg.substring(0, 100)}${msg.length > 100 ? '...' : ''}`).join('\n')}`;
                }
                
                let telegramSuccess = false;
                
                if (isImage) {
                    telegramSuccess = await telegramNotifier.sendReceiptImage(
                        userId,
                        extractedOrderNumber || uid || 'N/A',
                        file.buffer,
                        caption
                    );
                } else if (isVideo) {
                    telegramSuccess = await telegramNotifier.sendVideo(
                        userId,
                        file.buffer,
                        caption
                    );
                } else {
                    telegramSuccess = await telegramNotifier.sendDocument(
                        userId,
                        file.buffer,
                        caption,
                        file.originalname
                    );
                }
                
                if (telegramSuccess) {
                    successCount++;
                    fileInfo.push({
                        name: file.originalname,
                        size: file.size,
                        type: fileType,
                        uploaded: true
                    });
                } else {
                    fileInfo.push({
                        name: file.originalname,
                        size: file.size,
                        type: fileType,
                        uploaded: false,
                        error: 'Telegram not configured'
                    });
                }
            } catch (error) {
                console.error(`Error uploading file ${file.originalname}:`, error);
                fileInfo.push({
                    name: file.originalname,
                    size: file.size,
                    type: file.mimetype,
                    uploaded: false,
                    error: error.message
                });
            }
        }
        
        // Send summary notification
        if (successCount > 0 && telegramBot && TELEGRAM_GROUP_ID) {
            const summary = `📎 *Files Uploaded*\n\n👤 *User ID:* ${userId}\n📋 *UID:* ${uid || 'Not provided'}\n📝 *Concern:* ${concern || 'N/A'}\n✅ *Files:* ${successCount}/${req.files.length} uploaded successfully`;
            await telegramBot.sendMessage(TELEGRAM_GROUP_ID, summary, { parse_mode: 'Markdown' });
        }
        
        res.json({
            success: successCount > 0,
            message: `${successCount} file(s) uploaded successfully`,
            files: fileInfo,
            total: req.files.length,
            uploaded: successCount
        });
    } catch (error) {
        console.error('Error uploading UID files:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve main page
app.get('/', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'index.html');
    const fs = require('fs');
    
    // Try to serve from file first
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath, (err) => {
            if (err) {
                console.error('Error serving index.html:', err);
                res.status(500).json({ error: 'Could not serve index.html', details: err.message });
            }
        });
    }
    
    // Fallback: serve inline HTML
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Yono777 Customer Support</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            padding: 40px;
            max-width: 500px;
            width: 100%;
        }
        
        h1 {
            color: #333;
            margin-bottom: 10px;
            text-align: center;
        }
        
        .subtitle {
            color: #666;
            text-align: center;
            margin-bottom: 30px;
            font-size: 14px;
        }
        
        .nav-menu {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        
        .nav-item {
            display: block;
            padding: 15px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 5px;
            text-align: center;
            font-weight: 500;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .nav-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        
        .status {
            margin-top: 30px;
            padding: 15px;
            background: #f0f0f0;
            border-radius: 5px;
            text-align: center;
            font-size: 12px;
            color: #666;
        }
        
        .status.online {
            background: #e8f5e9;
            color: #2e7d32;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎮 Yono777</h1>
        <p class="subtitle">AI Customer Support System</p>
        
        <div class="nav-menu">
            <a href="/chat" class="nav-item">💬 Chat with Support</a>
            <a href="/deposits" class="nav-item">💰 Manage Deposits</a>
            <a href="/withdrawals" class="nav-item">🏦 Manage Withdrawals</a>
            <a href="/admin" class="nav-item">📊 Admin Dashboard</a>
        </div>
        
        <div class="status online">
            ✓ Service Status: Online
        </div>
    </div>
</body>
</html>`);
});

// Serve deposits page
app.get('/deposits', (req, res) => {
    const fs = require('fs');
    const filePath = path.join(__dirname, 'public', 'deposits.html');
    
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath, (err) => {
            if (err) console.error('Error serving deposits.html:', err);
        });
    }
    
    // Fallback
    res.setHeader('Content-Type', 'text/html');
    res.send('<h1>💰 Deposits</h1><p><a href="/">Back to Home</a></p><p>Deposits page not yet loaded. Please try again shortly.</p>');
});

// Serve chat page
app.get('/chat', (req, res) => {
    const fs = require('fs');
    const filePath = path.join(__dirname, 'public', 'chat.html');
    
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath, (err) => {
            if (err) console.error('Error serving chat.html:', err);
        });
    }
    
    // Fallback
    res.setHeader('Content-Type', 'text/html');
    res.send('<h1>💬 Chat Support</h1><p><a href="/">Back to Home</a></p><p>Chat page not yet loaded. Please try again shortly.</p>');
});

// Serve admin page
app.get('/admin', (req, res) => {
    const fs = require('fs');
    const filePath = path.join(__dirname, 'public', 'admin.html');
    
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath, (err) => {
            if (err) console.error('Error serving admin.html:', err);
        });
    }
    
    // Fallback
    res.setHeader('Content-Type', 'text/html');
    res.send('<h1>📊 Admin Dashboard</h1><p><a href="/">Back to Home</a></p><p>Admin page not yet loaded. Please try again shortly.</p>');
});

// Serve withdrawals page
app.get('/withdrawals', (req, res) => {
    const fs = require('fs');
    const filePath = path.join(__dirname, 'public', 'withdrawals.html');
    
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath, (err) => {
            if (err) console.error('Error serving withdrawals.html:', err);
        });
    }
    
    // Fallback
    res.setHeader('Content-Type', 'text/html');
    res.send('<h1>🏦 Withdrawals</h1><p><a href="/">Back to Home</a></p><p>Withdrawals page not yet loaded. Please try again shortly.</p>');
});

// Import deposits from Excel file
app.post('/api/import', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                error: 'No file provided',
                message: 'Please upload an Excel file (XLSX, XLS, CSV)' 
            });
        }

        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;

        // Parse Excel file
        let workbook;
        try {
            workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        } catch (parseError) {
            return res.status(400).json({ 
                error: 'Invalid file format',
                message: 'Could not parse file. Make sure it\'s a valid Excel file (XLSX, XLS, CSV)'
            });
        }

        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return res.status(400).json({ error: 'No sheets found in file' });
        }

        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        if (data.length === 0) {
            return res.status(400).json({ 
                error: 'No data found',
                message: 'The Excel file appears to be empty' 
            });
        }

        // Map Excel columns to database fields
        // Deposit file format:
        // 订单号 (Order Number), 支付VIP等级 (Payment VIP Level), 金额 (Amount),
        // 支付时间 (Payment Time), 支付状态 (Payment Status), 第三方手续费 (Third-Party Handling Fee - not stored)
        const deposits = data.map(row => {
            // Parse 支付时间 (Payment Time) - format: "2026-02-01 00:00:30"
            // Extract just the date part for importDate
            const paymentTime = row['支付时间'] || row['支付时间'] || '';
            let importDate = null;
            if (paymentTime) {
                const datePart = paymentTime.toString().split(' ')[0];
                if (datePart) {
                    importDate = datePart;
                }
            }
            
            return {
                orderNumber: row['订单号'] || row['orderNumber'] || row['Order Number'],
                deliveryType: row['支付VIP等级'] || row['交付VII'] || row['deliveryType'] || row['Delivery Type'] || null,
                amount: parseFloat(row['金额'] || row['amount'] || row['Amount']) || null,
                paymentStatus: row['支付状态'] || row['paymentStatus'] || row['Payment Status'] || row['交付状态'] || null,
                importDate: importDate || row['日期'] || row['date'] || row['Date'] || null
            };
        });

        // Import deposits to database (log and time)
        console.log(`[API] Starting import of ${deposits.length} rows from ${fileName}`);
        
        // Estimate time: approximately 2-5ms per record
        const estimatedTimeMs = Math.max(100, deposits.length * 3);
        const estimatedTimeSec = (estimatedTimeMs / 1000).toFixed(1);
        
        const apiImportStart = Date.now();
        dbHelpers.importDeposits(deposits, (err, result) => {
            const duration = Date.now() - apiImportStart;
            if (err) {
                console.error('Import error:', err);
                return res.status(500).json({ 
                    error: 'Database error',
                    message: err.message 
                });
            }

            console.log(`[API] Import completed: ${result.successCount} imported, ${result.duplicateCount || 0} duplicates skipped, ${result.errorCount} errors, duration: ${duration}ms`);
            res.json({
                success: true,
                message: `Import completed: ${result.successCount} records imported, ${result.duplicateCount || 0} duplicates skipped, ${result.errorCount} errors, time: ${(duration / 1000).toFixed(2)}s`,
                estimatedTime: `${estimatedTimeSec}s`,
                actualTime: `${(duration / 1000).toFixed(2)}s`,
                result: {
                    totalRecords: result.total,
                    importedRecords: result.successCount,
                    duplicateRecords: result.duplicateCount || 0,
                    failedRecords: result.errorCount,
                    errors: result.errors.slice(0, 10),
                    durationMs: duration
                }
            });
        });

    } catch (error) {
        console.error('Import endpoint error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: error.message 
        });
    }
});

// Get all imported deposits
app.get('/api/deposits', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    dbHelpers.getDepositsPaged(limit, offset, (err, deposits) => {
        if (err) {
            console.error('Error fetching deposits (paged):', err);
            return res.status(500).json({ error: 'Failed to fetch deposits' });
        }

        res.json({
            success: true,
            page,
            limit,
            count: deposits.length,
            deposits
        });
    });
});

// Get deposit by order number
app.get('/api/deposits/:orderNumber', (req, res) => {
    const { orderNumber } = req.params;

    dbHelpers.getDepositByOrderNumber(orderNumber, (err, deposit) => {
        if (err) {
            console.error('Error fetching deposit:', err);
            return res.status(500).json({ error: 'Failed to fetch deposit' });
        }

        if (!deposit) {
            return res.status(404).json({ error: 'Deposit not found' });
        }

        res.json({
            success: true,
            deposit: deposit
        });
    });
});

// Import withdrawals from Excel file
app.post('/api/import-withdrawal', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                error: 'No file provided',
                message: 'Please upload an Excel file (XLSX, XLS, CSV)' 
            });
        }

        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;

        // Parse Excel file
        let workbook;
        try {
            workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        } catch (parseError) {
            return res.status(400).json({ 
                error: 'Invalid file format',
                message: 'Could not parse file. Make sure it\'s a valid Excel file (XLSX, XLS, CSV)'
            });
        }

        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return res.status(400).json({ error: 'No sheets found in file' });
        }

        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        if (data.length === 0) {
            return res.status(400).json({ 
                error: 'No data found',
                message: 'The Excel file appears to be empty' 
            });
        }

        // Map Excel columns to database fields
        // Withdrawal file format:
        // 订单号 (Order Number), 会员UID (Member UID - not stored), 
        // 支付VIP等到账金额 (Payment VIP to account amount - format: "4 1000.00"),
        // 回调时间 (Callback Time), 状态 (Status)
        const withdrawals = data.map(row => {
            // Parse 支付VIP等到账金额 (Payment VIP to account amount) - format: "4 1000.00"
            // First number is deliveryType, second is amount
            const paymentAmount = row['支付VIP等到账金额'] || row['支付VIP等到账金额'] || '';
            let deliveryType = null;
            let amount = null;
            
            if (paymentAmount) {
                const parts = paymentAmount.toString().trim().split(/\s+/);
                if (parts.length >= 2) {
                    deliveryType = parts[0];
                    amount = parseFloat(parts[1]) || null;
                } else if (parts.length === 1) {
                    // If only one part, try to parse as amount
                    amount = parseFloat(parts[0]) || null;
                }
            }
            
            return {
                orderNumber: row['订单号'] || row['orderNumber'] || row['Order Number'],
                deliveryType: deliveryType || row['交付VII'] || row['deliveryType'] || row['Delivery Type'] || null,
                amount: amount || parseFloat(row['金额'] || row['amount'] || row['Amount']) || null,
                paymentStatus: row['状态'] || row['paymentStatus'] || row['Payment Status'] || row['交付状态'] || null,
                importDate: row['回调时间'] || row['date'] || row['Date'] || row['日期'] || null
            };
        });

        // Import withdrawals to database (log and time)
        console.log(`[API] Starting withdrawal import of ${withdrawals.length} rows from ${fileName}`);
        
        // Estimate time: approximately 2-5ms per record
        const estimatedTimeMs = Math.max(100, withdrawals.length * 3);
        const estimatedTimeSec = (estimatedTimeMs / 1000).toFixed(1);
        
        const apiImportStart = Date.now();
        dbHelpers.importWithdrawals(withdrawals, (err, result) => {
            const duration = Date.now() - apiImportStart;
            if (err) {
                console.error('Withdrawal import error:', err);
                return res.status(500).json({ 
                    error: 'Database error',
                    message: err.message 
                });
            }

            console.log(`[API] Withdrawal import completed: ${result.successCount} imported, ${result.duplicateCount || 0} duplicates skipped, ${result.errorCount} errors, duration: ${duration}ms`);
            res.json({
                success: true,
                message: `Withdrawal import completed: ${result.successCount} records imported, ${result.duplicateCount || 0} duplicates skipped, ${result.errorCount} errors, time: ${(duration / 1000).toFixed(2)}s`,
                estimatedTime: `${estimatedTimeSec}s`,
                actualTime: `${(duration / 1000).toFixed(2)}s`,
                result: {
                    totalRecords: result.total,
                    importedRecords: result.successCount,
                    duplicateRecords: result.duplicateCount || 0,
                    failedRecords: result.errorCount,
                    errors: result.errors.slice(0, 10),
                    durationMs: duration
                }
            });
        });

    } catch (error) {
        console.error('Withdrawal import endpoint error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: error.message 
        });
    }
});

// Get all imported withdrawals
app.get('/api/withdrawals', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    dbHelpers.getWithdrawalsPaged(limit, offset, (err, withdrawals) => {
        if (err) {
            console.error('Error fetching withdrawals (paged):', err);
            return res.status(500).json({ error: 'Failed to fetch withdrawals' });
        }

        res.json({
            success: true,
            page,
            limit,
            count: withdrawals.length,
            withdrawals
        });
    });
});

// Get withdrawal by order number
app.get('/api/withdrawals/:orderNumber', (req, res) => {
    const { orderNumber } = req.params;

    dbHelpers.getWithdrawalByOrderNumber(orderNumber, (err, withdrawal) => {
        if (err) {
            console.error('Error fetching withdrawal:', err);
            return res.status(500).json({ error: 'Failed to fetch withdrawal' });
        }

        if (!withdrawal) {
            return res.status(404).json({ error: 'Withdrawal not found' });
        }

        res.json({
            success: true,
            withdrawal: withdrawal
        });
    });
});

// Start server
app.listen(PORT, () => {
    const publicPath = path.join(__dirname, 'public');
    const fs = require('fs');
    const publicExists = fs.existsSync(publicPath);
    console.log(`Yono777 Customer Support Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
    console.log(`Public directory: ${publicPath} (${publicExists ? 'EXISTS' : 'NOT FOUND'})`);
    if (publicExists) {
        console.log(`Files: ${fs.readdirSync(publicPath).join(', ')}`);
    }
});


