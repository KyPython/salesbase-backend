/**
 * Audit Logs API Routes
 */
const express = require('express');
const router = express.Router();
const middleware = require('../middleware');
const auditService = require('../services/auditService');

// Get all audit logs (admin only)
router.get('/', 
  middleware.authenticateToken,
  middleware.authorizeRoles('admin', 'manager'),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      
      // Extract filter parameters
      const filters = {
        userId: req.query.userId ? parseInt(req.query.userId) : null,
        action: req.query.action,
        entityType: req.query.entityType,
        entityId: req.query.entityId ? parseInt(req.query.entityId) : null,
        startDate: req.query.startDate ? new Date(req.query.startDate) : null,
        endDate: req.query.endDate ? new Date(req.query.endDate) : null
      };
      
      // Remove null filters
      Object.keys(filters).forEach(key => {
        if (filters[key] === null || filters[key] === undefined) {
          delete filters[key];
        }
      });
      
      const results = await auditService.getLogs(filters, page, limit);
      
      // Log this audit log request (meta!)
      auditService.createLog({
        userId: req.user.id,
        action: 'READ',
        entityType: 'audit_logs',
        details: {
          filters,
          page,
          limit
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }).catch(err => console.error('Meta audit log error:', err));
      
      return res.status(200).json(results);
    } catch (error) {
      console.error('Error retrieving audit logs:', error);
      return res.status(500).json({
        error: 'An error occurred while retrieving audit logs'
      });
    }
  });

// Get audit logs for a specific entity
router.get('/entity/:entityType/:entityId',
  middleware.authenticateToken,
  async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const limit = parseInt(req.query.limit) || 20;
      
      // Non-admins can only see logs for entities they own
      if (req.user.role !== 'admin' && req.user.role !== 'manager') {
        // Check ownership - this depends on your data model
        // This is a simplified version and should be expanded based on your entities
        let isOwner = false;
        
        // If this is a user entity, only allow if it's the user's own logs
        if (entityType === 'user') {
          isOwner = parseInt(entityId) === req.user.id;
        } else {
          // For other entity types, we would check ownership
          // This should be expanded based on your ownership model
          // Could use the checkOwnership middleware here
          
          // For now, we'll just restrict non-admin/manager users to see their own logs
          return res.status(403).json({
            error: 'You do not have permission to view these audit logs'
          });
        }
        
        if (!isOwner) {
          return res.status(403).json({
            error: 'You do not have permission to view these audit logs'
          });
        }
      }
      
      const logs = await auditService.getEntityLogs(
        entityType, 
        parseInt(entityId), 
        limit
      );
      
      // Log this audit log request
      auditService.createLog({
        userId: req.user.id,
        action: 'READ',
        entityType: 'audit_logs',
        details: {
          entity: {
            type: entityType,
            id: entityId
          },
          limit
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }).catch(err => console.error('Entity audit log error:', err));
      
      return res.status(200).json(logs);
    } catch (error) {
      console.error('Error retrieving entity audit logs:', error);
      return res.status(500).json({
        error: 'An error occurred while retrieving audit logs'
      });
    }
  });

// Get my audit logs (logs related to the current user's actions)
router.get('/my-activity',
  middleware.authenticateToken,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      
      const filters = {
        userId: req.user.id,
        startDate: req.query.startDate ? new Date(req.query.startDate) : null,
        endDate: req.query.endDate ? new Date(req.query.endDate) : null
      };
      
      // Remove null filters
      Object.keys(filters).forEach(key => {
        if (filters[key] === null) {
          delete filters[key];
        }
      });
      
      const results = await auditService.getLogs(filters, page, limit);
      
      // Log this audit log request
      auditService.createLog({
        userId: req.user.id,
        action: 'READ',
        entityType: 'audit_logs',
        details: {
          filters,
          page,
          limit
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }).catch(err => console.error('My audit log error:', err));
      
      return res.status(200).json(results);
    } catch (error) {
      console.error('Error retrieving user audit logs:', error);
      return res.status(500).json({
        error: 'An error occurred while retrieving audit logs'
      });
    }
  });

module.exports = router;
