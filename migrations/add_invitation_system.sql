-- Migration: Add invitation system to users table
-- This adds the necessary columns for the enhanced invitation flow

-- Add invitation-related columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS invitation_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS account_activated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS agency_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS invited_by VARCHAR(255);

-- Update status column to include invitation states
-- First, check if status column exists and what type it is
DO $$ 
BEGIN
    -- Add status column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'status') THEN
        ALTER TABLE users ADD COLUMN status VARCHAR(50) DEFAULT 'active';
    END IF;
END $$;

-- Create index for invitation tokens for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_invitation_token ON users(invitation_token);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_invitation_expires ON users(invitation_expires_at);

-- Create agencies table for multi-tenant support
CREATE TABLE IF NOT EXISTS agencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    owner_id UUID,
    manager_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    settings JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'active',
    
    -- Contact information
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    
    -- Business information
    license_number VARCHAR(100),
    specialization TEXT[],
    description TEXT,
    
    CONSTRAINT fk_agencies_owner FOREIGN KEY (owner_id) REFERENCES users(id),
    CONSTRAINT fk_agencies_manager FOREIGN KEY (manager_id) REFERENCES users(id)
);

-- Add agency_id to users table for proper relationship
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS agency_id UUID,
ADD CONSTRAINT IF NOT EXISTS fk_users_agency 
    FOREIGN KEY (agency_id) REFERENCES agencies(id);

-- Create invitation_logs table for tracking email history
CREATE TABLE IF NOT EXISTS invitation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    email_type VARCHAR(100) NOT NULL, -- 'manager_invitation', 'agent_invitation', 'reminder', etc.
    email_address VARCHAR(255) NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    email_status VARCHAR(50) DEFAULT 'sent', -- 'sent', 'delivered', 'opened', 'clicked', 'failed'
    email_provider_id VARCHAR(255), -- Brevo message ID
    error_message TEXT,
    
    CONSTRAINT fk_invitation_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for invitation logs
CREATE INDEX IF NOT EXISTS idx_invitation_logs_user_id ON invitation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_invitation_logs_email_type ON invitation_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_invitation_logs_sent_at ON invitation_logs(sent_at);

-- Update existing users to have proper status
UPDATE users 
SET status = 'active' 
WHERE status IS NULL OR status = '';

-- Create a function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for agencies table
DROP TRIGGER IF EXISTS update_agencies_updated_at ON agencies;
CREATE TRIGGER update_agencies_updated_at
    BEFORE UPDATE ON agencies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for testing (optional)
-- This can be removed in production
INSERT INTO agencies (name, email, description) 
VALUES ('Sample Real Estate Agency', 'info@sampleagency.com', 'A sample agency for testing the invitation system')
ON CONFLICT DO NOTHING;

-- Create audit_logs table for comprehensive system auditing
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    agency_id UUID,
    severity VARCHAR(20) DEFAULT 'info', -- info, warning, error, critical
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_audit_logs_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL
);

-- Create indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_agency_id ON audit_logs(agency_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);

-- Add agency_id to leads table for proper multi-tenant support
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS agency_id UUID,
ADD CONSTRAINT IF NOT EXISTS fk_leads_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id);

-- Add agency_id to properties table for proper multi-tenant support
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS agency_id UUID,
ADD CONSTRAINT IF NOT EXISTS fk_properties_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id);

-- Add contacted_at timestamp to leads for response time tracking
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMP;

-- Create user_sessions table for session management
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,

    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for user sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Create system_settings table for global configuration
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value, description, category, is_public) VALUES
('email_templates_enabled', 'true', 'Enable enhanced email templates', 'email', false),
('audit_log_retention_days', '365', 'Number of days to retain audit logs', 'system', false),
('max_login_attempts', '5', 'Maximum failed login attempts before lockout', 'security', false),
('session_timeout_hours', '24', 'Session timeout in hours', 'security', false),
('invitation_expiry_hours', '48', 'Default invitation expiry time in hours', 'invitations', false)
ON CONFLICT (setting_key) DO NOTHING;

-- Create function to automatically update agency_id for new leads/properties
CREATE OR REPLACE FUNCTION set_agency_id_from_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Set agency_id based on the assigned user's agency
    IF NEW.assigned_to IS NOT NULL THEN
        SELECT agency_id INTO NEW.agency_id
        FROM users
        WHERE first_name = NEW.assigned_to
        AND agency_id IS NOT NULL
        LIMIT 1;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic agency_id assignment
DROP TRIGGER IF EXISTS trigger_set_lead_agency_id ON leads;
CREATE TRIGGER trigger_set_lead_agency_id
    BEFORE INSERT OR UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION set_agency_id_from_user();

DROP TRIGGER IF EXISTS trigger_set_property_agency_id ON properties;
CREATE TRIGGER trigger_set_property_agency_id
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION set_agency_id_from_user();

-- Add comments for documentation
COMMENT ON TABLE agencies IS 'Stores information about real estate agencies in the multi-tenant system';
COMMENT ON TABLE invitation_logs IS 'Tracks all invitation emails sent to users for audit and debugging';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all system actions and user activities';
COMMENT ON TABLE user_sessions IS 'Active user sessions for security and session management';
COMMENT ON TABLE system_settings IS 'Global system configuration settings';

COMMENT ON COLUMN users.invitation_token IS 'Secure token used for account setup links';
COMMENT ON COLUMN users.invitation_expires_at IS 'When the invitation link expires';
COMMENT ON COLUMN users.status IS 'User status: invited, active, suspended, inactive';
COMMENT ON COLUMN users.agency_name IS 'Temporary storage for agency name during invitation process';
COMMENT ON COLUMN users.invited_by IS 'Name/email of the person who sent the invitation';
COMMENT ON COLUMN leads.contacted_at IS 'Timestamp when lead was first contacted';
COMMENT ON COLUMN leads.agency_id IS 'Reference to the agency that owns this lead';
COMMENT ON COLUMN properties.agency_id IS 'Reference to the agency that owns this property';
