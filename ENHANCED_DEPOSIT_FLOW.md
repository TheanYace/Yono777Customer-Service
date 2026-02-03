# Enhanced Deposit Concern Flow

## Requirements
1. Start a polite conversation
2. Ask for deposit receipt and order number
3. If both already provided:
   - Reply politely: "Please hold on a moment while I check this for you"
   - Check database
   - If order number not found = not successful yet
   - If receipt is more than 2 days old and not in database = ask for PDF file and video recording
   - If all provided (PDF + video), send to group all together with order number and password of PDF file

## Implementation Guide

### 1. Enhanced Deposit Concern Detection

```javascript
// In Yono777SupportAgent class
handleDepositConcern(message, userId, language) {
    const conversationHistory = this.conversationHistory.get(userId) || [];
    
    // Check if this is a deposit concern
    const depositKeywords = {
        english: ['deposit', 'not received', 'not credited', 'missing', 'pending'],
        hindi: ['जमा', 'नहीं मिली', 'क्रेडिट नहीं', 'गायब', 'लंबित'],
        telugu: ['జమ', 'రాలేదు', 'క్రెడిట్ కాలేదు', 'లేదు', 'పెండింగ్']
    };
    
    const keywords = depositKeywords[language] || depositKeywords.english;
    const isDepositConcern = keywords.some(kw => message.toLowerCase().includes(kw));
    
    if (!isDepositConcern) return null;
    
    // Start polite conversation
    return this.initiateDepositConcernFlow(userId, message, language, conversationHistory);
}
```

### 2. Polite Conversation Start

