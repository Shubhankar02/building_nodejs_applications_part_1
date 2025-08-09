const db = require('../config/database');
const path = require('path');
class File {
    constructor(fileData) {
        this.id = fileData.id;
        this.filename = fileData.filename;
        this.original_filename = fileData.original_filename;
        this.mime_type = fileData.mime_type;
        this.file_size = fileData.file_size;
        this.file_path = fileData.file_path;
        this.user_id = fileData.user_id;
        this.processing_status = fileData.processing_status;
        this.processing_error = fileData.processing_error;
        this.file_category = fileData.file_category;
        this.image_width = fileData.image_width;
        this.image_height = fileData.image_height;
        this.has_thumbnail = fileData.has_thumbnail;
        this.thumbnail_path = fileData.thumbnail_path;
        this.document_pages = fileData.document_pages;
        this.document_text_content = fileData.document_text_content;
        this.tags = fileData.tags || [];
        this.description = fileData.description;
        this.is_public = fileData.is_public;
        this.created_at = fileData.created_at;
        this.updated_at = fileData.updated_at;
        this.last_accessed = fileData.last_accessed;
    }
    // Create a new file record with automatic categorization
    static async create(fileData, userId) {
        const {
            filename,
            original_filename,
            mime_type,
            file_size,
            file_path,
            image_width,
            image_height
        } = fileData;
        try {
            // Automatically determine file category based on MIME type
            const file_category = this.categorizeFile(mime_type);
            const result = await db.query(`
INSERT INTO files (
filename, original_filename, mime_type, file_size, file_path,
user_id, file_category, image_width, image_height
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *
`
                , [
                    filename, original_filename, mime_type, file_size, file_path,
                    userId, file_category, image_width, image_height
                ]);
            return new File(result.rows[0]);
        } catch (error) {
            console.error('Error creating file record:', error);
            throw error;
        }
    }
    // Helper method to categorize files based on MIME type
    static categorizeFile(mimeType) {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType === 'application/pdf' ||
            mimeType.includes('document') ||
            mimeType.includes('text/')) return 'document';
        return 'other';
    }
    // Find files by user with filtering and pagination
    static async findByUserId(userId, options = {}) {
        try {
            const {
                category,
                processing_status,
                search,
                page = 1,
                limit = 20,
                sort_by =
                'created_at',
                sort_order = 'DESC'
            } = options;
            let query = 'SELECT * FROM files WHERE user_id = $1';
            const params = [userId];
            let paramCount = 1;
            // Add category filter
            if (category) {
                paramCount++;
                query += ` AND file_category = $${paramCount}`
                    ;
                params.push(category);
            }
            // Add processing status filter
            if (processing_status) {
                paramCount++;
                query += ` AND processing_status = $${paramCount}`
                    ;
                params.push(processing_status);
            }
            // Add search functionality
            if (search) {
                paramCount++;
                query += ` AND (original_filename ILIKE $${paramCount} OR des
cription ILIKE $${paramCount} OR $${paramCount} = ANY(tags))`
                    ;
                params.push(`%${search}%`);
            }
            // Add sorting
            const validSortColumns = ['created_at', 'original_filename', 'file_size', 'last_accessed'];
            const validSortOrders = ['ASC', 'DESC'];
            if (validSortColumns.includes(sort_by) && validSortOrders.includes
                (sort_order.toUpperCase())) {
                query += ` ORDER BY ${sort_by} ${sort_order.toUpperCase()}`
                    ;
            } else {
                query += ` ORDER BY created_at DESC`;
            }
            // Add pagination
            const offset = (page - 1) * limit;
            query += ` LIMIT ${limit} OFFSET ${offset}`
                ;
            const result = await db.query(query, params);
            return result.rows.map(row => new File(row));
        } catch (error) {
            console.error('Error finding files by user ID:'
                , error);
            throw error;
        }
    }
    // Find a specific file by ID and ensure user ownership
    static async findByIdAndUserId(id, userId, options = {}) {
        try {
            let result;
            if (options && options.skipUserCheck) {
                result = await db.query('SELECT * FROM files WHERE id = $1', [id]);
            } else {
                result = await db.query(
                    'SELECT * FROM files WHERE id = $1 AND user_id = $2',
                    [id, userId]
                );
            }
            if (result.rows.length === 0) {
                return null;
            }
            // Update last accessed timestamp
            await db.query(
                'UPDATE files SET last_accessed = CURRENT_TIMESTAMP WHERE id = $1',
                [id]
            );
            return new File(result.rows[0]);
        } catch (error) {
            console.error('Error finding file by ID and user ID:'
                , error);
            throw error;
        }
    }
    // Update file metadata and processing status
    async update(updateData) {
        try {
            const updates = [];
            const params = [];
            let paramCount = 0;
            // Dynamically build update query based on provided data
            const allowedUpdates = [
                'processing_status', 'processing_error', 'has_thumbnail', 'thumbnail_path',
                'document_pages',
                'document_text_content', 'tags',
                'description',
                'is_public'
            ];
            for (const [key, value] of Object.entries(updateData)) {
                if (allowedUpdates.includes(key) && value !== undefined) {
                    paramCount++;
                    updates.push(`${key} = $${paramCount}`);
                    params.push(value);
                }
            }
            if (updates.length === 0) {
                return this; // No updates to apply
            }
            paramCount++;
            params.push(this.id);
            const query = `
UPDATE files
SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
WHERE id = $${paramCount}
RETURNING *`;
            const result = await db.query(query, params);
            if (result.rows.length === 0) {
                throw new Error('File not found');
            }
            // Update current instance with new data
            Object.assign(this, result.rows[0]);
            return this;
        } catch (error) {
            console.error('Error updating file:', error);
            throw error;
        }
    }
    // Delete file record and associated data
    async delete() {
        try {
            // Start a transaction to ensure data consistency
            const client = await db.getClient();
            try {
                await client.query('BEGIN');
                // Delete associated processing jobs
                await client.query(
                    'DELETE FROM processing_jobs WHERE file_id = $1',
                    [this.id]
                );
                // Delete file shares
                await client.query(
                    'DELETE FROM file_shares WHERE file_id = $1',
                    [this.id]
                );
                // Delete the file record (storage quota will be updated automatically by trigger)
                const result = await client.query(
                    'DELETE FROM files WHERE id = $1 RETURNING id',
                    [this.id]
                );
                await client.query('COMMIT');
                return result.rows.length > 0;
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            throw error;
        }
    }
    // Get storage statistics for a user
    static async getStorageStats(userId) {
        try {
            const result = await db.query(`
    SELECT
    u.storage_quota_bytes,
    u.storage_used_bytes,
    COUNT(f.id) as total_files,
    COUNT(CASE WHEN f.file_category = 'image' THEN 1 END) as image_count,
    COUNT(CASE WHEN f.file_category = 'document' THEN 1 END) as document_count,
    COUNT(CASE WHEN f.file_category = 'video' THEN 1 END) as video_count,
    COUNT(CASE WHEN f.file_category = 'audio' THEN 1 END) as audio_count,
    COUNT(CASE WHEN f.file_category = 'other' THEN 1 END) as other_count
    FROM files f
    JOIN users u ON f.user_id = u.id
    WHERE f.user_id = $1
    GROUP BY u.storage_quota_bytes, u.storage_used_bytes
    `, [userId]);
            return result.rows[0];
        } catch (error) {
            console.error('Error getting storage stats:', error);
            throw error;
        }
    }
    // Check if user has sufficient storage quota for a new file
    static async checkStorageQuota(userId, fileSize) {
        try {
            const result = await db.query(
                'SELECT storage_quota_bytes, storage_used_bytes FROM users WHERE id = $1',
                [userId]
            );
            if (result.rows.length === 0) {
                throw new Error('User not found');
            }
            const { storage_quota_bytes, storage_used_bytes } = result.rows[0];
            const availableSpace = storage_quota_bytes - storage_used_bytes;
            return {
                hasSpace: availableSpace >= fileSize,
                availableSpace,
                usedSpace: storage_used_bytes,
                totalSpace: storage_quota_bytes
            };
        } catch (error) {
            console.error('Error checking storage quota:', error);
            throw error;
        }
    }
    // Convert file instance to JSON with computed properties
    toJSON() {
        return {
            id: this.id,
            filename: this.filename,
            original_filename: this.original_filename,
            mime_type: this.mime_type,
            file_size: this.file_size,
            file_category: this.file_category,
            processing_status: this.processing_status,
            image_width: this.image_width,
            image_height: this.image_height,
            has_thumbnail: this.has_thumbnail,
            document_pages: this.document_pages,
            tags: this.tags,
            description: this.description,
            is_public: this.is_public,
            created_at: this.created_at,
            updated_at: this.updated_at,
            last_accessed: this.last_accessed,
            // Computed properties for client convenience
            file_size_human: this.formatFileSize(this.file_size),
            file_extension: path.extname(this.original_filename),
            upload_age: this.getUploadAge()
        };
    }
    // Helper method to format file sizes in human-readable format
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    // Helper method to calculate upload age
    getUploadAge() {
        const now = new Date();
        const uploadDate = new Date(this.created_at);
        const diffInHours = Math.floor((now - uploadDate) / (1000 * 60 * 60));
        if (diffInHours < 1) return ' Just uploaded';
        if (diffInHours < 24) return `${diffInHours} hours ago`;
        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 30) return `${diffInDays} days ago`;
        const diffInMonths = Math.floor(diffInDays / 30);
        return `${diffInMonths} months ago`;
    }
}
module.exports = File;