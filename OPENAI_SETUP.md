# OpenAI Assistant Integration Setup Guide

## Overview

The system now supports OpenAI Assistant API for generating intelligent responses that follow all the deposit concern handling logic. The assistant uses the comprehensive system instruction document to handle all scenarios correctly.

## Features

✅ **OpenAI Assistant Integration**
- Uses OpenAI Assistant API (not chat completions)
- Follows all system logic from `openai_system_instruction.md`
- Automatic database checking via function calling
- Multilingual support (10+ languages)
- Conversation thread management per user

✅ **Fallback System**
- If OpenAI is not configured or fails, automatically falls back to template-based responses
- Ensures system always works even without OpenAI

✅ **Function Calling**
- Assistant can call `check_order_number` function to query the database
- Automatic order number validation and status checking

## Setup Instructions

### 1. Install OpenAI Package

```bash
npm install openai
```

### 2. Configure Environment Variables

Add these to your `.env` file:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
USE_OPENAI=true

# Optional: Use existing assistant (recommended after first run)
OPENAI_ASSISTANT_ID=asst_xxxxxxxxxxxxx

# Optional: Choose model (default: gpt-4-turbo-preview)
OPENAI_MODEL=gpt-4-turbo-preview
```

### 3. First Run

When you first start the server:

1. The system will automatically create a new OpenAI Assistant
2. It will read `openai_system_instruction.md` and use it as the system instructions
3. The assistant ID will be logged to console
4. **Save this assistant ID** to `OPENAI_ASSISTANT_ID` in `.env` for future use

Example console output:
```
✅ OpenAI client initialized
✅ Created new OpenAI Assistant: asst_abc123xyz
💡 Save this ID to OPENAI_ASSISTANT_ID in .env for future use
```

### 4. Using Existing Assistant

If you already have an assistant ID:

1. Add `OPENAI_ASSISTANT_ID=asst_xxxxxxxxxxxxx` to `.env`
2. The system will use the existing assistant instead of creating a new one
3. This is faster and avoids creating duplicate assistants

## How It Works

### 1. Assistant Initialization

- On server start, the system reads `openai_system_instruction.md`
- Creates or retrieves an OpenAI Assistant with these instructions
- Sets up function calling for database access

### 2. Conversation Flow

1. **User sends message** → System detects language and issue type
2. **Database check** → System checks order number in database (if provided)
3. **Context building** → System builds context with all available information:
   - Order number and database results
   - Receipt status and age
   - File uploads
   - Conversation history
4. **OpenAI Assistant** → Sends context to assistant, which:
   - Follows the 5-step deposit flow logic
   - Uses appropriate response templates
   - Responds in the customer's language
   - Never mentions AI or database checks
5. **Response enforcement** → System enforces exact responses for critical scenarios
6. **Fallback** → If OpenAI fails, uses template-based responses

### 3. Thread Management

- Each user gets a unique conversation thread
- Threads persist across messages for context continuity
- Threads are stored in memory (can be extended to database if needed)

## System Instruction Document

The assistant follows the comprehensive instructions in `openai_system_instruction.md`, which includes:

- ✅ All 5 steps of deposit concern handling
- ✅ Exact response templates for all scenarios
- ✅ Multilingual support (10 languages)
- ✅ Database access rules
- ✅ Forbidden phrases (never mention AI or database checks)
- ✅ Context awareness and sentiment handling

## Function Calling

The assistant has access to a `check_order_number` function that:

- Checks order numbers in the deposits database
- Returns: `found` (true/false), `amount`, `status`
- Called automatically when assistant needs to verify an order

## Response Enforcement

For critical scenarios, the system enforces exact responses:

- **Order Not Found**: Always uses exact phrase: "The order number is currently on pending status. Can you provide me a deposit receipt for deep and better checking on it?"

This ensures consistency even if the assistant tries to vary the response.

## Troubleshooting

### Assistant Not Initializing

**Check:**
1. `OPENAI_API_KEY` is set correctly
2. `USE_OPENAI=true` is set
3. OpenAI package is installed: `npm install openai`
4. API key has access to Assistant API (requires paid OpenAI account)

**Fallback:** System will automatically use template-based responses

### Assistant Not Responding Correctly

**Check:**
1. System instruction file exists: `openai_system_instruction.md`
2. Assistant ID is correct (if using existing assistant)
3. Check console logs for errors

**Solution:** The system enforces exact responses for critical scenarios, so even if assistant varies, the correct response will be used.

### Thread Creation Errors

**Check:**
1. OpenAI API key permissions
2. Network connectivity
3. Rate limits

**Fallback:** System will catch errors and use template-based responses

## Testing

1. Start the server
2. Check console for assistant initialization message
3. Send a test message: "I need help with deposit"
4. Verify response follows the greeting template
5. Send order number: "s052602031022342625183"
6. Verify response follows the deposit flow logic

## Cost Considerations

- OpenAI Assistant API usage is billed per request
- Threads are stored by OpenAI (no additional cost for storage)
- Function calls count toward token usage
- Consider using `gpt-4-turbo-preview` for better cost/performance balance

## Best Practices

1. **Save Assistant ID**: After first run, save the assistant ID to avoid creating duplicates
2. **Monitor Usage**: Track OpenAI API usage to manage costs
3. **Test Fallback**: Ensure template-based fallback works if OpenAI is unavailable
4. **Update Instructions**: Modify `openai_system_instruction.md` as needed, then recreate assistant

## Migration from Templates

The system seamlessly switches between OpenAI Assistant and templates:

- If OpenAI is configured and working → Uses Assistant
- If OpenAI fails or not configured → Uses templates
- No code changes needed, just environment variables

This ensures your system always works, regardless of OpenAI availability.

