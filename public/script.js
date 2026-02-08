// Generate unique user ID
const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);


// Bot avatar image - use direct image URL (not ibb.co page URL)
// For ibb.co: Right-click image > "Copy image address" to get direct link
// Format should be: https://i.ibb.co/xxxxx/image.jpg
const BOT_AVATAR_IMAGE = 'https://i.ibb.co/ch7Mf4C9/bot-avatar.jpg'; // Update with your direct image URL
const preQueryModal = document.getElementById('preQueryModal');
const chatContainer = document.getElementById('chatContainer');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const charCount = document.getElementById('charCount');
const submitFormBtn = document.getElementById('submitFormBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const uidCheckbox = document.getElementById('uidCheckbox');
const uidInput = document.getElementById('uidInput');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPicker = document.getElementById('emojiPicker');
const emojiPickerBody = document.getElementById('emojiPickerBody');

// Emoji data organized by categories
const emojiCategories = {
    smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '😶‍🌫️', '😵', '😵‍💫', '🤯', '🤠', '🥳', '😎', '🤓', '🧐'],
    gestures: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃'],
    people: ['👶', '👧', '🧒', '👦', '👩', '🧑', '👨', '👩‍🦱', '👨‍🦱', '👩‍🦰', '👨‍🦰', '👱‍♀️', '👱', '👩‍🦳', '👨‍🦳', '👩‍🦲', '👨‍🦲', '🧔', '👵', '🧓', '👴', '👲', '👳‍♀️', '👳', '👮‍♀️', '👮', '👷‍♀️', '👷', '💂‍♀️', '💂', '🕵️‍♀️', '🕵️', '👩‍⚕️', '👨‍⚕️', '👩‍🌾', '👨‍🌾', '👩‍🍳', '👨‍🍳', '👩‍🎓', '👨‍🎓', '👩‍🎤', '👨‍🎤', '👩‍🏫', '👨‍🏫', '👩‍🏭', '👨‍🏭', '👩‍💻', '👨‍💻', '👩‍💼', '👨‍💼', '👩‍🔧', '👨‍🔧', '👩‍🔬', '👨‍🔬', '👩‍🎨', '👨‍🎨', '👩‍🚒', '👨‍🚒', '👩‍✈️', '👨‍✈️', '👩‍🚀', '👨‍🚀', '👩‍⚖️', '👨‍⚖️', '🤶', '🎅', '👸', '🤴', '👰', '🤵', '👼', '🤰', '🙇‍♀️', '🙇', '💁‍♀️', '💁', '🙅‍♀️', '🙅', '🙆‍♀️', '🙆', '🙋‍♀️', '🙋', '🧏‍♀️', '🧏', '🤦‍♀️', '🤦', '🤷‍♀️', '🤷', '👩‍⚕️', '👨‍⚕️'],
    animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦡', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐓', '🦃', '🦅', '🦆', '🦢', '🦉', '🦚', '🦜', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿', '🦔'],
    food: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🌽', '🥕', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🌮', '🌯', '🥗', '🥘', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '☕️', '🍵', '🥤', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧃', '🧉', '🧊'],
    travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍', '🛵', '🦽', '🦼', '🛴', '🚲', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩', '💺', '🚁', '🚟', '🚠', '🚡', '🛰', '🚀', '🛸', '⛵️', '🚤', '🛥', '🛳', '⛴', '🚢', '⚓️', '⛽️', '🚧', '🚦', '🚥', '🗺', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟', '🎡', '🎢', '🎠', '⛲️', '⛱', '🏖', '🏝', '🏜', '🌋', '⛰', '🏔', '🗻', '🏕', '⛺️', '🏠', '🏡', '🏘', '🏚', '🏗', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛', '⛪️', '🕌', '🕍', '🛕', '🕋', '⛩', '🛤', '🛣', '🗾', '🎑', '🏞', '🌅', '🌄', '🌠', '🎇', '🎆', '🌇', '🌆', '🏙', '🌃', '🌌', '🌉', '🌁'],
    objects: ['⌚️', '📱', '📲', '💻', '⌨️', '🖥', '🖨', '🖱', '🖲', '🕹', '🗜', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽', '🎞', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛', '⏱', '⏲', '⏰', '🕰', '⌛️', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯', '🧯', '🛢', '💸', '💵', '💴', '💶', '💷', '💰', '💳', '💎', '⚖️', '🧰', '🔧', '🔨', '⚒', '🛠', '⛏', '🔩', '⚙️', '🧱', '⛓', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡', '⚔️', '🛡', '🚬', '⚰️', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡', '🧹', '🪠', '🧺', '🧻', '🚽', '🚿', '🛁', '🛀', '🧼', '🪥', '🪒', '🧽', '🪣', '🧴', '🛎', '🔑', '🗝', '🚪', '🪑', '🛋', '🛏', '🛌', '🧸', '🪆', '🖼', '🪞', '🪟', '🛍', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🪅', '🪆', '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷', '🪧', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒', '🗓', '📆', '📅', '🗑', '📇', '🗃', '🗳', '🗄', '📋', '📁', '📂', '🗂', '🗞', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊', '🖋', '✒️', '🖌', '🖍', '📝', '✏️', '🔍', '🔎', '🪙', '🧩'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈️', '♉️', '♊️', '♋️', '♌️', '♍️', '♎️', '♏️', '♐️', '♑️', '♒️', '♓️', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚️', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕️', '🛑', '⛔️', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗️', '❓', '❕', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯️', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿️', '🅿️', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸', '⏯', '⏹', '⏺', '⏭', '⏮', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '💲', '💱', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔜', '🔝', '✔️', '☑️', '🔘', '⚪️', '⚫️', '🔴', '🔵', '🟠', '🟡', '🟢', '🟣', '🟤', '⚫️', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔳', '🔲', '▪️', '▫️', '◾️', '◽️', '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫', '⬛️', '⬜️', '🟰', '🔈', '🔇', '🔉', '🔊', '🔔', '🔕', '📣', '📢', '💬', '💭', '🗯', '♠️', '♣️', '♥️', '♦️', '🃏', '🎴', '🀄️', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧']
};

