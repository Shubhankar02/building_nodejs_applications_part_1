const express = require('express');
const AuditController = require('../controllers/auditController');
const RoleController = require('../controllers/roleController');
const { authenticateToken } = require('../middleware/authentication');
const { requirePermission } = require('../middleware/authorization');

const router = express.Router();

// All admin routes require authentication
router.use(authenticateToken);

// System statistics and monitoring
router.get('/stats', 
    requirePermission('system.audit'), 
    AuditController.getSystemStats
);

// Audit logging endpoints
router.get('/audit-logs', 
    requirePermission('system.audit'), 
    AuditController.getAuditLogs
);

router.get('/security-alerts', 
    requirePermission('system.audit'), 
    AuditController.getSecurityAlerts
);

router.get('/audit-logs/:userId', 
    requirePermission('system.audit'), 
    AuditController.getUserAuditLogs
);

// Role management endpoints
router.get('/roles', 
    requirePermission('roles.read'), 
    RoleController.getAllRoles
);

router.post('/roles', 
    requirePermission('roles.create'), 
    RoleController.createRole
);

router.get('/roles/:roleId', 
    requirePermission('roles.read'), 
    RoleController.getRoleDetails
);

router.put('/roles/:roleId', 
    requirePermission('roles.update'), 
    RoleController.updateRole
);

router.delete('/roles/:roleId', 
    requirePermission('roles.delete'), 
    RoleController.deleteRole
);

router.post('/roles/:roleId/permissions', 
    requirePermission('roles.update'), 
    RoleController.assignPermission
);

router.delete('/roles/:roleId/permissions/:permissionId', 
    requirePermission('roles.update'), 
    RoleController.removePermission
);

// Permission management
router.get('/permissions', 
    requirePermission('roles.read'), 
    RoleController.getAllPermissions
);

router.post('/permissions', 
    requirePermission('roles.create'), 
    RoleController.createPermission
);

module.exports = router;