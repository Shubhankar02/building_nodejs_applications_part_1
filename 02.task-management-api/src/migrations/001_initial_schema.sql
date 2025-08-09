-- Create users table
-- This table stores basic user information and authentication data
CREATE TABLE IF NOT EXISTS users
(
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    name          VARCHAR(255)        NOT NULL,
    password_hash VARCHAR(255)        NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Create categories table
-- Categories help organize tasks and provide filtering options
CREATE TABLE IF NOT EXISTS categories
(
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    color       VARCHAR(7) DEFAULT '#3498db'
-- Hex color code for UI
    ,
    user_id     INTEGER REFERENCES users (id) ON DELETE CASCADE,
    created_at  TIMESTAMP  DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP  DEFAULT CURRENT_TIMESTAMP,
-- Ensure that category names are unique per user
    UNIQUE (name, user_id)
);
-- Create tasks table
-- This is the main table that stores all task information
CREATE TABLE IF NOT EXISTS tasks
(
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    due_date     TIMESTAMP,
    priority     VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'med
ium', 'high', 'urgent')),
    status       VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in
_progress', 'completed', 'cancelled')),
    user_id      INTEGER REFERENCES users (id) ON DELETE CASCADE,
    category_id  INTEGER      REFERENCES categories (id) ON DELETE SET NULL,
    created_at   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);
-- Create indexes for better query performance
-- These indexes speed up common queries like finding tasks by user or status
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_category_id ON tasks (category_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories (user_id);
-- Create a function to automatically update the updated_at timestamp
-- This ensures that modification times are always accurate
CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS
$$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';
-- Create triggers to automatically update timestamps
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE
    ON users
    FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE
    ON categories
    FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE
    ON tasks
    FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();