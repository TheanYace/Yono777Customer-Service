# Quick Deployment Guide

## 🚀 Fastest Way to Deploy (5 minutes)

### Option 1: Railway (Easiest - Recommended)

1. **Go to [railway.app](https://railway.app)** and sign up (free)
2. **Click "New Project"** → "Deploy from GitHub repo"
3. **Connect your GitHub** and select this repository
4. **Add Environment Variables** in Railway dashboard:
   - `TELEGRAM_BOT_TOKEN` = your bot token
   - `TELEGRAM_GROUP_ID` = your Telegram group ID
5. **Deploy** - Railway auto-detects Node.js and deploys!
6. **Get your domain**: Railway gives you `your-app.railway.app` for free
7. **Custom domain**: Add your own domain in Settings → Domains

**That's it!** Your app is live at `https://your-app.railway.app`

---

### Option 2: Render (Also Easy)

1. **Go to [render.com](https://render.com)** and sign up (free)
2. **Click "New +"** → "Web Service"
3. **Connect your GitHub** repository
4. **Settings**:
   - Name: `yono777-support` (or any name)
   - Region: Choose closest to your users
   - Branch: `main` (or your main branch)
   - Root Directory: `.` (leave empty)
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
5. **Add Environment Variables**:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_GROUP_ID`
6. **Click "Create Web Service"**
7. **Wait 2-3 minutes** for deployment
8. **Get free domain**: `your-app.onrender.com`
9. **Add custom domain**: Settings → Custom Domains

---

## 🌐 Adding Your Own Domain

### Step 1: Buy a Domain
- **Namecheap**: ~$10/year
- **GoDaddy**: ~$12/year
- **Cloudflare**: ~$8/year (cheapest)

### Step 2: Point Domain to Your Host

**For Railway:**
1. Go to your project → Settings → Domains
2. Click "Add Domain"
3. Enter your domain (e.g., `support.yono777.com`)
4. Railway will give you DNS records
5. Add these records in your domain registrar's DNS settings
6. Wait 5-10 minutes for DNS to propagate

**For Render:**
1. Go to Settings → Custom Domains
2. Click "Add"
3. Enter your domain
4. Follow DNS instructions
5. Render automatically sets up HTTPS (SSL)

---

## 📋 What You'll Need

1. **GitHub Account** (free) - to host your code
2. **Railway/Render Account** (free tier available)
3. **Domain Name** (optional, ~$8-12/year)
4. **Telegram Bot Token** (already have)
5. **Telegram Group ID** (already have)

---

## ✅ After Deployment

Your app will be accessible at:
- **Main Chat**: `https://your-domain.com`
- **Deposits Page**: `https://your-domain.com/deposits`
- **API**: `https://your-domain.com/api/statistics`

Share these links with your users!

---

## 🔒 Security Notes

- ✅ HTTPS is automatic (free SSL certificate)
- ✅ Environment variables are secure (not exposed)
- ✅ Database is private (SQLite file on server)
- ⚠️ Make sure `.env` is in `.gitignore` (already done)

---

## 💡 Tips

1. **Free tier limits**: 
   - Railway: 500 hours/month free
   - Render: Free tier with some limitations
   - Both are great for starting!

2. **Database persistence**: 
   - Railway/Render keep your database file
   - Consider backing up `yono777.db` regularly

3. **Monitoring**:
   - Check logs in Railway/Render dashboard
   - Set up alerts if needed

---

## 🆘 Troubleshooting

**App won't start?**
- Check environment variables are set
- Check logs in dashboard
- Verify `npm start` works locally

**Domain not working?**
- Wait 10-15 minutes for DNS propagation
- Check DNS records are correct
- Verify domain is added in hosting dashboard

**Database issues?**
- Database file is created automatically
- Make sure server has write permissions
- Check file path in logs

---

## 📞 Need Help?

- Railway Support: https://railway.app/docs
- Render Support: https://render.com/docs
- Your deployment guide: See `DEPLOYMENT_GUIDE.md`

**Ready to deploy?** Choose Railway or Render and follow the steps above! 🚀

