# Yono777 Customer Support Bot - Simple Summary

## 🤖 What is this bot?

An AI-powered customer support chatbot for Yono777 gaming platform that helps users 24/7 with their questions and issues.

---

## ✨ Main Features

### 1. **Smart Chat Support**
- Answers customer questions in multiple languages (English, Hindi, Telugu, and more)
- Handles common issues: deposits, withdrawals, bonuses, account problems, games, banking
- Professional and polite responses
- Typing indicator for natural conversation

### 2. **Order Number Detection**
- Automatically detects order numbers from user messages (e.g., `s05`+19 digits, `d05`+19 digits)
- Checks database for matching deposits or withdrawals
- If found: Replies directly with transaction status (no Telegram notification)
- If not found: Proceeds with normal AI response

### 3. **Transaction Management**
- **Deposits**: Import Excel files via `/importSuccessDeposit` command or web UI
- **Withdrawals**: Import Excel files via `/importSuccessWithdrawal` command or web UI
- View all transactions in beautiful web interface
- Search, filter, and paginate through records

### 4. **Web Interface**
- **Chat Interface** (`/`): Main customer support chat
- **Deposits Page** (`/deposits`): View and manage deposits
- **Withdrawals Page** (`/withdrawals`): View and manage withdrawals
- **All Transactions** (`/all-transactions`): Combined view with statistics

### 5. **Telegram Integration**
- Sends notifications to Telegram group for important issues
- Import Excel files directly via Telegram bot commands
- Receives updates and alerts

---

## 🎯 How It Works

1. **User sends message** → Bot receives it
2. **Bot checks for order number** → If found, looks up in database
3. **If order found** → Replies with transaction status directly
4. **If no order** → AI processes message and responds intelligently
5. **Conversation saved** → All chats stored in database

---

## 📊 Database Features

- **Users**: Stores user preferences and language settings
- **Conversations**: Complete chat history
- **Deposits**: All deposit records with VIP levels, amounts, status
- **Withdrawals**: All withdrawal records with delivery types, amounts, status
- **Duplicate Prevention**: Skips duplicate records during import

---

## 🚀 Quick Start

1. **Install**: `npm install`
2. **Configure**: Add Telegram bot token and group ID to `.env`
3. **Run**: `npm start`
4. **Access**: Open `http://localhost:3000` in browser

---

## 📱 Telegram Commands

- `/start` - Welcome message
- `/help` - Show all commands
- `/importSuccessDeposit` - Import deposit Excel file
- `/importSuccessWithdrawal` - Import withdrawal Excel file

---

## 🌐 Web Pages

- `/` - Main chat interface
- `/deposits` - Deposits management
- `/withdrawals` - Withdrawals management
- `/all-transactions` - All transactions dashboard

---

## 💡 Key Capabilities

✅ Multi-language support  
✅ Order number auto-detection  
✅ Database lookup for transactions  
✅ Excel file import (deposits & withdrawals)  
✅ Real-time chat with typing indicator  
✅ Transaction filtering and search  
✅ Statistics dashboard  
✅ Telegram notifications  
✅ Duplicate record handling  

---

## 🔧 Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite3
- **AI**: Custom support agent
- **Frontend**: HTML, CSS, JavaScript
- **Telegram**: node-telegram-bot-api
- **File Processing**: XLSX (Excel files)

---

## 📝 Notes

- Bot automatically detects order numbers and checks database
- If transaction found → Direct reply (no Telegram notification)
- If transaction not found → Normal AI response + optional Telegram notification
- All conversations are saved for history
- Excel imports skip duplicates automatically

---

**Version**: 1.0.0  
**Status**: ✅ Production Ready

