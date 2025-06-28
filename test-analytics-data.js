// Script to add test data for analytics dashboard
const API_URL = 'https://leadestate-backend-9fih.onrender.com/api';

const testLeads = [
  {
    name: 'John Smith',
    email: 'john.smith@email.com',
    phone: '+1234567890',
    source: 'Facebook',
    budget: '500000',
    notes: 'Looking for a family home',
    status: 'qualified',
    assignedTo: 'Agent Smith'
  },
  {
    name: 'Sarah Johnson',
    email: 'sarah.j@email.com',
    phone: '+1234567891',
    source: 'Google',
    budget: '750000',
    notes: 'Interested in luxury properties',
    status: 'contacted',
    assignedTo: 'Agent Johnson'
  },
  {
    name: 'Mike Wilson',
    email: 'mike.w@email.com',
    phone: '+1234567892',
    source: 'Website',
    budget: '300000',
    notes: 'First-time buyer',
    status: 'new',
    assignedTo: 'Agent Wilson'
  },
  {
    name: 'Lisa Brown',
    email: 'lisa.b@email.com',
    phone: '+1234567893',
    source: 'Referral',
    budget: '600000',
    notes: 'Looking for investment property',
    status: 'closed-won',
    assignedTo: 'Agent Smith'
  },
  {
    name: 'David Lee',
    email: 'david.l@email.com',
    phone: '+1234567894',
    source: 'Facebook',
    budget: '450000',
    notes: 'Needs quick sale',
    status: 'qualified',
    assignedTo: 'Agent Johnson'
  },
  {
    name: 'Emma Davis',
    email: 'emma.d@email.com',
    phone: '+1234567895',
    source: 'Google',
    budget: '800000',
    notes: 'High-end client',
    status: 'closed-won',
    assignedTo: 'Agent Wilson'
  },
  {
    name: 'Tom Anderson',
    email: 'tom.a@email.com',
    phone: '+1234567896',
    source: 'Website',
    budget: '350000',
    notes: 'Young professional',
    status: 'contacted',
    assignedTo: 'Agent Smith'
  },
  {
    name: 'Rachel Green',
    email: 'rachel.g@email.com',
    phone: '+1234567897',
    source: 'Social_media',
    budget: '550000',
    notes: 'Family with kids',
    status: 'new',
    assignedTo: 'Agent Johnson'
  },
  {
    name: 'Chris Taylor',
    email: 'chris.t@email.com',
    phone: '+1234567898',
    source: 'Phone_call',
    budget: '700000',
    notes: 'Relocating for work',
    status: 'qualified',
    assignedTo: 'Agent Wilson'
  },
  {
    name: 'Amy White',
    email: 'amy.w@email.com',
    phone: '+1234567899',
    source: 'Referral',
    budget: '400000',
    notes: 'Downsizing',
    status: 'contacted',
    assignedTo: 'Agent Smith'
  }
];

async function addTestLeads() {
  console.log('🚀 Adding test leads for analytics...');
  
  for (let i = 0; i < testLeads.length; i++) {
    const lead = testLeads[i];
    try {
      const response = await fetch(`${API_URL}/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(lead)
      });
      
      const result = await response.json();
      if (result.success) {
        console.log(`✅ Added lead ${i + 1}: ${lead.name} (${lead.source})`);
      } else {
        console.log(`❌ Failed to add lead ${i + 1}: ${result.message}`);
      }
    } catch (error) {
      console.log(`❌ Error adding lead ${i + 1}: ${error.message}`);
    }
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('🎉 Finished adding test leads!');
  console.log('📊 Now test the analytics endpoints:');
  console.log(`- ${API_URL}/analytics/leads-by-source`);
  console.log(`- ${API_URL}/analytics/conversion-rate-by-source`);
  console.log(`- ${API_URL}/analytics/leads-not-contacted`);
}

// Run the script
addTestLeads().catch(console.error);
