# How to Add AI Profile Picture

## Steps:

### Option 1: Using Online Image (ibb.co, imgur, etc.)

1. **Upload your image to an image hosting service:**
   - Go to https://ibb.co or https://imgur.com
   - Upload your image
   - **IMPORTANT**: Get the DIRECT image URL (not the page URL)

2. **Get the direct image URL:**
   - For ibb.co: Right-click the image → "Copy image address"
   - The URL should look like: `https://i.ibb.co/xxxxx/image.jpg`
   - NOT like: `https://ibb.co/xxxxx` (this is the page URL, not the image)

3. **Update the URL in code:**
   - Open `public/script.js`
   - Find: `const BOT_AVATAR_IMAGE = '...';`
   - Replace with your direct image URL
   - Also update `public/index.html` line 105 with the same URL

### Option 2: Using Local Image File

1. **Place the image file:**
   - Save your image in the `public` folder
   - Name it `bot-avatar.png` (or any name)

2. **Update the path:**
   - In `public/script.js`: `const BOT_AVATAR_IMAGE = '/bot-avatar.png';`
   - In `public/index.html` line 105: `src="/bot-avatar.png"`

## Current Setup:

The code is configured to use an online image URL. If the image doesn't load, it will automatically fall back to the SVG icon.

## Testing:

1. Update the image URL in both `script.js` and `index.html`
2. Restart the server: `npm start`
3. Open `http://localhost:3000` in your browser
4. The AI avatar should now show your profile picture in:
   - Chat header
   - Bot messages
   - Typing indicator

## Tips:

- Use direct image URLs (ends with .jpg, .png, etc.)
- Square images (1:1 ratio) look best
- Keep the file size small for faster loading
- The image will be automatically cropped to fit the circular avatar shape
- If using ibb.co, make sure to get the direct link (starts with `i.ibb.co`)

