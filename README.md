# Yono777 AI Customer Support System

A professional AI customer support chatbot for Yono777 gaming platform.

## Features

- 24/7 customer service
- Intelligent issue classification
- Professional and polite responses
- Escalation handling
- Support for deposits, withdrawals, accounts, bonuses, and more

## Installation

```bash
npm install
```

## Running the Application

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Usage

1. Start the server (default port: 3000)
2. Open `index.html` in your browser or serve it through the Express server
3. Start chatting with the AI support agent

## API Endpoints

- `POST /api/chat` - Send a message to the AI agent
- `GET /` - Serve the chat interface

## Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_GROUP_ID=your_telegram_group_chat_id_here
PORT=3000
```

### Setting up Telegram Bot

1. Create a Telegram bot by messaging [@BotFather](https://t.me/botfather) on Telegram
2. Use `/newbot` command and follow instructions
3. Copy the bot token and add it to `.env` as `TELEGRAM_BOT_TOKEN`
4. Create a Telegram group for notifications
5. Add your bot to the group
6. Get the group chat ID (you can use [@userinfobot](https://t.me/userinfobot) or send a message and check the bot API)
7. Add the group chat ID to `.env` as `TELEGRAM_GROUP_ID`

### Features

- **Deposit Problem Detection**: Automatically detects deposit issues from user messages
- **Order Number Extraction**: Extracts order numbers from user messages
- **Telegram Notifications**: Sends push notifications to Telegram group when deposit problems are detected
- **Receipt Upload**: API endpoint to upload and send receipt images to Telegram group

### API Endpoints

- `POST /api/chat` - Send a message to the AI agent
- `POST /api/upload-receipt` - Upload receipt image (query params: `userId`, `orderNumber`)
- `GET /api/deposit-problem/:userId` - Get deposit problem status for a user
- `GET /` - Serve the chat interface