// Current active emoji category
let activeEmojiCategory = 'smileys';

// Initialize emoji picker
function initEmojiPicker() {
    // Populate emoji picker with default category
    populateEmojiCategory('smileys');
    
    // Toggle emoji picker
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEmojiPicker();
    });
    
    // Category buttons
    const categoryButtons = document.querySelectorAll('.emoji-category-btn');
    categoryButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const category = btn.getAttribute('data-category');
            switchEmojiCategory(category);
        });
    });
    
    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            hideEmojiPicker();
        }
    });
    
    // Prevent closing when clicking inside picker
    emojiPicker.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// Toggle emoji picker visibility
function toggleEmojiPicker() {
    if (emojiPicker.classList.contains('show')) {
        hideEmojiPicker();
    } else {
        showEmojiPicker();
    }
}

// Show emoji picker
function showEmojiPicker() {
    emojiPicker.classList.add('show');
    emojiBtn.classList.add('active');
}

// Hide emoji picker
function hideEmojiPicker() {
    emojiPicker.classList.remove('show');
    emojiBtn.classList.remove('active');
}

// Switch emoji category
function switchEmojiCategory(category) {
    activeEmojiCategory = category;
    
    // Update active category button
    document.querySelectorAll('.emoji-category-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-category') === category) {
            btn.classList.add('active');
        }
    });
    
    // Populate emojis for selected category
    populateEmojiCategory(category);
}

// Populate emoji picker with emojis from a category
function populateEmojiCategory(category) {
    emojiPickerBody.innerHTML = '';
    
    const emojis = emojiCategories[category] || [];
    
    emojis.forEach(emoji => {
        const emojiBtn = document.createElement('button');
        emojiBtn.className = 'emoji-item';
        emojiBtn.textContent = emoji;
        emojiBtn.setAttribute('aria-label', emoji);
        emojiBtn.addEventListener('click', () => {
            insertEmoji(emoji);
        });
        emojiPickerBody.appendChild(emojiBtn);
    });
}

// Insert emoji into message input
function insertEmoji(emoji) {
    const input = messageInput;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const text = input.value;
    
    // Insert emoji at cursor position
    const newText = text.substring(0, start) + emoji + text.substring(end);
    
    // Update input value
    input.value = newText;
    
    // Set cursor position after inserted emoji
    const newCursorPos = start + emoji.length;
    input.setSelectionRange(newCursorPos, newCursorPos);
    
    // Update character count
    updateCharCount();
    
    // Focus input
    input.focus();
    
    // Hide emoji picker after insertion (optional - you can remove this if you want it to stay open)
    // hideEmojiPicker();
}

// Initialize emoji picker when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmojiPicker);
} else {
    initEmojiPicker();
}

// API endpoint
const API_URL = '/api/chat';

// Store selected concern
let selectedConcern = null;

// Handle form submission
async function handleFormSubmit() {
    const selectedRadio = document.querySelector('input[name="concern"]:checked');
    
    if (!selectedRadio) {
        alert('Please select a concern type');
        return;
    }
    
    selectedConcern = selectedRadio.value;
    const uid = uidCheckbox.checked ? uidInput.value : '';
    
    // Store UID if provided
    if (uid) {
        console.log('UID:', uid);
    }
    
    // Hide modal with animation
    preQueryModal.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => {
        preQueryModal.style.display = 'none';
        chatContainer.style.display = 'block';
    }, 300);
    
    // Send initial message based on concern
    const concernMessages = {
        'deposit': 'I need help with deposit',
        'withdrawal': 'I need help with withdrawal',
        'game': 'I have a game concern',
        'bonus': 'I need help with bonus',
        'bank': 'I have a bank concern',
        'agent': 'I need to contact an agent',
        'account': 'I need help with my account'
    };
    
    setTimeout(() => {
        if (concernMessages[selectedConcern]) {
            messageInput.value = concernMessages[selectedConcern];
            sendMessage();
        }
    }, 800);
}

// Event listeners for form
submitFormBtn.addEventListener('click', handleFormSubmit);

closeModalBtn.addEventListener('click', () => {
    // Close modal and show chat anyway
    preQueryModal.style.display = 'none';
    chatContainer.style.display = 'block';
});

// Handle UID checkbox
uidCheckbox.addEventListener('change', (e) => {
    uidInput.disabled = !e.target.checked;
    if (!e.target.checked) {
        uidInput.value = '';
    }
});

// Initialize UID input state
uidInput.disabled = !uidCheckbox.checked;

