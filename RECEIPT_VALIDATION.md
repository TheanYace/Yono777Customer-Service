# Receipt Validation Feature

## Overview
The system now includes automatic receipt validation using OCR (Optical Character Recognition) technology. When users upload receipt images, the bot automatically analyzes them to extract and validate key information.

## Features

### 1. **OCR Text Extraction**
- Uses Tesseract.js to extract text from receipt images
- Preprocesses images (greyscale, normalization, sharpening) for better accuracy
- Provides confidence scores for extracted text

### 2. **Automatic Data Extraction**
The system automatically extracts:
- **Order Numbers**: Detects order numbers in various formats:
  - `s05` + 19 digits (e.g., `s052602010000216757028`)
  - `d05` + 19 digits (e.g., `d052602010000216757028`)
  - Generic order number patterns
- **Amounts**: Detects payment amounts in formats like:
  - ₹1,234.56
  - Rs. 1234
  - INR 1234.56
- **Dates**: Extracts dates in various formats (DD/MM/YYYY, MM/DD/YYYY, etc.)

### 3. **Validation Checks**
The system validates receipts based on:
- ✅ **Order Number Presence**: Checks if order number is found in receipt
- ✅ **OCR Confidence**: Ensures text extraction confidence is above 30%
- ✅ **Text Content**: Verifies that meaningful text was extracted
- ⚠️ **Amount Detection**: Warns if amount is not found
- ⚠️ **Date Detection**: Warns if date is not found

### 4. **Validation Results**
The bot provides detailed feedback:
- **Valid Receipt**: Shows all extracted information
- **Invalid Receipt**: Lists specific issues found
- **Warnings**: Highlights missing optional information

## How It Works

### User Flow
1. User uploads a receipt image (via attach button or paste)
2. Image is sent to server for processing
3. Server performs OCR analysis:
   - Preprocesses image for better recognition
   - Extracts text using Tesseract.js
   - Analyzes text for order numbers, amounts, dates
   - Validates receipt completeness
4. Results are displayed to user with validation status
5. Receipt and validation results are sent to Telegram support group

### Technical Implementation

#### Server-Side (`server.js`)
- `validateReceipt()` function:
  - Uses Sharp for image preprocessing
  - Uses Tesseract.js for OCR
  - Applies pattern matching for data extraction
  - Returns validation object with results

#### Client-Side (`script.js`)
- Displays validation results in chat
- Shows extracted information (order number, amount, date)
- Highlights issues and warnings
- Provides user-friendly feedback

## Validation Criteria

### Valid Receipt Requirements
- ✅ Order number found (from OCR or conversation)
- ✅ OCR confidence ≥ 30%
- ✅ Extracted text length > 10 characters

### Issues (Invalid Receipt)
- ❌ No order number found
- ❌ OCR confidence < 30% (unclear image)

### Warnings (Missing Optional Info)
- ⚠️ No amount found
- ⚠️ No date found

## Example Validation Response

### Valid Receipt:
```
✅ Receipt Validated Successfully!

📊 OCR Confidence: 85%
📋 Order Number: s052602010000216757028
💰 Amount: ₹1,200
📅 Date: 26/02/2024

✅ Receipt uploaded! Support team has been notified.
```

### Invalid Receipt:
```
⚠️ Receipt Validation Issues Found

📊 OCR Confidence: 25%
📋 Order Number: s052602010000216757028

⚠️ Issues:
• Low OCR confidence - receipt may be unclear

✅ Receipt uploaded! Support team has been notified.
```

## Dependencies
- `tesseract.js`: OCR engine for text extraction
- `sharp`: Image processing library for preprocessing

## Installation
The required packages are automatically installed:
```bash
npm install tesseract.js sharp
```

## Notes
- OCR accuracy depends on image quality
- Clear, well-lit images produce better results
- Handwritten text may have lower accuracy
- The system works best with printed receipts

