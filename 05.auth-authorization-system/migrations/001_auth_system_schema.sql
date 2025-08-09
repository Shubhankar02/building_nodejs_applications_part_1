-- Create users table with comprehensive authentication features
CREATE TABLE IF NOT EXISTS users
(
    id                         SERIAL PRIMARY KEY,
    email                      VARCHAR(255) UNIQUE NOT NULL,
    username                   VARCHAR(50) UNIQUE,
    first_name                 VARCHAR(100)        NOT NULL,
    last_name                  VARCHAR(100)        NOT NULL,
    password_hash              VARCHAR(255)        NOT NULL,

    -- Email verification
    email_verified             BOOLEAN     DEFAULT FALSE,
    email_verification_token   VARCHAR(255),
    email_verification_expires TIMESTAMP,

    -- Password reset
    password_reset_token       VARCHAR(255),
    password_reset_expires     TIMESTAMP,
    last_password_change       TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,

    -- Two-factor authentication
    two_factor_enabled         BOOLEAN     DEFAULT FALSE,
    two_factor_secret          VARCHAR(32),
    two_factor_backup_codes    TEXT[],

    -- Account security
    failed_login_attempts      INTEGER     DEFAULT 0,
    account_locked_until       TIMESTAMP,
    last_login                 TIMESTAMP,
    last_login_ip              INET,

    -- Profile information
    avatar_url                 TEXT,
    timezone                   VARCHAR(50) DEFAULT 'UTC',
    locale                     VARCHAR(10) DEFAULT 'en',

    -- Account status
    is_active                  BOOLEAN     DEFAULT TRUE,
    is_verified                BOOLEAN     DEFAULT FALSE,

    -- Audit fields
    created_at                 TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    updated_at                 TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    created_by                 INTEGER REFERENCES users (id),
    updated_by                 INTEGER REFERENCES users (id)
);

-- Create roles table for role-based access control
CREATE TABLE IF NOT EXISTS roles
(
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(100) UNIQUE NOT NULL,
    description    TEXT,
    is_system_role BOOLEAN   DEFAULT FALSE, -- Prevents deletion of critical roles
    is_default     BOOLEAN   DEFAULT FALSE, -- Assigned to new users automatically

    -- Role hierarchy support
    parent_role_id INTEGER REFERENCES roles (id),
    level          INTEGER   DEFAULT 0,     -- For role hierarchy depth

    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by     INTEGER REFERENCES users (id),
    updated_by     INTEGER REFERENCES users (id)
);

-- Create permissions table for granular access control
CREATE TABLE IF NOT EXISTS permissions
(
    id                   SERIAL PRIMARY KEY,
    name                 VARCHAR(100) UNIQUE NOT NULL,
    description          TEXT,
    resource             VARCHAR(100)        NOT NULL, -- What resource this permission applies to
    action               VARCHAR(50)         NOT NULL, -- What action this permission allows

    -- Permission categorization
    category             VARCHAR(50),                  -- Group related permissions
    is_system_permission BOOLEAN   DEFAULT FALSE,

    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by           INTEGER REFERENCES users (id)
);

-- Junction table for user-role assignments
CREATE TABLE IF NOT EXISTS user_roles
(
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users (id) ON DELETE CASCADE,
    role_id     INTEGER REFERENCES roles (id) ON DELETE CASCADE,

    -- Assignment metadata
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by INTEGER REFERENCES users (id),
    expires_at  TIMESTAMP, -- Support for temporary role assignments
    is_active   BOOLEAN   DEFAULT TRUE,

    -- Prevent duplicate assignments
    UNIQUE (user_id, role_id)
);

