const auditService = require("../services/auditService");
const AuditLog = require("../models/AuditLog");
const joi = require("joi");

class AuditController {
  // Get system statistics
  static async getSystemStats(req, res) {
    try {
      const { days = 30 } = req.query;

      const stats = await auditService.getAuditStatistics(parseInt(days));

      res.json({
        success: true,
        data: {
          period_days: parseInt(days),
          statistics: stats,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error getting system stats:", error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve system statistics",
      });
    }
  }

  // Get audit logs with filtering
  static async getAuditLogs(req, res) {
    try {
      const schema = joi.object({
        page: joi.number().integer().min(1).default(1),
        limit: joi.number().integer().min(1).max(100).default(50),
        user_id: joi.number().integer().optional(),
        event_type: joi.string().optional(),
        event_category: joi.string().optional(),
        success: joi.boolean().optional(),
        start_date: joi.date().optional(),
        end_date: joi.date().optional(),
        ip_address: joi.string().ip().optional(),
      });

      const { error, value } = schema.validate(req.query);

      if (error) {
        return res.status(400).json({
          success: false,
          error: "Invalid query parameters",
          details: error.details.map((detail) => detail.message),
        });
      }

      const result = await auditService.getAuditLogs(
        value,
        value.page,
        value.limit
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error getting audit logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve audit logs",
      });
    }
  }

  // Get security alerts
  static async getSecurityAlerts(req, res) {
    try {
      const { days = 7 } = req.query;

      const alerts = await auditService.getSecurityAlerts(parseInt(days));

      res.json({
        success: true,
        data: {
          period_days: parseInt(days),
          alerts: alerts,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error getting security alerts:", error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve security alerts",
      });
    }
  }

  // Get audit logs for a specific user
  static async getUserAuditLogs(req, res) {
    try {
      const userId = parseInt(req.params.userId);
      const { days = 30 } = req.query;

      if (isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid user ID",
        });
      }

      const activity = await auditService.getUserActivitySummary(
        userId,
        parseInt(days)
      );

      res.json({
        success: true,
        data: {
          user_id: userId,
          period_days: parseInt(days),
          activity: activity,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error getting user audit logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve user audit logs",
      });
    }
  }
}

module.exports = AuditController;