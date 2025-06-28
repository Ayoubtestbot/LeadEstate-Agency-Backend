# WhatsApp Automatic Messaging Setup

## Overview
Your LeadEstate CRM now supports automatic WhatsApp welcome messages sent via Twilio when new leads are created and assigned to agents.

## Required Environment Variables

Add these environment variables to your Render.com backend deployment:

### Twilio Configuration
```
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_FROM=+14155238886
```

## How to Get Twilio Credentials

### 1. Create Twilio Account
- Go to [twilio.com](https://www.twilio.com)
- Sign up for a free account
- Verify your phone number

### 2. Get Account SID and Auth Token
- Go to Twilio Console Dashboard
- Copy your **Account SID** and **Auth Token**
- Add them to your environment variables

### 3. Set Up WhatsApp Sandbox (Free Testing)
- In Twilio Console, go to **Messaging** → **Try it out** → **Send a WhatsApp message**
- Follow instructions to join the WhatsApp Sandbox
- Use the provided sandbox number as `TWILIO_WHATSAPP_FROM`
- Default sandbox number: `+14155238886`

### 4. Production WhatsApp (Optional)
For production use, you'll need:
- WhatsApp Business Account approval
- Custom WhatsApp Business number
- This requires business verification with Twilio

## How It Works

### Automatic Flow:
1. **New lead created** with phone number
2. **Lead assigned** to agent
3. **System automatically sends** WhatsApp welcome message
4. **Lead receives** personalized message with agent contact info

### Message Content:
```
🏠 Bienvenue chez LeadEstate !

Bonjour [Lead Name] !

Merci de votre intérêt pour nos services immobiliers. 
Je suis [Agent Name], votre conseiller dédié.

👤 Votre conseiller : [Agent Name]
📱 Mon numéro : [Agent Phone]
📧 Mon email : [Agent Email]

Je suis là pour vous accompagner dans votre projet immobilier. 
N'hésitez pas à me contacter pour toute question !

À très bientôt,
[Agent Name]
LeadEstate - Votre partenaire immobilier 🏡
```

## Fallback Behavior

If Twilio is not configured:
- System will prepare WhatsApp URL
- Manual sending option available
- No automatic sending

## Testing

1. Add environment variables to Render
2. Redeploy backend
3. Create new lead with phone number
4. Assign to agent
5. Check if WhatsApp message is sent automatically

## Phone Number Format

The system automatically formats French phone numbers:
- Input: `06 12 34 56 78` → Output: `+33612345678`
- Input: `+33 6 12 34 56 78` → Output: `+33612345678`

## Troubleshooting

### Common Issues:
1. **No message sent**: Check Twilio credentials
2. **Invalid phone number**: Ensure proper French format
3. **Sandbox limitations**: Join WhatsApp sandbox first
4. **Agent not found**: Ensure agent exists in team_members table

### Logs:
Check Render logs for WhatsApp sending status:
- `✅ WhatsApp message sent successfully via Twilio!`
- `❌ Twilio WhatsApp send failed:`
- `📱 Twilio not configured - WhatsApp URL prepared`
