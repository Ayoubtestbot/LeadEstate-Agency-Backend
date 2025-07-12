const https = require('https');

console.log('📋 Fetching current team members...');

const options = {
  hostname: 'leadestate-backend-9fih.onrender.com',
  port: 443,
  path: '/api/team',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
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
      if (result.success && result.data) {
        console.log('✅ Current Team Members:');
        console.log(`📊 Total: ${result.data.length} members`);
        console.log('');
        
        result.data.forEach((member, index) => {
          console.log(`${index + 1}. ${member.name} (${member.role})`);
        });
        
        console.log('');
        console.log('📝 Team member names for script:');
        const memberNames = result.data.map(member => `'${member.name}'`).join(', ');
        console.log(`[${memberNames}]`);
      } else {
        console.log('❌ No team members found or error:', result.message);
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

req.end();
