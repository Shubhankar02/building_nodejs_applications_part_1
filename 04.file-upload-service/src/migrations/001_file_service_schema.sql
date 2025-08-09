-- Create users table with file quota tracking
CREATE TABLE IF NOT EXISTS users
(
    id                  SERIAL PRIMARY KEY,
    email               VARCHAR(255) UNIQUE NOT NULL,
    name                VARCHAR(255)        NOT NULL,
    password_hash       VARCHAR(255)        NOT NULL,
    storage_quota_bytes BIGINT    DEFAULT 1073741824, -- 1GB default quota
    storage_used_bytes  BIGINT    DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Create files table to store file metadata and processing status
CREATE TABLE IF NOT EXISTS files
(
    id                    SERIAL PRIMARY KEY,
    filename              VARCHAR(255) NOT NULL,
    original_filename     VARCHAR(255) NOT NULL,
    mime_type             VARCHAR(100) NOT NULL,
    file_size             BIGINT       NOT NULL,
    file_path             TEXT         NOT NULL,
    user_id               INTEGER REFERENCES users (id) ON DELETE CASCADE,
-- File processing status tracking
    processing_status     VARCHAR(50) DEFAULT 'pending' CHECK (processing_status IN
                                                               ('pending', 'processing', 'completed', 'failed')),
    processing_error      TEXT,
-- File categorization
    file_category         VARCHAR(50) CHECK (file_category IN
                                             ('image', 'document', 'video', 'audio', 'other')),
-- Image-specific metadata
    image_width           INTEGER,
    image_height          INTEGER,
    has_thumbnail         BOOLEAN     DEFAULT FALSE,
    thumbnail_path        TEXT,
-- Document-specific metadata
    document_pages        INTEGER,
    document_text_content TEXT,-- File organization
    tags                  TEXT[],
    description           TEXT,-- PostgreSQL array for storing tags
    is_public             BOOLEAN     DEFAULT FALSE,
-- Timestamps for lifecycle management
    created_at            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    last_accessed         TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);
-- Create processing_jobs table for background task management
CREATE TABLE IF NOT EXISTS processing_jobs
(
    id              SERIAL PRIMARY KEY,
    file_id         INTEGER REFERENCES files (id) ON DELETE CASCADE,
    job_type        VARCHAR(50) NOT NULL CHECK (job_type IN
                                                ('thumbnail_generation', 'image_optimization', 'metadata_extraction', 'v
irus_scan')),
    status          VARCHAR(50) DEFAULT 'queued' CHECK (status IN
                                                        ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    priority        INTEGER     DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    attempts        INTEGER     DEFAULT 0,
    max_attempts    INTEGER     DEFAULT 3,
    error_message   TEXT,
    processing_data JSONB, -- Store job-specific data
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP,
    created_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);
-- Create file_shares table for sharing functionality
CREATE TABLE IF NOT EXISTS file_shares
(
    id               SERIAL PRIMARY KEY,
    file_id          INTEGER REFERENCES files (id) ON DELETE CASCADE,
    shared_by        INTEGER REFERENCES users (id) ON DELETE CASCADE,
    shared_with      INTEGER REFERENCES users (id) ON DELETE CASCADE,
    permission_level VARCHAR(20) DEFAULT 'view' CHECK (permission_level IN
                                                       ('view', 'download', 'edit')),
    expires_at       TIMESTAMP,
    created_at       TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);
-- Create indexes for optimal query performance
-- These indexes are crucial for file search and retrieval operations
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files (user_id);
CREATE INDEX IF NOT EXISTS idx_files_processing_status ON files (processing_status);
CREATE INDEX IF NOT EXISTS idx_files_file_category ON files (file_category);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files (created_at);
CREATE INDEX IF NOT EXISTS idx_files_mime_type ON files (mime_type);
CREATE INDEX IF NOT EXISTS idx_files_tags ON files USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs (status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_file_id ON processing_jobs (file_id);
CREATE INDEX IF NOT EXISTS idx_file_shares_file_id ON file_shares (file_id);
CREATE INDEX IF NOT EXISTS idx_file_shares_shared_with ON file_shares
    (shared_with);
-- Create function to automatically update storage quota usage
CREATE OR REPLACE FUNCTION update_user_storage_usage()
    RETURNS TRIGGER AS
$$
BEGIN
    -- Handle file insertion (increase storage usage)
    IF TG_OP = 'INSERT' THEN
        UPDATE users
        SET storage_used_bytes = storage_used_bytes + NEW.file_size
        WHERE id = NEW.user_id;
        RETURN NEW;
    END IF;
-- Handle file deletion (decrease storage usage)
    IF TG_OP = 'DELETE' THEN
        UPDATE users
        SET storage_used_bytes = storage_used_bytes - OLD.file_size
        WHERE id = OLD.user_id;
        RETURN OLD;
    END IF;
-- Handle file updates (adjust storage usage based on size difference)
    IF TG_OP = 'UPDATE' THEN
        UPDATE users
        SET storage_used_bytes = storage_used_bytes - OLD.file_size + NEW.
            file_size
        WHERE id = NEW.user_id;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
-- Create triggers to maintain storage quota accuracy
CREATE TRIGGER trigger_update_storage_on_insert
    AFTER INSERT
    ON files
    FOR EACH ROW
EXECUTE FUNCTION update_user_storage_usage();
CREATE TRIGGER trigger_update_storage_on_delete
    AFTER DELETE
    ON files
    FOR EACH ROW
EXECUTE FUNCTION update_user_storage_usage();
CREATE TRIGGER trigger_update_storage_on_update
    AFTER UPDATE
    ON files
    FOR EACH ROW
EXECUTE FUNCTION update_user_storage_usage();
-- Create function to automatically update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS
$$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';
-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE
    ON users
    FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE
    ON files
    FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();