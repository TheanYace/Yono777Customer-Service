# ✅ YONO777 Deployment Checklist

## **Pre-Deployment (15 min)**

- [ ] GitHub account created
- [ ] Railway account created (signed up with GitHub)
- [ ] Git configured locally:
  ```powershell
  git config --global user.email "your-email@gmail.com"
  git config --global user.name "Your Name"
  ```

---

## **Push to GitHub (5 min)**

### **Method 1: Command Line**
```powershell
cd C:\Users\LENOVO\Desktop\Bots Robots\CSRAIWEBCHAT

git init
git add .
git commit -m "Initial commit - YONO777 Bot"
git branch -M main

# Go to https://github.com/new
# Create repo: CSRAIWEBCHAT (Public)
# Then run:
git remote add origin https://github.com/YOUR_USERNAME/CSRAIWEBCHAT.git
git push -u origin main
```

### **Method 2: GitHub Desktop (Easier)**
- [ ] Download GitHub Desktop
- [ ] Open → Add Local Repository → Select folder
- [ ] Publish Repository → Name: CSRAIWEBCHAT
- [ ] Publish

**Verify:** Go to https://github.com/YOUR_USERNAME/CSRAIWEBCHAT - should see your files ✅

---

## **Deploy on Railway (5 min)**

- [ ] Go to https://railway.app
- [ ] Click **"New Project"**
- [ ] Select **"Deploy from GitHub repo"**
- [ ] Authorize Railway (click "Authorize")
- [ ] Select **CSRAIWEBCHAT** repo
- [ ] Click **Deploy**
- [ ] Wait for deployment (2-3 minutes)

**You'll see:** Deployment logs, then green ✅ status

---

## **Configure Environment Variables (2 min)**

In Railway dashboard:
- [ ] Click your project
- [ ] Go to **"Variables"** tab
- [ ] Add:
  ```
  TELEGRAM_BOT_TOKEN=8407314352:AAGKVM83tmffZqnwoLUdlspthGe0iQ0OIZE
  TELEGRAM_GROUP_ID=-1003200798130
  NODE_ENV=production
  ```
- [ ] Click **"Save"** (auto-redeploy starts)

---

## **Get Live URL (Instant)**

In Railway dashboard:
- [ ] Click **"Settings"** tab
- [ ] Find **"Domains"** section
- [ ] Copy your URL: `https://your-app-xxxxx.railway.app`

---

## **Test Everything (3 min)**

- [ ] **Test Web UI:**
  ```
  https://your-app-xxxxx.railway.app/
  ```
  Should load chat interface ✅

- [ ] **Test API:**
  ```
  https://your-app-xxxxx.railway.app/api/deposits?page=1&limit=50
  ```
  Should return JSON ✅

- [ ] **Test Telegram:**
  Send `/help` in your Telegram bot  
  Should respond with commands ✅

- [ ] **Check Logs:**
  In Railway → Logs tab  
  Should show "Telegram bot initialized successfully" ✅

---

## **You're Done! 🎉**

Your bot is now:
- ✅ Running 24/7
- ✅ Responding to Telegram
- ✅ Serving web UI
- ✅ Processing imports

---

## **Next Steps (Optional)**

- [ ] Share live URL with users
- [ ] Test import functionality
- [ ] Monitor logs regularly
- [ ] Set up domain (if needed later)

---

## **Emergency: Bot Not Working?**

1. Check Railway **Logs** tab
2. Look for red errors
3. Verify **Variables** are set correctly
4. Restart deployment: Settings → **"Restart"**

**Need help?** Share the error from Logs tab!
