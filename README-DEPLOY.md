# 🚀 YONO777 Bot - Deployment Guide (24/7 Online)

## **Overview**
This guide will get your bot running 24/7 on Railway.app (completely free tier works).

---

## **Prerequisites (5 minutes setup)**

### 1. **Create GitHub Account** (if you don't have one)
- Go to https://github.com/signup
- Fill in username, email, password
- Verify email
- Done ✅

### 2. **Create Railway Account**
- Go to https://railway.app
- Click **"Sign Up"**
- Choose **"Continue with GitHub"** (easiest)
- Authorize Railway
- Done ✅

---

## **Step 1: Push Code to GitHub** (5 minutes)

### **Option A: Using Git Commands (Recommended)**

Open PowerShell in your project folder and run:

```powershell
# Initialize git repo
git config --global user.email "your-email@gmail.com"
git config --global user.name "Your Name"

# Add all files
git add .

# Create first commit
git commit -m "Initial commit - YONO777 Customer Support Bot"

# Create and push to main branch
git branch -M main
```

### **Option B: Use GitHub Desktop (Easier for Beginners)**
1. Download https://desktop.github.com
2. Open GitHub Desktop
3. Click **"Add"** → **"Add Existing Repository"**
4. Select your CSRAIWEBCHAT folder
5. Click **"Create Repository"**
6. Click **"Publish repository"**
7. Name it: `CSRAIWEBCHAT`
8. Click **"Publish Repository"**

---

## **Step 2: Create GitHub Remote & Push** (3 minutes)

After initializing locally, create a repo on GitHub:

1. Go to https://github.com/new
2. Repository name: `CSRAIWEBCHAT`
3. Description: `YONO777 Customer Support Bot 24/7`
4. Choose **Public** (Railway needs to see it)
5. Click **"Create Repository"**

Then run in PowerShell:

```powershell
# Replace YOUR_USERNAME with your actual GitHub username
git remote add origin https://github.com/YOUR_USERNAME/CSRAIWEBCHAT.git
git push -u origin main
```

If you get stuck, GitHub will show you the exact commands to run.

---

## **Step 3: Deploy on Railway.app** (5 minutes)

### **Manual Deploy (Easiest)**

1. Go to https://railway.app
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access GitHub
5. Find and select **CSRAIWEBCHAT** repo
6. Click **Deploy**

Railway will:
- Detect Node.js automatically
- Run `npm install`
- Start the server with `npm start`
- Assign you a live URL

### **Add Environment Variables**

1. After deployment, go to your project in Railway
2. Click **"Variables"** tab
3. Add these variables:
   ```
   TELEGRAM_BOT_TOKEN = 8407314352:AAGKVM83tmffZqnwoLUdlspthGe0iQ0OIZE
   TELEGRAM_GROUP_ID = -1003200798130
   NODE_ENV = production
   ```
4. Click **"Save"**
5. Railway will auto-redeploy

---

## **Step 4: Get Your Live URL** (Instant)

1. In Railway dashboard, find your project
2. Click **"Settings"** tab
3. Look for **"Domains"**
4. You'll see something like: `https://your-app-xxxxx.railway.app`
5. **This is your bot's live URL!** ✅

---

## **Step 5: Test Your Bot** (1 minute)

### **Test Web UI:**
```
https://your-app-xxxxx.railway.app/
```
Should load your chat interface ✅

### **Test API:**
```
https://your-app-xxxxx.railway.app/api/deposits?page=1&limit=50
```
Should return JSON with deposits ✅

### **Test Telegram:**
Send `/importSuccessDeposit` in Telegram group  
Bot should respond ✅

---

## **Troubleshooting**

### **Bot not responding in Telegram?**
1. Go to Railway → **Logs** tab
2. Look for error messages
3. Check if TELEGRAM_BOT_TOKEN is correct in Variables

### **Web UI not loading?**
1. Visit: `https://your-app-xxxxx.railway.app/`
2. Open browser DevTools (F12)
3. Check Console for errors
4. Check Network tab

### **Database issues?**
1. Railway creates `/data` folder automatically
2. SQLite file (`yono777.db`) is stored there
3. Check Logs for SQLite errors

---

## **Keep Bot Running 24/7**

Railway.app automatically:
- ✅ Keeps your app running 24/7
- ✅ Restarts if it crashes
- ✅ Uses 500MB RAM free tier (enough)
- ✅ Auto-redeploys on GitHub push

You don't need to do anything - it just runs!

---

## **Monitor Your Bot**

In Railway Dashboard:
- **Logs**: Real-time server output
- **Metrics**: CPU, RAM, Network usage
- **Deployments**: See deployment history
- **Environment**: View/edit variables

---

## **Update Code Later**

Just push to GitHub and Railway auto-deploys:

```powershell
git add .
git commit -m "Updated features"
git push
```

Railway detects the push and redeploys automatically within 2 minutes!

---

## **Next Steps (Optional)**

Once running, you can:
1. **Add custom domain**: Buy a domain, point DNS to Railway
2. **Add database backups**: Set up automatic backups
3. **Monitor uptime**: Use UptimeRobot.com (free)
4. **Set up alerts**: Get notifications if bot crashes

---

## **Need Help?**

- Railway Docs: https://docs.railway.app
- GitHub Help: https://docs.github.com/en/get-started
- Telegram Bot API: https://core.telegram.org/bots/api

**Good luck! Your bot will be live in 15 minutes! 🎉**