// Update character count
function updateCharCount() {
    const length = messageInput.value.length;
    charCount.textContent = `${length}/500`;
    if (length > 450) {
        charCount.style.color = '#ef4444';
    } else if (length > 400) {
        charCount.style.color = '#f59e0b';
    } else {
        charCount.style.color = '#6b7280';
    }
}

// Add message to chat with support for images, PDFs, and videos
function addMessage(message, isUser = false, imageUrl = null, fileType = null, fileName = null) {
    const msgRow = document.createElement('div');
    msgRow.className = `msg-row ${isUser ? 'user' : 'bot'}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    
    // Add image if provided
    if (imageUrl && (fileType === 'image' || !fileType)) {
        console.log('[UI] Adding image to chat - URL length:', imageUrl ? imageUrl.length : 0, 'fileName:', fileName);
        const imgContainer = document.createElement('div');
        imgContainer.style.marginBottom = message ? '8px' : '0';
        imgContainer.style.width = '100%';
        imgContainer.style.display = 'flex';
        imgContainer.style.justifyContent = isUser ? 'flex-end' : 'flex-start';
        
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '400px';
        img.style.borderRadius = '8px';
        img.style.objectFit = 'contain';
        img.style.cursor = 'pointer';
        img.style.display = 'block';
        img.alt = fileName || 'Uploaded image';
        img.onerror = (e) => {
            console.error('[UI] Error loading image:', e);
            imgContainer.innerHTML = '<div style="padding: 10px; color: red;">❌ Failed to load image</div>';
        };
        img.onload = () => {
            console.log('[UI] ✅ Image loaded successfully and displayed');
        };
        img.onclick = () => {
            // Open image in new tab/window for full view
            window.open(imageUrl, '_blank');
        };
        imgContainer.appendChild(img);
        bubble.appendChild(imgContainer);
        console.log('[UI] Image element added to bubble');
    }
    
    // Add PDF or video file display
    if (fileType === 'pdf' || fileType === 'video') {
        const fileContainer = document.createElement('div');
        fileContainer.className = 'file-preview-container';
        fileContainer.style.marginBottom = message ? '8px' : '0';
        
        const icon = document.createElement('div');
        icon.className = 'file-icon';
        icon.textContent = fileType === 'pdf' ? '📄' : '🎥';
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        
        const fileNameEl = document.createElement('div');
        fileNameEl.className = 'file-name';
        fileNameEl.textContent = fileName || (fileType === 'pdf' ? 'PDF Document' : 'Video Recording');
        
        const fileSizeEl = document.createElement('div');
        fileSizeEl.className = 'file-type';
        fileSizeEl.textContent = fileType === 'pdf' ? 'PDF File' : 'Video File';
        
        fileInfo.appendChild(fileNameEl);
        fileInfo.appendChild(fileSizeEl);
        
        fileContainer.appendChild(icon);
        fileContainer.appendChild(fileInfo);
        bubble.appendChild(fileContainer);
    }
    
    // Add text message if provided
    if (message) {
        const messageContainer = document.createElement('div');
        // Format message with line breaks and markdown-like formatting
        let formattedMessage = message.replace(/\n/g, '<br>');
        // Support for **bold** text
        formattedMessage = formattedMessage.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        messageContainer.innerHTML = formattedMessage;
        bubble.appendChild(messageContainer);
    }
    
    // Add meta (badge and time)
    const meta = document.createElement('div');
    meta.className = 'meta';
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.innerHTML = `<span class="badge">${isUser ? 'You' : 'Support'}</span><span>${timeStr}</span>`;
    bubble.appendChild(meta);
    
    msgRow.appendChild(bubble);
    chatMessages.appendChild(msgRow);
    
    // Smooth scroll
    setTimeout(() => {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    }, 100);
}

// Show typing indicator (only one at a time - prevents multiple indicators when batching)
function showTypingIndicator() {
    // CRITICAL: Check if typing indicator already exists - don't create duplicate
    const existingIndicator = document.getElementById('typingIndicator');
    if (existingIndicator) {
        // Typing indicator already exists - don't create another one
        // This prevents multiple typing indicators when messages are batched
        return;
    }
    
    const msgRow = document.createElement('div');
    msgRow.className = 'msg-row bot';
    msgRow.id = 'typingIndicator';
    
    const typing = document.createElement('div');
    typing.className = 'typing';
    
    for (let i = 0; i < 3; i++) {
        const span = document.createElement('span');
        typing.appendChild(span);
    }
    
    msgRow.appendChild(typing);
    chatMessages.appendChild(msgRow);
    
    setTimeout(() => {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    }, 100);
}

// Remove typing indicator
function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

// Add message directly (typing indicator already shown and removed)
function addMessageDirect(text, isUser = false) {
    // Create message row
    const msgRow = document.createElement('div');
    msgRow.className = `msg-row ${isUser ? 'user' : 'bot'}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    
    // Format message with line breaks
    const formattedText = text.replace(/\n/g, '<br>');
    
    bubble.innerHTML = formattedText + `
        <div class="meta">
            <span class="badge">${isUser ? 'You' : 'Support'}</span>
            <span>${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        </div>
    `;
    
    msgRow.appendChild(bubble);
    chatMessages.appendChild(msgRow);
    
    // Scroll to bottom
    setTimeout(() => {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    }, 100);
}

