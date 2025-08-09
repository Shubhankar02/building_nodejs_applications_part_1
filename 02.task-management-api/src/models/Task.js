const db = require('../config/database');
class Task {
    constructor(taskData) {
        this.id = taskData.id;
        this.title = taskData.title;
        this.description = taskData.description;
        this.due_date = taskData.due_date;
        this.priority = taskData.priority;
        this.status = taskData.status;
        this.user_id = taskData.user_id;
        this.category_id = taskData.category_id;
        this.created_at = taskData.created_at;
        this.updated_at = taskData.updated_at;
        this.completed_at = taskData.completed_at;
        // Include category information if it was joined in the query
        if (taskData.category_name) {
            this.category = {
                id: taskData.category_id,
                name: taskData.category_name,
                color: taskData.category_color
            };
        }
    }
    // Create a new task
    static async create(taskData, userId) {
        const { title, description, due_date, priority = 'medium', category_id } =
            taskData;
        try {
            const result = await db.query(
                `INSERT INTO tasks (title, description, due_date, priority, category_id, user_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *`
                ,
                [title, description, due_date, priority, category_id, userId]
            );
            return new Task(result.rows[0]);
        } catch (error) {
            console.error('Error creating task:', error);
            throw error;
        }
    }
    // Find all tasks for a user with optional filtering
    static async findByUserId(userId, filters = {}) {
        try {
            let query =
                `
SELECT t.*, c.name as category_name, c.color as category_color
FROM tasks t
LEFT JOIN categories c ON t.category_id = c.id
WHERE t.user_id = $1
`
                ;
            const params = [userId];
            let paramCount = 1;
            // Add filters dynamically
            if (filters.status) {
                paramCount++;
                query += ` AND t.status = $${paramCount}`
                    ;
                params.push(filters.status);
            }
            if (filters.priority) {
                paramCount++;
                query += ` AND t.priority = $${paramCount}`
                    ;
                params.push(filters.priority);
            }
            if (filters.category_id) {
                paramCount++;
                query += ` AND t.category_id = $${paramCount}`
                    ;
                params.push(filters.category_id);
            }
            if (filters.due_before) {
                paramCount++;
                query += ` AND t.due_date <= $${paramCount}`
                    ;
                params.push(filters.due_before);
            }
            // Add ordering
            query += ` ORDER BY
    CASE
    WHEN t.priority = 'urgent' THEN 1
    WHEN t.priority = 'high' THEN 2
    WHEN t.priority = 'medium' THEN 3
    WHEN t.priority = 'low' THEN 4
    END,
    t.due_date ASC NULLS LAST,
    t.created_at DESC
    `
                ;
            const result = await db.query(query, params);
            return result.rows.map(row => new Task(row));
        } catch (error) {
            console.error('Error finding tasks by user ID:'
                , error);
            throw error;
        }
    }
    // Find a specific task by ID and ensure it belongs to the user
    static async findByIdAndUserId(id, userId) {
        try {
            const result = await db.query(`
SELECT t.*, c.name as category_name, c.color as category_color
FROM tasks t
LEFT JOIN categories c ON t.category_id = c.id
WHERE t.id = $1 AND t.user_id = $2
`
                , [id, userId]);
            if (result.rows.length === 0) {
                return null;
            }
            return new Task(result.rows[0]);
        } catch (error) {
            console.error('Error finding task by ID and user ID:'
                , error);
            throw error;
        }
    }
    // Update an existing task
    async update(updateData) {
        const { title, description, due_date, priority, status, category_id } = upd
        ateData;
        try {
            // If status is being changed to completed, set completed_at timestamp
            let completed_at = this.completed_at;
            if (status ===
                'completed' && this.status !== 'completed') {
                completed_at = new Date();
            } else if (status !== 'completed') {
                completed_at = null;
            }
            const result = await db.query(`
    UPDATE tasks
    SET title = COALESCE($1, title),
    description = COALESCE($2, description),
    due_date = COALESCE($3, due_date),
    priority = COALESCE($4, priority),
    status = COALESCE($5, status),
    category_id = COALESCE($6, category_id),
    completed_at = $7
    WHERE id = $8
    RETURNING *
    `
                , [title, description, due_date, priority, status, category_id, completed_at, this.id]);
            if (result.rows.length === 0) {
                throw new Error('Task not found');
            }
            // Update the current instance with new data
            Object.assign(this, result.rows[0]);
            return this;
        } catch (error) {
            console.error('Error updating task:', error);
            throw error;
        }
    }
    // Delete a task
    async delete() {
        try {
            const result = await db.query(
                'DELETE FROM tasks WHERE id = $1 RETURNING id',
                [this.id]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error('Error deleting task:', error);
            throw error;
        }
    }
    // Get task statistics for a user
    static async getStats(userId) {
        try {
            const result = await db.query(`
SELECT
COUNT(*) as total_tasks,
COUNT(CASE WHEN status = 'completed' THEN 1 END) as co
mpleted_tasks,
COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendi
ng_tasks,
COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_
progress_tasks,
COUNT(CASE WHEN due_date < CURRENT_DATE AND status !
= 'completed' THEN 1 END) as overdue_tasks
FROM tasks
WHERE user_id = $1
`
                , [userId]);
            return result.rows[0];
        } catch (error) {
            console.error('Error getting task statistics:', error);
            throw error;
        }
    }
}
module.exports = Task;