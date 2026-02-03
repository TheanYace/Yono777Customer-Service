# Yono777 Bot - Quick Summary

## What it does:
AI customer support bot that helps users with deposits, withdrawals, and account issues 24/7.

## Key Features:
- 🤖 Smart chat support (multi-language)
- 🔍 Auto-detects order numbers and checks database
- 💰 Manages deposits & withdrawals
- 📊 Web dashboard for viewing transactions
- 📱 Telegram integration for notifications
- 📁 Excel file import for bulk data

## How it works:
1. User sends message → Bot checks for order number
2. If order found → Replies with transaction status
3. If not found → AI responds normally
4. All conversations saved to database

## Access:
- Chat: `http://localhost:3000`
- Deposits: `http://localhost:3000/deposits`
- Withdrawals: `http://localhost:3000/withdrawals`
- All: `http://localhost:3000/all-transactions`

## Commands:
- `/importSuccessDeposit` - Import deposits
- `/importSuccessWithdrawal` - Import withdrawals