// Type message character by character with realistic human-like delays
function typeMessageCharacterByCharacter(message, targetElement, callback) {
    let index = 0;
    const text = message;
    const words = text.split(/(\s+)/); // Split by spaces but keep spaces
    
    function typeNext() {
        if (index < words.length) {
            const word = words[index];
            const isSpace = /^\s+$/.test(word);
            
            // Calculate delay based on character type
            let delay = 30 + Math.random() * 40; // Base delay 30-70ms per character
            
            // Longer delays for spaces and punctuation
            if (isSpace) {
                delay = 50 + Math.random() * 100; // 50-150ms for spaces
            } else if (/[.,!?;:]/.test(word)) {
                delay = 100 + Math.random() * 150; // 100-250ms for punctuation
            } else if (word.length > 8) {
                delay = 40 + Math.random() * 50; // Slightly slower for long words
            }
            
            // Add word to element
            targetElement.textContent += word;
            
            // Scroll to bottom
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight,
                behavior: 'smooth'
            });
            
            index++;
            setTimeout(typeNext, delay);
        } else {
            // Finished typing
            if (callback) callback();
        }
    }
    
    // Start typing after a short initial delay
    setTimeout(typeNext, 100 + Math.random() * 200);
}

// Add message with typing indicator (shows typing first, then message after delay)
function addMessageWithTyping(text, isUser = false) {
    // For user messages, show immediately
    if (isUser) {
        addMessageDirect(text, true);
    } else {
        // For bot messages, show typing indicator first, then message after delay
        showTypingIndicator();
        
        // Random delay before showing message (simulates "thinking" time)
        const thinkingDelay = 1500 + Math.random() * 2000; // 1500-3500ms
        
        setTimeout(() => {
            removeTypingIndicator();
            // Display complete message at once
            addMessageDirect(text, false);
        }, thinkingDelay);
    }
}

// Send message to server
async function sendMessage() {
    const message = messageInput.value.trim();
    
    if (!message) {
        return;
    }
    
    // Add user message to chat (instant, no typing animation)
    addMessage(message, true);
    messageInput.value = '';
    sendButton.disabled = true;
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                userId: userId
            })
        });
        
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error('[Chat] Error parsing response:', parseError);
            removeTypingIndicator();
            addMessage('❌ Error: Invalid response from server. Please try again.', false);
            return;
        }
        
        // Check for server errors first
        if (!response.ok || data.error) {
            console.error('[Chat] Server error:', data);
            removeTypingIndicator();
            const errorMsg = data.error || data.message || 'Server error occurred';
            addMessage(`❌ ${errorMsg}`, false);
            return;
        }
        
        // CRITICAL: Server is batching messages (waiting 800ms to collect more)
        // Keep typing indicator showing until response arrives
        // Don't remove it here - wait for the actual response
        if (data.batching === true || (!data.response && !data.message)) {
            // Server is batching - keep typing indicator showing
            // The response will come when batching completes
            console.log('[Chat] Server is batching messages - keeping typing indicator visible');
            return; // Don't remove typing indicator yet, wait for response
        }
        
        if (data.response || data.message) {
            const responseText = data.response || data.message;
            // Wait a bit before showing response (typing indicator already shown)
            const thinkingDelay = 1500 + Math.random() * 2000; // 1500-3500ms thinking time
            
            setTimeout(() => {
                removeTypingIndicator();
                // Display complete message at once
                addMessageDirect(responseText, false);
            }, thinkingDelay);
        } else {
            // No response - error
            console.error('[Chat] No response in data:', data);
            removeTypingIndicator();
            addMessage('❌ Error: No response received from server. Please try again.', false);
        }
        
    } catch (error) {
        console.error('Error:', error);
        removeTypingIndicator();
        // Error messages appear instantly (no typing animation)
        addMessage('I apologize, but I encountered an error. Please try again.', false);
    } finally {
        sendButton.disabled = false;
        messageInput.focus();
    }
}


// Event listeners
sendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('input', updateCharCount);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Handle paste event for images in chat input
messageInput.addEventListener('paste', async (e) => {
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // Check if pasted item is an image
        if (item.type.indexOf('image') !== -1) {
            e.preventDefault();
            
            const file = item.getAsFile();
            if (!file) return;
            
            // Check file size (max 10MB for pasted images)
            if (file.size > 10 * 1024 * 1024) {
                addMessage('❌ Image is too large. Maximum size is 10MB.', false);
                return;
            }
            
            // Create preview
            const reader = new FileReader();
            reader.onload = (event) => {
                const imageUrl = event.target.result;
                
                // Show image in chat with preview
                addMessage('', true, imageUrl, 'image', file.name);
                
                // Upload image automatically
                uploadPastedImage(file);
            };
            reader.readAsDataURL(file);
            break;
        }
    }
});

