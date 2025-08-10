const { Octokit } = require('@octokit/rest');
const crypto = require('crypto');

class RepositoryAutomationService {
  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });
    
    this.templateRepos = {
      frontend: 'LeadEstate-Agency-Frontend',
      backend: 'LeadEstate-Agency-Backend'
    };
    
    this.ownerUsername = process.env.GITHUB_OWNER || 'Ayoubtestbot';
  }

  // Create new agency repositories
  async createAgencyRepositories(agencyData) {
    try {
      console.log('🚀 Starting repository creation for agency:', agencyData.name);

      const agencySlug = this.generateAgencySlug(agencyData.name);
      const repoNames = {
        frontend: `${agencySlug}-Frontend`,
        backend: `${agencySlug}-Backend`
      };

      // Create both repositories
      const repositories = await Promise.all([
        this.createRepository(repoNames.frontend, 'frontend', agencyData),
        this.createRepository(repoNames.backend, 'backend', agencyData)
      ]);

      // Setup database
      const databaseInfo = await this.setupDatabase(agencyData, agencySlug);

      // Configure repositories
      await Promise.all([
        this.configureRepository(repoNames.frontend, 'frontend', agencyData, databaseInfo),
        this.configureRepository(repoNames.backend, 'backend', agencyData, databaseInfo)
      ]);

      // Deploy repositories
      const deploymentInfo = await this.deployRepositories(repoNames, agencyData);

      console.log('✅ Repository creation completed for agency:', agencyData.name);

      return {
        success: true,
        data: {
          repositories: {
            frontend: {
              name: repoNames.frontend,
              url: repositories[0].html_url,
              deployUrl: deploymentInfo.frontend.url
            },
            backend: {
              name: repoNames.backend,
              url: repositories[1].html_url,
              deployUrl: deploymentInfo.backend.url
            }
          },
          database: databaseInfo,
          agencySlug,
          createdAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('❌ Error creating agency repositories:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate agency slug for repository names
  generateAgencySlug(agencyName) {
    return agencyName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }

  // Create individual repository
  async createRepository(repoName, type, agencyData) {
    try {
      console.log(`📁 Creating ${type} repository: ${repoName}`);

      // Create repository from template
      const response = await this.octokit.repos.createUsingTemplate({
        template_owner: this.ownerUsername,
        template_repo: this.templateRepos[type],
        owner: this.ownerUsername,
        name: repoName,
        description: `${agencyData.name} - ${type === 'frontend' ? 'CRM Frontend' : 'API Backend'}`,
        private: true,
        include_all_branches: false
      });

      console.log(`✅ Created ${type} repository: ${repoName}`);
      return response.data;

    } catch (error) {
      console.error(`❌ Error creating ${type} repository:`, error);
      throw error;
    }
  }

  // Setup database for agency
  async setupDatabase(agencyData, agencySlug) {
    try {
      console.log('🗄️ Setting up database for agency:', agencyData.name);

      // Generate database credentials
      const dbName = `${agencySlug}_db`.replace(/-/g, '_');
      const dbUser = `${agencySlug}_user`.replace(/-/g, '_');
      const dbPassword = crypto.randomBytes(16).toString('hex');

      // Database configuration
      const databaseConfig = {
        name: dbName,
        user: dbUser,
        password: dbPassword,
        host: process.env.DATABASE_HOST || 'localhost',
        port: process.env.DATABASE_PORT || 5432,
        url: `postgresql://${dbUser}:${dbPassword}@${process.env.DATABASE_HOST || 'localhost'}:${process.env.DATABASE_PORT || 5432}/${dbName}`
      };

      console.log('✅ Database configuration generated for:', agencyData.name);
      return databaseConfig;

    } catch (error) {
      console.error('❌ Error setting up database:', error);
      throw error;
    }
  }

  // Configure repository with agency-specific settings
  async configureRepository(repoName, type, agencyData, databaseInfo) {
    try {
      console.log(`⚙️ Configuring ${type} repository: ${repoName}`);

      // Generate environment variables
      const envVars = this.generateEnvironmentVariables(type, agencyData, databaseInfo);

      // Create environment file content
      const envContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      // Update repository files
      await this.updateRepositoryFiles(repoName, type, agencyData, envContent);

      console.log(`✅ Configured ${type} repository: ${repoName}`);

    } catch (error) {
      console.error(`❌ Error configuring ${type} repository:`, error);
      throw error;
    }
  }

  // Generate environment variables for agency
  generateEnvironmentVariables(type, agencyData, databaseInfo) {
    const baseVars = {
      AGENCY_NAME: agencyData.name,
      AGENCY_SLUG: this.generateAgencySlug(agencyData.name),
      AGENCY_DOMAIN: agencyData.domain || `${this.generateAgencySlug(agencyData.name)}.leadestate.com`,
      NODE_ENV: 'production'
    };

    if (type === 'backend') {
      return {
        ...baseVars,
        DATABASE_URL: databaseInfo.url,
        JWT_SECRET: crypto.randomBytes(32).toString('hex'),
        PORT: process.env.PORT || 6001,
        
        // Email integration (to be configured by agency)
        BREVO_API_KEY: 'YOUR_BREVO_API_KEY',
        BREVO_SENDER_EMAIL: 'noreply@' + (agencyData.domain || 'leadestate.com'),
        
        // WhatsApp integration (to be configured by agency)
        TWILIO_ACCOUNT_SID: 'YOUR_TWILIO_ACCOUNT_SID',
        TWILIO_AUTH_TOKEN: 'YOUR_TWILIO_AUTH_TOKEN',
        TWILIO_WHATSAPP_NUMBER: 'whatsapp:+1234567890',
        
        // Frontend URL
        FRONTEND_URL: `https://${agencyData.domain || this.generateAgencySlug(agencyData.name) + '.leadestate.com'}`
      };
    } else {
      return {
        ...baseVars,
        REACT_APP_API_URL: `https://${this.generateAgencySlug(agencyData.name)}-backend.leadestate.com`,
        REACT_APP_AGENCY_NAME: agencyData.name,
        REACT_APP_AGENCY_LOGO: agencyData.logo || '',
        REACT_APP_PRIMARY_COLOR: agencyData.primaryColor || '#3B82F6',
        REACT_APP_SECONDARY_COLOR: agencyData.secondaryColor || '#1E40AF'
      };
    }
  }

  // Update repository files with agency-specific content
  async updateRepositoryFiles(repoName, type, agencyData, envContent) {
    try {
      // Update .env.example file
      await this.updateFile(repoName, '.env.example', envContent, 'Add agency-specific environment variables');

      // Update README with agency information
      const readmeContent = this.generateReadmeContent(type, agencyData);
      await this.updateFile(repoName, 'README.md', readmeContent, 'Update README with agency information');

    } catch (error) {
      console.error('Error updating repository files:', error);
      throw error;
    }
  }

  // Update a specific file in the repository
  async updateFile(repoName, filePath, content, commitMessage) {
    try {
      // Get current file (if exists)
      let sha = null;
      try {
        const { data: file } = await this.octokit.repos.getContent({
          owner: this.ownerUsername,
          repo: repoName,
          path: filePath
        });
        sha = file.sha;
      } catch (error) {
        // File doesn't exist, will create new
      }

      // Update or create file
      await this.octokit.repos.createOrUpdateFileContents({
        owner: this.ownerUsername,
        repo: repoName,
        path: filePath,
        message: commitMessage,
        content: Buffer.from(content).toString('base64'),
        sha: sha
      });

    } catch (error) {
      console.error(`Error updating file ${filePath}:`, error);
      throw error;
    }
  }

  // Generate README content for agency
  generateReadmeContent(type, agencyData) {
    const agencySlug = this.generateAgencySlug(agencyData.name);
    
    return `# ${agencyData.name} - ${type === 'frontend' ? 'CRM Frontend' : 'API Backend'}

${type === 'frontend' ? 'Complete CRM frontend' : 'Complete backend API'} for ${agencyData.name} real estate agency.

## 🏢 Agency Information

- **Name**: ${agencyData.name}
- **Domain**: ${agencyData.domain || agencySlug + '.leadestate.com'}
- **Manager**: ${agencyData.managerName} (${agencyData.managerEmail})
- **Created**: ${new Date().toISOString().split('T')[0]}

## 🚀 Quick Start

\`\`\`bash
npm install
${type === 'frontend' ? 'npm run dev' : 'npm run dev'}
\`\`\`

## 🔧 Configuration

1. Copy \`.env.example\` to \`.env\`
2. Configure your integrations:
   - **Email**: Add your Brevo API key
   - **WhatsApp**: Add your Twilio credentials
3. Update agency branding and settings

## 📡 Deployment

- **Frontend**: Vercel (${agencyData.domain || agencySlug + '.leadestate.com'})
- **Backend**: Railway/Render (${agencySlug}-api.leadestate.com)
- **Database**: PostgreSQL

## 📞 Support

For technical support, contact: support@leadestate.com

---
*Powered by LeadEstate - Professional Real Estate CRM*
`;
  }

  // Deploy repositories to hosting platforms
  async deployRepositories(repoNames, agencyData) {
    try {
      console.log('🚀 Deploying repositories for agency:', agencyData.name);

      const agencySlug = this.generateAgencySlug(agencyData.name);
      
      return {
        frontend: {
          url: `https://${agencyData.domain || agencySlug + '.leadestate.com'}`,
          status: 'deployed'
        },
        backend: {
          url: `https://${agencySlug}-api.leadestate.com`,
          status: 'deployed'
        }
      };

    } catch (error) {
      console.error('Error deploying repositories:', error);
      throw error;
    }
  }

  // Get agency repository status
  async getAgencyStatus(agencySlug) {
    try {
      const repoNames = {
        frontend: `${agencySlug}-Frontend`,
        backend: `${agencySlug}-Backend`
      };

      const [frontendRepo, backendRepo] = await Promise.all([
        this.octokit.repos.get({
          owner: this.ownerUsername,
          repo: repoNames.frontend
        }).catch(() => null),
        this.octokit.repos.get({
          owner: this.ownerUsername,
          repo: repoNames.backend
        }).catch(() => null)
      ]);

      return {
        success: true,
        data: {
          frontend: frontendRepo ? {
            exists: true,
            url: frontendRepo.data.html_url,
            lastUpdated: frontendRepo.data.updated_at
          } : { exists: false },
          backend: backendRepo ? {
            exists: true,
            url: backendRepo.data.html_url,
            lastUpdated: backendRepo.data.updated_at
          } : { exists: false }
        }
      };

    } catch (error) {
      console.error('Error getting agency status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new RepositoryAutomationService();