```javascript
initiateDepositConcernFlow(userId, message, language, history) {
    // Check if we already have receipt and order number
    const hasReceipt = this.hasReceiptBeenUploaded(history);
    const orderNumber = this.extractOrderNumber(message) || this.extractOrderNumberFromHistory(history);
    
    // Polite greeting messages
    const greetings = {
        english: "Hello! I'm here to help you with your deposit concern. I understand this can be frustrating, and I want to make sure we get this resolved for you quickly.",
        hindi: "नमस्ते! मैं आपकी जमा संबंधी चिंता में आपकी मदद के लिए यहां हूं। मैं समझता हूं कि यह निराशाजनक हो सकता है, और मैं चाहता हूं कि हम इसे जल्दी हल करें।",
        telugu: "నమస్కారం! మీ డిపాజిట్ సంబంధిత ఆందోళనలో మీకు సహాయం చేయడానికి నేను ఇక్కడ ఉన్నాను. ఇది నిరాశాజనకంగా ఉండవచ్చని నేను అర్థం చేసుకున్నాను, మరియు మేము దీన్ని త్వరగా పరిష్కరించాలని నేను కోరుకుంటున్నాను."
    };
    
    if (!hasReceipt || !orderNumber) {
        // Ask for missing information
        const askMessages = {
            english: `${greetings[language]}\n\nTo help me verify your transaction, I'll need:\n\n📄 **Deposit Receipt** (screenshot or photo)\n📋 **Order Number** (your deposit order number)\n\nPlease provide both so I can check the status in our database.`,
            hindi: `${greetings[language]}\n\nआपके लेनदेन को सत्यापित करने में मदद करने के लिए, मुझे आवश्यकता होगी:\n\n📄 **जमा रसीद** (स्क्रीनशॉट या फोटो)\n📋 **ऑर्डर नंबर** (आपका जमा ऑर्डर नंबर)\n\nकृपया दोनों प्रदान करें ताकि मैं हमारे डेटाबेस में स्थिति की जांच कर सकूं।`,
            telugu: `${greetings[language]}\n\nమీ లావాదేవీని ధృవీకరించడంలో సహాయపడటానికి, నాకు అవసరం:\n\n📄 **జమ రసీదు** (స్క్రీన్‌షాట్ లేదా ఫోటో)\n📋 **ఆర్డర్ నంబర్** (మీ జమ ఆర్డర్ నంబర్)\n\nదయచేసి రెండూ అందించండి తద్వారా నేను మా డేటాబేస్‌లో స్థితిని తనిఖీ చేయగలను.`
        };
        
        return askMessages[language] || askMessages.english;
    }
    
    // Both provided - proceed to check
    return this.checkDepositInDatabase(userId, orderNumber, hasReceipt, language, history);
}
```

### 3. Database Check with Brief Acknowledgment

```javascript
async checkDepositInDatabase(userId, orderNumber, hasReceipt, language, history) {
    // Brief acknowledgment message - polite and reassuring
    const checkingMessages = {
        english: "Thank you for providing the information! Please hold on a moment while I check this for you. I'll get back to you right away with the status.",
        hindi: "जानकारी प्रदान करने के लिए धन्यवाद! कृपया एक क्षण प्रतीक्षा करें जबकि मैं इसे आपके लिए जांचता हूं। मैं आपको तुरंत स्थिति के साथ वापस आऊंगा।",
        telugu: "సమాచారం అందించినందుకు ధన్యవాదాలు! దయచేసి నేను దీన్ని మీ కోసం తనిఖీ చేస్తున్నప్పుడు కొద్ది సేపు వేచి ఉండండి. నేను వెంటనే మీకు స్థితితో తిరిగి రాగలను."
    };
    
    // Return acknowledgment immediately
    const acknowledgment = checkingMessages[language] || checkingMessages.english;
    
    // Check database asynchronously
    return new Promise((resolve) => {
        agent.checkOrderNumberInDatabase(orderNumber, async (err, orderData) => {
            if (err) {
                resolve(acknowledgment + "\n\nI encountered an error checking the database. Please try again.");
                return;
            }
            
            if (orderData && orderData.found) {
                // Order found - transaction successful
                const successMessages = {
                    english: `Thank you for your patience!\n\n✅ **Transaction Status:** Successful\n\nGreat news! Your deposit has been processed successfully. Please reopen the Yono777 app and enjoy gaming!\n\nThank you for choosing Yono777! 🎮`,
                    hindi: `आपके धैर्य के लिए धन्यवाद!\n\n✅ **लेनदेन स्थिति:** सफल\n\nबढ़िया खबर! आपकी जमा राशि सफलतापूर्वक संसाधित हो गई है। कृपया Yono777 ऐप को फिर से खोलें और गेमिंग का आनंद लें!\n\nYono777 चुनने के लिए धन्यवाद! 🎮`,
                    telugu: `మీ సహనానికి ధన్యవాదాలు!\n\n✅ **లావాదేవీ స్థితి:** విజయవంతం\n\nఅద్భుతమైన వార్త! మీ జమ విజయవంతంగా ప్రాసెస్ చేయబడింది. దయచేసి Yono777 అనువర్తనాన్ని మళ్లీ తెరవండి మరియు గేమింగ్‌ను ఆస్వాదించండి!\n\nYono777 ఎంచుకున్నందుకు ధన్యవాదాలు! 🎮`
                };
                resolve(successMessages[language] || successMessages.english);
            } else {
                // Order not found - check if receipt is 2+ days old
                const receiptDate = this.extractReceiptDate(history);
                const isOldReceipt = this.isReceiptOlderThan2Days(receiptDate);
                
                if (isOldReceipt) {
                    // Ask for PDF and video
                    const askForDocuments = {
                        english: `Thank you for your patience!\n\n⚠️ **Transaction Status:** Not Successful Yet\n\nThe payment is still processing. Since your receipt is more than 2 days old, we need additional verification to help process your deposit faster:\n\n📄 **PDF Bank Statement** (with transaction details)\n🎥 **Video Recording** (showing the successful deposit transaction)\n\nPlease provide both documents along with the PDF password (if protected) so our team can verify and process your deposit immediately.\n\nThank you for your cooperation!`,
                        hindi: `आपके धैर्य के लिए धन्यवाद!\n\n⚠️ **लेनदेन स्थिति:** अभी तक सफल नहीं\n\nभुगतान अभी भी प्रसंस्करण में है। चूंकि आपकी रसीद 2 दिन से अधिक पुरानी है, हमें आपकी जमा राशि को तेजी से संसाधित करने में मदद करने के लिए अतिरिक्त सत्यापन की आवश्यकता है:\n\n📄 **PDF बैंक स्टेटमेंट** (लेनदेन विवरण के साथ)\n🎥 **वीडियो रिकॉर्डिंग** (सफल जमा लेनदेन दिखा रहा है)\n\nकृपया PDF पासवर्ड (यदि सुरक्षित है) के साथ दोनों दस्तावेज़ प्रदान करें ताकि हमारी टीम आपकी जमा राशि को तुरंत सत्यापित और संसाधित कर सके।\n\nआपके सहयोग के लिए धन्यवाद!`,
                        telugu: `మీ సహనానికి ధన్యవాదాలు!\n\n⚠️ **లావాదేవీ స్థితి:** ఇంకా విజయవంతం కాలేదు\n\nచెల్లింపు ఇంకా ప్రాసెస్ అవుతోంది. మీ రసీదు 2 రోజుల కంటే ఎక్కువ పాతది కాబట్టి, మీ జమను వేగంగా ప్రాసెస్ చేయడంలో సహాయపడటానికి మాకు అదనపు ధృవీకరణ అవసరం:\n\n📄 **PDF బ్యాంక్ స్టేట్‌మెంట్** (లావాదేవీ వివరాలతో)\n🎥 **వీడియో రికార్డింగ్** (విజయవంతమైన జమ లావాదేవీని చూపిస్తోంది)\n\nదయచేసి PDF పాస్‌వర్డ్ (రక్షితమైతే)తో పాటు రెండు పత్రాలను అందించండి తద్వారా మా బృందం మీ జమను వెంటనే ధృవీకరించి ప్రాసెస్ చేయగలదు.\n\nమీ సహకారానికి ధన్యవాదాలు!`
                    };
                    resolve(askForDocuments[language] || askForDocuments.english);
                } else {
                    // Not successful yet, but receipt is recent
                    const notSuccessfulMessages = {
                        english: `Thank you for your patience!\n\n⚠️ **Transaction Status:** Not Successful Yet\n\nThe payment is still processing. Our team will follow up on this and keep you updated. Please wait for further updates.\n\nWe appreciate your patience and understanding!`,
                        hindi: `आपके धैर्य के लिए धन्यवाद!\n\n⚠️ **लेनदेन स्थिति:** अभी तक सफल नहीं\n\nभुगतान अभी भी प्रसंस्करण में है। हमारी टीम इस पर फॉलो-अप करेगी और आपको अपडेट रखेगी। कृपया आगे के अपडेट के लिए प्रतीक्षा करें।\n\nहम आपके धैर्य और समझ की सराहना करते हैं!`,
                        telugu: `మీ సహనానికి ధన్యవాదాలు!\n\n⚠️ **లావాదేవీ స్థితి:** ఇంకా విజయవంతం కాలేదు\n\nచెల్లింపు ఇంకా ప్రాసెస్ అవుతోంది. మా బృందం దీనిపై ఫాలో-అప్ చేస్తుంది మరియు మిమ్మల్ని నవీకరించడానికి ఉంచుతుంది. దయచేసి మరిన్ని నవీకరణల కోసం వేచి ఉండండి.\n\nమేము మీ సహనం మరియు అవగాహనను అభినందిస్తున్నాము!`
                    };
                    resolve(notSuccessfulMessages[language] || notSuccessfulMessages.english);
                }
            }
        });
    });
}
```

### 4. Check if Receipt is 2+ Days Old

```javascript
isReceiptOlderThan2Days(receiptDate) {
    if (!receiptDate) return false;
    
    const receipt = new Date(receiptDate);
    const now = new Date();
    const diffTime = Math.abs(now - receipt);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays >= 2;
}

