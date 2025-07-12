const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://leadestate_user:secure_password_2024@dpg-ct6r7f88fa8c73a6ckag-a.oregon-postgres.render.com/leadestate_db',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Generate unique ID
const generateId = () => uuidv4();

// Sample leads data with proper names and assignments
const sampleLeads = [
  { name: 'Ahmed Hassan', phone: '+212600123456', city: 'Casablanca', email: 'ahmed.hassan@email.com', source: 'website', budget: '500000', assignedTo: 'Sarah Johnson' },
  { name: 'Fatima Zahra', phone: '+212601234567', city: 'Rabat', email: 'fatima.zahra@email.com', source: 'facebook', budget: '750000', assignedTo: 'Mike Chen' },
  { name: 'Youssef Alami', phone: '+212602345678', city: 'Marrakech', email: 'youssef.alami@email.com', source: 'google', budget: '300000', assignedTo: 'Sarah Johnson' },
  { name: 'Aicha Benali', phone: '+212603456789', city: 'Fes', email: 'aicha.benali@email.com', source: 'referral', budget: '600000', assignedTo: 'David Rodriguez' },
  { name: 'Omar Idrissi', phone: '+212604567890', city: 'Tangier', email: 'omar.idrissi@email.com', source: 'walk-in', budget: '450000', assignedTo: 'Mike Chen' },
  { name: 'Khadija Mansouri', phone: '+212605678901', city: 'Agadir', email: 'khadija.mansouri@email.com', source: 'website', budget: '800000', assignedTo: 'Sarah Johnson' },
  { name: 'Rachid Tazi', phone: '+212606789012', city: 'Meknes', email: 'rachid.tazi@email.com', source: 'facebook', budget: '350000', assignedTo: 'David Rodriguez' },
  { name: 'Laila Chraibi', phone: '+212607890123', city: 'Oujda', email: 'laila.chraibi@email.com', source: 'google', budget: '700000', assignedTo: 'Mike Chen' },
  { name: 'Karim Benjelloun', phone: '+212608901234', city: 'Kenitra', email: 'karim.benjelloun@email.com', source: 'referral', budget: '400000', assignedTo: 'Sarah Johnson' },
  { name: 'Nadia Fassi', phone: '+212609012345', city: 'Tetouan', email: 'nadia.fassi@email.com', source: 'walk-in', budget: '550000', assignedTo: 'David Rodriguez' },
  { name: 'Hassan Berrada', phone: '+212610123456', city: 'Casablanca', email: 'hassan.berrada@email.com', source: 'website', budget: '900000', assignedTo: 'Mike Chen' },
  { name: 'Samira Ouali', phone: '+212611234567', city: 'Rabat', email: 'samira.ouali@email.com', source: 'facebook', budget: '320000', assignedTo: 'Sarah Johnson' },
  { name: 'Abdelkader Ziani', phone: '+212612345678', city: 'Marrakech', email: 'abdelkader.ziani@email.com', source: 'google', budget: '650000', assignedTo: 'David Rodriguez' },
  { name: 'Zineb Amrani', phone: '+212613456789', city: 'Fes', email: 'zineb.amrani@email.com', source: 'referral', budget: '480000', assignedTo: 'Mike Chen' },
  { name: 'Mustapha Kadiri', phone: '+212614567890', city: 'Tangier', email: 'mustapha.kadiri@email.com', source: 'walk-in', budget: '720000', assignedTo: 'Sarah Johnson' },
  { name: 'Houda Benkirane', phone: '+212615678901', city: 'Agadir', email: 'houda.benkirane@email.com', source: 'website', budget: '380000', assignedTo: 'David Rodriguez' },
  { name: 'Said Lamrani', phone: '+212616789012', city: 'Meknes', email: 'said.lamrani@email.com', source: 'facebook', budget: '850000', assignedTo: 'Mike Chen' },
  { name: 'Malika Senhaji', phone: '+212617890123', city: 'Oujda', email: 'malika.senhaji@email.com', source: 'google', budget: '420000', assignedTo: 'Sarah Johnson' },
  { name: 'Driss Alaoui', phone: '+212618901234', city: 'Kenitra', email: 'driss.alaoui@email.com', source: 'referral', budget: '680000', assignedTo: 'David Rodriguez' },
  { name: 'Rajae Bennani', phone: '+212619012345', city: 'Tetouan', email: 'rajae.bennani@email.com', source: 'walk-in', budget: '520000', assignedTo: 'Mike Chen' },
  { name: 'Khalid Squalli', phone: '+212620123456', city: 'Casablanca', email: 'khalid.squalli@email.com', source: 'website', budget: '760000', assignedTo: 'Sarah Johnson' },
  { name: 'Amina Kettani', phone: '+212621234567', city: 'Rabat', email: 'amina.kettani@email.com', source: 'facebook', budget: '340000', assignedTo: 'David Rodriguez' },
  { name: 'Brahim Filali', phone: '+212622345678', city: 'Marrakech', email: 'brahim.filali@email.com', source: 'google', budget: '590000', assignedTo: 'Mike Chen' },
  { name: 'Leila Hajji', phone: '+212623456789', city: 'Fes', email: 'leila.hajji@email.com', source: 'referral', budget: '440000', assignedTo: 'Sarah Johnson' },
  { name: 'Tarik Bensouda', phone: '+212624567890', city: 'Tangier', email: 'tarik.bensouda@email.com', source: 'walk-in', budget: '810000', assignedTo: 'David Rodriguez' },
  { name: 'Souad Cherkaoui', phone: '+212625678901', city: 'Agadir', email: 'souad.cherkaoui@email.com', source: 'website', budget: '360000', assignedTo: 'Mike Chen' },
  { name: 'Abderrahim Naciri', phone: '+212626789012', city: 'Meknes', email: 'abderrahim.naciri@email.com', source: 'facebook', budget: '700000', assignedTo: 'Sarah Johnson' },
  { name: 'Karima Benali', phone: '+212627890123', city: 'Oujda', email: 'karima.benali@email.com', source: 'google', budget: '460000', assignedTo: 'David Rodriguez' },
  { name: 'Youssef Berrada', phone: '+212628901234', city: 'Kenitra', email: 'youssef.berrada@email.com', source: 'referral', budget: '630000', assignedTo: 'Mike Chen' },
  { name: 'Nawal Tounsi', phone: '+212629012345', city: 'Tetouan', email: 'nawal.tounsi@email.com', source: 'walk-in', budget: '580000', assignedTo: 'Sarah Johnson' },
  { name: 'Hamid Lahlou', phone: '+212630123456', city: 'Casablanca', email: 'hamid.lahlou@email.com', source: 'website', budget: '920000', assignedTo: 'David Rodriguez' },
  { name: 'Siham Benkirane', phone: '+212631234567', city: 'Rabat', email: 'siham.benkirane@email.com', source: 'facebook', budget: '310000', assignedTo: 'Mike Chen' },
  { name: 'Mostafa Alami', phone: '+212632345678', city: 'Marrakech', email: 'mostafa.alami@email.com', source: 'google', budget: '670000', assignedTo: 'Sarah Johnson' },
  { name: 'Widad Fassi', phone: '+212633456789', city: 'Fes', email: 'widad.fassi@email.com', source: 'referral', budget: '490000', assignedTo: 'David Rodriguez' },
  { name: 'Aziz Benjelloun', phone: '+212634567890', city: 'Tangier', email: 'aziz.benjelloun@email.com', source: 'walk-in', budget: '750000', assignedTo: 'Mike Chen' },
  { name: 'Latifa Chraibi', phone: '+212635678901', city: 'Agadir', email: 'latifa.chraibi@email.com', source: 'website', budget: '390000', assignedTo: 'Sarah Johnson' },
  { name: 'Redouane Idrissi', phone: '+212636789012', city: 'Meknes', email: 'redouane.idrissi@email.com', source: 'facebook', budget: '820000', assignedTo: 'David Rodriguez' },
  { name: 'Hayat Mansouri', phone: '+212637890123', city: 'Oujda', email: 'hayat.mansouri@email.com', source: 'google', budget: '430000', assignedTo: 'Mike Chen' },
  { name: 'Jamal Tazi', phone: '+212638901234', city: 'Kenitra', email: 'jamal.tazi@email.com', source: 'referral', budget: '690000', assignedTo: 'Sarah Johnson' },
  { name: 'Ghita Ouali', phone: '+212639012345', city: 'Tetouan', email: 'ghita.ouali@email.com', source: 'walk-in', budget: '540000', assignedTo: 'David Rodriguez' },
  { name: 'Noureddine Ziani', phone: '+212640123456', city: 'Casablanca', email: 'noureddine.ziani@email.com', source: 'website', budget: '780000', assignedTo: 'Mike Chen' },
  { name: 'Btissam Amrani', phone: '+212641234567', city: 'Rabat', email: 'btissam.amrani@email.com', source: 'facebook', budget: '350000', assignedTo: 'Sarah Johnson' },
  { name: 'Lahcen Kadiri', phone: '+212642345678', city: 'Marrakech', email: 'lahcen.kadiri@email.com', source: 'google', budget: '610000', assignedTo: 'David Rodriguez' },
  { name: 'Nezha Benkirane', phone: '+212643456789', city: 'Fes', email: 'nezha.benkirane@email.com', source: 'referral', budget: '470000', assignedTo: 'Mike Chen' },
  { name: 'Abdellatif Lamrani', phone: '+212644567890', city: 'Tangier', email: 'abdellatif.lamrani@email.com', source: 'walk-in', budget: '840000', assignedTo: 'Sarah Johnson' },
  { name: 'Samia Senhaji', phone: '+212645678901', city: 'Agadir', email: 'samia.senhaji@email.com', source: 'website', budget: '410000', assignedTo: 'David Rodriguez' },
  { name: 'Fouad Alaoui', phone: '+212646789012', city: 'Meknes', email: 'fouad.alaoui@email.com', source: 'facebook', budget: '730000', assignedTo: 'Mike Chen' },
  { name: 'Ilham Bennani', phone: '+212647890123', city: 'Oujda', email: 'ilham.bennani@email.com', source: 'google', budget: '500000', assignedTo: 'Sarah Johnson' },
  { name: 'Abdessamad Squalli', phone: '+212648901234', city: 'Kenitra', email: 'abdessamad.squalli@email.com', source: 'referral', budget: '660000', assignedTo: 'David Rodriguez' },
  { name: 'Rim Kettani', phone: '+212649012345', city: 'Tetouan', email: 'rim.kettani@email.com', source: 'walk-in', budget: '570000', assignedTo: 'Mike Chen' }
];

