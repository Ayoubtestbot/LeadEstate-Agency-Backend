const https = require('https');

console.log('🔄 Fixing lead assignments to use your actual team members...');

// Your actual team members
const actualTeamMembers = [
  'Émilie Rousseau',
  'Julien Martin', 
  'Camille Laurent',
  'Antoine Dubois',
  'Sophie Moreau',
  'Ayoub jada'
];

// Fake team members I used (to be replaced)
const fakeTeamMembers = [
  'Sarah Johnson',
  'Mike Chen',
  'David Rodriguez'
];

console.log('👥 Your actual team members:');
actualTeamMembers.forEach((member, index) => {
  console.log(`  ${index + 1}. ${member}`);
});

console.log('\n🔄 Updating lead assignments...');

// Create the update data
const updateData = {
  actualTeamMembers: actualTeamMembers,
  fakeTeamMembers: fakeTeamMembers
};

const postData = JSON.stringify(updateData);

const options = {
  hostname: 'leadestate-backend-9fih.onrender.com',
  port: 443,
  path: '/api/leads/fix-assignments',
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
        console.log(`🔄 Updated: ${result.updatedCount} leads`);
        console.log('\n🎯 All leads now assigned to your actual team members!');
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