// Extract order number from conversation (all visible messages)
function extractOrderNumberFromConversation() {
    const messages = document.querySelectorAll('.message-content p');
    let allText = '';
    
    messages.forEach(msg => {
        allText += ' ' + msg.textContent;
    });
    
    // Add current input value
    allText += ' ' + messageInput.value;
    
    // Try multiple patterns
    const patterns = [
        /(?:order|txn|transaction|ref|reference)[:\s#]*([A-Z0-9]{6,})/i,
        /order[:\s#]*(\d{6,})/i,
        /#([A-Z0-9]{6,})/,
        /([A-Z]{2,}\d{4,})/,
        /(\d{8,})/
    ];
    
    for (const pattern of patterns) {
        const match = allText.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    
    return null;
}

// Upload pasted image
async function uploadPastedImage(file) {
    try {
        // Extract order number from entire conversation
        const orderNumber = extractOrderNumberFromConversation();
        
        const formData = new FormData();
        formData.append('receipt', file);
        formData.append('userId', userId);
        if (orderNumber) {
            formData.append('orderNumber', orderNumber);
        }
        
        const response = await fetch('/api/upload-receipt', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Build validation message for pasted images (same logic as file upload)
            let validationMessage = '';
            
            // Prioritize server-generated OpenAI message if available
            if (data.message && typeof data.message === 'string' && data.message.trim()) {
                validationMessage = data.message;
            } else if (data.validation) {
                const val = data.validation;
                
                if (val.isSuccessful) {
                    // Order found in database = Successful
                    validationMessage = `✅ **Transaction Successful!**\n\n`;
                    validationMessage += `📋 Order Number: ${val.foundOrderNumber}\n`;
                    
                    if (val.databaseMatch && val.databaseMatch.data) {
                        const dbData = val.databaseMatch.data;
                        if (dbData.amount) {
                            validationMessage += `💰 Amount: ₹${dbData.amount.toLocaleString()}\n`;
                        }
                    }
                    
                    validationMessage += `\n🎮 Please reopen the Yono777 app and enjoy gaming!\n\nThank you for reaching out to us!`;
                } else if (val.foundOrderNumber) {
                    // Check if deposit is 2+ days old
                    const isOldDeposit = val.issues && val.issues.some(i => i.includes('2+ days old') || i.includes('PDF bank statement'));
                    
                    if (isOldDeposit) {
                        // Deposit is 2+ days old - ask for PDF + video
                        validationMessage = `⚠️ **Deposit Verification Required**\n\n`;
                        validationMessage += `📋 Order Number: ${val.foundOrderNumber}\n\n`;
                        validationMessage += `We notice this deposit was made 2 or more days ago and is still not showing in our system. To help us verify and process your transaction, please provide:\n\n`;
                        validationMessage += `📄 **PDF Bank Statement** showing the transaction\n`;
                        validationMessage += `📹 **Video Recording** showing the transaction on your banking app\n\n`;
                        validationMessage += `This will help our team verify and process your deposit quickly. Please upload both documents when ready.\n\n`;
                        validationMessage += `Thank you for your cooperation!`;
                    } else {
                        // Order number found but NOT in database = Still processing
                        validationMessage = `⚠️ **Payment Processing**\n\n`;
                        validationMessage += `📋 Order Number: ${val.foundOrderNumber}\n\n`;
                        validationMessage += `Your payment is still processing. We will follow up on this with our relevant team.\n\nThank you for reaching out to us!`;
                    }
                } else {
                    // No order number found - ask user to provide it first
                    const hasFailedStatus = val.issues && val.issues.some(i => i.includes('Transaction failed') || i.includes('failed'));
                    
                    if (hasFailedStatus) {
                        // Transaction failed
                        validationMessage = `❌ **Transaction Failed**\n\n`;
                        validationMessage += `This receipt shows a failed transaction. The receipt is invalid.\n\n`;
                        validationMessage += `**Please send a valid receipt with a successful transaction.**\n\n`;
                        validationMessage += `Thank you for reaching out to us!`;
                    } else {
                        // Order number not found - ask user to provide it
                        validationMessage = `⚠️ **Order Number Required**\n\n`;
                        validationMessage += `📋 Order number not found in the receipt.\n\n`;
                        validationMessage += `**Please provide your order number to proceed with validation.**\n\n`;
                        validationMessage += `You can:\n`;
                        validationMessage += `• Type your order number in the chat\n`;
                        validationMessage += `• Or send a new receipt with the order number clearly visible\n\n`;
                        validationMessage += `Thank you for reaching out to us!`;
                    }
                }
            } else {
                // Fallback
                const orderInfo = data.orderNumber ? ` for order ${data.orderNumber}` : '';
                validationMessage = `✅ Image uploaded successfully${orderInfo}. The support team has been notified.`;
            }
            
            addMessage(validationMessage, false);
        } else {
            addMessage('❌ Failed to upload image. Please try again.', false);
        }
    } catch (error) {
        console.error('Error uploading pasted image:', error);
        addMessage('❌ Error uploading image. Please try again.', false);
    }
}

// Also handle paste on chat container for better UX
if (chatMessages) {
    chatMessages.addEventListener('paste', async (e) => {
        const items = e.clipboardData.items;
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                
                const file = item.getAsFile();
                if (!file) return;
                
                if (file.size > 10 * 1024 * 1024) {
                    addMessage('❌ Image is too large. Maximum size is 10MB.', false);
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    const imageUrl = event.target.result;
                    addMessage('', true, imageUrl, 'image', file.name);
                    uploadPastedImage(file);
                };
                reader.readAsDataURL(file);
                break;
            }
        }
    });
}


// Handle receipt/image upload - FIXED FOR MOBILE & WEB
const attachBtn = document.getElementById('attachBtn');
const receiptInput = document.getElementById('receiptInput');

if (attachBtn && receiptInput) {
    // Fix: Attach button click handler
    attachBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Attach button clicked'); // Debug
        receiptInput.click();
    });

    // Fix: File input change handler - works for both mobile and web
    receiptInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            console.log('[File Upload] No file selected');
            return;
        }
        
        console.log('[File Upload] File selected:', file.name, file.type, file.size);
        
        // Reset input to allow selecting same file again
        e.target.value = '';
        
        // Validate file type (images, PDFs, videos)
        const isImage = file.type.startsWith('image/');
        const isPDF = file.type === 'application/pdf';
        const isVideo = file.type.startsWith('video/');
        
        if (!isImage && !isPDF && !isVideo) {
            alert('❌ Please select an image file (JPG, PNG), PDF file, or video file (MP4, etc.)');
            receiptInput.value = '';
            return;
        }
        
        // Validate file size based on file type
        const maxSize = isVideo ? 100 * 1024 * 1024 : (isPDF ? 20 * 1024 * 1024 : 10 * 1024 * 1024); // 100MB for videos, 20MB for PDFs, 10MB for images
        if (file.size > maxSize) {
            const maxSizeMB = maxSize / (1024 * 1024);
            alert(`❌ File size must be less than ${maxSizeMB}MB. Your file: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
            receiptInput.value = '';
            return;
        }
        
        try {
            // Show file preview immediately in chat
            const fileName = file.name;
            
            if (isImage) {
                // Create preview for image
                console.log('[File Upload] Creating image preview for:', fileName);
                const reader = new FileReader();
                reader.onerror = (error) => {
                    console.error('[File Upload] Error reading image file:', error);
                    addMessage('❌ Error loading image. Please try again.', true);
                };
                reader.onload = (event) => {
                    try {
                        const imageUrl = event.target.result;
                        console.log('[File Upload] Image preview created, URL length:', imageUrl.length);
                        addMessage('', true, imageUrl, 'image', fileName);
                        console.log('[File Upload] Image message added to chat');
                    } catch (error) {
                        console.error('[File Upload] Error displaying image:', error);
                        addMessage('❌ Error displaying image. Please try again.', true);
                    }
                };
                reader.readAsDataURL(file);
            } else if (isPDF) {
                // Show PDF file preview
                addMessage('', true, null, 'pdf', fileName);
            } else if (isVideo) {
                // Show video file preview with thumbnail if possible
                const reader = new FileReader();
                reader.onload = (event) => {
                    // For videos, we can't easily create a thumbnail, so just show file info
                    addMessage('', true, null, 'video', fileName);
                };
                // For now, just show the file info
                addMessage('', true, null, 'video', fileName);
            }
            
            // Create form data
            const formData = new FormData();
            formData.append('receipt', file);
            formData.append('userId', userId);
            
            // Try to extract order number from chat
            const orderNumber = extractOrderNumberFromConversation();
            if (orderNumber) {
                formData.append('orderNumber', orderNumber);
                console.log('Order number found:', orderNumber);
            }
            
            // Upload to server
            console.log('[File Upload] 🔥 Uploading file to server via FILE ATTACHMENT button...');
            console.log('[File Upload] File details:', { name: fileName, type: file.type, size: file.size });
            console.log('[File Upload] FormData contents:', {
                hasReceipt: formData.has('receipt'),
                hasUserId: formData.has('userId'),
                hasOrderNumber: formData.has('orderNumber'),
                userId: userId
            });
            
            let response;
            try {
                response = await fetch('/api/upload-receipt', {
                    method: 'POST',
                    body: formData
                });
                console.log('[File Upload] ✅ Upload request sent, response status:', response.status);
            } catch (networkError) {
                console.error('[File Upload] ❌ Network error:', networkError);
                addMessage('❌ Network error. Please check your connection and try again.', false);
                return;
            }
            
            if (!response.ok) {
                console.error('[File Upload] Upload failed with status:', response.status);
                let errorMessage = 'Upload failed. Please try again.';
                try {
                    const errorData = await response.json();
                    if (errorData.message) {
                        errorMessage = `❌ ${errorData.message}`;
                    } else if (errorData.error) {
                        errorMessage = `❌ ${errorData.error}`;
                    }
                    console.error('[File Upload] Error response:', errorData);
                } catch (parseError) {
                    const errorText = await response.text();
                    console.error('[File Upload] Error response (text):', errorText);
                    if (errorText) {
                        errorMessage = `❌ ${errorText.substring(0, 100)}`;
                    }
                }
                addMessage(errorMessage, false);
                return;
            }
            
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                console.error('[File Upload] Error parsing response:', parseError);
                addMessage('❌ Error processing server response. Please try again.', false);
                return;
            }
            console.log('[File Upload] ✅ Upload response received:', JSON.stringify(data, null, 2));
            console.log('[File Upload] Response data.message type:', typeof data.message, 'value:', data.message);
            
            if (response.ok && data.success) {
                console.log('📥 Upload response received:', data);
                console.log('📥 requiresPDFAndVideo type:', typeof data.requiresPDFAndVideo, 'value:', data.requiresPDFAndVideo);
                console.log('📥 requiresPDFAndVideo === true?', data.requiresPDFAndVideo === true);
                console.log('📥 has message:', !!data.message);
                console.log('📥 message type:', typeof data.message);
                // Safely handle message - it might be a string, object, or undefined
                if (data.message) {
                    if (typeof data.message === 'string') {
                        console.log('📥 message preview:', data.message.substring(0, 100));
                    } else {
                        console.log('📥 message (not a string):', data.message);
                    }
                } else {
                    console.log('📥 NO MESSAGE');
                }
                console.log('📥 validation:', data.validation);
                
                // Check if server returned a direct message (e.g., for 2+ days old receipt)
                // This check MUST be first, before building validation message
                if (data.requiresPDFAndVideo === true && data.message) {
                    console.log('✅✅✅ RECEIVED 2+ DAYS OLD RESPONSE - USING SERVER MESSAGE');
                    console.log('✅ Message:', data.message);
                    // Server already provided the message for 2+ days old receipt
                    // Show typing indicator FIRST
                    showTypingIndicator();
                    
                    // Wait before showing message (simulate thinking)
                    const thinkingDelay = 1500 + Math.random() * 2000; // 1500-3500ms thinking time
                    
                    setTimeout(() => {
                        // Remove typing indicator
                        removeTypingIndicator();
                        // Display complete message at once
                        console.log('✅ Displaying 2+ days message:', data.message);
                        // Ensure message is a string before displaying
                        const messageToDisplay = (data.message && typeof data.message === 'string') 
                            ? data.message 
                            : String(data.message || 'Thank you for providing the receipt.');
                        addMessageDirect(messageToDisplay, false);
                    }, thinkingDelay);
                    
                    console.log('✅ Upload successful (2+ days old):', data);
                    return;
                } else {
                    console.log('❌ NOT using 2+ days response. requiresPDFAndVideo:', data.requiresPDFAndVideo, 'has message:', !!data.message);
                }
                
                // Build validation message based on database check
                let validationMessage = '';
                
                // Determine file type for appropriate messaging
                const fileType = data.fileType || 'image';
                const fileTypeName = fileType === 'pdf' ? 'PDF document' : (fileType === 'video' ? 'video recording' : 'receipt');
                
                // Prioritize server-generated OpenAI message if available
                if (data.message && typeof data.message === 'string' && data.message.trim()) {
                    validationMessage = data.message;
                } else if (data.validation) {
                    const val = data.validation;
                    
                    if (val.isSuccessful) {
                        // Order found in database = Successful
                        validationMessage = `✅ **Transaction Successful!**\n\n`;
                        validationMessage += `📋 Order Number: ${val.foundOrderNumber}\n`;
                        
                        if (val.databaseMatch && val.databaseMatch.data) {
                            const dbData = val.databaseMatch.data;
                            if (dbData.amount) {
                                validationMessage += `💰 Amount: ₹${dbData.amount.toLocaleString()}\n`;
                            }
                        }
                        
                        validationMessage += `\n📎 ${fileTypeName.charAt(0).toUpperCase() + fileTypeName.slice(1)} received and verified.\n`;
                        validationMessage += `\n🎮 Please reopen the Yono777 app and enjoy gaming!\n\nThank you for reaching out to us!`;
                    } else if (val.foundOrderNumber) {
                        // Order number found but NOT in database = Still processing
                        // BUT check if this is actually a 2+ days old case that wasn't caught
                        if (val.isOldDeposit === true) {
                            // This should have been caught by requiresPDFAndVideo, but as fallback
                            validationMessage = `Checking your deposit was still processing and if already more than 2 days old, kindly provide a PDF file and a video recording for further checking.\n\n📄 **PDF Bank Statement** (with transaction details)\n🎥 **Video Recording** (showing the successful deposit transaction)\n\nPlease provide both documents along with the PDF password (if protected) so our team can verify and process your deposit immediately.\n\nThank you for your cooperation!`;
                        } else {
                            // Order number found but NOT in database = Still processing
                            validationMessage = `⚠️ **Payment Processing**\n\n`;
                            validationMessage += `📋 Order Number: ${val.foundOrderNumber}\n`;
                            validationMessage += `📎 ${fileTypeName.charAt(0).toUpperCase() + fileTypeName.slice(1)} received.\n\n`;
                            validationMessage += `Your payment is still processing. We will follow up on this with our relevant team.\n\nThank you for reaching out to us!`;
                        }
                    } else {
                        // No order number found - ask user to provide it first
                        if (fileType === 'image') {
                            // Only check for failed status for images (OCR can detect this)
                            const hasFailedStatus = val.issues && val.issues.some(i => i.includes('Transaction failed') || i.includes('failed'));
                            
                            if (hasFailedStatus) {
                                // Transaction failed
                                validationMessage = `❌ **Transaction Failed**\n\n`;
                                validationMessage += `This receipt shows a failed transaction. The receipt is invalid.\n\n`;
                                validationMessage += `**Please send a valid receipt with a successful transaction.**\n\n`;
                                validationMessage += `Thank you for reaching out to us!`;
                            } else {
                                // Order number not found - ask user to provide it
                                validationMessage = `⚠️ **Order Number Required**\n\n`;
                                validationMessage += `📋 Order number not found in the receipt.\n\n`;
                                validationMessage += `**Please provide your order number to proceed with validation.**\n\n`;
                                validationMessage += `You can:\n`;
                                validationMessage += `• Type your order number in the chat\n`;
                                validationMessage += `• Or send a new receipt with the order number clearly visible\n\n`;
                                validationMessage += `Thank you for reaching out to us!`;
                            }
                        } else {
                            // For PDF and video, just acknowledge receipt
                            validationMessage = `✅ **${fileTypeName.charAt(0).toUpperCase() + fileTypeName.slice(1)} Received**\n\n`;
                            validationMessage += `Thank you for providing your ${fileTypeName}. Our team will review it and process your deposit accordingly.\n\n`;
                            if (!data.orderNumber) {
                                validationMessage += `**Please provide your order number if you haven't already.**\n\n`;
                            }
                            validationMessage += `Thank you for reaching out to us!`;
                        }
                    }
                } else {
                    // Fallback for old response format
                    const orderInfo = data.orderNumber ? ` (Order: ${data.orderNumber})` : '';
                    validationMessage = `✅ ${fileTypeName.charAt(0).toUpperCase() + fileTypeName.slice(1)} uploaded successfully${orderInfo}! Support team has been notified.`;
                }
                
                // Show typing indicator first, then display message after delay
                showTypingIndicator();
                
                // Calculate delay based on message length (simulate thinking time)
                const thinkingDelay = 1500 + Math.random() * 2000; // 1500-3500ms thinking time
                
                setTimeout(() => {
                    removeTypingIndicator();
                    // Display complete message at once
                    addMessageDirect(validationMessage, false);
                }, thinkingDelay);
                
                console.log('Upload successful:', data);
                console.log('[File Upload] ✅ Receipt stored in conversation history on server');
            } else {
                // Check both 'error' and 'message' fields for error messages
                const errorMsg = data.message || data.error || 'Unknown error';
                // Error messages appear instantly
                addMessage(`❌ Upload failed: ${errorMsg}`, false);
                console.error('[File Upload] ❌ Upload failed:', data);
                console.error('[File Upload] ❌ Receipt NOT stored in conversation history - upload failed');
            }
        } catch (error) {
            console.error('[File Upload] Upload error:', error);
            console.error('[File Upload] Error details:', {
                message: error?.message,
                stack: error?.stack,
                name: error?.name,
                error: error
            });
            // Safely handle error message - error.message might not exist or might not be a string
            let errorMsg = 'Unknown error occurred';
            if (error) {
                if (error.message && typeof error.message === 'string') {
                    errorMsg = error.message;
                } else if (typeof error === 'string') {
                    errorMsg = error;
                } else {
                    errorMsg = JSON.stringify(error).substring(0, 100);
                }
            }
            addMessage(`❌ Error uploading receipt: ${errorMsg}. Please try again.`, false);
        }
        
        // Always reset file input
        receiptInput.value = '';
    });
    
    // Mobile-specific fix: Make input accessible for tap events
    receiptInput.setAttribute('capture', 'environment');
} else {
    console.warn('Attach button or receipt input not found');
}

