const express = require('express');
const Task = require('../models/Task');
const router = express.Router();
// Simple middleware to extract user ID from token (for demonstration)
const extractUserId = (req, res, next) => {
    // In a real app, you'd verify the JWT token here
    // For simplicity, we'll just use a hardcoded user ID or get it from query params
    req.userId = req.query.userId || 1; // Default to user ID 1 for testing
    next();
};
// Get all tasks for a user
router.get('/', extractUserId, async (req, res) => {
    try {
        const { status, priority, category_id, due_before } = req.query;
        // Build filters object from query parameters
        const filters = {};
        if (status) filters.status = status;
        if (priority) filters.priority = priority;
        if (category_id) filters.category_id = parseInt(category_id);
        if (due_before) filters.due_before = due_before;
        // Use our Task model to get filtered tasks
        const tasks = await Task.findByUserId(req.userId, filters);
        res.json({
            message: 'Tasks retrieved successfully',
            count: tasks.length,
            tasks
        });
    } catch (error) {
        console.error('Error getting tasks:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get a specific task
router.get('/:id', extractUserId, async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        // Find task using our model method
        const task = await Task.findByIdAndUserId(taskId, req.userId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        res.json({
            task,
            message: 'Task retrieved successfully',
        });
    } catch (error) {
        console.error('Error getting task:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Create a new task
router.post('/', extractUserId, async (req, res) => {
    try {
        const { title, description, due_date, priority, category_id } = req.body;
        // Basic validation
        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }
        // Create task using our Task model
        const task = await Task.create({
            title,
            description,
            due_date,
            priority,
            category_id
        }, req.userId);
        res.status(201).json({
            message: 'Task created successfully',
            task
        });
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Update a task
router.put('/:id', extractUserId, async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        // Find the task first
        const task = await Task.findByIdAndUserId(taskId, req.userId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        // Update the task using our model method
        const updatedTask = await task.update(req.body);
        res.json({
            message: 'Task updated successfully',
            task: updatedTask
        });
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Delete a task
router.delete('/:id', extractUserId, async (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        // Find the task first
        const task = await Task.findByIdAndUserId(taskId, req.userId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        // Delete the task using our model method
        await task.delete();
        res.json({
            message: 'Task deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get task statistics
router.get('/stats/summary', extractUserId, async (req, res) => {
    try {
        // Use our Task model's statistics method
        const stats = await Task.getStats(req.userId);
        res.json({
            stats,  
            message: 'Task statistics retrieved successfully',
        });
    } catch (error) {
        console.error('Error getting task stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
module.exports = router;
