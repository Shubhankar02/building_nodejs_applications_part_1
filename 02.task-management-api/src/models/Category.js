const db = require('../config/database');
class Category {
    constructor(categoryData) {
        this.id = categoryData.id;
        this.name = categoryData.name;
        this.description = categoryData.description;
        this.color = categoryData.color;
        this.user_id = categoryData.user_id;
        this.created_at = categoryData.created_at;
        this.updated_at = categoryData.updated_at;
    }
    // Create a new category for a specific user
    static async create(categoryData, userId) {
        const { name, description, color = '#3498db' } = categoryData;
        try {
            const result = await db.query(
                `INSERT INTO categories (name, description, color, user_id)
VALUES ($1, $2, $3, $4)
RETURNING *`
                ,
                [name, description, color, userId]
            );
            return new Category(result.rows[0]);
        } catch (error) {
            // Handle unique constraint violation for category names per user
            if (error.code === '23505') {
                throw new Error('Category name already exists for this user');
            }
            throw error;
        }
    }
    // Find all categories for a specific user
    static async findByUserId(userId) {
        try {
            const result = await db.query(
                'SELECT * FROM categories WHERE user_id = $1 ORDER BY name'
                ,
                [userId]
            );
            return result.rows.map(row => new Category(row));
        } catch (error) {
            console.error('Error finding categories by user ID:'
                , error);
            throw error;
        }
    }
    // Find a specific category by ID and ensure it belongs to the user
    static async findByIdAndUserId(id, userId) {
        try {
            const result = await db.query(
                'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
                [id, userId]
            );
            if (result.rows.length === 0) {
                return null;
            }
            return new Category(result.rows[0]);
        } catch (error) {
            console.error('Error finding category by ID and user ID:'
                , error);
            throw error;
        }
    }
    // Update an existing category
    async update(updateData) {
        const { name, description, color } = updateData;
        try {
            const result = await db.query(
                `UPDATE categories
SET name = COALESCE($1, name),
description = COALESCE($2, description),
color = COALESCE($3, color) WHERE id = $4
RETURNING *`
                ,
                [name, description, color, this.id]
            );
            if (result.rows.length === 0) {
                throw new Error('Category not found');
            }
            // Update the current instance with new data
            Object.assign(this, result.rows[0]);
            return this;
        } catch (error) {
            if (error.code === '23505') {
                throw new Error('Category name already exists for this user');
            }
            throw error;
        }
    }
    // Delete a category
    async delete() {
        try {
            const result = await db.query(
                'DELETE FROM categories WHERE id = $1 RETURNING id',
                [this.id]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error('Error deleting category:', error);
            throw error;
        }
    }
    // Get task count for this category
    async getTaskCount() {
        try {
            const result = await db.query(
                'SELECT COUNT(*) FROM tasks WHERE category_id = $1',
                [this.id]
            );
            return parseInt(result.rows[0].count);
        } catch (error) {
            console.error('Error getting task count:', error);
            throw error;
        }
    }
}
module.exports = Category;