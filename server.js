// ============================================
// SERVER SETUP AND IMPORTS
// ============================================
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const TelegramBot = require('node-telegram-bot-api');
const XLSX = require('xlsx');
const { db, chatDb, dbHelpers } = require('./db');
const fs = require('fs');

// OpenAI Setup
let OpenAI = null;
let openaiClient = null;
let assistantId = null;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const USE_OPENAI = process.env.USE_OPENAI === 'true' || process.env.USE_OPENAI === '1';

if (OPENAI_API_KEY && USE_OPENAI) {
    try {
        OpenAI = require('openai');
        openaiClient = new OpenAI({
            apiKey: OPENAI_API_KEY
        });
        console.log('✅ OpenAI client initialized');
    } catch (error) {
        console.error('❌ Error initializing OpenAI:', error.message);
    }
} else {
    console.log('⚠️ OpenAI not configured. Set OPENAI_API_KEY and USE_OPENAI=true in .env');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Enhanced Multer configuration for file uploads with better validation
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { 
        fileSize: 100 * 1024 * 1024, // 100MB
        files: 10, // Max 10 files per request
        fields: 20, // Max 20 fields
        fieldNameSize: 100, // Max field name size
        fieldSize: 1024 * 1024 // 1MB max field size
    },
    fileFilter: (req, file, cb) => {
        // Enhanced file type validation
        const allowedMimeTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'
        ];
        
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: images (JPEG, PNG, GIF, WebP), PDF, videos (MP4, MPEG, MOV, AVI)`), false);
        }
    }
});

// Telegram Bot Setup
let telegramBot = null;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID || 'YOUR_TELEGRAM_GROUP_ID';

if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN') {
    try {
        telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
        console.log('Telegram bot initialized');
    } catch (error) {
        console.error('Error initializing Telegram bot:', error.message);
    }
} else {
    console.log('Telegram bot not configured. Set TELEGRAM_BOT_TOKEN in .env');
}

// ============================================
// ENHANCED RESPONSE GENERATOR
// ============================================
// Enhanced Response Generator - Creates more natural and varied responses
class EnhancedResponseGenerator {
    constructor() {
        // Response variations to avoid repetition
        this.responseVariations = {
            deposit: {
                general: [
                    "I'm here to help you with your deposit! Please share your order number or receipt so I can check the status for you. If you've already made the payment but it hasn't reflected in your account yet, please know that your money is 100% safe with us. We are committed to processing your deposit transaction as quickly and efficiently as possible. However, please understand that some factors, such as access to banking services, may be beyond our control. What specific issue are you experiencing? Please share the details and I'll take care of it!",
                    "I understand you need help with your deposit. To assist you better, could you please share your order number or upload your deposit receipt? This will help me check the current status of your transaction. Rest assured, your funds are completely safe with us. We're working diligently to process deposits as quickly as possible, though some factors like bank processing times are outside our direct control. What specific problem are you facing? Let me know the details and I'll help resolve it!",
                    "Hello! I'm ready to help with your deposit concern. To get started, I'll need either your order number or a copy of your deposit receipt. Once I have this information, I can check the status right away. Your money is 100% secure with us - we take this very seriously. While we process deposits as fast as we can, please note that banking processes sometimes take time. What's the specific issue you're experiencing? Share the details and I'll handle it for you!"
                ],
                time: [
                    "Unfortunately, I cannot give an exact timeframe for the deposit, as both banks are processing it, performing security checks and validations. Don't worry, we are closely monitoring the status and will inform you immediately. Typically, deposit processing can take anywhere from a few minutes to 48 hours depending on transaction volume and bank processing times. We are committed to processing your deposit transaction as quickly and efficiently as possible. However, please understand that some factors, such as access to banking services, may be beyond our control. Thank you for your patience!",
                    "I understand you're waiting for your deposit. Processing times can vary - typically ranging from a few minutes to 48 hours. This depends on transaction volume and bank processing schedules. We're actively monitoring your transaction and will notify you as soon as it's processed. Your funds are safe, and we're doing everything we can to expedite the process. Some factors like bank verification procedures are beyond our direct control, but we're working closely with our banking partners. Thank you for your understanding!",
                    "Deposit processing times can vary based on several factors. Generally, it takes anywhere from a few minutes to 48 hours. We're continuously monitoring all transactions and will update you immediately once your deposit is processed. Your money is completely secure with us. While we process deposits as quickly as possible, bank security checks and verification procedures can sometimes cause delays. We appreciate your patience during this time!"
                ]
            }
        };
        
        // Conversation patterns for more natural responses
        this.conversationPatterns = {
            acknowledgment: {
                english: ["I understand", "I see", "Got it", "I hear you", "I appreciate you sharing"],
                hindi: ["मैं समझता हूं", "मैं देख रहा हूं", "समझ गया", "मैं सुन रहा हूं"],
                telugu: ["నేను అర్థం చేసుకున్నాను", "నేను చూస్తున్నాను", "అర్థమైంది", "నేను వింటున్నాను"]
            },
            empathy: {
                english: ["I can imagine how", "I know this must be", "I understand this is", "I realize this feels"],
                hindi: ["मैं समझ सकता हूं कि यह कैसा", "मैं जानता हूं कि यह", "मैं समझता हूं कि यह", "मैं महसूस करता हूं कि यह"],
                telugu: ["నేను ఊహించగలను ఎలా", "నేను తెలుసు ఇది", "నేను అర్థం చేసుకున్నాను ఇది", "నేను అనుభవిస్తున్నాను ఇది"]
            },
            action: {
                english: ["I'll help you", "Let me assist", "I'm here to", "I'll take care of"],
                hindi: ["मैं आपकी मदद करूंगा", "मुझे सहायता करने दें", "मैं यहां हूं", "मैं देखभाल करूंगा"],
                telugu: ["నేను మీకు సహాయం చేస్తాను", "నన్ను సహాయం చేయనివ్వండి", "నేను ఇక్కడ ఉన్నాను", "నేను చూసుకుంటాను"]
            }
        };
    }
    
    // Generate varied response to avoid repetition
    getVariedResponse(category, subcategory, language, history = []) {
        const variations = this.responseVariations[category]?.[subcategory];
        if (!variations || variations.length === 0) {
            return null; // No variations available
        }
        
        // Check recent responses to avoid immediate repetition
        if (history.length > 0) {
            const recentResponses = history
                .filter(h => h.role === 'assistant')
                .slice(-3)
                .map(h => h.message);
            
            // Find a variation that's different from recent responses
            for (const variation of variations) {
                const isSimilar = recentResponses.some(recent => {
                    const similarity = this.calculateSimilarity(variation, recent);
                    return similarity > 0.7; // 70% similar
                });
                
                if (!isSimilar) {
                    return variation;
                }
            }
        }
        
        // If all are similar or no history, return random variation
        return variations[Math.floor(Math.random() * variations.length)];
    }
    
    // Calculate similarity between two texts (simple word-based)
    calculateSimilarity(text1, text2) {
        const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        
        if (words1.size === 0 || words2.size === 0) return 0;
        
        const intersection = [...words1].filter(w => words2.has(w));
        const union = new Set([...words1, ...words2]);
        
        return intersection.length / union.size; // Jaccard similarity
    }
    
    // Build natural response with conversation patterns
    buildNaturalResponse(baseResponse, context, language) {
        let response = baseResponse;
        
        // Add acknowledgment if user seems frustrated
        if (context.sentiment === 'negative' && context.urgency === 'high') {
            const acknowledgments = this.conversationPatterns.acknowledgment[language] || 
                                   this.conversationPatterns.acknowledgment.english;
            const acknowledgment = acknowledgments[Math.floor(Math.random() * acknowledgments.length)];
            response = `${acknowledgment}... ${response}`;
        }
        
        // Add empathy for negative sentiment
        if (context.sentiment === 'negative') {
            const empathyPhrases = this.conversationPatterns.empathy[language] || 
                                  this.conversationPatterns.empathy.english;
            const empathy = empathyPhrases[Math.floor(Math.random() * empathyPhrases.length)];
            
            // Only add if not already present
            if (!response.toLowerCase().includes(empathy.toLowerCase())) {
                response = `${empathy} frustrating. ${response}`;
            }
        }
        
        return response;
    }
    
    // Generate personalized response based on user behavior
    personalizeResponse(response, userId, conversationHistory) {
        // Check if user has asked similar questions before
        const userMessages = conversationHistory
            .filter(h => h.role === 'user')
            .map(h => h.message.toLowerCase());
        
        // If user is repeating questions, add reassurance
        if (userMessages.length > 3) {
            const uniqueQuestions = new Set(userMessages);
            if (uniqueQuestions.size < userMessages.length * 0.5) {
                // User is asking similar questions repeatedly
                response = `I want to make sure we get this resolved for you. ${response}`;
            }
        }
        
        return response;
    }
    
    // Add proactive suggestions based on context
    addProactiveSuggestions(response, issueType, context, language) {
        if (issueType === 'deposit' && context.sentiment === 'negative') {
            const suggestions = {
                english: "\n\n💡 **Quick Tip:** Make sure your payment method is verified and you're using the correct order number. This helps speed up processing!",
                hindi: "\n\n💡 **त्वरित सुझाव:** सुनिश्चित करें कि आपका भुगतान विधि सत्यापित है और आप सही ऑर्डर नंबर का उपयोग कर रहे हैं। यह प्रसंस्करण को तेज करने में मदद करता है!",
                telugu: "\n\n💡 **త్వరిత చిట్కా:** మీ చెల్లింపు పద్ధతి ధృవీకరించబడిందని మరియు మీరు సరైన ఆర్డర్ నంబర్‌ను ఉపయోగిస్తున్నారని నిర్ధారించుకోండి. ఇది ప్రాసెసింగ్‌ను వేగవంతం చేయడంలో సహాయపడుతుంది!"
            };
            response += suggestions[language] || suggestions.english;
        }
        
        return response;
    }
}

// ============================================
// LANGUAGE DETECTOR
// ============================================
class LanguageDetector {
    detectLanguage(message) {
        const hindiPattern = /[\u0900-\u097F]/;
        const teluguPattern = /[\u0C00-\u0C7F]/;
        const tamilPattern = /[\u0B80-\u0BFF]/;
        const bengaliPattern = /[\u0980-\u09FF]/;
        const gujaratiPattern = /[\u0A80-\u0AFF]/;
        const kannadaPattern = /[\u0C80-\u0CFF]/;
        const malayalamPattern = /[\u0D00-\u0D7F]/;
        const punjabiPattern = /[\u0A00-\u0A7F]/;
        const urduPattern = /[\u0600-\u06FF]/;
        
        if (hindiPattern.test(message)) return 'hindi';
        if (teluguPattern.test(message)) return 'telugu';
        if (tamilPattern.test(message)) return 'tamil';
        if (bengaliPattern.test(message)) return 'bengali';
        if (gujaratiPattern.test(message)) return 'gujarati';
        if (kannadaPattern.test(message)) return 'kannada';
        if (malayalamPattern.test(message)) return 'malayalam';
        if (punjabiPattern.test(message)) return 'punjabi';
        if (urduPattern.test(message)) return 'urdu';
        return 'english';
    }
}

// ============================================
// CONVERSATION MEMORY
// ============================================
class ConversationMemory {
    constructor() {
        this.userMemory = new Map();
    }
    
    rememberUserDetails(userId, message, context) {
        const memory = this.userMemory.get(userId) || {
            orderNumbers: [],
            issues: [],
            preferences: {
                language: 'english',
                communicationStyle: 'normal'
            },
            lastInteraction: null,
            topics: [],
            concerns: [],
            sentimentHistory: []
        };
        
        // Extract and remember order numbers
        const orderPatterns = [
            /s05\d{19}/i,
            /d05\d{19}/i,
            /p05\d{19}/i,
            /order[:\s]*(s05|d05|p05)\d{19}/i
        ];
        
        for (const pattern of orderPatterns) {
            const match = message.match(pattern);
            if (match) {
                const orderNumber = match[1] || match[0];
                if (!memory.orderNumbers.includes(orderNumber)) {
                    memory.orderNumbers.push(orderNumber);
                }
            }
        }
        
        // Remember user preferences (language, communication style)
        if (message.includes('hindi') || message.includes('हिंदी')) {
            memory.preferences.language = 'hindi';
        } else if (message.includes('telugu') || message.includes('తెలుగు')) {
            memory.preferences.language = 'telugu';
        }
        
        // Track topics
        const topics = this.extractTopics(message);
        memory.topics.push(...topics);
        
        // Track sentiment
        if (context && context.sentiment) {
            memory.sentimentHistory.push({
                sentiment: context.sentiment,
                timestamp: new Date().toISOString()
            });
        }
        
        // Track concerns
        const issueType = this.extractIssueType(message);
        if (issueType && !memory.concerns.includes(issueType)) {
            memory.concerns.push(issueType);
        }
        
        memory.lastInteraction = new Date().toISOString();
        this.userMemory.set(userId, memory);
        return memory;
    }
    
    extractTopics(message) {
        const topics = [];
        const lowerMsg = message.toLowerCase();
        
        if (lowerMsg.includes('deposit') || lowerMsg.includes('जमा') || lowerMsg.includes('జమ')) {
            topics.push('deposit');
        }
        if (lowerMsg.includes('withdrawal') || lowerMsg.includes('निकासी') || lowerMsg.includes('ఉపసంహరణ')) {
            topics.push('withdrawal');
        }
        if (lowerMsg.includes('bonus') || lowerMsg.includes('बोनस') || lowerMsg.includes('బోనస్')) {
            topics.push('bonus');
        }
        if (lowerMsg.includes('account') || lowerMsg.includes('खाता') || lowerMsg.includes('ఖాతా')) {
            topics.push('account');
        }
        
        return topics;
    }
    
    extractIssueType(message) {
        const lowerMsg = message.toLowerCase();
        if (lowerMsg.includes('deposit') || lowerMsg.includes('जमा') || lowerMsg.includes('జమ')) return 'deposit';
        if (lowerMsg.includes('withdrawal') || lowerMsg.includes('निकासी') || lowerMsg.includes('ఉపసంహరణ')) return 'withdrawal';
        if (lowerMsg.includes('bonus') || lowerMsg.includes('बोनस') || lowerMsg.includes('బోనస్')) return 'bonus';
        if (lowerMsg.includes('account') || lowerMsg.includes('खाता') || lowerMsg.includes('ఖాతా')) return 'account';
        return null;
    }
    
    getUserMemory(userId) {
        return this.userMemory.get(userId) || null;
    }
    
    getRecentSentiment(userId, count = 3) {
        const memory = this.userMemory.get(userId);
        if (!memory || !memory.sentimentHistory) return [];
        return memory.sentimentHistory.slice(-count);
    }
}

// ============================================
// CONTEXT ANALYZER
// ============================================
class ContextAnalyzer {
    constructor() {
        this.questionWords = {
            english: ['what', 'when', 'where', 'who', 'why', 'how', 'which', 'can', 'could', 'should', 'would', 'is', 'are', 'do', 'does', 'did', 'will', 'may'],
            hindi: ['क्या', 'कब', 'कहाँ', 'कौन', 'क्यों', 'कैसे', 'कौन सा', 'कर सकता', 'कर सकती', 'करना चाहिए'],
            telugu: ['ఏమి', 'ఎప్పుడు', 'ఎక్కడ', 'ఎవరు', 'ఎందుకు', 'ఎలా', 'ఏది', 'చేయగలను', 'చేయగలరు']
        };
        this.conversationFlow = new Map();
    }
    
    trackConversationFlow(userId, message, response, context) {
        const flow = this.conversationFlow.get(userId) || {
            topics: [],
            questions: [],
            concerns: [],
            sentimentHistory: [],
            intentHistory: []
        };
        
        // Track topics
        const topics = this.extractTopics(message);
        flow.topics.push(...topics);
        
        // Track sentiment
        if (context && context.sentiment) {
            flow.sentimentHistory.push({
                sentiment: context.sentiment,
                timestamp: new Date().toISOString()
            });
        }
        
        // Track questions
        if (context && context.isQuestion) {
            flow.questions.push({
                type: context.questionType,
                message: message,
                timestamp: new Date().toISOString()
            });
        }
        
        this.conversationFlow.set(userId, flow);
    }
    
    extractTopics(message) {
        const topics = [];
        const lowerMsg = message.toLowerCase();
        
        if (lowerMsg.includes('deposit') || lowerMsg.includes('जमा') || lowerMsg.includes('జమ')) {
            topics.push('deposit');
        }
        if (lowerMsg.includes('withdrawal') || lowerMsg.includes('निकासी') || lowerMsg.includes('ఉపసంహరణ')) {
            topics.push('withdrawal');
        }
        if (lowerMsg.includes('bonus') || lowerMsg.includes('बोनस') || lowerMsg.includes('బోనస్')) {
            topics.push('bonus');
        }
        if (lowerMsg.includes('account') || lowerMsg.includes('खाता') || lowerMsg.includes('ఖాతా')) {
            topics.push('account');
        }
        
        return topics;
    }

    analyzeContext(history, currentMessage, language) {
        const context = {
            isQuestion: this.getQuestionType(currentMessage, language) !== 'general',
            questionType: this.getQuestionType(currentMessage, language),
            sentiment: this.analyzeSentiment(currentMessage, language),
            topicContinuity: this.checkTopicContinuity(history, currentMessage, language),
            urgency: this.detectUrgency(currentMessage, language),
            previousIssues: this.extractPreviousIssues(history, language),
            needsClarification: this.needsClarification(history, currentMessage, language),
            emotion: this.detectEmotion(currentMessage, language),
            intent: this.detectIntent(currentMessage, language)
        };
        
        return context;
    }
    
    detectEmotion(message, language) {
        const lowerMsg = message.toLowerCase().trim();
        const emotions = {
            frustrated: {
                english: ['angry', 'frustrated', 'upset', 'annoyed', 'irritated', 'mad', 'still', 'again', 'why', 'not working', 'nothing', 'waiting', 'how long'],
                hindi: ['गुस्सा', 'निराश', 'परेशान', 'चिढ़', 'क्रोधित', 'अभी भी', 'फिर', 'क्यों', 'काम नहीं कर रहा', 'कुछ नहीं', 'इंतज़ार'],
                telugu: ['కోపం', 'నిరాశ', 'అసంతృప్తి', 'చిరాకు', 'కోపగించిన', 'ఇంకా', 'మళ్లీ', 'ఎందుకు', 'పని చేయడం లేదు', 'ఏమీ లేదు', 'వేచి']
            },
            worried: {
                english: ['worried', 'concerned', 'anxious', 'nervous', 'scared', 'safe', 'money', 'lost', 'missing'],
                hindi: ['चिंतित', 'परेशान', 'चिंता', 'घबराया', 'सुरक्षित', 'पैसा', 'खो गया', 'गायब'],
                telugu: ['ఆందోళన', 'భయం', 'చింత', 'అసహ్యం', 'భయపడిన', 'సురక్షితం', 'డబ్బు', 'పోయింది', 'కనిపించడం లేదు']
            },
            waiting: {
                english: ['okay', 'ok', 'now nothing', 'what now', 'what next', 'done', 'finished', 'submitted', 'sent', 'uploaded', 'provided'],
                hindi: ['ठीक', 'अब कुछ नहीं', 'अब क्या', 'क्या अगला', 'हो गया', 'समाप्त', 'भेज दिया', 'अपलोड कर दिया'],
                telugu: ['సరే', 'ఇప్పుడు ఏమీ లేదు', 'ఇప్పుడు ఏమి', 'తరువాత ఏమి', 'పూర్తయింది', 'పంపబడింది', 'అప్లోడ్ చేయబడింది']
            },
            confused: {
                english: ['confused', 'don\'t understand', 'unclear', 'not sure', 'what', 'how', '?', 'hmm', 'huh', 'what should i do'],
                hindi: ['भ्रमित', 'समझ नहीं', 'अस्पष्ट', 'निश्चित नहीं', 'क्या', 'कैसे', 'क्या करना चाहिए'],
                telugu: ['గందరగోళం', 'అర్థం కాలేదు', 'అస్పష్టంగా', 'ఖచ్చితంగా కాదు', 'ఏమి', 'ఎలా', 'నేను ఏమి చేయాలి']
            },
            happy: {
                english: ['thank', 'thanks', 'great', 'good', 'satisfied', 'happy', 'perfect', 'awesome'],
                hindi: ['धन्यवाद', 'शुक्रिया', 'अच्छा', 'खुश', 'उत्तम'],
                telugu: ['ధన్యవాదాలు', 'శుక్రియ', 'మంచి', 'సంతోషం', 'పరిపూర్ణం']
            }
        };
        
        // Check for waiting/uncertainty (common after providing files)
        const waitingKw = emotions.waiting[language] || emotions.waiting.english;
        if (waitingKw.some(kw => lowerMsg.includes(kw))) {
            // If message is very short and contains waiting keywords, it's likely waiting
            if (lowerMsg.length < 20 || lowerMsg === 'okay' || lowerMsg === 'ok' || lowerMsg.includes('now nothing')) {
                return 'waiting';
            }
        }
        
        const emotionKeywords = emotions.frustrated[language] || emotions.frustrated.english;
        if (emotionKeywords.some(kw => lowerMsg.includes(kw))) return 'frustrated';
        
        const worriedKw = emotions.worried[language] || emotions.worried.english;
        if (worriedKw.some(kw => lowerMsg.includes(kw))) return 'worried';
        
        const happyKw = emotions.happy[language] || emotions.happy.english;
        if (happyKw.some(kw => lowerMsg.includes(kw))) return 'happy';
        
        const confusedKw = emotions.confused[language] || emotions.confused.english;
        if (confusedKw.some(kw => lowerMsg.includes(kw))) return 'confused';
        
        return 'neutral';
    }
    
    detectIntent(message, language) {
        const intents = {
            deposit: {
                patterns: [
                    /deposit|जमा|జమ/i,
                    /add.*money|add.*fund/i,
                    /money.*not.*credit|not.*credited/i,
                    /payment.*pending|pending.*payment/i
                ],
                confidence: 0
            },
            withdrawal: {
                patterns: [
                    /withdraw|निकासी|ఉపసంహరణ/i,
                    /money.*not.*receive|not.*received/i,
                    /payout|payment.*not/i
                ],
                confidence: 0
            },
            bonus: {
                patterns: [
                    /bonus|बोनस|బోనస్/i,
                    /promotion|promo/i,
                    /reward/i
                ],
                confidence: 0
            },
            account: {
                patterns: [
                    /account|खाता|ఖాతా/i,
                    /profile|settings/i,
                    /verify|verification/i
                ],
                confidence: 0
            }
        };
        
        // Calculate confidence for each intent
        for (const [intent, data] of Object.entries(intents)) {
            data.confidence = data.patterns.reduce((acc, pattern) => {
                return acc + (pattern.test(message) ? 0.3 : 0);
            }, 0);
        }
        
        // Return highest confidence intent
        const sortedIntents = Object.entries(intents)
            .sort((a, b) => b[1].confidence - a[1].confidence);
        
        if (sortedIntents.length > 0 && sortedIntents[0][1].confidence > 0) {
            return sortedIntents[0][0];
        }
        
        return 'general';
    }

    getQuestionType(message, language) {
        const lowerMsg = message.toLowerCase();
        const qWords = this.questionWords[language] || this.questionWords.english;
        
        if (qWords.some(w => lowerMsg.includes('how'))) return 'how';
        if (qWords.some(w => lowerMsg.includes('when'))) return 'when';
        if (qWords.some(w => lowerMsg.includes('why'))) return 'why';
        if (qWords.some(w => lowerMsg.includes('what'))) return 'what';
        if (qWords.some(w => lowerMsg.includes('where'))) return 'where';
        if (qWords.some(w => lowerMsg.includes('who'))) return 'who';
        
        return 'general';
    }

    analyzeSentiment(message, language) {
        const lowerMsg = message.toLowerCase();
        const positiveWords = {
            english: ['thank', 'thanks', 'good', 'great', 'excellent', 'happy', 'satisfied', 'perfect', 'awesome', 'wonderful'],
            hindi: ['धन्यवाद', 'शुक्रिया', 'अच्छा', 'बढ़िया', 'उत्कृष्ट', 'खुश', 'संतुष्ट', 'पूर्ण', 'शानदार', 'अद्भुत'],
            telugu: ['ధన్యవాదాలు', 'శుక్రియ', 'మంచి', 'గొప్ప', 'అద్భుతం', 'సంతోషం', 'సంతృప్తి', 'పరిపూర్ణం']
        };
        const negativeWords = {
            english: ['angry', 'frustrated', 'upset', 'terrible', 'worst', 'horrible', 'bad', 'disappointed', 'annoyed', 'furious'],
            hindi: ['गुस्सा', 'निराश', 'परेशान', 'भयानक', 'सबसे खराब', 'भयानक', 'खराब', 'निराश', 'परेशान', 'क्रोधित'],
            telugu: ['కోపం', 'నిరాశ', 'చిరాకు', 'భయంకరం', 'చెత్త', 'భయంకరం', 'చెడు', 'నిరాశ', 'చిరాకు', 'కోపంగా']
        };
        
        const posWords = positiveWords[language] || positiveWords.english;
        const negWords = negativeWords[language] || negativeWords.english;
        
        const posCount = posWords.filter(w => lowerMsg.includes(w)).length;
        const negCount = negWords.filter(w => lowerMsg.includes(w)).length;
        
        if (negCount > posCount) return 'negative';
        if (posCount > negCount) return 'positive';
        return 'neutral';
    }

    checkTopicContinuity(history, currentMessage, language) {
        if (!history || history.length < 2) return null;
        
        const recentMessages = history.slice(-4).filter(h => h.role === 'user').map(h => h.message.toLowerCase());
        const currentLower = currentMessage.toLowerCase();
        
        const depositKeywords = ['deposit', 'जमा', 'జమ'];
        const withdrawalKeywords = ['withdrawal', 'निकासी', 'ఉపసంహరణ'];
        const accountKeywords = ['account', 'खाता', 'ఖాతా'];
        
        const allKeywords = [...depositKeywords, ...withdrawalKeywords, ...accountKeywords];
        
        const prevTopics = recentMessages.flatMap(msg => 
            allKeywords.filter(kw => msg.includes(kw))
        );
        
        const currentTopics = allKeywords.filter(kw => currentLower.includes(kw));
        
        return prevTopics.length > 0 && currentTopics.some(t => prevTopics.includes(t)) ? 'continuing' : 'new';
    }

    detectUrgency(message, language) {
        const lowerMsg = message.toLowerCase();
        const urgentWords = {
            english: ['urgent', 'immediately', 'asap', 'right now', 'emergency', 'critical', 'important'],
            hindi: ['तत्काल', 'अभी', 'जरूरी', 'आपातकाल', 'महत्वपूर्ण', 'तुरंत'],
            telugu: ['తక్షణం', 'ఇప్పుడే', 'అవసరం', 'అత్యవసరం', 'ముఖ్యమైన', 'వెంటనే']
        };
        
        const urgentKw = urgentWords[language] || urgentWords.english;
        return urgentKw.some(w => lowerMsg.includes(w)) ? 'high' : 'normal';
    }

    extractPreviousIssues(history, language) {
        if (!history || history.length === 0) return [];
        
        const issues = [];
        const userMessages = history.filter(h => h.role === 'user').map(h => h.message);
        
        userMessages.forEach(msg => {
            const issueType = this.classifyIssueFromMessage(msg, language);
            if (issueType && !issues.includes(issueType)) {
                issues.push(issueType);
            }
        });
        
        return issues;
    }

    classifyIssueFromMessage(message, language) {
        const lowerMsg = message.toLowerCase();
        const depositKw = ['deposit', 'जमा', 'జమ'];
        const withdrawalKw = ['withdrawal', 'निकासी', 'ఉపసంహరణ'];
        const accountKw = ['account', 'खाता', 'ఖాతా'];
        
        if (depositKw.some(kw => lowerMsg.includes(kw))) return 'deposit';
        if (withdrawalKw.some(kw => lowerMsg.includes(kw))) return 'withdrawal';
        if (accountKw.some(kw => lowerMsg.includes(kw))) return 'account';
        return null;
    }

    needsClarification(history, currentMessage, language) {
        if (!history || history.length < 2) return false;
        
        const lastBotMessage = history.filter(h => h.role === 'assistant').pop();
        if (!lastBotMessage) return false;
        
        const lowerCurrent = currentMessage.toLowerCase();
        const clarificationWords = {
            english: ['what', 'mean', 'explain', 'clarify', 'understand', 'confused'],
            hindi: ['क्या', 'मतलब', 'समझाएं', 'स्पष्ट', 'समझ', 'भ्रमित'],
            telugu: ['ఏమి', 'అర్థం', 'వివరించండి', 'స్పష్టం', 'అర్థం', 'గందరగోళం']
        };
        
        const clarKw = clarificationWords[language] || clarificationWords.english;
        return clarKw.some(w => lowerCurrent.includes(w));
    }
}

// ============================================
// MULTILINGUAL RESPONSES
// ============================================
class MultilingualResponses {
    constructor() {
        this.responses = {
            english: {
                greeting: "Hello! 🌟 Welcome to Yono777! I'm so happy you're here and I'm excited to help you today. How can I assist you?",
                deposit: {
                    general: "I'm here to help you with your deposit! Please share your order number or receipt so I can check the status for you. If you've already made the payment but it hasn't reflected in your account yet, please know that your money is 100% safe with us. We are committed to processing your deposit transaction as quickly and efficiently as possible. However, please understand that some factors, such as access to banking services, may be beyond our control. What specific issue are you experiencing? Please share the details and I'll take care of it!",
                    time: "Unfortunately, I cannot give an exact timeframe for the deposit, as both banks are processing it, performing security checks and validations. Don't worry, we are closely monitoring the status and will inform you immediately. Typically, deposit processing can take anywhere from a few minutes to 48 hours depending on transaction volume and bank processing times.",
                    fail: "Please give me a moment to check this for you. I'll get back to you shortly with an update! Dear member, your deposit request is currently pending with our bank representative. Due to high transaction volume and bank delays, processing may take longer than usual. Please trust that your money is 100% safe with us."
                },
                withdrawal: {
                    general: "I completely understand your concern about withdrawals - your money matters! I'm here to help you every step of the way. What specific issue are you facing? Let me know and I'll make sure we get it sorted out for you!",
                    time: "I understand you're eager to get your withdrawal - and I'm here to help! Withdrawals are typically processed within 24-48 hours, which I know can feel like a long time. To make sure everything goes smoothly, please ensure your bank details are verified.",
                    fail: "I'm really sorry about this delay - I know how important it is to get your money when you need it. Let's check a few things together: please verify that your bank details are correct and that your account is fully verified."
                },
                account: {
                    general: "Your account is important to us, and I'm here to help! I want to make sure everything is working perfectly for you. What specific issue are you experiencing with your account? Share the details and I'll take care of it right away!",
                    update: "Of course! I'm happy to guide you through updating your bank details. It's really simple - just go to Account Settings > Banking Details.",
                    restrict: "I'm really sorry to hear about this - I can imagine how concerning that must be. Account restrictions usually happen due to verification requirements or security measures to protect you."
                },
                bonus: {
                    general: "I love helping with bonuses - they're exciting! All bonuses have specific terms and wagering requirements, and I'm here to explain everything clearly for you. What would you like to know? Ask me anything!",
                    wagering: "Great question! I'm happy to explain this for you. Wagering requirements do vary by bonus - typically, bonuses require 30x to 50x wagering before withdrawal.",
                    missing: "Oh, I'm so sorry you didn't receive your bonus - that's really disappointing! Let me help you figure this out. Please check if you met all the eligibility requirements first."
                },
                technical: "I'm really sorry you're experiencing technical difficulties - I know how frustrating that can be! Let's try a quick fix first: please try refreshing the page or clearing your browser cache.",
                complaint: "I'm truly sorry you're having this issue - I can understand how upsetting this must be. Please know that I'm here for you and I'm going to do everything I can to help resolve this.",
                general: "I'm so happy you reached out! I'm here for you and I genuinely want to help. Could you please share a bit more about what you need assistance with? The more details you give me, the better I can help you! 😊"
            },
            hindi: {
                greeting: "नमस्ते! 🌟 Yono777 में आपका स्वागत है! मुझे खुशी है कि आप यहां हैं और मैं आज आपकी मदद करने के लिए उत्साहित हूं। मैं आपकी कैसे सहायता कर सकता हूं?",
                deposit: {
                    general: "मैं आपकी जमा राशि में आपकी मदद के लिए यहां हूं! कृपया अपना ऑर्डर नंबर या रसीद साझा करें ताकि मैं आपके लिए स्थिति की जांच कर सकूं।",
                    time: "दुर्भाग्य से, मैं जमा के लिए एक सटीक समय सीमा नहीं दे सकता, क्योंकि दोनों बैंक इसे संसाधित कर रहे हैं, सुरक्षा जांच और सत्यापन कर रहे हैं।",
                    fail: "कृपया मुझे इसकी जांच करने के लिए एक क्षण दें। मैं जल्द ही एक अपडेट के साथ आपके पास वापस आऊंगा!"
                },
                withdrawal: {
                    general: "मैं निकासी के बारे में आपकी चिंता को पूरी तरह समझता हूं - आपका पैसा मायने रखता है!",
                    time: "मैं समझता हूं कि आप अपनी निकासी प्राप्त करने के लिए उत्सुक हैं - और मैं मदद के लिए यहां हूं!",
                    fail: "इस देरी के लिए मैं वास्तव में क्षमा चाहता हूं - मैं जानता हूं कि जब आपको जरूरत हो तो अपना पैसा प्राप्त करना कितना महत्वपूर्ण है।"
                },
                account: {
                    general: "आपका खाता हमारे लिए महत्वपूर्ण है, और मैं मदद के लिए यहां हूं!",
                    update: "बिल्कुल! मैं आपके बैंक विवरण अपडेट करने के माध्यम से आपका मार्गदर्शन करने में खुश हूं।",
                    restrict: "इसके बारे में सुनकर मुझे वास्तव में खेद है - मैं कल्पना कर सकता हूं कि यह कितना चिंताजनक होना चाहिए।"
                },
                bonus: {
                    general: "मुझे बोनस के साथ मदद करना पसंद है - वे रोमांचक हैं!",
                    wagering: "बढ़िया सवाल! मैं आपके लिए इसे समझाने में खुश हूं।",
                    missing: "ओह, मुझे बहुत खेद है कि आपको अपना बोनस नहीं मिला - यह वास्तव में निराशाजनक है!"
                },
                technical: "मुझे वास्तव में खेद है कि आप तकनीकी कठिनाइयों का सामना कर रहे हैं - मैं जानता हूं कि यह कितना निराशाजनक हो सकता है!",
                complaint: "मुझे वास्तव में खेद है कि आपको यह समस्या हो रही है - मैं समझ सकता हूं कि यह कितना परेशान करने वाला होना चाहिए।",
                general: "मुझे बहुत खुशी है कि आपने संपर्क किया! मैं आपके लिए यहां हूं और मैं वास्तव में मदद करना चाहता हूं।"
            },
            telugu: {
                greeting: "నమస్కారం! 🌟 Yono777కు స్వాగతం! మీరు ఇక్కడ ఉన్నందుకు నేను సంతోషిస్తున్నాను మరియు నేను ఈరోజు మీకు సహాయం చేయడానికి ఉత్సాహంగా ఉన్నాను. నేను మీకు ఎలా సహాయం చేయగలను?",
                deposit: {
                    general: "మీ జమలో మీకు సహాయం చేయడానికి నేను ఇక్కడ ఉన్నాను! దయచేసి మీ ఆర్డర్ నంబర్ లేదా రసీదును షేర్ చేయండి తద్వారా నేను మీ కోసం స్థితిని తనిఖీ చేయగలను।",
                    time: "దురదృష్టవశాత్తు, నేను జమ కోసం ఖచ్చితమైన సమయ వ్యవధిని ఇవ్వలేను, ఎందుకంటే రెండు బ్యాంకులు దీన్ని ప్రాసెస్ చేస్తున్నాయి, భద్రతా తనిఖీలు మరియు ధృవీకరణలు చేస్తున్నాయి।",
                    fail: "దయచేసి నన్ను దీన్ని తనిఖీ చేయడానికి కొద్ది సేపు ఇవ్వండి. నేను వెంటనే నవీకరణతో మీ వద్దకు తిరిగి వస్తాను!"
                },
                withdrawal: {
                    general: "మీ ఉపసంహరణల గురించి మీ ఆందోళనను నేను పూర్తిగా అర్థం చేసుకున్నాను - మీ డబ్బు ముఖ్యమైనది!",
                    time: "మీరు మీ ఉపసంహరణను పొందడానికి ఆత్రుతగా ఉన్నారని నేను అర్థం చేసుకున్నాను - మరియు సహాయం కోసం నేను ఇక్కడ ఉన్నాను!",
                    fail: "ఈ ఆలస్యం గురించి నేను నిజంగా క్షమించండి - మీకు అవసరమైనప్పుడు మీ డబ్బును పొందడం ఎంత ముఖ్యమైనదో నాకు తెలుసు।"
                },
                account: {
                    general: "మీ ఖాతా మాకు ముఖ్యమైనది, మరియు సహాయం కోసం నేను ఇక్కడ ఉన్నాను!",
                    update: "ఖచ్చితంగా! మీ బ్యాంక్ వివరాలను నవీకరించడంలో మీకు మార్గదర్శకత్వం చేయడానికి నేను సంతోషిస్తున్నాను।",
                    restrict: "దీని గురించి వినడంలో నేను నిజంగా విచారిస్తున్నాను - ఇది ఎంత ఆందోళనకరంగా ఉండాలి అని నేను ఊహించగలను।"
                },
                bonus: {
                    general: "బోనస్‌లతో సహాయం చేయడం నాకు ఇష్టం - అవి ఉత్తేజకరమైనవి!",
                    wagering: "గొప్ప ప్రశ్న! మీ కోసం దీన్ని వివరించడానికి నేను సంతోషిస్తున్నాను।",
                    missing: "ఓహ్, మీరు మీ బోనస్‌ను స్వీకరించలేదని నేను చాలా క్షమించండి - ఇది నిజంగా నిరాశాజనకం!"
                },
                technical: "మీరు సాంకేతిక ఇబ్బందులను ఎదుర్కొంటున్నారని నేను నిజంగా క్షమించండి - ఇది ఎంత నిరాశాజనకంగా ఉండవచ్చో నాకు తెలుసు!",
                complaint: "మీకు ఈ సమస్య ఎదురవుతోందని నేను నిజంగా క్షమించండి - ఇది ఎంత బాధాకరంగా ఉండాలి అని నేను అర్థం చేసుకున్నాను।",
                general: "మీరు సంప్రదించినందుకు నేను చాలా సంతోషిస్తున్నాను! నేను మీ కోసం ఇక్కడ ఉన్నాను మరియు నేను నిజంగా సహాయం చేయాలనుకుంటున్నాను।"
            }
        };
    }

    getResponse(language, category, subcategory = null) {
        const lang = this.responses[language] || this.responses.english;
        if (subcategory && lang[category] && lang[category][subcategory]) {
            return lang[category][subcategory];
        }
        if (lang[category]) {
            return typeof lang[category] === 'string' ? lang[category] : lang[category].general || lang[category];
        }
        return lang.general || this.responses.english.general;
    }
}

// ============================================
// TELEGRAM NOTIFIER
// ============================================
class TelegramNotifier {
    constructor(bot, groupId) {
        this.bot = bot;
        this.groupId = groupId;
    }

    async sendMessage(userId, message) {
        if (!this.bot || !this.groupId) {
            console.log('Telegram not configured. Message would be sent:', message);
            return false;
        }
        try {
            await this.bot.sendMessage(this.groupId, message, { parse_mode: 'Markdown' });
            console.log('Message sent to Telegram group');
            return true;
        } catch (error) {
            console.error('Error sending message:', error.message);
            return false;
        }
    }

    async sendPhoto(userId, photoBuffer, caption = '') {
        if (!this.bot || !this.groupId) {
            console.log('Telegram not configured. Photo would be sent');
            return false;
        }
        try {
            await this.bot.sendPhoto(this.groupId, photoBuffer, { caption: caption, parse_mode: 'Markdown' });
            console.log('Photo sent to Telegram group');
            return true;
        } catch (error) {
            console.error('Error sending photo:', error.message);
            return false;
        }
    }

    async sendVideo(userId, videoBuffer, caption = '', filename = 'video.mp4') {
        if (!this.bot || !this.groupId) {
            console.log('Telegram not configured. Video would be sent');
            return false;
        }
        try {
            await this.bot.sendVideo(this.groupId, videoBuffer, { caption: caption, parse_mode: 'Markdown' });
            console.log('Video sent to Telegram group');
            return true;
        } catch (error) {
            console.error('Error sending video:', error.message);
            return false;
        }
    }

    async sendDocument(userId, fileBuffer, caption = '', filename = 'file') {
        if (!this.bot || !this.groupId) {
            console.error('❌❌❌ Telegram not configured - bot or groupId is missing!');
            console.error(`   bot exists: ${!!this.bot}, groupId: ${this.groupId || 'MISSING'}`);
            return false;
        }
        try {
            console.log(`[Telegram SendDocument] 📤 Sending document to group ${this.groupId} - filename: ${filename}, buffer size: ${fileBuffer.length} bytes, caption length: ${caption.length}`);
            await this.bot.sendDocument(this.groupId, fileBuffer, {
                caption: caption,
                parse_mode: 'Markdown',
                filename: filename
            });
            console.log(`[Telegram SendDocument] ✅✅✅ Document successfully sent to Telegram group ${this.groupId}!`);
            return true;
        } catch (error) {
            console.error(`[Telegram SendDocument] ❌❌❌ Error sending document to Telegram:`, error.message);
            console.error(`[Telegram SendDocument] Error stack:`, error.stack);
            return false;
        }
    }

    async sendBatchDocuments(userId, documents, caption = '') {
        if (!this.bot || !this.groupId) {
            console.log('Telegram not configured. Documents would be sent');
            return false;
        }
        try {
            if (caption) {
                await this.bot.sendMessage(this.groupId, caption, { parse_mode: 'Markdown' });
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            for (const doc of documents) {
                await this.bot.sendDocument(this.groupId, doc.buffer, { filename: doc.filename });
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            console.log(`Sent ${documents.length} documents in batch to Telegram group`);
            return true;
        } catch (error) {
            console.error('Error sending batch documents:', error.message);
            return false;
        }
    }

    async sendMediaGroup(userId, mediaArray) {
        if (!this.bot || !this.groupId) {
            console.log('Telegram not configured. Media group would be sent');
            return false;
        }
        try {
            await this.bot.sendMediaGroup(this.groupId, mediaArray);
            console.log(`Sent media group with ${mediaArray.length} items to Telegram group`);
            return true;
        } catch (error) {
            console.error('Error sending media group:', error.message);
            return false;
        }
    }
}

const telegramNotifier = new TelegramNotifier(telegramBot, TELEGRAM_GROUP_ID);

// ============================================
// YONO777 PROTOCOL HANDLER
// ============================================
class Yono777ProtocolHandler {
    constructor() {
        // VIP Level Deposit Requirements
        this.vipDepositRequirements = {
            0: 0,
            1: 30,
            2: 200,
            3: 1000,
            4: 5000,
            5: 20000,
            6: 100000,
            7: 500000,
            8: 700000,
            9: 1000000,
            10: 3000000,
            11: 5000000,
            12: 10000000,
            13: 20000000,
            14: 35000000,
            15: 50000000,
            16: 100000000,
            17: 200000000,
            18: 500000000,
            19: 1000000000,
            20: 2000000000
        };
        
        // Daily Withdrawal Limits by VIP Level
        this.vipWithdrawalLimits = {
            0: 100,
            1: 200,
            2: 350,
            3: 'unlimited' // VIP 3+ has higher/unrestricted
        };
        
        // Withdrawal Fee Structure
        this.withdrawalFees = {
            below300: { percentage: 3, fixed: 6 },
            above300: { percentage: 2, fixed: 0 }
        };
    }
    
    // Get VIP deposit requirement response
    getVIPDepositResponse(vipLevel, language) {
        const amount = this.vipDepositRequirements[vipLevel];
        if (amount === undefined) return null;
        
        const responses = {
            english: `To achieve VIP ${vipLevel}, a total deposit of ₹${amount.toLocaleString()} is required. VIP level upgrades are based on your total cumulative deposits, not a single transaction. Feel free to ask if you need deposit details for other levels.`,
            hindi: `VIP ${vipLevel} प्राप्त करने के लिए, ₹${amount.toLocaleString()} की कुल जमा राशि आवश्यक है। VIP स्तर अपग्रेड आपकी कुल संचयी जमा राशि पर आधारित होते हैं, एकल लेनदेन पर नहीं। यदि आपको अन्य स्तरों के लिए जमा विवरण की आवश्यकता है, तो कृपया पूछें।`,
            telugu: `VIP ${vipLevel} సాధించడానికి, ₹${amount.toLocaleString()} మొత్తం జమ అవసరం. VIP స్థాయి అప్‌గ్రేడ్‌లు మీ మొత్తం సంచిత జమలపై ఆధారపడి ఉంటాయి, ఒకే లావాదేవీపై కాదు. మీకు ఇతర స్థాయిలకు జమ వివరాలు అవసరమైతే, దయచేసి అడగండి।`
        };
        
        return responses[language] || responses.english;
    }
    
    // Get withdrawal limit response
    getWithdrawalLimitResponse(vipLevel, alreadyWithdrawn, language) {
        const limit = this.vipWithdrawalLimits[vipLevel];
        if (limit === undefined) return null;
        
        if (limit === 'unlimited') {
            const responses = {
                english: `As a VIP ${vipLevel} member, you have unlimited daily withdrawals. You can withdraw any amount you need.`,
                hindi: `VIP ${vipLevel} सदस्य के रूप में, आपकी दैनिक निकासी असीमित है। आप अपनी आवश्यकता के अनुसार कोई भी राशि निकाल सकते हैं।`,
                telugu: `VIP ${vipLevel} సభ్యుడిగా, మీకు అపరిమితమైన రోజువారీ ఉపసంహరణలు ఉన్నాయి. మీకు అవసరమైన ఏ మొత్తాన్ని అయినా ఉపసంహరించుకోవచ్చు।`
            };
            return responses[language] || responses.english;
        }
        
        const remaining = limit - alreadyWithdrawn;
        const responses = {
            english: `As a VIP ${vipLevel} member, your daily withdrawal limit is ₹${limit}. If you have already withdrawn ₹${alreadyWithdrawn} today, you can withdraw only ₹${remaining} more to stay within your limit. For higher or unlimited daily withdrawals, consider upgrading to VIP Level 3.`,
            hindi: `VIP ${vipLevel} सदस्य के रूप में, आपकी दैनिक निकासी सीमा ₹${limit} है। यदि आपने आज पहले से ही ₹${alreadyWithdrawn} निकाल लिया है, तो आप अपनी सीमा के भीतर रहने के लिए केवल ₹${remaining} और निकाल सकते हैं। उच्च या असीमित दैनिक निकासी के लिए, VIP स्तर 3 में अपग्रेड करने पर विचार करें।`,
            telugu: `VIP ${vipLevel} సభ్యుడిగా, మీ రోజువారీ ఉపసంహరణ పరిమితి ₹${limit}. మీరు ఇప్పటికే ₹${alreadyWithdrawn} ఉపసంహరించినట్లయితే, మీ పరిమితిలో ఉండడానికి మీరు ₹${remaining} మాత్రమే ఉపసంహరించుకోవచ్చు. అధిక లేదా అపరిమితమైన రోజువారీ ఉపసంహరణల కోసం, VIP స్థాయి 3కి అప్‌గ్రేడ్ చేయడానికి పరిగణించండి।`
        };
        
        return responses[language] || responses.english;
    }
    
    // Get withdrawal fee explanation
    getWithdrawalFeeResponse(amount, language) {
        let feeInfo;
        if (amount < 300) {
            const fee = (amount * 0.03) + 6;
            feeInfo = {
                english: `For withdrawals below ₹300, a fee of 3% plus ₹6 is charged; for ₹300 or above, it's a 2% fee. For example, withdrawing ₹${amount} incurs a fee of ₹${fee.toFixed(2)}, while ₹400 incurs a fee of ₹8. This fee is deducted automatically from your withdrawal.`,
                hindi: `₹300 से कम निकासी के लिए, 3% प्लस ₹6 शुल्क लगाया जाता है; ₹300 या उससे अधिक के लिए, यह 2% शुल्क है। उदाहरण के लिए, ₹${amount} निकालने पर ₹${fee.toFixed(2)} का शुल्क लगता है, जबकि ₹400 निकालने पर ₹8 का शुल्क लगता है। यह शुल्क आपकी निकासी से स्वचालित रूप से काटा जाता है।`,
                telugu: `₹300 కంటే తక్కువ ఉపసంహరణలకు, 3% ప్లస్ ₹6 రుసుము వసూలు చేయబడుతుంది; ₹300 లేదా అంతకంటే ఎక్కువకు, ఇది 2% రుసుము. ఉదాహరణకు, ₹${amount} ఉపసంహరించడం ₹${fee.toFixed(2)} రుసుమును కలిగిస్తుంది, ₹400 ఉపసంహరించడం ₹8 రుసుమును కలిగిస్తుంది. ఈ రుసుము మీ ఉపసంహరణ నుండి స్వయంచాలకంగా తగ్గించబడుతుంది.`
            };
        } else {
            const fee = amount * 0.02;
            feeInfo = {
                english: `For withdrawals below ₹300, a fee of 3% plus ₹6 is charged; for ₹300 or above, it's a 2% fee. For example, withdrawing ₹200 incurs a fee of ₹12, while ₹${amount} incurs a fee of ₹${fee.toFixed(2)}. This fee is deducted automatically from your withdrawal.`,
                hindi: `₹300 से कम निकासी के लिए, 3% प्लस ₹6 शुल्क लगाया जाता है; ₹300 या उससे अधिक के लिए, यह 2% शुल्क है। उदाहरण के लिए, ₹200 निकालने पर ₹12 का शुल्क लगता है, जबकि ₹${amount} निकालने पर ₹${fee.toFixed(2)} का शुल्क लगता है। यह शुल्क आपकी निकासी से स्वचालित रूप से काटा जाता है।`,
                telugu: `₹300 కంటే తక్కువ ఉపసంహరణలకు, 3% ప్లస్ ₹6 రుసుము వసూలు చేయబడుతుంది; ₹300 లేదా అంతకంటే ఎక్కువకు, ఇది 2% రుసుము. ఉదాహరణకు, ₹200 ఉపసంహరించడం ₹12 రుసుమును కలిగిస్తుంది, ₹${amount} ఉపసంహరించడం ₹${fee.toFixed(2)} రుసుమును కలిగిస్తుంది. ఈ రుసుము మీ ఉపసంహరణ నుండి స్వయంచాలకంగా తగ్గించబడుతుంది.`
            };
        }
        
        return feeInfo[language] || feeInfo.english;
    }
    
    // Check if payment type is deposit or withdrawal
    identifyPaymentType(message, language) {
        const lowerMsg = message.toLowerCase();
        const depositKeywords = {
            english: ['deposit', 'credited', 'added', 'top up', 'recharge'],
            hindi: ['जमा', 'क्रेडिट', 'जोड़ा', 'टॉप अप', 'रिचार्ज'],
            telugu: ['జమ', 'క్రెడిట్', 'జోడించబడింది', 'టాప్ అప్', 'రీఛార్జ్']
        };
        const withdrawalKeywords = {
            english: ['withdrawal', 'withdraw', 'withdrawn', 'payout', 'transfer'],
            hindi: ['निकासी', 'निकालना', 'निकाला', 'भुगतान', 'स्थानांतरण'],
            telugu: ['ఉపసంహరణ', 'ఉపసంహరించు', 'ఉపసంహరించబడింది', 'చెల్లింపు', 'బదిలీ']
        };
        
        const depositKw = depositKeywords[language] || depositKeywords.english;
        const withdrawalKw = withdrawalKeywords[language] || withdrawalKeywords.english;
        
        if (depositKw.some(kw => lowerMsg.includes(kw))) return 'deposit';
        if (withdrawalKw.some(kw => lowerMsg.includes(kw))) return 'withdrawal';
        return null;
    }
    
    // Validate order number format (D05, S05, P05)
    validateOrderNumber(orderNumber) {
        if (!orderNumber) return false;
        const validPrefixes = ['d05', 's05', 'p05'];
        const prefix = orderNumber.toLowerCase().substring(0, 3);
        return validPrefixes.includes(prefix);
    }
}

// ============================================
// OPENAI INTEGRATION
// ============================================
class OpenAIIntegration {
    constructor(openaiClient) {
        this.client = openaiClient;
        this.enabled = !!openaiClient;
        this.model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
        this.maxTokens = parseInt(process.env.OPENAI_MAX_TOKENS) || 200;
        this.dbHelpers = dbHelpers; // Give AI access to database
    }
    
    // Database access methods for AI
    async checkOrderNumber(orderNumber) {
        return new Promise((resolve, reject) => {
            if (!orderNumber) {
                return resolve({ found: false, type: null, data: null });
            }
            
            // Only check deposits database, not withdrawals
            this.dbHelpers.getDepositByOrderNumber(orderNumber, (err, deposit) => {
                if (err) {
                    console.error('Error checking deposit:', err);
                    return reject(err);
                }
                
                if (deposit) {
                    return resolve({ found: true, type: 'deposit', data: deposit, orderNumber: orderNumber });
                }
                
                // Order not found in deposits - return not found (don't check withdrawals)
                resolve({ found: false, type: null, data: null, orderNumber: orderNumber });
            });
        });
    }
    
    async getUserInfo(userId) {
        return new Promise((resolve, reject) => {
            this.dbHelpers.getOrCreateUser(userId, 'english', (err, user) => {
                if (err) {
                    return reject(err);
                }
                resolve(user);
            });
        });
    }
    
    async getConversationHistory(userId, limit = 50) {
        return new Promise((resolve, reject) => {
            this.dbHelpers.getConversationHistory(userId, limit, (err, history) => {
                if (err) {
                    return reject(err);
                }
                resolve(history || []);
            });
        });
    }
    
    async generateResponse(message, context, conversationHistory, language, issueType, additionalContext = {}) {
        if (!this.enabled) {
            throw new Error('OpenAI is not enabled. Please configure OPENAI_API_KEY and USE_OPENAI=true in .env');
        }
        
        try {
            // AI can access database - check order numbers automatically if mentioned
            let databaseInfo = {};
            
            // Extract order number from message or context
            const orderNumberPatterns = [
                /(?:order|txn|transaction|ref|reference)[:\s#]*([A-Z0-9]{6,})/i,
                /(s05|d05|p05)\d{19}/i,
                /order[:\s#]*(\d{6,})/i
            ];
            
            let extractedOrderNumber = null;
            for (const pattern of orderNumberPatterns) {
                const match = message.match(pattern);
                if (match && match[1]) {
                    extractedOrderNumber = match[1];
                    break;
                }
            }
            
            // Also check conversation history for order numbers
            if (!extractedOrderNumber && conversationHistory) {
                for (let i = conversationHistory.length - 1; i >= 0 && i >= conversationHistory.length - 10; i--) {
                    const msg = conversationHistory[i];
                    if (msg.role === 'user') {
                        for (const pattern of orderNumberPatterns) {
                            const match = msg.message.match(pattern);
                            if (match && match[1]) {
                                extractedOrderNumber = match[1];
                                break;
                            }
                        }
                        if (extractedOrderNumber) break;
                    }
                }
            }
            
            // Use order number from additionalContext if provided
            if (additionalContext.orderNumber && !extractedOrderNumber) {
                extractedOrderNumber = additionalContext.orderNumber;
            }
            
            // Check database if order number is available and not already checked
            if (extractedOrderNumber && additionalContext.orderFound === undefined) {
                try {
                    const orderData = await this.checkOrderNumber(extractedOrderNumber);
                    databaseInfo = {
                        orderNumber: extractedOrderNumber,
                        orderFound: orderData.found,
                        orderType: orderData.type,
                        orderData: orderData.data,
                        transactionSuccessful: orderData.found && orderData.data?.paymentStatus === 'successful'
                    };
                } catch (dbError) {
                    console.error('[AI Database] Error checking order:', dbError);
                }
            }
            
            // Merge database info with additional context
            const enhancedContext = {
                ...additionalContext,
                ...databaseInfo
            };
            
            // Build system prompt based on context (now includes database info)
            const systemPrompt = this.buildSystemPrompt(language, issueType, context, enhancedContext);
            
            // Build conversation messages for OpenAI
            const messages = this.buildConversationMessages(systemPrompt, conversationHistory, message);
            
            // Call OpenAI API
            // Call OpenAI API with higher temperature and penalties for more varied, human-like responses
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: messages,
                max_tokens: this.maxTokens,
                temperature: 0.9, // Increased from 0.7 for more creativity and variation
                top_p: 0.95, // Slightly reduced for more focused but still varied responses
                frequency_penalty: 0.6, // Increased from 0.3 to strongly discourage repetition
                presence_penalty: 0.5 // Increased from 0.3 to encourage new topics/phrases
            });
            
            if (response && response.choices && response.choices[0] && response.choices[0].message) {
                let aiResponse = response.choices[0].message.content.trim();
                
                // CRITICAL: Remove any internal context markers that might have leaked into the response
                aiResponse = this.cleanResponseFromContext(aiResponse);
                
                // Enforce exact response for order not found case (deposit, order number provided, no receipt)
                // CRITICAL: Triple-check conversation history before asking for receipt
                if (enhancedContext.orderFound === false && 
                    enhancedContext.orderNumber && 
                    issueType === 'deposit') {
                    // Check conversation history MULTIPLE ways to ensure receipt really doesn't exist
                    const history = this.conversationHistory.get(userId) || [];
                    const receiptExists = this.hasReceiptBeenUploaded(history);
                    
                    // Also check for receipt messages directly
                    const receiptMessages = history.filter(h => h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video'));
                    const hasReceiptByFileType = receiptMessages.length > 0;
                    
                    // If ANY check says receipt exists, NEVER ask for it
                    const receiptReallyExists = receiptExists || hasReceiptByFileType || enhancedContext.hasReceipt;
                    
                    console.log(`[Response Enforcement] Receipt check - receiptExists: ${receiptExists}, hasReceiptByFileType: ${hasReceiptByFileType}, enhancedContext.hasReceipt: ${enhancedContext.hasReceipt}, receiptReallyExists: ${receiptReallyExists}`);
                    
                    if (!receiptReallyExists) {
                        // Receipt really doesn't exist - use exact required response
                        aiResponse = "The order number is currently on pending status. Can you provide me a deposit receipt for deep and better checking on it?";
                        console.log('[Response Enforcement] Using exact required response for order not found case (no receipt in history)');
                    } else {
                        // Receipt exists - NEVER ask for it again, let template logic handle it
                        console.log('[Response Enforcement] Receipt found - SKIPPING "ask for receipt" response. Will use template logic instead.');
                        // Ensure response follows protocol (max 3 sentences)
                        aiResponse = this.limitToThreeSentences(aiResponse, language);
                    }
                } else {
                    // Ensure response follows protocol (max 3 sentences) for other cases
                    aiResponse = this.limitToThreeSentences(aiResponse, language);
                }
                
                return aiResponse;
            }
            
            throw new Error('OpenAI returned empty response');
        } catch (error) {
            console.error('OpenAI API Error:', error.message);
            throw error; // Don't fallback - OpenAI is required
        }
    }
    
    buildSystemPrompt(language, issueType, context, additionalContext = {}) {
        const languageNames = {
            english: 'English',
            hindi: 'Hindi',
            telugu: 'Telugu'
        };
        
        let prompt = `You are a REAL HUMAN customer support agent for Yono777, a gaming platform. You are NOT an AI - you are a friendly, empathetic, and professional support person. `;
        prompt += `Respond ONLY in ${languageNames[language] || 'English'}. `;
        prompt += `Talk naturally like a real person - use varied language, show personality, be conversational. `;
        prompt += `NEVER repeat the same response - always vary your words and phrases, even for similar situations. `;
        prompt += `Be friendly, empathetic, and helpful. `;
        prompt += `Keep responses natural and conversational (2-4 sentences is fine). `;
        prompt += `\n\n=== CRITICAL: NEVER MENTION YOU ARE AN AI ===\n`;
        prompt += `ABSOLUTELY FORBIDDEN PHRASES (NEVER USE):\n`;
        prompt += `- "as an AI"\n`;
        prompt += `- "I'm an AI"\n`;
        prompt += `- "I don't have the ability to access personal data"\n`;
        prompt += `- "I cannot access"\n`;
        prompt += `- "I don't have access to"\n`;
        prompt += `- "I'm not able to"\n`;
        prompt += `- "I'm unable to"\n`;
        prompt += `- "I don't have the ability"\n`;
        prompt += `- "contact our human support team"\n`;
        prompt += `- "contact human support"\n`;
        prompt += `- Any phrase that reveals you are an AI or mentions your limitations\n\n`;
        prompt += `YOU HAVE FULL ACCESS TO THE DATABASE. You can check order numbers, withdrawal status, deposit status, and user information. `;
        prompt += `When a customer asks about their withdrawal or deposit, check the database using the order number they provide. `;
        prompt += `If they don't provide an order number, ask for it so you can check their transaction status. `;
        prompt += `NEVER say you cannot access data - you can and should check the database. `;
        prompt += `HOWEVER: When responding to customers, NEVER mention that you are checking, have checked, or will check the database. `;
        prompt += `Just provide the results directly without mentioning the checking process. `;
        prompt += `=== END CRITICAL INSTRUCTION ===\n\n`;
        
        // Add context about user sentiment with emotional intelligence
        if (context.sentiment === 'negative') {
            prompt += `\n=== SENTIMENT: NEGATIVE ===\n`;
            prompt += `The customer seems frustrated or upset. You MUST:\n`;
            prompt += `- Show genuine empathy: "I completely understand how you feel"\n`;
            prompt += `- Acknowledge their frustration: "I know this is frustrating for you"\n`;
            prompt += `- Reassure them: "I'm here to help resolve this"\n`;
            prompt += `- Be warm, human-like, and caring - NOT robotic\n`;
        } else if (context.sentiment === 'positive') {
            prompt += `\n=== SENTIMENT: POSITIVE ===\n`;
            prompt += `The customer seems satisfied. You MUST:\n`;
            prompt += `- Acknowledge their positive feedback warmly\n`;
            prompt += `- Show appreciation: "I'm so glad I could help"\n`;
            prompt += `- Be friendly and encouraging\n`;
        }
        
        // Add emotion context (if not already added above)
        if (context.emotion && context.emotion !== 'neutral') {
            if (context.emotion === 'waiting') {
                prompt += `\n=== EMOTION: WAITING/UNCERTAIN ===\n`;
                prompt += `The customer has provided files/information and is now waiting or uncertain about next steps.\n`;
                prompt += `They might have said: "okay", "now nothing?", "what next?", "done"\n`;
                prompt += `You MUST:\n`;
                prompt += `- Acknowledge their patience: "Thank you for your patience"\n`;
                prompt += `- Provide clear next steps: "Our team is reviewing your documents"\n`;
                prompt += `- Reassure them: "You don't need to do anything else - just relax"\n`;
                prompt += `- Show appreciation: "I truly appreciate you bearing with us"\n`;
                prompt += `- NEVER repeat the same acknowledgment - personalize your response\n`;
                prompt += `- If you already said "Thank you for providing all documents", DO NOT say it again\n`;
                prompt += `- Instead say something like: "Everything is being processed correctly. Our team is reviewing all your documents thoroughly. You don't need to do anything else right now - just sit back and relax. I'll make sure everything is handled properly."\n`;
            }
        }
        
        // CRITICAL: Add context about recent messages to prevent duplicates
        if (additionalContext._recentAssistantMessages) {
            const recentMessages = additionalContext._recentAssistantMessages;
            if (recentMessages.length > 0) {
                prompt += `\n=== CRITICAL: RECENT RESPONSES ===\n`;
                prompt += `You have recently sent these responses:\n`;
                recentMessages.forEach((msg, idx) => {
                    if (msg.message) {
                        prompt += `${idx + 1}. "${msg.message.substring(0, 100)}${msg.message.length > 100 ? '...' : ''}"\n`;
                    }
                });
                prompt += `\nDO NOT repeat any of these responses. Generate a DIFFERENT, VARIED response that:\n`;
                prompt += `- Acknowledges the customer's message\n`;
                prompt += `- Provides new information or reassurance\n`;
                prompt += `- Uses different words and phrasing\n`;
                prompt += `- Shows you're actively engaged and not just repeating yourself\n`;
                prompt += `=== END RECENT RESPONSES ===\n\n`;
            }
        }
        
        // Add urgency information
        if (context.urgency === 'high') {
            prompt += `This is an urgent matter - prioritize helping the customer quickly with extra empathy. `;
        }
        
        // Handle greeting messages
        if (additionalContext.isGreeting) {
            prompt += `This is the first message from the customer. Greet them warmly and ask how you can help. `;
            prompt += `Be friendly and welcoming. `;
        }
        
        // Handle file uploads (PDF, password, video) - simple acknowledgment
        if (additionalContext.hasFileUpload) {
            prompt += `\n\n=== FILE UPLOAD ACKNOWLEDGMENT ===\n`;
            if (additionalContext.passwordProvided || additionalContext.fileType === 'password') {
                prompt += `The customer has provided a PASSWORD for their PDF file. `;
                prompt += `Acknowledge the password as received and state that you will forward all information to the relevant team. `;
            } else {
                prompt += `The customer has provided files (PDF or video recording). `;
                prompt += `Acknowledge that you have received the files and will forward them to the relevant team for deep checking. `;
            }
            prompt += `=== END FILE UPLOAD INSTRUCTION ===\n\n`;
        }
        
        // Add available context information (data only, no directives)
        if (additionalContext.orderNumber) {
            prompt += `Order number provided: ${additionalContext.orderNumber}. `;
        }
        if (additionalContext.hasReceipt) {
            prompt += `Customer has uploaded a receipt. `;
        }
        if (additionalContext.orderFound !== undefined) {
            if (additionalContext.orderFound === true) {
                const orderData = additionalContext.orderData || {};
                prompt += `Database check: Order found. `;
                if (orderData.amount) {
                    prompt += `Amount: ₹${orderData.amount}. `;
                }
                if (orderData.paymentStatus) {
                    prompt += `Status: ${orderData.paymentStatus}. `;
                }
            } else {
                prompt += `Database check: Order not found. `;
            }
        }
        
        // Add issue type context
        if (issueType === 'deposit') {
            prompt += `\n\n=== DEPOSIT CONCERN HANDLING PROCESS ===\n`;
            prompt += `Follow this EXACT process for deposit concerns:\n\n`;
            
            // Step 1: Greeting and ask for order number
            if (!additionalContext.orderNumber && !additionalContext.hasReceipt) {
                prompt += `STEP 1: Start with a warm greeting and ask for the order number. `;
                prompt += `Say something like: "Hello! I'm here to assist you with your deposit concern. To help you better, could you please provide your order number?" `;
            }
            // Step 2: Order number received - check database
            else if (additionalContext.orderNumber && !additionalContext.hasReceipt) {
                prompt += `\n\n=== STEP 2: ORDER NUMBER RECEIVED ===\n`;
                prompt += `Order number: ${additionalContext.orderNumber}. `;
                prompt += `\nABSOLUTELY FORBIDDEN PHRASES - NEVER USE THESE:\n`;
                prompt += `- "I've checked the database"\n`;
                prompt += `- "I checked the database"\n`;
                prompt += `- "I'm checking the database"\n`;
                prompt += `- "I've checked our system"\n`;
                prompt += `- "I checked our system"\n`;
                prompt += `- "I've checked"\n`;
                prompt += `- "I checked"\n`;
                prompt += `- "I'm checking"\n`;
                prompt += `- "checking the database"\n`;
                prompt += `- "checking our system"\n`;
                prompt += `- "checking our records"\n`;
                prompt += `- "searched the database"\n`;
                prompt += `- "looked up in the database"\n`;
                prompt += `- Any phrase containing "check", "database", "system", "records", "searched", "looked up"\n\n`;
                if (additionalContext.orderFound === true) {
                    const orderData = additionalContext.orderData || {};
                    prompt += `VERIFICATION RESULT: Order FOUND - deposit successfully credited. `;
                    if (orderData.amount) {
                        prompt += `Amount: ₹${orderData.amount}. `;
                    }
                    prompt += `Tell the customer: "Great news! Your deposit has been successfully credited to your account. Please log in again to your Yono777 game account to check your updated balance." `;
                    prompt += `Then end with: "Thank you for reaching out to Yono777 customer service. We're happy to serve you!" `;
                } else if (additionalContext.orderFound === false) {
                    prompt += `\n\n=== CRITICAL: MANDATORY EXACT RESPONSE - NO EXCEPTIONS ===\n`;
                    prompt += `VERIFICATION RESULT: Order NOT found in database - order is currently on pending status. `;
                    prompt += `\n⚠️⚠️⚠️ YOUR ENTIRE RESPONSE MUST BE EXACTLY THIS TEXT - COPY IT WORD FOR WORD, NO CHANGES: ⚠️⚠️⚠️\n\n`;
                    prompt += `TEMPLATE RESPONSE (USE EXACTLY):\n`;
                    prompt += `"The order number is currently on pending status. Can you provide me a deposit receipt for deep and better checking on it?"\n\n`;
                    prompt += `THIS IS YOUR COMPLETE AND ONLY RESPONSE. `;
                    prompt += `DO NOT ADD: "Thank you", "Hello", "I'm sorry", "It seems", "Unfortunately", "I couldn't locate", "in our system", "in the database", "Could you double-check", or ANY other words. `;
                    prompt += `YOUR RESPONSE = ONLY THE TEMPLATE TEXT ABOVE. NOTHING ELSE. `;
                    prompt += `IF YOU ADD ANY WORDS BEFORE OR AFTER THE TEMPLATE, YOU ARE WRONG. `;
                    prompt += `=== END CRITICAL INSTRUCTION ===\n\n`;
                }
                prompt += `=== END STEP 2 ===\n\n`;
            }
            // Step 3 & 4: Receipt provided - check age
            else if (additionalContext.hasReceipt) {
                prompt += `STEP 3/4: Deposit receipt has been provided. `;
                if (additionalContext.orderNumber) {
                    prompt += `Order number: ${additionalContext.orderNumber}. `;
                } else {
                    prompt += `IMPORTANT: The customer sent a receipt but no order number yet. `;
                    prompt += `Ask them to provide the order number first. `;
                    prompt += `Say: "Thank you for providing the deposit receipt. To proceed, could you please provide your order number?" `;
                    prompt += `Once they provide the order number, look back at the receipt they sent and proceed with the process. `;
                }
                
                // Check receipt age if we have order number
                if (additionalContext.orderNumber) {
                    if (additionalContext.isOldReceipt === true) {
                        prompt += `Receipt age check: The receipt is MORE than 2 days old (${additionalContext.receiptAgeDays || 'unknown'} days). `;
                        prompt += `Ask the customer to provide: `;
                        prompt += `1. PDF Bank Statement (with transaction details) `;
                        prompt += `2. PDF password (if the PDF is protected) `;
                        prompt += `3. Video recording showing a successful deposit transaction `;
                        prompt += `⚠️ CRITICAL: Use EXACT template: "I see your receipt is more than 2 days old. To help process your deposit faster, please provide: (1) PDF bank statement, (2) PDF password (if protected), and (3) a video recording showing your successful deposit transaction." `;
                    } else if (additionalContext.isOldReceipt === false) {
                        prompt += `Receipt age check: The receipt is LESS than 2 days old (${additionalContext.receiptAgeDays || 'unknown'} days). `;
                        prompt += `Inform the customer to wait 24-48 hours. `;
                        prompt += `⚠️ CRITICAL: Use EXACT template: "Thank you for providing your deposit receipt. Your transaction is currently being processed. Please wait 24-48 hours for it to be credited to your account. Your money is 100% safe with us. Thank you for reaching out to Yono777 customer service. We're happy to serve you!" `;
                    } else {
                        // Receipt age not determined yet - check if order found
                        if (additionalContext.orderFound === false) {
                            prompt += `Order not found in database. `;
                            prompt += `Check the receipt age. If less than 2 days, ask to wait 24-48 hours. If 2+ days old, ask for PDF, password, and video. `;
                        }
                    }
                }
            }
            
            // Step 5: Always end with thankful message (except when asking for something)
            if (additionalContext.orderFound === true || (additionalContext.hasReceipt && additionalContext.isOldReceipt === false)) {
                prompt += `Always end your response with: "Thank you for reaching out to Yono777 customer service. We're happy to serve you!" `;
            }
            
            prompt += `=== END DEPOSIT CONCERN PROCESS ===\n\n`;
        } else if (issueType === 'withdrawal') {
            prompt += `The customer is asking about a withdrawal. `;
        } else if (issueType === 'bonus') {
            prompt += `The customer is asking about bonuses. `;
        } else if (issueType === 'account') {
            prompt += `The customer is asking about their account. `;
        } else if (issueType === 'technical issue') {
            prompt += `The customer is experiencing a technical issue. `;
        }
        
        // Add emotion context with detailed empathy instructions
        if (context.emotion === 'frustrated') {
            prompt += `\n=== EMOTION: FRUSTRATED ===\n`;
            prompt += `The customer is frustrated or impatient. You MUST:\n`;
            prompt += `- Show deep empathy: "I completely understand your frustration"\n`;
            prompt += `- Acknowledge their feelings: "I know waiting is difficult"\n`;
            prompt += `- Reassure them: "I'm personally looking into this for you"\n`;
            prompt += `- Be warm and human-like, not robotic\n`;
            prompt += `- NEVER repeat the same response - personalize it\n`;
        } else if (context.emotion === 'worried') {
            prompt += `\n=== EMOTION: WORRIED ===\n`;
            prompt += `The customer is worried or anxious. You MUST:\n`;
            prompt += `- Provide strong reassurance: "Your money is 100% safe with us"\n`;
            prompt += `- Show you care: "I understand your concern and I'm here to help"\n`;
            prompt += `- Be comforting and supportive\n`;
        } else if (context.emotion === 'waiting') {
            prompt += `\n=== EMOTION: WAITING/UNCERTAIN ===\n`;
            prompt += `The customer has provided files/information and is now waiting or uncertain about next steps.\n`;
            prompt += `They might have said: "okay", "now nothing?", "what next?", "done"\n`;
            prompt += `You MUST:\n`;
            prompt += `- Acknowledge their patience: "Thank you for your patience"\n`;
            prompt += `- Provide clear next steps: "Our team is reviewing your documents"\n`;
            prompt += `- Reassure them: "You don't need to do anything else - just relax"\n`;
            prompt += `- Show appreciation: "I truly appreciate you bearing with us"\n`;
            prompt += `- NEVER repeat the same acknowledgment - personalize your response\n`;
            prompt += `- If you already said "Thank you for providing all documents", DO NOT say it again\n`;
            prompt += `- Instead say something like: "Everything is being processed correctly. Our team is reviewing all your documents thoroughly. You don't need to do anything else right now - just sit back and relax. I'll make sure everything is handled properly."\n`;
        } else if (context.emotion === 'confused') {
            prompt += `\n=== EMOTION: CONFUSED ===\n`;
            prompt += `The customer seems confused or uncertain. You MUST:\n`;
            prompt += `- Explain things clearly and simply\n`;
            prompt += `- Provide guidance: "Let me help clarify this for you"\n`;
            prompt += `- Be patient and understanding\n`;
        } else if (context.emotion === 'happy') {
            prompt += `\n=== EMOTION: HAPPY/SATISFIED ===\n`;
            prompt += `The customer seems satisfied or happy. You MUST:\n`;
            prompt += `- Acknowledge their positive feedback warmly\n`;
            prompt += `- Show appreciation: "I'm so glad I could help"\n`;
            prompt += `- Offer continued support\n`;
        }
        
        prompt += `Always maintain a professional and supportive tone. `;
        prompt += `If you don't know something, ask for more details or offer to escalate to a human agent. `;
        prompt += `Never make up information - only provide accurate information about Yono777 services.`;
        
        return prompt;
    }
    
    buildConversationMessages(systemPrompt, history, currentMessage) {
        const messages = [
            { role: 'system', content: systemPrompt }
        ];
        
        // CRITICAL: Analyze ENTIRE conversation history to build comprehensive context
        // Extract key information from ALL messages, not just recent ones
        const conversationSummary = this.buildConversationSummary ? this.buildConversationSummary(history) : null;
        
        // Add conversation summary as context
        if (conversationSummary) {
            messages.push({
                role: 'system',
                content: `[CONVERSATION SUMMARY - READ THIS FIRST]\n${conversationSummary}\n[END SUMMARY]\n\n🚨 CRITICAL: Use this summary to understand the ENTIRE conversation.\n- If order number is listed, it was already provided - DO NOT ask for it again.\n- If receipt is listed, it was already uploaded - DO NOT ask for it again.\n- Use this information to provide accurate responses based on what was already shared.`
            });
        }
        
        // Add recent conversation history (last 20 messages for context, increased from 10)
        const recentHistory = history.slice(-20);
        for (const msg of recentHistory) {
            if (msg.role === 'user' || msg.role === 'assistant') {
                let content = msg.message || '';
                // Add file type context for file uploads
                if (msg.fileType) {
                    const fileTypeName = msg.fileType === 'image' ? 'deposit receipt (image)' : 
                                       msg.fileType === 'pdf' ? 'PDF bank statement' : 
                                       msg.fileType === 'video' ? 'video recording' : 
                                       msg.fileType;
                    content = `[Customer uploaded ${fileTypeName}]\n${content}`;
                }
                messages.push({
                    role: msg.role,
                    content: content
                });
            }
        }
        
        // Add current message
        messages.push({
            role: 'user',
            content: currentMessage
        });
        
        return messages;
    }
    
    buildConversationSummary(history) {
        if (!history || history.length === 0) return null;
        
        const summary = [];
        
        // Extract order numbers from ALL messages
        const orderNumbers = [];
        const orderPatterns = [
            /(s05|d05|p05|t26)\d{19,22}/i,
            /order[:\s]*(s05|d05|p05|t26)\d{19,22}/i
        ];
        
        for (const msg of history) {
            if (msg.role === 'user' && msg.message && typeof msg.message === 'string') {
                for (const pattern of orderPatterns) {
                    const match = msg.message.match(pattern);
                    if (match) {
                        const orderNum = (match[1] || match[0]).trim().toUpperCase();
                        if (orderNum && !orderNumbers.includes(orderNum)) {
                            orderNumbers.push(orderNum);
                        }
                        break;
                    }
                }
            }
        }
        if (orderNumbers.length > 0) {
            summary.push(`Order numbers provided: ${orderNumbers.join(', ')}`);
        }
        
        // Check for receipts in ALL messages
        const hasReceipt = history.some(msg => 
            msg.role === 'user' && (msg.fileType === 'image' || msg.fileType === 'pdf' || msg.fileType === 'video')
        );
        if (hasReceipt) {
            summary.push('Deposit receipt has been uploaded');
        }
        
        // Check for PDF/video/password
        const hasPDF = history.some(msg => msg.role === 'user' && msg.fileType === 'pdf');
        const hasVideo = history.some(msg => msg.role === 'user' && msg.fileType === 'video');
        const hasPassword = history.some(msg => msg.role === 'user' && msg.fileType === 'password');
        
        if (hasPDF) summary.push('PDF bank statement has been uploaded');
        if (hasVideo) summary.push('Video recording has been uploaded');
        if (hasPassword) summary.push('PDF password has been provided');
        
        // Extract receipt info if available
        for (const msg of history) {
            if (msg.role === 'user' && msg.receiptValidation) {
                const val = msg.receiptValidation;
                if (val.foundOrderNumber) {
                    summary.push(`Receipt contains order number: ${val.foundOrderNumber}`);
                }
                if (val.foundDate) {
                    summary.push(`Receipt transaction date: ${val.foundDate}`);
                    // Calculate and add receipt age for OpenAI context alignment
                    try {
                        const receiptDate = new Date(val.foundDate);
                        if (!isNaN(receiptDate.getTime())) {
                            const now = new Date();
                            const diffTime = Math.abs(now - receiptDate);
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            if (diffDays > 2) {
                                summary.push(`Receipt age: ${diffDays} days old (MORE than 2 days - requires PDF, password, and video)`);
                            } else {
                                summary.push(`Receipt age: ${diffDays} days old (LESS than 2 days - wait 24-48 hours)`);
                            }
                        }
                    } catch (e) {
                        // Ignore date parsing errors
                    }
                }
                if (val.foundAmount) {
                    summary.push(`Receipt amount: ₹${val.foundAmount}`);
                }
                break; // Only need first receipt
            }
        }
        
        return summary.length > 0 ? summary.join('\n') : null;
    }
    
    // Alias for buildConversationSummary to match the expected method name
    buildConversationSummaryForContext(history) {
        return this.buildConversationSummary(history);
    }
    
    limitToThreeSentences(response, language) {
        // Split by sentence endings (., !, ?)
        const sentenceEndings = /[.!?]+/g;
        const sentences = response.split(sentenceEndings).filter(s => s.trim().length > 0);
        
        // If 3 or fewer sentences, return as is
        if (sentences.length <= 3) {
            return response;
        }
        
        // Take only first 3 sentences
        const firstThree = sentences.slice(0, 3);
        let result = '';
        
        for (let i = 0; i < firstThree.length; i++) {
            const sentence = firstThree[i].trim();
            result += sentence;
            
            // Add punctuation if missing
            if (!/[.!?]$/.test(sentence)) {
                result += '.';
            }
            
            if (i < firstThree.length - 1) {
                result += ' ';
            }
        }
        
        return result.trim();
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================
// Calculate similarity between two strings (0-1, where 1 is identical)
function calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;
    
    // Simple word-based similarity
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    const allWords = new Set([...words1, ...words2]);
    
    let matches = 0;
    for (const word of allWords) {
        if (words1.includes(word) && words2.includes(word)) {
            matches++;
        }
    }
    
    return matches / allWords.size;
}

// ============================================
// YONO777 SUPPORT AGENT (with Enhanced Deposit Concern Flow)
// ============================================
class Yono777SupportAgent {
    constructor() {
        this.languageDetector = new LanguageDetector();
        this.processedMessages = new Set(); // Track processed messages to prevent duplicates
        this.contextAnalyzer = new ContextAnalyzer();
        this.multilingual = new MultilingualResponses();
        this.responseGenerator = new EnhancedResponseGenerator();
        this.protocolHandler = new Yono777ProtocolHandler();
        this.conversationMemory = new ConversationMemory();
        this.conversationHistory = new Map();
        
        // Reliability metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            offensiveContentDetected: 0,
            duplicateMessages: 0,
            errors: []
        };
        
        // Circuit breaker for OpenAI (prevent cascading failures)
        this.circuitBreaker = {
            failures: 0,
            lastFailureTime: null,
            state: 'closed', // closed, open, half-open
            threshold: 5, // Open circuit after 5 failures
            timeout: 60000 // 1 minute timeout before trying again
        };
        this.isFirstMessage = new Map();
        this.attemptCount = new Map();
        this.threads = new Map(); // Store OpenAI thread IDs per user
        this.openaiClient = openaiClient;
        this.assistantId = null;
        this.messageQueue = new Map(); // Queue messages per user for batching
        this.messageTimers = new Map(); // Timers for debouncing messages
        // Initialize assistant asynchronously (don't await in constructor)
        this.initializeAssistant().catch(err => {
            console.error('Error initializing assistant:', err);
        });
    }
    
    async initializeAssistant() {
        if (!this.openaiClient) {
            console.log('⚠️ OpenAI client not available, using template-based responses');
            return;
        }
        
        try {
            // Read system instruction from file
            const systemInstruction = fs.readFileSync(path.join(__dirname, 'openai_system_instruction.md'), 'utf8');
            
            // Check if assistant ID is set in environment
            const existingAssistantId = process.env.OPENAI_ASSISTANT_ID;
            
            if (existingAssistantId) {
                // Verify the assistant exists
                try {
                    await this.openaiClient.beta.assistants.retrieve(existingAssistantId);
                    this.assistantId = existingAssistantId;
                    console.log(`✅ Using existing OpenAI Assistant from .env: ${this.assistantId}`);
                } catch (err) {
                    console.warn(`⚠️ Assistant ID from .env not found: ${existingAssistantId}`);
                    console.log('🔍 Searching for existing assistant by name...');
                    // Fall through to search by name
                }
            }
            
            // If no assistant ID set or assistant not found, try to find existing one by name
            if (!this.assistantId) {
                try {
                    console.log('🔍 Searching for existing "Yono777 Customer Support Agent" assistant...');
                    const assistants = await this.openaiClient.beta.assistants.list({
                        limit: 100
                    });
                    
                    // Find assistant with matching name
                    const existingAssistant = assistants.data.find(
                        a => a.name === "Yono777 Customer Support Agent"
                    );
                    
                    if (existingAssistant) {
                        this.assistantId = existingAssistant.id;
                        console.log(`✅ Found existing OpenAI Assistant: ${this.assistantId}`);
                        console.log(`💡 Add this to your .env file: OPENAI_ASSISTANT_ID=${this.assistantId}`);
                    }
                } catch (err) {
                    console.warn('⚠️ Could not search for existing assistants:', err.message);
                }
            }
            
            // If still no assistant found, create a new one
            if (!this.assistantId) {
                console.log('📝 Creating new OpenAI Assistant...');
                const assistant = await this.openaiClient.beta.assistants.create({
                    name: "Yono777 Customer Support Agent",
                    instructions: systemInstruction,
                    model: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
                    tools: [{
                        type: "function",
                        function: {
                            name: "check_order_number",
                            description: "Check if an order number exists in the deposits database and retrieve deposit information",
                            parameters: {
                                type: "object",
                                properties: {
                                    orderNumber: {
                                        type: "string",
                                        description: "The order number to check (e.g., s052602031022342625183)"
                                    }
                                },
                                required: ["orderNumber"]
                            }
                        }
                    }]
                });
                
                this.assistantId = assistant.id;
                console.log(`✅ Created new OpenAI Assistant: ${this.assistantId}`);
                console.log(`💡 IMPORTANT: Add this to your .env file to prevent creating duplicates:`);
                console.log(`   OPENAI_ASSISTANT_ID=${this.assistantId}`);
            }
        } catch (error) {
            console.error('❌ Error initializing OpenAI Assistant:', error.message);
            console.log('⚠️ Falling back to template-based responses');
        }
    }
    
    async syncConversationHistoryToThread(threadId, userId) {
        // Get full conversation history from both memory and database
        const memoryHistory = this.conversationHistory.get(userId) || [];
        
        // Also get from database to ensure we have everything
        const dbHistory = await new Promise((resolve) => {
            dbHelpers.getConversationHistory(userId, 500, (err, history) => {
                if (err) {
                    console.error('[OpenAI] Error loading history for sync:', err);
                    resolve([]);
                } else {
                    const formattedHistory = (history || []).map(h => ({
                        role: 'user',
                        message: h.userMessage,
                        timestamp: h.timestamp,
                        fileType: h.fileType || null
                    })).concat((history || []).map(h => ({
                        role: 'assistant',
                        message: h.botResponse,
                        timestamp: h.timestamp
                    })));
                    resolve(formattedHistory);
                }
            });
        });
        
        // Merge histories
        const mergedHistory = [...memoryHistory];
        for (const dbMsg of dbHistory) {
            const exists = mergedHistory.some(memMsg => 
                memMsg.message === dbMsg.message && 
                memMsg.role === dbMsg.role &&
                Math.abs(new Date(memMsg.timestamp || 0) - new Date(dbMsg.timestamp || 0)) < 5000
            );
            if (!exists) {
                mergedHistory.push(dbMsg);
            }
        }
        
        // Sort by timestamp
        mergedHistory.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
        
        // Get existing messages in thread
        let existingMessages = [];
        try {
            const threadMessages = await this.openaiClient.beta.threads.messages.list(threadId, { limit: 100 });
            existingMessages = threadMessages.data.map(msg => {
                const content = msg.content[0];
                return {
                    role: msg.role,
                    content: content.type === 'text' ? content.text.value : (content.type === 'image_file' ? '[Image uploaded]' : '[File uploaded]'),
                    timestamp: msg.created_at
                };
            });
        } catch (error) {
            console.error('[OpenAI] Error fetching existing thread messages:', error);
        }
        
        // Add missing messages to thread (only add messages not already in thread)
        let syncedCount = 0;
        for (const historyMsg of mergedHistory) {
            // Format message for OpenAI thread
            let messageContent = historyMsg.message || '';
            
            // If it's a file upload, add context
            if (historyMsg.fileType) {
                const fileTypeName = historyMsg.fileType === 'image' ? 'deposit receipt (image)' : 
                                   historyMsg.fileType === 'pdf' ? 'PDF bank statement' : 
                                   historyMsg.fileType === 'video' ? 'video recording' : 
                                   historyMsg.fileType;
                messageContent = `[Customer uploaded ${fileTypeName}]\n${messageContent || 'File uploaded'}`;
            }
            
            // Check if this message already exists in thread
            const existsInThread = existingMessages.some(existing => {
                const existingContent = (existing.content && typeof existing.content === 'string') ? existing.content : String(existing.content || '');
                const msgContent = (messageContent && typeof messageContent === 'string') ? messageContent : String(messageContent || '');
                return existing.role === historyMsg.role && 
                       (existingContent.includes(msgContent.substring(0, 50)) || 
                        msgContent.includes(existingContent.substring(0, 50)));
            });
            
            if (!existsInThread && messageContent.trim()) {
                try {
                    await this.openaiClient.beta.threads.messages.create(threadId, {
                        role: historyMsg.role === 'user' ? 'user' : 'assistant',
                        content: messageContent
                    });
                    syncedCount++;
                } catch (error) {
                    console.error(`[OpenAI] Error adding message to thread:`, error.message);
                }
            }
        }
        
        if (syncedCount > 0) {
            console.log(`[OpenAI] Synced ${syncedCount} messages to thread ${threadId} for user ${userId}`);
        }
        
        return syncedCount;
    }

    async getOrCreateThread(userId) {
        // First check in-memory cache
        if (this.threads.has(userId)) {
            const threadId = this.threads.get(userId);
            // Sync any missing conversation history to the thread
            await this.syncConversationHistoryToThread(threadId, userId);
            return threadId;
        }
        
        // Check database for existing thread
        const storedThreadId = await new Promise((resolve) => {
            dbHelpers.getOpenAIThreadId(userId, (err, threadId) => {
                if (err) {
                    console.error(`[OpenAI] Error fetching thread ID from database:`, err.message);
                    resolve(null);
                } else {
                    resolve(threadId);
                }
            });
        });
        
        if (storedThreadId) {
            // Use existing thread from database
            this.threads.set(userId, storedThreadId);
            console.log(`[OpenAI] Using existing thread from database for user ${userId}: ${storedThreadId}`);
            // Sync full conversation history to the thread
            await this.syncConversationHistoryToThread(storedThreadId, userId);
            return storedThreadId;
        }
        
        // Create new thread
        try {
            const thread = await this.openaiClient.beta.threads.create();
            const threadId = thread.id;
            
            // Store in memory
            this.threads.set(userId, threadId);
            
            // Store in database
            await new Promise((resolve) => {
                dbHelpers.setOpenAIThreadId(userId, threadId, (err) => {
                    if (err) {
                        console.error(`[OpenAI] Error saving thread ID to database:`, err.message);
                    } else {
                        console.log(`[OpenAI] Saved new thread ID to database for user ${userId}: ${threadId}`);
                    }
                    resolve();
                });
            });
            
            console.log(`[OpenAI] Created new thread for user ${userId}: ${threadId}`);
            
            // Sync existing conversation history to the new thread
            await this.syncConversationHistoryToThread(threadId, userId);
            
            return threadId;
        } catch (error) {
            console.error(`[OpenAI] Error creating thread for user ${userId}:`, error.message);
            return null;
        }
    }

    // Enhanced Deposit Concern Flow
    handleDepositConcern(message, userId, language) {
        const conversationHistory = this.conversationHistory.get(userId) || [];
        
        const depositKeywords = {
            english: ['deposit', 'not received', 'not credited', 'missing', 'pending'],
            hindi: ['जमा', 'नहीं मिली', 'क्रेडिट नहीं', 'गायब', 'लंबित'],
            telugu: ['జమ', 'రాలేదు', 'క్రెడిట్ కాలేదు', 'లేదు', 'పెండింగ్']
        };
        
        const keywords = depositKeywords[language] || depositKeywords.english;
        const isDepositConcern = keywords.some(kw => message.toLowerCase().includes(kw));
        
        if (!isDepositConcern) return null;
        
        return this.initiateDepositConcernFlow(userId, message, language, conversationHistory);
    }

    initiateDepositConcernFlow(userId, message, language, history) {
        const hasReceipt = this.hasReceiptBeenUploaded(history);
        const orderNumber = this.extractOrderNumber(message) || this.extractOrderNumberFromHistory(history);
        
        // Return context object for OpenAI instead of hardcoded messages
        return {
            hasReceipt: hasReceipt,
            orderNumber: orderNumber,
            needsReceipt: !hasReceipt,
            needsOrderNumber: !orderNumber
        };
    }

    async checkDepositInDatabase(userId, orderNumber, hasReceipt, language, history) {
        // Return context object instead of hardcoded messages
        // OpenAI will generate the response based on this context
        return new Promise((resolve) => {
            this.checkOrderNumberInDatabase(orderNumber, async (err, orderData) => {
                if (err) {
                    resolve({
                        hasReceipt: hasReceipt,
                        orderNumber: orderNumber,
                        orderFound: null,
                        error: true,
                        errorMessage: "I encountered an error checking the database. Please try again."
                    });
                    return;
                }
                
                if (orderData && orderData.found) {
                    resolve({
                        hasReceipt: hasReceipt,
                        orderNumber: orderNumber,
                        orderFound: true,
                        transactionSuccessful: true,
                        amount: orderData.data?.amount
                    });
                } else {
                    const receiptDate = this.extractReceiptDate(history, orderNumber);
                    const isOldReceipt = this.isReceiptOlderThan2Days(receiptDate);
                    
                    resolve({
                        hasReceipt: hasReceipt,
                        orderNumber: orderNumber,
                        orderFound: false,
                        transactionSuccessful: false,
                        isOldReceipt: isOldReceipt,
                        receiptDate: receiptDate
                    });
                }
            });
        });
    }

    isReceiptOlderThan2Days(receiptDate) {
        if (!receiptDate) return false;
        const receipt = new Date(receiptDate);
        const now = new Date();
        // Calculate difference in days (receipt date should be in the past)
        const diffTime = now - receipt;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        // Only consider "old" if MORE than 2 days (not exactly 2 days)
        // So: 0-2 days = recent, 3+ days = old
        return diffDays > 2;
    }

    extractReceiptDate(history, orderNumber = null) {
        // CRITICAL FOR REVERSED FLOW: PRIORITY 0 - Extract date from order number FIRST if available
        // Order number contains the actual transaction date, which is most reliable
        if (orderNumber) {
            const orderDateMatch = orderNumber.match(/^(s05|d05|p05)(\d{6})/i);
            if (orderDateMatch) {
                const dateStr = orderDateMatch[2]; // YYMMDD
                const year = 2000 + parseInt(dateStr.substring(0, 2));
                const month = parseInt(dateStr.substring(2, 4)) - 1;
                const day = parseInt(dateStr.substring(4, 6));
                const orderDate = new Date(year, month, day);
                if (!isNaN(orderDate.getTime())) {
                    const now = new Date();
                    const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
                    if (orderDate <= oneYearFromNow && orderDate <= now) {
                        console.log(`[Date Extract] ✅✅✅ PRIORITY: Using order number date: ${orderDate.toISOString()} (from order: ${orderNumber})`);
                        return orderDate.toISOString();
                    }
                }
            }
        }
        
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (msg.role === 'user' && msg.fileType) {
                // PRIORITY 1: Use transaction date from OCR (most accurate)
                if (msg.receiptValidation && msg.receiptValidation.foundDate) {
                    try {
                        const ocrDate = new Date(msg.receiptValidation.foundDate);
                        if (!isNaN(ocrDate.getTime())) {
                            console.log(`[Date Extract] Using OCR date: ${msg.receiptValidation.foundDate}`);
                            return ocrDate.toISOString();
                        }
                    } catch (e) {
                        console.log(`[Date Extract] OCR date invalid, trying timestamp`);
                    }
                }
                // PRIORITY 2: Use upload timestamp (fallback)
                if (msg.timestamp) {
                    console.log(`[Date Extract] Using upload timestamp: ${msg.timestamp}`);
                    return msg.timestamp;
                }
            }
        }
        return null;
    }
    
    // Build conversation summary for context (same as OpenAIIntegration but for Yono777SupportAgent)
    buildConversationSummary(history) {
        if (!history || history.length === 0) return null;
        
        const summary = [];
        
        // Extract order numbers from ALL messages
        const orderNumbers = [];
        const orderPatterns = [
            /(s05|d05|p05|t26)\d{19,22}/i,
            /order[:\s]*(s05|d05|p05|t26)\d{19,22}/i
        ];
        
        for (const msg of history) {
            if (msg.role === 'user' && msg.message && typeof msg.message === 'string') {
                for (const pattern of orderPatterns) {
                    const match = msg.message.match(pattern);
                    if (match) {
                        const orderNum = (match[1] || match[0]).trim().toUpperCase();
                        if (orderNum && !orderNumbers.includes(orderNum)) {
                            orderNumbers.push(orderNum);
                        }
                        break;
                    }
                }
            }
        }
        if (orderNumbers.length > 0) {
            summary.push(`Order numbers provided: ${orderNumbers.join(', ')}`);
        }
        
        // Check for receipts in ALL messages
        const hasReceipt = history.some(msg => 
            msg.role === 'user' && (msg.fileType === 'image' || msg.fileType === 'pdf' || msg.fileType === 'video')
        );
        if (hasReceipt) {
            summary.push('Deposit receipt has been uploaded');
        }
        
        // Check for PDF/video/password
        const hasPDF = history.some(msg => msg.role === 'user' && msg.fileType === 'pdf');
        const hasVideo = history.some(msg => msg.role === 'user' && msg.fileType === 'video');
        const hasPassword = history.some(msg => msg.role === 'user' && (msg.fileType === 'password' || msg.passwordProvided));
        
        if (hasPDF) summary.push('PDF bank statement has been uploaded');
        if (hasVideo) summary.push('Video recording has been uploaded');
        if (hasPassword) summary.push('PDF password has been provided');
        
        // Extract receipt info if available
        for (const msg of history) {
            if (msg.role === 'user' && msg.receiptValidation) {
                const val = msg.receiptValidation;
                if (val.foundOrderNumber) {
                    summary.push(`Receipt contains order number: ${val.foundOrderNumber}`);
                }
                if (val.foundDate) {
                    summary.push(`Receipt transaction date: ${val.foundDate}`);
                    // Calculate and add receipt age for OpenAI context alignment
                    try {
                        const receiptDate = new Date(val.foundDate);
                        if (!isNaN(receiptDate.getTime())) {
                            const now = new Date();
                            const diffTime = Math.abs(now - receiptDate);
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            if (diffDays > 2) {
                                summary.push(`Receipt age: ${diffDays} days old (MORE than 2 days - requires PDF, password, and video)`);
                            } else {
                                summary.push(`Receipt age: ${diffDays} days old (LESS than 2 days - wait 24-48 hours)`);
                            }
                        }
                    } catch (e) {
                        // Ignore date parsing errors
                    }
                }
                if (val.foundAmount) {
                    summary.push(`Receipt amount: ₹${val.foundAmount}`);
                }
                break; // Only need first receipt
            }
        }
        
        return summary.length > 0 ? summary.join('\n') : null;
    }
    
    // Alias for buildConversationSummary to match the expected method name
    buildConversationSummaryForContext(history) {
        return this.buildConversationSummary(history);
    }

    // Extract all receipt information from conversation history
    // This is used when receipt is provided first, so we can use its info later
    extractReceiptInfo(history) {
        if (!history || history.length === 0) return null;
        
        // Find the most recent receipt upload
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (msg.role === 'user' && (msg.fileType === 'image' || msg.fileType === 'pdf')) {
                // Check if this message has receipt validation data
                if (msg.receiptValidation) {
                    const validation = msg.receiptValidation;
                    return {
                        foundOrderNumber: validation.foundOrderNumber || null,
                        foundDate: validation.foundDate || null,
                        foundAmount: validation.foundAmount || null,
                        foundUPI: validation.foundUPI || null,
                        foundUTR: validation.foundUTR || null,
                        isValid: validation.isValid !== false,
                        timestamp: msg.timestamp || null,
                        validation: validation
                    };
                } else if (msg.fileType === 'image') {
                    // Even without validation, if it's an image receipt, return basic info
                    return {
                        foundOrderNumber: null,
                        foundDate: msg.timestamp || null,
                        foundAmount: null,
                        foundUPI: null,
                        foundUTR: null,
                        isValid: true,
                        timestamp: msg.timestamp || null,
                        validation: null
                    };
                }
            }
        }
        return null;
    }

    hasReceiptBeenUploaded(history) {
        if (!history || history.length === 0) return false;
        // Check for fileType in in-memory history (has fileType property)
        const hasFileType = history.some(h => h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video'));
        if (hasFileType) return true;
        
        // Also check for receipt upload patterns in message text (for database-loaded history)
        const receiptPatterns = [
            /\[Uploaded receipt image\]/i,
            /\[Uploaded.*receipt.*\]/i,
            /uploaded.*receipt/i,
            /receipt.*uploaded/i,
            /\[Customer uploaded.*receipt/i,
            /\[Customer uploaded.*image/i
        ];
        const hasReceiptMessage = history.some(h => {
            if (h.role === 'user' && h.message) {
                return receiptPatterns.some(pattern => pattern.test(h.message));
            }
            return false;
        });
        return hasReceiptMessage;
    }
    
    // UNIFIED RECEIPT DETECTION: Single source of truth for receipt detection
    // Checks all sources in priority order: in-memory (fastest) -> database -> pending files -> OpenAI thread
    async detectReceipt(userId) {
        const results = {
            found: false,
            source: null,
            details: {}
        };
        
        // Priority 1: Check in-memory history (fastest, most reliable for recent uploads)
        const inMemoryHistory = this.conversationHistory.get(userId) || [];
        const hasInMemory = inMemoryHistory.some(h => 
            h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video')
        ) || this.hasReceiptBeenUploaded(inMemoryHistory);
        
        if (hasInMemory) {
            results.found = true;
            results.source = 'in-memory';
            return results; // Return immediately - in-memory is most reliable
        }
        
        // Priority 2: Check database history
        try {
            const dbHistory = await new Promise((resolve) => {
                dbHelpers.getConversationHistory(userId, 500, (err, history) => {
                    if (err) {
                        console.error('[Receipt Detection] Error loading DB history:', err.message);
                        resolve([]);
                    } else {
                        const formattedHistory = (history || []).map(h => ({
                            role: 'user',
                            message: h.userMessage,
                            fileType: h.fileType || null
                        }));
                        resolve(formattedHistory);
                    }
                });
            });
            
            const hasInDB = dbHistory.some(h => 
                h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video')
            ) || this.hasReceiptBeenUploaded(dbHistory);
            
            if (hasInDB) {
                results.found = true;
                results.source = 'database';
                return results;
            }
        } catch (error) {
            console.error('[Receipt Detection] Error checking database:', error.message);
        }
        
        // Priority 3: Check pending files (for receipts waiting to be sent)
        for (const [key, storage] of pendingFiles.entries()) {
            if (key.startsWith(userId + '_') && storage.images && storage.images.length > 0) {
                results.found = true;
                results.source = 'pending-files';
                results.details.pendingKey = key;
                return results;
            }
        }
        
        // Priority 4: Check OpenAI thread (only if thread exists, don't create new one)
        if (this.openaiClient && this.assistantId) {
            try {
                const existingThreadId = await new Promise((resolve) => {
                    dbHelpers.getOpenAIThreadId(userId, (err, threadId) => {
                        resolve(err || !threadId ? null : threadId);
                    });
                });
                
                if (existingThreadId) {
                    const threadMessages = await this.openaiClient.beta.threads.messages.list(existingThreadId, { limit: 100 });
                    const threadContent = threadMessages.data
                        .map(msg => msg.content[0]?.type === 'text' ? msg.content[0].text.value : '')
                        .join(' ');
                    
                    const receiptPatterns = [
                        /\[Customer uploaded.*receipt/i,
                        /\[Customer uploaded.*image/i,
                        /\[Uploaded receipt/i,
                        /deposit receipt/i
                    ];
                    
                    if (receiptPatterns.some(pattern => pattern.test(threadContent))) {
                        results.found = true;
                        results.source = 'openai-thread';
                        return results;
                    }
                }
            } catch (error) {
                // Silently fail - OpenAI check is optional
            }
        }
        
        return results;
    }

    hasValidReceipt(history) {
        if (!history || history.length === 0) return false;
        
        // Check for valid receipt in in-memory history (has receiptValid property)
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (msg.role === 'user' && msg.fileType === 'image') {
                // Check if receipt validation exists and is valid
                if (msg.receiptValid !== false && msg.receiptValidation) {
                    const validation = msg.receiptValidation;
                    // Receipt is valid if isValid is not false and no critical issues
                    if (validation.isValid !== false && (!validation.issues || validation.issues.length === 0 || 
                        !validation.issues.some(issue => issue.includes('Failed') || issue.includes('Invalid')))) {
                        return true;
                    }
                } else if (msg.receiptValid !== false) {
                    // If receiptValid is not explicitly false, assume it's valid (for backward compatibility)
                    return true;
                }
            }
        }
        
        // If no explicit validation found, check if receipt was uploaded (for backward compatibility)
        // But we'll be more strict - if validation exists and is invalid, return false
        const hasReceipt = this.hasReceiptBeenUploaded(history);
        if (hasReceipt) {
            // Check if any receipt in history has explicit invalid validation
            for (let i = history.length - 1; i >= 0; i--) {
                const msg = history[i];
                if (msg.role === 'user' && msg.fileType === 'image' && msg.receiptValidation) {
                    const validation = msg.receiptValidation;
                    if (validation.isValid === false || 
                        (validation.issues && validation.issues.some(issue => issue.includes('Failed') || issue.includes('Invalid')))) {
                        return false; // Found invalid receipt
                    }
                }
            }
            // If we have receipt and no invalid validation found, assume valid
            return true;
        }
        
        return false;
    }

    // Check conversation history to see what files have been received (PDF, password, video)
    checkFilesInHistory(history) {
        if (!history || history.length === 0) {
            return { hasPDF: false, hasPassword: false, hasVideo: false };
        }
        
        let hasPDF = false;
        let hasPassword = false;
        let hasVideo = false;
        
        // Check for fileType in in-memory history (most reliable method)
        // Go through ALL messages to ensure we catch everything
        for (let i = 0; i < history.length; i++) {
            const msg = history[i];
            if (msg.role === 'user') {
                // Check fileType first (most reliable)
                if (msg.fileType === 'pdf') {
                    hasPDF = true;
                    console.log(`[File Check] PDF found via fileType at message ${i}`);
                } else if (msg.fileType === 'video') {
                    hasVideo = true;
                    console.log(`[File Check] Video found via fileType at message ${i}`);
                } else if (msg.fileType === 'password') {
                    hasPassword = true;
                    console.log(`[File Check] Password found via fileType at message ${i}`);
                }
                
                // Also check message text for password patterns (if not already found)
                if (msg.message && !hasPassword) {
                    const passwordPatterns = [
                        /password[:\s]*([A-Z0-9]{4,})/i,
                        /pdf[:\s]*password[:\s]*([A-Z0-9]{4,})/i,
                        /pass[:\s]*([A-Z0-9]{4,})/i,
                        /pwd[:\s]*([A-Z0-9]{4,})/i
                    ];
                    for (const pattern of passwordPatterns) {
                        if (pattern.test(msg.message)) {
                            hasPassword = true;
                            console.log(`[File Check] Password found via text pattern at message ${i}`);
                            break;
                        }
                    }
                }
                
                // Check for upload patterns in message text (for database-loaded history)
                // BUT: Be more specific to avoid false positives (e.g., "PDF password" shouldn't count as PDF)
                if (msg.message) {
                    // Check for PDF upload markers (case-insensitive, more specific patterns)
                    if (!hasPDF && msg.message && typeof msg.message === 'string') {
                        const msgLower = msg.message.toLowerCase();
                        if (msgLower.includes('[uploaded pdf]') || 
                            (msgLower.includes('.pdf') && !msgLower.includes('password'))) {
                            hasPDF = true;
                            console.log(`[File Check] PDF found via message text at message ${i}: ${msg.message.substring(0, 50)}`);
                        }
                    }
                    // Check for video upload markers (case-insensitive, more specific patterns)
                    if (!hasVideo && msg.message && typeof msg.message === 'string') {
                        const msgLower = msg.message.toLowerCase();
                        if (msgLower.includes('[uploaded video]') ||
                            msgLower.includes('.mp4') || 
                            msgLower.includes('.mov') ||
                            msgLower.includes('.avi')) {
                            hasVideo = true;
                            console.log(`[File Check] Video found via message text at message ${i}: ${msg.message.substring(0, 50)}`);
                        }
                    }
                }
            }
        }
        
        console.log(`[File Check] Final result - PDF: ${hasPDF}, Password: ${hasPassword}, Video: ${hasVideo}`);
        return { hasPDF, hasPassword, hasVideo };
    }

    extractOrderNumber(message) {
        if (!message || typeof message !== 'string') {
            return null;
        }
        
        try {
            // Updated patterns to handle 19-22 digits (more flexible)
            // Also handle t26 prefix and longer numbers
            const patterns = [
                /(s05|d05|p05|t26)\d{19,25}/i,  // Match 19-25 digits after prefix (more flexible)
                /order[:\s]*(s05|d05|p05|t26)\d{19,25}/i,
                /(?:order|txn|transaction|ref|reference)[:\s#]*(s05|d05|p05|t26)\d{19,25}/i,
                // Direct match for full order number (fallback)
                /(s05\d{19,25}|d05\d{19,25}|p05\d{19,25}|t26\d{19,25})/i
            ];
            
            for (const pattern of patterns) {
                const match = message.match(pattern);
                if (match) {
                    // Use full match (match[0]) which includes the prefix
                    let orderNum = match[0] || match[1];
                    if (orderNum) {
                        orderNum = orderNum.trim().toUpperCase();
                        // Validate length (should be 22-28 characters total: prefix + 19-25 digits)
                        if (orderNum.length >= 22 && orderNum.length <= 28) {
                            console.log(`[extractOrderNumber] ✅ Found order number: ${orderNum} (length: ${orderNum.length})`);
                            return orderNum;
                        } else {
                            console.log(`[extractOrderNumber] ⚠️ Order number length invalid: ${orderNum} (length: ${orderNum.length}, expected 22-28)`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[extractOrderNumber] Error extracting order number:', error.message);
        }
        
        console.log(`[extractOrderNumber] ❌ No order number found in: "${message.substring(0, 50)}"`);
        return null;
    }
    
    // Limit response to maximum 3 sentences as per protocol
    limitToThreeSentences(response, language) {
        // Split by sentence endings (., !, ?)
        const sentenceEndings = /[.!?]+/g;
        const sentences = response.split(sentenceEndings).filter(s => s.trim().length > 0);
        
        // If 3 or fewer sentences, return as is
        if (sentences.length <= 3) {
            return response;
        }
        
        // Take only first 3 sentences and reconstruct
        const firstThree = sentences.slice(0, 3);
        let result = '';
        let charIndex = 0;
        
        for (let i = 0; i < firstThree.length; i++) {
            const sentence = firstThree[i].trim();
            // Find the sentence in original response
            const startIndex = response.indexOf(sentence, charIndex);
            if (startIndex !== -1) {
                const endIndex = response.indexOf(/[.!?]/.exec(response.substring(startIndex + sentence.length)) ? 
                    response.substring(startIndex + sentence.length).match(/[.!?]+/)[0] : '', startIndex + sentence.length);
                if (endIndex !== -1) {
                    result += response.substring(startIndex, endIndex + 1) + ' ';
                    charIndex = endIndex + 1;
                } else {
                    result += sentence + '. ';
                }
            } else {
                result += sentence + '. ';
            }
        }
        
        return result.trim();
    }

    extractOrderNumberFromHistory(history) {
        if (!history) return null;
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (msg.role === 'user') {
                const orderNumber = this.extractOrderNumber(msg.message);
                if (orderNumber) return orderNumber;
            }
        }
        return null;
    }

    checkOrderNumberInDatabase(orderNumber, callback) {
        if (!orderNumber) {
            return callback(null, { found: false, type: null, data: null });
        }

        console.log(`[DB Query] Querying deposits table for order number: ${orderNumber}`);
        // Only check deposits database, not withdrawals
        dbHelpers.getDepositByOrderNumber(orderNumber, (err, deposit) => {
            if (err) {
                console.error('[DB Query] ❌ Error checking deposit:', err);
                return callback(err, null);
            }
            
            if (deposit) {
                console.log(`[DB Query] ✅ Deposit found: Order ${orderNumber}, Amount: ${deposit.amount || 'N/A'}, Status: ${deposit.paymentStatus || 'N/A'}`);
                return callback(null, { found: true, type: 'deposit', data: deposit, orderNumber: orderNumber });
            }

            // Order not found in deposits - return not found (don't check withdrawals)
            console.log(`[DB Query] ❌ Order ${orderNumber} not found in deposits table`);
            callback(null, { found: false, type: null, data: null, orderNumber: orderNumber });
        });
    }

    classifyIssue(message, language) {
        // Enhanced message detection - check for various patterns
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return 'general';
        }
        
        const lowerMsg = message.toLowerCase().trim();
        
        // Check for order numbers first (strong indicator of deposit concern)
        const orderNumberPattern = /^(s05|d05|p05)[0-9]{15,}/i;
        if (orderNumberPattern.test(message.trim())) {
            return 'deposit';
        }
        
        // Use enhanced intent detection from ContextAnalyzer
        const intent = this.contextAnalyzer.detectIntent(message, language);
        
        if (intent !== 'general') {
            return intent;
        }
        
        // Enhanced keyword-based classification with more patterns
        const depositKw = ['deposit', 'जमा', 'జమ', 'জমা', 'ஜமா', 'credited', 'money not received', 'payment not received', 'transaction', 'upi', 'utr', 'receipt'];
        const withdrawalKw = ['withdrawal', 'निकासी', 'ఉపసంహరణ'];
        const accountKw = ['account', 'खाता', 'ఖాతా'];
        const bonusKw = ['bonus', 'बोनस', 'బోనస్'];
        const technicalKw = ['technical', 'error', 'bug', 'glitch', 'not working'];
        
        if (depositKw.some(kw => lowerMsg.includes(kw))) return 'deposit';
        if (withdrawalKw.some(kw => lowerMsg.includes(kw))) return 'withdrawal';
        if (accountKw.some(kw => lowerMsg.includes(kw))) return 'account';
        if (bonusKw.some(kw => lowerMsg.includes(kw))) return 'bonus';
        if (technicalKw.some(kw => lowerMsg.includes(kw))) return 'technical issue';
        return 'general';
    }

    // Circuit breaker check for OpenAI
    checkCircuitBreaker() {
        const now = Date.now();
        
        if (this.circuitBreaker.state === 'open') {
            // Check if we should try again (half-open state)
            if (this.circuitBreaker.lastFailureTime && 
                (now - this.circuitBreaker.lastFailureTime) > this.circuitBreaker.timeout) {
                this.circuitBreaker.state = 'half-open';
                this.circuitBreaker.failures = 0;
                console.log('[Circuit Breaker] Moving to half-open state - will try OpenAI again');
                return true;
            }
            // Circuit is open - use fallback
            console.log('[Circuit Breaker] Circuit is OPEN - using template fallback');
            return false;
        }
        
        return true; // Circuit is closed or half-open - proceed
    }
    
    recordCircuitBreakerFailure() {
        this.circuitBreaker.failures++;
        this.circuitBreaker.lastFailureTime = Date.now();
        
        if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
            this.circuitBreaker.state = 'open';
            console.warn(`[Circuit Breaker] Circuit OPENED after ${this.circuitBreaker.failures} failures`);
        }
    }
    
    recordCircuitBreakerSuccess() {
        if (this.circuitBreaker.state === 'half-open') {
            this.circuitBreaker.state = 'closed';
            this.circuitBreaker.failures = 0;
            console.log('[Circuit Breaker] Circuit CLOSED - OpenAI is working again');
        } else if (this.circuitBreaker.state === 'closed') {
            // Reset failure count on success
            this.circuitBreaker.failures = Math.max(0, this.circuitBreaker.failures - 1);
        }
    }
    
    async generateResponse(message, issueType, userId, language, additionalContext = {}) {
        // Update metrics
        if (this.metrics) {
            this.metrics.totalRequests++;
        }
        
        // CRITICAL: If we're waiting for PDF/password/video, ALWAYS use template system
        // This ensures proper file tracking and prevents asking for items already provided
        const history = this.conversationHistory.get(userId) || [];
        const wasAskedForPDFAndVideo = history.some(msg => 
            msg.role === 'assistant' && 
            msg.message && 
            typeof msg.message === 'string' &&
            (msg.message.includes('PDF bank statement') || 
             msg.message.includes('PDF बैंक') || 
             msg.message.includes('PDF బ్యాంక్') ||
             msg.message.includes('video recording') ||
             msg.message.includes('वीडियो') ||
             msg.message.includes('వీడియో'))
        );
        
        // If we're waiting for files OR password is provided (which means we're in file tracking mode)
        const isWaitingForFiles = wasAskedForPDFAndVideo || 
                                  additionalContext.waitingForPDFAndVideo || 
                                  additionalContext.isFileUploadTracking ||
                                  additionalContext.passwordProvided;
        
        if (isWaitingForFiles && issueType === 'deposit') {
            // CRITICAL: Only check files ONCE to prevent duplicate responses
            // Use a flag to track if we've already checked in this call
            if (!additionalContext._filesChecked) {
            const tempHistory = [...history];
            if (additionalContext.passwordProvided || additionalContext.fileType === 'password') {
                tempHistory.push({ role: 'user', message: '', fileType: 'password', passwordProvided: true });
            }
            const filesInHistory = this.checkFilesInHistory(tempHistory);
            const hasAll = (filesInHistory.hasPDF || additionalContext.hasPDF || additionalContext.fileType === 'pdf') &&
                          (filesInHistory.hasPassword || additionalContext.hasPassword || additionalContext.passwordProvided) &&
                          (filesInHistory.hasVideo || additionalContext.hasVideo || additionalContext.fileType === 'video');
                
                // Mark as checked to prevent duplicate checking
                additionalContext._filesChecked = true;
                additionalContext._hasAllFiles = hasAll;
            }
            
            // Use the cached result
            const hasAll = additionalContext._hasAllFiles;
            
            if (hasAll) {
                // All files received - use OpenAI for natural, varied, human-like responses
                console.log('[Response] ✅ All files received - Using OpenAI for natural, human-like response');
                // Continue to OpenAI generation below (don't return, let it fall through)
            } else {
                // Still waiting for files - use template for accurate file tracking
                console.log('[Response] ⚠️ FORCING template system - Waiting for PDF/password/video files (wasAskedForPDFAndVideo:', wasAskedForPDFAndVideo, ', waitingForPDFAndVideo:', additionalContext.waitingForPDFAndVideo, ', isFileUploadTracking:', additionalContext.isFileUploadTracking, ', passwordProvided:', additionalContext.passwordProvided, ')');
                return await this.generateTemplateResponse(message, issueType, language, additionalContext, {}, userId);
            }
        }
        
        // CRITICAL: Force template for receipts with pending orders to ensure exact response format
        // This applies to BOTH recent and old receipts to ensure consistent, accurate responses
        const hasReceipt = additionalContext.hasReceipt || false;
        const orderNumber = additionalContext.orderNumber || null;
        const orderFound = additionalContext.orderFound;
        const isOldReceipt = additionalContext.isOldReceipt === true;
        
        // Force template for receipts with pending orders (both recent and old)
        // BUT: If all files are received, use OpenAI for conversational responses
        // This ensures we use the exact required response format from system instructions
        // Recent receipts: "Thank you for providing your deposit receipt. Your transaction is currently being processed..."
        // Old receipts: "I see your receipt is more than 2 days old. To help process your deposit faster..."
        const shouldForceTemplate = hasReceipt && 
                                    orderNumber && 
                                    (orderFound === false || orderFound === undefined) &&
                                    issueType === 'deposit';
        
        // Check if all files are received - if yes, use OpenAI for conversational responses
        // CRITICAL: Only check files ONCE to prevent duplicate responses
        if (shouldForceTemplate) {
            // Use cached result if already checked
            if (additionalContext._filesChecked === undefined) {
                const history = this.conversationHistory.get(userId) || [];
                const filesInHistory = this.checkFilesInHistory(history);
                const hasAllFiles = filesInHistory.hasPDF && filesInHistory.hasPassword && filesInHistory.hasVideo;
                
                // Cache the result
                additionalContext._filesChecked = true;
                additionalContext._hasAllFiles = hasAllFiles;
            }
            
            const hasAllFiles = additionalContext._hasAllFiles;
            
            if (hasAllFiles) {
                // All files received - use OpenAI for natural, conversational responses
                console.log(`[Response] ✅ All files received - Using OpenAI for conversational response (not forcing template)`);
                // Continue to OpenAI generation below (don't return, let it fall through)
            } else {
                // Still waiting for files or files not all received - use template
                console.log(`[Response] ⚠️ FORCING template system - Receipt with pending order (isOld: ${isOldReceipt})`);
            // Use template system directly, skip OpenAI entirely
                // Template will handle both recent (24-48 hours message) and old (PDF/video request) cases
            return await this.generateTemplateResponse(message, issueType, language, additionalContext, {}, userId);
            }
        }
        
        const context = this.contextAnalyzer.analyzeContext(history, message, language);
        
        // Remember user details for better personalization
        this.conversationMemory.rememberUserDetails(userId, message, context);
        
        // Track conversation flow
        this.contextAnalyzer.trackConversationFlow(userId, message, null, context);
        
        // Use OpenAI Assistant if available and ready, otherwise fall back to templates
        // NOTE: File tracking logic is already handled at the beginning of this function
        if (this.openaiClient && this.assistantId && this.checkCircuitBreaker()) {
            try {
                // Wait a bit if assistant is still initializing (reduced delay for faster response)
                if (!this.assistantId) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                if (this.assistantId) {
                    const response = await this.generateOpenAIResponse(message, issueType, userId, language, additionalContext, context);
                    // Record success for circuit breaker
                    this.recordCircuitBreakerSuccess();
                    if (this.metrics) {
                        this.metrics.successfulRequests++;
                    }
                    return response;
                }
            } catch (error) {
                console.error('[OpenAI] Error generating response, falling back to templates:', error.message);
                // Record failure for circuit breaker
                this.recordCircuitBreakerFailure();
                if (this.metrics) {
                    this.metrics.failedRequests++;
                    this.metrics.errors.push({
                        type: 'OpenAI Error',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                    // Keep last 100 errors
                    if (this.metrics.errors.length > 100) {
                        this.metrics.errors = this.metrics.errors.slice(-100);
                    }
                }
                return await this.generateTemplateResponse(message, issueType, language, additionalContext, context, userId);
            }
        }
        
        // Use template-based response system (fallback or if OpenAI not configured)
        try {
            const templateResponse = await this.generateTemplateResponse(message, issueType, language, additionalContext, context, userId);
            if (templateResponse && typeof templateResponse === 'string' && templateResponse.trim().length > 0) {
        if (this.metrics) {
            this.metrics.successfulRequests++;
        }
                return templateResponse;
            } else {
                // Template returned null - this means it wants to use OpenAI for varied responses
                // CRITICAL: Don't return the same template message again - use OpenAI instead
                console.log('[Response] Template returned null - using OpenAI for varied response');
                
                // Try OpenAI if available
                if (this.openaiClient && this.assistantId && this.checkCircuitBreaker()) {
                    try {
                        const openAIResponse = await this.generateOpenAIResponse(message, issueType, userId, language, additionalContext, context);
                        if (openAIResponse && typeof openAIResponse === 'string' && openAIResponse.trim().length > 0) {
                            this.recordCircuitBreakerSuccess();
                            if (this.metrics) {
                                this.metrics.successfulRequests++;
                            }
                            return openAIResponse;
                        }
                    } catch (error) {
                        console.error('[OpenAI] Error when template returned null:', error.message);
                        this.recordCircuitBreakerFailure();
                    }
                }
                
                // If OpenAI not available or failed, provide varied fallback (not the same template message)
                const history = this.conversationHistory.get(userId) || [];
                const filesInHistory = this.checkFilesInHistory(history);
                const hasAllFiles = filesInHistory.hasPDF && filesInHistory.hasPassword && filesInHistory.hasVideo;
                
                if (hasAllFiles && issueType === 'deposit') {
                    // All files received - provide VARIED acknowledgment (not the same template)
                    // Check if we already sent the acknowledgment
                    const recentMessages = history.filter(h => h.role === 'assistant').slice(-3);
                    const acknowledgmentSent = recentMessages.some(msg => 
                        msg.message && 
                        (msg.message.includes('Thank you for providing all the necessary documents') ||
                         msg.message.includes('सभी आवश्यक दस्तावेज') ||
                         msg.message.includes('అన్ని అవసరమైన పత్రాలు'))
                    );
                    
                    if (acknowledgmentSent) {
                        // Already acknowledged - provide different response
                        if (language === 'english') {
                            return 'Everything is being processed correctly. Our team is reviewing all your documents thoroughly. You don\'t need to do anything else right now - just sit back and relax. I\'ll make sure everything is handled properly.';
                        } else if (language === 'hindi') {
                            return 'सब कुछ सही तरीके से प्रसंस्करण किया जा रहा है। हमारी टीम आपके सभी दस्तावेजों की समीक्षा कर रही है। आपको अभी और कुछ करने की आवश्यकता नहीं है - बस आराम करें। मैं सुनिश्चित करूंगा कि सब कुछ ठीक से संभाला जाए।';
                        } else if (language === 'telugu') {
                            return 'ప్రతిదీ సరిగ్గా ప్రాసెస్ చేయబడుతోంది. మా బృందం మీ అన్ని పత్రాలను సమీక్షిస్తోంది. మీరు ఇప్పుడు మరేమీ చేయవలసిన అవసరం లేదు - కేవలం విశ్రాంతి తీసుకోండి. నేను ప్రతిదీ సరిగ్గా నిర్వహించబడుతుందని నిర్ధారిస్తాను.';
                        }
                    } else {
                        // First acknowledgment
                        if (language === 'english') {
                            return 'Thank you for providing all the necessary documents. I have received everything. I will forward all the files to our relevant team for deep checking. Thank you for bearing with us.';
                        } else if (language === 'hindi') {
                            return 'सभी आवश्यक दस्तावेज प्रदान करने के लिए धन्यवाद। मैंने सब कुछ प्राप्त कर लिया है। मैं सभी फाइलों को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा। हमारे साथ धैर्य रखने के लिए धन्यवाद।';
                        } else if (language === 'telugu') {
                            return 'అన్ని అవసరమైన పత్రాలు అందించినందుకు ధన్యవాదాలు. నేను అన్నింటినీ స్వీకరించాను. నేను అన్ని ఫైళ్లను మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను. మాతో ఓర్పు కనబరచినందుకు ధన్యవాదాలు.';
                        }
                    }
                }
                
                // Template returned empty - use polite fallback
                console.warn('[Response] Template returned empty response, using fallback');
                if (issueType === 'deposit') {
                    return 'Thank you for contacting us about your deposit concern. I appreciate your patience. How can I assist you further?';
                }
                return 'Thank you for contacting Yono777 customer service. I apologize for any inconvenience. How can I assist you today?';
            }
        } catch (templateError) {
            console.error('[Response] Error in template generation:', templateError.message);
            // Polite error fallback
            if (issueType === 'deposit') {
                return 'Thank you for contacting us about your deposit concern. I apologize for the delay. Our team is working on your request.';
            }
            return 'Thank you for contacting Yono777 customer service. I apologize for any inconvenience. How can I assist you today?';
        }
    }
    
    // Clean response from any internal context markers
    cleanResponseFromContext(responseText) {
        if (!responseText || typeof responseText !== 'string') {
            return responseText;
        }
        
        // Remove all internal context markers and summaries
        let cleaned = responseText;
        
        // Remove [CONTEXT] blocks (most common pattern)
        cleaned = cleaned.replace(/\[CONTEXT\][\s\S]*?\[USER MESSAGE\]/gi, '');
        cleaned = cleaned.replace(/\[CONTEXT\][\s\S]*$/gi, '');
        
        // Remove conversation summary blocks (various formats)
        cleaned = cleaned.replace(/=== CONVERSATION SUMMARY ===[\s\S]*?=== END SUMMARY ===/gi, '');
        cleaned = cleaned.replace(/=== FULL CONVERSATION SUMMARY[\s\S]*?=== END SUMMARY ===/gi, '');
        cleaned = cleaned.replace(/CONVERSATION SUMMARY[\s\S]*?END SUMMARY/gi, '');
        cleaned = cleaned.replace(/=== CONVERSATION SUMMARY ===[\s\S]*?=== END CONVERSATION SUMMARY ===/gi, '');
        
        // Remove any remaining context markers
        cleaned = cleaned.replace(/\[CONVERSATION SUMMARY[^\]]*\][\s\S]*?\[END SUMMARY\]/gi, '');
        cleaned = cleaned.replace(/🚨[🚨\s]*CRITICAL[^\n]*/gi, '');
        cleaned = cleaned.replace(/CRITICAL INSTRUCTIONS[^\n]*/gi, '');
        cleaned = cleaned.replace(/MANDATORY[^\n]*/gi, '');
        cleaned = cleaned.replace(/READ THIS FIRST[^\n]*/gi, '');
        
        // Remove receipt status blocks
        cleaned = cleaned.replace(/=== RECEIPT STATUS ===[\s\S]*?=== END RECEIPT STATUS ===/gi, '');
        
        // Remove "No previous conversation data found" messages
        cleaned = cleaned.replace(/No previous conversation data found[^\n]*/gi, '');
        cleaned = cleaned.replace(/This appears to be a new conversation[^\n]*/gi, '');
        
        // Remove any lines that are just markers, separators, or context-related
        const lines = cleaned.split('\n');
        const filteredLines = [];
        let skipUntilEnd = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            // Skip empty lines
            if (!trimmed) {
                continue;
            }
            
            // Skip lines that are just markers or separators
            if (trimmed.match(/^[=🚨\-\s]*$/)) {
                continue;
            }
            
            // Skip lines that are just brackets
            if (trimmed.match(/^\[.*\]$/)) {
                continue;
            }
            
            // Skip lines that are just === separators
            if (trimmed.match(/^===.*===$/)) {
                continue;
            }
            
            // Skip context-related lines
            if (trimmed.toLowerCase().includes('conversation summary') && trimmed.length < 100) {
                skipUntilEnd = true;
                continue;
            }
            
            if (trimmed.toLowerCase().includes('end summary')) {
                skipUntilEnd = false;
                continue;
            }
            
            if (skipUntilEnd) {
                continue;
            }
            
            // Skip other context markers
            if (trimmed.toLowerCase().includes('read this first')) {
                continue;
            }
            
            if (trimmed.toLowerCase().includes('no previous conversation')) {
                continue;
            }
            
            if (trimmed.toLowerCase().includes('appears to be a new conversation')) {
                continue;
            }
            
            // Keep this line
            filteredLines.push(line);
        }
        
        cleaned = filteredLines.join('\n').trim();
        
        // If after cleaning we have nothing meaningful, return original (but still trimmed)
        if (!cleaned || cleaned.length < 10) {
            // Last resort: try to extract just the user-facing message
            const userMessageMatch = responseText.match(/\[USER MESSAGE\][\s\S]*$/i);
            if (userMessageMatch) {
                return userMessageMatch[0].replace(/\[USER MESSAGE\]/gi, '').trim();
            }
            return responseText.trim();
        }
        
        return cleaned.trim();
    }
    
    // Wait for any active OpenAI runs to complete before adding new messages
    async waitForActiveRun(threadId, maxWaitTime = 30000) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitTime) {
            try {
                const runs = await this.openaiClient.beta.threads.runs.list(threadId, { limit: 1 });
                if (runs.data && runs.data.length > 0) {
                    const activeRun = runs.data[0];
                    if (activeRun.status === 'queued' || activeRun.status === 'in_progress') {
                        console.log(`[OpenAI Thread] Waiting for active run ${activeRun.id} to complete (status: ${activeRun.status})`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                }
                // No active runs
                return true;
            } catch (error) {
                // If error checking runs, assume it's safe to proceed
                console.warn(`[OpenAI Thread] Error checking active runs: ${error.message}`);
                return true;
            }
        }
        console.warn(`[OpenAI Thread] Timeout waiting for active run to complete`);
        return false;
    }
    
    // Detect offensive/inappropriate content
    detectOffensiveContent(text) {
        if (!text || typeof text !== 'string') {
            return { isOffensive: false, text: text };
        }
        
        // List of offensive words/phrases to detect
        const offensivePatterns = [
            /\bfuck\s*you\b/gi,
            /\bfuck\s*off\b/gi,
            /\bfuck\s*ing\b/gi,
            /\bshit\b/gi,
            /\bdamn\b/gi,
            /\bastard\b/gi,
            /\bbitch\b/gi,
            /\basshole\b/gi,
            /\bmotherfucker\b/gi,
            /\bmaderchod\b/gi, // Hindi offensive term
            /\bchutiya\b/gi, // Hindi offensive term
            // Add more patterns as needed
        ];
        
        let isOffensive = false;
        for (const pattern of offensivePatterns) {
            if (pattern.test(text)) {
                isOffensive = true;
                break;
            }
        }
        
        // Check for repeated offensive words (like "fuck youfuck you")
        if (/(\w+)\1+/gi.test(text)) {
            const repeatedWord = text.match(/(\w+)\1+/gi)?.[0];
            if (repeatedWord && offensivePatterns.some(p => p.test(repeatedWord))) {
                isOffensive = true;
            }
        }
        
        return { isOffensive, text };
    }
    
    // Generate comforting message when offensive content is detected
    getComfortingMessageForOffensiveContent(language = 'english') {
        const messages = {
            english: [
                "I understand you might be frustrated, and I'm here to help. Let's work together to resolve your deposit concern. How can I assist you today?",
                "I can sense you're going through a difficult time. I'm here to support you and help with your deposit issue. What can I do to help?",
                "I'm here to help you, no matter what you're going through. Let's focus on resolving your deposit concern together. How can I assist you?",
                "I understand things might be stressful right now. I'm here to listen and help you with your deposit concern. What would you like to discuss?",
                "I'm here to help you with your deposit concern. I understand you might be frustrated, and I want to make sure we get this resolved for you. How can I assist?"
            ],
            hindi: [
                "मैं समझता हूं कि आप परेशान हो सकते हैं, और मैं यहां मदद के लिए हूं। आइए मिलकर आपकी जमा समस्या को हल करें। मैं आपकी कैसे सहायता कर सकता हूं?",
                "मैं देख सकता हूं कि आप एक कठिन समय से गुजर रहे हैं। मैं यहां आपका समर्थन करने और आपकी जमा समस्या में मदद करने के लिए हूं। मैं क्या कर सकता हूं?",
                "मैं आपकी मदद के लिए यहां हूं, चाहे आप किसी भी स्थिति से गुजर रहे हों। आइए मिलकर आपकी जमा समस्या को हल करने पर ध्यान दें। मैं आपकी कैसे सहायता कर सकता हूं?"
            ],
            telugu: [
                "మీరు నిరాశ చెంది ఉండవచ్చని నేను అర్థం చేసుకుంటున్నాను, మరియు నేను సహాయం చేయడానికి ఇక్కడ ఉన్నాను. మీ జమ సమస్యను కలిసి పరిష్కరిద్దాం. నేను మీకు ఎలా సహాయం చేయగలను?",
                "మీరు కష్టమైన సమయం గడుపుతున్నారని నేను గ్రహించగలను. నేను మీకు మద్దతు ఇవ్వడానికి మరియు మీ జమ సమస్యలో సహాయం చేయడానికి ఇక్కడ ఉన్నాను. నేను ఏమి చేయగలను?",
                "మీరు ఏ పరిస్థితిని ఎదుర్కొన్నప్పటికీ, నేను మీకు సహాయం చేయడానికి ఇక్కడ ఉన్నాను. మీ జమ సమస్యను కలిసి పరిష్కరించడంపై దృష్టి పెడదాం. నేను మీకు ఎలా సహాయం చేయగలను?"
            ]
        };
        
        const langMessages = messages[language] || messages.english;
        return langMessages[Math.floor(Math.random() * langMessages.length)];
    }
    
    // Filter out offensive/inappropriate content from responses (legacy function, kept for compatibility)
    filterOffensiveContent(text) {
        const detection = this.detectOffensiveContent(text);
        if (detection.isOffensive) {
            return null; // Signal to use comforting message
        }
        return detection.text;
    }
    
    async generateOpenAIResponse(message, issueType, userId, language, additionalContext = {}, context = {}) {
        if (!this.openaiClient || !this.assistantId) {
            throw new Error('OpenAI client or assistant not initialized');
        }
        
        // Filter offensive content from user message
        const filteredMessage = this.filterOffensiveContent(message);
        if (!filteredMessage) {
            // Skip response for offensive content
            return "I'm here to help you with your deposit concern. How can I assist you today?";
        }
        
        // Get or create thread for this user
        const threadId = await this.getOrCreateThread(userId);
        if (!threadId) {
            throw new Error('Failed to create thread');
        }
        
        // CRITICAL: Wait for any active runs to complete before adding new messages
        await this.waitForActiveRun(threadId);
        
        // Build context message with all relevant information
        let contextMessage = message;
        
        // Add context information
        const contextInfo = [];
        
        if (additionalContext.orderNumber) {
            contextInfo.push(`Order number: ${additionalContext.orderNumber}`);
        }
        
        if (additionalContext.orderFound !== undefined) {
            if (additionalContext.orderFound === true) {
                contextInfo.push(`Database check result: Order FOUND in deposits database`);
                if (additionalContext.orderData?.amount) {
                    contextInfo.push(`Deposit amount: ₹${additionalContext.orderData.amount}`);
                }
                if (additionalContext.orderData?.paymentStatus) {
                    contextInfo.push(`Payment status: ${additionalContext.orderData.paymentStatus}`);
                }
            } else {
                contextInfo.push(`Database check result: Order NOT FOUND in deposits database`);
                // If order not found AND receipt was provided, check receipt age instead of asking for receipt again
                if (additionalContext.hasReceipt) {
                    contextInfo.push(`\n=== CRITICAL INSTRUCTION ===`);
                    contextInfo.push(`Order not found BUT receipt was already provided.`);
                    contextInfo.push(`DO NOT use "orderNotFound" response (which asks for receipt).`);
                    contextInfo.push(`Instead, proceed to STEP 4: Check receipt age and respond accordingly.`);
                    contextInfo.push(`- If receipt < 2 days: Ask to wait 24-48 hours`);
                    contextInfo.push(`- If receipt >= 2 days: Ask for PDF, password, and video`);
                    contextInfo.push(`=== END CRITICAL INSTRUCTION ===\n`);
                }
            }
        }
        
        if (additionalContext.hasReceipt) {
            contextInfo.push(`Customer has ALREADY provided a deposit receipt`);
            contextInfo.push(`CRITICAL: Do NOT ask for receipt again - it was already provided`);
            
            // CRITICAL: Always pass receipt age information to OpenAI for accurate responses
            if (additionalContext.isOldReceipt !== undefined) {
                if (additionalContext.isOldReceipt === true) {
                    contextInfo.push(`Receipt age: MORE than 2 days old (${additionalContext.receiptAgeDays || 'unknown'} days)`);
                    contextInfo.push(`Response required: Ask for PDF, password, and video (Scenario 4B-2)`);
                    contextInfo.push(`⚠️ CRITICAL: Use EXACT template: "I see your receipt is more than 2 days old. To help process your deposit faster, please provide: (1) PDF bank statement, (2) PDF password (if protected), and (3) a video recording showing your successful deposit transaction."`);
                } else {
                    contextInfo.push(`Receipt age: LESS than 2 days old (${additionalContext.receiptAgeDays || 'unknown'} days)`);
                    contextInfo.push(`Response required: Ask to wait 24-48 hours (Scenario 4B-1)`);
                    contextInfo.push(`⚠️ CRITICAL: Use EXACT template: "Thank you for providing your deposit receipt. Your transaction is currently being processed. Please wait 24-48 hours for it to be credited to your account. Your money is 100% safe with us. Thank you for reaching out to Yono777 customer service. We're happy to serve you!"`);
                }
            } else if (additionalContext.hasReceipt) {
                contextInfo.push(`Receipt age: Not determined yet, default to recent (< 2 days)`);
                contextInfo.push(`⚠️ If receipt age cannot be determined, assume it's recent and ask to wait 24-48 hours`);
            }
        }
        
        if (additionalContext.hasFileUpload) {
            const fileType = additionalContext.fileType || 'unknown type';
            contextInfo.push(`Customer has uploaded files (${fileType})`);
            
            // Track what files have been received if we're in PDF/password/video request scenario
            // Check conversation history to see if we previously asked for PDF/password/video
            const history = this.conversationHistory.get(userId) || [];
            const wasAskedForPDFAndVideo = history.some(msg => 
                msg.role === 'assistant' && 
                msg.message && 
                typeof msg.message === 'string' &&
                (msg.message.includes('PDF bank statement') || 
                 msg.message.includes('PDF बैंक') || 
                 msg.message.includes('PDF బ్యాంక్') ||
                 msg.message.includes('video recording') ||
                 msg.message.includes('वीडियो') ||
                 msg.message.includes('వీడియో'))
            );
            
            if (wasAskedForPDFAndVideo || additionalContext.waitingForPDFAndVideo) {
                // CRITICAL: Check actual history for accurate file status
                const history = this.conversationHistory.get(userId) || [];
                const filesInHistory = this.checkFilesInHistory(history);
                
                const hasPDF = filesInHistory.hasPDF || additionalContext.hasPDF || fileType === 'pdf';
                const hasPassword = filesInHistory.hasPassword || additionalContext.hasPassword || fileType === 'password' || additionalContext.passwordProvided;
                const hasVideo = filesInHistory.hasVideo || additionalContext.hasVideo || fileType === 'video';
                const hasAll = hasPDF && hasVideo && hasPassword;
                
                contextInfo.push(`\n=== FILE UPLOAD STATUS (After asking for PDF/Password/Video) ===`);
                contextInfo.push(`PDF: ${hasPDF ? 'RECEIVED ✓' : 'PENDING ✗'}`);
                contextInfo.push(`Password: ${hasPassword ? 'RECEIVED ✓' : 'PENDING ✗'}`);
                contextInfo.push(`Video: ${hasVideo ? 'RECEIVED ✓' : 'PENDING ✗'}`);
                contextInfo.push(`All files received: ${hasAll ? 'YES ✅' : 'NO ❌'}`);
                contextInfo.push(`\nCRITICAL INSTRUCTIONS:`);
                contextInfo.push(`1. You previously asked for PDF, password, and video because the receipt was >2 days old`);
                contextInfo.push(`2. The customer ALREADY provided a deposit receipt - DO NOT ask for receipt again`);
                contextInfo.push(`3. Acknowledge what was just received (${fileType})`);
                
                if (hasAll) {
                    contextInfo.push(`4. ✅ ALL FILES RECEIVED - Use this EXACT acknowledgment: "Thank you for providing all the necessary documents (PDF bank statement, password, and video recording). I have received everything. I will forward all the files to our relevant team for deep checking. Thank you for bearing with us."`);
                    contextInfo.push(`5. For follow-up messages after all files are received, use conversational responses (not template)`);
                } else {
                    const missing = [];
                    if (!hasPDF) missing.push('PDF bank statement');
                    if (!hasPassword) missing.push('PDF password (if protected)');
                    if (!hasVideo) missing.push('video recording');
                    contextInfo.push(`4. Still waiting for: ${missing.join(', ')}`);
                    contextInfo.push(`5. Response format: "Thank you for providing the [received items]. I have received [them/it]. To complete the verification, please also provide: [missing items]. I will forward all the files to our relevant team for deep checking once all items are received."`);
                }
                contextInfo.push(`=== END FILE UPLOAD STATUS ===\n`);
            }
        }
        
        if (additionalContext.isGreeting) {
            contextInfo.push(`This is the customer's FIRST MESSAGE - use greeting template`);
        }
        
        // CRITICAL: Build comprehensive conversation summary from ENTIRE history
        const fullHistory = this.conversationHistory.get(userId) || [];
        const conversationSummary = this.buildConversationSummaryForContext(fullHistory);
        if (conversationSummary) {
            contextInfo.push(`\n=== FULL CONVERSATION SUMMARY - READ THIS FIRST ===`);
            contextInfo.push(conversationSummary);
            contextInfo.push(`=== END SUMMARY ===\n`);
            contextInfo.push(`🚨🚨🚨 CRITICAL INSTRUCTIONS - MANDATORY 🚨🚨🚨`);
            contextInfo.push(`1. READ THE SUMMARY ABOVE - It contains ALL information from the ENTIRE conversation`);
            contextInfo.push(`2. If order number is listed → It was ALREADY provided → DO NOT ask for it again`);
            contextInfo.push(`3. If receipt is listed → It was ALREADY uploaded → DO NOT ask for it again`);
            contextInfo.push(`4. Use the summary to understand what was already shared, not just the current message`);
            contextInfo.push(`5. If summary shows both order number AND receipt → Proceed to STEP 4 (check database, then receipt age)`);
            contextInfo.push(`6. NEVER give generic greetings if order number or receipt was already provided`);
            contextInfo.push(`7. ALWAYS acknowledge what was already provided before asking for anything new\n`);
        } else {
            contextInfo.push(`\n=== CONVERSATION SUMMARY ===`);
            contextInfo.push(`No previous conversation data found. This appears to be a new conversation.`);
            contextInfo.push(`=== END SUMMARY ===\n`);
        }
        
        // CRITICAL: Check receipt status and add explicit context to OpenAI
        const receiptCheck = await this.detectReceipt(userId);
        if (receiptCheck.found) {
            contextInfo.push(`\n=== RECEIPT STATUS ===`);
            contextInfo.push(`✅ RECEIPT ALREADY PROVIDED - Found in: ${receiptCheck.source}`);
            contextInfo.push(`⚠️ CRITICAL: DO NOT ask for receipt again. The customer has already uploaded it.`);
            contextInfo.push(`⚠️ Instead, acknowledge the receipt and proceed with order status check.`);
            contextInfo.push(`=== END RECEIPT STATUS ===\n`);
        }
        
        // CRITICAL: Sync full conversation history to thread BEFORE adding current message
        // This ensures OpenAI can see the entire conversation, including file uploads
        // Wait for any active runs before syncing
        await this.waitForActiveRun(threadId);
        await this.syncConversationHistoryToThread(threadId, userId);
        
        if (contextInfo.length > 0) {
            contextMessage = `[CONTEXT]\n${contextInfo.join('\n')}\n\n[USER MESSAGE]\n${filteredMessage}`;
        } else {
            contextMessage = filteredMessage;
        }
        
        // Wait again before adding message to ensure no conflicts
        await this.waitForActiveRun(threadId);
        
        // Add current message to thread
        try {
            await this.openaiClient.beta.threads.messages.create(threadId, {
                role: "user",
                content: contextMessage
            });
        } catch (error) {
            if (error.message && error.message.includes('already has an active run')) {
                // Wait a bit more and retry once
                console.log('[OpenAI Thread] Active run detected, waiting and retrying...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.waitForActiveRun(threadId);
                await this.openaiClient.beta.threads.messages.create(threadId, {
                    role: "user",
                    content: contextMessage
                });
            } else {
                throw error;
            }
        }
        
        // Create a run
        const run = await this.openaiClient.beta.threads.runs.create(threadId, {
            assistant_id: this.assistantId
        });
        
        // Wait for the run to complete
        let runStatus = await this.openaiClient.beta.threads.runs.retrieve(threadId, run.id);
        
        // Poll for completion (max 30 seconds)
        let attempts = 0;
        const maxAttempts = 30;
        
        while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
            if (attempts >= maxAttempts) {
                throw new Error('OpenAI Assistant run timeout');
            }
            
            // Reduced polling interval from 1000ms to 500ms for faster response
            await new Promise(resolve => setTimeout(resolve, 500));
            runStatus = await this.openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            attempts++;
            
            // Handle function calling if needed
            if (runStatus.status === 'requires_action') {
                const toolCalls = runStatus.required_action?.submit_tool_outputs?.tool_calls || [];
                const toolOutputs = [];
                
                for (const toolCall of toolCalls) {
                    if (toolCall.function.name === 'check_order_number') {
                        const args = JSON.parse(toolCall.function.arguments);
                        const orderNumber = args.orderNumber;
                        
                        // Check database
                        const orderData = await new Promise((resolve) => {
                            this.checkOrderNumberInDatabase(orderNumber, (err, data) => {
                                resolve(data);
                            });
                        });
                        
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: JSON.stringify({
                                found: orderData?.found || false,
                                amount: orderData?.data?.amount || null,
                                status: orderData?.data?.paymentStatus || null
                            })
                        });
                    }
                }
                
                // Submit tool outputs
                await this.openaiClient.beta.threads.runs.submitToolOutputs(threadId, run.id, {
                    tool_outputs: toolOutputs
                });
                
                // Retrieve updated status
                runStatus = await this.openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            }
        }
        
        if (runStatus.status === 'completed') {
            // Get the assistant's response
            const messages = await this.openaiClient.beta.threads.messages.list(threadId, {
                limit: 1
            });
            
            const assistantMessage = messages.data[0];
            if (assistantMessage && assistantMessage.content && assistantMessage.content[0]) {
                let responseText = assistantMessage.content[0].text.value;
                
                // CRITICAL: Remove any internal context markers that might have leaked into the response
                responseText = this.cleanResponseFromContext(responseText);
                
                // Enforce exact response for order not found case
                // CRITICAL: Triple-check conversation history before asking for receipt
                if (issueType === 'deposit' && 
                    additionalContext.orderNumber && 
                    additionalContext.orderFound === false) {
                    // Check conversation history MULTIPLE ways to ensure receipt really doesn't exist
                    const history = this.conversationHistory.get(userId) || [];
                    const receiptExists = this.hasReceiptBeenUploaded(history);
                    
                    // Also check for receipt messages directly
                    const receiptMessages = history.filter(h => h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video'));
                    const hasReceiptByFileType = receiptMessages.length > 0;
                    
                    // If ANY check says receipt exists, NEVER ask for it
                    const receiptReallyExists = receiptExists || hasReceiptByFileType || additionalContext.hasReceipt;
                    
                    console.log(`[OpenAI Enforcement] Receipt check - receiptExists: ${receiptExists}, hasReceiptByFileType: ${hasReceiptByFileType}, hasReceipt: ${additionalContext.hasReceipt}, receiptReallyExists: ${receiptReallyExists}`);
                    
                    if (!receiptReallyExists) {
                        // Receipt really doesn't exist - enforce exact response
                        const requiredResponse = "The order number is currently on pending status. Can you provide me a deposit receipt for deep and better checking on it?";
                        if (responseText.trim() !== requiredResponse) {
                            console.warn(`[OpenAI Enforcement] Overriding AI response. Original: "${responseText.substring(0, 100)}"`);
                            return requiredResponse;
                        }
                    } else {
                        // Receipt exists - NEVER ask for it again
                        console.log(`[OpenAI Enforcement] Receipt found - SKIPPING "ask for receipt" enforcement. Will use template logic instead.`);
                    }
                }
                
                // CRITICAL: Filter offensive content from response
                const filteredResponse = this.filterOffensiveContent(responseText.trim());
                if (!filteredResponse) {
                    // If response was filtered out, return a default helpful message
                    return "I'm here to help you with your deposit concern. How can I assist you today?";
                }
                
                return filteredResponse;
            }
        }
        
        throw new Error(`OpenAI Assistant run failed with status: ${runStatus.status}`);
    }
    
    async generateTemplateResponse(message, issueType, language, additionalContext, context, userId = null) {
        // ABSOLUTE FINAL CHECK: Before generating ANY response, verify receipt AND order number from actual history
        // This ensures we handle ALL scenarios regardless of order:
        // 1. Receipt first, then order number
        // 2. Order number first, then receipt
        // 3. Both at the same time
        // This overrides any incorrect flags in additionalContext
        if (userId) {
            const actualHistory = this.conversationHistory.get(userId) || [];
            
            // CRITICAL: Always check receipt from history (handles receipt provided earlier)
            const actualReceiptExists = this.hasReceiptBeenUploaded(actualHistory) || 
                                       actualHistory.some(h => h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video'));
            
            if (actualReceiptExists && !additionalContext.hasReceipt) {
                console.log(`[Template Response] ⚠️ CRITICAL: Receipt exists in history but hasReceipt flag was false! Correcting...`);
                additionalContext.hasReceipt = true;
            }
            
            // CRITICAL: Always check order number from history (handles order number provided earlier)
            // This is especially important when receipt is provided AFTER order number
            if (!additionalContext.orderNumber) {
                const orderFromHistory = this.extractOrderNumberFromHistory(actualHistory);
                if (orderFromHistory) {
                    console.log(`[Template Response] ✅ Order number found in history (provided earlier): ${orderFromHistory}`);
                    additionalContext.orderNumber = orderFromHistory;
                }
            } else {
                // Even if order number is in context, verify it exists in history
                const orderFromHistory = this.extractOrderNumberFromHistory(actualHistory);
                if (orderFromHistory && orderFromHistory !== additionalContext.orderNumber) {
                    console.log(`[Template Response] ⚠️ Order number mismatch - Context: ${additionalContext.orderNumber}, History: ${orderFromHistory}. Using history value.`);
                    additionalContext.orderNumber = orderFromHistory;
                }
            }
            
            // CRITICAL: Final verification - if BOTH exist in history, ensure both flags are set
            // This handles the case where user provided them in any order
            if (actualReceiptExists && additionalContext.orderNumber) {
                console.log(`[Template Response] ✅ ADAPTIVE: Both receipt AND order number detected in history - proceeding to Step 4`);
                additionalContext.hasReceipt = true;
                // Don't ask for receipt again - we have both!
            }
        }
        
        // Template responses based on deposit concern handling process
        // All responses are polite, professional, and follow the deposit flow logic
        const templates = {
            english: {
                // Step 1: Greeting and ask for order number
                greeting: "Hello! I'm here to assist you with your deposit concern. To help you better, could you please provide your order number?",
                
                // Step 2: Order found - deposit successful
                orderFound: (amount) => {
                    if (amount) {
                        return `Great news! Your deposit of ₹${amount} has been successfully credited to your account. Please log in again to your Yono777 game account to check your updated balance. Thank you for reaching out to Yono777 customer service. We're happy to serve you!`;
                    }
                    return `Great news! Your deposit has been successfully credited to your account. Please log in again to your Yono777 game account to check your updated balance. Thank you for reaching out to Yono777 customer service. We're happy to serve you!`;
                },
                
                // Step 2: Order not found - ask for receipt
                orderNotFound: "Thank you for providing your order number. The order number is currently on pending status. To help us process your deposit faster, could you please provide me a deposit receipt for deep and better checking?",
                
                // Step 3: Receipt provided but no order number (vice versa)
                receiptNoOrder: "Thank you for providing the deposit receipt. I have received it. To proceed with processing your deposit, could you please provide your order number?",
                
                // Step 4: Receipt < 2 days old
                receiptRecent: "Thank you for providing your deposit receipt. Your transaction is currently being processed. Please wait 24-48 hours for it to be credited to your account. Your money is 100% safe with us. Thank you for reaching out to Yono777 customer service. We're happy to serve you!",
                
                // Step 4: Receipt >= 2 days old - ask for PDF, password, video
                receiptOld: "I see your receipt is more than 2 days old. To help process your deposit faster, please provide: (1) PDF bank statement, (2) PDF password (if protected), and (3) a video recording showing your successful deposit transaction.",
                
                // File upload acknowledgment
                fileUpload: (fileType) => {
                    if (fileType === 'password') {
                        return "Thank you for providing the password. I have received it along with your files. I will forward all the information to our relevant team for deep checking. Thank you for bearing with us.";
                    }
                    return "Thank you for providing the necessary documents. I will forward all the files to our relevant team for deep checking. Thank you for bearing with us.";
                },
                
                // General/other issues
                general: "Thank you for contacting Yono777 customer service. I'm here to help you. How can I assist you today?"
            },
            hindi: {
                greeting: "नमस्ते! मैं आपकी जमा समस्या में सहायता के लिए यहां हूं। बेहतर सहायता के लिए, क्या आप कृपया अपना ऑर्डर नंबर प्रदान कर सकते हैं?",
                orderFound: (amount) => {
                    if (amount) {
                        return `बहुत बढ़िया खबर! आपकी ₹${amount} की जमा राशि सफलतापूर्वक आपके खाते में जमा कर दी गई है। कृपया अपने Yono777 गेम खाते में फिर से लॉग इन करें और अपना अपडेटेड बैलेंस देखें। Yono777 ग्राहक सेवा से संपर्क करने के लिए धन्यवाद। हम आपकी सेवा करके खुश हैं!`;
                    }
                    return `बहुत बढ़िया खबर! आपकी जमा राशि सफलतापूर्वक आपके खाते में जमा कर दी गई है। कृपया अपने Yono777 गेम खाते में फिर से लॉग इन करें और अपना अपडेटेड बैलेंस देखें। Yono777 ग्राहक सेवा से संपर्क करने के लिए धन्यवाद। हम आपकी सेवा करके खुश हैं!`;
                },
                orderNotFound: "ऑर्डर नंबर वर्तमान में लंबित स्थिति में है। क्या आप मुझे गहरी और बेहतर जांच के लिए एक जमा रसीद प्रदान कर सकते हैं?",
                receiptNoOrder: "जमा रसीद प्रदान करने के लिए धन्यवाद। आगे बढ़ने के लिए, क्या आप कृपया अपना ऑर्डर नंबर प्रदान कर सकते हैं?",
                receiptRecent: "अपनी जमा रसीद प्रदान करने के लिए धन्यवाद। आपका लेनदेन वर्तमान में प्रसंस्करण में है। कृपया इसे आपके खाते में जमा होने के लिए 24-48 घंटे प्रतीक्षा करें। आपका पैसा 100% हमारे साथ सुरक्षित है। Yono777 ग्राहक सेवा से संपर्क करने के लिए धन्यवाद। हम आपकी सेवा करके खुश हैं!",
                receiptOld: "मैं देख रहा हूं कि आपकी रसीद 2 दिन से अधिक पुरानी है। आपकी जमा को तेजी से संसाधित करने में मदद करने के लिए, कृपया प्रदान करें: (1) PDF बैंक स्टेटमेंट, (2) PDF पासवर्ड (यदि संरक्षित है), और (3) आपके सफल जमा लेनदेन को दिखाने वाली वीडियो रिकॉर्डिंग।",
                fileUpload: (fileType) => {
                    if (fileType === 'password') {
                        return "पासवर्ड प्रदान करने के लिए धन्यवाद। मैंने इसे आपकी फाइलों के साथ प्राप्त कर लिया है। मैं सभी जानकारी को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा। हमारे साथ धैर्य रखने के लिए धन्यवाद।";
                    }
                    return "आवश्यक दस्तावेज प्रदान करने के लिए धन्यवाद। मैं सभी फाइलों को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा। हमारे साथ धैर्य रखने के लिए धन्यवाद।";
                },
                general: "Yono777 सपोर्ट से संपर्क करने के लिए धन्यवाद। मैं आज आपकी कैसे सहायता कर सकता हूं?"
            },
            telugu: {
                greeting: "నమస్కారం! నేను మీ జమ సమస్యలో సహాయం చేయడానికి ఇక్కడ ఉన్నాను. మంచి సహాయం కోసం, దయచేసి మీ ఆర్డర్ నంబర్ అందించగలరా?",
                orderFound: (amount) => {
                    if (amount) {
                        return `చాలా మంచి వార్త! మీ ₹${amount} జమ మొత్తం విజయవంతంగా మీ ఖాతాకు జమ చేయబడింది. దయచేసి మీ Yono777 గేమ్ ఖాతాకు మళ్లీ లాగిన్ చేసి మీ నవీకరించబడిన బ్యాలెన్స్ తనిఖీ చేయండి. Yono777 కస్టమర్ సర్వీస్ కు సంప్రదించినందుకు ధన్యవాదాలు. మేము మీకు సేవ చేయడం సంతోషంగా ఉంది!`;
                    }
                    return `చాలా మంచి వార్త! మీ జమ విజయవంతంగా మీ ఖాతాకు జమ చేయబడింది. దయచేసి మీ Yono777 గేమ్ ఖాతాకు మళ్లీ లాగిన్ చేసి మీ నవీకరించబడిన బ్యాలెన్స్ తనిఖీ చేయండి. Yono777 కస్టమర్ సర్వీస్ కు సంప్రదించినందుకు ధన్యవాదాలు. మేము మీకు సేవ చేయడం సంతోషంగా ఉంది!`;
                },
                orderNotFound: "ఆర్డర్ నంబర్ ప్రస్తుతం పెండింగ్ స్థితిలో ఉంది. లోతైన మరియు మంచి తనిఖీ కోసం మీరు నాకు జమ రసీదు అందించగలరా?",
                receiptNoOrder: "జమ రసీదు అందించినందుకు ధన్యవాదాలు. ముందుకు సాగడానికి, దయచేసి మీ ఆర్డర్ నంబర్ అందించగలరా?",
                receiptRecent: "మీ జమ రసీదు అందించినందుకు ధన్యవాదాలు. మీ లావాదేవీ ప్రస్తుతం ప్రాసెస్ చేయబడుతోంది. దయచేసి ఇది మీ ఖాతాకు జమ చేయడానికి 24-48 గంటలు వేచి ఉండండి. మీ డబ్బు 100% మాతో సురక్షితంగా ఉంది. Yono777 కస్టమర్ సర్వీస్ కు సంప్రదించినందుకు ధన్యవాదాలు. మేము మీకు సేవ చేయడం సంతోషంగా ఉంది!",
                receiptOld: "మీ రసీదు 2 రోజుల కంటే ఎక్కువ పాతదని నేను చూస్తున్నాను. మీ జమను వేగంగా ప్రాసెస్ చేయడంలో సహాయం చేయడానికి, దయచేసి అందించండి: (1) PDF బ్యాంక్ స్టేట్మెంట్, (2) PDF పాస్వర్డ్ (రక్షితమైతే), మరియు (3) మీ విజయవంతమైన జమ లావాదేవీని చూపించే వీడియో రికార్డింగ్.",
                fileUpload: (fileType) => {
                    if (fileType === 'password') {
                        return "పాస్వర్డ్ అందించినందుకు ధన్యవాదాలు. నేను దీన్ని మీ ఫైళ్లతో సహా స్వీకరించాను. నేను అన్ని సమాచారాన్ని మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను. మాతో ఓర్పు కనబరచినందుకు ధన్యవాదాలు.";
                    }
                    return "అవసరమైన పత్రాలు అందించినందుకు ధన్యవాదాలు. నేను అన్ని ఫైళ్లను మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను. మాతో ఓర్పు కనబరచినందుకు ధన్యవాదాలు.";
                },
                general: "Yono777 సపోర్ట్ కు సంప్రదించినందుకు ధన్యవాదాలు. నేను ఈరోజు మీకు ఎలా సహాయం చేయగలను?"
            },
            bengali: {
                greeting: "নমস্কার! আমি আপনার জমা সমস্যায় সহায়তা করতে এখানে আছি। আরও ভালো সহায়তার জন্য, অনুগ্রহ করে আপনার অর্ডার নম্বর প্রদান করতে পারেন?",
                orderFound: (amount) => {
                    if (amount) {
                        return `খুশির খবর! আপনার ₹${amount} জমা সফলভাবে আপনার অ্যাকাউন্টে জমা হয়েছে। অনুগ্রহ করে আপনার Yono777 গেম অ্যাকাউন্টে আবার লগইন করুন এবং আপনার আপডেট করা ব্যালেন্স পরীক্ষা করুন। Yono777 গ্রাহক সেবার সাথে যোগাযোগ করার জন্য ধন্যবাদ। আমরা আপনাকে সেবা দিতে খুশি!`;
                    }
                    return `খুশির খবর! আপনার জমা সফলভাবে আপনার অ্যাকাউন্টে জমা হয়েছে। অনুগ্রহ করে আপনার Yono777 গেম অ্যাকাউন্টে আবার লগইন করুন এবং আপনার আপডেট করা ব্যালেন্স পরীক্ষা করুন। Yono777 গ্রাহক সেবার সাথে যোগাযোগ করার জন্য ধন্যবাদ। আমরা আপনাকে সেবা দিতে খুশি!`;
                },
                orderNotFound: "অর্ডার নম্বরটি বর্তমানে পেন্ডিং অবস্থায় রয়েছে। গভীর এবং ভালো পরীক্ষার জন্য আপনি কি আমাকে একটি জমা রসিদ প্রদান করতে পারেন?",
                receiptNoOrder: "জমা রসিদ প্রদান করার জন্য ধন্যবাদ। এগিয়ে যাওয়ার জন্য, অনুগ্রহ করে আপনার অর্ডার নম্বর প্রদান করতে পারেন?",
                receiptRecent: "আপনার জমা রসিদ প্রদান করার জন্য ধন্যবাদ। আপনার লেনদেন বর্তমানে প্রক্রিয়াকরণ করা হচ্ছে। অনুগ্রহ করে এটি আপনার অ্যাকাউন্টে জমা হওয়ার জন্য 24-48 ঘন্টা অপেক্ষা করুন। আপনার টাকা 100% আমাদের সাথে নিরাপদ। Yono777 গ্রাহক সেবার সাথে যোগাযোগ করার জন্য ধন্যবাদ। আমরা আপনাকে সেবা দিতে খুশি!",
                receiptOld: "আমি দেখছি যে আপনার রসিদ 2 দিনের বেশি পুরানো। আপনার জমা দ্রুত প্রক্রিয়া করতে সাহায্য করার জন্য, অনুগ্রহ করে প্রদান করুন: (1) PDF ব্যাঙ্ক স্টেটমেন্ট, (2) PDF পাসওয়ার্ড (যদি সুরক্ষিত থাকে), এবং (3) আপনার সফল জমা লেনদেন দেখানো একটি ভিডিও রেকর্ডিং।",
                fileUpload: (fileType) => {
                    if (fileType === 'password') {
                        return "পাসওয়ার্ড প্রদান করার জন্য ধন্যবাদ। আমি এটি আপনার ফাইলগুলির সাথে পেয়েছি। আমি সমস্ত তথ্য আমাদের প্রাসঙ্গিক দলের কাছে গভীর পরীক্ষার জন্য পাঠাব। আমাদের সাথে ধৈর্য ধরার জন্য ধন্যবাদ।";
                    }
                    return "প্রয়োজনীয় নথি প্রদান করার জন্য ধন্যবাদ। আমি সমস্ত ফাইল আমাদের প্রাসঙ্গিক দলের কাছে গভীর পরীক্ষার জন্য পাঠাব। আমাদের সাথে ধৈর্য ধরার জন্য ধন্যবাদ।";
                },
                general: "Yono777 সাপোর্টের সাথে যোগাযোগ করার জন্য ধন্যবাদ। আমি আজ আপনাকে কীভাবে সহায়তা করতে পারি?"
            },
            tamil: {
                greeting: "வணக்கம்! நான் உங்கள் ஜமா பிரச்சனையில் உதவ செய்ய இங்கே இருக்கிறேன்। சிறந்த உதவிக்காக, தயவுசெய்து உங்கள் ஆர்டர் எண்ணை வழங்க முடியுமா?",
                orderFound: (amount) => {
                    if (amount) {
                        return `நல்ல செய்தி! உங்கள் ₹${amount} ஜமா வெற்றிகரமாக உங்கள் கணக்கில் ஜமா செய்யப்பட்டது। தயவுசெய்து உங்கள் Yono777 விளையாட்டு கணக்கில் மீண்டும் உள்நுழைந்து உங்கள் புதுப்பிக்கப்பட்ட இருப்பை சரிபார்க்கவும்। Yono777 வாடிக்கையாளர் சேவையை அணுகியதற்கு நன்றி। உங்களுக்கு சேவை செய்ய நாங்கள் மகிழ்ச்சியடைகிறோம்!`;
                    }
                    return `நல்ல செய்தி! உங்கள் ஜமா வெற்றிகரமாக உங்கள் கணக்கில் ஜமா செய்யப்பட்டது। தயவுசெய்து உங்கள் Yono777 விளையாட்டு கணக்கில் மீண்டும் உள்நுழைந்து உங்கள் புதுப்பிக்கப்பட்ட இருப்பை சரிபார்க்கவும்। Yono777 வாடிக்கையாளர் சேவையை அணுகியதற்கு நன்றி। உங்களுக்கு சேவை செய்ய நாங்கள் மகிழ்ச்சியடைகிறோம்!`;
                },
                orderNotFound: "ஆர்டர் எண் தற்போது நிலுவையில் உள்ளது। ஆழமான மற்றும் சிறந்த சரிபார்ப்புக்காக, நீங்கள் எனக்கு ஒரு ஜமா ரசீதை வழங்க முடியுமா?",
                receiptNoOrder: "ஜமா ரசீதை வழங்கியதற்கு நன்றி। தொடர, தயவுசெய்து உங்கள் ஆர்டர் எண்ணை வழங்க முடியுமா?",
                receiptRecent: "உங்கள் ஜமா ரசீதை வழங்கியதற்கு நன்றி। உங்கள் பரிவர்த்தனை தற்போது செயலாக்கப்படுகிறது। தயவுசெய்து இது உங்கள் கணக்கில் ஜமா செய்ய 24-48 மணிநேரம் காத்திருக்கவும்। உங்கள் பணம் 100% எங்களுடன் பாதுகாப்பானது। Yono777 வாடிக்கையாளர் சேவையை அணுகியதற்கு நன்றி। உங்களுக்கு சேவை செய்ய நாங்கள் மகிழ்ச்சியடைகிறோம்!",
                receiptOld: "உங்கள் ரசீது 2 நாட்களுக்கு மேல் பழையது என்பதை நான் காண்கிறேன்। உங்கள் ஜமாவை விரைவாக செயலாக்க உதவ, தயவுசெய்து வழங்கவும்: (1) PDF வங்கி அறிக்கை, (2) PDF கடவுச்சொல் (பாதுகாக்கப்பட்டிருந்தால்), மற்றும் (3) உங்கள் வெற்றிகரமான ஜமா பரிவர்த்தனையைக் காட்டும் வீடியோ பதிவு.",
                fileUpload: (fileType) => {
                    if (fileType === 'password') {
                        return "கடவுச்சொல்லை வழங்கியதற்கு நன்றி। நான் அதை உங்கள் கோப்புகளுடன் பெற்றுள்ளேன்। நான் அனைத்து தகவலையும் எங்கள் தொடர்புடைய குழுவிற்கு ஆழமான சரிபார்ப்புக்காக அனுப்புவேன்। எங்களுடன் பொறுமையாக இருந்ததற்கு நன்றி.";
                    }
                    return "தேவையான ஆவணங்களை வழங்கியதற்கு நன்றி। நான் அனைத்து கோப்புகளையும் எங்கள் தொடர்புடைய குழுவிற்கு ஆழமான சரிபார்ப்புக்காக அனுப்புவேன்। எங்களுடன் பொறுமையாக இருந்ததற்கு நன்றி.";
                },
                general: "Yono777 ஆதரவைத் தொடர்பு கொண்டதற்கு நன்றி। நான் இன்று உங்களுக்கு எவ்வாறு உதவ முடியும்?"
            },
            gujarati: {
                greeting: "નમસ્તે! હું તમારી જમા સમસ્યામાં સહાય કરવા માટે અહીં છું। વધુ સારી સહાય માટે, કૃપા કરીને તમારો ઓર્ડર નંબર પ્રદાન કરી શકો છો?",
                orderFound: (amount) => {
                    if (amount) {
                        return `સારા સમાચાર! તમારી ₹${amount} જમા સફળતાપૂર્વક તમારા એકાઉન્ટમાં જમા થઈ છે। કૃપા કરીને તમારા Yono777 ગેમ એકાઉન્ટમાં ફરીથી લૉગ ઇન કરો અને તમારી અપડેટ કરેલી બેલેન્સ તપાસો। Yono777 ગ્રાહક સેવાનો સંપર્ક કરવા બદલ આભાર। અમે તમારી સેવા કરવા માટે ખુશ છીએ!`;
                    }
                    return `સારા સમાચાર! તમારી જમા સફળતાપૂર્વક તમારા એકાઉન્ટમાં જમા થઈ છે। કૃપા કરીને તમારા Yono777 ગેમ એકાઉન્ટમાં ફરીથી લૉગ ઇન કરો અને તમારી અપડેટ કરેલી બેલેન્સ તપાસો। Yono777 ગ્રાહક સેવાનો સંપર્ક કરવા બદલ આભાર। અમે તમારી સેવા કરવા માટે ખુશ છીએ!`;
                },
                orderNotFound: "ઓર્ડર નંબર હાલમાં પેન્ડિંગ સ્થિતિમાં છે। ઊંડી અને સારી તપાસ માટે, શું તમે મને જમા રસીદ પ્રદાન કરી શકો છો?",
                receiptNoOrder: "જમા રસીદ પ્રદાન કરવા બદલ આભાર। આગળ વધવા માટે, કૃપા કરીને તમારો ઓર્ડર નંબર પ્રદાન કરી શકો છો?",
                receiptRecent: "તમારી જમા રસીદ પ્રદાન કરવા બદલ આભાર। તમારું વ્યવહાર હાલમાં પ્રક્રિયા કરવામાં આવી રહ્યું છે। કૃપા કરીને તે તમારા એકાઉન્ટમાં જમા થવા માટે 24-48 કલાક રાહ જુઓ। તમારા પૈસા 100% અમારી સાથે સુરક્ષિત છે। Yono777 ગ્રાહક સેવાનો સંપર્ક કરવા બદલ આભાર। અમે તમારી સેવા કરવા માટે ખુશ છીએ!",
                receiptOld: "હું જોઉં છું કે તમારી રસીદ 2 દિવસથી વધુ જૂની છે। તમારી જમાને ઝડપથી પ્રક્રિયા કરવામાં મદદ કરવા માટે, કૃપા કરીને પ્રદાન કરો: (1) PDF બેંક સ્ટેટમેન્ટ, (2) PDF પાસવર્ડ (જો સુરક્ષિત હોય), અને (3) તમારા સફળ જમા વ્યવહાર દર્શાવતી વિડિઓ રેકોર્ડિંગ.",
                fileUpload: (fileType) => {
                    if (fileType === 'password') {
                        return "પાસવર્ડ પ્રદાન કરવા બદલ આભાર। મેં તે તમારી ફાઇલો સાથે પ્રાપ્ત કરી છે। હું બધી માહિતી અમારી સંબંધિત ટીમને ઊંડી તપાસ માટે મોકલીશ। અમારી સાથે ધીરજ રાખવા બદલ આભાર.";
                    }
                    return "જરૂરી દસ્તાવેજો પ્રદાન કરવા બદલ આભાર। હું બધી ફાઇલો અમારી સંબંધિત ટીમને ઊંડી તપાસ માટે મોકલીશ। અમારી સાથે ધીરજ રાખવા બદલ આભાર.";
                },
                general: "Yono777 સપોર્ટનો સંપર્ક કરવા બદલ આભાર। હું આજે તમારી કેવી રીતે સહાય કરી શકું?"
            },
            kannada: {
                greeting: "ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ ಜಮಾ ಸಮಸ್ಯೆಯಲ್ಲಿ ಸಹಾಯ ಮಾಡಲು ಇಲ್ಲಿದ್ದೇನೆ। ಉತ್ತಮ ಸಹಾಯಕ್ಕಾಗಿ, ದಯವಿಟ್ಟು ನಿಮ್ಮ ಆರ್ಡರ್ ಸಂಖ್ಯೆಯನ್ನು ನೀಡಬಹುದೇ?",
                orderFound: (amount) => {
                    if (amount) {
                        return `ಒಳ್ಳೆಯ ಸುದ್ದಿ! ನಿಮ್ಮ ₹${amount} ಜಮಾ ಯಶಸ್ವಿಯಾಗಿ ನಿಮ್ಮ ಖಾತೆಗೆ ಜಮಾ ಮಾಡಲಾಗಿದೆ। ದಯವಿಟ್ಟು ನಿಮ್ಮ Yono777 ಆಟದ ಖಾತೆಗೆ ಮತ್ತೆ ಲಾಗ್ ಇನ್ ಮಾಡಿ ಮತ್ತು ನಿಮ್ಮ ನವೀಕೃತ ಬ್ಯಾಲೆನ್ಸ್ ಪರಿಶೀಲಿಸಿ। Yono777 ಗ್ರಾಹಕ ಸೇವೆಯನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು। ನಿಮಗೆ ಸೇವೆ ಸಲ್ಲಿಸಲು ನಾವು ಸಂತೋಷಪಡುತ್ತೇವೆ!`;
                    }
                    return `ಒಳ್ಳೆಯ ಸುದ್ದಿ! ನಿಮ್ಮ ಜಮಾ ಯಶಸ್ವಿಯಾಗಿ ನಿಮ್ಮ ಖಾತೆಗೆ ಜಮಾ ಮಾಡಲಾಗಿದೆ। ದಯವಿಟ್ಟು ನಿಮ್ಮ Yono777 ಆಟದ ಖಾತೆಗೆ ಮತ್ತೆ ಲಾಗ್ ಇನ್ ಮಾಡಿ ಮತ್ತು ನಿಮ್ಮ ನವೀಕೃತ ಬ್ಯಾಲೆನ್ಸ್ ಪರಿಶೀಲಿಸಿ। Yono777 ಗ್ರಾಹಕ ಸೇವೆಯನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು। ನಿಮಗೆ ಸೇವೆ ಸಲ್ಲಿಸಲು ನಾವು ಸಂತೋಷಪಡುತ್ತೇವೆ!`;
                },
                orderNotFound: "ಆರ್ಡರ್ ಸಂಖ್ಯೆಯು ಪ್ರಸ್ತುತ ಪೆಂಡಿಂಗ್ ಸ್ಥಿತಿಯಲ್ಲಿದೆ। ಆಳವಾದ ಮತ್ತು ಉತ್ತಮ ಪರಿಶೀಲನೆಗಾಗಿ, ನೀವು ನನಗೆ ಜಮಾ ರಸೀದಿಯನ್ನು ನೀಡಬಹುದೇ?",
                receiptNoOrder: "ಜಮಾ ರಸೀದಿಯನ್ನು ನೀಡಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು। ಮುಂದುವರಿಯಲು, ದಯವಿಟ್ಟು ನಿಮ್ಮ ಆರ್ಡರ್ ಸಂಖ್ಯೆಯನ್ನು ನೀಡಬಹುದೇ?",
                receiptRecent: "ನಿಮ್ಮ ಜಮಾ ರಸೀದಿಯನ್ನು ನೀಡಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು। ನಿಮ್ಮ ವಹಿವಾಟು ಪ್ರಸ್ತುತ ಪ್ರಕ್ರಿಯೆಗೊಳ್ಳುತ್ತಿದೆ। ದಯವಿಟ್ಟು ಅದು ನಿಮ್ಮ ಖಾತೆಗೆ ಜಮಾ ಆಗಲು 24-48 ಗಂಟೆಗಳು ಕಾಯಿರಿ। ನಿಮ್ಮ ಹಣ 100% ನಮ್ಮೊಂದಿಗೆ ಸುರಕ್ಷಿತವಾಗಿದೆ। Yono777 ಗ್ರಾಹಕ ಸೇವೆಯನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು। ನಿಮಗೆ ಸೇವೆ ಸಲ್ಲಿಸಲು ನಾವು ಸಂತೋಷಪಡುತ್ತೇವೆ!",
                receiptOld: "ನಿಮ್ಮ ರಸೀದಿಯು 2 ದಿನಗಳಿಗಿಂತ ಹೆಚ್ಚು ಹಳೆಯದಾಗಿದೆ ಎಂದು ನಾನು ನೋಡುತ್ತೇನೆ। ನಿಮ್ಮ ಜಮಾವನ್ನು ವೇಗವಾಗಿ ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲು ಸಹಾಯ ಮಾಡಲು, ದಯವಿಟ್ಟು ನೀಡಿ: (1) PDF ಬ್ಯಾಂಕ್ ಸ್ಟೇಟ್ಮೆಂಟ್, (2) PDF ಪಾಸ್ವರ್ಡ್ (ಸುರಕ್ಷಿತವಾಗಿದ್ದರೆ), ಮತ್ತು (3) ನಿಮ್ಮ ಯಶಸ್ವಿ ಜಮಾ ವಹಿವಾಟನ್ನು ತೋರಿಸುವ ವೀಡಿಯೊ ರೆಕಾರ್ಡಿಂಗ್.",
                fileUpload: (fileType) => {
                    if (fileType === 'password') {
                        return "ಪಾಸ್ವರ್ಡ್ ನೀಡಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು। ನಾನು ಅದನ್ನು ನಿಮ್ಮ ಫೈಲ್ಗಳೊಂದಿಗೆ ಸ್ವೀಕರಿಸಿದ್ದೇನೆ। ನಾನು ಎಲ್ಲಾ ಮಾಹಿತಿಯನ್ನು ನಮ್ಮ ಸಂಬಂಧಿತ ತಂಡಕ್ಕೆ ಆಳವಾದ ಪರಿಶೀಲನೆಗಾಗಿ ಕಳುಹಿಸುತ್ತೇನೆ। ನಮ್ಮೊಂದಿಗೆ ತಾಳ್ಮೆ ಇಟ್ಟಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು.";
                    }
                    return "ಅಗತ್ಯವಿರುವ ದಾಖಲೆಗಳನ್ನು ನೀಡಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು। ನಾನು ಎಲ್ಲಾ ಫೈಲ್ಗಳನ್ನು ನಮ್ಮ ಸಂಬಂಧಿತ ತಂಡಕ್ಕೆ ಆಳವಾದ ಪರಿಶೀಲನೆಗಾಗಿ ಕಳುಹಿಸುತ್ತೇನೆ। ನಮ್ಮೊಂದಿಗೆ ತಾಳ್ಮೆ ಇಟ್ಟಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು.";
                },
                general: "Yono777 ಬೆಂಬಲವನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು। ನಾನು ಇಂದು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?"
            },
            malayalam: {
                greeting: "നമസ്കാരം! നിങ്ങളുടെ ജമാ പ്രശ്നത്തിൽ സഹായിക്കാൻ ഞാൻ ഇവിടെയുണ്ട്। മികച്ച സഹായത്തിനായി, ദയവായി നിങ്ങളുടെ ഓർഡർ നമ്പർ നൽകാമോ?",
                orderFound: (amount) => {
                    if (amount) {
                        return `നല്ല വാർത്ത! നിങ്ങളുടെ ₹${amount} ജമാ വിജയകരമായി നിങ്ങളുടെ അക്കൗണ്ടിലേക്ക് ജമാ ചെയ്തു। ദയവായി നിങ്ങളുടെ Yono777 ഗെയിം അക്കൗണ്ടിലേക്ക് വീണ്ടും ലോഗിൻ ചെയ്ത് നിങ്ങളുടെ അപ്ഡേറ്റ് ചെയ്ത ബാലൻസ് പരിശോധിക്കുക। Yono777 കസ്റ്റമർ സേവനവുമായി ബന്ധപ്പെട്ടതിന് നന്ദി। നിങ്ങൾക്ക് സേവനം നൽകുന്നതിൽ ഞങ്ങൾ സന്തോഷിക്കുന്നു!`;
                    }
                    return `നല്ല വാർത്ത! നിങ്ങളുടെ ജമാ വിജയകരമായി നിങ്ങളുടെ അക്കൗണ്ടിലേക്ക് ജമാ ചെയ്തു। ദയവായി നിങ്ങളുടെ Yono777 ഗെയിം അക്കൗണ്ടിലേക്ക് വീണ്ടും ലോഗിൻ ചെയ്ത് നിങ്ങളുടെ അപ്ഡേറ്റ് ചെയ്ത ബാലൻസ് പരിശോധിക്കുക। Yono777 കസ്റ്റമർ സേവനവുമായി ബന്ധപ്പെട്ടതിന് നന്ദി। നിങ്ങൾക്ക് സേവനം നൽകുന്നതിൽ ഞങ്ങൾ സന്തോഷിക്കുന്നു!`;
                },
                orderNotFound: "ഓർഡർ നമ്പർ നിലവിൽ പെൻഡിംഗ് നിലയിലാണ്। ആഴത്തിലുള്ളതും മികച്ചതുമായ പരിശോധനയ്ക്കായി, നിങ്ങൾക്ക് എനിക്ക് ഒരു ജമാ രസീത് നൽകാമോ?",
                receiptNoOrder: "ജമാ രസീത് നൽകിയതിന് നന്ദി। തുടരാൻ, ദയവായി നിങ്ങളുടെ ഓർഡർ നമ്പർ നൽകാമോ?",
                receiptRecent: "നിങ്ങളുടെ ജമാ രസീത് നൽകിയതിന് നന്ദി। നിങ്ങളുടെ ഇടപാട് നിലവിൽ പ്രോസസ്സ് ചെയ്യുന്നു। ദയവായി അത് നിങ്ങളുടെ അക്കൗണ്ടിലേക്ക് ജമാ ചെയ്യാൻ 24-48 മണിക്കൂർ കാത്തിരിക്കുക। നിങ്ങളുടെ പണം 100% ഞങ്ങളോടൊപ്പം സുരക്ഷിതമാണ്। Yono777 കസ്റ്റമർ സേവനവുമായി ബന്ധപ്പെട്ടതിന് നന്ദി। നിങ്ങൾക്ക് സേവനം നൽകുന്നതിൽ ഞങ്ങൾ സന്തോഷിക്കുന്നു!",
                receiptOld: "നിങ്ങളുടെ രസീത് 2 ദിവസത്തിലധികം പഴയതാണെന്ന് ഞാൻ കാണുന്നു। നിങ്ങളുടെ ജമാ വേഗത്തിൽ പ്രോസസ്സ് ചെയ്യാൻ സഹായിക്കാൻ, ദയവായി നൽകുക: (1) PDF ബാങ്ക് സ്റ്റേറ്റ്മെന്റ്, (2) PDF പാസ്‌വേഡ് (സംരക്ഷിതമാണെങ്കിൽ), (3) നിങ്ങളുടെ വിജയകരമായ ജമാ ഇടപാട് കാണിക്കുന്ന വീഡിയോ റെക്കോർഡിംഗ്.",
                fileUpload: (fileType) => {
                    if (fileType === 'password') {
                        return "പാസ്‌വേഡ് നൽകിയതിന് നന്ദി। ഞാൻ അത് നിങ്ങളുടെ ഫയലുകളോടൊപ്പം സ്വീകരിച്ചു। ഞാൻ എല്ലാ വിവരങ്ങളും ഞങ്ങളുടെ ബന്ധപ്പെട്ട ടീമിലേക്ക് ആഴത്തിലുള്ള പരിശോധനയ്ക്കായി അയയ്ക്കും। ഞങ്ങളോടൊപ്പം ക്ഷമിക്കുന്നതിന് നന്ദി.";
                    }
                    return "ആവശ്യമായ രേഖകൾ നൽകിയതിന് നന്ദി। ഞാൻ എല്ലാ ഫയലുകളും ഞങ്ങളുടെ ബന്ധപ്പെട്ട ടീമിലേക്ക് ആഴത്തിലുള്ള പരിശോധനയ്ക്കായി അയയ്ക്കും। ഞങ്ങളോടൊപ്പം ക്ഷമിക്കുന്നതിന് നന്ദി.";
                },
                general: "Yono777 പിന്തുണയുമായി ബന്ധപ്പെട്ടതിന് നന്ദി। ഇന്ന് ഞാൻ നിങ്ങൾക്ക് എങ്ങനെ സഹായിക്കാം?"
            },
            punjabi: {
                greeting: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਤੁਹਾਡੀ ਜਮਾ ਸਮੱਸਿਆ ਵਿੱਚ ਸਹਾਇਤਾ ਕਰਨ ਲਈ ਇੱਥੇ ਹਾਂ। ਬਿਹਤਰ ਸਹਾਇਤਾ ਲਈ, ਕਿਰਪਾ ਕਰਕੇ ਤੁਸੀਂ ਆਪਣਾ ਆਰਡਰ ਨੰਬਰ ਦੇ ਸਕਦੇ ਹੋ?",
                orderFound: (amount) => {
                    if (amount) {
                        return `ਚੰਗੀ ਖਬਰ! ਤੁਹਾਡੀ ₹${amount} ਜਮਾ ਸਫਲਤਾਪੂਰਵਕ ਤੁਹਾਡੇ ਖਾਤੇ ਵਿੱਚ ਜਮਾ ਕੀਤੀ ਗਈ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੇ Yono777 ਗੇਮ ਖਾਤੇ ਵਿੱਚ ਦੁਬਾਰਾ ਲਾਗਇਨ ਕਰੋ ਅਤੇ ਆਪਣਾ ਅਪਡੇਟ ਕੀਤਾ ਬੈਲੇਂਸ ਜਾਂਚੋ। Yono777 ਗ੍ਰਾਹਕ ਸੇਵਾ ਨਾਲ ਸੰਪਰਕ ਕਰਨ ਲਈ ਧੰਨਵਾਦ। ਅਸੀਂ ਤੁਹਾਡੀ ਸੇਵਾ ਕਰਨ ਵਿੱਚ ਖੁਸ਼ ਹਾਂ!`;
                    }
                    return `ਚੰਗੀ ਖਬਰ! ਤੁਹਾਡੀ ਜਮਾ ਸਫਲਤਾਪੂਰਵਕ ਤੁਹਾਡੇ ਖਾਤੇ ਵਿੱਚ ਜਮਾ ਕੀਤੀ ਗਈ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੇ Yono777 ਗੇਮ ਖਾਤੇ ਵਿੱਚ ਦੁਬਾਰਾ ਲਾਗਇਨ ਕਰੋ ਅਤੇ ਆਪਣਾ ਅਪਡੇਟ ਕੀਤਾ ਬੈਲੇਂਸ ਜਾਂਚੋ। Yono777 ਗ੍ਰਾਹਕ ਸੇਵਾ ਨਾਲ ਸੰਪਰਕ ਕਰਨ ਲਈ ਧੰਨਵਾਦ। ਅਸੀਂ ਤੁਹਾਡੀ ਸੇਵਾ ਕਰਨ ਵਿੱਚ ਖੁਸ਼ ਹਾਂ!`;
                },
                orderNotFound: "ਆਰਡਰ ਨੰਬਰ ਇਸ ਸਮੇਂ ਪੈਂਡਿੰਗ ਸਥਿਤੀ ਵਿੱਚ ਹੈ। ਡੂੰਘੀ ਅਤੇ ਬਿਹਤਰ ਜਾਂਚ ਲਈ, ਕੀ ਤੁਸੀਂ ਮੈਨੂੰ ਇੱਕ ਜਮਾ ਰਸੀਦ ਦੇ ਸਕਦੇ ਹੋ?",
                receiptNoOrder: "ਜਮਾ ਰਸੀਦ ਦੇਣ ਲਈ ਧੰਨਵਾਦ। ਅੱਗੇ ਵਧਣ ਲਈ, ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਆਰਡਰ ਨੰਬਰ ਦੇ ਸਕਦੇ ਹੋ?",
                receiptRecent: "ਆਪਣੀ ਜਮਾ ਰਸੀਦ ਦੇਣ ਲਈ ਧੰਨਵਾਦ। ਤੁਹਾਡਾ ਲੈਣ-ਦੇਣ ਇਸ ਸਮੇਂ ਪ੍ਰਕਿਰਿਆ ਕੀਤਾ ਜਾ ਰਿਹਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਇਹ ਤੁਹਾਡੇ ਖਾਤੇ ਵਿੱਚ ਜਮਾ ਹੋਣ ਲਈ 24-48 ਘੰਟੇ ਉਡੀਕ ਕਰੋ। ਤੁਹਾਡਾ ਪੈਸਾ 100% ਸਾਡੇ ਨਾਲ ਸੁਰੱਖਿਤ ਹੈ। Yono777 ਗ੍ਰਾਹਕ ਸੇਵਾ ਨਾਲ ਸੰਪਰਕ ਕਰਨ ਲਈ ਧੰਨਵਾਦ। ਅਸੀਂ ਤੁਹਾਡੀ ਸੇਵਾ ਕਰਨ ਵਿੱਚ ਖੁਸ਼ ਹਾਂ!",
                receiptOld: "ਮੈਂ ਵੇਖ ਰਿਹਾ ਹਾਂ ਕਿ ਤੁਹਾਡੀ ਰਸੀਦ 2 ਦਿਨਾਂ ਤੋਂ ਵੱਧ ਪੁਰਾਣੀ ਹੈ। ਤੁਹਾਡੀ ਜਮਾ ਨੂੰ ਤੇਜ਼ੀ ਨਾਲ ਪ੍ਰਕਿਰਿਆ ਕਰਨ ਵਿੱਚ ਸਹਾਇਤਾ ਕਰਨ ਲਈ, ਕਿਰਪਾ ਕਰਕੇ ਦੇਓ: (1) PDF ਬੈਂਕ ਸਟੇਟਮੈਂਟ, (2) PDF ਪਾਸਵਰਡ (ਜੇ ਸੁਰੱਖਿਤ ਹੈ), ਅਤੇ (3) ਤੁਹਾਡੇ ਸਫਲ ਜਮਾ ਲੈਣ-ਦੇਣ ਨੂੰ ਦਿਖਾਉਣ ਵਾਲੀ ਵੀਡੀਓ ਰਿਕਾਰਡਿੰਗ।",
                fileUpload: (fileType) => {
                    if (fileType === 'password') {
                        return "ਪਾਸਵਰਡ ਦੇਣ ਲਈ ਧੰਨਵਾਦ। ਮੈਂ ਇਸਨੂੰ ਤੁਹਾਡੀਆਂ ਫਾਈਲਾਂ ਨਾਲ ਪ੍ਰਾਪਤ ਕੀਤਾ ਹੈ। ਮੈਂ ਸਾਰੀ ਜਾਣਕਾਰੀ ਸਾਡੀ ਸੰਬੰਧਿਤ ਟੀਮ ਨੂੰ ਡੂੰਘੀ ਜਾਂਚ ਲਈ ਭੇਜਾਂਗਾ। ਸਾਡੇ ਨਾਲ ਧੀਰਜ ਰੱਖਣ ਲਈ ਧੰਨਵਾਦ।";
                    }
                    return "ਲੋੜੀਂਦੇ ਦਸਤਾਵੇਜ਼ ਦੇਣ ਲਈ ਧੰਨਵਾਦ। ਮੈਂ ਸਾਰੀਆਂ ਫਾਈਲਾਂ ਸਾਡੀ ਸੰਬੰਧਿਤ ਟੀਮ ਨੂੰ ਡੂੰਘੀ ਜਾਂਚ ਲਈ ਭੇਜਾਂਗਾ। ਸਾਡੇ ਨਾਲ ਧੀਰਜ ਰੱਖਣ ਲਈ ਧੰਨਵਾਦ।";
                },
                general: "Yono777 ਸਹਾਇਤਾ ਨਾਲ ਸੰਪਰਕ ਕਰਨ ਲਈ ਧੰਨਵਾਦ। ਮੈਂ ਅੱਜ ਤੁਹਾਡੀ ਕਿਵੇਂ ਸਹਾਇਤਾ ਕਰ ਸਕਦਾ ਹਾਂ?"
            },
            urdu: {
                greeting: "السلام علیکم! میں آپ کی جمعہ کی پریشانی میں مدد کرنے کے لیے یہاں ہوں۔ بہتر مدد کے لیے، براہ کرم کیا آپ اپنا آرڈر نمبر فراہم کر سکتے ہیں؟",
                orderFound: (amount) => {
                    if (amount) {
                        return `خوشخبری! آپ کی ₹${amount} جمعہ کامیابی سے آپ کے اکاؤنٹ میں جمع کر دی گئی ہے۔ براہ کرم اپنے Yono777 گیم اکاؤنٹ میں دوبارہ لاگ ان کریں اور اپنا اپ ڈیٹ شدہ بیلنس چیک کریں۔ Yono777 کسٹمر سروس سے رابطہ کرنے کا شکریہ۔ ہم آپ کی خدمت کرنے میں خوش ہیں!`;
                    }
                    return `خوشخبری! آپ کی جمعہ کامیابی سے آپ کے اکاؤنٹ میں جمع کر دی گئی ہے۔ براہ کرم اپنے Yono777 گیم اکاؤنٹ میں دوبارہ لاگ ان کریں اور اپنا اپ ڈیٹ شدہ بیلنس چیک کریں۔ Yono777 کسٹمر سروس سے رابطہ کرنے کا شکریہ۔ ہم آپ کی خدمت کرنے میں خوش ہیں!`;
                },
                orderNotFound: "آرڈر نمبر فی الحال زیر التواء حالت میں ہے۔ گہری اور بہتر چیکنگ کے لیے، کیا آپ مجھے ایک جمعہ رسید فراہم کر سکتے ہیں؟",
                receiptNoOrder: "جمعہ رسید فراہم کرنے کا شکریہ۔ آگے بڑھنے کے لیے، براہ کرم کیا آپ اپنا آرڈر نمبر فراہم کر سکتے ہیں؟",
                receiptRecent: "اپنی جمعہ رسید فراہم کرنے کا شکریہ۔ آپ کا لین دین فی الحال پروسیس ہو رہا ہے۔ براہ کرم یہ آپ کے اکاؤنٹ میں جمع ہونے کے لیے 24-48 گھنٹے انتظار کریں۔ آپ کا پیسہ 100% ہمارے ساتھ محفوظ ہے۔ Yono777 کسٹمر سروس سے رابطہ کرنے کا شکریہ۔ ہم آپ کی خدمت کرنے میں خوش ہیں!",
                receiptOld: "میں دیکھ رہا ہوں کہ آپ کی رسید 2 دن سے زیادہ پرانی ہے۔ آپ کی جمعہ کو تیزی سے پروسیس کرنے میں مدد کے لیے، براہ کرم فراہم کریں: (1) PDF بینک سٹیٹمنٹ، (2) PDF پاس ورڈ (اگر محفوظ ہے)، اور (3) آپ کے کامیاب جمعہ لین دین کو دکھانے والی ویڈیو ریکارڈنگ۔",
                fileUpload: (fileType) => {
                    if (fileType === 'password') {
                        return "پاس ورڈ فراہم کرنے کا شکریہ۔ میں نے اسے آپ کی فائلوں کے ساتھ موصول کیا ہے۔ میں تمام معلومات ہماری متعلقہ ٹیم کو گہری چیکنگ کے لیے بھیج دوں گا۔ ہمارے ساتھ صبر کرنے کا شکریہ۔";
                    }
                    return "ضروری دستاویزات فراہم کرنے کا شکریہ۔ میں تمام فائلیں ہماری متعلقہ ٹیم کو گہری چیکنگ کے لیے بھیج دوں گا۔ ہمارے ساتھ صبر کرنے کا شکریہ۔";
                },
                general: "Yono777 سپورٹ سے رابطہ کرنے کا شکریہ۔ میں آج آپ کی کس طرح مدد کر سکتا ہوں?"
            }
        };
        
        const langTemplates = templates[language] || templates.english;
        
        // Greeting for first message ONLY - must be checked first
        if (additionalContext.isGreeting) {
            return langTemplates.greeting;
        }
        
        // Deposit concern handling process
        if (issueType === 'deposit') {
            // CRITICAL: Check if we're waiting for PDF/password/video FIRST
            // This must be checked BEFORE any receipt age checks to prevent premature status messages
            const history = this.conversationHistory.get(userId) || [];
            // Store current message for use in template logic
            const currentMessage = message || '';
            const wasAskedForPDFAndVideo = history.some(msg => 
                msg.role === 'assistant' && 
                msg.message && 
                typeof msg.message === 'string' &&
                (msg.message.includes('PDF bank statement') || 
                 msg.message.includes('PDF बैंक') || 
                 msg.message.includes('PDF బ్యాంక్') ||
                 msg.message.includes('video recording'))
            );
            
            // If we're waiting for PDF/password/video, handle file tracking FIRST
            // Check both the history flag AND the context flag (for upload endpoint)
            const isWaitingForFiles = wasAskedForPDFAndVideo || additionalContext.waitingForPDFAndVideo || additionalContext.isFileUploadTracking;
            if (isWaitingForFiles) {
                console.log(`[Template Logic] File upload tracking mode - wasAskedForPDFAndVideo: ${wasAskedForPDFAndVideo}, waitingForPDFAndVideo: ${additionalContext.waitingForPDFAndVideo}, isFileUploadTracking: ${additionalContext.isFileUploadTracking}`);
                // Create temporary history that includes current message if it's a password/file
                let tempHistory = [...history];
                if (additionalContext.passwordProvided || additionalContext.fileType === 'password') {
                    tempHistory.push({
                        role: 'user',
                        message: '', // Message content not needed for file type check
                        fileType: 'password',
                        passwordProvided: true
                    });
                } else if (additionalContext.fileType === 'pdf') {
                    tempHistory.push({
                        role: 'user',
                        message: '',
                        fileType: 'pdf'
                    });
                } else if (additionalContext.fileType === 'video') {
                    tempHistory.push({
                        role: 'user',
                        message: '',
                        fileType: 'video'
                    });
                }
                
                // Check conversation history to see what files have already been received
                const filesInHistory = this.checkFilesInHistory(tempHistory);
                
                // Combine current upload/message with history
                // IMPORTANT: Check history FIRST, then additionalContext, then current fileType
                // This ensures we don't miss files that were provided earlier
                const hasPDF = filesInHistory.hasPDF || additionalContext.hasPDF || additionalContext.fileType === 'pdf';
                const hasPassword = filesInHistory.hasPassword || additionalContext.hasPassword || additionalContext.fileType === 'password' || additionalContext.passwordProvided || false;
                const hasVideo = filesInHistory.hasVideo || additionalContext.hasVideo || additionalContext.fileType === 'video';
                const hasAll = hasPDF && hasVideo && hasPassword;
                
                console.log(`[Template File Tracking] hasPDF: ${hasPDF} (history: ${filesInHistory.hasPDF}, context: ${additionalContext.hasPDF}, current: ${additionalContext.fileType === 'pdf'}), hasPassword: ${hasPassword} (history: ${filesInHistory.hasPassword}, context: ${additionalContext.hasPassword}, fileType: ${additionalContext.fileType}, passwordProvided: ${additionalContext.passwordProvided}), hasVideo: ${hasVideo} (history: ${filesInHistory.hasVideo}, context: ${additionalContext.hasVideo}, current: ${additionalContext.fileType === 'video'}), All: ${hasAll}`);
                
                console.log(`[Template Logic] Waiting for PDF/password/video - PDF: ${hasPDF} (history: ${filesInHistory.hasPDF}, context: ${additionalContext.hasPDF}, current: ${additionalContext.fileType === 'pdf'}), Password: ${hasPassword} (history: ${filesInHistory.hasPassword}, context: ${additionalContext.hasPassword}, current: ${additionalContext.fileType === 'password' || additionalContext.passwordProvided}), Video: ${hasVideo} (history: ${filesInHistory.hasVideo}, context: ${additionalContext.hasVideo}, current: ${additionalContext.fileType === 'video'}), All: ${hasAll}`);
                
                // Only proceed to receipt status if ALL files are received
                if (!hasAll) {
                    // Handle partial file uploads - acknowledge what's received and ask for what's missing
                    // CRITICAL: Only ask for what's MISSING, never ask for what's already provided
                    if (hasPDF && hasPassword && !hasVideo) {
                        // PDF + Password received, video needed
                        if (language === 'english') {
                            return "Thank you for providing the PDF bank statement and password. I have received both. To complete the verification, please also provide a video recording showing your successful deposit transaction. I will forward all the files to our relevant team for deep checking once the video is received.";
                        } else if (language === 'hindi') {
                            return "PDF बैंक स्टेटमेंट और पासवर्ड प्रदान करने के लिए धन्यवाद। मैंने दोनों प्राप्त कर लिए हैं। सत्यापन पूरा करने के लिए, कृपया अपने सफल जमा लेनदेन को दिखाने वाली वीडियो रिकॉर्डिंग भी प्रदान करें। वीडियो प्राप्त होने के बाद मैं सभी फाइलों को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा।";
                        } else if (language === 'telugu') {
                            return "PDF బ్యాంక్ స్టేట్మెంట్ మరియు పాస్వర్డ్ అందించినందుకు ధన్యవాదాలు. నేను రెండింటినీ స్వీకరించాను. ధృవీకరణను పూర్తి చేయడానికి, దయచేసి మీ విజయవంతమైన జమ లావాదేవీని చూపించే వీడియో రికార్డింగ్ కూడా అందించండి. వీడియో స్వీకరించబడిన తర్వాత నేను అన్ని ఫైళ్లను మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను.";
                        }
                    } else if (hasPDF && !hasVideo && !hasPassword) {
                        // Only PDF received
                        if (language === 'english') {
                            return "Thank you for providing the PDF bank statement. I have received it. To complete the verification, please also provide: (1) PDF password (if your PDF is protected), and (2) a video recording showing your successful deposit transaction. I will forward all the files to our relevant team for deep checking once all items are received.";
                        } else if (language === 'hindi') {
                            return "PDF बैंक स्टेटमेंट प्रदान करने के लिए धन्यवाद। मैंने इसे प्राप्त कर लिया है। सत्यापन पूरा करने के लिए, कृपया यह भी प्रदान करें: (1) PDF पासवर्ड (यदि आपका PDF संरक्षित है), और (2) आपके सफल जमा लेनदेन को दिखाने वाली वीडियो रिकॉर्डिंग। सभी आइटम प्राप्त होने के बाद मैं सभी फाइलों को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा।";
                        } else if (language === 'telugu') {
                            return "PDF బ్యాంక్ స్టేట్మెంట్ అందించినందుకు ధన్యవాదాలు. నేను దీన్ని స్వీకరించాను. ధృవీకరణను పూర్తి చేయడానికి, దయచేసి కూడా అందించండి: (1) PDF పాస్వర్డ్ (మీ PDF రక్షితమైతే), మరియు (2) మీ విజయవంతమైన జమ లావాదేవీని చూపించే వీడియో రికార్డింగ్. అన్ని అంశాలు స్వీకరించబడిన తర్వాత నేను అన్ని ఫైళ్లను మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను.";
                        }
                    } else if (hasPDF && hasPassword && !hasVideo) {
                        // PDF + Password, video needed
                        if (language === 'english') {
                            return "Thank you for providing the PDF bank statement and password. I have received both. To complete the verification, please also provide a video recording showing your successful deposit transaction. I will forward all the files to our relevant team for deep checking once the video is received.";
                        } else if (language === 'hindi') {
                            return "PDF बैंक स्टेटमेंट और पासवर्ड प्रदान करने के लिए धन्यवाद। मैंने दोनों प्राप्त कर लिए हैं। सत्यापन पूरा करने के लिए, कृपया अपने सफल जमा लेनदेन को दिखाने वाली वीडियो रिकॉर्डिंग भी प्रदान करें। वीडियो प्राप्त होने के बाद मैं सभी फाइलों को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा।";
                        } else if (language === 'telugu') {
                            return "PDF బ్యాంక్ స్టేట్మెంట్ మరియు పాస్వర్డ్ అందించినందుకు ధన్యవాదాలు. నేను రెండింటినీ స్వీకరించాను. ధృవీకరణను పూర్తి చేయడానికి, దయచేసి మీ విజయవంతమైన జమ లావాదేవీని చూపించే వీడియో రికార్డింగ్ కూడా అందించండి. వీడియో స్వీకరించబడిన తర్వాత నేను అన్ని ఫైళ్లను మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను.";
                        }
                    } else if (hasPDF && hasVideo && !hasPassword) {
                        // PDF + Video, password may be needed
                        if (language === 'english') {
                            return "Thank you for providing the PDF bank statement and video recording. I have received both. If your PDF is password-protected, please also provide the PDF password. I will forward all the files to our relevant team for deep checking once all items are received.";
                        } else if (language === 'hindi') {
                            return "PDF बैंक स्टेटमेंट और वीडियो रिकॉर्डिंग प्रदान करने के लिए धन्यवाद। मैंने दोनों प्राप्त कर लिए हैं। यदि आपका PDF पासवर्ड-संरक्षित है, तो कृपया PDF पासवर्ड भी प्रदान करें। सभी आइटम प्राप्त होने के बाद मैं सभी फाइलों को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा।";
                        } else if (language === 'telugu') {
                            return "PDF బ్యాంక్ స్టేట్మెంట్ మరియు వీడియో రికార్డింగ్ అందించినందుకు ధన్యవాదాలు. నేను రెండింటినీ స్వీకరించాను. మీ PDF పాస్వర్డ్-రక్షితమైతే, దయచేసి PDF పాస్వర్డ్ కూడా అందించండి. అన్ని అంశాలు స్వీకరించబడిన తర్వాత నేను అన్ని ఫైళ్లను మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను.";
                        }
                    } else if (!hasPDF && hasPassword && !hasVideo) {
                        // Only password received
                        if (language === 'english') {
                            return "Thank you for providing the password. I have received it. To complete the verification, please also provide: (1) PDF bank statement, and (2) a video recording showing your successful deposit transaction. I will forward all the files to our relevant team for deep checking once all items are received.";
                        } else if (language === 'hindi') {
                            return "पासवर्ड प्रदान करने के लिए धन्यवाद। मैंने इसे प्राप्त कर लिया है। सत्यापन पूरा करने के लिए, कृपया यह भी प्रदान करें: (1) PDF बैंक स्टेटमेंट, और (2) आपके सफल जमा लेनदेन को दिखाने वाली वीडियो रिकॉर्डिंग। सभी आइटम प्राप्त होने के बाद मैं सभी फाइलों को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा।";
                        } else if (language === 'telugu') {
                            return "పాస్వర్డ్ అందించినందుకు ధన్యవాదాలు. నేను దీన్ని స్వీకరించాను. ధృవీకరణను పూర్తి చేయడానికి, దయచేసి కూడా అందించండి: (1) PDF బ్యాంక్ స్టేట్మెంట్, మరియు (2) మీ విజయవంతమైన జమ లావాదేవీని చూపించే వీడియో రికార్డింగ్. అన్ని అంశాలు స్వీకరించబడిన తర్వాత నేను అన్ని ఫైళ్లను మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను.";
                        }
                    } else if (!hasPDF && !hasPassword && hasVideo) {
                        // Only video received
                        if (language === 'english') {
                            return "Thank you for providing the video recording. I have received it. To complete the verification, please also provide: (1) PDF bank statement, and (2) PDF password (if your PDF is protected). I will forward all the files to our relevant team for deep checking once all items are received.";
                        } else if (language === 'hindi') {
                            return "वीडियो रिकॉर्डिंग प्रदान करने के लिए धन्यवाद। मैंने इसे प्राप्त कर लिया है। सत्यापन पूरा करने के लिए, कृपया यह भी प्रदान करें: (1) PDF बैंक स्टेटमेंट, और (2) PDF पासवर्ड (यदि आपका PDF संरक्षित है)। सभी आइटम प्राप्त होने के बाद मैं सभी फाइलों को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा।";
                        } else if (language === 'telugu') {
                            return "వీడియో రికార్డింగ్ అందించినందుకు ధన్యవాదాలు. నేను దీన్ని స్వీకరించాను. ధృవీకరణను పూర్తి చేయడానికి, దయచేసి కూడా అందించండి: (1) PDF బ్యాంక్ స్టేట్మెంట్, మరియు (2) PDF పాస్వర్డ్ (మీ PDF రక్షితమైతే). అన్ని అంశాలు స్వీకరించబడిన తర్వాత నేను అన్ని ఫైళ్లను మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను.";
                        }
                    }
                    // For other combinations, fall through to default fileUpload
                } else {
                    // All files received - check if this is a follow-up question or initial acknowledgment
                    const currentMsg = (message || '').toLowerCase().trim();
                    
                    // Expanded follow-up question detection
                    const isFollowUpQuestion = currentMsg && (
                        currentMsg.includes('how is it') || 
                        currentMsg.includes('all okay') || 
                        currentMsg.includes('all are okay') ||
                        currentMsg.includes('what now') ||
                        currentMsg.includes('what next') ||
                        currentMsg.includes('now nothing') ||
                        currentMsg.includes('is it done') ||
                        currentMsg.includes('everything okay') ||
                        currentMsg.includes('what i need to do') ||
                        currentMsg.includes('what do i need') ||
                        currentMsg.includes('what should i do') ||
                        currentMsg.includes('what to do') ||
                        currentMsg.includes('same again') ||
                        currentMsg.includes('saying the same') ||
                        currentMsg.includes('repeating') ||
                        currentMsg.startsWith('what') ||
                        currentMsg === 'okay' ||
                        currentMsg === 'ok' ||
                        currentMsg === 'what?' ||
                        currentMsg === 'what'
                    );
                    
                    // Check if we already sent ANY "all files received" acknowledgment message
                    const alreadyAcknowledged = history.some(msg => 
                        msg.role === 'assistant' && 
                        msg.message && 
                        typeof msg.message === 'string' &&
                        (msg.message.includes('Thank you for providing all the necessary documents') ||
                         msg.message.includes('Perfect! I\'ve received all your documents') ||
                         msg.message.includes('I\'ve received all your documents') ||
                         msg.message.includes('received all your documents') ||
                         msg.message.includes('सभी आवश्यक दस्तावेज') ||
                         msg.message.includes('అన్ని అవసరమైన పత్రాలు') ||
                         msg.message.includes('सभी दस्तावेज') ||
                         msg.message.includes('అన్ని పత్రాలు'))
                    );
                    
                    console.log(`[Follow-up Detection] Message: "${currentMsg}", isFollowUp: ${isFollowUpQuestion}, alreadyAcknowledged: ${alreadyAcknowledged}`);
                    
                    // CRITICAL: When all files are received, use OpenAI for varied, conversational responses
                    // Only use template for first acknowledgment, then use OpenAI for follow-ups
                    if (isFollowUpQuestion || alreadyAcknowledged) {
                        // Follow-up question or already acknowledged - use OpenAI for natural, varied response
                        console.log(`[Template] All files received + follow-up - Using OpenAI for natural, conversational response`);
                        return null; // Let it fall through to OpenAI generation
                    } else {
                        // First acknowledgment - provide template response
                        // BUT: Check if we already sent this exact message recently
                        const recentMessages = history.filter(h => h.role === 'assistant').slice(-3);
                        const acknowledgmentText = language === 'english' 
                            ? "Thank you for providing all the necessary documents (PDF bank statement, password, and video recording). I have received everything. I will forward all the files to our relevant team for deep checking. Thank you for bearing with us."
                            : (language === 'hindi'
                                ? "सभी आवश्यक दस्तावेज (PDF बैंक स्टेटमेंट, पासवर्ड, और वीडियो रिकॉर्डिंग) प्रदान करने के लिए धन्यवाद। मैंने सब कुछ प्राप्त कर लिया है। मैं सभी फाइलों को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा। हमारे साथ धैर्य रखने के लिए धन्यवाद।"
                                : (language === 'telugu'
                                    ? "అన్ని అవసరమైన పత్రాలు (PDF బ్యాంక్ స్టేట్మెంట్, పాస్వర్డ్, మరియు వీడియో రికార్డింగ్) అందించినందుకు ధన్యవాదాలు. నేను అన్నింటినీ స్వీకరించాను. నేను అన్ని ఫైళ్లను మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను. మాతో ఓర్పు కనబరచినందుకు ధన్యవాదాలు."
                                    : "Thank you for providing all the necessary documents. I have received everything. I will forward all the files to our relevant team for deep checking. Thank you for bearing with us."));
                        
                        const alreadySent = recentMessages.some(msg => msg.message && msg.message.trim() === acknowledgmentText.trim());
                        
                        if (alreadySent) {
                            // Already sent this message - use OpenAI for varied response
                            console.log(`[Template] Already sent acknowledgment - Using OpenAI for varied response`);
                            return null; // Let it fall through to OpenAI generation
                        }
                        
                        // First time - return template response
                        if (language === 'english') {
                            return acknowledgmentText;
                        } else if (language === 'hindi') {
                            return acknowledgmentText;
                        } else if (language === 'telugu') {
                            return acknowledgmentText;
                        } else {
                            return acknowledgmentText;
                        }
                    }
                }
            }
            
            // Step 1: No order number and no receipt - ask for order number
            // Note: If this is first message, isGreeting flag should have been set and we would have returned already
            if (!additionalContext.orderNumber && !additionalContext.hasReceipt) {
                // Ask for order number (same as greeting but without the "Hello" part if not first message)
                return langTemplates.greeting;
            }
            
            // Step 3: Receipt provided but no order number (vice versa) - CHECK THIS FIRST
            // This must be checked before Step 2 to handle the "receipt first" flow correctly
            if (additionalContext.hasReceipt && !additionalContext.orderNumber) {
                return langTemplates.receiptNoOrder;
            }
            
            // Step 4: Both receipt and order number provided - CHECK THIS BEFORE Step 2
            // This handles: receipt first then order number, OR order number first then receipt
            // CRITICAL: When both exist, ALWAYS proceed with logic - NEVER ask for receipt again
            // CRITICAL: Also check history directly in case additionalContext.hasReceipt is not set correctly
            const historyForStep4 = this.conversationHistory.get(userId) || [];
            const receiptInHistory = this.hasReceiptBeenUploaded(historyForStep4) || 
                                    historyForStep4.some(h => h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video'));
            
            const hasReceipt = additionalContext.hasReceipt || receiptInHistory;
            
            if (hasReceipt && additionalContext.orderNumber) {
                console.log(`[Step 4] Both receipt and order number present (hasReceipt: ${hasReceipt}, orderNumber: ${additionalContext.orderNumber}) - executing logic without asking for receipt`);
                // Update additionalContext to ensure consistency
                additionalContext.hasReceipt = true;
                
                if (additionalContext.orderFound === true) {
                    // Order found - deposit successful
                    const amount = additionalContext.orderData?.amount || additionalContext.amount || additionalContext.receiptAmount;
                    return langTemplates.orderFound(amount);
                } else {
                    // Order not found - acknowledge receipt and inform about processing
                    // CRITICAL: Receipt was already provided, so we NEVER ask for it again
                    // We acknowledge it and proceed with appropriate response based on receipt age
                    
                    // CRITICAL: Check receipt age FIRST before checking if waiting for files
                    // This ensures we use the correct template (receiptOld vs receiptRecent)
                    const isOldReceipt = additionalContext.isOldReceipt === true;
                    console.log(`[Template Logic] Order not found, receipt exists. isOldReceipt: ${isOldReceipt}, wasAskedForPDFAndVideo: ${wasAskedForPDFAndVideo}, waitingForPDFAndVideo: ${additionalContext.waitingForPDFAndVideo}`);
                    
                    // If we're waiting for PDF/password/video, let file tracking handle it
                    if (wasAskedForPDFAndVideo || additionalContext.waitingForPDFAndVideo) {
                        // We're waiting for files - don't give status, let file tracking handle it
                        console.log(`[Template Logic] Waiting for PDF/password/video, skipping receipt status`);
                        // File tracking logic is handled above, so this should not reach here
                        // But if it does, fall through to receipt age check as backup
                    }
                    
                    // Not waiting for files OR as backup - proceed with receipt age check
                    // ALWAYS acknowledge receipt and inform about processing status
                    // CRITICAL: Use the correct template based on receipt age
                    // BUT: If receipt was just uploaded, acknowledge it properly first
                    const history = this.conversationHistory.get(userId) || [];
                    const lastUserMessage = history.filter(h => h.role === 'user').pop();
                    const receiptJustUploaded = lastUserMessage && (lastUserMessage.fileType === 'image' || lastUserMessage.message?.includes('[Uploaded receipt image]'));
                    
                    if (receiptJustUploaded && !isOldReceipt) {
                        // Receipt just uploaded and is recent - acknowledge it properly
                        console.log(`[Template Logic] Receipt just uploaded (recent) - using receiptRecent template`);
                        return langTemplates.receiptRecent;
                    } else if (isOldReceipt) {
                        // Receipt >= 2 days old - ask for PDF/password/video
                        console.log(`[Template Logic] ✅ Using receiptOld template (receipt is old)`);
                        return langTemplates.receiptOld;
                    } else {
                        // Receipt < 2 days old OR age not determined - inform about processing
                        // Default to recent if age not determined (safer assumption)
                        console.log(`[Template Logic] ✅ Using receiptRecent template (receipt is recent or age unknown)`);
                        return langTemplates.receiptRecent;
                    }
                }
            }
            
            // Step 2: Order number provided, no receipt (ONLY if receipt hasn't been provided)
            // This only applies when order number comes first and no receipt has been uploaded yet
            // CRITICAL: Double-check that receipt really doesn't exist before asking for it
            // TRIPLE-CHECK: If hasReceipt is false, verify it REALLY doesn't exist
            // IMPORTANT: Check history FIRST before entering Step 2 block (same logic as Step 4)
            const historyForStep2 = this.conversationHistory.get(userId) || [];
            const receiptInHistoryForStep2 = this.hasReceiptBeenUploaded(historyForStep2) || 
                                            historyForStep2.some(h => h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video'));
            const reallyHasReceipt = additionalContext.hasReceipt || receiptInHistoryForStep2;
            
            if (additionalContext.orderNumber && !reallyHasReceipt) {
                // Verify receipt doesn't exist by checking conversation history one more time (redundant check for safety)
                const receiptExists = this.hasReceiptBeenUploaded(historyForStep2);
                
                // Also check for receipt messages directly
                const receiptMessages = historyForStep2.filter(h => h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video'));
                const hasReceiptByFileType = receiptMessages.length > 0;
                
                // If ANY check says receipt exists, treat it as existing
                const receiptReallyExists = receiptExists || hasReceiptByFileType;
                
                console.log(`[Step 2 Check] Order number provided, checking receipt - receiptExists: ${receiptExists}, hasReceiptByFileType: ${hasReceiptByFileType}, receiptReallyExists: ${receiptReallyExists}`);
                
                if (receiptReallyExists) {
                    // Receipt actually exists - extract its information and proceed to Step 4
                    console.log(`[Template Logic] Receipt found in history, extracting receipt info and proceeding to Step 4`);
                    
                    // Extract receipt information (order number from OCR, date, amount, etc.)
                    const receiptInfo = this.extractReceiptInfo(history);
                    
                    // Update context with receipt information
                    additionalContext.hasReceipt = true;
                    
                    // Use order number from receipt OCR if available and it matches, otherwise use provided order number
                    if (receiptInfo && receiptInfo.foundOrderNumber) {
                        // If receipt has order number from OCR, verify it matches the provided one
                        if (receiptInfo.foundOrderNumber.toUpperCase() === additionalContext.orderNumber.toUpperCase()) {
                            console.log(`[Receipt Info] Using order number from receipt OCR: ${receiptInfo.foundOrderNumber}`);
                            additionalContext.orderNumber = receiptInfo.foundOrderNumber;
                        } else {
                            console.log(`[Receipt Info] Order number mismatch - Receipt OCR: ${receiptInfo.foundOrderNumber}, Provided: ${additionalContext.orderNumber}`);
                            // Use provided order number, but keep receipt info
                        }
                    }
                    
                    // Extract receipt date and age
                    let receiptDate = null;
                    if (receiptInfo && receiptInfo.foundDate) {
                        try {
                            receiptDate = new Date(receiptInfo.foundDate);
                            if (isNaN(receiptDate.getTime())) receiptDate = null;
                        } catch (e) {
                            receiptDate = null;
                        }
                    }
                    
                    // Fallback to timestamp if date not available
                    if (!receiptDate) {
                        receiptDate = this.extractReceiptDate(history, additionalContext.orderNumber);
                    }
                    
                    if (receiptDate) {
                        const isOldReceipt = this.isReceiptOlderThan2Days(receiptDate);
                        additionalContext.isOldReceipt = isOldReceipt;
                        const receipt = new Date(receiptDate);
                        const now = new Date();
                        const diffTime = Math.abs(now - receipt);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        additionalContext.receiptAgeDays = diffDays;
                        console.log(`[Receipt Info] Receipt age: ${diffDays} days, IsOld: ${isOldReceipt}`);
                    } else {
                        // If no date found, default to recent (< 2 days)
                        additionalContext.isOldReceipt = false;
                        additionalContext.receiptAgeDays = 1;
                    }
                    
                    // Store receipt amount if available
                    if (receiptInfo && receiptInfo.foundAmount) {
                        additionalContext.receiptAmount = receiptInfo.foundAmount;
                    }
                    
                    // Now we have both receipt and order number - proceed to Step 4
                    // Execute Step 4 logic inline - NEVER ask for receipt again
                    console.log(`[Step 4 Logic] Receipt and order number both present - proceeding with status check`);
                    
                    if (additionalContext.orderFound === true) {
                        // Order found - deposit successful
                        const amount = additionalContext.orderData?.amount || additionalContext.amount || additionalContext.receiptAmount;
                        return langTemplates.orderFound(amount);
                    } else {
                        // Order not found - acknowledge receipt and inform about processing
                        // Check if we're waiting for PDF/password/video first
                        if (wasAskedForPDFAndVideo || additionalContext.waitingForPDFAndVideo) {
                            // We're waiting for files - don't give status, let file tracking handle it
                            console.log(`[Template Logic] Waiting for PDF/password/video, skipping receipt status`);
                            // Return appropriate file tracking response (handled above)
                            return null; // Will fall through to file tracking logic
                        } else {
                            // Not waiting for files - proceed with receipt age check
                            // ALWAYS acknowledge receipt and inform about processing status
                            if (additionalContext.isOldReceipt === true) {
                                // Receipt >= 2 days old - ask for PDF/password/video
                                return langTemplates.receiptOld;
                            } else {
                                // Receipt < 2 days old - inform about processing
                                return langTemplates.receiptRecent;
                            }
                        }
                    }
                } else {
                    // No receipt exists - proceed with Step 2
                    // FINAL SAFEGUARD: Triple-check one more time before asking for receipt
                    const finalCheckHistory = this.conversationHistory.get(userId) || [];
                    const finalReceiptCheck = this.hasReceiptBeenUploaded(finalCheckHistory) || 
                                             finalCheckHistory.some(h => h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video'));
                    
                    console.log(`[Step 2 Final Check] Checking for receipt - finalCheckHistory length: ${finalCheckHistory.length}, finalReceiptCheck: ${finalReceiptCheck}`);
                    if (finalCheckHistory.length > 0) {
                        console.log(`[Step 2 Final Check] History messages:`, finalCheckHistory.map((h, idx) => ({ 
                            idx, 
                            role: h.role, 
                            msg: (h.message && typeof h.message === 'string') ? h.message.substring(0, 50) : (h.message ? JSON.stringify(h.message).substring(0, 50) : 'no message'),
                            fileType: h.fileType 
                        })));
                    }
                    
                    if (finalReceiptCheck) {
                        console.log(`[Step 2 Final Check] ✅ Receipt found in final check - executing Step 4 logic instead of asking for receipt`);
                        // Receipt exists - update context and execute Step 4 logic
                        additionalContext.hasReceipt = true;
                        
                        // Extract receipt info for complete Step 4 processing
                        const receiptInfo = this.extractReceiptInfo(finalCheckHistory);
                        let receiptDate = null;
                        if (receiptInfo && receiptInfo.foundDate) {
                            try {
                                receiptDate = new Date(receiptInfo.foundDate);
                                if (isNaN(receiptDate.getTime())) receiptDate = null;
                            } catch (e) {
                                receiptDate = null;
                            }
                        }
                        if (!receiptDate) {
                            receiptDate = this.extractReceiptDate(finalCheckHistory, additionalContext.orderNumber);
                        }
                        
                        // Calculate receipt age
                        if (receiptDate) {
                            const isOldReceipt = this.isReceiptOlderThan2Days(receiptDate);
                            additionalContext.isOldReceipt = isOldReceipt;
                        } else {
                            // Default to recent if date can't be determined
                            additionalContext.isOldReceipt = false;
                        }
                        
                        // Execute Step 4 logic - acknowledge receipt and proceed
                        if (additionalContext.orderFound === true) {
                            // Order found - deposit successful
                            const amount = additionalContext.orderData?.amount || additionalContext.amount || (receiptInfo?.foundAmount);
                            return langTemplates.orderFound(amount);
                        } else {
                            // Order not found but receipt exists - acknowledge receipt and inform about processing
                            // NEVER ask for receipt again - it was already provided
                            if (additionalContext.isOldReceipt === true) {
                                return langTemplates.receiptOld;
                            } else {
                                return langTemplates.receiptRecent;
                            }
                        }
                    }
                    
                    if (additionalContext.orderFound === true) {
                        // Order found - deposit successful
                        const amount = additionalContext.orderData?.amount || additionalContext.amount;
                        return langTemplates.orderFound(amount);
                    } else {
                        // Order not found and no receipt provided yet - ask for receipt
                        // BUT: One more absolute final check - query database for recent uploads
                        console.log(`[Step 2] Order number provided but no receipt found in history - doing absolute final database check`);
                        
                        // ABSOLUTE FINAL CHECK: Check database for recent receipt uploads (within last 5 minutes)
                        // This catches cases where receipt was uploaded but not yet in conversation history
                        if (userId) {
                            try {
                                const dbHistory = await new Promise((resolve) => {
                                    dbHelpers.getConversationHistory(userId, 10, (err, history) => {
                                        if (err) {
                                            console.error('[Step 2] Error checking database:', err);
                                            resolve([]);
                                        } else {
                                            const recentReceipts = (history || []).filter(h => {
                                                if (h.fileType !== 'image' && h.fileType !== 'pdf' && h.fileType !== 'video') return false;
                                                const msgTime = new Date(h.timestamp || 0);
                                                const now = new Date();
                                                const diffMinutes = (now - msgTime) / (1000 * 60);
                                                return diffMinutes < 5; // Within last 5 minutes
                                            });
                                            resolve(recentReceipts);
                                        }
                                    });
                                });
                                
                                if (dbHistory.length > 0) {
                                    console.log(`[Step 2] ✅ ABSOLUTE FINAL CHECK: Found ${dbHistory.length} recent receipt(s) in database! Executing Step 4 logic.`);
                                    additionalContext.hasReceipt = true;
                                    // Re-execute Step 4 logic by calling this function recursively with corrected context
                                    return await this.generateTemplateResponse(message, issueType, language, additionalContext, context, userId);
                                }
                            } catch (error) {
                                console.error('[Step 2] Error in absolute final check:', error);
                            }
                        }
                        
                        console.log(`[Step 2] No receipt found anywhere after all checks - asking for receipt`);
                        return langTemplates.orderNotFound;
                    }
                }
            }
            
        }
        
        // File upload acknowledgment
        if (additionalContext.hasFileUpload) {
            // Check if we're in the "waiting for PDF/password/video" scenario
            const history = this.conversationHistory.get(userId) || [];
            const wasAskedForPDFAndVideo = history.some(msg => 
                msg.role === 'assistant' && 
                msg.message && 
                typeof msg.message === 'string' &&
                (msg.message.includes('PDF bank statement') || 
                 msg.message.includes('PDF बैंक') || 
                 msg.message.includes('PDF బ్యాంక్') ||
                 msg.message.includes('video recording'))
            );
            
            if (wasAskedForPDFAndVideo || additionalContext.waitingForPDFAndVideo) {
                // CRITICAL: Check conversation history to see what files have already been received
                const filesInHistory = this.checkFilesInHistory(history);
                
                // Combine current upload with history
                const hasPDF = filesInHistory.hasPDF || additionalContext.hasPDF || additionalContext.fileType === 'pdf';
                const hasPassword = filesInHistory.hasPassword || additionalContext.hasPassword || additionalContext.fileType === 'password';
                const hasVideo = filesInHistory.hasVideo || additionalContext.hasVideo || additionalContext.fileType === 'video';
                const hasAll = hasPDF && hasVideo && hasPassword;
                
                console.log(`[File Tracking] PDF: ${hasPDF}, Password: ${hasPassword}, Video: ${hasVideo}, All: ${hasAll}`);
                
                if (hasAll) {
                    // All files received
                    if (language === 'english') {
                        return "Thank you for providing all the necessary documents (PDF bank statement, password, and video recording). I have received everything. I will forward all the files to our relevant team for deep checking. Thank you for bearing with us.";
                    } else if (language === 'hindi') {
                        return "सभी आवश्यक दस्तावेज (PDF बैंक स्टेटमेंट, पासवर्ड, और वीडियो रिकॉर्डिंग) प्रदान करने के लिए धन्यवाद। मैंने सब कुछ प्राप्त कर लिया है। मैं सभी फाइलों को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा। हमारे साथ धैर्य रखने के लिए धन्यवाद।";
                    } else if (language === 'telugu') {
                        return "అన్ని అవసరమైన పత్రాలు (PDF బ్యాంక్ స్టేట్మెంట్, పాస్వర్డ్, మరియు వీడియో రికార్డింగ్) అందించినందుకు ధన్యవాదాలు. నేను అన్నీ స్వీకరించాను. నేను అన్ని ఫైళ్లను మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను. మాతో ఓర్పు కనబరచినందుకు ధన్యవాదాలు.";
                    }
                } else if (hasPDF && !hasVideo && !hasPassword) {
                    // Only PDF received
                    if (language === 'english') {
                        return "Thank you for providing the PDF bank statement. I have received it. To complete the verification, please also provide: (1) PDF password (if your PDF is protected), and (2) a video recording showing your successful deposit transaction. I will forward all the files to our relevant team for deep checking once all items are received.";
                    } else if (language === 'hindi') {
                        return "PDF बैंक स्टेटमेंट प्रदान करने के लिए धन्यवाद। मैंने इसे प्राप्त कर लिया है। सत्यापन पूरा करने के लिए, कृपया यह भी प्रदान करें: (1) PDF पासवर्ड (यदि आपका PDF संरक्षित है), और (2) आपके सफल जमा लेनदेन को दिखाने वाली वीडियो रिकॉर्डिंग। सभी आइटम प्राप्त होने के बाद मैं सभी फाइलों को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा।";
                    } else if (language === 'telugu') {
                        return "PDF బ్యాంక్ స్టేట్మెంట్ అందించినందుకు ధన్యవాదాలు. నేను దీన్ని స్వీకరించాను. ధృవీకరణను పూర్తి చేయడానికి, దయచేసి కూడా అందించండి: (1) PDF పాస్వర్డ్ (మీ PDF రక్షితమైతే), మరియు (2) మీ విజయవంతమైన జమ లావాదేవీని చూపించే వీడియో రికార్డింగ్. అన్ని అంశాలు స్వీకరించబడిన తర్వాత నేను అన్ని ఫైళ్లను మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను.";
                    }
                } else if (hasPDF && hasPassword && !hasVideo) {
                    // PDF + Password, video needed
                    if (language === 'english') {
                        return "Thank you for providing the PDF bank statement and password. I have received both. To complete the verification, please also provide a video recording showing your successful deposit transaction. I will forward all the files to our relevant team for deep checking once the video is received.";
                    } else if (language === 'hindi') {
                        return "PDF बैंक स्टेटमेंट और पासवर्ड प्रदान करने के लिए धन्यवाद। मैंने दोनों प्राप्त कर लिए हैं। सत्यापन पूरा करने के लिए, कृपया अपने सफल जमा लेनदेन को दिखाने वाली वीडियो रिकॉर्डिंग भी प्रदान करें। वीडियो प्राप्त होने के बाद मैं सभी फाइलों को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा।";
                    } else if (language === 'telugu') {
                        return "PDF బ్యాంక్ స్టేట్మెంట్ మరియు పాస్వర్డ్ అందించినందుకు ధన్యవాదాలు. నేను రెండింటినీ స్వీకరించాను. ధృవీకరణను పూర్తి చేయడానికి, దయచేసి మీ విజయవంతమైన జమ లావాదేవీని చూపించే వీడియో రికార్డింగ్ కూడా అందించండి. వీడియో స్వీకరించబడిన తర్వాత నేను అన్ని ఫైళ్లను మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను.";
                    }
                } else if (hasPDF && hasVideo && !hasPassword) {
                    // PDF + Video, password may be needed
                    if (language === 'english') {
                        return "Thank you for providing the PDF bank statement and video recording. I have received both. If your PDF is password-protected, please also provide the PDF password. I will forward all the files to our relevant team for deep checking once all items are received.";
                    } else if (language === 'hindi') {
                        return "PDF बैंक स्टेटमेंट और वीडियो रिकॉर्डिंग प्रदान करने के लिए धन्यवाद। मैंने दोनों प्राप्त कर लिए हैं। यदि आपका PDF पासवर्ड-संरक्षित है, तो कृपया PDF पासवर्ड भी प्रदान करें। सभी आइटम प्राप्त होने के बाद मैं सभी फाइलों को हमारी प्रासंगिक टीम को गहरी जांच के लिए अग्रेषित करूंगा।";
                    } else if (language === 'telugu') {
                        return "PDF బ్యాంక్ స్టేట్మెంట్ మరియు వీడియో రికార్డింగ్ అందించినందుకు ధన్యవాదాలు. నేను రెండింటినీ స్వీకరించాను. మీ PDF పాస్వర్డ్-రక్షితమైతే, దయచేసి PDF పాస్వర్డ్ కూడా అందించండి. అన్ని అంశాలు స్వీకరించబడిన తర్వాత నేను అన్ని ఫైళ్లను మా సంబంధిత బృందానికి లోతైన తనిఖీ కోసం అనుబంధిస్తాను.";
                    }
                }
                // For other combinations, fall through to default fileUpload
            }
            
            return langTemplates.fileUpload(additionalContext.fileType, additionalContext);
        }
        
        // Default/General response (only for non-deposit issues or edge cases)
        return langTemplates.general;
    }
    
    buildDynamicResponse(baseResponse, context, issueType, language) {
        let response = baseResponse;
        
        // Opening based on sentiment and emotion
        if (context.sentiment === 'negative' || context.emotion === 'frustrated') {
            const empathyPhrases = {
                english: "I completely understand your frustration. ",
                hindi: "मैं आपकी निराशा को पूरी तरह समझता हूं। ",
                telugu: "నేను మీ నిరాశను పూర్తిగా అర్థం చేసుకున్నాను. "
            };
            const empathy = empathyPhrases[language] || empathyPhrases.english;
            if (!response.toLowerCase().includes(empathy.toLowerCase())) {
                response = empathy + response;
        }
        } else if (context.sentiment === 'positive' || context.emotion === 'happy') {
            const appreciationPhrases = {
                english: "I'm glad to hear that! ",
                hindi: "यह सुनकर खुशी हुई! ",
                telugu: "ఇది వినడం సంతోషంగా ఉంది! "
            };
            const appreciation = appreciationPhrases[language] || appreciationPhrases.english;
            if (!response.toLowerCase().includes(appreciation.toLowerCase())) {
                response = appreciation + response;
        }
        }
        
        // Add urgency handling
        if (context.urgency === 'high') {
            const urgentPhrases = {
                english: "\n\nI understand this is urgent, and I'm prioritizing your request. ",
                hindi: "\n\nमैं समझता हूं कि यह जरूरी है, और मैं आपके अनुरोध को प्राथमिकता दे रहा हूं। ",
                telugu: "\n\nఇది అత్యవసరమని నేను అర్థం చేసుకున్నాను, మరియు నేను మీ అభ్యర్థనకు ప్రాధాన్యత ఇస్తున్నాను. "
            };
            const urgent = urgentPhrases[language] || urgentPhrases.english;
            response += urgent;
        }
        
        return response;
    }
    
    respondToEmotion(emotion, language, baseResponse) {
        const responses = {
            frustrated: {
                english: "I completely understand your frustration. Let me help resolve this quickly. ",
                hindi: "मैं आपकी निराशा को पूरी तरह समझता हूं। मुझे इसे जल्दी हल करने में मदद करने दें। ",
                telugu: "నేను మీ నిరాశను పూర్తిగా అర్థం చేసుకున్నాను. దీన్ని త్వరగా పరిష్కరించడంలో నాకు సహాయం చేయనివ్వండి. "
            },
            worried: {
                english: "I understand your concern. Your money is safe with us, and I'm here to help. ",
                hindi: "मैं आपकी चिंता समझता हूं। आपका पैसा हमारे साथ सुरक्षित है, और मैं यहां मदद के लिए हूं। ",
                telugu: "నేను మీ ఆందోళనను అర్థం చేసుకున్నాను. మీ డబ్బు మాతో సురక్షితంగా ఉంది, మరియు సహాయం కోసం నేను ఇక్కడ ఉన్నాను. "
            },
            confused: {
                english: "I understand this might be confusing. Let me clarify this for you. ",
                hindi: "मैं समझता हूं कि यह भ्रमित करने वाला हो सकता है। मुझे आपके लिए इसे स्पष्ट करने दें। ",
                telugu: "ఇది గందరగోళంగా ఉండవచ్చని నేను అర్థం చేసుకున్నాను. దీన్ని మీ కోసం స్పష్టం చేయడానికి నన్ను అనుమతించండి. "
            }
        };
        
        const emotionResponse = responses[emotion];
        if (emotionResponse) {
            const response = emotionResponse[language] || emotionResponse.english;
            // Only add if not already present
            if (!baseResponse.toLowerCase().includes(response.toLowerCase().substring(0, 20))) {
                return response + baseResponse;
    }
        }
        
        return baseResponse;
    }

    async handleMessage(message, userId, additionalOptions = {}) {
        const detectedLanguage = this.languageDetector.detectLanguage(message);
        const language = detectedLanguage;
        
        if (!this.conversationHistory.has(userId)) {
            this.conversationHistory.set(userId, []);
            this.isFirstMessage.set(userId, true);
        }
        
        const isFirst = this.isFirstMessage.get(userId);
        this.isFirstMessage.set(userId, false);
        
        if (isFirst) {
            // Use template for greeting
            const greeting = this.generateTemplateResponse(message, 'general', language, { isGreeting: true }, context);
            
            this.conversationHistory.get(userId).push({ role: 'user', message });
            // Ensure greeting is a string before saving
            const greetingString = (greeting && typeof greeting === 'string') ? greeting : String(greeting || 'Hello!');
            this.conversationHistory.get(userId).push({ role: 'assistant', message: greetingString });
            return greeting;
        }
        
        const history = this.conversationHistory.get(userId) || [];
        
        // Get user memory for better context
        const userMemory = this.conversationMemory.getUserMemory(userId);
        
        // Analyze context with enhanced AI
        const context = this.contextAnalyzer.analyzeContext(history, message, language);
        
        // Protocol: Always identify payment type (deposit or withdrawal) first
        const paymentType = this.protocolHandler.identifyPaymentType(message, language);
        
        // All responses go through OpenAI - no special handling needed
        
        // Gather basic context information
        let additionalContext = { ...additionalOptions };
        
        // Use enhanced AI classification
        const issueType = this.classifyIssue(message, language);
        
        // Gather available data
        const extractedOrderNumber = this.extractOrderNumber(message) || this.extractOrderNumberFromHistory(history);
        const hasReceiptInHistory = this.hasReceiptBeenUploaded(history);
        
        // Set context flags
        additionalContext.orderNumber = extractedOrderNumber || null;
        additionalContext.hasReceipt = hasReceiptInHistory;
        
        // Check database if order number is available
        if (extractedOrderNumber) {
            await new Promise((resolve) => {
                this.checkOrderNumberInDatabase(extractedOrderNumber, (err, orderData) => {
                    if (!err && orderData) {
                        additionalContext.orderFound = orderData.found;
                        additionalContext.orderData = orderData.data || null;
                    } else {
                        // If error or no data, default to not found
                        additionalContext.orderFound = false;
                        additionalContext.orderData = null;
                    }
                    resolve();
                });
            });
        }
        
        // ALL responses must come from template system
        let response = await this.generateResponse(message, issueType, userId, language, additionalContext);
        
        // Protocol: Ensure response is maximum 3 sentences
        response = this.limitToThreeSentences(response, language);
        
        // Save to conversation history
        this.conversationHistory.get(userId).push({ role: 'user', message });
        // Ensure response is a string before saving
        const responseString = (response && typeof response === 'string') ? response : String(response || 'Error: Invalid response');
        this.conversationHistory.get(userId).push({ role: 'assistant', message: responseString });
        
        // Track conversation flow for AI learning
        this.contextAnalyzer.trackConversationFlow(userId, message, response, context);
        
        return response;
    }
}

const agent = new Yono777SupportAgent();

// ============================================
// ENHANCED RECEIPT VALIDATION FUNCTION
// ============================================
async function validateReceipt(imageBuffer) {
    const startTime = Date.now();
    try {
        // Enhanced image preprocessing for better OCR accuracy
        let processedImage;
        try {
            // Get image metadata first
            const metadata = await sharp(imageBuffer).metadata();
            
            // Enhanced preprocessing pipeline
            let pipeline = sharp(imageBuffer);
            
            // Convert to greyscale for better OCR
            pipeline = pipeline.greyscale();
            
            // Resize if image is too large (OCR works better on reasonable sizes)
            if (metadata.width > 2000 || metadata.height > 2000) {
                const ratio = Math.min(2000 / metadata.width, 2000 / metadata.height);
                pipeline = pipeline.resize(Math.round(metadata.width * ratio), Math.round(metadata.height * ratio), {
                    kernel: sharp.kernel.lanczos3
                });
            }
            
            // Enhance contrast and normalize
            pipeline = pipeline.normalize();
            
            // Apply sharpening for better text recognition
            pipeline = pipeline.sharpen({
                sigma: 1.5,
                flat: 1,
                jagged: 2
            });
            
            // Apply threshold for better text extraction (if needed)
            // pipeline = pipeline.threshold(128);
            
            // Convert to buffer
            processedImage = await pipeline.toBuffer();
        } catch (preprocessError) {
            console.error('[OCR] Error preprocessing image:', preprocessError.message);
            // Fallback to basic processing
            processedImage = await sharp(imageBuffer)
                .greyscale()
                .normalize()
                .sharpen()
                .toBuffer();
        }
        
        // Enhanced OCR with better configuration
        const ocrConfig = {
            logger: m => {
                // Only log warnings and errors
                if (m.status === 'recognizing text' && m.progress < 1) {
                    // Progress updates (optional, can be verbose)
                }
            },
            // OCR Engine Mode: 3 = Default, based on what is available
            // PSM (Page Segmentation Mode): 6 = Assume uniform block of text
            tessedit_pageseg_mode: '6',
            tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz@.-:/ ',
        };
        
        const { data: { text, confidence } } = await Tesseract.recognize(processedImage, 'eng', ocrConfig);
        
        const processingTime = Date.now() - startTime;
        console.log(`[OCR] Processing completed in ${processingTime}ms with confidence: ${confidence.toFixed(2)}%`);
        console.log(`[OCR] Extracted text (first 500 chars): ${text.substring(0, 500)}`);
        
        const lowerText = text.toLowerCase();
        const upperText = text.toUpperCase();
        
        // Enhanced failure detection
        const failureKeywords = ['transaction failed', 'failed', 'unsuccessful', 'error', 'declined', 'rejected', 'cancelled'];
        const hasFailure = failureKeywords.some(keyword => lowerText.includes(keyword));
        
        if (hasFailure) {
            console.log('[OCR] Transaction failure detected in receipt');
            return {
                isValid: false,
                isSuccessful: false,
                confidence: confidence,
                foundOrderNumber: null,
                foundUPI: null,
                foundUTR: null,
                foundAmount: null,
                foundDate: null,
                issues: ['Transaction Failed - Receipt shows failed transaction'],
                warnings: [],
                processingTime: processingTime
            };
        }
        
        // Enhanced order number patterns with better matching
        const orderPatterns = [
            /(?:order|txn|transaction|ref|reference|order\s*no|order\s*number)[:\s#]*([sdp]05\d{19})/i,
            /([sdp]05\d{19})/i, // Direct pattern match
            /(?:order|txn|transaction|ref|reference)[:\s#]*([A-Z0-9]{20,})/i,
            /([A-Z]{2,3}\d{19,})/i // Generic pattern for order numbers
        ];
        
        let foundOrderNumber = null;
        let bestMatch = null;
        let bestMatchLength = 0;
        
        for (const pattern of orderPatterns) {
            const matches = text.matchAll(new RegExp(pattern, 'gi'));
            for (const match of matches) {
                const orderNum = (match[1] || match[0]).trim().toUpperCase();
                // Validate order number format
                if (orderNum.length >= 20 && orderNum.length <= 25) {
                    if (orderNum.length > bestMatchLength) {
                        bestMatch = orderNum;
                        bestMatchLength = orderNum.length;
                    }
                }
            }
        }
        
        if (bestMatch) {
            foundOrderNumber = bestMatch;
            console.log(`[OCR] Order number found: ${foundOrderNumber}`);
        }
        
        // Enhanced UPI pattern matching - prioritize labeled fields and common UPI providers
        // CRITICAL: Use [A-Za-z0-9._-]+ to match uppercase letters (like BHARATPE) and longer strings
        const upiPatterns = [
            // Priority 1: Explicit UPI labels (most reliable) - improved patterns
            // Match "UPI ID: BHARATPE.8N0H1MON8N85933@fbpe" format (handles uppercase, dots, longer strings)
            /(?:upi\s*(?:id|address|vpa)?|vpa|virtual\s*payment\s*address)[:\s]+([A-Za-z0-9._-]+@[A-Za-z0-9]+)/i,
            // Priority 1.5: "UPI ID:" followed by UPI (common in payment receipts like PhonePe) - improved pattern
            // Match both "UPI ID:" and "UPIID:" formats, case-insensitive, handles uppercase and longer strings
            /upi\s*id[:\s]+([A-Za-z0-9._-]+@[A-Za-z0-9]+)/i,
            // Priority 1.6: "UPIID:" (no space, common in some receipts) - case-insensitive
            /upiid[:\s]+([A-Za-z0-9._-]+@[A-Za-z0-9]+)/i,
            // Priority 1.7: Direct match for "UPI ID: xyz@abc" format (more flexible, handles uppercase and longer)
            /(?:^|\n|\s)upi\s*id[:\s]+([A-Za-z0-9._-]+@[A-Za-z0-9]+)(?:\s|$|\n)/i,
            // Priority 1.8: Match numeric UPI IDs like "89109947276kagb@cnrb" or "7736881767@cnb" after "UPI ID:"
            /upi\s*id[:\s]*([0-9]+[A-Za-z0-9]*@[A-Za-z0-9]+)/i,
            // Priority 1.9: Match pure numeric UPI IDs like "7736881767@cnb" directly (common in Paytm receipts)
            /([0-9]{8,}@(?:cnb|cnrb|icic|icici|ybl|paytm|okaxis|okhdfcbank|oksbi|okicici|axl|ibl|payzapp|upi|phonepe|amazonpay|airtel|freecharge|mobikwik|jiomoney|cred|slice|razorpay|zestmoney|bhim|npci|dib|ptyes|pthdfc|idbi|axis|hdfc|sbi|kotak|yes|indus|federal|union|canara|pnb|bob|iob|uco|boi|psb|central|indian|south|vijaya|dena|syndicate|andhra|corporation|dcb|rbl|idfc|bandhan|jsb|au|equitas|uob|scb|citibank|hsbc|standard|deutsche|barclays|dbs|rabobank|mufg|mizuho|sumitomo|mitsubishi|bnp|societe|credit|agricole|unicredit|intesa|santander|bbva|ing|commerzbank|lloyds|natwest|rbs|tsb|halifax|nationwide|firstdirect|monzo|starling|revolut|n26|chase|wells|fargo|bankofamerica|usbank|pnc|capitalone|td|bmo|rbc|scotiabank|cibc|desjardins|national|bancorp|suntrust|bbt|regions|key|huntington|citizens|fifththird|comerica|m&t|zions|synovus|first|citizens|eastwest|cathay|bank|of|the|west|bancorp|south|western|mutual|of|omaha|american|express|discover|usaa|navy|federal|penfed|alliant|redstone|federal|credit|union|state|employees|federal|credit|union|pentagon|federal|credit|union|first|tech|federal|credit|union|alliant|credit|union|patelco|credit|union|golden|1|credit|union|schoolsfirst|federal|credit|union|firstmark|credit|union|first|community|credit|union|first|service|credit|union|first|southwest|credit|union|first|tennessee|credit|union|first|texas|credit|union|first|university|credit|union|first|valley|credit|union|first|west|credit|union|first|windsor|credit|union|first|workers|credit|union|first|york|credit|union|firstmark|services|firstmerit|bank|firstmid|bank|firstmidwest|bank|firstnational|bank|firstnational|bank|of|omaha|firstnational|bank|of|pennsylvania|firstnational|bank|of|south|dakota|firstnational|bank|of|texas|firstnational|bank|of|west|virginia|firstnational|bank|of|wyoming|firstnational|bank|of|alaska|firstnational|bank|of|arizona|firstnational|bank|of|arkansas|firstnational|bank|of|colorado|firstnational|bank|of|florida|firstnational|bank|of|georgia|firstnational|bank|of|hawaii|firstnational|bank|of|idaho|firstnational|bank|of|illinois|firstnational|bank|of|indiana|firstnational|bank|of|iowa|firstnational|bank|of|kansas|firstnational|bank|of|kentucky|firstnational|bank|of|louisiana|firstnational|bank|of|maine|firstnational|bank|of|maryland|firstnational|bank|of|massachusetts|firstnational|bank|of|michigan|firstnational|bank|of|minnesota|firstnational|bank|of|mississippi|firstnational|bank|of|missouri|firstnational|bank|of|montana|firstnational|bank|of|nebraska|firstnational|bank|of|nevada|firstnational|bank|of|new|hampshire|firstnational|bank|of|new|jersey|firstnational|bank|of|new|mexico|firstnational|bank|of|new|york|firstnational|bank|of|north|carolina|firstnational|bank|of|north|dakota|firstnational|bank|of|ohio|firstnational|bank|of|oklahoma|firstnational|bank|of|oregon|firstnational|bank|of|pennsylvania|firstnational|bank|of|rhode|island|firstnational|bank|of|south|carolina|firstnational|bank|of|south|dakota|firstnational|bank|of|tennessee|firstnational|bank|of|texas|firstnational|bank|of|utah|firstnational|bank|of|vermont|firstnational|bank|of|virginia|firstnational|bank|of|washington|firstnational|bank|of|west|virginia|firstnational|bank|of|wisconsin|firstnational|bank|of|wyoming|fbpe))/i,
            // Priority 2: "To" or "From" followed by UPI (common in payment apps like PhonePe, Paytm) - includes cnrb, icic, fbpe, cnb
            // CRITICAL: Use [A-Za-z0-9._-]+ to match uppercase letters and longer strings like "BHARATPE.8N0H1MON8N85933"
            // CRITICAL: Also match numeric UPI IDs like "7736881767@cnb" (pure numeric before @)
            /(?:to|from|recipient|sender|paid\s*to|paid\s*from)[:\s]*[^\n]{0,200}?([0-9]+@(?:cnb|cnrb|icic|icici|ybl|paytm|okaxis|okhdfcbank|oksbi|okicici|axl|ibl|payzapp|upi|phonepe|amazonpay|airtel|freecharge|mobikwik|jiomoney|cred|slice|razorpay|zestmoney|bhim|npci|dib|ptyes|pthdfc|idbi|axis|hdfc|sbi|kotak|yes|indus|federal|union|canara|pnb|bob|iob|uco|boi|psb|central|indian|south|vijaya|dena|syndicate|andhra|corporation|dcb|rbl|idfc|bandhan|jsb|au|equitas|uob|scb|citibank|hsbc|standard|deutsche|barclays|dbs|rabobank|mufg|mizuho|sumitomo|mitsubishi|bnp|societe|credit|agricole|unicredit|intesa|santander|bbva|ing|commerzbank|lloyds|natwest|rbs|tsb|halifax|nationwide|firstdirect|monzo|starling|revolut|n26|chase|wells|fargo|bankofamerica|usbank|pnc|capitalone|td|bmo|rbc|scotiabank|cibc|desjardins|national|bancorp|suntrust|bbt|regions|key|huntington|citizens|fifththird|comerica|m&t|zions|synovus|first|citizens|eastwest|cathay|bank|of|the|west|bancorp|south|western|mutual|of|omaha|american|express|discover|usaa|navy|federal|penfed|alliant|redstone|federal|credit|union|state|employees|federal|credit|union|pentagon|federal|credit|union|first|tech|federal|credit|union|alliant|credit|union|patelco|credit|union|golden|1|credit|union|schoolsfirst|federal|credit|union|firstmark|credit|union|first|community|credit|union|first|service|credit|union|first|southwest|credit|union|first|tennessee|credit|union|first|texas|credit|union|first|university|credit|union|first|valley|credit|union|first|west|credit|union|first|windsor|credit|union|first|workers|credit|union|first|york|credit|union|firstmark|services|firstmerit|bank|firstmid|bank|firstmidwest|bank|firstnational|bank|firstnational|bank|of|omaha|firstnational|bank|of|pennsylvania|firstnational|bank|of|south|dakota|firstnational|bank|of|texas|firstnational|bank|of|west|virginia|firstnational|bank|of|wyoming|firstnational|bank|of|alaska|firstnational|bank|of|arizona|firstnational|bank|of|arkansas|firstnational|bank|of|colorado|firstnational|bank|of|florida|firstnational|bank|of|georgia|firstnational|bank|of|hawaii|firstnational|bank|of|idaho|firstnational|bank|of|illinois|firstnational|bank|of|indiana|firstnational|bank|of|iowa|firstnational|bank|of|kansas|firstnational|bank|of|kentucky|firstnational|bank|of|louisiana|firstnational|bank|of|maine|firstnational|bank|of|maryland|firstnational|bank|of|massachusetts|firstnational|bank|of|michigan|firstnational|bank|of|minnesota|firstnational|bank|of|mississippi|firstnational|bank|of|missouri|firstnational|bank|of|montana|firstnational|bank|of|nebraska|firstnational|bank|of|nevada|firstnational|bank|of|new|hampshire|firstnational|bank|of|new|jersey|firstnational|bank|of|new|mexico|firstnational|bank|of|new|york|firstnational|bank|of|north|carolina|firstnational|bank|of|north|dakota|firstnational|bank|of|ohio|firstnational|bank|of|oklahoma|firstnational|bank|of|oregon|firstnational|bank|of|pennsylvania|firstnational|bank|of|rhode|island|firstnational|bank|of|south|carolina|firstnational|bank|of|south|dakota|firstnational|bank|of|tennessee|firstnational|bank|of|texas|firstnational|bank|of|utah|firstnational|bank|of|vermont|firstnational|bank|of|virginia|firstnational|bank|of|washington|firstnational|bank|of|west|virginia|firstnational|bank|of|wisconsin|firstnational|bank|of|wyoming|fbpe))/i,
            // Priority 2.5: Match pure numeric UPI IDs like "7736881767@cnb" directly after "To" or "From"
            /(?:to|from|recipient|sender|paid\s*to|paid\s*from)[:\s]*[^\n]{0,200}?([A-Za-z0-9._-]+@(?:cnb|cnrb|icic|icici|ybl|paytm|okaxis|okhdfcbank|oksbi|okicici|axl|ibl|payzapp|upi|phonepe|amazonpay|airtel|freecharge|mobikwik|jiomoney|cred|slice|razorpay|zestmoney|bhim|npci|dib|ptyes|pthdfc|idbi|axis|hdfc|sbi|kotak|yes|indus|federal|union|canara|pnb|bob|iob|uco|boi|psb|central|indian|south|vijaya|dena|syndicate|andhra|corporation|dcb|rbl|idfc|bandhan|jsb|au|equitas|uob|scb|citibank|hsbc|standard|deutsche|barclays|dbs|rabobank|mufg|mizuho|sumitomo|mitsubishi|bnp|societe|credit|agricole|unicredit|intesa|santander|bbva|ing|commerzbank|lloyds|natwest|rbs|tsb|halifax|nationwide|firstdirect|monzo|starling|revolut|n26|chase|wells|fargo|bankofamerica|usbank|pnc|capitalone|td|bmo|rbc|scotiabank|cibc|desjardins|national|bancorp|suntrust|bbt|regions|key|huntington|citizens|fifththird|comerica|m&t|zions|synovus|first|citizens|eastwest|cathay|bank|of|the|west|bancorp|south|western|mutual|of|omaha|american|express|discover|usaa|navy|federal|penfed|alliant|redstone|federal|credit|union|state|employees|federal|credit|union|pentagon|federal|credit|union|first|tech|federal|credit|union|alliant|credit|union|patelco|credit|union|golden|1|credit|union|schoolsfirst|federal|credit|union|firstmark|credit|union|first|community|credit|union|first|service|credit|union|first|southwest|credit|union|first|tennessee|credit|union|first|texas|credit|union|first|university|credit|union|first|valley|credit|union|first|west|credit|union|first|windsor|credit|union|first|workers|credit|union|first|york|credit|union|firstmark|services|firstmerit|bank|firstmid|bank|firstmidwest|bank|firstnational|bank|firstnational|bank|of|omaha|firstnational|bank|of|pennsylvania|firstnational|bank|of|south|dakota|firstnational|bank|of|texas|firstnational|bank|of|west|virginia|firstnational|bank|of|wyoming|firstnational|bank|of|alaska|firstnational|bank|of|arizona|firstnational|bank|of|arkansas|firstnational|bank|of|colorado|firstnational|bank|of|florida|firstnational|bank|of|georgia|firstnational|bank|of|hawaii|firstnational|bank|of|idaho|firstnational|bank|of|illinois|firstnational|bank|of|indiana|firstnational|bank|of|iowa|firstnational|bank|of|kansas|firstnational|bank|of|kentucky|firstnational|bank|of|louisiana|firstnational|bank|of|maine|firstnational|bank|of|maryland|firstnational|bank|of|massachusetts|firstnational|bank|of|michigan|firstnational|bank|of|minnesota|firstnational|bank|of|mississippi|firstnational|bank|of|missouri|firstnational|bank|of|montana|firstnational|bank|of|nebraska|firstnational|bank|of|nevada|firstnational|bank|of|new|hampshire|firstnational|bank|of|new|jersey|firstnational|bank|of|new|mexico|firstnational|bank|of|new|york|firstnational|bank|of|north|carolina|firstnational|bank|of|north|dakota|firstnational|bank|of|ohio|firstnational|bank|of|oklahoma|firstnational|bank|of|oregon|firstnational|bank|of|pennsylvania|firstnational|bank|of|rhode|island|firstnational|bank|of|south|carolina|firstnational|bank|of|south|dakota|firstnational|bank|of|tennessee|firstnational|bank|of|texas|firstnational|bank|of|utah|firstnational|bank|of|vermont|firstnational|bank|of|virginia|firstnational|bank|of|washington|firstnational|bank|of|west|virginia|firstnational|bank|of|wisconsin|firstnational|bank|of|wyoming|fbpe))/i,
            // Priority 3: Standard UPI format with common providers (expanded list) - handles uppercase, includes cnb
            // CRITICAL: Match pure numeric UPI IDs like "7736881767@cnb"
            /([0-9]+@(?:cnb|cnrb|icic|icici|ybl|paytm|okaxis|okhdfcbank|oksbi|okicici|axl|ibl|payzapp|upi|phonepe|amazonpay|airtel|freecharge|mobikwik|jiomoney|cred|slice|razorpay|zestmoney|bhim|npci|dib|ptyes|pthdfc|idbi|axis|hdfc|sbi|kotak|yes|indus|federal|union|canara|pnb|bob|iob|uco|boi|psb|central|indian|south|vijaya|dena|syndicate|andhra|corporation|dcb|rbl|idfc|bandhan|jsb|au|equitas|uob|scb|citibank|hsbc|standard|deutsche|barclays|dbs|rabobank|mufg|mizuho|sumitomo|mitsubishi|bnp|societe|credit|agricole|unicredit|intesa|santander|bbva|ing|commerzbank|lloyds|natwest|rbs|tsb|halifax|nationwide|firstdirect|monzo|starling|revolut|n26|chase|wells|fargo|bankofamerica|usbank|pnc|capitalone|td|bmo|rbc|scotiabank|cibc|desjardins|national|bancorp|suntrust|bbt|regions|key|huntington|citizens|fifththird|comerica|m&t|zions|synovus|first|citizens|eastwest|cathay|bank|of|the|west|bancorp|south|western|mutual|of|omaha|american|express|discover|usaa|navy|federal|penfed|alliant|redstone|federal|credit|union|state|employees|federal|credit|union|pentagon|federal|credit|union|first|tech|federal|credit|union|alliant|credit|union|patelco|credit|union|golden|1|credit|union|schoolsfirst|federal|credit|union|firstmark|credit|union|first|community|credit|union|first|service|credit|union|first|southwest|credit|union|first|tennessee|credit|union|first|texas|credit|union|first|university|credit|union|first|valley|credit|union|first|west|credit|union|first|windsor|credit|union|first|workers|credit|union|first|york|credit|union|firstmark|services|firstmerit|bank|firstmid|bank|firstmidwest|bank|firstnational|bank|firstnational|bank|of|omaha|firstnational|bank|of|pennsylvania|firstnational|bank|of|south|dakota|firstnational|bank|of|texas|firstnational|bank|of|west|virginia|firstnational|bank|of|wyoming|firstnational|bank|of|alaska|firstnational|bank|of|arizona|firstnational|bank|of|arkansas|firstnational|bank|of|colorado|firstnational|bank|of|florida|firstnational|bank|of|georgia|firstnational|bank|of|hawaii|firstnational|bank|of|idaho|firstnational|bank|of|illinois|firstnational|bank|of|indiana|firstnational|bank|of|iowa|firstnational|bank|of|kansas|firstnational|bank|of|kentucky|firstnational|bank|of|louisiana|firstnational|bank|of|maine|firstnational|bank|of|maryland|firstnational|bank|of|massachusetts|firstnational|bank|of|michigan|firstnational|bank|of|minnesota|firstnational|bank|of|mississippi|firstnational|bank|of|missouri|firstnational|bank|of|montana|firstnational|bank|of|nebraska|firstnational|bank|of|nevada|firstnational|bank|of|new|hampshire|firstnational|bank|of|new|jersey|firstnational|bank|of|new|mexico|firstnational|bank|of|new|york|firstnational|bank|of|north|carolina|firstnational|bank|of|north|dakota|firstnational|bank|of|ohio|firstnational|bank|of|oklahoma|firstnational|bank|of|oregon|firstnational|bank|of|pennsylvania|firstnational|bank|of|rhode|island|firstnational|bank|of|south|carolina|firstnational|bank|of|south|dakota|firstnational|bank|of|tennessee|firstnational|bank|of|texas|firstnational|bank|of|utah|firstnational|bank|of|vermont|firstnational|bank|of|virginia|firstnational|bank|of|washington|firstnational|bank|of|west|virginia|firstnational|bank|of|wisconsin|firstnational|bank|of|wyoming|fbpe))/i,
            // Priority 3.5: Standard UPI format with alphanumeric (handles uppercase)
            /([A-Za-z0-9._-]+@(?:cnb|cnrb|icic|icici|ybl|paytm|okaxis|okhdfcbank|oksbi|okicici|axl|ibl|payzapp|upi|phonepe|amazonpay|airtel|freecharge|mobikwik|jiomoney|cred|slice|razorpay|zestmoney|bhim|npci|dib|ptyes|pthdfc|idbi|axis|hdfc|sbi|kotak|yes|indus|federal|union|canara|pnb|bob|iob|uco|boi|psb|central|indian|south|vijaya|dena|syndicate|andhra|corporation|dcb|rbl|idfc|bandhan|jsb|au|equitas|uob|scb|citibank|hsbc|standard|deutsche|barclays|dbs|rabobank|mufg|mizuho|sumitomo|mitsubishi|bnp|societe|credit|agricole|unicredit|intesa|santander|bbva|ing|commerzbank|lloyds|natwest|rbs|tsb|halifax|nationwide|firstdirect|monzo|starling|revolut|n26|chase|wells|fargo|bankofamerica|usbank|pnc|capitalone|td|bmo|rbc|scotiabank|cibc|desjardins|national|bancorp|suntrust|bbt|regions|key|huntington|citizens|fifththird|comerica|m&t|zions|synovus|first|citizens|eastwest|cathay|bank|of|the|west|bancorp|south|western|mutual|of|omaha|american|express|discover|usaa|navy|federal|penfed|alliant|redstone|federal|credit|union|state|employees|federal|credit|union|pentagon|federal|credit|union|first|tech|federal|credit|union|alliant|credit|union|patelco|credit|union|golden|1|credit|union|schoolsfirst|federal|credit|union|firstmark|credit|union|first|community|credit|union|first|service|credit|union|first|southwest|credit|union|first|tennessee|credit|union|first|texas|credit|union|first|university|credit|union|first|valley|credit|union|first|west|credit|union|first|windsor|credit|union|first|workers|credit|union|first|york|credit|union|firstmark|services|firstmerit|bank|firstmid|bank|firstmidwest|bank|firstnational|bank|firstnational|bank|of|omaha|firstnational|bank|of|pennsylvania|firstnational|bank|of|south|dakota|firstnational|bank|of|texas|firstnational|bank|of|west|virginia|firstnational|bank|of|wyoming|firstnational|bank|of|alaska|firstnational|bank|of|arizona|firstnational|bank|of|arkansas|firstnational|bank|of|colorado|firstnational|bank|of|florida|firstnational|bank|of|georgia|firstnational|bank|of|hawaii|firstnational|bank|of|idaho|firstnational|bank|of|illinois|firstnational|bank|of|indiana|firstnational|bank|of|iowa|firstnational|bank|of|kansas|firstnational|bank|of|kentucky|firstnational|bank|of|louisiana|firstnational|bank|of|maine|firstnational|bank|of|maryland|firstnational|bank|of|massachusetts|firstnational|bank|of|michigan|firstnational|bank|of|minnesota|firstnational|bank|of|mississippi|firstnational|bank|of|missouri|firstnational|bank|of|montana|firstnational|bank|of|nebraska|firstnational|bank|of|nevada|firstnational|bank|of|new|hampshire|firstnational|bank|of|new|jersey|firstnational|bank|of|new|mexico|firstnational|bank|of|new|york|firstnational|bank|of|north|carolina|firstnational|bank|of|north|dakota|firstnational|bank|of|ohio|firstnational|bank|of|oklahoma|firstnational|bank|of|oregon|firstnational|bank|of|pennsylvania|firstnational|bank|of|rhode|island|firstnational|bank|of|south|carolina|firstnational|bank|of|south|dakota|firstnational|bank|of|tennessee|firstnational|bank|of|texas|firstnational|bank|of|utah|firstnational|bank|of|vermont|firstnational|bank|of|virginia|firstnational|bank|of|washington|firstnational|bank|of|west|virginia|firstnational|bank|of|wisconsin|firstnational|bank|of|wyoming|fbpe))/i,
            // Priority 4: Generic UPI format (any @domain, but exclude common email domains) - handles uppercase
            /([A-Za-z0-9._-]{3,}@[A-Za-z]{2,})/i
        ];
        
        // Common email domains to exclude (not UPI) - expanded list
        const emailDomains = ['gmail', 'yahoo', 'hotmail', 'outlook', 'aol', 'icloud', 'protonmail', 'mail', 'email', 'domain', 'com', 'org', 'net', 'edu', 'gov', 'co', 'in', 'uk', 'ca', 'au', 'de', 'fr', 'jp', 'cn', 'ru', 'br', 'mx', 'es', 'it', 'nl', 'se', 'no', 'dk', 'fi', 'pl', 'tr', 'za', 'ae', 'sg', 'my', 'th', 'ph', 'id', 'vn', 'kr', 'tw', 'hk', 'nz', 'ie', 'be', 'at', 'ch', 'pt', 'gr', 'cz', 'ro', 'hu', 'bg', 'hr', 'sk', 'si', 'lt', 'lv', 'ee', 'is', 'lu', 'mt', 'cy'];
        
        let foundUPI = null;
        // Try all patterns and use the first valid match
        for (const pattern of upiPatterns) {
            let match;
            const regex = new RegExp(pattern.source, pattern.flags + 'g');
            while ((match = regex.exec(text)) !== null) {
                const upi = (match[1] || match[0]).trim();
                // Validate UPI format (basic check)
                // CRITICAL: Allow longer UPI IDs (up to 150 chars) to capture full UPI like "BHARATPE.8N0H1MON8N85933@fbpe"
                if (upi.includes('@') && upi.length > 5 && upi.length < 150) {
                    // Skip if it looks like an email (common email domains)
                    const domain = upi.split('@')[1]?.toLowerCase();
                    if (domain && emailDomains.some(emailDomain => domain.includes(emailDomain))) {
                        continue;
                    }
                    // Additional validation: UPI should have a valid domain (not just generic)
                    if (domain && domain.length >= 2) {
                        // CRITICAL: Preserve original case for UPI ID (don't lowercase) to maintain full format
                        foundUPI = upi; // Keep original case
                        console.log(`[OCR] UPI found: ${foundUPI} (matched pattern: ${pattern.source.substring(0, 100)})`);
                    break;
                }
                }
            }
            if (foundUPI) break;
        }
        
        // If no UPI found with patterns, try direct extraction from "From" and "To" sections
        if (!foundUPI) {
            // Look for "From" or "To" followed by UPI ID pattern - improved to match "UPI ID: xyz@abc" format
            // Also handles numeric UPI IDs like "89109947276kagb@cnrb"
            const fromToPatterns = [
                // Match "From/To" followed by "UPI ID: numeric@domain" (handles numeric UPI IDs)
                /(?:from|to)[:\s]*[^\n]{0,100}?upi\s*id[:\s]+([0-9]+[a-z0-9]*@[a-z0-9]+)/i,
                /(?:from|to)[:\s]*[^\n]{0,100}?upi\s*id[:\s]+([a-z0-9._-]+@[a-z0-9]+)/i,
                // Match "From/To" followed by numeric UPI ID directly (like "89109947276kagb@cnrb" or "7736881767@cnb")
                // CRITICAL: Match pure numeric UPI IDs like "7736881767@cnb"
                /(?:from|to)[:\s]*[^\n]{0,100}?([0-9]+@(?:cnb|cnrb|icic|icici|ybl|paytm|okaxis|okhdfcbank|oksbi|okicici|axl|ibl|payzapp|upi|phonepe|amazonpay|airtel|freecharge|mobikwik|jiomoney|cred|slice|razorpay|zestmoney|bhim|npci|dib|ptyes|pthdfc|idbi|axis|hdfc|sbi|kotak|yes|indus|federal|union|canara|pnb|bob|iob|uco|boi|psb|central|indian|south|vijaya|dena|syndicate|andhra|corporation|dcb|rbl|idfc|bandhan|jsb|au|equitas|uob|scb|citibank|hsbc|standard|deutsche|barclays|dbs|rabobank|mufg|mizuho|sumitomo|mitsubishi|bnp|societe|credit|agricole|unicredit|intesa|santander|bbva|ing|commerzbank|lloyds|natwest|rbs|tsb|halifax|nationwide|firstdirect|monzo|starling|revolut|n26|chase|wells|fargo|bankofamerica|usbank|pnc|capitalone|td|bmo|rbc|scotiabank|cibc|desjardins|national|bancorp|suntrust|bbt|regions|key|huntington|citizens|fifththird|comerica|m&t|zions|synovus|first|citizens|eastwest|bancorp|south|western|mutual|of|omaha|american|express|discover|usaa|navy|federal|penfed|alliant|redstone|federal|credit|union|state|employees|federal|credit|union|pentagon|federal|credit|union|first|tech|federal|credit|union|alliant|credit|union|patelco|credit|union|golden|1|credit|union|schoolsfirst|federal|credit|union|firstmark|credit|union|first|community|credit|union|first|service|credit|union|first|southwest|credit|union|first|tennessee|credit|union|first|texas|credit|union|first|university|credit|union|first|valley|credit|union|first|west|credit|union|first|windsor|credit|union|first|workers|credit|union|first|york|credit|union|firstmark|services|firstmerit|bank|firstmid|bank|firstmidwest|bank|firstnational|bank|firstnational|bank|of|omaha|firstnational|bank|of|pennsylvania|firstnational|bank|of|south|dakota|firstnational|bank|of|texas|firstnational|bank|of|west|virginia|firstnational|bank|of|wyoming|firstnational|bank|of|alaska|firstnational|bank|of|arizona|firstnational|bank|of|arkansas|firstnational|bank|of|colorado|firstnational|bank|of|florida|firstnational|bank|of|georgia|firstnational|bank|of|hawaii|firstnational|bank|of|idaho|firstnational|bank|of|illinois|firstnational|bank|of|indiana|firstnational|bank|of|iowa|firstnational|bank|of|kansas|firstnational|bank|of|kentucky|firstnational|bank|of|louisiana|firstnational|bank|of|maine|firstnational|bank|of|maryland|firstnational|bank|of|massachusetts|firstnational|bank|of|michigan|firstnational|bank|of|minnesota|firstnational|bank|of|mississippi|firstnational|bank|of|missouri|firstnational|bank|of|montana|firstnational|bank|of|nebraska|firstnational|bank|of|nevada|firstnational|bank|of|new|hampshire|firstnational|bank|of|new|jersey|firstnational|bank|of|new|mexico|firstnational|bank|of|new|york|firstnational|bank|of|north|carolina|firstnational|bank|of|north|dakota|firstnational|bank|of|ohio|firstnational|bank|of|oklahoma|firstnational|bank|of|oregon|firstnational|bank|of|pennsylvania|firstnational|bank|of|rhode|island|firstnational|bank|of|south|carolina|firstnational|bank|of|south|dakota|firstnational|bank|of|tennessee|firstnational|bank|of|texas|firstnational|bank|of|utah|firstnational|bank|of|vermont|firstnational|bank|of|virginia|firstnational|bank|of|washington|firstnational|bank|of|west|virginia|firstnational|bank|of|wisconsin|firstnational|bank|of|wyoming|fbpe))/i,
                // Match alphanumeric UPI IDs after "From/To"
                /(?:from|to)[:\s]*[^\n]{0,100}?([A-Za-z0-9._-]+@(?:cnb|cnrb|icic|icici|ybl|paytm|okaxis|okhdfcbank|oksbi|okicici|axl|ibl|payzapp|upi|phonepe|amazonpay|airtel|freecharge|mobikwik|jiomoney|cred|slice|razorpay|zestmoney|bhim|npci|dib|ptyes|pthdfc|idbi|axis|hdfc|sbi|kotak|yes|indus|federal|union|canara|pnb|bob|iob|uco|boi|psb|central|indian|south|vijaya|dena|syndicate|andhra|corporation|dcb|rbl|idfc|bandhan|jsb|au|equitas|uob|scb|citibank|hsbc|standard|deutsche|barclays|dbs|rabobank|mufg|mizuho|sumitomo|mitsubishi|bnp|societe|credit|agricole|unicredit|intesa|santander|bbva|ing|commerzbank|lloyds|natwest|rbs|tsb|halifax|nationwide|firstdirect|monzo|starling|revolut|n26|chase|wells|fargo|bankofamerica|usbank|pnc|capitalone|td|bmo|rbc|scotiabank|cibc|desjardins|national|bancorp|suntrust|bbt|regions|key|huntington|citizens|fifththird|comerica|m&t|zions|synovus|first|citizens|eastwest|bancorp|south|western|mutual|of|omaha|american|express|discover|usaa|navy|federal|penfed|alliant|redstone|federal|credit|union|state|employees|federal|credit|union|pentagon|federal|credit|union|first|tech|federal|credit|union|alliant|credit|union|patelco|credit|union|golden|1|credit|union|schoolsfirst|federal|credit|union|firstmark|credit|union|first|community|credit|union|first|service|credit|union|first|southwest|credit|union|first|tennessee|credit|union|first|texas|credit|union|first|university|credit|union|first|valley|credit|union|first|west|credit|union|first|windsor|credit|union|first|workers|credit|union|first|york|credit|union|firstmark|services|firstmerit|bank|firstmid|bank|firstmidwest|bank|firstnational|bank|firstnational|bank|of|omaha|firstnational|bank|of|pennsylvania|firstnational|bank|of|south|dakota|firstnational|bank|of|texas|firstnational|bank|of|west|virginia|firstnational|bank|of|wyoming|firstnational|bank|of|alaska|firstnational|bank|of|arizona|firstnational|bank|of|arkansas|firstnational|bank|of|colorado|firstnational|bank|of|florida|firstnational|bank|of|georgia|firstnational|bank|of|hawaii|firstnational|bank|of|idaho|firstnational|bank|of|illinois|firstnational|bank|of|indiana|firstnational|bank|of|iowa|firstnational|bank|of|kansas|firstnational|bank|of|kentucky|firstnational|bank|of|louisiana|firstnational|bank|of|maine|firstnational|bank|of|maryland|firstnational|bank|of|massachusetts|firstnational|bank|of|michigan|firstnational|bank|of|minnesota|firstnational|bank|of|mississippi|firstnational|bank|of|missouri|firstnational|bank|of|montana|firstnational|bank|of|nebraska|firstnational|bank|of|nevada|firstnational|bank|of|new|hampshire|firstnational|bank|of|new|jersey|firstnational|bank|of|new|mexico|firstnational|bank|of|new|york|firstnational|bank|of|north|carolina|firstnational|bank|of|north|dakota|firstnational|bank|of|ohio|firstnational|bank|of|oklahoma|firstnational|bank|of|oregon|firstnational|bank|of|pennsylvania|firstnational|bank|of|rhode|island|firstnational|bank|of|south|carolina|firstnational|bank|of|south|dakota|firstnational|bank|of|tennessee|firstnational|bank|of|texas|firstnational|bank|of|utah|firstnational|bank|of|vermont|firstnational|bank|of|virginia|firstnational|bank|of|washington|firstnational|bank|of|west|virginia|firstnational|bank|of|wisconsin|firstnational|bank|of|wyoming|fbpe))/i,
                // Generic pattern for any numeric UPI ID after "From/To"
                /(?:from|to)[:\s]*[^\n]{0,50}?([0-9]+@[A-Za-z0-9]+)/i,
                // Generic pattern for any alphanumeric UPI ID after "From/To"
                /(?:from|to)[:\s]*[^\n]{0,50}?([A-Za-z0-9._-]+@[A-Za-z0-9]+)/i
            ];
            
            // Try to find UPI in "From" section first (sender's UPI is more important)
            let fromUPI = null;
            let toUPI = null;
            
            for (const pattern of fromToPatterns) {
                const matches = Array.from(text.matchAll(new RegExp(pattern.source, pattern.flags + 'g')));
                for (const match of matches) {
                    if (match && match[1]) {
                        // CRITICAL: Preserve original case for UPI ID (don't lowercase) to maintain full format
                        const upi = match[1].trim(); // Keep original case
                        const domain = upi.split('@')[1]?.toLowerCase();
                        if (domain && !emailDomains.some(emailDomain => domain.includes(emailDomain)) && domain.length >= 2) {
                            // Check if this is from "From" or "To" section
                            const matchText = match[0].toLowerCase();
                            if (matchText.includes('from') && !fromUPI) {
                                fromUPI = upi; // Keep original case
                            } else if (matchText.includes('to') && !toUPI) {
                                toUPI = upi; // Keep original case
                            }
                        }
                    }
                }
            }
            
            // Prioritize "From" UPI (sender), fallback to "To" UPI
            if (fromUPI) {
                foundUPI = fromUPI;
                console.log(`[OCR] UPI found via From section: ${foundUPI}`);
            } else if (toUPI) {
                foundUPI = toUPI;
                console.log(`[OCR] UPI found via To section: ${foundUPI}`);
            }
        }
        
        if (foundUPI && (foundUPI.includes('xxxx') || foundUPI.includes('...') || foundUPI.length < 10)) {
            return {
                isValid: false,
                isSuccessful: false,
                confidence: confidence,
                foundOrderNumber: foundOrderNumber,
                foundUPI: foundUPI,
                foundUTR: null,
                foundAmount: null,
                foundDate: null,
                issues: ['Invalid Receipt - UPI ID is censored or incomplete'],
                warnings: []
            };
        }
        
        // Enhanced UTR pattern matching - prioritize labeled fields
        const utrPatterns = [
            // Priority 1: Explicit UTR labels (most reliable) - PhonePe format "UTR: 826044167736", "UPI Ref No: 396400577888"
            /(?:utr|unique\s*transaction\s*reference|reference\s*number|transaction\s*reference|upi\s*ref\s*no|upi\s*reference\s*number|ref\s*no|reference\s*no|upi\s*ref)[:\s]*([0-9]{10,16})/i,
            /(?:utr|unique\s*transaction\s*reference|reference\s*number|transaction\s*reference|upi\s*ref\s*no|upi\s*reference\s*number|ref\s*no|reference\s*no|upi\s*ref)[:\s]*([A-Z0-9]{10,16})/i,
            // Priority 2: Look for "UTR:" or "UPI Ref No:" followed by numbers (PhonePe/Paytm format) - improved spacing
            /(?:utr|upi\s*ref\s*no|ref\s*no|upi\s*ref)[:\s]+([0-9]{10,16})/i,
            // Priority 3: Transaction ID patterns that might be UTR (but exclude transaction IDs starting with T)
            /(?:transaction\s*id|txn\s*id|transaction\s*number)[:\s]*([0-9]{10,16})/i,
            // Priority 4: Look for UTR in "Transfer Details" section (common in payment apps)
            /(?:transfer\s*details|transaction\s*details)[^\n]{0,200}?(?:utr|ref\s*no|reference)[:\s]*([0-9]{10,16})/i,
            // Priority 5: Generic UTR pattern (pure numbers, 10-16 digits) - be careful not to match transaction IDs
            /\b([0-9]{10,16})\b/,
            // Priority 6: Alphanumeric UTR (fallback)
            /\b([A-Z0-9]{12,16})\b/
        ];
        
        let foundUTR = null;
        // Try all patterns and use the first valid match
        for (const pattern of utrPatterns) {
            let match;
            const regex = new RegExp(pattern.source, pattern.flags + 'g');
            while ((match = regex.exec(text)) !== null) {
                const utr = (match[1] || match[0]).trim().toUpperCase();
                // Validate UTR format (typically 10-16 characters, prefer pure numbers)
                if (utr.length >= 10 && utr.length <= 16) {
                    // Skip if it looks like a transaction ID (starts with T)
                    if (utr.startsWith('T')) continue;
                    // Skip if it's part of an order number (starts with s05, d05, p05)
                    if (/^(s05|d05|p05)/i.test(utr)) continue;
                    // Skip if it's clearly a phone number (starts with country code patterns)
                    if (/^(\+91|91|0)/.test(utr) && utr.length <= 13) continue;
                    // Skip if it's part of a date (YYYYMMDD format)
                    if (/^(20|19)\d{6}$/.test(utr) && utr.length === 8) continue;
                    
                    foundUTR = utr;
                    console.log(`[OCR] UTR found: ${foundUTR} (matched pattern: ${pattern.source})`);
                    break;
                }
            }
            if (foundUTR) break;
        }
        
        // Enhanced amount pattern matching with better parsing
        const amountPatterns = [
            /₹\s*([\d,]+\.?\d*)/i,
            /rs\.?\s*([\d,]+\.?\d*)/i,
            /inr\s*([\d,]+\.?\d*)/i,
            /(?:amount|total|paid)[:\s]*₹\s*([\d,]+\.?\d*)/i,
            /(?:amount|total|paid)[:\s]*rs\.?\s*([\d,]+\.?\d*)/i,
            /([\d,]+\.?\d*)\s*(?:rupees|rs|inr)/i,
            // Additional patterns for better matching
            /₹([\d]{1,3}(?:,\d{2,3})*(?:\.\d{2})?)/i, // ₹1,999.14 or ₹1999.14
            /([\d]{1,3}(?:,\d{2,3})*(?:\.\d{2})?)\s*₹/i, // 1,999.14 ₹
            /(?:sent|transferred|paid)\s*₹\s*([\d,]+\.?\d*)/i,
            /₹\s*([\d,]+\.?\d{2})/i, // Amount with 2 decimal places
            // Match standalone amounts with commas and decimals (e.g., 1,999.14)
            /([\d]{1,3}(?:,\d{2,3})*(?:\.\d{2})?)(?:\s*(?:rupees|rs|inr|only))?/i
        ];
        
        let foundAmount = null;
        let parsedAmount = null;
        for (const pattern of amountPatterns) {
            const match = text.match(pattern);
            if (match) {
                const amountStr = (match[1] || match[0]).replace(/,/g, ''); // Remove commas
                parsedAmount = parseFloat(amountStr);
                if (!isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount < 100000000) { // Reasonable range
                    foundAmount = parsedAmount;
                    console.log(`[OCR] Amount found: ₹${foundAmount}`);
                    break;
                }
            }
        }
        
        // If still not found, try to find any number that looks like an amount (with comma and decimal)
        if (!foundAmount) {
            const fallbackPattern = /([\d]{1,3}(?:,\d{2,3})*(?:\.\d{2})?)/;
            const fallbackMatch = text.match(fallbackPattern);
            if (fallbackMatch) {
                const amountStr = fallbackMatch[1].replace(/,/g, '');
                parsedAmount = parseFloat(amountStr);
                // Check if it's a reasonable amount (between 1 and 1,000,000)
                if (!isNaN(parsedAmount) && parsedAmount >= 1 && parsedAmount <= 1000000) {
                    foundAmount = parsedAmount;
                    console.log(`[OCR] Amount found (fallback): ₹${foundAmount}`);
                }
            }
        }
        
        // Enhanced date pattern matching with better validation
        const datePatterns = [
            /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i, // DD MMM YYYY (e.g., "02 Feb 2026")
            /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/, // DD/MM/YYYY or DD-MM-YYYY
            /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/, // YYYY/MM/DD or YYYY-MM-DD
            /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2})/, // DD/MM/YY or DD-MM-YY
            /(?:date|on)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
            /(?:date|on)[:\s]*(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i
        ];
        
        let foundDate = null;
        for (const pattern of datePatterns) {
            const match = text.match(pattern);
            if (match) {
                const dateStr = match[1];
                // Try to parse and validate the date
                try {
                    // Handle "DD MMM YYYY" format (e.g., "06 Feb 2026")
                    let testDate;
                    if (/^\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(dateStr)) {
                        // Parse "DD MMM YYYY" format explicitly to avoid timezone issues
                        const dateMatch = dateStr.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
                        if (dateMatch) {
                            const day = parseInt(dateMatch[1], 10);
                            const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                            const month = monthNames.indexOf(dateMatch[2].toLowerCase());
                            const year = parseInt(dateMatch[3], 10);
                            
                            if (month !== -1 && day >= 1 && day <= 31 && year >= 2020 && year < 2100) {
                                // Create date in UTC to avoid timezone shifts
                                testDate = new Date(Date.UTC(year, month, day, 0, 0, 0));
                                // Verify the date is valid
                                if (testDate.getUTCFullYear() === year && testDate.getUTCMonth() === month && testDate.getUTCDate() === day) {
                                    foundDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    console.log(`[OCR] Date found: ${dateStr} -> ${foundDate} (parsed explicitly)`);
                                    break;
                                }
                            }
                        }
                        // Fallback to standard Date parsing if explicit parsing fails
                        if (!foundDate) {
                            testDate = new Date(dateStr);
                        }
                    } else {
                        testDate = new Date(dateStr.replace(/-/g, '/'));
                    }
                    
                    // If explicit parsing didn't work, use standard Date parsing
                    if (!foundDate && !isNaN(testDate.getTime()) && testDate.getFullYear() > 2020 && testDate.getFullYear() < 2100) {
                        // Use UTC date components to avoid timezone issues
                        const year = testDate.getFullYear();
                        const month = testDate.getMonth() + 1;
                        const day = testDate.getDate();
                        foundDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        console.log(`[OCR] Date found: ${dateStr} -> ${foundDate} (using Date object)`);
                        break;
                    }
                } catch (e) {
                    // Invalid date format, continue
                    console.log(`[OCR] Date parsing error for "${dateStr}": ${e.message}`);
                }
            }
        }
        
        // Enhanced validation and issue detection
        const issues = [];
        const warnings = [];
        
        if (!foundOrderNumber) {
            issues.push('Order number not found in receipt');
        }
        
        if (!foundUPI && !foundUTR) {
            warnings.push('UPI ID or UTR not found (may be optional)');
        }
        
        if (confidence < 30) {
            warnings.push(`Low OCR confidence (${confidence.toFixed(1)}%) - receipt may be unclear`);
        }
        
        if (!foundAmount) {
            warnings.push('Amount not found in receipt');
        }
        
        if (!foundDate) {
            warnings.push('Date not found in receipt');
        }
        
        const isValid = foundOrderNumber !== null || (foundUPI !== null && foundAmount !== null);
        
        return {
            isValid: isValid,
            isSuccessful: false,
            confidence: confidence,
            foundOrderNumber: foundOrderNumber,
            foundUPI: foundUPI,
            foundUTR: foundUTR,
            foundAmount: foundAmount,
            foundDate: foundDate,
            issues: issues,
            warnings: warnings,
            processingTime: processingTime,
            rawText: text.substring(0, 500) // Store first 500 chars for debugging
        };
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error('[OCR] Error validating receipt:', {
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 3).join('\n'),
            processingTime: processingTime
        });
        return {
            isValid: false,
            isSuccessful: false,
            confidence: 0,
            foundOrderNumber: null,
            foundUPI: null,
            foundUTR: null,
            foundAmount: null,
            foundDate: null,
            issues: ['Error processing receipt image: ' + error.message],
            warnings: [],
            processingTime: processingTime
        };
    }
}

// ============================================
// PENDING FILES STORAGE FOR BATCH SENDING
// ============================================
const pendingFiles = new Map();

// ============================================
// UNIFIED TELEGRAM SENDING FUNCTION
// Handles ALL scenarios: receipt first, order number first, both at same time, no date detected
// ============================================
async function sendReceiptToTelegramIfNeeded(userId, orderNumber, receiptInfo, receiptDate, isOldReceipt, conversationHistory) {
    // UPDATED FLOW:
    // 1. Order NOT in database AND receipt exists → Send to Telegram (even if receipt is recent)
    // 2. Order in database AND receipt old (> 2 days) → Send to Telegram
    // 3. Order in database AND receipt recent (< 2 days) → Don't send
    // 4. Order in database AND no date detected → Don't send
    // 5. Order NOT in database BUT NO receipt → Don't send (wait for receipt upload)
    
    console.log(`[Unified Telegram] 🔍 Function called with:`);
    console.log(`[Unified Telegram]   - userId: ${userId}`);
    console.log(`[Unified Telegram]   - orderNumber: ${orderNumber}`);
    console.log(`[Unified Telegram]   - receiptDate: ${receiptDate || 'null'}`);
    console.log(`[Unified Telegram]   - isOldReceipt: ${isOldReceipt}`);
    console.log(`[Unified Telegram]   - receiptInfo: ${receiptInfo ? JSON.stringify(receiptInfo).substring(0, 200) : 'null'}`);
    if (receiptInfo) {
        console.log(`[Unified Telegram]   - receiptInfo.foundUPI: ${receiptInfo.foundUPI || 'null'}`);
        console.log(`[Unified Telegram]   - receiptInfo.foundUTR: ${receiptInfo.foundUTR || 'null'}`);
    }
    
    if (!orderNumber) {
        console.log(`[Unified Telegram] ❌ No order number - skipping Telegram send`);
        return false;
    }
    
    // Check if this receipt has already been sent to prevent duplicates
    const sentKey = `${userId}_${orderNumber}`;
    if (telegramSentReceipts.has(sentKey)) {
        console.log(`[Unified Telegram] ⏭️ Already sent to Telegram for ${sentKey} - skipping duplicate send`);
        return false;
    }
    
    // REMOVED: Duplicate declaration - using the one at line 4712 instead
    // const wasAskedForPDFAndVideo = conversationHistory && conversationHistory.some(msg => 
    
    // FIRST: Check if order number exists in database
    console.log(`[Unified Telegram] 🔍 Checking if order number ${orderNumber} exists in deposits database...`);
    let orderInDatabase = false;
    try {
        await new Promise((resolve) => {
            dbHelpers.getDepositByOrderNumber(orderNumber, (err, deposit) => {
                if (err) {
                    console.error(`[Unified Telegram] ❌ Error checking database: ${err.message}`);
                    // On error, assume not in database (safer to send)
                    orderInDatabase = false;
                } else if (deposit) {
                    console.log(`[Unified Telegram] ✅ Order ${orderNumber} FOUND in database`);
                    orderInDatabase = true;
                } else {
                    console.log(`[Unified Telegram] ❌ Order ${orderNumber} NOT FOUND in database`);
                    orderInDatabase = false;
                }
                resolve();
            });
        });
    } catch (error) {
        console.error(`[Unified Telegram] ❌ Exception checking database: ${error.message}`);
        orderInDatabase = false;
    }
    
    // CRITICAL: First check if receipt exists (before determining if we should send)
    // Check multiple sources: receiptInfo, receiptImageStorage, conversation history
    const receiptStorage = receiptImageStorage.get(userId);
    const hasReceiptInStorage = !!(receiptStorage && receiptStorage.buffer);
    const hasReceiptInHistory = !!(conversationHistory && conversationHistory.some(h => 
        h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video')
    ));
    const hasReceipt = !!(receiptInfo || hasReceiptInStorage || hasReceiptInHistory);
    
    console.log(`[Unified Telegram] Receipt check - hasReceipt: ${hasReceipt}, receiptInfo: ${!!receiptInfo}, hasReceiptInStorage: ${hasReceiptInStorage}, hasReceiptInHistory: ${hasReceiptInHistory}`);
    
    // Determine if we should send
    let shouldSend = false;
    let caption = null;
    
    // CRITICAL: Check if system asked for PDF/password/video (receipt is old >2 days)
    // If waiting for files, DON'T send receipt yet - wait until all files are provided
    // This check MUST happen BEFORE any sending logic
    const wasAskedForPDFAndVideo = conversationHistory && conversationHistory.some(msg => 
        msg.role === 'assistant' && 
        msg.message && 
        typeof msg.message === 'string' &&
        (msg.message.includes('PDF bank statement') || 
         msg.message.includes('PDF बैंक') || 
         msg.message.includes('PDF బ్యాంక్') ||
         msg.message.includes('video recording') ||
         msg.message.includes('वीडियो') ||
         msg.message.includes('వీడियో') ||
         msg.message.includes('more than 2 days old'))
    );
    
    console.log(`[Unified Telegram] wasAskedForPDFAndVideo: ${wasAskedForPDFAndVideo}, isOldReceipt: ${isOldReceipt}`);
    
    // If waiting for PDF/password/video, check if all files have been received
    let hasAllFiles = false;
    if (wasAskedForPDFAndVideo) {
        // Check conversation history for all required files
        const hasPDF = conversationHistory.some(h => 
            h.role === 'user' && h.fileType === 'pdf'
        );
        const hasVideo = conversationHistory.some(h => 
            h.role === 'user' && h.fileType === 'video'
        );
        // Check for password - can be in fileType or extracted from message text
        const passwordPatterns = [
            /password[:\s]*([A-Z0-9]{4,})/i,
            /pdf[:\s]*password[:\s]*([A-Z0-9]{4,})/i,
            /pass[:\s]*([A-Z0-9]{4,})/i,
            /pwd[:\s]*([A-Z0-9]{4,})/i
        ];
        const hasPassword = conversationHistory.some(h => {
            if (h.role === 'user' && h.fileType === 'password') {
                return true;
            }
            if (h.role === 'user' && h.message && typeof h.message === 'string') {
                // Check if message contains password pattern
                for (const pattern of passwordPatterns) {
                    if (pattern.test(h.message)) {
                        return true;
                    }
                }
                // Also check if it's a simple password (4-20 alphanumeric)
                if (/^[a-zA-Z0-9]{4,20}$/.test(h.message.trim())) {
                    return true;
                }
            }
            return false;
        });
        
        hasAllFiles = hasPDF && hasVideo && hasPassword;
        
        console.log(`[Unified Telegram] PDF/Video requested - PDF: ${hasPDF}, Password: ${hasPassword}, Video: ${hasVideo}, All: ${hasAllFiles}`);
        
        // If waiting for files and not all received, DON'T send receipt yet
        if (!hasAllFiles) {
            console.log(`[Unified Telegram] ⏭️ Waiting for PDF/password/video - NOT sending receipt yet (waiting for all files)`);
            return false;
        } else {
            console.log(`[Unified Telegram] ✅ All files received (PDF/password/video) - will send receipt with files`);
            // When all files are received, receipt will be sent via sendBatchFilesToTelegram
            // Don't send via this function - return false to prevent duplicate send
            return false;
        }
    }
    
    // UPDATED FLOW - Check if we should send:
    // 1. Order NOT in database AND receipt exists → Send to Telegram (even if receipt is recent)
    //    BUT: If receipt is old (>2 days), wait for PDF/password/video first (checked above)
    // 2. Order in database AND receipt is old (> 2 days) → Send to Telegram (only after all files received)
    // 3. Order in database AND receipt is recent (< 2 days) → Don't send
    // 4. No date detected AND order in database → Don't send
    // 5. Order NOT in database BUT NO receipt → Don't send (wait for receipt upload)
    
    // CRITICAL: If receipt is old and PDF/password/video were requested, DON'T send receipt alone
    // Wait until all files are received, then send everything together via sendBatchFilesToTelegram
    if (isOldReceipt && wasAskedForPDFAndVideo) {
        console.log(`[Unified Telegram] ⏭️ Receipt is old (>2 days) and PDF/password/video were requested - NOT sending receipt alone (waiting for all files via sendBatchFilesToTelegram)`);
        return false;
    }
    
    if (!orderInDatabase) {
        // Order not in database - only send if receipt exists
        // BUT: If receipt is old and PDF/video were requested, wait for all files (already checked above)
        if (hasReceipt) {
            console.log(`[Unified Telegram] ✅ Order NOT in database AND receipt exists - will send to Telegram`);
            shouldSend = true;
            caption = `Deposit not received\n\nOrder number: ${orderNumber}`;
        } else {
            console.log(`[Unified Telegram] ⏭️ Order NOT in database BUT NO receipt uploaded yet - waiting for receipt upload`);
            return false;
        }
    } else if (isOldReceipt) {
        // Order in database but receipt is old - send to Telegram
        // BUT: Only if all files (PDF/password/video) have been received (already checked above)
        console.log(`[Unified Telegram] ✅ Order in database but receipt is old (> 2 days) - will send to Telegram`);
        shouldSend = true;
        caption = `Deposit not received\n\nOrder number: ${orderNumber}`;
    } else if (!receiptInfo?.foundDate && !receiptDate) {
        // Order in database but no date detected - don't send
        console.log(`[Unified Telegram] ❌ Order in database but no date detected - do NOT send`);
        return false;
    } else {
        // Order in database and receipt is recent - don't send
        console.log(`[Unified Telegram] ❌ Order in database and receipt is recent (< 2 days) - do NOT send`);
        console.log(`[Unified Telegram]   - isOldReceipt: ${isOldReceipt}`);
        console.log(`[Unified Telegram]   - receiptDate: ${receiptDate || 'null'}`);
        console.log(`[Unified Telegram]   - receiptInfo?.foundDate: ${receiptInfo?.foundDate || 'null'}`);
        return false;
    }
    
    if (!shouldSend) {
        return false;
    }
    
    // CRITICAL: Merge validation data from receiptImageStorage BEFORE extracting UPI/UTR
    // This ensures we have the complete validation data even if receiptInfo was incomplete
    console.log(`[Unified Telegram] 🔍 Looking for receipt image buffer and validation data...`);
    console.log(`[Unified Telegram] receiptImageStorage keys: ${Array.from(receiptImageStorage.keys()).join(', ') || 'NONE'}`);
    console.log(`[Unified Telegram] pendingFiles keys: ${Array.from(pendingFiles.keys()).filter(k => k.startsWith(userId)).join(', ') || 'NONE'}`);
    
    // Try to get receipt image buffer and merge validation data from multiple sources
    let receiptImageBuffer = null;
    
    // Source 1: receiptImageStorage (already retrieved above)
    console.log(`[Unified Telegram] 🔍 Checking receiptStorage for userId: ${userId}`);
    console.log(`[Unified Telegram] receiptStorage exists: ${!!receiptStorage}`);
    if (receiptStorage) {
        console.log(`[Unified Telegram] receiptStorage has buffer: ${!!receiptStorage.buffer}`);
        console.log(`[Unified Telegram] receiptStorage has validation: ${!!receiptStorage.validation}`);
        if (receiptStorage.validation) {
            console.log(`[Unified Telegram] receiptStorage.validation content:`, JSON.stringify({
                foundUPI: receiptStorage.validation.foundUPI || null,
                foundUTR: receiptStorage.validation.foundUTR || null,
                foundAmount: receiptStorage.validation.foundAmount || null,
                foundDate: receiptStorage.validation.foundDate || null
            }));
        }
        
        if (receiptStorage.buffer) {
        receiptImageBuffer = receiptStorage.buffer;
        console.log(`[Unified Telegram] ✅ Found receipt image buffer in receiptImageStorage`);
        }
        
        // CRITICAL: Merge validation data from storage BEFORE extracting UPI/UTR
        // This handles the case where receipt was uploaded first, then order number provided later
        if (receiptStorage.validation) {
            console.log(`[Unified Telegram] ✅ receiptStorage.validation exists, attempting merge...`);
            if (!receiptInfo) {
            console.log(`[Unified Telegram] ⚠️ receiptInfo missing but receiptStorage has validation - using it`);
            receiptInfo = {
                foundUPI: receiptStorage.validation.foundUPI || null,
                foundUTR: receiptStorage.validation.foundUTR || null,
                foundAmount: receiptStorage.validation.foundAmount || null,
                foundDate: receiptStorage.validation.foundDate || null,
                foundOrderNumber: receiptStorage.validation.foundOrderNumber || null
            };
                console.log(`[Unified Telegram] Created receiptInfo from validation - UPI: ${receiptInfo.foundUPI || 'null'}, UTR: ${receiptInfo.foundUTR || 'null'}`);
            } else {
            // Merge validation data from storage if receiptInfo is missing some fields
                // Check for null, undefined, or empty string
                const needsUPI = !receiptInfo.foundUPI || receiptInfo.foundUPI === null || receiptInfo.foundUPI === '';
                const needsUTR = !receiptInfo.foundUTR || receiptInfo.foundUTR === null || receiptInfo.foundUTR === '';
                
                if (needsUPI && receiptStorage.validation.foundUPI) {
                receiptInfo.foundUPI = receiptStorage.validation.foundUPI;
                    console.log(`[Unified Telegram] ✅ Merged UPI from receiptImageStorage: ${receiptInfo.foundUPI}`);
                } else {
                    console.log(`[Unified Telegram] ⏭️ Skipping UPI merge - needsUPI: ${needsUPI}, validation.foundUPI: ${receiptStorage.validation.foundUPI || 'null'}`);
            }
                
                if (needsUTR && receiptStorage.validation.foundUTR) {
                receiptInfo.foundUTR = receiptStorage.validation.foundUTR;
                    console.log(`[Unified Telegram] ✅ Merged UTR from receiptImageStorage: ${receiptInfo.foundUTR}`);
                } else {
                    console.log(`[Unified Telegram] ⏭️ Skipping UTR merge - needsUTR: ${needsUTR}, validation.foundUTR: ${receiptStorage.validation.foundUTR || 'null'}`);
                }
                
                if (!receiptInfo.foundAmount && receiptStorage.validation.foundAmount) {
                    receiptInfo.foundAmount = receiptStorage.validation.foundAmount;
            }
            if (!receiptInfo.foundDate && receiptStorage.validation.foundDate) {
                receiptInfo.foundDate = receiptStorage.validation.foundDate;
            }
                console.log(`[Unified Telegram] ✅ Merge complete - Final UPI: ${receiptInfo.foundUPI || 'null'}, Final UTR: ${receiptInfo.foundUTR || 'null'}`);
        }
    } else {
            console.log(`[Unified Telegram] ⚠️ receiptStorage.validation is null/undefined - cannot merge validation data`);
        }
    }
    
    // Source 2: pendingFiles (try with order number) - also check for validation data
    if (!receiptImageBuffer || !receiptInfo || (!receiptInfo.foundUPI && !receiptInfo.foundUTR)) {
        const storageKey = `${userId}_${orderNumber}`;
        const pendingFile = pendingFiles.get(storageKey);
        if (pendingFile) {
            if (pendingFile.images && pendingFile.images.length > 0) {
                const receiptImage = pendingFile.images[0];
                if (receiptImage.buffer && !receiptImageBuffer) {
                    receiptImageBuffer = receiptImage.buffer;
                    console.log(`[Unified Telegram] ✅ Found receipt image buffer in pendingFiles (key: ${storageKey})`);
                }
                // Check if image has validation data
                if (receiptImage.validation && receiptInfo) {
                    if (!receiptInfo.foundUPI && receiptImage.validation.foundUPI) {
                        receiptInfo.foundUPI = receiptImage.validation.foundUPI;
                        console.log(`[Unified Telegram] ✅ Merged UPI from pendingFiles: ${receiptInfo.foundUPI}`);
                    }
                    if (!receiptInfo.foundUTR && receiptImage.validation.foundUTR) {
                        receiptInfo.foundUTR = receiptImage.validation.foundUTR;
                        console.log(`[Unified Telegram] ✅ Merged UTR from pendingFiles: ${receiptInfo.foundUTR}`);
                    }
                }
            }
        }
        
        // Source 3: Try any pendingFiles key that starts with userId
        if (!receiptImageBuffer || !receiptInfo || (!receiptInfo.foundUPI && !receiptInfo.foundUTR)) {
            for (const [key, storage] of pendingFiles.entries()) {
                if (key.startsWith(userId + '_') && storage.images && storage.images.length > 0) {
                    if (!receiptImageBuffer) {
                        receiptImageBuffer = storage.images[0].buffer;
                        console.log(`[Unified Telegram] ✅ Found receipt image buffer in pendingFiles (alternative key: ${key})`);
                    }
                    // Check if image has validation data
                    if (storage.images[0].validation && receiptInfo) {
                        if (!receiptInfo.foundUPI && storage.images[0].validation.foundUPI) {
                            receiptInfo.foundUPI = storage.images[0].validation.foundUPI;
                            console.log(`[Unified Telegram] ✅ Merged UPI from pendingFiles (alt key): ${receiptInfo.foundUPI}`);
                        }
                        if (!receiptInfo.foundUTR && storage.images[0].validation.foundUTR) {
                            receiptInfo.foundUTR = storage.images[0].validation.foundUTR;
                            console.log(`[Unified Telegram] ✅ Merged UTR from pendingFiles (alt key): ${receiptInfo.foundUTR}`);
                        }
                    }
                    break;
                }
            }
        }
    }
    
    // NOW extract UPI, UTR from receipt info (after merging from all sources)
    const upi = receiptInfo?.foundUPI || null;
    const utr = receiptInfo?.foundUTR || null;
    
    console.log(`[Unified Telegram] Final extracted - UPI: ${upi || 'null'}, UTR: ${utr || 'null'}`);
    
    if (utr) {
        caption += `\nUTR: ${utr}`;
    } else {
        caption += `\nUTR: `;
    }
    
    if (upi) {
        caption += `\nUPI: ${upi}`;
    } else {
        caption += `\nUPI: `;
    }
    
    console.log(`[Unified Telegram] Prepared caption: ${caption}`);
    
    // Continue with sending if we have the buffer
    if (receiptImageBuffer) {
        // Source 2: pendingFiles (try with order number)
        const storageKey = `${userId}_${orderNumber}`;
        const pendingFile = pendingFiles.get(storageKey);
        if (pendingFile && pendingFile.images && pendingFile.images.length > 0) {
            const receiptImage = pendingFile.images[0];
            if (receiptImage.buffer) {
                receiptImageBuffer = receiptImage.buffer;
                console.log(`[Unified Telegram] ✅ Found receipt image buffer in pendingFiles (key: ${storageKey})`);
            }
        }
        
        // Source 3: Try any pendingFiles key that starts with userId
        if (!receiptImageBuffer) {
            for (const [key, storage] of pendingFiles.entries()) {
                if (key.startsWith(userId + '_') && storage.images && storage.images.length > 0) {
                    receiptImageBuffer = storage.images[0].buffer;
                    console.log(`[Unified Telegram] ✅ Found receipt image buffer in pendingFiles (alternative key: ${key})`);
                    break;
                }
            }
        }
    }
    
    // Send to Telegram if we have the buffer (with "Deposit not received" caption on photo - original format)
    if (receiptImageBuffer) {
        console.log(`[Unified Telegram] ✅ Sending to Telegram - Order: ${orderNumber}, Recent: ${!isOldReceipt}, NoDate: ${!receiptDate || !receiptInfo?.foundDate} (with caption on photo)`);
        try {
            const success = await telegramNotifier.sendPhoto(userId, receiptImageBuffer, caption);
            if (success) {
                console.log(`[Unified Telegram] ✅ Successfully sent receipt to Telegram`);
                // Mark as sent to prevent duplicates
                telegramSentReceipts.add(sentKey);
                // Clear storage after successful send
                receiptImageStorage.delete(userId);
                // Clean up old entries (keep last 1000)
                if (telegramSentReceipts.size > 1000) {
                    const entriesArray = Array.from(telegramSentReceipts);
                    telegramSentReceipts.clear();
                    entriesArray.slice(-500).forEach(key => telegramSentReceipts.add(key));
                }
                return true;
            } else {
                console.log(`[Unified Telegram] ⚠️ Failed to send to Telegram (bot may not be configured)`);
                return false;
            }
        } catch (telegramError) {
            console.error(`[Unified Telegram] ❌ Error sending to Telegram:`, telegramError.message);
            return false;
        }
    } else {
        // No receipt image buffer - send as TEXT MESSAGE (order-only "deposit not received" scenario)
        console.log(`[Unified Telegram] ℹ️ Receipt image buffer not found - sending as TEXT message instead`);
        console.log(`[Unified Telegram] This is order-only "deposit not received" (no receipt image provided)`);
        
        try {
            const success = await telegramNotifier.sendMessage(userId, caption);
            if (success) {
                console.log(`[Unified Telegram] ✅ Successfully sent TEXT message to Telegram - Order: ${orderNumber}`);
                // Mark as sent to prevent duplicates
                telegramSentReceipts.add(sentKey);
                // Clean up old entries (keep last 1000)
                if (telegramSentReceipts.size > 1000) {
                    const entriesArray = Array.from(telegramSentReceipts);
                    telegramSentReceipts.clear();
                    entriesArray.slice(-500).forEach(key => telegramSentReceipts.add(key));
                }
                return true;
            } else {
                console.log(`[Unified Telegram] ⚠️ Failed to send TEXT message to Telegram (bot may not be configured)`);
                return false;
            }
        } catch (telegramError) {
            console.error(`[Unified Telegram] ❌ Error sending TEXT message to Telegram:`, telegramError.message);
            return false;
        }
    }
}

async function sendBatchFilesToTelegram(userId, files, orderNumber) {
    console.log(`[Batch Send] Starting batch send for order ${orderNumber}`);
    console.log(`[Batch Send] Files ready: ${files.pdfs.length} PDF(s), ${files.videos.length} video(s), ${files.images ? files.images.length : 0} image(s), password: ${files.password ? 'provided' : 'missing'}`);
    
    // Format like the Telegram message in the image
    // First, get order details from database if available
    let orderData = null;
    let amount = null;
    let transactionDate = null;
    let deliveryType = null;
    let paymentStatus = null;
    
    // Get UTR and UPI from receipt image validation if available
    // CRITICAL: Check multiple sources to ensure UPI/UTR are found
    let utr = null;
    let upi = null;
    
    // Source 1: Check files.images validation
    if (files.images && files.images.length > 0 && files.images[0].validation) {
        const validation = files.images[0].validation;
        if (validation.foundAmount) {
            amount = validation.foundAmount;
        }
        if (validation.foundOrderNumber) {
            orderNumber = validation.foundOrderNumber || orderNumber;
        }
        if (validation.foundUTR) {
            utr = validation.foundUTR;
        }
        if (validation.foundUPI) {
            upi = validation.foundUPI;
        }
    }
    
    // Source 2: Check receiptImageStorage (if UPI/UTR not found yet)
    if ((!upi || !utr) && receiptImageStorage.has(userId)) {
        const receiptStorage = receiptImageStorage.get(userId);
        if (receiptStorage && receiptStorage.validation) {
            if (!utr && receiptStorage.validation.foundUTR) {
                utr = receiptStorage.validation.foundUTR;
                console.log(`[Batch Send] ✅ Found UTR from receiptImageStorage: ${utr}`);
            }
            if (!upi && receiptStorage.validation.foundUPI) {
                upi = receiptStorage.validation.foundUPI;
                console.log(`[Batch Send] ✅ Found UPI from receiptImageStorage: ${upi}`);
            }
        }
    }
    
    // Source 3: Check pendingFiles for validation data (if UPI/UTR still not found)
    if ((!upi || !utr)) {
        const storageKey = `${userId}_${orderNumber}`;
        const pendingFile = pendingFiles.get(storageKey);
        if (pendingFile && pendingFile.images && pendingFile.images.length > 0) {
            const receiptImage = pendingFile.images[0];
            if (receiptImage.validation) {
                if (!utr && receiptImage.validation.foundUTR) {
                    utr = receiptImage.validation.foundUTR;
                    console.log(`[Batch Send] ✅ Found UTR from pendingFiles: ${utr}`);
                }
                if (!upi && receiptImage.validation.foundUPI) {
                    upi = receiptImage.validation.foundUPI;
                    console.log(`[Batch Send] ✅ Found UPI from pendingFiles: ${upi}`);
                }
            }
        }
    }
    
    console.log(`[Batch Send] Final UPI/UTR extraction - UPI: ${upi || 'null'}, UTR: ${utr || 'null'}`);
    
    if (orderNumber) {
        await new Promise((resolve) => {
            agent.checkOrderNumberInDatabase(orderNumber, (err, data) => {
                if (!err && data && data.found) {
                    orderData = data.data;
                    if (!amount) amount = orderData.amount;
                    deliveryType = orderData.deliveryType;
                    paymentStatus = orderData.paymentStatus;
                    // Format date from order data if available
                    if (orderData.createdAt || orderData.importDate) {
                        const dateStr = orderData.createdAt || orderData.importDate;
                        try {
                            const date = new Date(dateStr);
                            transactionDate = date.toISOString().replace('T', ' ').substring(0, 19);
                        } catch (e) {
                            transactionDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
                        }
                    } else {
                        transactionDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
                    }
                } else {
                    transactionDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
                }
                resolve();
            });
        });
    }
    
    // Format caption as requested: DPF Deposit with order number, Password, UTR, UPI
    // Format: DPF Deposit\norder number: [order]\nPassword: [password]\nUTR: [utr]\nUPI: [upi]
    let caption = `DPF Deposit\n`;
    caption += `order number: ${orderNumber || 'N/A'}\n`;
    
    // Add password if provided
    if (files.password) {
        caption += `Password: ${files.password}\n`;
    } else {
        caption += `Password: \n`;
    }
    
    // Add UTR
    if (utr) {
        caption += `UTR: ${utr}\n`;
    } else {
        caption += `UTR: \n`;
    }
    
    // Add UPI
    if (upi) {
        caption += `UPI: ${upi}`;
    } else {
        caption += `UPI: `;
    }
    
    // MESSAGE 1: Send PDF with full caption (like first message in image)
    if (files.pdfs && files.pdfs.length > 0) {
        console.log(`[Batch Send] 📄 Preparing to send ${files.pdfs.length} PDF(s) with caption...`);
        console.log(`[Batch Send] PDF details - First PDF buffer size: ${files.pdfs[0].buffer ? files.pdfs[0].buffer.length : 'MISSING'}, filename: ${files.pdfs[0].filename || 'default.pdf'}`);
        
        try {
            const firstPDF = files.pdfs[0];
            if (!firstPDF.buffer) {
                console.error(`[Batch Send] ❌❌❌ CRITICAL: First PDF buffer is MISSING!`);
                throw new Error('PDF buffer is missing');
            }
            
            const filename = firstPDF.filename || 'document.pdf';
            console.log(`[Batch Send] 🚀 Sending first PDF to Telegram (size: ${firstPDF.buffer.length} bytes, filename: ${filename})...`);
            console.log(`[Batch Send] 📋 Caption preview: ${caption.substring(0, 100)}...`);
            
            const sendResult = await telegramNotifier.sendDocument(userId, firstPDF.buffer, caption, filename);
            
            if (sendResult) {
                console.log(`[Batch Send] ✅✅✅ First PDF successfully sent to Telegram group!`);
            } else {
                console.error(`[Batch Send] ❌❌❌ Failed to send first PDF to Telegram (sendDocument returned false)`);
                console.error(`[Batch Send] ⚠️ Check Telegram bot configuration - bot and groupId must be set`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Send remaining PDFs without caption (if any)
            for (let i = 1; i < files.pdfs.length; i++) {
                const pdf = files.pdfs[i];
                if (pdf.buffer) {
                    console.log(`[Batch Send] 📄 Sending additional PDF ${i + 1}/${files.pdfs.length}...`);
                    const additionalResult = await telegramNotifier.sendDocument(userId, pdf.buffer, '', pdf.filename || 'document.pdf');
                    if (additionalResult) {
                        console.log(`[Batch Send] ✅ Additional PDF ${i + 1} sent successfully`);
                    } else {
                        console.error(`[Batch Send] ❌ Failed to send additional PDF ${i + 1}`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                    console.error(`[Batch Send] ❌ PDF ${i + 1} buffer is missing, skipping...`);
                }
            }
        } catch (error) {
            console.error(`[Batch Send] ❌❌❌ ERROR sending PDF(s):`, error.message);
            console.error(`[Batch Send] Error stack:`, error.stack);
            // Don't throw - continue with images/videos even if PDF fails
        }
    } else {
        console.error(`[Batch Send] ❌❌❌ CRITICAL: No PDFs found in files.pdfs! files.pdfs:`, files.pdfs);
    }
    
    // MESSAGE 2: Send images and videos together in a single media group
    // CRITICAL: Receipt photo (first image) should have caption with order number, UTR, UPI
    // Format: [{ type: 'photo', media: buffer, caption: '...' }, { type: 'video', media: buffer }]
    if ((files.images && files.images.length > 0) || files.videos.length > 0) {
        console.log(`[Batch Send] Sending images and videos together in media group...`);
        
        // Build media array for sendMediaGroup
        const mediaArray = [];
        
        // Add all images without captions (user requested no text on photos/videos)
        if (files.images && files.images.length > 0) {
            for (let i = 0; i < files.images.length; i++) {
                mediaArray.push({
                    type: 'photo',
                    media: files.images[i].buffer
                });
            }
        }
        
        // Add all videos to media array (no captions - user requested no text on photos/videos)
        if (files.videos.length > 0) {
            for (const video of files.videos) {
                mediaArray.push({
                    type: 'video',
                    media: video.buffer
                });
            }
        }
        
        // Send all images and videos together in one media group
        if (mediaArray.length > 0) {
            await telegramNotifier.sendMediaGroup(userId, mediaArray);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    console.log(`[Batch Send] ✅ Successfully sent all files to Telegram: ${files.pdfs.length} PDF(s), ${files.videos.length} video(s), ${files.images ? files.images.length : 0} image(s) for order ${orderNumber}`);
}

// ============================================
// API ENDPOINTS
// ============================================

// Message batching: Store pending requests per user
const pendingChatRequests = new Map(); // userId -> { res, messages[], timer }
const processingBatches = new Set(); // userId -> tracks if batch is currently being processed (prevents concurrent processing)

// Store receipt images temporarily for Telegram sending
const receiptImageStorage = new Map(); // userId -> { buffer: Buffer, timestamp: Date, orderNumber: string }

// Track which receipts have already been sent to Telegram to prevent duplicates
const telegramSentReceipts = new Set(); // userId_orderNumber -> prevents duplicate sends

// Process batched messages and generate single response
async function processBatchedChat(userId) {
    // CRITICAL: Check if already processing a batch for this user
    if (processingBatches.has(userId)) {
        console.log(`[Message Batching] ⚠️ Batch already being processed for user ${userId} - skipping duplicate processing`);
        return;
    }
    
    const pending = pendingChatRequests.get(userId);
    if (!pending || pending.messages.length === 0) {
        return;
    }
    
    // Mark as processing to prevent concurrent batches
    processingBatches.add(userId);
    
    // Clear the pending request
    pendingChatRequests.delete(userId);
    if (pending.timer) {
        clearTimeout(pending.timer);
    }
    
    const { res, messages } = pending;
    const allMessages = messages.map(m => m.message);
    const combinedMessages = allMessages.join(' ');
    const latestMessage = allMessages[allMessages.length - 1];
    const hasMultipleMessages = allMessages.length > 1;
    
    try {
        // CRITICAL: Check for offensive content in ALL batched messages
        // This happens AFTER batching, so we can handle all messages together with ONE response
        let hasOffensiveContent = false;
        let offensiveMessages = [];
        for (const msg of allMessages) {
            const offensiveDetection = agent.detectOffensiveContent(msg);
            if (offensiveDetection.isOffensive) {
                hasOffensiveContent = true;
                offensiveMessages.push(msg);
            }
        }
        
        if (hasOffensiveContent) {
            console.log(`[Offensive Content] Detected in ${offensiveMessages.length} message(s) after batching - sending SINGLE comforting response`);
            agent.metrics.offensiveContentDetected++;
            const language = agent.languageDetector.detectLanguage(latestMessage);
            const comfortingMessage = agent.getComfortingMessageForOffensiveContent(language);
            
            // Save all messages to history
            if (!agent.conversationHistory.has(userId)) {
                agent.conversationHistory.set(userId, []);
            }
            allMessages.forEach(msg => {
                agent.conversationHistory.get(userId).push({ role: 'user', message: msg });
            });
            agent.conversationHistory.get(userId).push({ role: 'assistant', message: comfortingMessage });
            
            // Save to database
            dbHelpers.addConversation(userId, combinedMessages, comfortingMessage, 'general', null, (err) => {
                if (err) console.error('Error saving comforting message:', err);
            });
            
            if (!res.headersSent) {
                return res.json({ 
                    message: comfortingMessage,
                    response: comfortingMessage
                });
            }
            return;
        }
        
        // CRITICAL: Check for duplicate messages AFTER batching
        // Create hash from all messages combined to detect duplicate batches
        // Use a shorter time window (10 seconds) to catch rapid duplicate batches
        // Also check if the exact same messages were just processed
        const batchHash = `${userId}_${allMessages.map(m => m.trim().toLowerCase()).join('_')}_${Math.floor(Date.now() / 10000)}`;
        if (agent.processedMessages && agent.processedMessages.has(batchHash)) {
            console.log(`[Duplicate Detection] ⚠️ Batch already processed in last 10 seconds, skipping duplicate`);
            const history = agent.conversationHistory.get(userId) || [];
            const lastResponse = history.filter(h => h.role === 'assistant').pop();
            if (lastResponse && lastResponse.message) {
                if (!res.headersSent) {
                    console.log(`[Duplicate Detection] Returning last response from history`);
                    return res.json({ 
                        message: lastResponse.message,
                        response: lastResponse.message
                    });
                }
                return;
            }
            const defaultMessage = "I'm here to help you with your deposit concern. How can I assist you today?";
            if (!res.headersSent) {
                return res.json({ 
                    message: defaultMessage,
                    response: defaultMessage
                });
            }
            return;
        }
        
        // CRITICAL: Check BEFORE generating response if we just replied to the same content
        // This prevents duplicate replies when user sends same message twice
        const history = agent.conversationHistory.get(userId) || [];
        const recentAssistantMessages = history.filter(h => h.role === 'assistant').slice(-3);
        const lastUserMessages = history.filter(h => h.role === 'user').slice(-allMessages.length);
        
        // If user sent same messages and we just replied, don't reply again
        if (lastUserMessages.length >= allMessages.length && recentAssistantMessages.length > 0) {
            const lastUserContent = lastUserMessages.slice(-allMessages.length).map(m => m.message?.trim().toLowerCase() || '').join(' ');
            const currentContent = allMessages.map(m => m.trim().toLowerCase()).join(' ');
            
            // Check if content matches AND we just sent a response (within last 30 seconds)
            if (lastUserContent === currentContent) {
                const lastReply = recentAssistantMessages[recentAssistantMessages.length - 1];
                const lastReplyTime = lastReply?.timestamp ? new Date(lastReply.timestamp).getTime() : 0;
                const timeSinceLastReply = Date.now() - lastReplyTime;
                
                // If we replied in the last 30 seconds to the same content, skip duplicate
                if (lastReply && lastReply.message && timeSinceLastReply < 30000 && !res.headersSent) {
                    console.log(`[Duplicate Detection] ⚠️ Same messages detected (${Math.round(timeSinceLastReply/1000)}s ago), skipping duplicate reply`);
                    return res.json({ 
                        message: lastReply.message,
                        response: lastReply.message
                    });
                }
            }
        }
        
        // Mark batch as processed (10 second window)
        if (!agent.processedMessages) {
            agent.processedMessages = new Set();
        }
        agent.processedMessages.add(batchHash);
        if (agent.processedMessages.size > 1000) {
            const entries = Array.from(agent.processedMessages);
            agent.processedMessages.clear();
            entries.slice(-500).forEach(hash => agent.processedMessages.add(hash));
        }
        
        console.log(`[Message Batching] Processing batch with ${allMessages.length} message(s): ${allMessages.map(m => `"${m.substring(0, 20)}"`).join(', ')}`);
        
        await new Promise((resolve) => {
            dbHelpers.getOrCreateUser(userId, 'english', (err) => {
                if (err) console.error('Error getting/creating user:', err);
                resolve();
            });
        });
        
        // First check in-memory conversation history (has fileType info)
        let conversationHistory = agent.conversationHistory.get(userId) || [];
        
        // If no in-memory history, load from database
        if (conversationHistory.length === 0) {
            conversationHistory = await new Promise((resolve) => {
                dbHelpers.getConversationHistory(userId, 500, (err, history) => {
                    if (err) {
                        console.error('Error loading conversation history:', err);
                        resolve([]);
                    } else {
                        const formattedHistory = (history || []).map(h => ({
                            role: 'user',
                            message: h.userMessage,
                            timestamp: h.timestamp,
                            fileType: h.fileType || null
                        })).concat((history || []).map(h => ({
                            role: 'assistant',
                            message: h.botResponse,
                            timestamp: h.timestamp
                        })));
                        agent.conversationHistory.set(userId, formattedHistory);
                        resolve(formattedHistory);
                    }
                });
            });
        } else {
            // Merge in-memory history with database history to ensure we have both
            const dbHistory = await new Promise((resolve) => {
                dbHelpers.getConversationHistory(userId, 500, (err, history) => {
                    if (err) {
                        console.error('Error loading conversation history:', err);
                        resolve([]);
                    } else {
                        const formattedHistory = (history || []).map(h => ({
                            role: 'user',
                            message: h.userMessage,
                            timestamp: h.timestamp,
                            fileType: h.fileType || null
                        })).concat((history || []).map(h => ({
                            role: 'assistant',
                            message: h.botResponse,
                            timestamp: h.timestamp
                        })));
                        resolve(formattedHistory);
                    }
                });
            });
            // Merge: in-memory history takes precedence (has fileType), then add DB history
            const mergedHistory = [...conversationHistory];
            for (const dbMsg of dbHistory) {
                // Only add if not already in in-memory history
                if (!mergedHistory.some(memMsg => memMsg.message === dbMsg.message && memMsg.role === dbMsg.role)) {
                    mergedHistory.push(dbMsg);
                }
            }
            conversationHistory = mergedHistory;
            agent.conversationHistory.set(userId, conversationHistory);
        }
        
        const language = agent.languageDetector.detectLanguage(latestMessage);
        let response;
        
        // Check if this is the first message
        const isFirstMessage = conversationHistory.length === 0;
        
        // Check if message is from pre-query form (bypass greeting)
        const preQueryPatternsBatch = [
            /^I need help with deposit$/i,
            /^I need help with withdrawal$/i,
            /^I have a game concern$/i,
            /^I need help with bonus$/i,
            /^I have a bank concern$/i,
            /^I need to contact an agent$/i,
            /^I need help with my account$/i,
            /^I need help with deposit\.?$/i,
            /^I need help with withdrawal\.?$/i,
            /^I have a game concern\.?$/i,
            /^I need help with bonus\.?$/i,
            /^I have a bank concern\.?$/i,
            /^I need to contact an agent\.?$/i,
            /^I need help with my account\.?$/i
        ];
        
        const isFromPreQueryBatch = preQueryPatternsBatch.some(pattern => pattern.test(latestMessage.trim()));
        
        // If first message, check if it's from pre-query form
        if (isFirstMessage) {
            if (isFromPreQueryBatch) {
                // Skip greeting - user already selected their concern from pre-query form
                console.log(`[Pre-Query] Message detected from pre-query form: "${latestMessage}" - Skipping greeting`);
                // Don't set isGreeting flag, proceed with normal flow
            } else {
                // First message but not from pre-query - show greeting
                const greeting = await agent.generateTemplateResponse(latestMessage, 'deposit', language, { isGreeting: true }, {}, userId);
                // Ensure greeting is a string
                const greetingString = (greeting && typeof greeting === 'string') ? greeting : String(greeting || 'Hello! How can I help you?');
                // Save all messages to history
                allMessages.forEach(msg => {
                    agent.conversationHistory.get(userId).push({ role: 'user', message: msg });
                });
                agent.conversationHistory.get(userId).push({ role: 'assistant', message: greetingString });
                dbHelpers.addConversation(userId, combinedMessages, greetingString, 'deposit', null, (err) => {
                    if (err) console.error('Error saving conversation:', err);
                });
                if (!res.headersSent) {
                    return res.json({ response: greetingString });
                }
                return;
            }
            // If from pre-query, continue with normal flow (don't return here)
        }
        
        // Gather all available information from all messages AND conversation history
        // CRITICAL: Check BOTH current messages AND full history to handle all scenarios:
        // 1. Order number provided AFTER receipt (receipt first, then order number)
        // 2. Receipt provided AFTER order number (order number first, then receipt)
        // 3. Both provided at the same time
        const allMessagesText = allMessages.join(' ');
        
        // Extract order number from: current messages, latest message, OR full history
        const orderFromCurrent = agent.extractOrderNumber(allMessagesText) || agent.extractOrderNumber(latestMessage);
        const orderFromHistory = agent.extractOrderNumberFromHistory(conversationHistory);
        const finalOrderNumber = orderFromCurrent || orderFromHistory;
        
        // Check receipt from: current uploads (if any), OR full history
        // This handles: receipt uploaded now, OR receipt uploaded earlier
        const hasReceiptInHistory = agent.hasReceiptBeenUploaded(conversationHistory);
        const hasValidReceipt = agent.hasValidReceipt(conversationHistory);
        
        // CRITICAL: Log what we found for debugging
        console.log(`[Adaptive Detection] Order number - Current: ${orderFromCurrent || 'none'}, History: ${orderFromHistory || 'none'}, Final: ${finalOrderNumber || 'none'}`);
        console.log(`[Adaptive Detection] Receipt - In History: ${hasReceiptInHistory}, Valid: ${hasValidReceipt}`);
        
        // Enhanced password detection - check for password in all messages
        const passwordPatterns = [
            /password[:\s]*([A-Z0-9]{3,})/i,
            /pdf[:\s]*password[:\s]*([A-Z0-9]{3,})/i,
            /pass[:\s]*([A-Z0-9]{3,})/i,
            /pwd[:\s]*([A-Z0-9]{3,})/i,
            // Also check for simple password patterns (just numbers/letters after "password:")
            /^password[:\s]*([a-z0-9]{3,})$/i,
            /^pass[:\s]*([a-z0-9]{3,})$/i
        ];
        
        let passwordProvided = false;
        for (const msg of allMessages) {
            // Check if message is just a password (common pattern: "password: 123123123123")
            const trimmedMsg = msg.trim();
            for (const pattern of passwordPatterns) {
                const match = trimmedMsg.match(pattern);
                if (match && match[1]) {
                    const foundPassword = match[1].trim();
                    // Validate password (at least 3 characters, reasonable max length)
                    if (foundPassword.length >= 3 && foundPassword.length <= 50) {
                    passwordProvided = true;
                        console.log(`[Password Detection] ✅ Password found in message: "${foundPassword.substring(0, 3)}***"`);
                    // Find any pending files for this user and update password
                    for (const [key, storage] of pendingFiles.entries()) {
                        if (key.startsWith(userId + '_') && !storage.password) {
                            storage.password = foundPassword;
                            console.log(`[Password Update] Updated password from chat message for storage key: ${key}`);
                        }
                    }
                    break;
                    }
                }
            }
            // Also check if message is just a password (no label, just alphanumeric)
            if (!passwordProvided && /^[a-z0-9]{3,20}$/i.test(trimmedMsg)) {
                // Check if we're in file tracking mode (waiting for password)
                const wasAskedForPDF = conversationHistory.some(h => 
                    h.role === 'assistant' && 
                    h.message && 
                    typeof h.message === 'string' &&
                    (h.message.includes('PDF password') || h.message.includes('PDF पासवर्ड') || h.message.includes('PDF పాస్వర్డ్'))
                );
                if (wasAskedForPDF) {
                    passwordProvided = true;
                    console.log(`[Password Detection] ✅ Password detected (standalone): "${trimmedMsg.substring(0, 3)}***"`);
                    for (const [key, storage] of pendingFiles.entries()) {
                        if (key.startsWith(userId + '_') && !storage.password) {
                            storage.password = trimmedMsg;
                            console.log(`[Password Update] Updated password (standalone) for storage key: ${key}`);
                        }
                    }
                }
            }
            if (passwordProvided) break;
        }
        
        // Build context with available data
        // CRITICAL: Always check full history, not just current message
        // This ensures we detect information regardless of when it was provided
        let additionalContext = {
            orderNumber: finalOrderNumber || null,
            hasReceipt: hasReceiptInHistory || hasValidReceipt, // Use both checks for robustness
            passwordProvided: passwordProvided,
            fileType: passwordProvided ? 'password' : null,
            // Add flags to indicate what was found and where
            orderNumberFoundIn: orderFromCurrent ? 'current' : (orderFromHistory ? 'history' : 'none'),
            receiptFoundIn: hasReceiptInHistory ? 'history' : 'none',
            // CRITICAL: If password is provided, mark that we're in file tracking mode
            isFileUploadTracking: passwordProvided || false,
            waitingForPDFAndVideo: passwordProvided || false // If password provided, we're likely waiting for files
        };
        
        // Debug: Log context
        console.log('[Deposit Flow] Context:', {
            orderNumber: finalOrderNumber,
            hasReceipt: hasReceiptInHistory,
            latestMessage: latestMessage ? latestMessage.substring(0, 50) : 'N/A',
            allMessagesCount: allMessages.length
        });
        
        // Determine issue type from latest message or combined messages
        let issueType = agent.classifyIssue(latestMessage, language);
        // If multiple messages, also check combined text
        if (hasMultipleMessages) {
            const combinedIssueType = agent.classifyIssue(combinedMessages, language);
            if (combinedIssueType !== 'general') {
                issueType = combinedIssueType;
            }
        }
        
        // If order number is provided and we're in a deposit conversation context, force issue type to deposit
        // Check conversation history for deposit-related messages
        const hasDepositContext = conversationHistory.some(msg => {
            const msgText = (msg.message || '').toLowerCase();
            return msgText.includes('deposit') || 
                   msgText.includes('जमा') || 
                   msgText.includes('జమ') ||
                   msgText.includes('জমা') ||
                   msgText.includes('ஜமா') ||
                   (msg.role === 'assistant' && msg.message && msg.message.toLowerCase().includes('deposit')) ||
                   (msg.role === 'assistant' && msg.message && msg.message.toLowerCase().includes('order number'));
        });
        
        // If we have an order number and deposit context, treat as deposit
        // Also, if previous message was asking for order number, this is definitely a deposit concern
        if (finalOrderNumber && (issueType === 'deposit' || hasDepositContext)) {
            issueType = 'deposit';
        }
        
        // If order number starts with deposit prefix (s05, d05, p05), it's likely a deposit
        if (finalOrderNumber && /^(s05|d05|p05)/i.test(finalOrderNumber)) {
            issueType = 'deposit';
        }
        
        // For deposit concerns: Check database and receipt age
        if (issueType === 'deposit') {
            if (finalOrderNumber) {
                await new Promise((resolve) => {
                    agent.checkOrderNumberInDatabase(finalOrderNumber, (err, orderData) => {
                        if (!err && orderData) {
                            additionalContext.orderFound = orderData.found;
                            additionalContext.orderData = orderData.data || null;
                        } else {
                            // If error or no data, default to not found
                            additionalContext.orderFound = false;
                            additionalContext.orderData = null;
                        }
                        resolve();
                    });
                });
            }
            
            // Check receipt age if receipt is provided
            if (hasReceiptInHistory) {
                // CRITICAL: Check multiple sources for receipt date (OCR, order number, upload timestamp)
                let receiptDate = null;
                
                // Priority 1: Check receiptImageStorage for OCR date
                const receiptStorage = receiptImageStorage.get(userId);
                if (receiptStorage && receiptStorage.validation && receiptStorage.validation.foundDate) {
                    try {
                        // Parse OCR date (format: YYYY-MM-DD)
                        const ocrDateStr = receiptStorage.validation.foundDate;
                        const ocrDate = new Date(ocrDateStr + 'T00:00:00Z');
                        if (!isNaN(ocrDate.getTime())) {
                            receiptDate = ocrDate.toISOString();
                            console.log(`[Batched Chat] ✅ Using OCR date from receiptImageStorage: ${receiptDate}`);
                        }
                    } catch (e) {
                        console.log(`[Batched Chat] ⚠️ Error parsing OCR date: ${e.message}`);
                    }
                }
                
                // Priority 2: Extract date from order number if available
                if (!receiptDate && finalOrderNumber) {
                    const orderDate = agent.extractReceiptDate([], finalOrderNumber);
                    if (orderDate) {
                        receiptDate = orderDate;
                        console.log(`[Batched Chat] ✅ Using order number date: ${receiptDate}`);
                    }
                }
                
                // Priority 3: Fall back to conversation history extraction
                if (!receiptDate) {
                    receiptDate = agent.extractReceiptDate(conversationHistory, finalOrderNumber || additionalContext.orderNumber);
                    if (receiptDate) {
                        console.log(`[Batched Chat] ✅ Using date from conversation history: ${receiptDate}`);
                    }
                }
                
                // Calculate if receipt is old (> 2 days) and set in additionalContext
                if (receiptDate) {
                    const isOldReceipt = agent.isReceiptOlderThan2Days(receiptDate);
                    additionalContext.isOldReceipt = isOldReceipt;
                    
                    // Calculate days difference
                    const receipt = new Date(receiptDate);
                    const now = new Date();
                    const diffTime = Math.abs(now - receipt);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    additionalContext.receiptAgeDays = diffDays;
                    
                    console.log(`[Batched Chat] 📅 Receipt date: ${receiptDate}, Age: ${diffDays} days, IsOld: ${isOldReceipt}`);
                } else {
                    // No date detected - treat as recent (not old)
                    additionalContext.isOldReceipt = false;
                    additionalContext.receiptAgeDays = 0;
                    console.log(`[Batched Chat] ⚠️ No receipt date detected - treating as recent (not old)`);
                }
            }
            
            // CRITICAL: UNIFIED TELEGRAM SENDING - Handle ALL order scenarios in batched chat
            // This MUST run AFTER all receipt detection is complete and BEFORE generating response
            if (finalOrderNumber && issueType === 'deposit') {
                console.log(`[Unified Telegram] 🚀 BATCHED CHAT - Order: ${finalOrderNumber}, HasReceipt: ${hasReceiptInHistory}, IssueType: ${issueType}`);
                console.log(`[Unified Telegram] Receipt storage check - receiptImageStorage keys: ${Array.from(receiptImageStorage.keys()).join(', ') || 'NONE'}`);
                console.log(`[Unified Telegram] Receipt for userId: ${receiptImageStorage.has(userId) ? 'FOUND ✅' : 'NOT FOUND ❌'}`);
                
                // Extract receipt info and date (will be empty/null if no receipt)
                let receiptInfo = agent.extractReceiptInfo(conversationHistory);
                
                // CRITICAL FIX: Always check receiptImageStorage and merge missing fields
                // This handles the case where receipt was uploaded first, then order number provided later
                const receiptStorage = receiptImageStorage.get(userId);
                if (receiptStorage && receiptStorage.validation) {
                    if (!receiptInfo) {
                        console.log(`[Unified Telegram] ⚠️ receiptInfo missing, using validation from receiptImageStorage`);
                        receiptInfo = {
                            foundUPI: receiptStorage.validation.foundUPI || null,
                            foundUTR: receiptStorage.validation.foundUTR || null,
                            foundAmount: receiptStorage.validation.foundAmount || null,
                            foundDate: receiptStorage.validation.foundDate || null,
                            foundOrderNumber: receiptStorage.validation.foundOrderNumber || null,
                            isValid: receiptStorage.validation.isValid !== false
                        };
                    } else {
                        // Merge missing fields from receiptImageStorage
                        if (!receiptInfo.foundUPI && receiptStorage.validation.foundUPI) {
                            receiptInfo.foundUPI = receiptStorage.validation.foundUPI;
                            console.log(`[Unified Telegram] ✅ Merged UPI from receiptImageStorage: ${receiptInfo.foundUPI}`);
                        }
                        if (!receiptInfo.foundUTR && receiptStorage.validation.foundUTR) {
                            receiptInfo.foundUTR = receiptStorage.validation.foundUTR;
                            console.log(`[Unified Telegram] ✅ Merged UTR from receiptImageStorage: ${receiptInfo.foundUTR}`);
                        }
                        if (!receiptInfo.foundAmount && receiptStorage.validation.foundAmount) {
                            receiptInfo.foundAmount = receiptStorage.validation.foundAmount;
                        }
                        if (!receiptInfo.foundDate && receiptStorage.validation.foundDate) {
                            receiptInfo.foundDate = receiptStorage.validation.foundDate;
                        }
                        console.log(`[Unified Telegram] ✅ Merged validation data from receiptImageStorage`);
                    }
                }
                
                let receiptDate = null;
                let isOldReceipt = false;
                
                // CRITICAL FOR REVERSED FLOW: ALWAYS extract date from order number FIRST (most reliable)
                // Order number contains the actual transaction date, which is more reliable than upload timestamp
                if (finalOrderNumber) {
                    const orderDateMatch = finalOrderNumber.match(/^(s05|d05|p05)(\d{6})/i);
                    if (orderDateMatch) {
                        const dateStr = orderDateMatch[2]; // YYMMDD
                        const year = 2000 + parseInt(dateStr.substring(0, 2));
                        const month = parseInt(dateStr.substring(2, 4)) - 1;
                        const day = parseInt(dateStr.substring(4, 6));
                        const orderDate = new Date(year, month, day);
                        if (!isNaN(orderDate.getTime())) {
                            const now = new Date();
                            const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
                            if (orderDate <= oneYearFromNow && orderDate <= now) {
                                receiptDate = orderDate.toISOString();
                                console.log(`[Unified Telegram] ✅✅✅ PRIORITY: Using order number date: ${orderDate.toISOString()} (from order: ${finalOrderNumber})`);
                                console.log(`[Unified Telegram] Extracted date components: Year=${year}, Month=${month+1}, Day=${day}`);
                            } else {
                                console.log(`[Unified Telegram] ⚠️ Order date ${orderDate.toISOString()} is invalid (future date or too far ahead)`);
                            }
                        }
                    } else {
                        console.log(`[Unified Telegram] ⚠️ Order number ${finalOrderNumber} does not match date pattern (expected s05/d05/p05 + 6 digits)`);
                    }
                }
                
                // Get receipt date ONLY if receipt exists in history AND order number date not available
                if (hasReceiptInHistory && !receiptDate) {
                    // Get receipt date (OCR date first, then timestamp)
                    if (receiptInfo && receiptInfo.foundDate) {
                        try {
                            const ocrDate = new Date(receiptInfo.foundDate);
                            if (!isNaN(ocrDate.getTime())) {
                                receiptDate = ocrDate.toISOString();
                                console.log(`[Unified Telegram] Using OCR date from receipt: ${receiptDate}`);
                            }
                        } catch (e) {
                            // Ignore
                        }
                    }
                    
                    if (!receiptDate) {
                        receiptDate = agent.extractReceiptDate(conversationHistory, finalOrderNumber);
                        if (receiptDate) {
                            console.log(`[Unified Telegram] Using upload timestamp as fallback: ${receiptDate}`);
                        }
                    }
                }
                
                // Calculate if receipt is old (> 2 days)
                if (receiptDate) {
                    isOldReceipt = agent.isReceiptOlderThan2Days(receiptDate);
                    const receipt = new Date(receiptDate);
                    const now = new Date();
                    const diffTime = Math.abs(now - receipt);
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    console.log(`[Unified Telegram] 📅 Receipt date: ${receiptDate}, Age: ${diffDays} days, IsOld: ${isOldReceipt}`);
                } else {
                    console.log(`[Unified Telegram] ⚠️ No receipt date available - cannot determine if old`);
                }
                
                // CRITICAL: Check if all files are ready BEFORE calling sendReceiptToTelegramIfNeeded
                // If all files are ready, sendBatchFilesToTelegram will handle it (called from chat endpoint)
                // Don't send receipt photo alone if we're waiting for PDF/password/video
                const wasAskedForPDFAndVideo = conversationHistory.some(msg => 
                    msg.role === 'assistant' && 
                    msg.message && 
                    typeof msg.message === 'string' &&
                    (msg.message.includes('PDF bank statement') || 
                     msg.message.includes('PDF बैंक') || 
                     msg.message.includes('PDF బ్యాంక్') ||
                     msg.message.includes('video recording'))
                );
                
                // Check if all files are ready
                const filesInHistoryCheck = agent.checkFilesInHistory(conversationHistory);
                const storageKeyCheck = `${userId}_${finalOrderNumber}`;
                const pendingFileCheck = pendingFiles.get(storageKeyCheck);
                const hasPasswordInPending = pendingFileCheck && pendingFileCheck.password && pendingFileCheck.password.trim().length > 0;
                const hasAllFilesReady = filesInHistoryCheck.hasPDF && 
                                       filesInHistoryCheck.hasVideo && 
                                       (filesInHistoryCheck.hasPassword || hasPasswordInPending);
                
                if (wasAskedForPDFAndVideo && hasAllFilesReady) {
                    console.log(`[Unified Telegram] ✅✅✅ All files ready (PDF/password/video) - Calling sendBatchFilesToTelegram NOW from processBatchedChat`);
                    // CRITICAL: Actually call sendBatchFilesToTelegram here, don't just skip!
                    setImmediate(async () => {
                        try {
                            // Build files object for sendBatchFilesToTelegram
                            const files = {
                                pdfs: [],
                                videos: [],
                                images: [],
                                password: null
                            };
                            
                            // Get PDFs and videos from history
                            conversationHistory.forEach(msg => {
                                if (msg.role === 'user' && msg.fileType === 'pdf' && msg.buffer) {
                                    files.pdfs.push({ 
                                        buffer: msg.buffer,
                                        filename: msg.filename || 'document.pdf'
                                    });
                                    console.log(`[Batched Chat Telegram] ✅ Found PDF in history - buffer size: ${msg.buffer.length} bytes`);
                                }
                                if (msg.role === 'user' && msg.fileType === 'video' && msg.buffer) {
                                    files.videos.push({ 
                                        buffer: msg.buffer,
                                        filename: msg.filename || 'video.mp4'
                                    });
                                    console.log(`[Batched Chat Telegram] ✅ Found Video in history - buffer size: ${msg.buffer.length} bytes`);
                                }
                            });
                            
                            // CRITICAL: Get files from pendingFiles (PDFs/videos uploaded via /api/upload-receipt are stored there)
                            if (pendingFileCheck) {
                                if (pendingFileCheck.pdfs && pendingFileCheck.pdfs.length > 0) {
                                    console.log(`[Batched Chat Telegram] ✅ Found ${pendingFileCheck.pdfs.length} PDF(s) in pendingFiles`);
                                    pendingFileCheck.pdfs.forEach((pdf, idx) => {
                                        if (pdf.buffer) {
                                            const alreadyAdded = files.pdfs.some(f => 
                                                f.buffer && pdf.buffer && f.buffer.length === pdf.buffer.length
                                            );
                                            if (!alreadyAdded) {
                                                files.pdfs.push({
                                                    buffer: pdf.buffer,
                                                    filename: pdf.filename || 'document.pdf'
                                                });
                                                console.log(`[Batched Chat Telegram] ✅ Added PDF ${idx + 1} from pendingFiles`);
                                            }
                                        }
                                    });
                                }
                                
                                if (pendingFileCheck.videos && pendingFileCheck.videos.length > 0) {
                                    console.log(`[Batched Chat Telegram] ✅ Found ${pendingFileCheck.videos.length} video(s) in pendingFiles`);
                                    pendingFileCheck.videos.forEach((video, idx) => {
                                        if (video.buffer) {
                                            const alreadyAdded = files.videos.some(v => 
                                                v.buffer && video.buffer && v.buffer.length === video.buffer.length
                                            );
                                            if (!alreadyAdded) {
                                                files.videos.push({
                                                    buffer: video.buffer,
                                                    filename: video.filename || 'video.mp4'
                                                });
                                                console.log(`[Batched Chat Telegram] ✅ Added Video ${idx + 1} from pendingFiles`);
                                            }
                                        }
                                    });
                                }
                                
                                // Get password from pendingFiles
                                if (pendingFileCheck.password) {
                                    files.password = pendingFileCheck.password;
                                    console.log(`[Batched Chat Telegram] ✅ Password found in pendingFiles: ${files.password.substring(0, 3)}***`);
                                }
                            }
                            
                            // Get receipt image from receiptImageStorage
                            const receiptStorage = receiptImageStorage.get(userId);
                            if (receiptStorage && receiptStorage.buffer) {
                                files.images = [{ buffer: receiptStorage.buffer, validation: receiptStorage.validation }];
                                console.log(`[Batched Chat Telegram] ✅ Added receipt image from receiptImageStorage`);
                            }
                            
                            // Get password from history if not found in pendingFiles
                            if (!files.password) {
                                conversationHistory.forEach(msg => {
                                    if (msg.role === 'user' && msg.fileType === 'password') {
                                        files.password = msg.message || 'provided';
                                        console.log(`[Batched Chat Telegram] ✅ Password found via fileType in history`);
                                    } else if (msg.role === 'user' && msg.message) {
                                        const passwordMatch = msg.message.match(/password[:\s]*([A-Z0-9]{4,})/i);
                                        if (passwordMatch && passwordMatch[1]) {
                                            files.password = passwordMatch[1].trim();
                                            console.log(`[Batched Chat Telegram] ✅ Password found via pattern in history: ${files.password.substring(0, 3)}***`);
                                        }
                                    }
                                });
                            }
                            
                            console.log(`[Batched Chat Telegram] 📊📊📊 FINAL COUNT - PDFs: ${files.pdfs.length}, Videos: ${files.videos.length}, Images: ${files.images.length}, Password: ${files.password ? 'yes' : 'NO'}`);
                            
                            // CRITICAL: Verify all files are present before sending
                            if (files.pdfs.length > 0 && files.videos.length > 0 && files.password) {
                                console.log(`[Batched Chat Telegram] 🚀🚀🚀 ALL FILES VERIFIED - Executing sendBatchFilesToTelegram NOW...`);
                                await sendBatchFilesToTelegram(userId, files, finalOrderNumber);
                                
                                // Mark as sent and clear storage
                                const sentKey = `${userId}_${finalOrderNumber}`;
                                telegramSentReceipts.add(sentKey);
                                receiptImageStorage.delete(userId);
                                pendingFiles.delete(storageKeyCheck);
                                console.log(`[Batched Chat Telegram] ✅✅✅ Successfully sent all files to Telegram (including PDF with DPF Deposit format)`);
                            } else {
                                console.error(`[Batched Chat Telegram] ❌❌❌ Files not complete - PDF: ${files.pdfs.length}, Video: ${files.videos.length}, Password: ${files.password ? 'yes' : 'NO'}`);
                            }
                        } catch (error) {
                            console.error(`[Batched Chat Telegram] ❌❌❌ Error sending files to Telegram:`, error);
                            console.error(`[Batched Chat Telegram] Error stack:`, error.stack);
                        }
                    });
                } else {
                // CRITICAL: Check if all files are ready BEFORE calling sendReceiptToTelegramIfNeeded
                // If all files are ready, sendBatchFilesToTelegram will handle it (called from chat endpoint)
                // Don't send receipt photo alone if we're waiting for PDF/password/video
                const wasAskedForPDFAndVideoCheck = conversationHistory.some(msg => 
                    msg.role === 'assistant' && 
                    msg.message && 
                    typeof msg.message === 'string' &&
                    (msg.message.includes('PDF bank statement') || 
                     msg.message.includes('PDF बैंक') || 
                     msg.message.includes('PDF బ్యాంక్') ||
                     msg.message.includes('video recording'))
                );
                
                // Check if all files are ready
                const filesInHistoryCheck = agent.checkFilesInHistory(conversationHistory);
                const storageKeyCheck = `${userId}_${finalOrderNumber}`;
                const pendingFileCheck = pendingFiles.get(storageKeyCheck);
                const hasPasswordInPending = pendingFileCheck && pendingFileCheck.password && pendingFileCheck.password.trim().length > 0;
                const hasAllFilesReady = filesInHistoryCheck.hasPDF && 
                                       filesInHistoryCheck.hasVideo && 
                                       (filesInHistoryCheck.hasPassword || hasPasswordInPending);
                
                if (wasAskedForPDFAndVideoCheck && hasAllFilesReady) {
                    console.log(`[Unified Telegram] ✅✅✅ All files ready (PDF/password/video) - Calling sendBatchFilesToTelegram NOW from processBatchedChat`);
                    // CRITICAL: Actually call sendBatchFilesToTelegram here, don't just skip!
                    setImmediate(async () => {
                        try {
                            // Build files object for sendBatchFilesToTelegram
                            const files = {
                                pdfs: [],
                                videos: [],
                                images: [],
                                password: null
                            };
                            
                            // Get PDFs and videos from history
                            conversationHistory.forEach(msg => {
                                if (msg.role === 'user' && msg.fileType === 'pdf' && msg.buffer) {
                                    files.pdfs.push({ 
                                        buffer: msg.buffer,
                                        filename: msg.filename || 'document.pdf'
                                    });
                                    console.log(`[Batched Chat Telegram] ✅ Found PDF in history - buffer size: ${msg.buffer.length} bytes`);
                                }
                                if (msg.role === 'user' && msg.fileType === 'video' && msg.buffer) {
                                    files.videos.push({ 
                                        buffer: msg.buffer,
                                        filename: msg.filename || 'video.mp4'
                                    });
                                    console.log(`[Batched Chat Telegram] ✅ Found Video in history - buffer size: ${msg.buffer.length} bytes`);
                                }
                            });
                            
                            // CRITICAL: Get files from pendingFiles (PDFs/videos uploaded via /api/upload-receipt are stored there)
                            if (pendingFileCheck) {
                                if (pendingFileCheck.pdfs && pendingFileCheck.pdfs.length > 0) {
                                    console.log(`[Batched Chat Telegram] ✅ Found ${pendingFileCheck.pdfs.length} PDF(s) in pendingFiles`);
                                    pendingFileCheck.pdfs.forEach((pdf, idx) => {
                                        if (pdf.buffer) {
                                            const alreadyAdded = files.pdfs.some(f => 
                                                f.buffer && pdf.buffer && f.buffer.length === pdf.buffer.length
                                            );
                                            if (!alreadyAdded) {
                                                files.pdfs.push({
                                                    buffer: pdf.buffer,
                                                    filename: pdf.filename || 'document.pdf'
                                                });
                                                console.log(`[Batched Chat Telegram] ✅ Added PDF ${idx + 1} from pendingFiles`);
                                            }
                                        }
                                    });
                                }
                                
                                if (pendingFileCheck.videos && pendingFileCheck.videos.length > 0) {
                                    console.log(`[Batched Chat Telegram] ✅ Found ${pendingFileCheck.videos.length} video(s) in pendingFiles`);
                                    pendingFileCheck.videos.forEach((video, idx) => {
                                        if (video.buffer) {
                                            const alreadyAdded = files.videos.some(v => 
                                                v.buffer && video.buffer && v.buffer.length === video.buffer.length
                                            );
                                            if (!alreadyAdded) {
                                                files.videos.push({
                                                    buffer: video.buffer,
                                                    filename: video.filename || 'video.mp4'
                                                });
                                                console.log(`[Batched Chat Telegram] ✅ Added Video ${idx + 1} from pendingFiles`);
                                            }
                                        }
                                    });
                                }
                                
                                // Get password from pendingFiles
                                if (pendingFileCheck.password) {
                                    files.password = pendingFileCheck.password;
                                    console.log(`[Batched Chat Telegram] ✅ Password found in pendingFiles: ${files.password.substring(0, 3)}***`);
                                }
                            }
                            
                            // Get receipt image from receiptImageStorage
                            const receiptStorage = receiptImageStorage.get(userId);
                            if (receiptStorage && receiptStorage.buffer) {
                                files.images = [{ buffer: receiptStorage.buffer, validation: receiptStorage.validation }];
                                console.log(`[Batched Chat Telegram] ✅ Added receipt image from receiptImageStorage`);
                            }
                            
                            // Get password from history if not found in pendingFiles
                            if (!files.password) {
                                conversationHistory.forEach(msg => {
                                    if (msg.role === 'user' && msg.fileType === 'password') {
                                        files.password = msg.message || 'provided';
                                        console.log(`[Batched Chat Telegram] ✅ Password found via fileType in history`);
                                    } else if (msg.role === 'user' && msg.message) {
                                        const passwordMatch = msg.message.match(/password[:\s]*([A-Z0-9]{4,})/i);
                                        if (passwordMatch && passwordMatch[1]) {
                                            files.password = passwordMatch[1].trim();
                                            console.log(`[Batched Chat Telegram] ✅ Password found via pattern in history: ${files.password.substring(0, 3)}***`);
                                        }
                                    }
                                });
                            }
                            
                            console.log(`[Batched Chat Telegram] 📊📊📊 FINAL COUNT - PDFs: ${files.pdfs.length}, Videos: ${files.videos.length}, Images: ${files.images.length}, Password: ${files.password ? 'yes' : 'NO'}`);
                            
                            // CRITICAL: Verify all files are present before sending
                            if (files.pdfs.length > 0 && files.videos.length > 0 && files.password) {
                                console.log(`[Batched Chat Telegram] 🚀🚀🚀 ALL FILES VERIFIED - Executing sendBatchFilesToTelegram NOW...`);
                                await sendBatchFilesToTelegram(userId, files, finalOrderNumber);
                                
                                // Mark as sent and clear storage
                                const sentKey = `${userId}_${finalOrderNumber}`;
                                telegramSentReceipts.add(sentKey);
                                receiptImageStorage.delete(userId);
                                pendingFiles.delete(storageKeyCheck);
                                console.log(`[Batched Chat Telegram] ✅✅✅ Successfully sent all files to Telegram (including PDF with DPF Deposit format)`);
                            } else {
                                console.error(`[Batched Chat Telegram] ❌❌❌ Files not complete - PDF: ${files.pdfs.length}, Video: ${files.videos.length}, Password: ${files.password ? 'yes' : 'NO'}`);
                            }
                        } catch (error) {
                            console.error(`[Batched Chat Telegram] ❌❌❌ Error sending files to Telegram:`, error);
                            console.error(`[Batched Chat Telegram] Error stack:`, error.stack);
                        }
                    });
                } else {
                    console.log(`[Unified Telegram] 🚀 Calling sendReceiptToTelegramIfNeeded from BATCHED CHAT - Order: ${finalOrderNumber}, IsOld: ${isOldReceipt}, HasDate: ${!!receiptDate}, HasReceipt: ${hasReceiptInHistory}`);
                    
                    // Call unified function asynchronously (don't block response) - no delay needed
                    // Send whether receipt exists or not (order-only = "deposit not received")
                    setImmediate(async () => {
                        console.log(`[Unified Telegram] ⏰ Calling sendReceiptToTelegramIfNeeded from BATCHED CHAT now`);
                        await sendReceiptToTelegramIfNeeded(userId, finalOrderNumber, receiptInfo, receiptDate, isOldReceipt, conversationHistory);
                    });
                }
                }
            }
        } else {
            // For other issue types, just check database
            if (finalOrderNumber) {
                await new Promise((resolve) => {
                    agent.checkOrderNumberInDatabase(finalOrderNumber, (err, orderData) => {
                        if (!err && orderData) {
                            additionalContext.orderFound = orderData.found;
                            additionalContext.orderData = orderData.data || null;
                        } else {
                            // If error or no data, default to not found
                            additionalContext.orderFound = false;
                            additionalContext.orderData = null;
                        }
                        resolve();
                    });
                });
            }
        }
        
        // CRITICAL: Log additionalContext before generating response to verify isOldReceipt is set
        console.log(`[Batched Chat] 📋 additionalContext before response generation:`, {
            orderNumber: additionalContext.orderNumber,
            orderFound: additionalContext.orderFound,
            hasReceipt: additionalContext.hasReceipt,
            isOldReceipt: additionalContext.isOldReceipt,
            receiptAgeDays: additionalContext.receiptAgeDays
        });
        
        // CRITICAL: Ensure response is always generated
        // All responses go through template system
        // If multiple messages, pass context to generate comprehensive response
        try {
        if (hasMultipleMessages) {
            additionalContext.hasMultipleMessages = true;
            additionalContext.allMessages = allMessages;
            // Create a combined message context for AI
            const messageContext = `[MULTIPLE MESSAGES RECEIVED]\nThe customer sent ${allMessages.length} messages in quick succession:\n${allMessages.map((m, i) => `${i + 1}. "${m}"`).join('\n')}\n\nPlease provide a SINGLE comprehensive response that addresses all of these messages together.`;
            response = await agent.generateResponse(messageContext, issueType, userId, language, additionalContext);
        } else {
            response = await agent.generateResponse(latestMessage, issueType, userId, language, additionalContext);
            }
            
            // CRITICAL: Check if this response is identical to ANY of the last 5 responses (prevent duplicate)
            // Check BEFORE saving to history to prevent duplicate sends
            const history = agent.conversationHistory.get(userId) || [];
            const lastAssistantMessages = history.filter(h => h.role === 'assistant').slice(-5); // Check last 5 messages
            
            // Pass recent messages to OpenAI for context (if using OpenAI)
            if (additionalContext && lastAssistantMessages.length > 0) {
                additionalContext._recentAssistantMessages = lastAssistantMessages.map(msg => ({
                    message: msg.message || '',
                    timestamp: msg.timestamp || null
                }));
            }
            
            if (response && typeof response === 'string') {
                const currentResponseText = response.trim();
                
                // Check if current response matches any of the last 5 responses
                const isDuplicate = lastAssistantMessages.some(msg => {
                    if (!msg.message) return false;
                    const msgText = msg.message.trim();
                    // Exact match - must be identical
                    if (msgText === currentResponseText && msgText.length > 10) {
                        return true;
                    }
                    // Also check for very similar responses (90% similarity for long messages)
                    if (msgText.length > 50 && currentResponseText.length > 50) {
                        const similarity = calculateSimilarity(msgText, currentResponseText);
                        if (similarity > 0.9) {
                            return true;
                        }
                    }
                    return false;
                });
                
                // CRITICAL: If duplicate detected, generate a DIFFERENT response using OpenAI
                if (isDuplicate) {
                    console.log(`[Duplicate Detection] ⚠️ Response identical to recent message - generating varied response via OpenAI`);
                    
                    // Force OpenAI to generate a varied response
                    if (agent.openaiClient && agent.assistantId && agent.checkCircuitBreaker()) {
                        try {
                            // Add explicit instruction to vary the response
                            const variedContext = {
                                ...additionalContext,
                                _forceVariedResponse: true,
                                _lastResponse: currentResponseText,
                                _instruction: "The customer just sent a follow-up message. Generate a DIFFERENT, varied response that acknowledges their message but uses different words and phrasing. Do NOT repeat the previous response."
                            };
                            
                            const variedResponse = await agent.generateOpenAIResponse(
                                hasMultipleMessages ? messageContext : latestMessage,
                                issueType,
                                userId,
                                language,
                                variedContext,
                                {}
                            );
                            
                            if (variedResponse && typeof variedResponse === 'string' && variedResponse.trim().length > 0) {
                                const variedText = variedResponse.trim();
                                // Check if varied response is also a duplicate
                                const stillDuplicate = lastAssistantMessages.some(msg => {
                                    if (!msg.message) return false;
                                    return msg.message.trim() === variedText || calculateSimilarity(msg.message.trim(), variedText) > 0.9;
                                });
                                
                                if (!stillDuplicate) {
                                    response = variedResponse;
                                    console.log(`[Duplicate Detection] ✅ Generated varied response via OpenAI`);
                                } else {
                                    // Still duplicate - use fallback
                                    console.log(`[Duplicate Detection] ⚠️ Varied response still duplicate, using fallback`);
                                    if (language === 'english') {
                                        response = 'I understand your concern. Our team is currently reviewing your deposit request. I will keep you updated on the progress. Thank you for your patience.';
                                    } else if (language === 'hindi') {
                                        response = 'मैं आपकी चिंता समझता हूं। हमारी टीम वर्तमान में आपके जमा अनुरोध की समीक्षा कर रही है। मैं आपको प्रगति पर अपडेट रखूंगा। आपके धैर्य के लिए धन्यवाद।';
                                    } else if (language === 'telugu') {
                                        response = 'నేను మీ ఆందోళనను అర్థం చేసుకుంటున్నాను. మా బృందం ప్రస్తుతం మీ జమ అభ్యర్థనను సమీక్షిస్తోంది. నేను మీకు పురోగతిపై నవీకరణలు అందిస్తాను. మీ ఓర్పుకు ధన్యవాదాలు.';
                                    }
                                }
                            }
                        } catch (error) {
                            console.error(`[Duplicate Detection] Error generating varied response:`, error.message);
                            // Use fallback
                            if (language === 'english') {
                                response = 'I understand your concern. Our team is currently reviewing your deposit request. I will keep you updated on the progress. Thank you for your patience.';
                            } else if (language === 'hindi') {
                                response = 'मैं आपकी चिंता समझता हूं। हमारी टीम वर्तमान में आपके जमा अनुरोध की समीक्षा कर रही है। मैं आपको प्रगति पर अपडेट रखूंगा। आपके धैर्य के लिए धन्यवाद।';
                            } else if (language === 'telugu') {
                                response = 'నేను మీ ఆందోళనను అర్థం చేసుకుంటున్నాను. మా బృందం ప్రస్తుతం మీ జమ అభ్యర్థనను సమీక్షిస్తోంది. నేను మీకు పురోగతిపై నవీకరణలు అందిస్తాను. మీ ఓర్పుకు ధన్యవాదాలు.';
                            }
                        }
                    } else {
                        // OpenAI not available - use fallback
                        if (language === 'english') {
                            response = 'I understand your concern. Our team is currently reviewing your deposit request. I will keep you updated on the progress. Thank you for your patience.';
                        } else if (language === 'hindi') {
                            response = 'मैं आपकी चिंता समझता हूं। हमारी टीम वर्तमान में आपके जमा अनुरोध की समीक्षा कर रही है। मैं आपको प्रगति पर अपडेट रखूंगा। आपके धैर्य के लिए धन्यवाद।';
                        } else if (language === 'telugu') {
                            response = 'నేను మీ ఆందోళనను అర్థం చేసుకుంటున్నాను. మా బృందం ప్రస్తుతం మీ జమ అభ్యర్థనను సమీక్షిస్తోంది. నేను మీకు పురోగతిపై నవీకరణలు అందిస్తాను. మీ ఓర్పుకు ధన్యవాదాలు.';
                        }
                    }
                }
                
                // CRITICAL: Final check - if response is STILL a duplicate after all attempts, prevent sending
                if (response && typeof response === 'string') {
                    const finalResponseText = response.trim();
                    const finalDuplicateCheck = lastAssistantMessages.some(msg => {
                        if (!msg.message) return false;
                        const msgText = msg.message.trim();
                        return msgText === finalResponseText && msgText.length > 10;
                    });
                    
                    if (finalDuplicateCheck) {
                        console.log(`[Duplicate Prevention] 🚫 BLOCKING duplicate response from being sent`);
                        // Return a completely different message
                        if (language === 'english') {
                            response = 'Thank you for your message. Everything is being processed correctly. Our team is reviewing all your documents thoroughly. You don\'t need to do anything else right now - just sit back and relax.';
                        } else if (language === 'hindi') {
                            response = 'आपके संदेश के लिए धन्यवाद। सब कुछ सही तरीके से प्रसंस्करण किया जा रहा है। हमारी टीम आपके सभी दस्तावेजों की समीक्षा कर रही है। आपको अभी और कुछ करने की आवश्यकता नहीं है - बस आराम करें।';
                        } else if (language === 'telugu') {
                            response = 'మీ సందేశానికి ధన్యవాదాలు. ప్రతిదీ సరిగ్గా ప్రాసెస్ చేయబడుతోంది. మా బృందం మీ అన్ని పత్రాలను సమీక్షిస్తోంది. మీరు ఇప్పుడు మరేమీ చేయవలసిన అవసరం లేదు - కేవలం విశ్రాంతి తీసుకోండి.';
                        }
                    }
                }
                
                if (isDuplicate) {
                    console.log(`[Duplicate Detection] ⚠️ Response identical to recent message, generating varied response`);
                    // Generate a different response for follow-up messages
                    if (issueType === 'deposit' && additionalContext.hasReceipt) {
                        if (language === 'english') {
                            response = 'I understand your concern. Our team is currently reviewing your deposit request. I will keep you updated on the progress. Thank you for your patience.';
                        } else if (language === 'hindi') {
                            response = 'मैं आपकी चिंता समझता हूं। हमारी टीम वर्तमान में आपके जमा अनुरोध की समीक्षा कर रही है। मैं आपको प्रगति पर अपडेट रखूंगा। आपके धैर्य के लिए धन्यवाद।';
                        } else if (language === 'telugu') {
                            response = 'నేను మీ ఆందోళనను అర్థం చేసుకుంటున్నాను. మా బృందం ప్రస్తుతం మీ జమ అభ్యర్థనను సమీక్షిస్తోంది. నేను మీకు పురోగతిపై నవీకరణలు అందిస్తాను. మీ ఓర్పుకు ధన్యవాదాలు.';
                        }
                    } else {
                        // For other cases, generate a simple acknowledgment
                        if (language === 'english') {
                            response = 'I received your message. Thank you for your patience. Our team is working on your request.';
                        } else if (language === 'hindi') {
                            response = 'मैंने आपका संदेश प्राप्त कर लिया है। आपके धैर्य के लिए धन्यवाद। हमारी टीम आपके अनुरोध पर काम कर रही है।';
                        } else if (language === 'telugu') {
                            response = 'నేను మీ సందేశాన్ని స్వీకరించాను. మీ ఓర్పుకు ధన్యవాదాలు. మా బృందం మీ అభ్యర్థనపై పని చేస్తోంది.';
                        }
                    }
                    
                    // CRITICAL: Check again after generating varied response to prevent infinite loop
                    const variedResponseText = response.trim();
                    const stillDuplicate = lastAssistantMessages.some(msg => {
                        if (!msg.message) return false;
                        return msg.message.trim() === variedResponseText;
                    });
                    
                    if (stillDuplicate) {
                        // If still duplicate, use a completely different response
                        console.log(`[Duplicate Detection] ⚠️ Varied response still duplicate, using fallback`);
                        if (language === 'english') {
                            response = 'Thank you for your message. Everything is being processed correctly. Our team is reviewing all your documents thoroughly. You don\'t need to do anything else right now - just sit back and relax.';
                        } else if (language === 'hindi') {
                            response = 'आपके संदेश के लिए धन्यवाद। सब कुछ सही तरीके से प्रसंस्करण किया जा रहा है। हमारी टीम आपके सभी दस्तावेजों की समीक्षा कर रही है। आपको अभी और कुछ करने की आवश्यकता नहीं है - बस आराम करें।';
                        } else if (language === 'telugu') {
                            response = 'మీ సందేశానికి ధన్యవాదాలు. ప్రతిదీ సరిగ్గా ప్రాసెస్ చేయబడుతోంది. మా బృందం మీ అన్ని పత్రాలను సమీక్షిస్తోంది. మీరు ఇప్పుడు మరేమీ చేయవలసిన అవసరం లేదు - కేవలం విశ్రాంతి తీసుకోండి.';
                        }
                    }
                }
            }
            
            // CRITICAL: Ensure response is always valid
            if (!response || typeof response !== 'string' || response.trim().length === 0) {
                console.error('[Batched Chat] ⚠️ Response is empty, generating fallback');
                // Generate context-aware fallback
                if (passwordProvided) {
                    response = 'Thank you for providing the password. I have received it. Our team is reviewing all your documents.';
                } else if (issueType === 'deposit') {
                    response = 'Thank you for your message. I appreciate your patience. How can I assist you further?';
                } else {
                    response = 'Thank you for contacting Yono777 customer service. How can I assist you today?';
                }
            }
        } catch (responseError) {
            console.error('[Batched Chat] Error generating response:', responseError.message);
            // Generate context-aware fallback
            if (passwordProvided) {
                response = 'Thank you for providing the password. I have received it. Our team is reviewing all your documents.';
            } else if (issueType === 'deposit') {
                response = 'Thank you for your message. I appreciate your patience. How can I assist you further?';
            } else {
                response = 'Thank you for contacting Yono777 customer service. How can I assist you today?';
            }
        }
        
        // Save conversation
        if (!agent.conversationHistory.has(userId)) {
            agent.conversationHistory.set(userId, []);
        }
        // Save all user messages to history
        allMessages.forEach(msg => {
            agent.conversationHistory.get(userId).push({ role: 'user', message: msg });
        });
        agent.conversationHistory.get(userId).push({ role: 'assistant', message: response });
        
        const category = agent.classifyIssue(latestMessage, language);
        // Save combined messages to database
        dbHelpers.addConversation(userId, combinedMessages, response, category, null, (err) => {
            if (err) console.error('Error saving conversation:', err);
        });
        
        if (!res.headersSent) {
            // Send response in format client expects
            console.log(`[Message Batching] ✅ Sending SINGLE response for ${allMessages.length} batched message(s)`);
            res.json({ 
                response: response,
                message: response
            });
        } else {
            console.log(`[Message Batching] ⚠️ Response already sent - headers already sent`);
        }
    } catch (error) {
        console.error('Error processing batched chat:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    } finally {
        // CRITICAL: Remove processing flag after batch is complete
        // Add a shorter delay to prevent immediate new batches from starting (reduced from 3s to 1s for faster response)
        // This ensures if user sends more messages right after, they get merged into next batch
        setTimeout(() => {
            processingBatches.delete(userId);
            console.log(`[Message Batching] ✅ Batch processing complete for user ${userId} - flag removed (1 second cooldown)`);
            
            // CRITICAL: After cooldown, check if there are any pending messages
            // If yes, wait for normal batching window (800ms) to collect more messages before processing
            const pendingAfterCooldown = pendingChatRequests.get(userId);
            if (pendingAfterCooldown && pendingAfterCooldown.messages.length > 0) {
                console.log(`[Message Batching] Found ${pendingAfterCooldown.messages.length} pending message(s) after cooldown - waiting 300ms to collect more before processing`);
                // Clear any existing timer
                if (pendingAfterCooldown.timer) {
                    clearTimeout(pendingAfterCooldown.timer);
                }
                // Wait normal batching window (300ms) to collect more messages before processing (reduced for faster response)
                pendingAfterCooldown.timer = setTimeout(() => {
                    processBatchedChat(userId);
                }, 300);
            }
        }, 3000); // 3 second cooldown to prevent rapid consecutive batches
    }
}

// Enhanced input validation and sanitization helper
function validateAndSanitizeInput(input, type = 'string', maxLength = 10000) {
    if (!input) return null;
    
    if (type === 'string') {
        const sanitized = String(input).trim();
        if (sanitized.length === 0) return null;
        if (sanitized.length > maxLength) {
            console.warn(`[Validation] Input truncated from ${sanitized.length} to ${maxLength} characters`);
            return sanitized.substring(0, maxLength);
        }
        // Basic XSS prevention - remove script tags and dangerous patterns
        return sanitized
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
    }
    
    if (type === 'userId') {
        const sanitized = String(input).trim();
        // UserId should be alphanumeric with underscores and hyphens
        if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
            return null;
        }
        if (sanitized.length > 255) {
            return sanitized.substring(0, 255);
        }
        return sanitized;
    }
    
    return input;
}

// Rate limiting - simple in-memory store (for production, use Redis)
const rateLimitStore = new Map();
const RATE_LIMIT = {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute per user
    cleanupInterval: 5 * 60 * 1000 // Clean up every 5 minutes
};

function checkRateLimit(userId) {
    const now = Date.now();
    const userLimit = rateLimitStore.get(userId) || { count: 0, resetTime: now + RATE_LIMIT.windowMs };
    
    if (now > userLimit.resetTime) {
        // Reset window
        userLimit.count = 0;
        userLimit.resetTime = now + RATE_LIMIT.windowMs;
    }
    
    if (userLimit.count >= RATE_LIMIT.maxRequests) {
        return false; // Rate limit exceeded
    }
    
    userLimit.count++;
    rateLimitStore.set(userId, userLimit);
    return true; // Within rate limit
}

// Cleanup old rate limit entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [userId, limit] of rateLimitStore.entries()) {
        if (now > limit.resetTime + RATE_LIMIT.cleanupInterval) {
            rateLimitStore.delete(userId);
        }
    }
}, RATE_LIMIT.cleanupInterval);

// Chat endpoint - Enhanced with validation, rate limiting, and error handling
app.post('/api/chat', async (req, res) => {
    const requestStartTime = Date.now();
    try {
        // Input validation and sanitization
        const rawMessage = req.body.message;
        const rawUserId = req.body.userId;
        
        if (!rawMessage || !rawUserId) {
            return res.status(400).json({ 
                error: 'Message and userId are required',
                code: 'MISSING_PARAMS'
            });
        }
        
        const message = validateAndSanitizeInput(rawMessage, 'string', 10000);
        const userId = validateAndSanitizeInput(rawUserId, 'userId');
        
        if (!message || !userId) {
            return res.status(400).json({ 
                error: 'Invalid message or userId format',
                code: 'INVALID_INPUT'
            });
        }
        
        // CRITICAL: MESSAGE BATCHING - Collect multiple messages and process together
        // This ensures we read ALL messages, analyze them together, and send ONE response
        // ALL checks (offensive content, duplicates) will happen AFTER batching in processBatchedChat
        
        // CRITICAL: Check if a batch is currently being processed
        // If yes, add message to pending queue (don't create new batch yet)
        if (processingBatches.has(userId)) {
            console.log(`[Message Batching] ⚠️ Batch already processing - adding message to pending queue`);
            // Check if there's already a pending batch waiting
            const existingPending = pendingChatRequests.get(userId);
            if (existingPending) {
                // Add to existing pending batch
                existingPending.messages.push({ message, timestamp: Date.now() });
                console.log(`[Message Batching] Added to pending batch. Total pending: ${existingPending.messages.length}`);
                // Update the response object to the latest one (in case of multiple requests)
                existingPending.res = res;
                // Don't set a timer here - it will be set after current batch completes (in finally block)
            } else {
                // Create new pending batch that will be processed after current one completes
                pendingChatRequests.set(userId, {
                    res: res,
                    messages: [{ message, timestamp: Date.now() }],
                    timer: null
                });
                console.log(`[Message Batching] Created new pending batch (will process after current batch completes + cooldown)`);
            }
            // Don't process yet - wait for current batch to complete
            return;
        }
        
        // Check if there's an existing pending batch (not currently processing)
        const existingPending = pendingChatRequests.get(userId);
        
        if (existingPending) {
            // Add this message to the existing batch
            existingPending.messages.push({ message, timestamp: Date.now() });
            console.log(`[Message Batching] Added message to batch. Total messages in batch: ${existingPending.messages.length}`);
            
            // Reset the timer - wait for more messages
            if (existingPending.timer) {
                clearTimeout(existingPending.timer);
            }
            
            // Wait 800ms for more messages before processing
            existingPending.timer = setTimeout(() => {
                processBatchedChat(userId);
            }, 300);
            
            // Don't process yet - wait for batch
            return;
        }
        
        // Rate limiting
        if (!checkRateLimit(userId)) {
            console.warn(`[Rate Limit] User ${userId} exceeded rate limit`);
            return res.status(429).json({ 
                error: 'Too many requests. Please wait a moment before trying again.',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: 60
            });
        }
        
        await new Promise((resolve) => {
            dbHelpers.getOrCreateUser(userId, 'english', (err) => {
                if (err) console.error('Error getting/creating user:', err);
                resolve();
            });
        });
        
        // CRITICAL: Start batching - create new pending request
        // This collects all messages sent within 800ms and processes them together
        pendingChatRequests.set(userId, {
            res: res,
            messages: [{ message, timestamp: Date.now() }],
            timer: null
        });
        
        console.log(`[Message Batching] Started new batch for user ${userId} - waiting 300ms for more messages`);
        
        // Wait 300ms to collect more messages before processing (reduced from 800ms for faster response)
        // This ensures we read ALL messages, analyze them together, and send ONE response
        const timer = setTimeout(() => {
            console.log(`[Message Batching] Timer expired - processing batch for user ${userId}`);
            processBatchedChat(userId);
        }, 300);
        
        pendingChatRequests.get(userId).timer = timer;
        
        // CRITICAL: Don't process immediately - return and wait for batch timer
        // The processBatchedChat function will handle the response
        // All the processing logic is now handled by processBatchedChat
        return;
        if (conversationHistory.length === 0) {
            conversationHistory = await new Promise((resolve) => {
                dbHelpers.getConversationHistory(userId, 500, (err, history) => {
                    if (err) {
                        console.error('Error loading conversation history:', err);
                        resolve([]);
                    } else {
                        const formattedHistory = (history || []).map(h => ({
                            role: 'user',
                            message: h.userMessage,
                            timestamp: h.timestamp,
                            fileType: h.fileType || null
                        })).concat((history || []).map(h => ({
                            role: 'assistant',
                            message: h.botResponse,
                            timestamp: h.timestamp
                        })));
                        agent.conversationHistory.set(userId, formattedHistory);
                        resolve(formattedHistory);
                    }
                });
            });
        } else {
            // CRITICAL: Get FRESH in-memory history FIRST before loading from database
            // This ensures we don't lose receipts that were just uploaded
            const freshInMemoryBeforeDB = agent.conversationHistory.get(userId) || [];
            console.log(`[History Load] 🔥 FRESH in-memory BEFORE DB load - length: ${freshInMemoryBeforeDB.length}`);
            console.log(`[History Load] 🔥 FRESH in-memory contents:`, freshInMemoryBeforeDB.map((h, idx) => ({
                idx,
                role: h.role,
                message: (h.message && typeof h.message === 'string') ? h.message.substring(0, 50) : 'no message',
                fileType: h.fileType,
                hasFileType: !!h.fileType
            })));
            
            // Check for receipt in fresh in-memory BEFORE loading from DB
            const receiptInFreshMemory = freshInMemoryBeforeDB.some(h => 
                h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video')
            );
            console.log(`[History Load] 🔥 Receipt in fresh in-memory BEFORE DB load: ${receiptInFreshMemory}`);
            
            // Merge in-memory history with database history to ensure we have both
            const dbHistory = await new Promise((resolve) => {
                dbHelpers.getConversationHistory(userId, 500, (err, history) => {
                    if (err) {
                        console.error('Error loading conversation history:', err);
                        resolve([]);
                    } else {
                        const formattedHistory = (history || []).map(h => ({
                            role: 'user',
                            message: h.userMessage,
                            timestamp: h.timestamp,
                            fileType: h.fileType || null
                        })).concat((history || []).map(h => ({
                            role: 'assistant',
                            message: h.botResponse,
                            timestamp: h.timestamp
                        })));
                        console.log(`[History Load] DB history loaded - length: ${formattedHistory.length}, with fileType: ${formattedHistory.filter(h => h.fileType).length}`);
                        resolve(formattedHistory);
                    }
                });
            });
            
            // CRITICAL: Use FRESH in-memory history, not the potentially stale conversationHistory variable
            // The conversationHistory variable might have been set to DB history in the first branch
            const actualInMemoryHistory = agent.conversationHistory.get(userId) || [];
            console.log(`[History Merge] Starting merge - in-memory: ${actualInMemoryHistory.length}, DB: ${dbHistory.length}`);
            console.log(`[History Merge] Using actual in-memory history (not conversationHistory variable)`);
            const hasReceiptInMemory = actualInMemoryHistory.some(h => h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video'));
            const hasReceiptInDB = dbHistory.some(h => h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video'));
            console.log(`[History Merge] Receipt check - in-memory: ${hasReceiptInMemory}, DB: ${hasReceiptInDB}`);
            
            // Merge: in-memory history takes precedence (has fileType), then add DB history
            // CRITICAL: Prioritize in-memory history for fileType info, but merge chronologically
            // CRITICAL: In-memory history MUST be checked first for receipt detection
            // CRITICAL: Use actualInMemoryHistory, not conversationHistory variable
            const mergedHistory = [...actualInMemoryHistory]; // Start with in-memory (has fileType)
            
            // Check for receipts in in-memory history FIRST (before merge)
            const receiptInMemoryBeforeMerge = mergedHistory.some(h => 
                h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video')
            );
            if (receiptInMemoryBeforeMerge) {
                console.log(`[History Merge] ✅ Receipt found in in-memory history BEFORE merge - this will be preserved`);
            }
            
            for (const dbMsg of dbHistory) {
                // Only add if not already in in-memory history (check by message content and role)
                // CRITICAL: If in-memory has fileType, preserve it even if DB message matches
                const memMsgMatch = mergedHistory.find(memMsg => 
                    memMsg.message === dbMsg.message && 
                    memMsg.role === dbMsg.role &&
                    Math.abs(new Date(memMsg.timestamp || 0) - new Date(dbMsg.timestamp || 0)) < 5000 // Within 5 seconds
                );
                
                if (memMsgMatch) {
                    // Message exists in both - preserve in-memory version (has fileType)
                    if (memMsgMatch.fileType && !dbMsg.fileType) {
                        // Keep in-memory version with fileType, don't add DB version
                        continue;
                    }
                } else {
                    // Message doesn't exist in memory, add from DB
                    mergedHistory.push(dbMsg);
                }
            }
            // Sort by timestamp to maintain chronological order
            mergedHistory.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
            
            // CRITICAL: Verify receipt is still in merged history
            const receiptInMerged = mergedHistory.some(h => 
                h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video')
            );
            console.log(`[History Merge] After merge - Receipt in merged history: ${receiptInMerged}`);
            if (hasReceiptInMemory && !receiptInMerged) {
                console.log(`[History Merge] ⚠️⚠️⚠️ WARNING: Receipt was in in-memory but LOST during merge! Restoring...`);
                // Find receipt from original in-memory history
                const receiptFromMemory = actualInMemoryHistory.find(h => 
                    h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video')
                );
                if (receiptFromMemory) {
                    // Check if it exists without fileType
                    const existsWithoutFileType = mergedHistory.some(h => 
                        h.role === 'user' && 
                        h.message === receiptFromMemory.message &&
                        !h.fileType
                    );
                    if (existsWithoutFileType) {
                        // Update existing message
                        const msgToUpdate = mergedHistory.find(h => 
                            h.role === 'user' && 
                            h.message === receiptFromMemory.message &&
                            !h.fileType
                        );
                        if (msgToUpdate) {
                            msgToUpdate.fileType = receiptFromMemory.fileType;
                            console.log(`[History Merge] ✅ Restored fileType to existing message`);
                        }
                    } else {
                        // Add receipt message
                        mergedHistory.push(receiptFromMemory);
                        console.log(`[History Merge] ✅ Restored receipt message from in-memory`);
                    }
                }
            }
            
            conversationHistory = mergedHistory;
            agent.conversationHistory.set(userId, conversationHistory);
            
            const hasReceiptAfterMerge = conversationHistory.some(h => h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video'));
            console.log(`[History Merge] After merge - total: ${conversationHistory.length}, hasReceipt: ${hasReceiptAfterMerge}`);
            
            // CRITICAL: If receipt was in memory but lost during merge, restore it
            if (receiptInMemoryBeforeMerge && !hasReceiptAfterMerge) {
                console.log(`[History Merge] ⚠️ WARNING: Receipt was in memory but lost during merge! Restoring from original in-memory...`);
                const originalInMemory = agent.conversationHistory.get(userId) || [];
                const receiptFromOriginal = originalInMemory.find(h => 
                    h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video')
                );
                if (receiptFromOriginal) {
                    // Check if it's already in merged history (might have lost fileType)
                    const existsWithoutFileType = conversationHistory.some(h => 
                        h.role === 'user' && 
                        h.message === receiptFromOriginal.message &&
                        !h.fileType
                    );
                    if (existsWithoutFileType) {
                        // Update existing message to include fileType
                        const msgToUpdate = conversationHistory.find(h => 
                            h.role === 'user' && 
                            h.message === receiptFromOriginal.message &&
                            !h.fileType
                        );
                        if (msgToUpdate) {
                            msgToUpdate.fileType = receiptFromOriginal.fileType;
                            console.log(`[History Merge] ✅ Restored fileType to existing message`);
                        }
                    } else {
                        // Add receipt message if it doesn't exist
                        conversationHistory.push(receiptFromOriginal);
                        console.log(`[History Merge] ✅ Restored receipt message from original in-memory history`);
                    }
                    agent.conversationHistory.set(userId, conversationHistory);
                }
            }
            if (hasReceiptAfterMerge) {
                const receiptMsgs = conversationHistory.filter(h => h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video'));
                console.log(`[History Merge] Receipt messages found:`, receiptMsgs.map(m => ({ 
                    msg: (m.message && typeof m.message === 'string') ? m.message.substring(0, 50) : (m.message ? JSON.stringify(m.message).substring(0, 50) : 'no message'),
                    fileType: m.fileType, 
                    source: m.receiptValidation ? 'memory' : 'database' 
                })));
            }
        }
        
        const language = agent.languageDetector.detectLanguage(message);
        let response;
        
        // Check if this is the first message
        const isFirstMessage = conversationHistory.length === 0;
        
        // Check if message is from pre-query form (bypass greeting)
        const preQueryPatterns = [
            /^I need help with deposit$/i,
            /^I need help with withdrawal$/i,
            /^I have a game concern$/i,
            /^I need help with bonus$/i,
            /^I have a bank concern$/i,
            /^I need to contact an agent$/i,
            /^I need help with my account$/i,
            /^I need help with deposit\.?$/i,
            /^I need help with withdrawal\.?$/i,
            /^I have a game concern\.?$/i,
            /^I need help with bonus\.?$/i,
            /^I have a bank concern\.?$/i,
            /^I need to contact an agent\.?$/i,
            /^I need help with my account\.?$/i
        ];
        
        const isFromPreQuery = preQueryPatterns.some(pattern => pattern.test(message.trim()));
        
        // If first message, check if it's from pre-query form
        if (isFirstMessage) {
            if (isFromPreQuery) {
                // Skip greeting - user already selected their concern from pre-query form
                console.log(`[Pre-Query] Message detected from pre-query form: "${message}" - Skipping greeting`);
                // Don't set isGreeting flag, proceed with normal flow
            } else {
                // First message but not from pre-query - show greeting
                const greeting = await agent.generateTemplateResponse(message, 'deposit', language, { isGreeting: true }, {}, userId);
                // Ensure greeting is a string
                const greetingString = (greeting && typeof greeting === 'string') ? greeting : String(greeting || 'Hello! How can I help you?');
                agent.conversationHistory.get(userId).push({ role: 'user', message });
                agent.conversationHistory.get(userId).push({ role: 'assistant', message: greetingString });
                    dbHelpers.addConversation(userId, message, greetingString, 'deposit', null, (err) => {
                    if (err) console.error('Error saving conversation:', err);
                });
                return res.json({ response: greetingString });
            }
            // If from pre-query, continue with normal flow (don't return here)
        }
        
        // Gather all available information from ENTIRE conversation
        // CRITICAL: Check current message AND all history for order number
        const orderFromCurrent = agent.extractOrderNumber(message);
        const orderFromHistory = agent.extractOrderNumberFromHistory(conversationHistory);
        const finalOrderNumber = orderFromCurrent || orderFromHistory;
        
        console.log(`[Order Extraction] Current message: "${message.substring(0, 50)}"`);
        console.log(`[Order Extraction] Order from current: ${orderFromCurrent}`);
        console.log(`[Order Extraction] Order from history: ${orderFromHistory}`);
        console.log(`[Order Extraction] Final order number: ${finalOrderNumber}`);
        console.log(`[Order Extraction] Conversation history length: ${conversationHistory.length}`);
        
        // UNIFIED RECEIPT DETECTION: Use single reliable function
        const receiptDetection = await agent.detectReceipt(userId);
        let hasReceiptInHistory = receiptDetection.found;
        
        if (hasReceiptInHistory) {
            console.log(`[Receipt Detection] ✅ Receipt found via ${receiptDetection.source}`);
        } else {
            console.log(`[Receipt Detection] ❌ Receipt not found in any source`);
        }
        
        const hasValidReceipt = agent.hasValidReceipt(conversationHistory);
        
        // CRITICAL: If receipt was provided first, extract its information now
        // This ensures we have all receipt data (order number from OCR, date, amount) available
        let receiptInfo = null;
        if (hasReceiptInHistory) {
            receiptInfo = agent.extractReceiptInfo(conversationHistory);
            if (receiptInfo) {
                console.log(`[Receipt Info] Extracted from history - Order: ${receiptInfo.foundOrderNumber}, Date: ${receiptInfo.foundDate}, Amount: ${receiptInfo.foundAmount}`);
                
                // If receipt has order number from OCR and user just provided order number, verify match
                if (finalOrderNumber && receiptInfo.foundOrderNumber) {
                    if (finalOrderNumber.toUpperCase() === receiptInfo.foundOrderNumber.toUpperCase()) {
                        console.log(`[Receipt Info] Order number matches receipt OCR: ${finalOrderNumber}`);
                    } else {
                        console.log(`[Receipt Info] Order number mismatch - Receipt OCR: ${receiptInfo.foundOrderNumber}, User provided: ${finalOrderNumber}`);
                        // Use user-provided order number, but keep receipt info
                    }
                }
            }
        }
        
        // Check for password in message
        const passwordPatterns = [
            /password[:\s]*([A-Z0-9]{4,})/i,
            /pdf[:\s]*password[:\s]*([A-Z0-9]{4,})/i,
            /pass[:\s]*([A-Z0-9]{4,})/i,
            /pwd[:\s]*([A-Z0-9]{4,})/i
        ];
        
        let passwordProvided = false;
        let foundPassword = null;
        for (const pattern of passwordPatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                foundPassword = match[1].trim();
                passwordProvided = true;
                // Find any pending files for this user and update password
                for (const [key, storage] of pendingFiles.entries()) {
                    if (key.startsWith(userId + '_')) {
                        storage.password = foundPassword;
                        console.log(`[Password Update] Updated password from chat message for storage key: ${key}`);
                    }
                }
                break;
            }
        }
        
        // Check if we're in the "waiting for PDF/password/video" scenario
        const wasAskedForPDFAndVideo = conversationHistory.some(msg => 
            msg.role === 'assistant' && 
            msg.message && 
            typeof msg.message === 'string' &&
            (msg.message.includes('PDF bank statement') || 
             msg.message.includes('PDF बैंक') || 
             msg.message.includes('PDF బ్యాంక్') ||
             msg.message.includes('video recording'))
        );
        
        // CRITICAL: If password is provided, we're definitely in file tracking mode
        // (password is only requested when we asked for PDF/password/video)
        // Also check for standalone password (just numbers/letters without "password:" prefix)
        if (!passwordProvided && message && typeof message === 'string') {
            const trimmedMsg = message.trim();
            // Check if it's a standalone password (4-20 alphanumeric characters, no spaces, no special chars except common ones)
            if (/^[a-zA-Z0-9]{4,20}$/.test(trimmedMsg) && !trimmedMsg.includes('@') && !trimmedMsg.includes(' ')) {
                // Check if we're in file tracking mode (waiting for password)
                if (wasAskedForPDFAndVideo) {
                    passwordProvided = true;
                    foundPassword = trimmedMsg;
                    console.log(`[Password Detection] ✅ Standalone password detected: ${trimmedMsg.substring(0, 3)}***`);
                    // Update pendingFiles
                    for (const [key, storage] of pendingFiles.entries()) {
                        if (key.startsWith(userId + '_')) {
                            storage.password = trimmedMsg;
                            console.log(`[Password Update] Updated password (standalone) for storage key: ${key}`);
                        }
                    }
                }
            }
        }
        const isInFileTrackingMode = wasAskedForPDFAndVideo || passwordProvided;
        
        // If we're waiting for PDF/password/video, check what files have been received
        let filesInHistory = { hasPDF: false, hasPassword: false, hasVideo: false };
        if (isInFileTrackingMode) {
            // Create a temporary history that includes the current password message
            const tempHistory = [...conversationHistory];
            if (passwordProvided) {
                // Add current message as password entry for checking
                tempHistory.push({ 
                    role: 'user', 
                    message: message,
                    fileType: 'password',
                    passwordProvided: true
                });
            }
            filesInHistory = agent.checkFilesInHistory(tempHistory);
            console.log(`[Chat] Files in history after password check - PDF: ${filesInHistory.hasPDF}, Password: ${filesInHistory.hasPassword}, Video: ${filesInHistory.hasVideo}`);
        }
        
        // Build context with available data
        // CRITICAL: Include receipt information if available (from receipt-first scenario)
        // CRITICAL: Set hasReceipt based on unified detection
        let additionalContext = {
            orderNumber: finalOrderNumber || null,
            hasReceipt: hasReceiptInHistory,
            passwordProvided: passwordProvided,
            fileType: passwordProvided ? 'password' : null,
            // Add file tracking if we're waiting for PDF/password/video
            hasPDF: isInFileTrackingMode ? filesInHistory.hasPDF : false,
            hasPassword: isInFileTrackingMode ? filesInHistory.hasPassword : (passwordProvided || false),
            hasVideo: isInFileTrackingMode ? filesInHistory.hasVideo : false,
            waitingForPDFAndVideo: isInFileTrackingMode, // Use the enhanced check
            isFileUploadTracking: isInFileTrackingMode, // Mark that we're tracking file uploads
            hasFileUpload: passwordProvided, // Mark as file upload when password is provided
            // Include receipt information if available (from receipt-first scenario)
            receiptInfo: receiptInfo || null,
            receiptAmount: receiptInfo?.foundAmount || null
        };
        
        // Determine issue type
        let issueType = agent.classifyIssue(message, language);
        
        // If order number is provided and we're in a deposit conversation context, force issue type to deposit
        const hasDepositContext = conversationHistory.some(msg => {
            const msgText = (msg.message || '').toLowerCase();
            return msgText.includes('deposit') || 
                   msgText.includes('जमा') || 
                   msgText.includes('జమ') ||
                   msgText.includes('জমা') ||
                   msgText.includes('ஜமா') ||
                   (msg.role === 'assistant' && msg.message && msg.message.toLowerCase().includes('deposit')) ||
                   (msg.role === 'assistant' && msg.message && msg.message.toLowerCase().includes('order number'));
        });
        
        if (finalOrderNumber && (issueType === 'deposit' || hasDepositContext)) {
            issueType = 'deposit';
        }
        
        if (finalOrderNumber && /^(s05|d05|p05)/i.test(finalOrderNumber)) {
            issueType = 'deposit';
        }
        
        // For deposit concerns: Check database and receipt age
        if (issueType === 'deposit') {
            // Always check database if order number is provided
            if (finalOrderNumber) {
                console.log(`[Database Check] 🔍 Checking order number ${finalOrderNumber} in deposits database...`);
                await new Promise((resolve) => {
                    agent.checkOrderNumberInDatabase(finalOrderNumber, (err, orderData) => {
                        if (!err && orderData) {
                            additionalContext.orderFound = orderData.found;
                            additionalContext.orderData = orderData.data || null;
                            console.log(`[Database Check] ✅ Result: Order ${orderData.found ? 'FOUND' : 'NOT FOUND'} in database`);
                            if (orderData.found && orderData.data) {
                                console.log(`[Database Check] Order details: Amount: ${orderData.data.amount || 'N/A'}, Status: ${orderData.data.paymentStatus || 'N/A'}`);
                            }
                        } else {
                            additionalContext.orderFound = false;
                            additionalContext.orderData = null;
                            console.log(`[Database Check] ❌ Error checking database or order not found: ${err ? err.message : 'Order not found'}`);
                        }
                        resolve();
                    });
                });
            } else {
                console.log(`[Database Check] ⏭️ Skipping database check - no order number provided`);
            }
            
            // CRITICAL: If receipt was provided (even if before order number), check its age
            // This is essential for the "receipt first, then order number" flow
            if (hasReceiptInHistory) {
                // Use receipt info if available (has date from OCR), otherwise use timestamp
                let receiptDate = null;
                if (receiptInfo && receiptInfo.foundDate) {
                    try {
                        receiptDate = new Date(receiptInfo.foundDate);
                        if (isNaN(receiptDate.getTime())) receiptDate = null;
                    } catch (e) {
                        receiptDate = null;
                    }
                }
                
                // Fallback to timestamp if date not available from OCR
                if (!receiptDate) {
                    receiptDate = agent.extractReceiptDate(conversationHistory, finalOrderNumber || additionalContext.orderNumber);
                }
                
                if (receiptDate) {
                    const isOldReceipt = agent.isReceiptOlderThan2Days(receiptDate);
                    additionalContext.isOldReceipt = isOldReceipt;
                    const receipt = new Date(receiptDate);
                    const now = new Date();
                    const diffTime = Math.abs(now - receipt);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    additionalContext.receiptAgeDays = diffDays;
                    console.log(`[Receipt Age] Receipt found in history. Age: ${diffDays} days, IsOld: ${isOldReceipt}, Date source: ${receiptInfo?.foundDate ? 'OCR' : 'timestamp'}`);
                } else {
                    console.log(`[Receipt Age] Receipt found in history but date could not be extracted`);
                    // If receipt exists but date can't be determined, default to recent (< 2 days)
                    additionalContext.isOldReceipt = false;
                    additionalContext.receiptAgeDays = 1;
                }
            } else {
                console.log(`[Receipt Age] No receipt found in conversation history`);
            }
        } else {
            if (finalOrderNumber) {
                await new Promise((resolve) => {
                    agent.checkOrderNumberInDatabase(finalOrderNumber, (err, orderData) => {
                        if (!err && orderData) {
                            additionalContext.orderFound = orderData.found;
                            additionalContext.orderData = orderData.data || null;
                        } else {
                            additionalContext.orderFound = false;
                            additionalContext.orderData = null;
                        }
                        resolve();
                    });
                });
            }
        }
        
        // EMERGENCY FIX: Check if receipt was uploaded recently (within last 60 seconds)
        // This catches receipts that might not be in merged history yet
        const recentReceipts = Array.from(agent.conversationHistory.get(userId) || [])
            .filter(h => h.role === 'user' && h.fileType === 'image' && 
                    h.timestamp && (Date.now() - new Date(h.timestamp)) < 60000);
        if (recentReceipts.length > 0 && !hasReceiptInHistory) {
            console.log(`[EMERGENCY FIX] Found recent receipt upload within last 60 seconds! Setting hasReceiptInHistory = true`);
            hasReceiptInHistory = true;
        }
        
        // CRITICAL: Final receipt detection check using unified function
        // This ensures we have the most up-to-date receipt status
        const finalReceiptCheck = await agent.detectReceipt(userId);
        if (finalReceiptCheck.found && !hasReceiptInHistory) {
            hasReceiptInHistory = true;
            console.log(`[Receipt Detection] ✅ Final check found receipt via ${finalReceiptCheck.source}`);
        }
        
        // Update additionalContext with final receipt status
        additionalContext.hasReceipt = hasReceiptInHistory;
        
        // CRITICAL: Check receipt age if receipt exists
        console.log(`[Receipt Check] hasReceiptInHistory: ${hasReceiptInHistory}, finalOrderNumber: ${finalOrderNumber || 'none'}`);
        if (hasReceiptInHistory) {
            console.log(`[Receipt Detection] ✅ Receipt confirmed - Step 4 will execute, NOT Step 2`);
            
            // Extract receipt info (includes OCR date if available)
            let receiptInfo = agent.extractReceiptInfo(conversationHistory);
            
            // CRITICAL FIX: If receiptInfo is missing or incomplete, check receiptImageStorage
            // This handles the case where receipt was uploaded first, then order number provided later
            if (!receiptInfo || (!receiptInfo.foundUPI && !receiptInfo.foundUTR && !receiptInfo.foundDate)) {
                const receiptStorage = receiptImageStorage.get(userId);
                if (receiptStorage && receiptStorage.validation) {
                    console.log(`[Receipt Info] ⚠️ receiptInfo missing/incomplete, using validation from receiptImageStorage`);
                    receiptInfo = {
                        foundUPI: receiptStorage.validation.foundUPI || null,
                        foundUTR: receiptStorage.validation.foundUTR || null,
                        foundAmount: receiptStorage.validation.foundAmount || null,
                        foundDate: receiptStorage.validation.foundDate || null,
                        foundOrderNumber: receiptStorage.validation.foundOrderNumber || null,
                        isValid: receiptStorage.validation.isValid !== false
                    };
                }
            } else if (receiptInfo) {
                // Merge missing fields from receiptImageStorage if available
                const receiptStorage = receiptImageStorage.get(userId);
                if (receiptStorage && receiptStorage.validation) {
                    if (!receiptInfo.foundUPI && receiptStorage.validation.foundUPI) {
                        receiptInfo.foundUPI = receiptStorage.validation.foundUPI;
                    }
                    if (!receiptInfo.foundUTR && receiptStorage.validation.foundUTR) {
                        receiptInfo.foundUTR = receiptStorage.validation.foundUTR;
                    }
                    if (!receiptInfo.foundAmount && receiptStorage.validation.foundAmount) {
                        receiptInfo.foundAmount = receiptStorage.validation.foundAmount;
                    }
                    if (!receiptInfo.foundDate && receiptStorage.validation.foundDate) {
                        receiptInfo.foundDate = receiptStorage.validation.foundDate;
                    }
                }
            }
            
            console.log(`[Receipt Info] Extracted - foundDate: ${receiptInfo?.foundDate || 'none'}, foundUPI: ${receiptInfo?.foundUPI || 'none'}, foundUTR: ${receiptInfo?.foundUTR || 'none'}`);
            let receiptDate = null;
            
            // CRITICAL FOR REVERSED FLOW: PRIORITY 1 - Extract date from order number FIRST (most reliable for transaction date)
            if (finalOrderNumber) {
                const orderDateMatch = finalOrderNumber.match(/^(s05|d05|p05)(\d{6})/i);
                if (orderDateMatch) {
                    const dateStr = orderDateMatch[2]; // YYMMDD
                    const year = 2000 + parseInt(dateStr.substring(0, 2));
                    const month = parseInt(dateStr.substring(2, 4)) - 1;
                    const day = parseInt(dateStr.substring(4, 6));
                    const orderDate = new Date(year, month, day);
                    if (!isNaN(orderDate.getTime())) {
                        const now = new Date();
                        const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
                        if (orderDate <= oneYearFromNow && orderDate <= now) {
                            receiptDate = orderDate.toISOString();
                            console.log(`[Receipt Age] ✅✅✅ PRIORITY: Using order number date: ${orderDate.toISOString()} (from order: ${finalOrderNumber})`);
                            console.log(`[Receipt Age] Extracted date components: Year=${year}, Month=${month+1}, Day=${day}`);
                        } else {
                            console.log(`[Receipt Age] ⚠️ Order date ${orderDate.toISOString()} is invalid (future date)`);
                        }
                    }
                } else {
                    console.log(`[Receipt Age] ⚠️ Order number ${finalOrderNumber} does not match date pattern`);
                }
            }
            
            // PRIORITY 2: Use transaction date from OCR (only if order number date not available)
            if (!receiptDate && receiptInfo && receiptInfo.foundDate) {
                try {
                    const ocrDate = new Date(receiptInfo.foundDate);
                    if (!isNaN(ocrDate.getTime())) {
                        receiptDate = ocrDate.toISOString();
                        console.log(`[Receipt Age] Using OCR transaction date: ${receiptInfo.foundDate} -> ${receiptDate}`);
                    }
                } catch (e) {
                    console.log(`[Receipt Age] OCR date invalid, trying timestamp`);
                }
            }
            
            // PRIORITY 3: Fall back to upload timestamp (only as last resort)
            if (!receiptDate) {
                receiptDate = agent.extractReceiptDate(conversationHistory, finalOrderNumber);
                if (receiptDate) {
                    console.log(`[Receipt Age] Using upload timestamp as fallback: ${receiptDate}`);
                }
            }
            
            // UNIFIED TELEGRAM SENDING - Handles ALL scenarios
            let isOldReceipt = false;
            let diffDays = 0;
            
            if (receiptDate) {
                isOldReceipt = agent.isReceiptOlderThan2Days(receiptDate);
                additionalContext.isOldReceipt = isOldReceipt;
                
                const receipt = new Date(receiptDate);
                const now = new Date();
                const diffTime = Math.abs(now - receipt);
                diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                additionalContext.receiptAgeDays = diffDays;
                
                console.log(`[Receipt Age] Receipt date: ${receiptDate}, Age: ${diffDays} days, IsOld: ${isOldReceipt}`);
            } else {
                // No date detected - treat as recent (not old)
                isOldReceipt = false;
                additionalContext.isOldReceipt = false;
                additionalContext.receiptAgeDays = 0;
                console.log(`[Receipt Age] No date detected - treating as recent (not old)`);
            }
            
            // OLD CODE REMOVED - All Telegram sending now goes through unified function above
            // This prevents duplicate sends and ensures consistent behavior
            
            // If receipt is old AND order not found, we need PDF/video (will be sent in batch)
            if (isOldReceipt && (additionalContext.orderFound === false || additionalContext.orderFound === undefined)) {
                console.log(`[Receipt Age] ⚠️ Old receipt (${diffDays} days) with pending order - Will ask for PDF/video`);
            }
        } else {
            console.log(`[Receipt Detection] ❌ No receipt found - Step 2 may execute`);
        }
        
        // CRITICAL: If receipt exists and order is pending, FORCE template system (don't use OpenAI)
        // This ensures we never ask for receipt again and uses the exact required response format
        // Force template if:
        // 1. Receipt exists AND order is not found (pending) - use exact template response
        // 2. This applies to BOTH recent and old receipts to ensure consistent responses
        const shouldForceTemplate = hasReceiptInHistory && 
                                    issueType === 'deposit' &&
                                    finalOrderNumber &&
                                    (additionalContext.orderFound === false || additionalContext.orderFound === undefined);
        
        console.log(`[Response Decision] shouldForceTemplate: ${shouldForceTemplate}, hasReceiptInHistory: ${hasReceiptInHistory}, finalOrderNumber: ${finalOrderNumber}, orderFound: ${additionalContext.orderFound}, isOldReceipt: ${additionalContext.isOldReceipt}`);
        
        // CRITICAL: Ensure isOldReceipt is set in additionalContext before generating response
        // This is especially important for "send deposit receipt after order number" flow
        if (hasReceiptInHistory && !additionalContext.hasOwnProperty('isOldReceipt')) {
            // If isOldReceipt is not set, calculate it now
            let receiptDateForResponse = null;
            if (receiptInfo && receiptInfo.foundDate) {
                try {
                    receiptDateForResponse = new Date(receiptInfo.foundDate);
                } catch (e) {
                    // Ignore
                }
            }
            if (!receiptDateForResponse && finalOrderNumber) {
                receiptDateForResponse = agent.extractReceiptDate([], finalOrderNumber);
            }
            if (receiptDateForResponse) {
                additionalContext.isOldReceipt = agent.isReceiptOlderThan2Days(receiptDateForResponse);
                console.log(`[Response] ✅ Set isOldReceipt in additionalContext: ${additionalContext.isOldReceipt}`);
            } else {
                additionalContext.isOldReceipt = false;
                console.log(`[Response] ⚠️ No receipt date found - defaulting isOldReceipt to false`);
            }
        }
        
        if (shouldForceTemplate) {
            console.log(`[Response] ⚠️ FORCING template system - Receipt with pending order (isOld: ${additionalContext.isOldReceipt}), using template`);
            try {
                // Use template system directly, skip OpenAI
                response = await agent.generateTemplateResponse(message, issueType, language, additionalContext, {}, userId);
                // Ensure response is a string
                response = (response && typeof response === 'string') ? response : String(response || 'Error: Invalid response');
                console.log(`[Response] Template response: "${response.substring(0, 150)}..."`);
            } catch (templateError) {
                console.error('[Response] Error in template generation:', templateError.message);
                console.error('[Response] Template error stack:', templateError.stack);
                response = 'I apologize, but I encountered an error processing your request. Please try again.';
            }
        } else {
            console.log(`[Response] Using normal response generation (OpenAI or template)`);
            try {
                // All responses go through template system (which may use OpenAI as fallback)
                response = await agent.generateResponse(message, issueType, userId, language, additionalContext);
                // Ensure response is a string
                response = (response && typeof response === 'string') ? response : String(response || 'Error: Invalid response');
                console.log(`[Response] Generated response: "${response.substring(0, 150)}..."`);
            } catch (responseError) {
                console.error('[Response] Error in response generation:', responseError.message);
                console.error('[Response] Response error stack:', responseError.stack);
                response = 'I apologize, but I encountered an error processing your request. Please try again.';
            }
        }
        
        // CRITICAL: Ensure response is always set (fallback if somehow undefined)
        if (!response || typeof response !== 'string' || response.trim().length === 0) {
            console.error('[Response] ⚠️ WARNING: Response is empty or invalid, using fallback');
            response = 'I apologize, but I encountered an error processing your request. Please try again.';
        }
        
        // CRITICAL: Check if all files (PDF/password/video) are received and send receipt to Telegram
        // This happens when receipt was old (>2 days) and we were waiting for files
        // CRITICAL: Also check pendingFiles for password if not found in history
        if (isInFileTrackingMode && finalOrderNumber && issueType === 'deposit') {
            // Check password in pendingFiles as well
            const storageKey = `${userId}_${finalOrderNumber}`;
            const pendingFileCheck = pendingFiles.get(storageKey);
            const hasPasswordInPending = pendingFileCheck && pendingFileCheck.password && pendingFileCheck.password.trim().length > 0;
            
            // CRITICAL: Also check pendingFiles for PDFs and videos (they might be stored there, not in history)
            const hasPDFInPending = pendingFileCheck && pendingFileCheck.pdfs && pendingFileCheck.pdfs.length > 0;
            const hasVideoInPending = pendingFileCheck && pendingFileCheck.videos && pendingFileCheck.videos.length > 0;
            
            const hasAllFiles = (filesInHistory.hasPDF || hasPDFInPending) && 
                              (filesInHistory.hasVideo || hasVideoInPending) && 
                              (filesInHistory.hasPassword || hasPasswordInPending || passwordProvided);
            
            console.log(`[Chat Telegram Check] hasPDF: ${filesInHistory.hasPDF || hasPDFInPending} (history: ${filesInHistory.hasPDF}, pending: ${hasPDFInPending}), hasVideo: ${filesInHistory.hasVideo || hasVideoInPending} (history: ${filesInHistory.hasVideo}, pending: ${hasVideoInPending}), hasPassword: ${filesInHistory.hasPassword || hasPasswordInPending || passwordProvided} (history: ${filesInHistory.hasPassword}, pending: ${hasPasswordInPending}, provided: ${passwordProvided}), hasAllFiles: ${hasAllFiles}, wasAskedForPDFAndVideo: ${wasAskedForPDFAndVideo}`);
            
            // CRITICAL: Send if all files are ready, regardless of wasAskedForPDFAndVideo check
            // This ensures PDFs are sent even if the check fails
            if (hasAllFiles) {
                console.log(`[Chat] ✅✅✅ ALL FILES READY - Sending to Telegram via sendBatchFilesToTelegram NOW (PDF: ${filesInHistory.hasPDF || hasPDFInPending}, Video: ${filesInHistory.hasVideo || hasVideoInPending}, Password: ${filesInHistory.hasPassword || hasPasswordInPending || passwordProvided})`);
                
                // Get receipt info from storage
                const receiptStorage = receiptImageStorage.get(userId);
                let receiptInfo = null;
                let receiptDate = null;
                let isOldReceipt = false;
                
                if (receiptStorage && receiptStorage.validation) {
                    receiptInfo = {
                        foundUPI: receiptStorage.validation.foundUPI || null,
                        foundUTR: receiptStorage.validation.foundUTR || null,
                        foundAmount: receiptStorage.validation.foundAmount || null,
                        foundDate: receiptStorage.validation.foundDate || null
                    };
                    
                    // Extract receipt date
                    if (receiptStorage.validation.foundDate) {
                        try {
                            receiptDate = new Date(receiptStorage.validation.foundDate + 'T00:00:00Z');
                            if (!isNaN(receiptDate.getTime())) {
                                isOldReceipt = agent.isReceiptOlderThan2Days(receiptDate);
                            }
                        } catch (e) {
                            // Ignore
                        }
                    }
                }
                
                // If no date from OCR, try order number date
                if (!receiptDate && finalOrderNumber) {
                    const orderDate = agent.extractReceiptDate([], finalOrderNumber);
                    if (orderDate) {
                        receiptDate = orderDate;
                        isOldReceipt = agent.isReceiptOlderThan2Days(receiptDate);
                    }
                }
                
                // CRITICAL: When all files are received, use sendBatchFilesToTelegram to send everything together
                // This ensures PDF, receipt photo, video, and password are all sent correctly
                console.log(`[Chat] ✅ All files received - preparing to send via sendBatchFilesToTelegram`);
                
                // Get all files from conversation history and pendingFiles
                const storageKey = `${userId}_${finalOrderNumber}`;
                const pendingFile = pendingFiles.get(storageKey);
                
                // Build files object for sendBatchFilesToTelegram
                const files = {
                    pdfs: [],
                    videos: [],
                    images: [],
                    password: null
                };
                
                // Get PDFs from history
                conversationHistory.forEach(msg => {
                    if (msg.role === 'user' && msg.fileType === 'pdf' && msg.buffer) {
                        files.pdfs.push({ 
                            buffer: msg.buffer,
                            filename: msg.filename || 'document.pdf'
                        });
                        console.log(`[Chat Telegram] ✅ Found PDF in history - buffer size: ${msg.buffer.length} bytes, filename: ${msg.filename || 'document.pdf'}`);
                    }
                    if (msg.role === 'user' && msg.fileType === 'video' && msg.buffer) {
                        files.videos.push({ 
                            buffer: msg.buffer,
                            filename: msg.filename || 'video.mp4'
                        });
                    }
                });
                
                // CRITICAL: Also check pendingFiles for PDFs (in case they're stored there)
                // PDFs uploaded via /api/upload-receipt are stored in pendingFiles, NOT in conversation history
                if (pendingFile) {
                    if (pendingFile.pdfs && pendingFile.pdfs.length > 0) {
                        console.log(`[Chat Telegram] ✅✅✅ Found ${pendingFile.pdfs.length} PDF(s) in pendingFiles`);
                        pendingFile.pdfs.forEach((pdf, idx) => {
                            if (pdf.buffer) {
                                // Check if already added from history (compare buffer sizes as a simple check)
                                const alreadyAdded = files.pdfs.some(f => 
                                    f.buffer && pdf.buffer && 
                                    f.buffer.length === pdf.buffer.length
                                );
                                if (!alreadyAdded) {
                                    files.pdfs.push({
                                        buffer: pdf.buffer,
                                        filename: pdf.filename || 'document.pdf'
                                    });
                                    console.log(`[Chat Telegram] ✅✅✅ Added PDF ${idx + 1} from pendingFiles - buffer size: ${pdf.buffer.length} bytes, filename: ${pdf.filename || 'document.pdf'}`);
                                } else {
                                    console.log(`[Chat Telegram] ⏭️ PDF ${idx + 1} from pendingFiles already added from history`);
                                }
                            } else {
                                console.error(`[Chat Telegram] ❌❌❌ PDF ${idx + 1} in pendingFiles has NO BUFFER!`);
                            }
                        });
                    } else {
                        console.log(`[Chat Telegram] ⚠️ No PDFs found in pendingFiles`);
                    }
                    
                    // Also get videos from pendingFiles
                    if (pendingFile.videos && pendingFile.videos.length > 0) {
                        console.log(`[Chat Telegram] ✅ Found ${pendingFile.videos.length} video(s) in pendingFiles`);
                        pendingFile.videos.forEach((video, idx) => {
                            if (video.buffer) {
                                const alreadyAdded = files.videos.some(v => 
                                    v.buffer && video.buffer && 
                                    v.buffer.length === video.buffer.length
                                );
                                if (!alreadyAdded) {
                                    files.videos.push({
                                        buffer: video.buffer,
                                        filename: video.filename || 'video.mp4'
                                    });
                                    console.log(`[Chat Telegram] ✅ Added Video ${idx + 1} from pendingFiles - buffer size: ${video.buffer.length} bytes`);
                                }
                            }
                        });
                    }
                } else {
                    console.log(`[Chat Telegram] ⚠️⚠️⚠️ No pendingFile found for storageKey: ${storageKey}`);
                }
                
                console.log(`[Chat Telegram] 📊📊📊 FINAL COUNT BEFORE SEND - PDFs: ${files.pdfs.length}, Videos: ${files.videos.length}, Images: ${files.images ? files.images.length : 0}, Password: ${files.password ? 'yes (' + files.password.substring(0, 3) + '***)' : 'NO'}`);
                
                // Get receipt image from storage
                if (receiptStorage && receiptStorage.buffer) {
                    files.images = [{ buffer: receiptStorage.buffer, validation: receiptStorage.validation }];
                }
                
                // Get password from pendingFiles or history or current context
                // CRITICAL: Check pendingFiles first, then context, then history
                if (pendingFile && pendingFile.password) {
                    files.password = pendingFile.password;
                    console.log(`[Chat Telegram] Password found in pendingFiles: ${files.password.substring(0, 3)}***`);
                } else if (additionalContext && additionalContext.foundPassword) {
                    files.password = additionalContext.foundPassword;
                    console.log(`[Chat Telegram] Password found in additionalContext: ${files.password.substring(0, 3)}***`);
                } else {
                    // Check history for password (most recent first)
                    const passwordPatterns = [
                        /password[:\s]*([A-Z0-9]{4,})/i,
                        /pdf[:\s]*password[:\s]*([A-Z0-9]{4,})/i,
                        /pass[:\s]*([A-Z0-9]{4,})/i,
                        /pwd[:\s]*([A-Z0-9]{4,})/i
                    ];
                    
                    // Check recent messages first (newest to oldest)
                    for (let i = conversationHistory.length - 1; i >= 0; i--) {
                        const msg = conversationHistory[i];
                        if (msg.role === 'user') {
                            // Check fileType first
                            if (msg.fileType === 'password') {
                                files.password = msg.message || 'provided';
                                console.log(`[Chat Telegram] Password found via fileType in history`);
                                break;
                            }
                            
                            // Check message text for password patterns
                            if (msg.message && typeof msg.message === 'string') {
                                for (const pattern of passwordPatterns) {
                                    const match = msg.message.match(pattern);
                                    if (match && match[1]) {
                                        files.password = match[1].trim();
                                        console.log(`[Chat Telegram] Password found via pattern in history: ${files.password.substring(0, 3)}***`);
                                        break;
                                    }
                                }
                                if (files.password) break;
                                
                                // Check if message is just a password (standalone)
                                const trimmedMsg = msg.message.trim();
                                if (/^[a-zA-Z0-9]{4,20}$/.test(trimmedMsg) && !trimmedMsg.includes('@') && !trimmedMsg.includes(' ')) {
                                    // Check if we're in file tracking mode (waiting for password)
                                    const wasAskedForPDF = conversationHistory.some(h => 
                                        h.role === 'assistant' && 
                                        h.message && 
                                        (h.message.includes('PDF') || h.message.includes('password'))
                                    );
                                    if (wasAskedForPDF) {
                                        files.password = trimmedMsg;
                                        console.log(`[Chat Telegram] Password detected (standalone) in history: ${files.password.substring(0, 3)}***`);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                
                // CRITICAL: Send all files together via sendBatchFilesToTelegram
                // Also check pendingFiles for password if not found in history
                if (!files.password && pendingFile && pendingFile.password) {
                    files.password = pendingFile.password;
                    console.log(`[Chat Telegram] Password found in pendingFiles: ${files.password.substring(0, 3)}***`);
                }
                
                // CRITICAL: Verify all files are present before sending
                const hasPDF = files.pdfs.length > 0;
                const hasVideo = files.videos.length > 0;
                const hasPassword = files.password && files.password.trim().length > 0;
                
                console.log(`[Chat Telegram] 🔍 FINAL VERIFICATION - PDF: ${hasPDF} (${files.pdfs.length}), Video: ${hasVideo} (${files.videos.length}), Password: ${hasPassword} (${files.password ? files.password.substring(0, 3) + '***' : 'none'})`);
                
                if (hasPDF && hasVideo && hasPassword) {
                    console.log(`[Chat] 🚀🚀🚀 ALL FILES VERIFIED - Sending to Telegram via sendBatchFilesToTelegram IMMEDIATELY`);
                    // Use setImmediate for immediate execution (no delay)
                    setImmediate(async () => {
                        try {
                            console.log(`[Chat Telegram] 📤 Executing sendBatchFilesToTelegram NOW...`);
                            console.log(`[Chat Telegram] Files being sent - PDFs: ${files.pdfs.length}, Videos: ${files.videos.length}, Images: ${files.images ? files.images.length : 0}, Password: ${files.password ? 'yes' : 'no'}`);
                            
                            await sendBatchFilesToTelegram(userId, files, finalOrderNumber);
                            
                            // Mark as sent
                            const sentKey = `${userId}_${finalOrderNumber}`;
                            telegramSentReceipts.add(sentKey);
                            // Clear storage
                            receiptImageStorage.delete(userId);
                            pendingFiles.delete(storageKey);
                            console.log(`[Chat] ✅✅✅ Successfully sent all files to Telegram (including PDF with DPF Deposit format)`);
                        } catch (error) {
                            console.error(`[Chat] ❌❌❌ Error sending files to Telegram:`, error);
                            console.error(`[Chat] Error stack:`, error.stack);
                        }
                    });
                } else {
                    console.log(`[Chat Telegram] ⚠️ Files not complete - PDF: ${hasPDF} (${files.pdfs.length}), Video: ${hasVideo} (${files.videos.length}), Password: ${hasPassword}`);
                    // CRITICAL: If password was just provided, check pendingFiles again and trigger send
                    if (!files.password && passwordProvided) {
                        console.log(`[Chat] 🔍 Password was just provided, checking pendingFiles again...`);
                        const storageKey = `${userId}_${finalOrderNumber}`;
                        const pendingFileCheck = pendingFiles.get(storageKey);
                        if (pendingFileCheck && pendingFileCheck.password) {
                            files.password = pendingFileCheck.password;
                            console.log(`[Chat] ✅ Password found in pendingFiles after check: ${files.password.substring(0, 3)}***`);
                        } else if (passwordProvided && foundPassword) {
                            // Password was just provided in this message - update pendingFiles and files
                            if (!pendingFileCheck) {
                                pendingFiles.set(storageKey, {
                                    pdfs: [],
                                    videos: [],
                                    images: [],
                                    password: foundPassword
                                });
                            } else {
                                pendingFileCheck.password = foundPassword;
                            }
                            files.password = foundPassword;
                            console.log(`[Chat] ✅ Password updated from current message: ${files.password.substring(0, 3)}***`);
                        }
                        
                        // Try sending again if all files are now complete
                        const retryHasPDF = files.pdfs.length > 0;
                        const retryHasVideo = files.videos.length > 0;
                        const retryHasPassword = files.password && files.password.trim().length > 0;
                        
                        console.log(`[Chat Telegram Retry] Verification - PDF: ${retryHasPDF}, Video: ${retryHasVideo}, Password: ${retryHasPassword}`);
                        
                        if (retryHasPDF && retryHasVideo && retryHasPassword) {
                            console.log(`[Chat] 🚀🚀🚀 All files now complete (retry) - sending to Telegram IMMEDIATELY`);
                            // Use setImmediate for immediate execution
                            setImmediate(async () => {
                                try {
                                    console.log(`[Chat Telegram Retry] Executing sendBatchFilesToTelegram NOW...`);
                                    await sendBatchFilesToTelegram(userId, files, finalOrderNumber);
                                    const sentKey = `${userId}_${finalOrderNumber}`;
                                    telegramSentReceipts.add(sentKey);
                                    receiptImageStorage.delete(userId);
                                    pendingFiles.delete(storageKey);
                                    console.log(`[Chat] ✅✅✅ Successfully sent all files to Telegram (password trigger)`);
                                } catch (error) {
                                    console.error(`[Chat] ❌❌❌ Error sending files to Telegram (password trigger):`, error);
                                    console.error(`[Chat] Error stack:`, error.stack);
                                }
                            });
                        } else {
                            console.log(`[Chat Telegram Retry] ⚠️ Files still not complete - PDF: ${retryHasPDF}, Video: ${retryHasVideo}, Password: ${retryHasPassword}`);
                        }
                    }
                }
            }
        }
        
        // CRITICAL: UNIFIED TELEGRAM SENDING - Handle ALL order scenarios
        // This MUST run AFTER all receipt detection is complete and BEFORE saving conversation
        // Send for: receipt-first flow, order-only flow, or both together
        // BUT: If waiting for PDF/password/video, DON'T send receipt yet (handled above)
        if (finalOrderNumber && issueType === 'deposit') {
            // Check if this is a text message (not a file upload)
            const isTextMessage = !req.body.fileType || req.body.fileType === 'text';
            
            if (isTextMessage) {
                console.log(`[Unified Telegram] 🚀 FINAL CHECK - Order: ${finalOrderNumber}, HasReceipt: ${hasReceiptInHistory}, IssueType: ${issueType}`);
                console.log(`[Unified Telegram] Receipt storage check - receiptImageStorage keys: ${Array.from(receiptImageStorage.keys()).join(', ') || 'NONE'}`);
                console.log(`[Unified Telegram] Receipt for userId: ${receiptImageStorage.has(userId) ? 'FOUND ✅' : 'NOT FOUND ❌'}`);
                
                // Extract receipt info and date (will be empty/null if no receipt)
                let receiptInfo = agent.extractReceiptInfo(conversationHistory);
                
                // CRITICAL FIX: Always check receiptImageStorage and merge missing fields
                // This handles the case where receipt was uploaded first, then order number provided later
                    const receiptStorage = receiptImageStorage.get(userId);
                    if (receiptStorage && receiptStorage.validation) {
                    if (!receiptInfo) {
                        console.log(`[Unified Telegram] ⚠️ receiptInfo missing, using validation from receiptImageStorage`);
                        receiptInfo = {
                            foundUPI: receiptStorage.validation.foundUPI || null,
                            foundUTR: receiptStorage.validation.foundUTR || null,
                            foundAmount: receiptStorage.validation.foundAmount || null,
                            foundDate: receiptStorage.validation.foundDate || null,
                            foundOrderNumber: receiptStorage.validation.foundOrderNumber || null,
                            isValid: receiptStorage.validation.isValid !== false
                        };
                    } else {
                        // Merge missing fields from receiptImageStorage
                        if (!receiptInfo.foundUPI && receiptStorage.validation.foundUPI) {
                            receiptInfo.foundUPI = receiptStorage.validation.foundUPI;
                            console.log(`[Unified Telegram] ✅ Merged UPI from receiptImageStorage: ${receiptInfo.foundUPI}`);
                        }
                        if (!receiptInfo.foundUTR && receiptStorage.validation.foundUTR) {
                            receiptInfo.foundUTR = receiptStorage.validation.foundUTR;
                            console.log(`[Unified Telegram] ✅ Merged UTR from receiptImageStorage: ${receiptInfo.foundUTR}`);
                        }
                        if (!receiptInfo.foundAmount && receiptStorage.validation.foundAmount) {
                            receiptInfo.foundAmount = receiptStorage.validation.foundAmount;
                        }
                        if (!receiptInfo.foundDate && receiptStorage.validation.foundDate) {
                            receiptInfo.foundDate = receiptStorage.validation.foundDate;
                        }
                        console.log(`[Unified Telegram] ✅ Merged validation data from receiptImageStorage`);
                    }
                }
                
                let receiptDate = null;
                let isOldReceipt = false;
                
                // CRITICAL FOR REVERSED FLOW: ALWAYS extract date from order number FIRST (most reliable)
                // Order number contains the actual transaction date, which is more reliable than upload timestamp
                if (finalOrderNumber) {
                    const orderDateMatch = finalOrderNumber.match(/^(s05|d05|p05)(\d{6})/i);
                    if (orderDateMatch) {
                        const dateStr = orderDateMatch[2]; // YYMMDD
                        const year = 2000 + parseInt(dateStr.substring(0, 2));
                        const month = parseInt(dateStr.substring(2, 4)) - 1;
                        const day = parseInt(dateStr.substring(4, 6));
                        const orderDate = new Date(year, month, day);
                        if (!isNaN(orderDate.getTime())) {
                            const now = new Date();
                            const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
                            if (orderDate <= oneYearFromNow && orderDate <= now) {
                                receiptDate = orderDate.toISOString();
                                console.log(`[Unified Telegram] ✅✅✅ PRIORITY: Using order number date: ${orderDate.toISOString()} (from order: ${finalOrderNumber})`);
                                console.log(`[Unified Telegram] Extracted date components: Year=${year}, Month=${month+1}, Day=${day}`);
                            } else {
                                console.log(`[Unified Telegram] ⚠️ Order date ${orderDate.toISOString()} is invalid (future date or too far ahead)`);
                            }
                        }
                    } else {
                        console.log(`[Unified Telegram] ⚠️ Order number ${finalOrderNumber} does not match date pattern (expected s05/d05/p05 + 6 digits)`);
                    }
                }
                
                // Get receipt date ONLY if receipt exists in history AND order number date not available
                if (hasReceiptInHistory && !receiptDate) {
                    // Get receipt date (OCR date first, then timestamp)
                    if (receiptInfo && receiptInfo.foundDate) {
                        try {
                            const ocrDate = new Date(receiptInfo.foundDate);
                            if (!isNaN(ocrDate.getTime())) {
                                receiptDate = ocrDate.toISOString();
                                console.log(`[Unified Telegram] Using OCR date from receipt: ${receiptDate}`);
                            }
                        } catch (e) {
                            // Ignore
                        }
                    }
                    
                    if (!receiptDate) {
                        receiptDate = agent.extractReceiptDate(conversationHistory, finalOrderNumber);
                        if (receiptDate) {
                            console.log(`[Unified Telegram] Using upload timestamp as fallback: ${receiptDate}`);
                        }
                    }
                }
                
                // Calculate if receipt is old (> 2 days)
                if (receiptDate) {
                    isOldReceipt = agent.isReceiptOlderThan2Days(receiptDate);
                    const receipt = new Date(receiptDate);
                    const now = new Date();
                    const diffTime = Math.abs(now - receipt);
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    console.log(`[Unified Telegram] 📅 Receipt date: ${receiptDate}, Age: ${diffDays} days, IsOld: ${isOldReceipt}`);
                } else {
                    console.log(`[Unified Telegram] ⚠️ No receipt date available - cannot determine if old`);
                }
                
                console.log(`[Unified Telegram] 🚀 Calling sendReceiptToTelegramIfNeeded - Order: ${finalOrderNumber}, IsOld: ${isOldReceipt}, HasDate: ${!!receiptDate}, HasReceipt: ${hasReceiptInHistory}`);
                
                // Call unified function asynchronously (don't block response)
                // Send whether receipt exists or not (order-only = "deposit not received")
                setTimeout(async () => {
                    console.log(`[Unified Telegram] ⏰ Timeout triggered - calling sendReceiptToTelegramIfNeeded now`);
                    await sendReceiptToTelegramIfNeeded(userId, finalOrderNumber, receiptInfo, receiptDate, isOldReceipt, conversationHistory);
                }, 1000);
            } else {
                console.log(`[Unified Telegram] ⏭️ Skipping - This is a file upload, Telegram sending handled by /api/upload-receipt`);
            }
        } else {
            console.log(`[Unified Telegram] ⏭️ Skipping - Order: ${finalOrderNumber || 'none'}, IssueType: ${issueType}`);
        }
        
        // Save conversation - CRITICAL: Mark password messages with fileType
        if (!agent.conversationHistory.has(userId)) {
            agent.conversationHistory.set(userId, []);
        }
        
        // If password was provided in this message, mark it in conversation history
        const userMessageEntry = { role: 'user', message };
        if (passwordProvided) {
            userMessageEntry.fileType = 'password';
            userMessageEntry.passwordProvided = true;
        }
        agent.conversationHistory.get(userId).push(userMessageEntry);
        // Ensure response is a string before saving
        const responseString = (response && typeof response === 'string') ? response : String(response || 'Error: Invalid response');
        agent.conversationHistory.get(userId).push({ role: 'assistant', message: responseString });
        
        const category = agent.classifyIssue(message, language);
        const fileType = passwordProvided ? 'password' : null;
        dbHelpers.addConversation(userId, message, response, category, fileType, (err) => {
            if (err) console.error('Error saving conversation:', err);
        });
        
        const processingTime = Date.now() - requestStartTime;
        console.log(`[API] /api/chat completed in ${processingTime}ms for user ${userId}`);
        
        // CRITICAL: Send response in format client expects (both 'response' and 'message' for compatibility)
        res.json({ 
            response: response,
            message: response  // Also send as 'message' for client compatibility
        });
    } catch (error) {
        const processingTime = Date.now() - requestStartTime;
        const userId = req.body?.userId || 'unknown';
        
        // Enhanced error logging with more context
        console.error('[API] Error in /api/chat:', {
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 10).join('\n'),
            userId: userId,
            processingTime: processingTime,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString()
        });
        
        // Record error in metrics
        if (agent.metrics) {
            agent.metrics.errors.push({
                type: error.constructor.name,
                message: error.message,
                userId: userId,
                timestamp: new Date().toISOString()
            });
            // Keep last 100 errors
            if (agent.metrics.errors.length > 100) {
                agent.metrics.errors = agent.metrics.errors.slice(-100);
            }
        }
        
        // Try to save error to conversation history for debugging
        try {
            if (agent.conversationHistory.has(userId)) {
                const errorMessage = `[System Error: ${error.message}]`;
                agent.conversationHistory.get(userId).push({ 
                    role: 'system', 
                    message: errorMessage,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (historyError) {
            console.error('[API] Error saving error to history:', historyError);
        }
        
        // Don't expose internal error details to client - send a helpful message instead
        const errorResponse = "I apologize, but I encountered an issue processing your request. Please try again, and I'll be happy to help you with your deposit concern.";
        
        // Only send response if headers haven't been sent
        if (!res.headersSent) {
            res.status(500).json({ 
                error: errorResponse,
                code: 'INTERNAL_ERROR'
            });
        } else {
            console.error('[API] Cannot send error response - headers already sent');
        }
    }
});

// Upload receipt endpoint - Enhanced with better validation and error handling
// Multer error handler middleware
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error('[Multer Error]', err.code, err.message);
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false, 
                message: `File size exceeds maximum allowed size of 100MB`,
                code: 'FILE_TOO_LARGE'
            });
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ 
                success: false, 
                message: 'Too many files. Maximum 10 files allowed.',
                code: 'TOO_MANY_FILES'
            });
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ 
                success: false, 
                message: 'Unexpected file field name. Use "receipt" as the field name.',
                code: 'INVALID_FIELD_NAME'
            });
        } else {
            return res.status(400).json({ 
                success: false, 
                message: `Upload error: ${err.message}`,
                code: 'UPLOAD_ERROR'
            });
        }
    } else if (err) {
        // Handle fileFilter errors
        console.error('[File Filter Error]', err.message);
        return res.status(400).json({ 
            success: false, 
            message: err.message || 'Invalid file type',
            code: 'INVALID_FILE_TYPE'
        });
    }
    next();
};

app.post('/api/upload-receipt', upload.single('receipt'), handleMulterError, async (req, res) => {
    const requestStartTime = Date.now();
    console.log('[Upload] Received upload request');
    try {
        // Enhanced input validation
        const rawUserId = req.body.userId || req.query.userId;
        const rawOrderNumber = req.body.orderNumber || req.query.orderNumber;
        const rawPdfPassword = req.body.pdfPassword || req.query.pdfPassword;
        
        if (!req.file) {
            console.error('[Upload] No file in request. Body keys:', Object.keys(req.body || {}), 'Files:', Object.keys(req.files || {}));
            return res.status(400).json({ 
                success: false, 
                message: 'No file uploaded. Please select a file and try again.',
                code: 'NO_FILE'
            });
        }
        
        console.log('[Upload] File received:', {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            fieldname: req.file.fieldname
        });
        
        // Validate file size
        const maxFileSize = 100 * 1024 * 1024; // 100MB
        if (req.file.size > maxFileSize) {
            return res.status(400).json({ 
                success: false, 
                message: `File size exceeds maximum allowed size of ${maxFileSize / (1024 * 1024)}MB`,
                code: 'FILE_TOO_LARGE'
            });
        }
        
        // Validate and sanitize inputs
        const userId = validateAndSanitizeInput(rawUserId, 'userId');
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or missing userId',
                code: 'INVALID_USER_ID'
            });
        }
        
        // Rate limiting for file uploads (stricter)
        if (!checkRateLimit(`${userId}_upload`)) {
            console.warn(`[Rate Limit] User ${userId} exceeded upload rate limit`);
            return res.status(429).json({ 
                success: false,
                message: 'Too many file uploads. Please wait a moment before trying again.',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: 60
            });
        }
        
        const orderNumber = rawOrderNumber ? validateAndSanitizeInput(rawOrderNumber, 'string', 100) : null;
        const pdfPassword = rawPdfPassword ? validateAndSanitizeInput(rawPdfPassword, 'string', 100) : null;
        
        const isImage = req.file.mimetype.startsWith('image/');
        const isPDF = req.file.mimetype === 'application/pdf';
        const isVideo = req.file.mimetype.startsWith('video/');
        
        console.log(`[Upload] File type detected - isImage: ${isImage}, isPDF: ${isPDF}, isVideo: ${isVideo}`);
        
        const language = agent.languageDetector.detectLanguage(req.body.message || '');
        
        // CRITICAL: For images, store receipt IMMEDIATELY before loading history
        if (isImage) {
            console.log(`[Upload] 🚨🚨🚨 IMAGE DETECTED - Storing receipt IMMEDIATELY`);
            if (!agent.conversationHistory.has(userId)) {
                agent.conversationHistory.set(userId, []);
                console.log(`[Upload] Created new conversationHistory for userId: ${userId}`);
            }
            
            const receiptMessage = {
                role: 'user',
                message: `[Uploaded receipt image]`,
                fileType: 'image',
                timestamp: new Date().toISOString()
            };
            
            agent.conversationHistory.get(userId).push(receiptMessage);
            console.log(`[Upload] ✅✅✅ IMMEDIATE STORAGE - Stored receipt in memory - fileType: ${receiptMessage.fileType}, history length: ${agent.conversationHistory.get(userId).length}`);
            
            // Store receipt image buffer temporarily for Telegram sending (if receipt is recent)
            // NOTE: Validation will be added after OCR completes - don't create without validation
            // This prevents validation from being lost
            if (req.file && req.file.buffer) {
                // Only create if it doesn't exist - validation will be added after OCR
                if (!receiptImageStorage.has(userId)) {
                receiptImageStorage.set(userId, {
                    buffer: req.file.buffer,
                    timestamp: new Date(),
                        orderNumber: null, // Will be set when order number is provided
                        validation: null // Will be set after OCR completes
                    });
                    console.log(`[Upload] ✅ Stored receipt image buffer for Telegram sending (validation pending)`);
                } else {
                    // Update existing storage with new buffer
                    const existing = receiptImageStorage.get(userId);
                    existing.buffer = req.file.buffer;
                    existing.timestamp = new Date();
                    receiptImageStorage.set(userId, existing);
                    console.log(`[Upload] ✅ Updated receipt image buffer (preserving existing validation)`);
                }
            }
            
            // Save to database IMMEDIATELY
            await new Promise((resolve) => {
                dbHelpers.addConversation(
                    userId, 
                    '[Uploaded receipt image]', 
                    'Receipt image uploaded', 
                    'deposit', 
                    'image', 
                    (err) => {
                        if (err) {
                            console.error('[DB] Error saving receipt:', err.message);
                        } else {
                            console.log(`[DB] ✅✅✅ Saved receipt to database IMMEDIATELY`);
                        }
                        resolve();
                    }
                );
            });
        }
        
        // Load conversation history from database - MERGE with in-memory, don't overwrite
        // CRITICAL: In-memory history (with receipt) takes precedence
        let conversationHistory = agent.conversationHistory.get(userId) || [];
        const inMemoryBeforeLoad = [...conversationHistory]; // Preserve in-memory
        console.log(`[Upload] In-memory history before DB load: ${inMemoryBeforeLoad.length} messages`);
        
        const dbHistory = await new Promise((resolve) => {
            dbHelpers.getConversationHistory(userId, 500, (err, history) => {
                if (err) {
                    console.error('Error loading conversation history:', err);
                    resolve([]);
                } else {
                    const formattedHistory = (history || []).map(h => ({
                        role: 'user',
                        message: h.userMessage,
                        timestamp: h.timestamp,
                        fileType: h.fileType || null
                    })).concat((history || []).map(h => ({
                        role: 'assistant',
                        message: h.botResponse,
                        timestamp: h.timestamp
                    })));
                    resolve(formattedHistory);
                }
            });
        });
        
        // MERGE: Start with in-memory (has receipt), add DB messages that don't exist
        conversationHistory = [...inMemoryBeforeLoad];
        for (const dbMsg of dbHistory) {
            const exists = conversationHistory.some(m => 
                m.message === dbMsg.message && 
                m.role === dbMsg.role &&
                Math.abs(new Date(m.timestamp || 0) - new Date(dbMsg.timestamp || 0)) < 5000
            );
            if (!exists) {
                conversationHistory.push(dbMsg);
            }
        }
        
        // Update in-memory with merged history (preserves receipt)
        agent.conversationHistory.set(userId, conversationHistory);
        console.log(`[Upload] After merge - history length: ${conversationHistory.length}, receipt in memory: ${conversationHistory.some(h => h.role === 'user' && h.fileType === 'image')}`);
        
        // Try multiple ways to get order number
        let extractedOrderNumber = orderNumber || 
                                   agent.extractOrderNumber(req.body.message || '') ||
                                   agent.extractOrderNumberFromHistory(conversationHistory);
        
        // Also check recent messages in the conversation for order number
        if (!extractedOrderNumber && conversationHistory.length > 0) {
            for (let i = conversationHistory.length - 1; i >= 0 && i >= conversationHistory.length - 10; i--) {
                const msg = conversationHistory[i];
                if (msg.role === 'user') {
                    const found = agent.extractOrderNumber(msg.message);
                    if (found) {
                        extractedOrderNumber = found;
                        break;
                    }
                }
            }
        }
        
        // Extract PDF password from conversation history if not provided in request
        let extractedPassword = pdfPassword;
        if (!extractedPassword && conversationHistory.length > 0) {
            // Look for password patterns in recent messages
            const passwordPatterns = [
                /password[:\s]*([A-Z0-9]{4,})/i,
                /pdf[:\s]*password[:\s]*([A-Z0-9]{4,})/i,
                /pass[:\s]*([A-Z0-9]{4,})/i,
                /pwd[:\s]*([A-Z0-9]{4,})/i
            ];
            
            // Check last 10 messages (most recent first)
            for (let i = conversationHistory.length - 1; i >= 0 && i >= conversationHistory.length - 10; i--) {
                const msg = conversationHistory[i];
                if (msg.role === 'user') {
                    for (const pattern of passwordPatterns) {
                        const match = msg.message.match(pattern);
                        if (match && match[1]) {
                            extractedPassword = match[1].trim();
                            console.log(`[Password Extraction] Found password in conversation: ${extractedPassword.substring(0, 3)}***`);
                            break;
                        }
                    }
                    if (extractedPassword) break;
                }
            }
        }
        
        // CRITICAL: Run OCR FIRST for images, even if no order number yet
        // This ensures UPI/UTR are extracted and stored for later use when order number is provided
        let validation = {
            isSuccessful: false,
            isValid: true,
            confidence: 100,
            foundOrderNumber: extractedOrderNumber,
            foundUPI: null,
            foundUTR: null,
            foundAmount: null,
            foundDate: null,
            isOldDeposit: false,
            databaseMatch: null,
            issues: [],
            warnings: []
        };
        
        let success = false;
        // Telegram caption will be built based on validation results
        let telegramCaption = '';
        
        if (isImage) {
            // Receipt already stored above - just verify it's still there
            const receiptStillThere = agent.conversationHistory.get(userId).some(h => 
                h.role === 'user' && h.fileType === 'image'
            );
            console.log(`[Upload] Receipt verification - Still in memory: ${receiptStillThere}`);
            
            // CRITICAL: Run OCR FIRST, even if no order number yet
            // This ensures UPI/UTR are extracted and stored for later use
            try {
                validation = await validateReceipt(req.file.buffer);
                console.log('[Upload] ✅ OCR validation completed successfully');
                console.log(`[Upload] Validation results - UPI: ${validation?.foundUPI || 'null'}, UTR: ${validation?.foundUTR || 'null'}, Amount: ${validation?.foundAmount || 'null'}, Date: ${validation?.foundDate || 'null'}`);
                
                // Update receipt message with validation results
                const lastMessage = agent.conversationHistory.get(userId)[agent.conversationHistory.get(userId).length - 1];
                if (lastMessage && lastMessage.fileType === 'image') {
                    lastMessage.receiptValid = validation.isValid !== false;
                    lastMessage.receiptValidation = validation;
                }
                
                // CRITICAL: Also update receiptImageStorage with validation data
                // This ensures validation data is available when order number is provided later
                let receiptStorage = receiptImageStorage.get(userId);
                if (receiptStorage) {
                    receiptStorage.validation = validation;
                    receiptImageStorage.set(userId, receiptStorage);
                    console.log(`[Upload] ✅ Updated receiptImageStorage with validation data for userId: ${userId}`);
                    console.log(`[Upload] Validation stored in receiptStorage - UPI: ${validation?.foundUPI || 'null'}, UTR: ${validation?.foundUTR || 'null'}`);
                } else {
                    // If receiptStorage doesn't exist yet, create it with validation
                    // This handles the case where receipt is uploaded first without order number
                    receiptStorage = {
                        buffer: req.file.buffer,
                        timestamp: new Date(),
                        orderNumber: null,
                        validation: validation
                    };
                    receiptImageStorage.set(userId, receiptStorage);
                    console.log(`[Upload] ✅ Created receiptImageStorage with validation data (receipt uploaded first)`);
                    console.log(`[Upload] Validation stored - UPI: ${validation?.foundUPI || 'null'}, UTR: ${validation?.foundUTR || 'null'}`);
                }
            } catch (ocrError) {
                console.error('[Upload] ❌ OCR validation error:', ocrError);
                console.error('[Upload] ❌ OCR error stack:', ocrError.stack);
                // Continue with basic validation even if OCR fails
                validation = {
                    ...validation,
                    isValid: true,
                    confidence: 0,
                    issues: [...(validation.issues || []), `OCR processing error: ${ocrError.message}`],
                    warnings: [...(validation.warnings || []), 'Could not extract details from image']
                };
                console.log('[Upload] ⚠️ Continuing with basic validation despite OCR error');
                console.log(`[Upload] Validation after error - UPI: ${validation?.foundUPI || 'null'}, UTR: ${validation?.foundUTR || 'null'}`);
                
                // Update receipt message with error validation
                const lastMessage = agent.conversationHistory.get(userId)[agent.conversationHistory.get(userId).length - 1];
                if (lastMessage && lastMessage.fileType === 'image') {
                    lastMessage.receiptValid = true;
                    lastMessage.receiptValidation = validation;
                }
                
                // CRITICAL: Also update receiptImageStorage with validation data
                // This ensures validation data is available when order number is provided later
                let receiptStorage = receiptImageStorage.get(userId);
                if (receiptStorage) {
                    receiptStorage.validation = validation;
                    receiptImageStorage.set(userId, receiptStorage);
                    console.log(`[Upload] ✅ Updated receiptImageStorage with validation data (error case) for userId: ${userId}`);
                } else {
                    // If receiptStorage doesn't exist yet, create it with validation
                    receiptStorage = {
                        buffer: req.file.buffer,
                        timestamp: new Date(),
                        orderNumber: null,
                        validation: validation
                    };
                    receiptImageStorage.set(userId, receiptStorage);
                    console.log(`[Upload] ✅ Created receiptImageStorage with validation data (error case, receipt uploaded first)`);
                }
            }
            
            // Use order number from OCR if found, otherwise use the one from conversation history
            const orderNumberToCheck = validation.foundOrderNumber || extractedOrderNumber;
            validation.foundOrderNumber = orderNumberToCheck || extractedOrderNumber;
            
            if (orderNumberToCheck) {
                await new Promise((resolve) => {
                    agent.checkOrderNumberInDatabase(orderNumberToCheck, (err, orderData) => {
                        if (!err && orderData && orderData.found) {
                            validation.isSuccessful = true;
                            validation.databaseMatch = orderData;
                        }
                        resolve();
                    });
                });
            }
            
            // Check if receipt is 2+ days old - try multiple date sources
            let receiptDate = null;
            
            // 1. PRIORITY: Use OCR transaction date (most accurate - actual date from receipt)
            console.log(`[Date Check] Validation object:`, validation ? { foundDate: validation.foundDate, hasValidation: true } : { hasValidation: false });
            if (validation && validation.foundDate) {
                try {
                    // Parse the date string (format: YYYY-MM-DD, e.g., "2026-02-02")
                    const ocrDateStr = validation.foundDate;
                    console.log(`[Date Check] Attempting to parse OCR date: ${ocrDateStr}`);
                    // Add time component to ensure correct parsing (use midnight UTC)
                    const ocrDateObj = new Date(ocrDateStr + 'T00:00:00Z');
                    console.log(`[Date Check] Parsed OCR date object: ${ocrDateObj.toISOString()}, isValid: ${!isNaN(ocrDateObj.getTime())}`);
                    if (!isNaN(ocrDateObj.getTime())) {
                        receiptDate = ocrDateObj;
                        console.log(`[Date Check] ✅ Using OCR transaction date: ${ocrDateStr} -> ${receiptDate.toISOString()}`);
                    } else {
                        console.log(`[Date Check] ⚠️ OCR date invalid: ${ocrDateStr}`);
                    }
                } catch (e) {
                    console.log(`[Date Check] ⚠️ OCR date parsing error: ${e.message}`);
                }
            } else {
                console.log(`[Date Check] ⚠️ No OCR date found in validation - validation: ${validation ? 'exists' : 'null'}, foundDate: ${validation?.foundDate || 'null'}`);
            }
            
            // 2. Fallback: Try date from conversation history (if OCR date not available)
            if (!receiptDate) {
                const historyDate = agent.extractReceiptDate(conversationHistory, extractedOrderNumber);
                if (historyDate) {
                    const historyDateObj = new Date(historyDate);
                    if (!isNaN(historyDateObj.getTime())) {
                        receiptDate = historyDateObj;
                        console.log(`[Date Check] Using date from conversation history: ${receiptDate.toISOString()}`);
                    }
                } else {
                    // If no history date found, this might be the first upload
                    console.log(`[Date Check] No previous receipt found in conversation history - this might be first upload`);
                }
            }
            
            // 3. Try date from order number (format: s05YYMMDD... or d05YYMMDD...)
            // Example: s052601231426497799910 = s05 + 260123 (YYMMDD) + ...
            // Example: d052601311545434000470 = d05 + 260131 (YYMMDD) + ...
            // Only use if conversation history date is not available
            if (!receiptDate && orderNumberToCheck) {
                const orderDateMatch = orderNumberToCheck.match(/^(s05|d05)(\d{6})/i);
                if (orderDateMatch) {
                    const dateStr = orderDateMatch[2]; // YYMMDD
                    const year = 2000 + parseInt(dateStr.substring(0, 2));
                    const month = parseInt(dateStr.substring(2, 4)) - 1; // Month is 0-indexed
                    const day = parseInt(dateStr.substring(4, 6));
                    
                    const orderNumberDate = new Date(year, month, day);
                    if (!isNaN(orderNumberDate.getTime())) {
                        const now = new Date();
                        // Only use order number date if it's not in the future (within reasonable range)
                        // If date is more than 1 year in the future, it's likely wrong format
                        const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
                        
                        if (orderNumberDate <= oneYearFromNow && orderNumberDate <= now) {
                        console.log(`[Date Check] Extracted date from order number ${orderNumberToCheck}: ${dateStr} -> ${orderNumberDate.toISOString()}`);
                        console.log(`[Date Check] Parsed date components: Year=${year}, Month=${month+1}, Day=${day}`);
                        receiptDate = orderNumberDate;
                        } else {
                            console.log(`[Date Check] Order number date is in the future or too far ahead, ignoring: ${orderNumberDate.toISOString()}`);
                        }
                    } else {
                        console.log(`[Date Check] Invalid date parsed from order number: ${orderNumberToCheck}`);
                    }
                } else {
                    console.log(`[Date Check] Order number ${orderNumberToCheck} does not match date pattern (expected s05/d05 + 6 digits)`);
                }
            }
            
            // 4. If still no date, try to estimate from order number pattern
            // If order number suggests it's old (based on pattern), we should still check
            if (!receiptDate && orderNumberToCheck) {
                // Try to extract date from order number even if format is slightly different
                // Some order numbers might have dates in different positions
                console.log(`[Date Check] No date found yet - will use order number date if valid`);
            }
            
            // 5. Final fallback: If we have an order number but it's NOT in database,
            // and we can't determine the date, we should still consider asking for PDF/video
            // as a precaution if the order number format suggests it might be old
            if (!receiptDate && orderNumberToCheck && !validation.isSuccessful) {
                // Use a conservative approach: if order is not in DB and we can't determine age,
                // we'll let it through as "processing" but the frontend can still check isOldDeposit flag
                console.log(`[Date Check] No date found, order not in DB - will proceed with processing message`);
                receiptDate = null; // Don't set a date, so 2+ days check won't trigger
                // But we'll still set isOldDeposit to false so frontend knows
                validation.isOldDeposit = false;
            }
            
            // Store receipt image buffer for Telegram sending (if receipt is recent)
            if (isImage && req.file && req.file.buffer) {
                // Preserve existing receiptStorage if it exists, otherwise create new
                const existingStorage = receiptImageStorage.get(userId);
                const storageToSet = existingStorage || {
                    buffer: req.file.buffer,
                    timestamp: new Date(),
                    orderNumber: extractedOrderNumber || null,
                    validation: validation
                };
                
                // Always update with latest validation and buffer
                storageToSet.buffer = req.file.buffer;
                storageToSet.timestamp = existingStorage?.timestamp || new Date();
                storageToSet.orderNumber = extractedOrderNumber || existingStorage?.orderNumber || null;
                
                // CRITICAL: Preserve existing validation if it has UPI/UTR and new validation doesn't
                // This handles the case where receipt was uploaded first, then order number provided later
                console.log(`[Upload] 🔍 Checking validation before merge - existing: ${!!existingStorage?.validation}, new: ${!!validation}`);
                if (existingStorage?.validation) {
                    console.log(`[Upload] Existing validation - UPI: ${existingStorage.validation.foundUPI || 'null'}, UTR: ${existingStorage.validation.foundUTR || 'null'}`);
                }
                if (validation) {
                    console.log(`[Upload] New validation - UPI: ${validation.foundUPI || 'null'}, UTR: ${validation.foundUTR || 'null'}`);
                }
                
                if (existingStorage?.validation && validation) {
                    // Merge validation - prefer existing if it has UPI/UTR that new validation is missing
                    const mergedValidation = { ...validation };
                    if (!mergedValidation.foundUPI && existingStorage.validation.foundUPI) {
                        mergedValidation.foundUPI = existingStorage.validation.foundUPI;
                        console.log(`[Upload] ✅ Preserved existing UPI from previous validation: ${mergedValidation.foundUPI}`);
                    }
                    if (!mergedValidation.foundUTR && existingStorage.validation.foundUTR) {
                        mergedValidation.foundUTR = existingStorage.validation.foundUTR;
                        console.log(`[Upload] ✅ Preserved existing UTR from previous validation: ${mergedValidation.foundUTR}`);
                    }
                    if (!mergedValidation.foundAmount && existingStorage.validation.foundAmount) {
                        mergedValidation.foundAmount = existingStorage.validation.foundAmount;
                    }
                    if (!mergedValidation.foundDate && existingStorage.validation.foundDate) {
                        mergedValidation.foundDate = existingStorage.validation.foundDate;
                    }
                    storageToSet.validation = mergedValidation;
                    console.log(`[Upload] ✅ Merged validation - Final UPI: ${mergedValidation.foundUPI || 'null'}, Final UTR: ${mergedValidation.foundUTR || 'null'}`);
                } else if (existingStorage?.validation && !validation) {
                    // If new validation is missing but existing has it, preserve existing
                    console.log(`[Upload] ⚠️ New validation missing, preserving existing validation`);
                    storageToSet.validation = existingStorage.validation;
                } else {
                    // Use latest validation (either existing or new)
                    // BUT: If existing has UPI/UTR and new doesn't, preserve existing
                    if (existingStorage?.validation && validation) {
                        // Both exist - merge them
                        const mergedValidation = { ...validation };
                        if (!mergedValidation.foundUPI && existingStorage.validation.foundUPI) {
                            mergedValidation.foundUPI = existingStorage.validation.foundUPI;
                        }
                        if (!mergedValidation.foundUTR && existingStorage.validation.foundUTR) {
                            mergedValidation.foundUTR = existingStorage.validation.foundUTR;
                        }
                        storageToSet.validation = mergedValidation;
                        console.log(`[Upload] ✅ Merged validations - UPI: ${mergedValidation.foundUPI || 'null'}, UTR: ${mergedValidation.foundUTR || 'null'}`);
                    } else {
                        // Use whichever has UPI/UTR, or prefer existing if both are missing
                        if (existingStorage?.validation && 
                            (existingStorage.validation.foundUPI || existingStorage.validation.foundUTR)) {
                            console.log(`[Upload] ✅ Preserving existing validation with UPI/UTR`);
                            storageToSet.validation = existingStorage.validation;
                        } else {
                            storageToSet.validation = validation || existingStorage?.validation;
                            console.log(`[Upload] Using ${validation ? 'new' : 'existing'} validation`);
                        }
                    }
                }
                
                // FINAL CHECK: Ensure validation is never null/undefined
                if (!storageToSet.validation) {
                    console.error(`[Upload] ❌ CRITICAL: Validation is null/undefined after all checks!`);
                    // Try to get validation from conversation history as last resort
                    const lastMessage = agent.conversationHistory.get(userId)?.findLast(h => 
                        h.role === 'user' && h.fileType === 'image' && h.receiptValidation
                    );
                    if (lastMessage?.receiptValidation) {
                        storageToSet.validation = lastMessage.receiptValidation;
                        console.log(`[Upload] ✅ Recovered validation from conversation history`);
                    }
                }
                
                receiptImageStorage.set(userId, storageToSet);
                console.log(`[Upload] ✅ Stored receipt image buffer for Telegram sending`);
                console.log(`[Upload] Final validation stored - UPI: ${storageToSet.validation?.foundUPI || 'null'}, UTR: ${storageToSet.validation?.foundUTR || 'null'}`);
                console.log(`[Upload] Validation object exists: ${!!storageToSet.validation}, has UPI: ${!!storageToSet.validation?.foundUPI}, has UTR: ${!!storageToSet.validation?.foundUTR}`);
            }
            
            // 5. Check if receipt is 2+ days old
            // Also check: if order is NOT in database and we have order number, consider it might be old
            const now = new Date();
            let isOld = false;
            let diffDays = 0;
            
            if (receiptDate && !isNaN(receiptDate.getTime())) {
                isOld = agent.isReceiptOlderThan2Days(receiptDate);
                validation.isOldDeposit = isOld;
                
                const diffTime = Math.abs(now - receiptDate);
                diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                console.log(`[Date Check] Receipt date: ${receiptDate.toISOString()}`);
                console.log(`[Date Check] Current date: ${now.toISOString()}`);
                console.log(`[Date Check] Days difference: ${diffDays}`);
                console.log(`[Date Check] Is old (>2 days): ${isOld}`);
            } else {
                // No date found - treat as "deposit not received", but DO NOT send to Telegram in reverse flow
                console.log(`[Date Check] ⚠️ No receipt date found - reverse flow: do not send to Telegram`);
                
                if (!extractedOrderNumber && isImage) {
                    // Receipt uploaded but no order number yet - wait for order number
                    // When order number is provided later, it will be handled in /api/chat
                    console.log(`[Date Check] Receipt uploaded but no order number yet - will evaluate for Telegram once order number is provided`);
                    isOld = false;
                    validation.isOldDeposit = false;
                    diffDays = 0;
                } else {
                    // IMPORTANT: If order number is found but NOT in database,
                    // and we can't determine the date, keep current behavior for PDF/video request
                    if (!validation.isSuccessful && validation.foundOrderNumber && isImage) {
                        console.log(`[Date Check] Order not in DB, order number found, no date - asking for PDF/video as precaution`);
                        isOld = true; // Treat as old to trigger PDF/video request
                        validation.isOldDeposit = true;
                        diffDays = 3; // Assume it's been a few days
                    }
                }
            }
            
            console.log(`[Date Check] Is successful: ${validation.isSuccessful}`);
            console.log(`[Date Check] Found order number: ${validation.foundOrderNumber}`);
            console.log(`[Date Check] Final isOld: ${isOld}`);
            console.log(`[Date Check] Condition check: isOld=${isOld} && !isSuccessful=${!validation.isSuccessful} && foundOrderNumber=${validation.foundOrderNumber} = ${isOld && !validation.isSuccessful && validation.foundOrderNumber}`);
            
            // UNIFIED TELEGRAM SENDING - Use the unified function for ALL scenarios
            // This handles: receipt recent, no date detected, receipt old
            // NOTE: Only send if order number is in THIS upload (both at same time)
            // If order number was provided earlier, it will be handled by /api/chat endpoint
            if (extractedOrderNumber && isImage && validation.foundOrderNumber === extractedOrderNumber) {
                // CRITICAL: If receipt is old (>2 days) and order not found, DON'T send immediately
                // Wait for PDF/password/video to be provided, then send everything together
                if (isOld && !validation.isSuccessful) {
                    console.log(`[Upload Telegram] ⏭️ Receipt is old (>2 days) and order not found - NOT sending immediately, will wait for PDF/password/video`);
                    // Receipt will be sent when all files are received via sendBatchFilesToTelegram
                } else {
                console.log(`[Upload Telegram] Order number found in THIS upload - will send to Telegram`);
                
                // Prepare receipt info object for unified function
                const receiptInfoForTelegram = {
                    foundUPI: validation.foundUPI || null,
                    foundUTR: validation.foundUTR || null,
                    foundAmount: validation.foundAmount || null,
                    foundDate: validation.foundDate || null
                };
                
                // Use unified function to handle all scenarios
                // Note: If req.file.buffer exists, it's already stored in receiptImageStorage above
                setTimeout(async () => {
                    await sendReceiptToTelegramIfNeeded(userId, extractedOrderNumber, receiptInfoForTelegram, receiptDate, isOld, conversationHistory);
                }, 500);
                }
            } else if (isImage && !extractedOrderNumber) {
                // Receipt uploaded but no order number in THIS message
                // Check if order number exists in conversation history (order number provided earlier)
                const orderNumberFromHistory = agent.extractOrderNumberFromHistory(conversationHistory);
                if (orderNumberFromHistory) {
                    console.log(`[Upload Telegram] Order number found in history (${orderNumberFromHistory}) - will send to Telegram`);
                    
                    // Prepare receipt info object for unified function
                    const receiptInfoForTelegram = {
                        foundUPI: validation.foundUPI || null,
                        foundUTR: validation.foundUTR || null,
                        foundAmount: validation.foundAmount || null,
                        foundDate: validation.foundDate || null
                    };
                    
                    // Use unified function to handle all scenarios
                    setTimeout(async () => {
                        await sendReceiptToTelegramIfNeeded(userId, orderNumberFromHistory, receiptInfoForTelegram, receiptDate, isOld, conversationHistory);
                    }, 500);
                } else {
                    console.log(`[Upload Telegram] No order number in upload or history - will wait for order number`);
                }
            }
                
            // IMPORTANT: Check if order is NOT in database AND we have an order number
            // This means it's still processing, and if it's 2+ days old (or we can't determine), we need PDF/video
            if (isOld && !validation.isSuccessful && validation.foundOrderNumber) {
                    console.log(`[Date Check] ✅ TRIGGERING 2+ DAYS CHECK - Using OpenAI to ask for PDF and video`);
                    
                // Use diffDays already calculated above, or use the default value
                if (diffDays === 0) {
                    diffDays = 3; // Default to 3 days if not calculated
                }
                    
                    // Use template response asking for PDF and video
                    const responseMessage = await agent.generateTemplateResponse(
                        '',
                        'deposit',
                        language,
                        {
                            orderNumber: orderNumberToCheck || extractedOrderNumber,
                            orderFound: false,
                            hasReceipt: true,
                            isOldReceipt: true,
                            receiptAgeDays: diffDays,
                            fileType: 'image'
                        },
                        {},
                        userId
                    );
                    
                    // Ensure responseMessage is always a string
                    const finalResponseMessage = (responseMessage && typeof responseMessage === 'string') 
                        ? responseMessage 
                        : String(responseMessage || 'Please provide PDF and video for verification.');
                    
                    console.log(`[Date Check] Template response generated:`, finalResponseMessage);
                    // Return the message asking for PDF and video
                    const responseData = {
                        success: true,
                        message: finalResponseMessage,
                        fileType: 'image',
                        orderNumber: orderNumberToCheck || extractedOrderNumber,
                        validation: validation,
                        requiresPDFAndVideo: true
                    };
                    console.log(`[Date Check] Full response data:`, JSON.stringify(responseData, null, 2));
                    console.log(`[Date Check] Sending response to client NOW...`);
                    
                // DON'T send to Telegram yet - wait for PDF, password, and video
                // Store receipt image in pendingFiles to send later when all files are ready
                const storageKey = `${userId}_${extractedOrderNumber || 'no_order'}`;
                if (!pendingFiles.has(storageKey)) {
                    pendingFiles.set(storageKey, {
                        pdfs: [],
                        videos: [],
                        images: [],
                        password: null
                    });
                }
                const storage = pendingFiles.get(storageKey);
                
                // Store receipt image
                storage.images.push({
                    buffer: req.file.buffer,
                    filename: req.file.originalname || 'receipt.jpg',
                    validation: validation,
                    orderNumber: validation.foundOrderNumber || extractedOrderNumber
                });
                
                console.log(`[Telegram Hold] Stored receipt image in pendingFiles. Waiting for PDF, password, and video before sending to Telegram.`);
                    
                    agent.conversationHistory.get(userId).push({
                        role: 'user',
                        message: `[Uploaded receipt image]`,
                        fileType: 'image',
                        timestamp: new Date().toISOString()
                    });
                    
                    // Minimal delay before sending response (reduced from 1.5s to 200ms for faster response)
                    console.log(`[Date Check] Waiting 200ms before sending response (sync delay)...`);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // Return response to client - THIS MUST BE THE LAST THING
                    console.log(`[Date Check] ✅ SENDING RESPONSE TO CLIENT NOW`);
                    console.log(`[Date Check] Response will have requiresPDFAndVideo:`, responseData.requiresPDFAndVideo);
                    console.log(`[Date Check] Response will have message length:`, responseData.message.length);
                    console.log(`[Date Check] Response headers sent?`, res.headersSent);
                    
                    // IMPORTANT: Send response and exit immediately - no code should run after this
                    if (!res.headersSent) {
                        res.json(responseData);
                        console.log(`[Date Check] ✅✅✅ RESPONSE SENT SUCCESSFULLY`);
                    } else {
                        console.log(`[Date Check] ⚠️ WARNING: Headers already sent, cannot send response`);
                    }
                    return; // Explicit return to exit function
            }
            
            // Only continue if we haven't sent a response yet
            if (res.headersSent) {
                console.log('[Response] Headers already sent from 2+ days check, exiting');
                return;
            }
            
            // OLD CODE REMOVED - All Telegram sending now goes through unified function above
            // This prevents duplicate sends
            
            // Check if this is a successful validation (order found in database)
            // If successful, send immediately. Otherwise, wait for PDF/video if required
            if (validation.isSuccessful) {
                // Order found in database - send immediately (only if not already sent above)
                // No caption on photo - user requested no text on photos/videos
                if (!isReceiptRecentSecond) {
                    success = await telegramNotifier.sendPhoto(userId, req.file.buffer, '');
                }
            } else {
                // Order not found - don't send yet, wait for PDF/video if they will be required
                // Store receipt image in pendingFiles
                const storageKey = `${userId}_${extractedOrderNumber || 'no_order'}`;
                if (!pendingFiles.has(storageKey)) {
                    pendingFiles.set(storageKey, {
                        pdfs: [],
                        videos: [],
                        images: [],
                        password: null
                    });
                }
                const storage = pendingFiles.get(storageKey);
                
                // Store receipt image
                storage.images.push({
                    buffer: req.file.buffer,
                    filename: req.file.originalname || 'receipt.jpg',
                    validation: validation,
                    orderNumber: validation.foundOrderNumber || extractedOrderNumber
                });
                
                console.log(`[Telegram Hold] Stored receipt image in pendingFiles. Will send to Telegram when PDF, password, and video are provided.`);
                success = true; // Mark as successful so response continues
            }
            
            // Receipt already stored at the beginning - just verify it's still there
            const receiptInMemory = agent.conversationHistory.get(userId).some(h => 
                h.role === 'user' && h.fileType === 'image'
            );
            console.log(`[Receipt Storage] ✅ Verification - Receipt in memory: ${receiptInMemory}, history length: ${agent.conversationHistory.get(userId).length}`);
            
            // CRITICAL: Immediately add receipt upload to OpenAI thread so AI can see it
            if (agent.openaiClient && agent.assistantId) {
                try {
                    const threadId = await agent.getOrCreateThread(userId);
                    if (threadId) {
                        const receiptContent = `[Customer uploaded deposit receipt (image)]\nOrder number from receipt: ${validation.foundOrderNumber || 'Not found'}\nUPI Reference: ${validation.foundUPI || 'Not found'}\nAmount: ${validation.foundAmount || 'Not found'}\nDate: ${validation.foundDate || 'Not found'}\nValidation: ${validation.isValid ? 'Valid' : 'Invalid'}`;
                        await agent.openaiClient.beta.threads.messages.create(threadId, {
                            role: 'user',
                            content: receiptContent
                        });
                        console.log(`[OpenAI] ✅ Added receipt upload to thread ${threadId} immediately`);
                    }
                } catch (error) {
                    console.error(`[OpenAI] Error adding receipt to thread:`, error.message);
                }
            }
            
            // Receipt will be saved to database after response is generated (see end of handler)
        }
        
        if (isPDF || isVideo) {
            const storageKey = `${userId}_${extractedOrderNumber}`;
            
            if (!pendingFiles.has(storageKey)) {
                pendingFiles.set(storageKey, {
                    pdfs: [],
                    videos: [],
                    images: [],
                    orderNumber: extractedOrderNumber,
                    password: extractedPassword || pdfPassword,
                    timestamp: Date.now()
                });
            }
            
            const storage = pendingFiles.get(storageKey);
            
            // Update password if found in conversation (even if storage already exists)
            if (extractedPassword && !storage.password) {
                storage.password = extractedPassword;
                console.log(`[Password Update] Updated password for storage key: ${storageKey}`);
            }
            
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
            
            // CRITICAL: Immediately add PDF/Video upload to OpenAI thread
            if (agent.openaiClient && agent.assistantId) {
                try {
                    const threadId = await agent.getOrCreateThread(userId);
                    if (threadId) {
                        const fileTypeName = isPDF ? 'PDF bank statement' : 'video recording';
                        const fileContent = `[Customer uploaded ${fileTypeName}]\nFile: ${req.file.originalname || (isPDF ? 'document.pdf' : 'video.mp4')}`;
                        await agent.openaiClient.beta.threads.messages.create(threadId, {
                            role: 'user',
                            content: fileContent
                        });
                        console.log(`[OpenAI] ✅ Added ${fileTypeName} upload to thread ${threadId} immediately`);
                    }
                } catch (error) {
                    console.error(`[OpenAI] Error adding ${isPDF ? 'PDF' : 'video'} to thread:`, error.message);
                }
            }
            
            // Check if password was provided in chat after file upload
            if (!storage.password && conversationHistory.length > 0) {
                const passwordPatterns = [
                    /password[:\s]*([A-Z0-9]{4,})/i,
                    /pdf[:\s]*password[:\s]*([A-Z0-9]{4,})/i,
                    /pass[:\s]*([A-Z0-9]{4,})/i,
                    /pwd[:\s]*([A-Z0-9]{4,})/i
                ];
                
                // Check last 10 messages for password
                for (let i = conversationHistory.length - 1; i >= 0 && i >= conversationHistory.length - 10; i--) {
                    const msg = conversationHistory[i];
                    if (msg.role === 'user') {
                        for (const pattern of passwordPatterns) {
                            const match = msg.message.match(pattern);
                            if (match && match[1]) {
                                storage.password = match[1].trim();
                                console.log(`[Password Update] Found password in chat after upload: ${storage.password.substring(0, 3)}***`);
                                break;
                            }
                        }
                        if (storage.password) break;
                    }
                }
            }
            
            // CRITICAL: Wait for ALL required files (PDF + video + password) before sending
            // This ensures all files are sent together regardless of the order they arrive (vice versa)
            const hasPDF = storage.pdfs.length > 0;
            const hasVideo = storage.videos.length > 0;
            const hasPassword = storage.password && storage.password.trim().length > 0;
            const hasImages = storage.images && storage.images.length > 0;
            
            // Send ONLY when ALL files are ready: PDF + video + password
            const hasAllFiles = hasPDF && hasVideo && hasPassword;
            
            console.log(`[Upload Telegram Check] hasPDF: ${hasPDF}, hasVideo: ${hasVideo}, hasPassword: ${hasPassword}, hasAllFiles: ${hasAllFiles}`);
            
            if (hasAllFiles) {
                console.log(`[Telegram Send] ✅✅✅ All files ready: ${storage.pdfs.length} PDF(s), ${storage.videos.length} video(s), password: provided, ${storage.images ? storage.images.length : 0} image(s). Sending all files to Telegram...`);
                // Use setImmediate for immediate execution (no delay)
                setImmediate(async () => {
                    const files = pendingFiles.get(storageKey);
                    // CRITICAL: Send all files together when all requirements are met
                    if (files && files.pdfs.length > 0 && files.videos.length > 0 && files.password) {
                        console.log(`[Telegram Send] ✅ Verifying files before send - PDF: ${files.pdfs.length}, Video: ${files.videos.length}, Password: ${files.password ? 'yes (' + files.password.substring(0, 3) + '***)' : 'no'}`);
                        console.log(`[Telegram Send] 🚀🚀🚀 Executing sendBatchFilesToTelegram NOW...`);
                        // CRITICAL: Add receipt photo from receiptImageStorage to files.images if not already there
                        const receiptStorage = receiptImageStorage.get(userId);
                        if (receiptStorage && receiptStorage.buffer) {
                            // Check if receipt photo is already in files.images
                            const receiptAlreadyIncluded = files.images && files.images.some(img => 
                                img.buffer && img.buffer.equals && img.buffer.equals(receiptStorage.buffer)
                            );
                            
                            if (!receiptAlreadyIncluded) {
                                // Add receipt photo to files.images
                                if (!files.images) {
                                    files.images = [];
                                }
                                files.images.unshift({
                                    buffer: receiptStorage.buffer,
                                    validation: receiptStorage.validation || null
                                });
                                console.log(`[Telegram Send] ✅ Added receipt photo from receiptImageStorage to files.images`);
                            }
                        }
                        
                        try {
                            await sendBatchFilesToTelegram(userId, files, extractedOrderNumber);
                            pendingFiles.delete(storageKey);
                            // Clear receiptImageStorage after successful send
                            if (receiptStorage) {
                                receiptImageStorage.delete(userId);
                            }
                            console.log(`[Telegram Send] ✅✅✅ Successfully sent all files to Telegram and cleared pendingFiles.`);
                        } catch (error) {
                            console.error(`[Telegram Send] ❌❌❌ Error sending files to Telegram:`, error);
                            console.error(`[Telegram Send] Error stack:`, error.stack);
                        }
                    } else {
                        console.log(`[Telegram Send] ⚠️ Files verification failed - PDF: ${files?.pdfs?.length || 0}, Video: ${files?.videos?.length || 0}, Password: ${files?.password ? 'yes' : 'no'}`);
                    }
                });
            } else {
                console.log(`[Telegram Hold] ⏳ Waiting for ALL required files. Current: ${storage.pdfs.length} PDF(s), ${storage.videos.length} video(s), password: ${storage.password ? 'provided' : 'missing'}, ${storage.images ? storage.images.length : 0} image(s). Need: PDF + Video + Password.`);
            }
            
            if (extractedOrderNumber) {
                await new Promise((resolve) => {
                    agent.checkOrderNumberInDatabase(extractedOrderNumber, (err, orderData) => {
                        if (!err && orderData && orderData.found) {
                            validation.isSuccessful = true;
                            validation.databaseMatch = orderData;
                        }
                        resolve();
                    });
                });
            }
            
            success = true;
            
            agent.conversationHistory.get(userId).push({
                role: 'user',
                message: `[Uploaded ${isPDF ? 'PDF' : 'video'}]`,
                fileType: isPDF ? 'pdf' : 'video',
                timestamp: new Date().toISOString()
            });
        }
        
        // Check if we already sent a response (e.g., for 2+ days old receipt)
        if (res.headersSent) {
            return;
        }
        
        // Use template-based response system
        let responseMessage = '';
        const history = agent.conversationHistory.get(userId) || [];
        
        if (isImage) {
            // Check receipt age
            let isOldReceipt = false;
            let receiptAgeDays = 0;
            const receiptDate = agent.extractReceiptDate(history, extractedOrderNumber);
            if (receiptDate) {
                isOldReceipt = agent.isReceiptOlderThan2Days(receiptDate);
                const receipt = new Date(receiptDate);
                const now = new Date();
                const diffTime = Math.abs(now - receipt);
                receiptAgeDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            } else {
                // Use validation date if available
                isOldReceipt = validation.isOldDeposit || false;
            }
            
            // CRITICAL: Generate response - MUST ask for order number FIRST if not provided
            const additionalContext = {
                orderNumber: extractedOrderNumber || validation.foundOrderNumber || null,
                orderFound: validation.isSuccessful,
                hasReceipt: true,
                isOldReceipt: isOldReceipt,
                receiptAgeDays: receiptAgeDays,
                fileType: 'image',
                orderData: validation.databaseMatch?.data || null
            };
            
            // CRITICAL: If NO order number, MUST use template to ask for order number FIRST
            // This ensures we follow the correct flow: receipt uploaded → ask for order number → then proceed
            if (!additionalContext.orderNumber) {
                console.log(`[Upload Receipt] ⚠️ Receipt uploaded WITHOUT order number - MUST ask for order number first`);
                responseMessage = await agent.generateTemplateResponse('', 'deposit', language, additionalContext, {}, userId);
                // Ensure responseMessage is always a string
                responseMessage = (responseMessage && typeof responseMessage === 'string') 
                    ? responseMessage 
                    : String(responseMessage || 'Thank you for providing the deposit receipt. To proceed, could you please provide your order number?');
            } else {
                // Order number exists - can use OpenAI or template
            // Use OpenAI if available, otherwise use templates
            if (agent.openaiClient && agent.assistantId) {
                try {
                    responseMessage = await agent.generateOpenAIResponse(
                        'User uploaded deposit receipt image',
                        'deposit',
                        userId,
                        language,
                        additionalContext,
                        {}
                    );
                    // Ensure responseMessage is always a string
                    responseMessage = (responseMessage && typeof responseMessage === 'string') 
                        ? responseMessage 
                        : String(responseMessage || 'Thank you for providing the deposit receipt.');
                } catch (error) {
                    console.error('[OpenAI] Error in receipt upload response, using template:', error.message);
                    responseMessage = await agent.generateTemplateResponse('', 'deposit', language, additionalContext, {}, userId);
                    // Ensure responseMessage is always a string
                    responseMessage = (responseMessage && typeof responseMessage === 'string') 
                        ? responseMessage 
                        : String(responseMessage || 'Thank you for providing the document.');
                }
            } else {
                responseMessage = await agent.generateTemplateResponse('', 'deposit', language, additionalContext, {}, userId);
                // Ensure responseMessage is always a string
                responseMessage = (responseMessage && typeof responseMessage === 'string') 
                    ? responseMessage 
                    : String(responseMessage || 'Thank you for providing the document.');
                }
            }
        } else if (isPDF || isVideo) {
            const storageKey = `${userId}_${extractedOrderNumber}`;
            const storage = pendingFiles.get(storageKey);
            
            // Check if we're in the "waiting for PDF/password/video" scenario
            // This happens when receipt is old (>2 days) and order not found
            const conversationHistory = agent.conversationHistory.get(userId) || [];
            const wasAskedForPDFAndVideo = conversationHistory.some(msg => 
                msg.role === 'assistant' && 
                msg.message && 
                typeof msg.message === 'string' &&
                (msg.message.includes('PDF bank statement') || 
                 msg.message.includes('PDF बैंक') || 
                 msg.message.includes('PDF బ్యాంక్') ||
                 msg.message.includes('video recording'))
            );
            
            // CRITICAL: Check conversation history to see what files have already been received
            const filesInHistory = agent.checkFilesInHistory(conversationHistory);
            
            // Combine current upload with history and pending files
            const hasPDF = filesInHistory.hasPDF || (storage && storage.pdfs.length > 0) || isPDF;
            const hasVideo = filesInHistory.hasVideo || (storage && storage.videos.length > 0) || isVideo;
            const hasPassword = filesInHistory.hasPassword || (storage && storage.password) || false;
            const hasAll = hasPDF && hasVideo && hasPassword;
            
            console.log(`[Upload Receipt] File tracking - PDF: ${hasPDF}, Password: ${hasPassword}, Video: ${hasVideo}, All: ${hasAll}`);
            
            // CRITICAL: If all files are received, send receipt to Telegram NOW
            // This happens when receipt was old (>2 days) and we were waiting for PDF/password/video
            if (hasAll && wasAskedForPDFAndVideo && extractedOrderNumber) {
                console.log(`[Upload Receipt] ✅ All files received (PDF/password/video) - sending receipt to Telegram now`);
                
                // Get receipt info from storage
                const receiptStorage = receiptImageStorage.get(userId);
                let receiptInfo = null;
                let receiptDate = null;
                let isOldReceipt = false;
                
                if (receiptStorage && receiptStorage.validation) {
                    receiptInfo = {
                        foundUPI: receiptStorage.validation.foundUPI || null,
                        foundUTR: receiptStorage.validation.foundUTR || null,
                        foundAmount: receiptStorage.validation.foundAmount || null,
                        foundDate: receiptStorage.validation.foundDate || null
                    };
                    
                    // Extract receipt date
                    if (receiptStorage.validation.foundDate) {
                        try {
                            receiptDate = new Date(receiptStorage.validation.foundDate + 'T00:00:00Z');
                            if (!isNaN(receiptDate.getTime())) {
                                isOldReceipt = agent.isReceiptOlderThan2Days(receiptDate);
                            }
                        } catch (e) {
                            // Ignore
                        }
                    }
                }
                
                // If no date from OCR, try order number date
                if (!receiptDate && extractedOrderNumber) {
                    const orderDate = agent.extractReceiptDate([], extractedOrderNumber);
                    if (orderDate) {
                        receiptDate = orderDate;
                        isOldReceipt = agent.isReceiptOlderThan2Days(receiptDate);
                    }
                }
                
                // CRITICAL: When all files are received, send receipt photo + video together in media group
                // Get receipt image buffer and video buffer (reuse receiptStorage from above)
                const receiptImageBuffer = receiptStorage?.buffer;
                
                // Get video from conversation history
                const videoMessage = conversationHistory.find(h => 
                    h.role === 'user' && h.fileType === 'video'
                );
                const videoBuffer = videoMessage?.buffer || null;
                
                if (receiptImageBuffer && videoBuffer) {
                    // Send receipt photo + video together in media group
                    console.log(`[Upload Receipt] ⏰ Sending receipt photo + video together in media group`);
                    setTimeout(async () => {
                        const mediaArray = [
                            { type: 'photo', media: receiptImageBuffer },
                            { type: 'video', media: videoBuffer }
                        ];
                        
                        // Send media group without caption (user requested no text on photos/videos)
                        const success = await telegramNotifier.sendMediaGroup(userId, mediaArray);
                        if (success) {
                            console.log(`[Upload Receipt] ✅ Successfully sent receipt photo + video to Telegram`);
                            // Mark as sent
                            const sentKey = `${userId}_${extractedOrderNumber}`;
                            telegramSentReceipts.add(sentKey);
                            // Clear storage
                            receiptImageStorage.delete(userId);
                        }
                    }, 1000);
                } else if (receiptImageBuffer) {
                    // Only receipt photo available - send normally
                    setTimeout(async () => {
                        await sendReceiptToTelegramIfNeeded(userId, extractedOrderNumber, receiptInfo, receiptDate, isOldReceipt, conversationHistory);
                    }, 1000);
                }
            }
            
            const additionalContext = {
                orderNumber: extractedOrderNumber,
                fileType: isPDF ? 'pdf' : (isVideo ? 'video' : 'password'),
                hasFileUpload: true,
                hasPDF: hasPDF,
                hasVideo: hasVideo,
                hasPassword: hasPassword,
                hasAllFiles: hasAll,
                waitingForPDFAndVideo: wasAskedForPDFAndVideo || true, // Always true when PDF/video is uploaded (we asked for it)
                waitingForOther: !hasAll, // Still waiting if not all files received
                // Add receipt context to prevent asking for receipt again
                hasReceipt: true, // We already have receipt (that's why we asked for PDF/password/video)
                orderFound: false, // Order not found (that's why we asked for PDF/password/video)
                // CRITICAL: Mark that we're in file upload tracking mode
                isFileUploadTracking: true
            };
            
            console.log(`[Upload Context] PDF: ${hasPDF}, Password: ${hasPassword}, Video: ${hasVideo}, All: ${hasAll}, waitingForPDFAndVideo: ${additionalContext.waitingForPDFAndVideo}, fileType: ${additionalContext.fileType}`);
            
            // CRITICAL: Always generate a response for PDF/video uploads
            // Use template system to ensure accurate file tracking responses
            try {
                responseMessage = await agent.generateTemplateResponse('', 'deposit', language, additionalContext, {}, userId);
                // Ensure responseMessage is always a string
                responseMessage = (responseMessage && typeof responseMessage === 'string') 
                    ? responseMessage 
                    : String(responseMessage || 'Thank you for providing the document.');
                console.log(`[Upload Response] ✅ Generated response for ${isPDF ? 'PDF' : 'video'} upload: "${responseMessage.substring(0, 100)}..."`);
            } catch (templateError) {
                console.error('[Upload Response] Error in template generation:', templateError.message);
                // Fallback to OpenAI if template fails
            if (agent.openaiClient && agent.assistantId) {
                try {
                    responseMessage = await agent.generateOpenAIResponse(
                        `User uploaded ${isPDF ? 'PDF' : 'video'} file`,
                        'deposit',
                        userId,
                        language,
                        additionalContext,
                        {}
                    );
                } catch (error) {
                        console.error('[OpenAI] Error in upload response:', error.message);
                        responseMessage = 'Thank you for providing the document. I have received it.';
                }
            } else {
                    responseMessage = 'Thank you for providing the document. I have received it.';
                }
                // Ensure responseMessage is always a string
                responseMessage = (responseMessage && typeof responseMessage === 'string') 
                    ? responseMessage 
                    : String(responseMessage || 'Thank you for providing the document.');
            }
        }
        
        // Ensure responseMessage is always a string
        const finalResponseMessage = (responseMessage && typeof responseMessage === 'string') 
            ? responseMessage 
            : String(responseMessage || 'Thank you for providing the document. We will process it shortly.');
        
        // CRITICAL: Save receipt upload to database IMMEDIATELY with fileType
        // This ensures receipt is available when order number is sent later
        // CRITICAL: Save BEFORE sending response to ensure it's in database when order number arrives
        if (isImage || isPDF || isVideo) {
            const uploadMessage = isImage ? '[Uploaded receipt image]' : (isPDF ? '[Uploaded PDF document]' : '[Uploaded video recording]');
            const fileTypeForDB = isImage ? 'image' : (isPDF ? 'pdf' : 'video');
            
            // For images, save IMMEDIATELY after storing in memory (before validation completes)
            // For PDF/video, save after processing
            if (isImage) {
                // Save image receipt to database immediately
                await new Promise((resolve) => {
                    dbHelpers.addConversation(
                        userId, 
                        uploadMessage, 
                        'Receipt image uploaded', 
                        'deposit', 
                        fileTypeForDB, 
                        (err) => {
                            if (err) {
                                console.error('[DB] Error saving receipt:', err.message);
                            } else {
                                console.log(`[DB] ✅ Saved receipt to database IMMEDIATELY`);
                            }
                            resolve();
                        }
                    );
                });
            }
        }
        
        res.json({
            success: success,
            message: finalResponseMessage,
            fileType: isImage ? 'image' : (isPDF ? 'pdf' : 'video'),
            orderNumber: extractedOrderNumber,
            validation: validation
        });
    } catch (error) {
        console.error('[Upload Error] Error in /api/upload-receipt:', error);
        console.error('[Upload Error] Stack:', error.stack);
        
        // Provide more specific error messages
        let errorMessage = 'Error processing receipt. Please try again.';
        let errorCode = 'UPLOAD_ERROR';
        
        if (error.message && typeof error.message === 'string') {
            if (error.message.includes('file size')) {
                errorMessage = 'File size is too large. Maximum size is 100MB.';
                errorCode = 'FILE_TOO_LARGE';
            } else if (error.message.includes('file type') || error.message.includes('Invalid file')) {
                errorMessage = 'Invalid file type. Please upload an image (JPG, PNG), PDF, or video (MP4).';
                errorCode = 'INVALID_FILE_TYPE';
            } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
                errorMessage = 'Network error. Please check your connection and try again.';
                errorCode = 'NETWORK_ERROR';
            } else {
                errorMessage = error.message;
            }
        }
        
        // Don't send error details in production
        const errorDetails = process.env.NODE_ENV === 'development' ? { 
            error: error.message,
            stack: error.stack 
        } : {};
        
        res.status(500).json({ 
            success: false, 
            message: errorMessage,
            code: errorCode,
            ...errorDetails
        });
    }
});

// ============================================
// STAFF PANEL ENDPOINTS
// ============================================

// Simple staff authentication (in production, use proper auth)
const STAFF_CREDENTIALS = {
    username: process.env.STAFF_USERNAME || 'admin',
    password: process.env.STAFF_PASSWORD || 'admin123'
};

// Staff login
app.post('/api/staff/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === STAFF_CREDENTIALS.username && password === STAFF_CREDENTIALS.password) {
        // Simple token (in production, use JWT)
        const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Get all conversations (for staff panel)
app.get('/api/staff/conversations', (req, res) => {
    // Simple auth check (in production, verify JWT)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Use chat database for conversations
    chatDb.all(`
        SELECT DISTINCT userId, 
               MAX(timestamp) as lastTimestamp,
               (SELECT botResponse FROM conversations c2 
                WHERE c2.userId = c.userId 
                ORDER BY c2.timestamp DESC LIMIT 1) as lastMessage
        FROM conversations c
        GROUP BY userId
        ORDER BY lastTimestamp DESC
        LIMIT 100
    `, (err, rows) => {
        if (err) {
            console.error('Error fetching conversations:', err);
            return res.status(500).json({ success: false, message: 'Error fetching conversations' });
        }

        const conversations = rows.map(row => ({
            userId: row.userId,
            lastMessage: row.lastMessage || '',
            lastTimestamp: row.lastTimestamp
        }));

        res.json({ success: true, conversations });
    });
});

// Get messages for a specific user
app.get('/api/staff/conversations/:userId', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.params.userId;

    // Use chat database for conversations
    chatDb.all(`
        SELECT userMessage, botResponse, timestamp
        FROM conversations
        WHERE userId = ?
        ORDER BY timestamp ASC
    `, [userId], (err, rows) => {
        if (err) {
            console.error('Error fetching messages:', err);
            return res.status(500).json({ success: false, message: 'Error fetching messages' });
        }

        // Reconstruct conversation with alternating user/bot messages
        const messages = [];
        rows.forEach(row => {
            if (row.userMessage) {
                messages.push({
                    role: 'user',
                    message: row.userMessage,
                    timestamp: row.timestamp
                });
            }
            if (row.botResponse) {
                messages.push({
                    role: 'bot',
                    message: row.botResponse,
                    timestamp: row.timestamp
                });
            }
        });

        res.json({ success: true, messages });
    });
});

// Send manual reply as bot
app.post('/api/staff/reply', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { userId, message } = req.body;

    if (!userId || !message) {
        return res.status(400).json({ success: false, message: 'UserId and message are required' });
    }

    try {
        // Save conversation
        dbHelpers.addConversation(userId, '[Staff Manual Reply]', message, 'staff_reply', (err) => {
            if (err) {
                console.error('Error saving staff reply:', err);
                return res.status(500).json({ success: false, message: 'Error saving reply' });
            }

            // Update conversation history in agent
            if (!agent.conversationHistory.has(userId)) {
                agent.conversationHistory.set(userId, []);
            }
            agent.conversationHistory.get(userId).push({
                role: 'assistant',
                message: message,
                timestamp: new Date().toISOString()
            });

            res.json({ success: true, message: 'Reply sent successfully' });
        });
    } catch (error) {
        console.error('Error in staff reply:', error);
        res.status(500).json({ success: false, message: 'Error sending reply' });
    }
});

// Serve staff panel
app.get('/staff', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'staff.html'));
});

// History endpoint
app.get('/api/history/:userId', (req, res) => {
    const { userId } = req.params;
    dbHelpers.getConversationHistory(userId, 50, (err, history) => {
        if (err) {
            return res.status(500).json({ error: 'Error fetching history' });
        }
        res.json({ history: history || [] });
    });
});

// Root route - serve chat interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// SERVER STARTUP
// ============================================
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Chat interface: http://localhost:${PORT}`);
    console.log(`Staff panel: http://localhost:${PORT}/staff`);
    console.log(`Default credentials: username=admin, password=admin123`);
    console.log(`(Set STAFF_USERNAME and STAFF_PASSWORD in .env for production)`);
});