async function replaceLeads() {
  try {
    console.log('🔄 Starting lead replacement process...');
    
    // Step 1: Delete all existing leads
    console.log('🗑️ Deleting all existing leads...');
    const deleteResult = await pool.query('DELETE FROM leads');
    console.log(`✅ Deleted ${deleteResult.rowCount} existing leads`);
    
    // Step 2: Create 50 new sample leads
    console.log('📝 Creating 50 new sample leads...');
    let createdCount = 0;
    
    for (const leadData of sampleLeads) {
      try {
        // Split name into first_name and last_name
        const nameParts = leadData.name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const newLead = {
          id: generateId(),
          first_name: firstName,
          last_name: lastName,
          email: leadData.email,
          phone: leadData.phone,
          whatsapp: leadData.phone,
          source: leadData.source,
          budget: leadData.budget ? parseFloat(leadData.budget) : null,
          notes: `Sample lead from ${leadData.city}`,
          status: 'new',
          assigned_to: leadData.assignedTo,
          language: 'fr',
          agency_id: 'default-agency',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await pool.query(`
          INSERT INTO leads (id, first_name, last_name, email, phone, whatsapp, source, budget, notes, status, assigned_to, language, agency_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          newLead.id, newLead.first_name, newLead.last_name, newLead.email, newLead.phone,
          newLead.whatsapp, newLead.source, newLead.budget, newLead.notes,
          newLead.status, newLead.assigned_to, newLead.language, newLead.agency_id, newLead.created_at, newLead.updated_at
        ]);

        createdCount++;
        console.log(`✅ Created lead: ${leadData.name} → ${leadData.assignedTo}`);
      } catch (error) {
        console.error(`❌ Error creating lead ${leadData.name}:`, error.message);
      }
    }
    
    console.log(`\n🎯 REPLACEMENT COMPLETE!`);
    console.log(`📊 Summary:`);
    console.log(`   - Deleted: ${deleteResult.rowCount} old leads`);
    console.log(`   - Created: ${createdCount} new leads`);
    console.log(`   - All new leads have proper names and assignments`);
    
  } catch (error) {
    console.error('❌ Error during lead replacement:', error);
  } finally {
    await pool.end();
    console.log('🔌 Database connection closed');
  }
}

// Run the script
replaceLeads();
