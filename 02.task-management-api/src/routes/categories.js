const express = require('express');
const Category = require('../models/Category');
const router = express.Router();

// Simple middleware to extract user ID (same as tasks)
const extractUserId = (req, res, next) => {
    req.userId = req.query.userId || 1; // Default to user ID 1 for testing
    next();
};
// Get all categories for a user
router.get('/', extractUserId, async (req, res) => {
    try {
        // Use our Category model to get user's categories
        const categories = await Category.findByUserId(req.userId);
        res.json({
            message: 'Categories retrieved successfully',
            count: categories.length,
            categories
        });
    } catch (error) {
        console.error('Error getting categories:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get a specific category
router.get('/:id', extractUserId, async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id);
        // Find category using our model method
        const category = await Category.findByIdAndUserId(categoryId, req.userId);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        // Get task count for this category
        const taskCount = await category.getTaskCount();
        res.json({
            message: 'Category retrieved successfully',
            category: {
                ...category,
                taskCount
            }
        });
    } catch (error) {
        console.error('Error getting category:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Create a new category
router.post('/', extractUserId, async (req, res) => {
    try {
        const { name, description, color } = req.body;
        // Basic validation
        if (!name) {
            return res.status(400).json({ error: 'Category name is required' });
        }
        // Create category using our Category model
        const category = await Category.create({
            name,
            description,
            color
        }, req.userId);
        res.status(201).json({
            message: 'Category created successfully',
            category
        });
    } catch (error) {
        console.error('Error creating category:', error);
        if (error.message === 'Category name already exists for this user') {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Update a category
router.put('/:id', extractUserId, async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id);
        // Find the category first
        const category = await Category.findByIdAndUserId(categoryId, req.userId);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        // Update the category using our model method
        const updatedCategory = await category.update(req.body);
        res.json({
            message: 'Category updated successfully',
            category: updatedCategory
        });
    } catch (error) {
        console.error('Error updating category:', error);
        if (error.message === 'Category name already exists for this user') {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Delete a category
router.delete('/:id', extractUserId, async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id);
        // Find the category first
        const category = await Category.findByIdAndUserId(categoryId, req.userId);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        // Delete the category using our model method
        await category.delete();
        res.json({
            message: 'Category deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
module.exports = router;