# LeadEstate Agency Backend

Complete backend API for real estate agency CRM with full feature set.

## 🎯 Features

- **Authentication API**: JWT-based auth with roles and permissions
- **Leads API**: Full CRUD with status management and kanban support
- **Properties API**: Property listings with image upload support
- **Team API**: User and role management
- **Analytics API**: Dashboard statistics and comprehensive reporting
- **Email Integration**: Brevo/SendinBlue integration for automated emails
- **WhatsApp Integration**: Twilio integration for WhatsApp messaging
- **File Upload**: Property images and document management
- **Database**: PostgreSQL with Sequelize ORM
- **Security**: Helmet, rate limiting, input validation
- **Logging**: Winston for comprehensive logging

## 🚀 Development

```bash
npm install
npm run dev
```

Runs on http://localhost:6001

## 🏗️ Structure

```
src/
├── controllers/      # Route controllers
├── models/          # Database models (Sequelize)
├── routes/          # API routes
├── middleware/      # Custom middleware
├── services/        # Business logic services
├── database/        # DB config and migrations
└── utils/           # Utility functions
```

## 🔧 Environment Variables

Copy `.env.example` to `.env` and configure:

```env
DATABASE_URL=postgresql://user:pass@host:port/db
JWT_SECRET=your-secret-key
BREVO_API_KEY=your-brevo-key
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/verify` - Verify JWT token

### Leads Management
- `GET /api/leads` - Get all leads
- `POST /api/leads` - Create new lead
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead
- `PUT /api/leads/:id/status` - Update lead status

### Properties Management
- `GET /api/properties` - Get all properties
- `POST /api/properties` - Create new property
- `PUT /api/properties/:id` - Update property
- `DELETE /api/properties/:id` - Delete property
- `POST /api/properties/:id/images` - Upload property images

### Team Management
- `GET /api/team` - Get team members
- `POST /api/team` - Add team member
- `PUT /api/team/:id` - Update team member
- `DELETE /api/team/:id` - Remove team member

### Analytics
- `GET /api/analytics/dashboard` - Dashboard statistics
- `GET /api/analytics/leads` - Lead analytics
- `GET /api/analytics/properties` - Property analytics

## 📦 Deployment

- **Platform**: Railway/Render
- **Database**: PostgreSQL
- **Environment**: Multi-tenant (per agency)

## 📋 Next Steps

1. Copy your complete backend code to src/
2. Configure environment variables
3. Setup database connection
4. Test all API endpoints
5. Deploy to Railway/Render
