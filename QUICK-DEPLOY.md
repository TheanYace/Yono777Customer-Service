# 🚀 Quick Deployment Reference

## **3 Steps to Live Bot (15 minutes)**

### **Step 1: Push to GitHub** (5 min)
```powershell
git config --global user.email "your@email.com"
git config --global user.name "Your Name"
git init
git add .
git commit -m "YONO777 Bot"
```

Then go to https://github.com/new:
- Name: `CSRAIWEBCHAT`
- Public
- Create

Then:
```powershell
git remote add origin https://github.com/YOUR_USERNAME/CSRAIWEBCHAT.git
git push -u origin main
```

### **Step 2: Deploy on Railway** (5 min)
1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Select CSRAIWEBCHAT
4. Click Deploy

### **Step 3: Add Variables & Test** (5 min)
1. Railway dashboard → Variables
2. Add:
   - `TELEGRAM_BOT_TOKEN=8407314352:AAGKVM83tmffZqnwoLUdlspthGe0iQ0OIZE`
   - `TELEGRAM_GROUP_ID=-1003200798130`
   - `NODE_ENV=production`
3. Save (auto-redeploy)
4. Copy URL from Settings
5. Test: `https://your-app-xxxxx.railway.app/`

**Done! Bot is live 24/7 ✅**

---

## **Useful Commands**

```powershell
# Check git status
git status

# Push updates later
git add .
git commit -m "Your message"
git push

# See commit history
git log --oneline
```

---

## **Troubleshooting**

| Problem | Solution |
|---------|----------|
| Git command not found | Install Git: https://git-scm.com |
| Can't push to GitHub | Check if origin URL is correct: `git remote -v` |
| Bot not responding | Check Railway Logs tab for errors |
| Variables not set | Make sure you saved in Railway Variables tab |
| Port error | Railway auto-assigns PORT, no need to change |

---

## **Monitoring**

**Railway Dashboard:**
- Logs: Real-time output
- Metrics: CPU/RAM/Network
- Deployments: History & status

**Check Bot Health:**
```
https://your-app-xxxxx.railway.app/api/deposits
```
If returns JSON → Bot is alive ✅

---

## **Need Help?**

Railway Support: https://railway.app/support  
GitHub Docs: https://docs.github.com
