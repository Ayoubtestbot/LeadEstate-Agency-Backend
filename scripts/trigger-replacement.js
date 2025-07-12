const https = require('https');

console.log('🔄 Triggering lead replacement via API...');

const postData = JSON.stringify({});

const options = {
  hostname: 'leadestate-backend-9fih.onrender.com',
  port: 443,
  path: '/api/leads/replace-all',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, (res) => {
  console.log(`📡 Response status: ${res.statusCode}`);
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      if (result.success) {
        console.log('✅ SUCCESS!');
        console.log(`📊 ${result.message}`);
        console.log(`🗑️ Deleted: ${result.deletedCount} old leads`);
        console.log(`📝 Created: ${result.createdCount} new leads`);
        console.log('\n🎯 All leads now have proper names and assignments!');
      } else {
        console.log('❌ FAILED:', result.message);
      }
    } catch (error) {
      console.log('❌ Error parsing response:', error.message);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error.message);
});

req.write(postData);
req.end();