extractReceiptDate(history) {
    // Look for receipt upload in history
    for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        if (msg.role === 'user' && msg.fileType) {
            // Check if there's a date in the message or metadata
            if (msg.timestamp) {
                return msg.timestamp;
            }
        }
    }
    return null;
}
```

### 5. Batch Send PDF and Video to Telegram

```javascript
// In /api/upload-receipt endpoint
// When both PDF and video are provided for old deposit

const pendingFiles = new Map(); // Store: userId_orderNumber -> {pdfs: [], videos: [], orderNumber, password}

app.post('/api/upload-receipt', upload.single('receipt'), async (req, res) => {
    const userId = req.body.userId || req.query.userId;
    const orderNumber = req.body.orderNumber || req.query.orderNumber;
    const pdfPassword = req.body.pdfPassword || req.query.pdfPassword; // New field
    
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    const isPDF = req.file.mimetype === 'application/pdf';
    const isVideo = req.file.mimetype.startsWith('video/');
    
    if (isPDF || isVideo) {
        const storageKey = `${userId}_${orderNumber}`;
        
        if (!pendingFiles.has(storageKey)) {
            pendingFiles.set(storageKey, {
                pdfs: [],
                videos: [],
                orderNumber: orderNumber,
                password: pdfPassword,
                timestamp: Date.now()
            });
        }
        
        const storage = pendingFiles.get(storageKey);
        
        if (isPDF) {
            storage.pdfs.push({
                buffer: req.file.buffer,
                filename: req.file.originalname || 'document.pdf'
            });
        } else if (isVideo) {
            storage.videos.push({
                buffer: req.file.buffer,
                filename: req.file.originalname || 'video.mp4'
            });
        }
        
        // Check if we have both PDF and video
        if (storage.pdfs.length > 0 && storage.videos.length > 0) {
            // Wait 3 seconds for any additional files
            setTimeout(async () => {
                const files = pendingFiles.get(storageKey);
                if (files && files.pdfs.length > 0 && files.videos.length > 0) {
                    // Send all files together to Telegram
                    await sendBatchFilesToTelegram(userId, files, orderNumber);
                    
                    // Clear storage
                    pendingFiles.delete(storageKey);
                }
            }, 3000);
        }
        
        return res.json({
            success: true,
            message: `Received ${isPDF ? 'PDF' : 'video'}. Waiting for ${isPDF ? 'video' : 'PDF'}...`,
            fileType: isPDF ? 'pdf' : 'video'
        });
    }
    
    // Handle image receipts (existing logic)
    // ...
});

