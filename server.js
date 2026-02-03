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
const { db, dbHelpers } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Multer configuration for file uploads (100MB limit for videos)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
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
// CONTEXT ANALYZER
// ============================================
class ContextAnalyzer {
    constructor() {
        this.questionWords = {
            english: ['what', 'when', 'where', 'who', 'why', 'how', 'which', 'can', 'could', 'should', 'would', 'is', 'are', 'do', 'does', 'did', 'will', 'may'],
            hindi: ['क्या', 'कब', 'कहाँ', 'कौन', 'क्यों', 'कैसे', 'कौन सा', 'कर सकता', 'कर सकती', 'करना चाहिए'],
            telugu: ['ఏమి', 'ఎప్పుడు', 'ఎక్కడ', 'ఎవరు', 'ఎందుకు', 'ఎలా', 'ఏది', 'చేయగలను', 'చేయగలరు']
        };
    }

    analyzeContext(history, currentMessage, language) {
        return {
            isQuestion: this.getQuestionType(currentMessage, language) !== 'general',
            questionType: this.getQuestionType(currentMessage, language),
            sentiment: this.analyzeSentiment(currentMessage, language),
            topicContinuity: this.checkTopicContinuity(history, currentMessage, language),
            urgency: this.detectUrgency(currentMessage, language),
            previousIssues: this.extractPreviousIssues(history, language),
            needsClarification: this.needsClarification(history, currentMessage, language)
        };
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
// YONO777 SUPPORT AGENT (with Enhanced Deposit Concern Flow)
// ============================================
class Yono777SupportAgent {
    constructor() {
        this.languageDetector = new LanguageDetector();
        this.contextAnalyzer = new ContextAnalyzer();
        this.multilingual = new MultilingualResponses();
        this.responseGenerator = new EnhancedResponseGenerator();
        this.protocolHandler = new Yono777ProtocolHandler();
        this.conversationHistory = new Map();
        this.isFirstMessage = new Map();
        this.attemptCount = new Map();
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
        
        const greetings = {
            english: "Hello! I'm here to help you with your deposit concern. I understand this can be frustrating, and I want to make sure we get this resolved for you quickly.",
            hindi: "नमस्ते! मैं आपकी जमा संबंधी चिंता में आपकी मदद के लिए यहां हूं। मैं समझता हूं कि यह निराशाजनक हो सकता है, और मैं चाहता हूं कि हम इसे जल्दी हल करें।",
            telugu: "నమస్కారం! మీ డిపాజిట్ సంబంధిత ఆందోళనలో మీకు సహాయం చేయడానికి నేను ఇక్కడ ఉన్నాను. ఇది నిరాశాజనకంగా ఉండవచ్చని నేను అర్థం చేసుకున్నాను, మరియు మేము దీన్ని త్వరగా పరిష్కరించాలని నేను కోరుకుంటున్నాను."
        };
        
        if (!hasReceipt || !orderNumber) {
            const askMessages = {
                english: `${greetings[language]}\n\nTo help me verify your transaction, I'll need:\n\n📄 **Deposit Receipt** (screenshot or photo)\n📋 **Order Number** (your deposit order number)\n\nPlease provide both so I can check the statu.`,
                hindi: `${greetings[language]}\n\nआपके लेनदेन को सत्यापित करने में मदद करने के लिए, मुझे आवश्यकता होगी:\n\n📄 **जमा रसीद** (स्क्रीनशॉट या फोटो)\n📋 **ऑर्डर नंबर** (आपका जमा ऑर्डर नंबर)\n\nकृपया दोनों प्रदान करें ताकि मैं स्थिति की जांच कर सकूं।`,
                telugu: `${greetings[language]}\n\nమీ లావాదేవీని ధృవీకరించడంలో సహాయపడటానికి, నాకు అవసరం:\n\n📄 **జమ రసీదు** (స్క్రీన్‌షాట్ లేదా ఫోటో)\n📋 **ఆర్డర్ నంబర్** (మీ జమ ఆర్డర్ నంబర్)\n\nదయచేసి రెండూ అందించండి తద్వారా నేను స్థితిని తనిఖీ చేయగలను.`
            };
            return askMessages[language] || askMessages.english;
        }
        
        return this.checkDepositInDatabase(userId, orderNumber, hasReceipt, language, history);
    }

    async checkDepositInDatabase(userId, orderNumber, hasReceipt, language, history) {
        const checkingMessages = {
            english: "Thank you for providing the information! Please hold on a moment while I check this for you. I'll get back to you right away with the status.",
            hindi: "जानकारी प्रदान करने के लिए धन्यवाद! कृपया एक क्षण प्रतीक्षा करें जबकि मैं इसे आपके लिए जांचता हूं। मैं आपको तुरंत स्थिति के साथ वापस आऊंगा।",
            telugu: "సమాచారం అందించినందుకు ధన్యవాదాలు! దయచేసి నేను దీన్ని మీ కోసం తనిఖీ చేస్తున్నప్పుడు కొద్ది సేపు వేచి ఉండండి. నేను వెంటనే మీకు స్థితితో తిరిగి రాగలను."
        };
        
        const acknowledgment = checkingMessages[language] || checkingMessages.english;
        
        return new Promise((resolve) => {
            this.checkOrderNumberInDatabase(orderNumber, async (err, orderData) => {
                if (err) {
                    resolve(acknowledgment + "\n\nI encountered an error checking the database. Please try again.");
                    return;
                }
                
                if (orderData && orderData.found) {
                    const successMessages = {
                        english: `Thank you for your patience!\n\n✅ **Transaction Status:** Successful\n\nGreat news! Your deposit has been processed successfully. Please reopen the Yono777 app and enjoy gaming!\n\nThank you for choosing Yono777! 🎮`,
                        hindi: `आपके धैर्य के लिए धन्यवाद!\n\n✅ **लेनदेन स्थिति:** सफल\n\nबढ़िया खबर! आपकी जमा राशि सफलतापूर्वक संसाधित हो गई है। कृपया Yono777 ऐप को फिर से खोलें और गेमिंग का आनंद लें!\n\nYono777 चुनने के लिए धन्यवाद! 🎮`,
                        telugu: `మీ సహనానికి ధన్యవాదాలు!\n\n✅ **లావాదేవీ స్థితి:** విజయవంతం\n\nఅద్భుతమైన వార్త! మీ జమ విజయవంతంగా ప్రాసెస్ చేయబడింది. దయచేసి Yono777 అనువర్తనాన్ని మళ్లీ తెరవండి మరియు గేమింగ్‌ను ఆస్వాదించండి!\n\nYono777 ఎంచుకున్నందుకు ధన్యవాదాలు! 🎮`
                    };
                    resolve(successMessages[language] || successMessages.english);
                } else {
                    const receiptDate = this.extractReceiptDate(history);
                    const isOldReceipt = this.isReceiptOlderThan2Days(receiptDate);
                    
                    if (isOldReceipt) {
                        const askForDocuments = {
                            english: `Thank you for your patience!\n\n⚠️ **Transaction Status:** Not Successful Yet\n\nThe payment is still processing. Since your receipt is more than 2 days old, we need additional verification to help process your deposit faster:\n\n📄 **PDF Bank Statement** (with transaction details)\n🎥 **Video Recording** (showing the successful deposit transaction)\n\nPlease provide both documents along with the PDF password (if protected) so our team can verify and process your deposit immediately.\n\nThank you for your cooperation!`,
                            hindi: `आपके धैर्य के लिए धन्यवाद!\n\n⚠️ **लेनदेन स्थिति:** अभी तक सफल नहीं\n\nभुगतान अभी भी प्रसंस्करण में है। चूंकि आपकी रसीद 2 दिन से अधिक पुरानी है, हमें आपकी जमा राशि को तेजी से संसाधित करने में मदद करने के लिए अतिरिक्त सत्यापन की आवश्यकता है:\n\n📄 **PDF बैंक स्टेटमेंट** (लेनदेन विवरण के साथ)\n🎥 **वीडियो रिकॉर्डिंग** (सफल जमा लेनदेन दिखा रहा है)\n\nकृपया PDF पासवर्ड (यदि सुरक्षित है) के साथ दोनों दस्तावेज़ प्रदान करें ताकि हमारी टीम आपकी जमा राशि को तुरंत सत्यापित और संसाधित कर सके।\n\nआपके सहयोग के लिए धन्यवाद!`,
                            telugu: `మీ సహనానికి ధన్యవాదాలు!\n\n⚠️ **లావాదేవీ స్థితి:** ఇంకా విజయవంతం కాలేదు\n\nచెల్లింపు ఇంకా ప్రాసెస్ అవుతోంది. మీ రసీదు 2 రోజుల కంటే ఎక్కువ పాతది కాబట్టి, మీ జమను వేగంగా ప్రాసెస్ చేయడంలో సహాయపడటానికి మాకు అదనపు ధృవీకరణ అవసరం:\n\n📄 **PDF బ్యాంక్ స్టేట్‌మెంట్** (లావాదేవీ వివరాలతో)\n🎥 **వీడియో రికార్డింగ్** (విజయవంతమైన జమ లావాదేవీని చూపిస్తోంది)\n\nదయచేసి PDF పాస్‌వర్డ్ (రక్షితమైతే)తో పాటు రెండు పత్రాలను అందించండి తద్వారా మా బృందం మీ జమను వెంటనే ధృవీకరించి ప్రాసెస్ చేయగలదు.\n\nమీ సహకారానికి ధన్యవాదాలు!`
                        };
                        resolve(askForDocuments[language] || askForDocuments.english);
                    } else {
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

    isReceiptOlderThan2Days(receiptDate) {
        if (!receiptDate) return false;
        const receipt = new Date(receiptDate);
        const now = new Date();
        const diffTime = Math.abs(now - receipt);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 2;
    }

    extractReceiptDate(history) {
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (msg.role === 'user' && msg.fileType) {
                if (msg.timestamp) {
                    return msg.timestamp;
                }
            }
        }
        return null;
    }

    hasReceiptBeenUploaded(history) {
        if (!history || history.length === 0) return false;
        return history.some(h => h.role === 'user' && (h.fileType === 'image' || h.fileType === 'pdf' || h.fileType === 'video'));
    }

    extractOrderNumber(message) {
        const patterns = [
            /s05\d{19}/i,
            /d05\d{19}/i,
            /p05\d{19}/i,
            /order[:\s]*(s05|d05|p05)\d{19}/i,
            /(s05|d05|p05)\d{19}/i
        ];
        
        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) {
                return match[1] || match[0];
            }
        }
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

        dbHelpers.getDepositByOrderNumber(orderNumber, (err, deposit) => {
            if (err) {
                console.error('Error checking deposit:', err);
                return callback(err, null);
            }
            
            if (deposit) {
                return callback(null, { found: true, type: 'deposit', data: deposit, orderNumber: orderNumber });
            }

            dbHelpers.getWithdrawalByOrderNumber(orderNumber, (err, withdrawal) => {
                if (err) {
                    console.error('Error checking withdrawal:', err);
                    return callback(err, null);
                }
                
                if (withdrawal) {
                    return callback(null, { found: true, type: 'withdrawal', data: withdrawal, orderNumber: orderNumber });
                }

                callback(null, { found: false, type: null, data: null, orderNumber: orderNumber });
            });
        });
    }

    classifyIssue(message, language) {
        const lowerMsg = message.toLowerCase();
        const depositKw = ['deposit', 'जमा', 'జమ'];
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

    generateResponse(message, issueType, userId, language) {
        const lowerMessage = message.toLowerCase();
        const history = this.conversationHistory.get(userId) || [];
        const context = this.contextAnalyzer.analyzeContext(history, message, language);
        
        if (issueType === 'deposit') {
            return this.multilingual.getResponse(language, 'deposit', 'general');
        }
        if (issueType === 'withdrawal') {
            return this.multilingual.getResponse(language, 'withdrawal', 'general');
        }
        if (issueType === 'account') {
            return this.multilingual.getResponse(language, 'account', 'general');
        }
        if (issueType === 'bonus') {
            return this.multilingual.getResponse(language, 'bonus', 'general');
        }
        if (issueType === 'technical issue') {
            return this.multilingual.getResponse(language, 'technical');
        }
        
        return this.multilingual.getResponse(language, 'general');
    }

    handleMessage(message, userId) {
        const detectedLanguage = this.languageDetector.detectLanguage(message);
        const language = detectedLanguage;
        
        if (!this.conversationHistory.has(userId)) {
            this.conversationHistory.set(userId, []);
            this.isFirstMessage.set(userId, true);
        }
        
        const isFirst = this.isFirstMessage.get(userId);
        this.isFirstMessage.set(userId, false);
        
        if (isFirst) {
            const greeting = this.multilingual.getResponse(language, 'greeting');
            this.conversationHistory.get(userId).push({ role: 'user', message });
            this.conversationHistory.get(userId).push({ role: 'assistant', message: greeting });
            return greeting;
        }
        
        const history = this.conversationHistory.get(userId) || [];
        
        // Protocol: Always identify payment type (deposit or withdrawal) first
        const paymentType = this.protocolHandler.identifyPaymentType(message, language);
        
        if (message.toLowerCase().includes('thank') || message.toLowerCase().includes('धन्यवाद') || message.toLowerCase().includes('ధన్యవాదాలు')) {
            const appreciationResponses = {
                english: "You're very welcome! 😊 I'm so glad I could help you. Is there anything else you'd like to know?",
                hindi: "आपका बहुत-बहुत स्वागत है! 😊 मुझे खुशी है कि मैं आपकी मदद कर सका। क्या आप कुछ और जानना चाहेंगे?",
                telugu: "మీకు చాలా స్వాగతం! 😊 నేను మీకు సహాయం చేయగలిగానని నేను సంతోషిస్తున్నాను. మీరు మరేదైనా తెలుసుకోవాలనుకుంటున్నారా?"
            };
            const appreciationResponse = appreciationResponses[language] || appreciationResponses.english;
            this.conversationHistory.get(userId).push({ role: 'user', message });
            this.conversationHistory.get(userId).push({ role: 'assistant', message: appreciationResponse });
            return appreciationResponse;
        }
        
        // Protocol: If payment type is unclear, ask for clarification
        if (!paymentType && (this.classifyIssue(message, language) === 'deposit' || this.classifyIssue(message, language) === 'withdrawal')) {
            const clarificationResponses = {
                english: "To help you better, could you please clarify if this is related to a deposit or a withdrawal?",
                hindi: "आपकी बेहतर सहायता के लिए, कृपया स्पष्ट करें कि यह जमा या निकासी से संबंधित है?",
                telugu: "మీకు మంచి సహాయం చేయడానికి, దయచేసి ఇది జమ లేదా ఉపసంహరణకు సంబంధించినది అని స్పష్టం చేయగలరా?"
            };
            const clarificationResponse = clarificationResponses[language] || clarificationResponses.english;
            this.conversationHistory.get(userId).push({ role: 'user', message });
            this.conversationHistory.get(userId).push({ role: 'assistant', message: clarificationResponse });
            return clarificationResponse;
        }
        
        const issueType = this.classifyIssue(message, language);
        let response = this.generateResponse(message, issueType, userId, language);
        
        // Protocol: Ensure response is maximum 3 sentences
        response = this.limitToThreeSentences(response, language);
        
        this.conversationHistory.get(userId).push({ role: 'user', message });
        this.conversationHistory.get(userId).push({ role: 'assistant', message: response });
        
        return response;
    }
}

const agent = new Yono777SupportAgent();

// ============================================
// RECEIPT VALIDATION FUNCTION
// ============================================
async function validateReceipt(imageBuffer) {
    try {
        const processedImage = await sharp(imageBuffer)
            .greyscale()
            .normalize()
            .sharpen()
            .toBuffer();
        
        const { data: { text, confidence } } = await Tesseract.recognize(processedImage, 'eng', {
            logger: m => {}
        });
        
        const lowerText = text.toLowerCase();
        
        if (lowerText.includes('transaction failed') || lowerText.includes('failed') || lowerText.includes('unsuccessful')) {
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
                warnings: []
            };
        }
        
        const orderPatterns = [
            /s05\d{19}/i,
            /d05\d{19}/i,
            /order[:\s]*([a-z0-9]{20,})/i
        ];
        
        let foundOrderNumber = null;
        for (const pattern of orderPatterns) {
            const match = text.match(pattern);
            if (match) {
                foundOrderNumber = match[1] || match[0];
                break;
            }
        }
        
        const upiPattern = /[a-z0-9._-]+@[a-z]+/i;
        const upiMatch = text.match(upiPattern);
        const foundUPI = upiMatch ? upiMatch[0] : null;
        
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
        
        const utrPattern = /utr[:\s]*([a-z0-9]{12,})/i;
        const utrMatch = text.match(utrPattern);
        const foundUTR = utrMatch ? utrMatch[1] : null;
        
        const amountPatterns = [
            /₹\s*([\d,]+\.?\d*)/i,
            /rs\.?\s*([\d,]+\.?\d*)/i,
            /inr\s*([\d,]+\.?\d*)/i
        ];
        
        let foundAmount = null;
        for (const pattern of amountPatterns) {
            const match = text.match(pattern);
            if (match) {
                foundAmount = match[1];
                break;
            }
        }
        
        const datePatterns = [
            /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
            /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/
        ];
        
        let foundDate = null;
        for (const pattern of datePatterns) {
            const match = text.match(pattern);
            if (match) {
                foundDate = match[1];
                break;
            }
        }
        
        const issues = [];
        if (!foundOrderNumber) {
            issues.push('Order number not found in receipt');
        }
        if (!foundUPI && !foundUTR) {
            issues.push('UPI ID or UTR not found');
        }
        
        return {
            isValid: foundOrderNumber !== null || (foundUPI !== null && foundAmount !== null),
            isSuccessful: false,
            confidence: confidence,
            foundOrderNumber: foundOrderNumber,
            foundUPI: foundUPI,
            foundUTR: foundUTR,
            foundAmount: foundAmount,
            foundDate: foundDate,
            issues: issues,
            warnings: []
        };
    } catch (error) {
        console.error('Error validating receipt:', error);
        return {
            isValid: false,
            isSuccessful: false,
            confidence: 0,
            foundOrderNumber: null,
            foundUPI: null,
            foundUTR: null,
            foundAmount: null,
            foundDate: null,
            issues: ['Error processing receipt image'],
            warnings: []
        };
    }
}

// ============================================
// PENDING FILES STORAGE FOR BATCH SENDING
// ============================================
const pendingFiles = new Map();

async function sendBatchFilesToTelegram(userId, files, orderNumber) {
    const caption = `📋 **Deposit Verification Request**\n\n` +
                   `**Order Number:** ${orderNumber}\n` +
                   `**PDF Password:** ${files.password || 'Not provided'}\n\n` +
                   `**Files:**\n` +
                   `📄 ${files.pdfs.length} PDF document(s)\n` +
                   `🎥 ${files.videos.length} video recording(s)`;
    
    await telegramNotifier.sendMessage(userId, caption);
    
    for (const pdf of files.pdfs) {
        await telegramNotifier.sendDocument(userId, pdf.buffer, '', pdf.filename);
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    for (const video of files.videos) {
        await telegramNotifier.sendVideo(userId, video.buffer, '', video.filename);
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`[Batch Send] Sent ${files.pdfs.length} PDFs and ${files.videos.length} videos for order ${orderNumber}`);
}

// ============================================
// API ENDPOINTS
// ============================================

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, userId } = req.body;
        
        if (!message || !userId) {
            return res.status(400).json({ error: 'Message and userId are required' });
        }
        
        await new Promise((resolve) => {
            dbHelpers.getOrCreateUser(userId, 'english', (err) => {
                if (err) console.error('Error getting/creating user:', err);
                resolve();
            });
        });
        
        const conversationHistory = await new Promise((resolve) => {
            dbHelpers.getConversationHistory(userId, 50, (err, history) => {
                if (err) {
                    console.error('Error loading conversation history:', err);
                    resolve([]);
                } else {
                    const formattedHistory = (history || []).map(h => ({
                        role: 'user',
                        message: h.userMessage,
                        timestamp: h.timestamp
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
        
        const language = agent.languageDetector.detectLanguage(message);
        let response;
        
        const finalOrderNumber = agent.extractOrderNumber(message) || agent.extractOrderNumberFromHistory(conversationHistory);
        
        if (finalOrderNumber) {
            const hasReceiptInHistory = agent.hasReceiptBeenUploaded(conversationHistory);
            
            if (!hasReceiptInHistory) {
                const askForReceiptMessages = {
                    english: `📋 **Order Number Detected:** ${finalOrderNumber}\n\nTo verify and process your transaction, please upload your **deposit receipt** (screenshot or photo of your transaction).\n\nYou can upload:\n📷 Image (JPG, PNG)\n📄 PDF Bank Statement\n🎥 Video Recording\n\nOnce you upload the receipt, I'll check it in our database and provide you with the transaction status.\n\nThank you!`,
                    hindi: `📋 **ऑर्डर नंबर पाया गया:** ${finalOrderNumber}\n\nआपके लेनदेन को सत्यापित और संसाधित करने के लिए, कृपया अपनी **जमा रसीद** (आपके लेनदेन का स्क्रीनशॉट या फोटो) अपलोड करें।\n\nआप अपलोड कर सकते हैं:\n📷 छवि (JPG, PNG)\n📄 PDF बैंक स्टेटमेंट\n🎥 वीडियो रिकॉर्डिंग\n\nएक बार जब आप रसीद अपलोड करेंगे, मैं इसे हमारे डेटाबेस में जांचूंगा और आपको लेनदेन की स्थिति प्रदान करूंगा।\n\nधन्यवाद!`,
                    telugu: `📋 **ఆర్డర్ నంబర్ కనుగొనబడింది:** ${finalOrderNumber}\n\nమీ లావాదేవీని ధృవీకరించడానికి మరియు ప్రాసెస్ చేయడానికి, దయచేసి మీ **జమ రసీదు** (మీ లావాదేవీ యొక్క స్క్రీన్‌షాట్ లేదా ఫోటో) అప్‌లోడ్ చేయండి.\n\nమీరు అప్‌లోడ్ చేయవచ్చు:\n📷 చిత్రం (JPG, PNG)\n📄 PDF బ్యాంక్ స్టేట్‌మెంట్\n🎥 వీడియో రికార్డింగ్\n\nమీరు రసీదును అప్‌లోడ్ చేసిన తర్వాత, నేను దీన్ని మా డేటాబేస్‌లో తనిఖీ చేసి మీకు లావాదేవీ స్థితిని అందిస్తాను.\n\nధన్యవాదాలు!`
                };
                response = askForReceiptMessages[language] || askForReceiptMessages.english;
                
                if (!agent.conversationHistory.has(userId)) {
                    agent.conversationHistory.set(userId, []);
                }
                agent.conversationHistory.get(userId).push({ role: 'user', message });
                agent.conversationHistory.get(userId).push({ role: 'assistant', message: response });
                
                const category = agent.classifyIssue(message, language);
                dbHelpers.addConversation(userId, message, response, category, (err) => {
                    if (err) console.error('Error saving conversation:', err);
                });
            } else {
                await new Promise((resolve) => {
                    agent.checkOrderNumberInDatabase(finalOrderNumber, (err, orderData) => {
                        if (err) {
                            response = agent.handleMessage(message, userId);
                            const category = agent.classifyIssue(message, language);
                            dbHelpers.addConversation(userId, message, response, category, (err) => {
                                if (err) console.error('Error saving conversation:', err);
                            });
                            resolve();
                        } else if (orderData.found) {
                            const history = agent.conversationHistory.get(userId) || [];
                            response = `✅ Your transaction was successful. Please reopen the Yono777 app and enjoy gaming!`;
                            
                            agent.conversationHistory.get(userId).push({ role: 'user', message });
                            agent.conversationHistory.get(userId).push({ role: 'assistant', message: response });
                            
                            const category = agent.classifyIssue(message, language);
                            dbHelpers.addConversation(userId, message, response, category, (err) => {
                                if (err) console.error('Error saving conversation:', err);
                            });
                            
                            resolve();
                        } else {
                            const history = agent.conversationHistory.get(userId) || [];
                            const notFoundOrderData = { found: false, type: null, data: null, orderNumber: finalOrderNumber };
                            response = `⚠️ The payment is still processing, will follow up for this in our relevance team.`;
                            
                            agent.conversationHistory.get(userId).push({ role: 'user', message });
                            agent.conversationHistory.get(userId).push({ role: 'assistant', message: response });
                            
                            const category = agent.classifyIssue(message, language);
                            dbHelpers.addConversation(userId, message, response, category, (err) => {
                                if (err) console.error('Error saving conversation:', err);
                            });
                            
                            resolve();
                        }
                    });
                });
            }
        } else {
            const depositConcernResponse = agent.handleDepositConcern(message, userId, language);
            if (depositConcernResponse) {
                response = depositConcernResponse;
            } else {
                response = agent.handleMessage(message, userId);
            }
            
            const category = agent.classifyIssue(message, language);
            dbHelpers.addConversation(userId, message, response, category, (err) => {
                if (err) console.error('Error saving conversation:', err);
            });
        }
        
        res.json({ response });
    } catch (error) {
        console.error('Error in /api/chat:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Upload receipt endpoint
app.post('/api/upload-receipt', upload.single('receipt'), async (req, res) => {
    try {
        const userId = req.body.userId || req.query.userId;
        const orderNumber = req.body.orderNumber || req.query.orderNumber;
        const pdfPassword = req.body.pdfPassword || req.query.pdfPassword;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        if (!userId) {
            return res.status(400).json({ success: false, message: 'UserId is required' });
        }
        
        const isImage = req.file.mimetype.startsWith('image/');
        const isPDF = req.file.mimetype === 'application/pdf';
        const isVideo = req.file.mimetype.startsWith('video/');
        
        const language = agent.languageDetector.detectLanguage(req.body.message || '');
        
        // Load conversation history from database if not in memory
        let conversationHistory = agent.conversationHistory.get(userId) || [];
        if (conversationHistory.length === 0) {
            conversationHistory = await new Promise((resolve) => {
                dbHelpers.getConversationHistory(userId, 50, (err, history) => {
                    if (err) {
                        console.error('Error loading conversation history:', err);
                        resolve([]);
                    } else {
                        const formattedHistory = (history || []).map(h => ({
                            role: 'user',
                            message: h.userMessage,
                            timestamp: h.timestamp
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
        }
        
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
        
        if (!extractedOrderNumber) {
            const askForOrderNumberMessages = {
                english: `📄 **Receipt Received!**\n\nThank you for uploading your ${isImage ? 'image receipt' : (isPDF ? 'PDF document' : 'video recording')}. To verify and process your transaction, please provide your **order number**.\n\nYou can type it in the chat or upload a new receipt with the order number clearly visible.\n\nThank you!`,
                hindi: `📄 **रसीद प्राप्त हुई!**\n\nआपकी ${isImage ? 'छवि रसीद' : (isPDF ? 'PDF दस्तावेज़' : 'वीडियो रिकॉर्डिंग')} अपलोड करने के लिए धन्यवाद। आपके लेनदेन को सत्यापित और संसाधित करने के लिए, कृपया अपना **ऑर्डर नंबर** प्रदान करें।\n\nआप इसे चैट में टाइप कर सकते हैं या ऑर्डर नंबर स्पष्ट रूप से दिखाई देने वाली एक नई रसीद अपलोड कर सकते हैं।\n\nधन्यवाद!`,
                telugu: `📄 **రసీదు స్వీకరించబడింది!**\n\nమీ ${isImage ? 'చిత్ర రసీదు' : (isPDF ? 'PDF పత్రం' : 'వీడియో రికార్డింగ్')} అప్‌లోడ్ చేసినందుకు ధన్యవాదాలు. మీ లావాదేవీని ధృవీకరించడానికి మరియు ప్రాసెస్ చేయడానికి, దయచేసి మీ **ఆర్డర్ నంబర్** అందించండి.\n\nమీరు దీన్ని చాట్‌లో టైప్ చేయవచ్చు లేదా ఆర్డర్ నంబర్ స్పష్టంగా కనిపించే కొత్త రసీదును అప్‌లోడ్ చేయవచ్చు.\n\nధన్యవాదాలు!`
            };
            
            return res.json({
                success: true,
                message: askForOrderNumberMessages[language] || askForOrderNumberMessages.english,
                fileType: isImage ? 'image' : (isPDF ? 'pdf' : 'video'),
                orderNumber: null,
                requiresOrderNumber: true,
                validation: {
                    isSuccessful: false,
                    isValid: true,
                    confidence: 100,
                    foundOrderNumber: null,
                    foundUPI: null,
                    foundUTR: null,
                    foundAmount: null,
                    foundDate: null,
                    isOldDeposit: false,
                    databaseMatch: null,
                    issues: ['Order number required to proceed with verification'],
                    warnings: []
                }
            });
        }
        
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
        let caption = `📄 **Receipt Upload**\n\n**User ID:** ${userId}\n**Order Number:** ${extractedOrderNumber}`;
        
        if (isImage) {
            validation = await validateReceipt(req.file.buffer);
            
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
            
            // 1. Try date from OCR
            if (validation.foundDate) {
                try {
                    receiptDate = new Date(validation.foundDate);
                    if (isNaN(receiptDate.getTime())) receiptDate = null;
                } catch (e) {
                    receiptDate = null;
                }
            }
            
            // 2. Try date from order number (format: s05YYMMDD... or d05YYMMDD...)
            // Example: s052601231426497799910 = s05 + 260123 (YYMMDD) + ...
            // Example: d052601311545434000470 = d05 + 260131 (YYMMDD) + ...
            // IMPORTANT: Always try to extract date from order number, even if OCR found a date
            // The order number date is more reliable
            if (orderNumberToCheck) {
                const orderDateMatch = orderNumberToCheck.match(/^(s05|d05)(\d{6})/i);
                if (orderDateMatch) {
                    const dateStr = orderDateMatch[2]; // YYMMDD
                    const year = 2000 + parseInt(dateStr.substring(0, 2));
                    const month = parseInt(dateStr.substring(2, 4)) - 1; // Month is 0-indexed
                    const day = parseInt(dateStr.substring(4, 6));
                    
                    const orderNumberDate = new Date(year, month, day);
                    if (!isNaN(orderNumberDate.getTime())) {
                        console.log(`[Date Check] Extracted date from order number ${orderNumberToCheck}: ${dateStr} -> ${orderNumberDate.toISOString()}`);
                        console.log(`[Date Check] Parsed date components: Year=${year}, Month=${month+1}, Day=${day}`);
                        // Use order number date (more reliable than OCR date)
                        receiptDate = orderNumberDate;
                    } else {
                        console.log(`[Date Check] Invalid date parsed from order number: ${orderNumberToCheck}`);
                    }
                } else {
                    console.log(`[Date Check] Order number ${orderNumberToCheck} does not match date pattern (expected s05/d05 + 6 digits)`);
                }
            }
            
            // 3. Try date from conversation history (when receipt was first mentioned/uploaded)
            if (!receiptDate) {
                const historyDate = agent.extractReceiptDate(conversationHistory);
                if (historyDate) {
                    receiptDate = new Date(historyDate);
                    if (isNaN(receiptDate.getTime())) receiptDate = null;
                }
            }
            
            // 4. If still no date, use current date minus 3 days as fallback (assume old if we can't determine)
            // Actually, let's not assume - only check if we have a valid date
            if (receiptDate && !isNaN(receiptDate.getTime())) {
                const isOld = agent.isReceiptOlderThan2Days(receiptDate);
                validation.isOldDeposit = isOld;
                
                const now = new Date();
                const diffTime = Math.abs(now - receiptDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                console.log(`[Date Check] Receipt date: ${receiptDate.toISOString()}`);
                console.log(`[Date Check] Current date: ${now.toISOString()}`);
                console.log(`[Date Check] Days difference: ${diffDays}`);
                console.log(`[Date Check] Is old (>2 days): ${isOld}`);
                console.log(`[Date Check] Is successful: ${validation.isSuccessful}`);
                console.log(`[Date Check] Condition check: isOld=${isOld} && !isSuccessful=${!validation.isSuccessful} = ${isOld && !validation.isSuccessful}`);
                
                if (isOld && !validation.isSuccessful) {
                    console.log(`[Date Check] ✅ TRIGGERING 2+ DAYS CHECK - Asking for PDF and video`);
                    
                    // Calculate how many days old the receipt is
                    const now = new Date();
                    const diffTime = Math.abs(now - receiptDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    const askForDocuments = {
                        english: `Checking your deposit was still processing and if already ${diffDays} days old, kindly provide a PDF file and a video recording for further checking.\n\n📄 **PDF Bank Statement** (with transaction details)\n🎥 **Video Recording** (showing the successful deposit transaction)\n\nPlease provide both documents along with the PDF password (if protected) so our team can verify and process your deposit immediately.\n\nThank you for your cooperation!`,
                        hindi: `आपकी जमा राशि की जांच अभी भी प्रसंस्करण में है और यदि पहले से ही ${diffDays} दिन पुरानी है, तो कृपया आगे की जांच के लिए एक PDF फ़ाइल और एक वीडियो रिकॉर्डिंग प्रदान करें।\n\n📄 **PDF बैंक स्टेटमेंट** (लेनदेन विवरण के साथ)\n🎥 **वीडियो रिकॉर्डिंग** (सफल जमा लेनदेन दिखा रहा है)\n\nकृपया PDF पासवर्ड (यदि सुरक्षित है) के साथ दोनों दस्तावेज़ प्रदान करें।\n\nआपके सहयोग के लिए धन्यवाद!`,
                        telugu: `మీ జమను తనిఖీ చేస్తోంది ఇంకా ప్రాసెస్ అవుతోంది మరియు ఇప్పటికే ${diffDays} రోజులు పాతది అయితే, మరిన్ని తనిఖీ కోసం దయచేసి PDF ఫైల్ మరియు వీడియో రికార్డింగ్ అందించండి.\n\n📄 **PDF బ్యాంక్ స్టేట్‌మెంట్** (లావాదేవీ వివరాలతో)\n🎥 **వీడియో రికార్డింగ్** (విజయవంతమైన జమ లావాదేవీని చూపిస్తోంది)\n\nదయచేసి PDF పాస్‌వర్డ్ (రక్షితమైతే)తో పాటు రెండు పత్రాలను అందించండి.\n\nమీ సహకారానికి ధన్యవాదాలు!`
                    };
                    
                    console.log(`[Date Check] Returning response with requiresPDFAndVideo=true`);
                    console.log(`[Date Check] Message to send:`, askForDocuments[language] || askForDocuments.english);
                    // Return the message asking for PDF and video
                    const responseData = {
                        success: true,
                        message: askForDocuments[language] || askForDocuments.english,
                        fileType: 'image',
                        orderNumber: orderNumberToCheck || extractedOrderNumber,
                        validation: validation,
                        requiresPDFAndVideo: true
                    };
                    console.log(`[Date Check] Full response data:`, JSON.stringify(responseData, null, 2));
                    console.log(`[Date Check] Sending response to client NOW...`);
                    
                    // Send photo to Telegram first (non-blocking)
                    caption += `\n\n**Validation:** ${validation.isSuccessful ? '✅ Successful' : (validation.isValid ? '⚠️ Processing' : '❌ Invalid')}`;
                    if (validation.foundOrderNumber) caption += `\n**Order Number:** ${validation.foundOrderNumber}`;
                    if (validation.foundAmount) caption += `\n**Amount:** ₹${validation.foundAmount}`;
                    caption += `\n\n**Status:** Receipt is ${diffDays} days old - PDF and video requested`;
                    
                    telegramNotifier.sendPhoto(userId, req.file.buffer, caption).catch(err => {
                        console.error('Error sending photo to Telegram:', err);
                    });
                    
                    agent.conversationHistory.get(userId).push({
                        role: 'user',
                        message: `[Uploaded receipt image]`,
                        fileType: 'image',
                        timestamp: new Date().toISOString()
                    });
                    
                    // Add delay before sending response (sync/processing time)
                    console.log(`[Date Check] Waiting 1.5 seconds before sending response (sync delay)...`);
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    
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
            } else {
                console.log(`[Date Check] No valid receipt date found - skipping 2+ days check`);
            }
            
            // Only continue if we haven't sent a response yet
            if (res.headersSent) {
                console.log('[Response] Headers already sent from 2+ days check, exiting');
                return;
            }
            
            caption += `\n\n**Validation:** ${validation.isSuccessful ? '✅ Successful' : (validation.isValid ? '⚠️ Processing' : '❌ Invalid')}`;
            if (validation.foundOrderNumber) caption += `\n**Order Number:** ${validation.foundOrderNumber}`;
            if (validation.foundAmount) caption += `\n**Amount:** ₹${validation.foundAmount}`;
            
            success = await telegramNotifier.sendPhoto(userId, req.file.buffer, caption);
            
            agent.conversationHistory.get(userId).push({
                role: 'user',
                message: `[Uploaded receipt image]`,
                fileType: 'image',
                timestamp: new Date().toISOString()
            });
        } else if (isPDF || isVideo) {
            const storageKey = `${userId}_${extractedOrderNumber}`;
            
            if (!pendingFiles.has(storageKey)) {
                pendingFiles.set(storageKey, {
                    pdfs: [],
                    videos: [],
                    orderNumber: extractedOrderNumber,
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
            
            if (storage.pdfs.length > 0 && storage.videos.length > 0) {
                setTimeout(async () => {
                    const files = pendingFiles.get(storageKey);
                    if (files && files.pdfs.length > 0 && files.videos.length > 0) {
                        await sendBatchFilesToTelegram(userId, files, extractedOrderNumber);
                        pendingFiles.delete(storageKey);
                    }
                }, 3000);
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
            console.log('[Response] ✅ Headers already sent - response was sent successfully, skipping duplicate');
            return;
        }
        
        console.log('[Response] ⚠️ No early return detected - building default response');
        console.log('[Response] Validation state:', {
            isSuccessful: validation.isSuccessful,
            isValid: validation.isValid,
            isOldDeposit: validation.isOldDeposit,
            foundOrderNumber: validation.foundOrderNumber
        });
        
        let responseMessage = '';
        if (isImage) {
            // Only set default message if validation doesn't indicate 2+ days old
            if (!validation.isOldDeposit || validation.isSuccessful) {
                responseMessage = validation.isSuccessful ? '✅ Transaction Successful!' : (validation.isValid ? '⚠️ Payment Processing' : '❌ Invalid Receipt');
            } else {
                // This shouldn't happen if early return worked, but as fallback
                console.log('[Response] ⚠️ WARNING: 2+ days old but no early return - using fallback message');
                const diffDays = validation.isOldDeposit ? 'more than 2' : 'several';
                responseMessage = `Checking your deposit was still processing and if already ${diffDays} days old, kindly provide a PDF file and a video recording for further checking.`;
            }
        } else if (isPDF || isVideo) {
            const storage = pendingFiles.get(`${userId}_${extractedOrderNumber}`);
            if (storage && storage.pdfs.length > 0 && storage.videos.length > 0) {
                responseMessage = `Received ${isPDF ? 'PDF' : 'video'}. Sending to team...`;
            } else {
                responseMessage = `Received ${isPDF ? 'PDF' : 'video'}. Waiting for ${isPDF ? 'video' : 'PDF'}...`;
            }
        }
        
        res.json({
            success: success,
            message: responseMessage,
            fileType: isImage ? 'image' : (isPDF ? 'pdf' : 'video'),
            orderNumber: extractedOrderNumber,
            validation: validation
        });
    } catch (error) {
        console.error('Error in /api/upload-receipt:', error);
        res.status(500).json({ success: false, message: 'Error processing receipt' });
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

function getStaffToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.slice('Bearer '.length).trim();
    }
    if (req.headers['x-staff-token']) {
        return req.headers['x-staff-token'];
    }
    if (req.query && req.query.token) {
        return req.query.token;
    }
    return null;
}

// Get all conversations (for staff panel)
app.get('/api/staff/conversations', (req, res) => {
    // Simple auth check (in production, verify JWT)
    const token = getStaffToken(req);
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    db.all(`
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
    const token = getStaffToken(req);
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.params.userId;

    db.all(`
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
    const token = getStaffToken(req);
    if (!token) {
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
