# 🚀 Agency Deployment Guide

This guide explains how to manually deploy a new agency's CRM system after the Owner Dashboard creates the repositories and database configuration.

## 📋 Prerequisites

### **Required for Repository Automation:**
- ✅ GitHub Personal Access Token with repository permissions
- ✅ Template repositories (LeadEstate-Agency-Frontend, LeadEstate-Agency-Backend)
- ✅ Environment variables configured on Render backend

### **Required for Manual Deployment:**
- 🔧 Vercel account (for frontend)
- 🔧 Render account (for backend)
- 🔧 Railway account (for database)
- 🔧 Domain name (optional)

## 🔧 GitHub Integration Setup

### **1. Create GitHub Personal Access Token**
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with these permissions:
   - `repo` (Full control of private repositories)
   - `admin:repo_hook` (Repository hooks)
3. Copy the token and add to Render environment variables:
   ```
   GITHUB_TOKEN=your_github_personal_access_token
   GITHUB_OWNER=your_github_username
   ```

### **2. Template Repositories Required**
Ensure these repositories exist in your GitHub account:
- `LeadEstate-Agency-Frontend` (React CRM template)
- `LeadEstate-Agency-Backend` (Node.js API template)

## 🏢 What Happens When Agency is Created

### **Automatic Process:**
1. **Database Record** - Agency saved to PostgreSQL
2. **Manager Account** - User account created
3. **Billing Setup** - Complete billing configuration
4. **GitHub Repositories** - Two new repos created:
   - `{agency-slug}-Frontend`
   - `{agency-slug}-Backend`
5. **Code Cloning** - Template code copied to new repos
6. **Configuration** - Agency-specific settings applied

### **Manual Steps Required:**
1. **Database Setup** - Create PostgreSQL database
2. **Backend Deployment** - Deploy to Render
3. **Frontend Deployment** - Deploy to Vercel
4. **Domain Configuration** - Set up custom domain
5. **Environment Variables** - Configure all integrations

## 📊 Database Setup (Railway)

### **1. Create Database**
```bash
# Database Configuration
Name: {agency-slug}_db
User: {agency-slug}_user
Password: [Generated automatically]
```

### **2. Database Schema**
The backend will automatically create tables on first run:
- `leads` - Lead management
- `properties` - Property listings
- `users` - User accounts
- `teams` - Team management
- `activities` - Activity tracking

### **3. Get Connection String**
```
postgresql://user:password@host:port/database
```

## 🖥️ Backend Deployment (Render)

### **1. Connect Repository**
1. Go to Render Dashboard
2. New → Web Service
3. Connect GitHub repository: `{agency-slug}-Backend`

### **2. Configuration**
```yaml
Name: {agency-slug}-api
Environment: Node
Build Command: npm install
Start Command: npm start
```

### **3. Environment Variables**
```env
# Required
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET=your-super-secret-jwt-key-32-chars-min
PORT=10000

# Email Integration (Brevo)
BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=noreply@youragency.com
BREVO_SENDER_NAME=Your Agency Name

# WhatsApp Integration (Twilio)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890

# Frontend URL
FRONTEND_URL=https://youragency.com

# Agency Configuration
AGENCY_NAME=Your Agency Name
AGENCY_ID={agency-slug}
```

### **4. Custom Domain (Optional)**
1. Add custom domain in Render
2. Configure DNS records
3. SSL certificate (automatic)

## 🌐 Frontend Deployment (Vercel)

### **1. Connect Repository**
1. Go to Vercel Dashboard
2. New Project
3. Import from GitHub: `{agency-slug}-Frontend`

### **2. Configuration**
```yaml
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

### **3. Environment Variables**
```env
# API Configuration
VITE_API_URL=https://{agency-slug}-api.onrender.com
VITE_AGENCY_NAME=Your Agency Name
VITE_AGENCY_ID={agency-slug}

# Optional: Custom branding
VITE_AGENCY_LOGO=/logo.png
VITE_PRIMARY_COLOR=#3B82F6
```

### **4. Custom Domain**
1. Add domain in Vercel project settings
2. Configure DNS records:
   ```
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```

## 🔐 Security Configuration

### **1. JWT Secret Generation**
```bash
# Generate secure JWT secret (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### **2. Database Security**
- Use strong passwords
- Enable SSL connections
- Restrict IP access
- Regular backups

### **3. API Security**
- CORS configuration
- Rate limiting
- Input validation
- SQL injection prevention

## 📧 Email Integration (Brevo)

### **1. Create Brevo Account**
1. Sign up at brevo.com
2. Get API key from account settings
3. Verify sender domain

### **2. Configuration**
```env
BREVO_API_KEY=your-api-key
BREVO_SENDER_EMAIL=noreply@youragency.com
BREVO_SENDER_NAME=Your Agency Name
```

## 📱 WhatsApp Integration (Twilio)

### **1. Create Twilio Account**
1. Sign up at twilio.com
2. Get Account SID and Auth Token
3. Set up WhatsApp sandbox or business account

### **2. Configuration**
```env
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890
```

## ✅ Deployment Checklist

### **Pre-Deployment**
- [ ] GitHub repositories created
- [ ] Database created on Railway
- [ ] Brevo account set up
- [ ] Twilio account set up (optional)
- [ ] Domain purchased (optional)

### **Backend Deployment**
- [ ] Repository connected to Render
- [ ] Environment variables configured
- [ ] Database connection tested
- [ ] API endpoints responding
- [ ] SSL certificate active

### **Frontend Deployment**
- [ ] Repository connected to Vercel
- [ ] Environment variables configured
- [ ] Build successful
- [ ] API connection working
- [ ] Custom domain configured (optional)

### **Post-Deployment**
- [ ] Manager invitation email sent
- [ ] Login functionality tested
- [ ] Lead creation tested
- [ ] Email notifications working
- [ ] WhatsApp integration tested (optional)
- [ ] Backup strategy implemented

## 🆘 Troubleshooting

### **Common Issues**
1. **Database Connection Failed**
   - Check DATABASE_URL format
   - Verify database is running
   - Check firewall settings

2. **Build Failures**
   - Check Node.js version compatibility
   - Verify all dependencies installed
   - Check environment variables

3. **API Not Responding**
   - Check PORT configuration
   - Verify environment variables
   - Check logs for errors

4. **Email Not Sending**
   - Verify Brevo API key
   - Check sender email verification
   - Review email templates

### **Support Resources**
- 📧 Email: support@leadestate.com
- 📚 Documentation: docs.leadestate.com
- 🐛 Issues: GitHub repository issues

---

**🎉 Once deployed, your agency will have a complete real estate CRM system with lead management, property listings, team collaboration, and automated communications!**
