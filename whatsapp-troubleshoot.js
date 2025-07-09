#!/usr/bin/env node

/**
 * WhatsApp Troubleshooting Tool for LeadEstate
 * 
 * This script helps diagnose WhatsApp notification issues by:
 * 1. Checking Twilio configuration
 * 2. Testing Twilio connection
 * 3. Validating phone numbers
 * 4. Testing message sending
 * 5. Checking environment variables
 */

require('dotenv').config();
const twilio = require('twilio');

console.log('🔍 LeadEstate WhatsApp Troubleshooting Tool');
console.log('==========================================\n');

// Check environment variables
function checkEnvironmentVariables() {
  console.log('1️⃣ Checking Environment Variables...');
  console.log('-----------------------------------');
  
  const requiredVars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN', 
    'TWILIO_WHATSAPP_FROM'
  ];
  
  const missingVars = [];
  
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      // Mask sensitive values
      const maskedValue = varName.includes('TOKEN') ? 
        value.substring(0, 8) + '...' + value.substring(value.length - 4) :
        value;
      console.log(`✅ ${varName}: ${maskedValue}`);
    } else {
      console.log(`❌ ${varName}: NOT SET`);
      missingVars.push(varName);
    }
  });
  
  if (missingVars.length > 0) {
    console.log(`\n🚨 Missing environment variables: ${missingVars.join(', ')}`);
    console.log('Please set these in your Render.com environment variables.');
    return false;
  }
  
  console.log('\n✅ All required environment variables are set!\n');
  return true;
}

// Test Twilio connection
async function testTwilioConnection() {
  console.log('2️⃣ Testing Twilio Connection...');
  console.log('------------------------------');
  
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    // Test by fetching account info
    const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    
    console.log(`✅ Twilio connection successful!`);
    console.log(`📊 Account Status: ${account.status}`);
    console.log(`🏢 Account Name: ${account.friendlyName}`);
    console.log(`💰 Account Type: ${account.type}\n`);
    
    return client;
  } catch (error) {
    console.log(`❌ Twilio connection failed:`);
    console.log(`   Error: ${error.message}`);
    console.log(`   Code: ${error.code || 'Unknown'}\n`);
    
    if (error.code === 20003) {
      console.log('💡 This usually means invalid Account SID or Auth Token');
    }
    
    return null;
  }
}

// Check WhatsApp sandbox status
async function checkWhatsAppSandbox(client) {
  console.log('3️⃣ Checking WhatsApp Sandbox...');
  console.log('------------------------------');
  
  try {
    // Check if using sandbox number
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
    
    if (whatsappFrom === '+14155238886') {
      console.log('📱 Using Twilio WhatsApp Sandbox');
      console.log('⚠️  Make sure you\'ve joined the sandbox by sending "join <sandbox-word>" to +1 415 523 8886');
    } else {
      console.log(`📱 Using custom WhatsApp number: ${whatsappFrom}`);
      console.log('✅ This should be a verified WhatsApp Business number');
    }
    
    // Try to get incoming phone numbers to verify WhatsApp capability
    const phoneNumbers = await client.incomingPhoneNumbers.list({ limit: 20 });
    const whatsappNumbers = phoneNumbers.filter(number => 
      number.capabilities && number.capabilities.sms
    );
    
    console.log(`📞 Found ${whatsappNumbers.length} SMS-capable numbers in account`);
    
    if (whatsappNumbers.length === 0) {
      console.log('⚠️  No SMS-capable numbers found. Make sure WhatsApp is properly configured.');
    }
    
    console.log('');
    return true;
  } catch (error) {
    console.log(`❌ Error checking WhatsApp sandbox: ${error.message}\n`);
    return false;
  }
}

