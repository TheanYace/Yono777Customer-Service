# Deployment Guide - Yono777 Customer Support

This guide will help you deploy your application to a public domain so many people can access it.

## Deployment Options

### Option 1: Railway (Recommended - Easy & Free Tier Available)
**Best for**: Quick deployment, automatic HTTPS, free tier available

1. **Sign up at [Railway.app](https://railway.app)**
2. **Create a new project**
3. **Connect your GitHub repository** (or deploy directly)
4. **Add environment variables**:
   - `PORT` (Railway sets this automatically)
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_GROUP_ID`
5. **Deploy** - Railway will automatically detect Node.js and deploy
6. **Get your domain**: Railway provides a free `.railway.app` domain
7. **Custom domain**: Add your own domain in Railway settings

### Option 2: Render (Free Tier Available)
**Best for**: Free hosting with custom domains

1. **Sign up at [Render.com](https://render.com)**
2. **Create a new Web Service**
3. **Connect your repository**
4. **Settings**:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node
5. **Add environment variables** (same as above)
6. **Deploy**
7. **Get free domain**: `your-app.onrender.com`
8. **Add custom domain**: In settings → Custom Domains

### Option 3: VPS (DigitalOcean, AWS, Linode, etc.)
**Best for**: Full control, better performance

1. **Create a VPS instance** (Ubuntu recommended)
2. **Install Node.js and npm**
3. **Clone your repository**
4. **Install dependencies**: `npm install`
5. **Use PM2 for process management**:
   ```bash
   npm install -g pm2
   pm2 start server.js --name yono777-support
   pm2 save
   pm2 startup
   ```
6. **Set up Nginx as reverse proxy**
7. **Configure SSL with Let's Encrypt**

### Option 4: Heroku
**Best for**: Simple deployment, well-documented

1. **Install Heroku CLI**
2. **Login**: `heroku login`
3. **Create app**: `heroku create your-app-name`
4. **Set environment variables**:
   ```bash
   heroku config:set TELEGRAM_BOT_TOKEN=your_token
   heroku config:set TELEGRAM_GROUP_ID=your_group_id
   ```
5. **Deploy**: `git push heroku main`
6. **Get domain**: `your-app-name.herokuapp.com`

## Domain Setup

### Using Railway/Render Free Domain
- Automatically provided (e.g., `your-app.railway.app`)
- Share this URL with users

### Using Custom Domain

1. **Purchase a domain** from:
   - Namecheap
   - GoDaddy
   - Google Domains
   - Cloudflare

2. **Point domain to your hosting**:
   - **Railway**: Add domain in project settings → Domains
   - **Render**: Settings → Custom Domains → Add domain
   - **VPS**: Update DNS A record to point to your server IP

3. **SSL Certificate**:
   - Railway/Render: Automatic HTTPS
   - VPS: Use Let's Encrypt with Certbot

## Environment Variables for Production

Create a `.env` file or set in your hosting platform:

```env
PORT=3000
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_GROUP_ID=your_telegram_group_id
NODE_ENV=production
```

## Important Configuration Updates

### 1. Update CORS Settings (if needed)
The current setup allows all origins. For production, you may want to restrict:

```javascript
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true
}));
```

### 2. Database File Location
Make sure the SQLite database file (`yono777.db`) persists:
- Railway/Render: Use persistent storage or database service
- VPS: Store in a persistent directory

### 3. File Upload Limits
Current limit is 10MB. Adjust if needed in `server.js`:
```javascript
limits: { fileSize: 10 * 1024 * 1024 } // 10MB
```

## Quick Start Commands

### For Railway:
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up
```

### For Render:
1. Connect GitHub repository
2. Render auto-detects and deploys
3. Add environment variables in dashboard

### For VPS:
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repository
git clone your-repo-url
cd CSRAIWEBCHAT

# Install dependencies
npm install

# Install PM2
npm install -g pm2

# Start application
pm2 start server.js --name yono777-support

# Make it start on boot
pm2 startup
pm2 save
```

## Testing Your Deployment

1. **Check if server is running**: Visit `https://your-domain.com`
2. **Test chat functionality**: Send a message
3. **Test deposits page**: Visit `https://your-domain.com/deposits`
4. **Test API**: `https://your-domain.com/api/statistics`

## Security Considerations

1. **Environment Variables**: Never commit `.env` to Git
2. **HTTPS**: Always use HTTPS in production
3. **Rate Limiting**: Consider adding rate limiting for API endpoints
4. **Input Validation**: Already implemented, but review regularly

## Monitoring

### Railway/Render:
- Built-in monitoring dashboards
- View logs in dashboard

### VPS with PM2:
```bash
pm2 logs yono777-support
pm2 monit
pm2 status
```

## Troubleshooting

### Port Issues:
- Railway/Render: Use `process.env.PORT` (already configured)
- VPS: Make sure port is open in firewall

### Database Issues:
- Ensure database file has write permissions
- Check file path is correct

### Telegram Bot Issues:
- Verify bot token is correct
- Ensure bot is added to Telegram group
- Check group ID is correct

## Sharing Your Application

Once deployed, share these URLs:
- **Main Chat**: `https://your-domain.com`
- **Deposits Management**: `https://your-domain.com/deposits`
- **API Base**: `https://your-domain.com/api`

## Need Help?

- Railway Docs: https://docs.railway.app
- Render Docs: https://render.com/docs
- PM2 Docs: https://pm2.keymetrics.io/docs