-- Junction table for role-permission assignments
CREATE TABLE IF NOT EXISTS role_permissions
(
    id            SERIAL PRIMARY KEY,
    role_id       INTEGER REFERENCES roles (id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions (id) ON DELETE CASCADE,

    -- Permission constraints
    granted       BOOLEAN   DEFAULT TRUE, -- Allows explicit denial of inherited permissions
    granted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by    INTEGER REFERENCES users (id),

    -- Prevent duplicate assignments
    UNIQUE (role_id, permission_id)
);

-- User sessions table for session management
CREATE TABLE IF NOT EXISTS user_sessions
(
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER REFERENCES users (id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255) UNIQUE,

    -- Session metadata
    device_info   JSONB,                   -- Store device/browser information
    ip_address    INET,
    user_agent    TEXT,
    location      JSONB,                   -- Geolocation data if available

    -- Session lifecycle
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at    TIMESTAMP           NOT NULL,
    is_active     BOOLEAN   DEFAULT TRUE,

    -- Security flags
    is_remembered BOOLEAN   DEFAULT FALSE, -- "Remember me" checkbox
    force_logout  BOOLEAN   DEFAULT FALSE  -- Admin-triggered logout
);

-- Audit log table for security monitoring
CREATE TABLE IF NOT EXISTS audit_logs
(
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER REFERENCES users (id),
    session_id     INTEGER REFERENCES user_sessions (id),

    -- Event details
    event_type     VARCHAR(100) NOT NULL, -- login, logout, permission_change, etc.
    event_category VARCHAR(50)  NOT NULL, -- authentication, authorization, admin
    resource_type  VARCHAR(100),          -- What type of resource was accessed
    resource_id    VARCHAR(100),          -- ID of the specific resource

    -- Event context
    ip_address     INET,
    user_agent     TEXT,
    request_method VARCHAR(10),
    request_path   TEXT,

    -- Event outcome
    success        BOOLEAN,
    error_message  TEXT,

    -- Additional context
    metadata       JSONB,                 -- Flexible storage for event-specific data

    -- Timestamp
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for optimal query performance
-- User table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON users (email_verification_token);
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users (password_reset_token);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users (last_login);
CREATE INDEX IF NOT EXISTS idx_users_account_locked_until ON users (account_locked_until);

-- Role and permission indexes
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles (name);
CREATE INDEX IF NOT EXISTS idx_roles_parent_role_id ON roles (parent_role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON permissions (resource, action);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions (role_id);

-- Session indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_token ON user_sessions (session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_accessed ON user_sessions (last_accessed);

-- Audit log indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs (ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_logs_success ON audit_logs (success);

-- Create functions for maintaining data integrity and automation

-- Function to automatically update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS
$$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
    RETURNS void AS
$$
BEGIN
    DELETE
    FROM user_sessions
    WHERE expires_at < CURRENT_TIMESTAMP
       OR (force_logout = TRUE AND last_accessed < CURRENT_TIMESTAMP - INTERVAL '1 hour');
END;
$$ LANGUAGE plpgsql;

-- Function to automatically lock accounts after failed attempts
CREATE OR REPLACE FUNCTION check_account_lockout()
    RETURNS TRIGGER AS
$$
BEGIN
    -- Lock account for 30 minutes after 5 failed attempts
    IF NEW.failed_login_attempts >= 5 THEN
        NEW.account_locked_until = CURRENT_TIMESTAMP + INTERVAL '30 minutes';
    END IF;

    -- Lock account for 1 hour after 10 failed attempts
    IF NEW.failed_login_attempts >= 10 THEN
        NEW.account_locked_until = CURRENT_TIMESTAMP + INTERVAL '1 hour';
    END IF;

    -- Lock account for 24 hours after 15 failed attempts
    IF NEW.failed_login_attempts >= 15 THEN
        NEW.account_locked_until = CURRENT_TIMESTAMP + INTERVAL '24 hours';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic data management
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE
    ON users
    FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at
    BEFORE UPDATE
    ON roles
    FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER check_user_account_lockout
    BEFORE UPDATE
    ON users
    FOR EACH ROW
EXECUTE FUNCTION check_account_lockout();

-- Insert default roles and permissions
INSERT INTO roles (name, description, is_system_role, is_default)
VALUES ('Super Admin', 'Full system access', TRUE, FALSE),
       ('Admin', 'Administrative access', TRUE, FALSE),
       ('Moderator', 'Content moderation access', TRUE, FALSE),
       ('User', 'Standard user access', TRUE, TRUE),
       ('Guest', 'Limited read-only access', TRUE, FALSE);

-- Insert core permissions
INSERT INTO permissions (name, description, resource, action, category, is_system_permission)
VALUES
    -- User management permissions
    ('users.create', 'Create new users', 'users', 'create', 'user_management', TRUE),
    ('users.read', 'View user information', 'users', 'read', 'user_management', TRUE),
    ('users.update', 'Update user information', 'users', 'update', 'user_management', TRUE),
    ('users.delete', 'Delete users', 'users', 'delete', 'user_management', TRUE),
    ('users.list', 'List all users', 'users', 'list', 'user_management', TRUE),

    -- Role management permissions
    ('roles.create', 'Create new roles', 'roles', 'create', 'role_management', TRUE),
    ('roles.read', 'View role information', 'roles', 'read', 'role_management', TRUE),
    ('roles.update', 'Update role information', 'roles', 'update', 'role_management', TRUE),
    ('roles.delete', 'Delete roles', 'roles', 'delete', 'role_management', TRUE),
    ('roles.assign', 'Assign roles to users', 'roles', 'assign', 'role_management', TRUE),

    -- System administration permissions
    ('system.admin', 'Full system administration', 'system', 'admin', 'system', TRUE),
    ('system.audit', 'View audit logs', 'system', 'audit', 'system', TRUE),
    ('system.config', 'Modify system configuration', 'system', 'config', 'system', TRUE),

    -- Content permissions
    ('content.create', 'Create content', 'content', 'create', 'content', FALSE),
    ('content.read', 'View content', 'content', 'read', 'content', FALSE),
    ('content.update', 'Update content', 'content', 'update', 'content', FALSE),
    ('content.delete', 'Delete content', 'content', 'delete', 'content', FALSE),
    ('content.moderate', 'Moderate content', 'content', 'moderate', 'content', FALSE);

-- Assign permissions to default roles
DO
$$
    DECLARE
        super_admin_id INTEGER;
        admin_id       INTEGER;
        moderator_id   INTEGER;
        user_id        INTEGER;
        guest_id       INTEGER;
    BEGIN
        -- Get role IDs
        SELECT id INTO super_admin_id FROM roles WHERE name = 'Super Admin';
        SELECT id INTO admin_id FROM roles WHERE name = 'Admin';
        SELECT id INTO moderator_id FROM roles WHERE name = 'Moderator';
        SELECT id INTO user_id FROM roles WHERE name = 'User';
        SELECT id INTO guest_id FROM roles WHERE name = 'Guest';

        -- Super Admin gets all permissions
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT super_admin_id, id
        FROM permissions;

        -- Admin gets most permissions except super admin functions
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT admin_id, id
        FROM permissions
        WHERE name NOT IN ('system.admin');

        -- Moderator gets content and user read permissions
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT moderator_id, id
        FROM permissions
        WHERE name IN
              ('users.read', 'users.list', 'content.read', 'content.moderate', 'content.update', 'content.delete');

        -- User gets basic content permissions
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT user_id, id
        FROM permissions
        WHERE name IN ('content.create', 'content.read', 'content.update');

        -- Guest gets only read permissions
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT guest_id, id
        FROM permissions
        WHERE name IN ('content.read');
    END
$$;
