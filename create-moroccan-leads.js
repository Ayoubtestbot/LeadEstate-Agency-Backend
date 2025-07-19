// Script to create 200 real Moroccan leads with complete information
const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Helper function to generate UUIDs
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Real Moroccan names
const moroccanNames = {
  male: [
    'Ahmed', 'Mohammed', 'Hassan', 'Omar', 'Youssef', 'Khalid', 'Abdelkader', 'Said', 'Rachid', 'Karim',
    'Mustapha', 'Abderrahim', 'Noureddine', 'Driss', 'Jamal', 'Fouad', 'Brahim', 'Tarik', 'Aziz', 'Hamid',
    'Abdellatif', 'Mostafa', 'Lahcen', 'Abdessamad', 'Redouane', 'Othmane', 'Amine', 'Mehdi', 'Ismail', 'Zakaria'
  ],
  female: [
    'Fatima', 'Aicha', 'Khadija', 'Laila', 'Nadia', 'Samira', 'Zineb', 'Houda', 'Malika', 'Rajae',
    'Btissam', 'Hayat', 'Siham', 'Widad', 'Karima', 'Nawal', 'Souad', 'Ilham', 'Rim', 'Ghita',
    'Nezha', 'Latifa', 'Amina', 'Leila', 'Safaa', 'Meryem', 'Salma', 'Imane', 'Sanaa', 'Fadwa'
  ]
};

const moroccanLastNames = [
  'Alami', 'Benali', 'Mansouri', 'Idrissi', 'Tazi', 'Chraibi', 'Benjelloun', 'Fassi', 'Berrada', 'Ouali',
  'Ziani', 'Amrani', 'Kadiri', 'Benkirane', 'Lamrani', 'Senhaji', 'Alaoui', 'Bennani', 'Squalli', 'Kettani',
  'Filali', 'Hajji', 'Bensouda', 'Cherkaoui', 'Naciri', 'Tounsi', 'Lahlou', 'Benkirane', 'Berrada', 'Fassi'
];

const moroccanCities = [
  'Casablanca', 'Rabat', 'Marrakech', 'Fes', 'Tangier', 'Agadir', 'Meknes', 'Oujda', 'Kenitra', 'Tetouan',
  'Safi', 'Mohammedia', 'Khouribga', 'Beni Mellal', 'El Jadida', 'Taza', 'Nador', 'Settat', 'Larache', 'Ksar El Kebir'
];

const leadSources = [
  'Facebook', 'Google', 'Website', 'Instagram', 'Referral', 'Walk-in', 'LinkedIn', 'WhatsApp', 'Phone Call', 'Email Campaign'
];

const leadStatuses = ['new', 'contacted', 'qualified', 'interested', 'negotiating', 'closed', 'lost'];

// Your 6 real team members
const teamMembers = [
  'Sophie Moreau',
  'Antoine Dubois', 
  'Emilie Rousseau',
  'Julien Martin',
  'Camille Laurent',
  'Ayoub Jada'
];

