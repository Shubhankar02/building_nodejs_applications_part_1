const express = require('express');
const UserController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/authentication');
const { requirePermission } = require('../middleware/authorization');

const router = express.Router();

// All user routes require authentication
router.use(authenticateToken);

// User management routes (admin only)
router.get('/', 
    requirePermission('users.list'), 
    UserController.getAllUsers
);

router.get('/stats', 
    requirePermission('users.list'), 
    UserController.getUserStatistics
);

router.get('/:userId', 
    requirePermission('users.read'), 
    UserController.getUserDetails
);

router.put('/:userId/status', 
    requirePermission('users.update'), 
    UserController.updateUserStatus
);

router.post('/:userId/roles', 
    requirePermission('roles.assign'), 
    UserController.assignRole
);

router.delete('/:userId/roles/:roleId', 
    requirePermission('roles.assign'), 
    UserController.removeRole
);

router.post('/:userId/force-logout', 
    requirePermission('users.update'), 
    UserController.forceLogout
);

module.exports = router;