async function sendBatchFilesToTelegram(userId, files, orderNumber) {
    const caption = `📋 **Deposit Verification Request**\n\n` +
                   `**Order Number:** ${orderNumber}\n` +
                   `**PDF Password:** ${files.password || 'Not provided'}\n\n` +
                   `**Files:**\n` +
                   `📄 ${files.pdfs.length} PDF document(s)\n` +
                   `🎥 ${files.videos.length} video recording(s)`;
    
    // Send caption first
    await telegramNotifier.sendMessage(userId, caption);
    
    // Send all PDFs
    for (const pdf of files.pdfs) {
        await telegramNotifier.sendDocument(userId, pdf.buffer, '', pdf.filename);
        await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit delay
    }
    
    // Send all videos
    for (const video of files.videos) {
        await telegramNotifier.sendVideo(userId, video.buffer, '', video.filename);
        await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit delay
    }
    
    console.log(`[Batch Send] Sent ${files.pdfs.length} PDFs and ${files.videos.length} videos for order ${orderNumber}`);
}
```

## Integration Steps

1. Add `handleDepositConcern` method to `Yono777SupportAgent` class
2. Add `initiateDepositConcernFlow` method
3. Add `checkDepositInDatabase` method
4. Add `isReceiptOlderThan2Days` and `extractReceiptDate` methods
5. Update `/api/upload-receipt` endpoint to handle PDF password and batch sending
6. Add `sendBatchFilesToTelegram` function
7. Update `/api/chat` endpoint to call `handleDepositConcern` for deposit-related messages

## Testing Checklist

- [ ] Polite conversation starts correctly
- [ ] Asks for receipt and order number if missing
- [ ] Brief acknowledgment when checking database
- [ ] Correctly identifies successful transactions
- [ ] Correctly identifies unsuccessful transactions
- [ ] Detects 2+ days old receipts
- [ ] Requests PDF and video for old receipts
- [ ] Batch sends files to Telegram with order number and password
- [ ] Handles all three languages (English, Hindi, Telugu)