// Test sending a WhatsApp message
async function testWhatsAppMessage(client) {
  console.log('4️⃣ Testing WhatsApp Message Sending...');
  console.log('------------------------------------');
  
  // Use a test number (your own number for testing)
  const testNumber = process.env.TEST_WHATSAPP_NUMBER || '+212600000000'; // Default test number
  
  console.log(`📱 Test recipient: ${testNumber}`);
  console.log('⚠️  Make sure this number has joined the WhatsApp sandbox if using sandbox mode');
  
  const testMessage = `🧪 Test message from LeadEstate WhatsApp troubleshooter
  
Time: ${new Date().toLocaleString()}
Status: Testing WhatsApp integration

If you receive this message, WhatsApp notifications are working correctly! ✅`;

  try {
    const message = await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      to: `whatsapp:${testNumber}`,
      body: testMessage
    });
    
    console.log(`✅ Test message sent successfully!`);
    console.log(`📧 Message SID: ${message.sid}`);
    console.log(`📊 Status: ${message.status}`);
    console.log(`💰 Price: ${message.price || 'Free (sandbox)'}`);
    console.log(`🕐 Created: ${message.dateCreated}\n`);
    
    return true;
  } catch (error) {
    console.log(`❌ Failed to send test message:`);
    console.log(`   Error: ${error.message}`);
    console.log(`   Code: ${error.code || 'Unknown'}`);
    
    // Common error codes and solutions
    if (error.code === 63016) {
      console.log('💡 This number hasn\'t joined the WhatsApp sandbox yet');
      console.log('   Send "join <sandbox-word>" to +1 415 523 8886 first');
    } else if (error.code === 21211) {
      console.log('💡 Invalid phone number format');
      console.log('   Make sure the number includes country code (e.g., +212600000000)');
    } else if (error.code === 21614) {
      console.log('💡 WhatsApp number not verified or sandbox not joined');
    }
    
    console.log('');
    return false;
  }
}

// Check recent messages
async function checkRecentMessages(client) {
  console.log('5️⃣ Checking Recent WhatsApp Messages...');
  console.log('--------------------------------------');
  
  try {
    const messages = await client.messages.list({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      limit: 10
    });
    
    console.log(`📨 Found ${messages.length} recent messages from WhatsApp number`);
    
    if (messages.length > 0) {
      console.log('\nRecent messages:');
      messages.forEach((msg, index) => {
        console.log(`${index + 1}. To: ${msg.to} | Status: ${msg.status} | Date: ${msg.dateCreated}`);
        if (msg.errorCode) {
          console.log(`   ❌ Error: ${msg.errorCode} - ${msg.errorMessage}`);
        }
      });
    } else {
      console.log('📭 No recent messages found');
    }
    
    console.log('');
    return true;
  } catch (error) {
    console.log(`❌ Error checking recent messages: ${error.message}\n`);
    return false;
  }
}

// Main troubleshooting function
async function runTroubleshooting() {
  try {
    // Step 1: Check environment variables
    const envOk = checkEnvironmentVariables();
    if (!envOk) {
      console.log('🛑 Cannot continue without proper environment variables');
      process.exit(1);
    }
    
    // Step 2: Test Twilio connection
    const client = await testTwilioConnection();
    if (!client) {
      console.log('🛑 Cannot continue without valid Twilio connection');
      process.exit(1);
    }
    
    // Step 3: Check WhatsApp sandbox
    await checkWhatsAppSandbox(client);
    
    // Step 4: Check recent messages
    await checkRecentMessages(client);
    
    // Step 5: Test message sending (optional)
    console.log('🤔 Would you like to send a test WhatsApp message?');
    console.log('   Set TEST_WHATSAPP_NUMBER environment variable with your WhatsApp number');
    console.log('   Then run: TEST_WHATSAPP_NUMBER=+your_number node whatsapp-troubleshoot.js\n');
    
    if (process.env.TEST_WHATSAPP_NUMBER) {
      await testWhatsAppMessage(client);
    }
    
    // Summary
    console.log('📋 Troubleshooting Summary');
    console.log('========================');
    console.log('✅ Environment variables configured');
    console.log('✅ Twilio connection working');
    console.log('✅ WhatsApp configuration checked');
    console.log('');
    console.log('🎯 Next Steps:');
    console.log('1. Make sure recipients have joined WhatsApp sandbox (if using sandbox)');
    console.log('2. Check that phone numbers are in correct international format (+country_code)');
    console.log('3. Verify that leads have valid phone numbers in the database');
    console.log('4. Check backend logs when creating new leads for WhatsApp sending status');
    console.log('');
    console.log('📞 For production use, consider upgrading to WhatsApp Business API');
    
  } catch (error) {
    console.error('💥 Unexpected error during troubleshooting:', error);
    process.exit(1);
  }
}

// Run the troubleshooting
runTroubleshooting();
