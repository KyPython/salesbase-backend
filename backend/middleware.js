
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./database.js');
const auditService = require('./services/auditService');

// Hash password
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

// Compare password
const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

// Auth middleware - verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user details from database including permissions
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.is_active,
       ARRAY_AGG(p.permission_name) as permissions
       FROM users u
       LEFT JOIN user_permissions up ON u.id = up.user_id
       LEFT JOIN permissions p ON up.permission_id = p.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid token. User not found.' 
      });
    }

    const user = userResult.rows[0];
    
    if (!user.is_active) {
      return res.status(401).json({ 
        error: 'Account is deactivated.' 
      });
    }

    req.user = user;
    
    // Log successful authentication
    auditService.createLog({
      userId: user.id,
      action: 'READ',
      entityType: 'authentication',
      details: { message: 'User authenticated successfully' },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }).catch(err => console.error('Auth audit log error:', err));
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(403).json({ 
      error: 'Invalid or expired token.' 
    });
  }
};

// Role-based authorization
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required.' 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      // Log failed authorization attempt
      auditService.createLog({
        userId: req.user.id,
        action: 'OTHER',
        entityType: 'authorization',
        details: { 
          message: 'Insufficient role permissions',
          requiredRoles: allowedRoles,
          userRole: req.user.role,
          endpoint: req.originalUrl,
          method: req.method
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }).catch(err => console.error('Role auth audit log error:', err));
      
      return res.status(403).json({ 
        error: 'Insufficient role permissions.' 
      });
    }

    next();
  };
};

// Permission-based authorization
const authorizePermissions = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required.' 
      });
    }

    // Admin role bypasses permission checks
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Check if user has all required permissions
    const userPermissions = req.user.permissions || [];
    const hasAllPermissions = requiredPermissions.every(
      permission => userPermissions.includes(permission)
    );
    
    if (!hasAllPermissions) {
      // Log failed permission attempt
      auditService.createLog({
        userId: req.user.id,
        action: 'OTHER',
        entityType: 'authorization',
        details: { 
          message: 'Insufficient specific permissions',
          requiredPermissions: requiredPermissions,
          userPermissions: userPermissions,
          endpoint: req.originalUrl,
          method: req.method
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }).catch(err => console.error('Permission auth audit log error:', err));
      
      return res.status(403).json({ 
        error: 'Insufficient permissions.' 
      });
    }

    next();
  };
};

// Ownership check - verify user can only access their own resources
const checkOwnership = (entityType, idParamName = 'id') => {
  return async (req, res, next) => {
    try {
      const entityId = req.params[idParamName];
      
      if (!entityId) {
        return res.status(400).json({ 
          error: `Missing ${idParamName} parameter.` 
        });
      }
      
      // Admin and manager roles bypass ownership checks
      if (['admin', 'manager'].includes(req.user.role)) {
        return next();
      }
      
      let query;
      let params = [entityId];
      
      switch (entityType) {
        case 'lead':
          query = 'SELECT assigned_to FROM leads WHERE id = $1';
          break;
        case 'deal':
          query = 'SELECT assigned_to FROM deals WHERE id = $1';
          break;
        case 'customer':
          query = 'SELECT assigned_to FROM customers WHERE id = $1';
          break;
        case 'contact':
          query = 'SELECT owner_id FROM contacts WHERE id = $1';
          break;
        default:
          return res.status(500).json({
            error: 'Invalid entity type for ownership check.'
          });
      }
      
      const result = await pool.query(query, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: `${entityType} not found.`
        });
      }
      
      const ownerId = result.rows[0].assigned_to || result.rows[0].owner_id;
      
      if (ownerId !== req.user.id) {
        // Log ownership check failure
        auditService.createLog({
          userId: req.user.id,
          action: 'OTHER',
          entityType: 'authorization',
          details: { 
            message: 'Failed ownership check',
            entityType,
            entityId,
            ownerId,
            userId: req.user.id,
            endpoint: req.originalUrl,
            method: req.method
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }).catch(err => console.error('Ownership check audit log error:', err));
        
        return res.status(403).json({
          error: `You don't have permission to access this ${entityType}.`
        });
      }
      
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({
        error: 'Error checking resource ownership.'
      });
    }
  };
};

// Audit logging middleware
const auditLog = (action, entityType) => {
  return async (req, res, next) => {
    // Store original send method
    const originalSend = res.send;
    
    // Override send method
    res.send = function(data) {
      // Parse data if it's a string (JSON)
      let parsedData;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          parsedData = data;
        }
      } else {
        parsedData = data;
      }
      
      // Log successful operations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId = req.params.id || 
                        (parsedData && parsedData.id ? parsedData.id : null);
                        
        // Create audit log using the service
        auditService.createLog({
          userId: req.user?.id,
          action: action,
          entityType: entityType,
          entityId: entityId,
          details: {
            requestBody: req.body,
            responseData: parsedData,
            endpoint: req.originalUrl,
            method: req.method
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }).catch(err => console.error('Audit middleware log error:', err));
      }
      
      // Call the original send
      return originalSend.call(this, data);
    };
    
    next();
  };
};

// Export all middleware functions
module.exports = {
  hashPassword,
  comparePassword,
  authenticateToken,
  authorizeRoles,
  authorizePermissions,
  checkOwnership,
  auditLog
};