// Generate random Moroccan phone number
const generateMoroccanPhone = () => {
  const prefixes = ['600', '601', '602', '603', '604', '605', '606', '607', '608', '609', '610', '611', '612', '613', '614', '615'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const number = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `+212${prefix}${number}`;
};

// Generate random budget
const generateBudget = () => {
  const budgets = [
    250000, 300000, 350000, 400000, 450000, 500000, 550000, 600000, 650000, 700000,
    750000, 800000, 850000, 900000, 950000, 1000000, 1200000, 1500000, 2000000, 2500000
  ];
  return budgets[Math.floor(Math.random() * budgets.length)];
};

// Generate email from name
const generateEmail = (firstName, lastName) => {
  const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'email.ma', 'menara.ma'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const emailName = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
  return `${emailName}@${domain}`;
};

// Generate notes based on city and budget
const generateNotes = (city, budget, source) => {
  const budgetRange = budget < 500000 ? 'budget modéré' : budget < 1000000 ? 'budget confortable' : 'budget élevé';
  const cityNote = `Recherche à ${city}`;
  const sourceNote = source === 'Referral' ? 'Recommandé par un client' : `Contact via ${source}`;
  
  const notes = [
    `${cityNote}, ${budgetRange}. ${sourceNote}.`,
    `Intéressé par l'immobilier à ${city}. ${budgetRange}. ${sourceNote}.`,
    `Client potentiel à ${city} avec ${budgetRange}. ${sourceNote}.`,
    `Recherche active à ${city}, ${budgetRange}. ${sourceNote}.`
  ];
  
  return notes[Math.floor(Math.random() * notes.length)];
};

// Create 200 Moroccan leads
const createMoroccanLeads = async () => {
  try {
    console.log('🧹 Deleting all existing leads...');
    
    // Delete all existing leads
    const deleteResult = await pool.query('DELETE FROM leads');
    console.log(`🗑️ Deleted ${deleteResult.rowCount} existing leads`);
    
    console.log('🇲🇦 Creating 200 real Moroccan leads...');
    
    const leads = [];
    
    for (let i = 0; i < 200; i++) {
      // Randomly choose gender and name
      const isMale = Math.random() > 0.5;
      const firstName = isMale ? 
        moroccanNames.male[Math.floor(Math.random() * moroccanNames.male.length)] :
        moroccanNames.female[Math.floor(Math.random() * moroccanNames.female.length)];
      
      const lastName = moroccanLastNames[Math.floor(Math.random() * moroccanLastNames.length)];
      const city = moroccanCities[Math.floor(Math.random() * moroccanCities.length)];
      const source = leadSources[Math.floor(Math.random() * leadSources.length)];
      const status = leadStatuses[Math.floor(Math.random() * leadStatuses.length)];
      const assignedTo = teamMembers[Math.floor(Math.random() * teamMembers.length)];
      const phone = generateMoroccanPhone();
      const email = generateEmail(firstName, lastName);
      const budget = generateBudget();
      const notes = generateNotes(city, budget, source);
      
      // Create address
      const address = `${Math.floor(Math.random() * 999) + 1} Rue ${Math.random() > 0.5 ? 'Mohammed V' : 'Hassan II'}, ${city}`;
      
      // Random creation date within last 6 months
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 180));
      
      const lead = {
        id: generateId(),
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone: phone,
        whatsapp: phone,
        city: city,
        address: address,
        source: source,
        budget: budget,
        notes: notes,
        status: status,
        assigned_to: assignedTo,
        language: 'fr',
        agency_id: 'default-agency',
        interested_properties: '[]',
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString()
      };
      
      leads.push(lead);
    }
    
    // Insert all leads
    let createdCount = 0;
    const errors = [];
    
    for (const lead of leads) {
      try {
        await pool.query(`
          INSERT INTO leads (id, first_name, last_name, email, phone, whatsapp, city, address, source, budget, notes, status, assigned_to, language, agency_id, interested_properties, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        `, [
          lead.id, lead.first_name, lead.last_name, lead.email, lead.phone, lead.whatsapp,
          lead.city, lead.address, lead.source, lead.budget, lead.notes, lead.status,
          lead.assigned_to, lead.language, lead.agency_id, lead.interested_properties,
          lead.created_at, lead.updated_at
        ]);
        
        createdCount++;
        if (createdCount % 20 === 0) {
          console.log(`✅ Created ${createdCount}/200 leads...`);
        }
      } catch (error) {
        console.error(`Error creating lead ${lead.first_name} ${lead.last_name}:`, error.message);
        errors.push(`${lead.first_name} ${lead.last_name}: ${error.message}`);
      }
    }
    
    console.log(`🎉 Successfully created ${createdCount} Moroccan leads!`);
    
    // Show statistics
    const stats = await pool.query(`
      SELECT 
        assigned_to,
        COUNT(*) as lead_count,
        COUNT(CASE WHEN status = 'qualified' THEN 1 END) as qualified_count,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_count,
        AVG(budget) as avg_budget
      FROM leads 
      GROUP BY assigned_to 
      ORDER BY lead_count DESC
    `);
    
    console.log('\n📊 Lead Distribution by Agent:');
    stats.rows.forEach(stat => {
      console.log(`👤 ${stat.assigned_to}: ${stat.lead_count} leads (${stat.qualified_count} qualified, ${stat.closed_count} closed) - Avg Budget: ${Math.round(stat.avg_budget).toLocaleString()} MAD`);
    });
    
    const cityStats = await pool.query(`
      SELECT city, COUNT(*) as count 
      FROM leads 
      GROUP BY city 
      ORDER BY count DESC 
      LIMIT 10
    `);
    
    console.log('\n🏙️ Top 10 Cities:');
    cityStats.rows.forEach(city => {
      console.log(`📍 ${city.city}: ${city.count} leads`);
    });
    
    if (errors.length > 0) {
      console.log(`\n⚠️ ${errors.length} errors occurred:`, errors.slice(0, 5));
    }
    
  } catch (error) {
    console.error('❌ Error creating Moroccan leads:', error);
  } finally {
    await pool.end();
  }
};

// Run the script
createMoroccanLeads();