// Focus input on load
messageInput.focus();
updateCharCount();

// Import button handler
const importBtn = document.getElementById('importBtn');
const importFileInput = document.getElementById('importFileInput');

if (importBtn && importFileInput) {
    importBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Import button clicked');
        importFileInput.click();
    });

    importFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Check file type
        const validExtensions = ['xlsx', 'xls', 'csv'];
        const fileExtension = file.name.split('.').pop().toLowerCase();
        
        if (!validExtensions.includes(fileExtension)) {
            alert('❌ Please select a valid Excel file (XLSX, XLS, CSV)');
            importFileInput.value = '';
            return;
        }

        // Check file size (max 50MB)
        if (file.size > 50 * 1024 * 1024) {
            alert('❌ File size must be less than 50MB. Your file: ' + (file.size / 1024 / 1024).toFixed(2) + 'MB');
            importFileInput.value = '';
            return;
        }

        // Show uploading status
        const originalButtonText = importBtn.innerHTML;
        importBtn.innerHTML = '<span style="color: #FFD700;">⏳</span>';
        importBtn.disabled = true;

        try {
            // Upload file
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/import', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                // Show success message in chat
                const successMsg = `✅ Import Successful!\n📊 Imported: ${result.result.importedRecords}/${result.result.totalRecords} records\n${result.result.errorCount > 0 ? '⚠️ Errors: ' + result.result.errorCount : ''}`;
                
                addSystemMessage(successMsg);
                console.log('Import successful:', result);
                
                // Show any errors if present
                if (result.result.errors && result.result.errors.length > 0) {
                    console.warn('Import errors:', result.result.errors);
                }
            } else {
                addSystemMessage(`❌ Import Failed: ${result.error}\n${result.message}`);
                console.error('Import error:', result);
            }

        } catch (error) {
            console.error('Upload error:', error);
            addSystemMessage(`❌ Upload Error: ${error.message}`);
        } finally {
            // Reset button
            importBtn.innerHTML = originalButtonText;
            importBtn.disabled = false;
            importFileInput.value = '';
        }
    });
}

// Helper function to add system message to chat
function addSystemMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    messageDiv.innerHTML = `
        <div class="message-avatar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
            </svg>
        </div>
        <div class="message-wrapper">
            <div class="message-content">
                <p style="white-space: pre-line;">${message}</p>
            </div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Minimize button (placeholder)
document.getElementById('minimizeBtn')?.addEventListener('click', () => {
    // Add minimize functionality if needed
    console.log('Minimize clicked');
});

