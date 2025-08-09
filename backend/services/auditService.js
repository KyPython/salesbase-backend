/**
 * Audit Logging Service
 * 
 * This service handles recording user actions for audit purposes.
 */
const db = require('./database'); // or '../database.js' if needed

/**
 * Creates an audit log entry
 * 
 * @param {Object} data - Audit log data
 * @param {number} data.userId - ID of the user performing the action
 * @param {string} data.action - Type of action (CREATE, READ, UPDATE, DELETE, LOGIN, LOGOUT, OTHER)
 * @param {string} data.entityType - Type of entity being affected (user, lead, deal, etc.)
 * @param {number} [data.entityId] - ID of the entity being affected
 * @param {Object} [data.details] - Additional details about the action
 * @param {string} [data.ipAddress] - IP address of the user
 * @param {string} [data.userAgent] - User agent of the user
 * @returns {Promise<Object>} The created audit log entry
 */
const createLog = async ({
  userId,
  action,
  entityType,
  entityId = null,
  details = {},
  ipAddress = null,
  userAgent = null
}) => {
  try {
    const result = await db.query(
      `INSERT INTO audit_logs 
       (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, action, entityType, entityId, details, ipAddress, userAgent]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('Error creating audit log:', error);
    // Don't throw the error - audit logging should not break the main application flow
    return null;
  }
};

/**
 * Retrieves audit logs with optional filtering
 * 
 * @param {Object} filters - Filter criteria
 * @param {number} [filters.userId] - Filter by user ID
 * @param {string} [filters.action] - Filter by action type
 * @param {string} [filters.entityType] - Filter by entity type
 * @param {number} [filters.entityId] - Filter by entity ID
 * @param {Date} [filters.startDate] - Filter by start date
 * @param {Date} [filters.endDate] - Filter by end date
 * @param {number} [page=1] - Page number for pagination
 * @param {number} [limit=20] - Number of records per page
 * @returns {Promise<Object>} Paginated audit logs and metadata
 */
const getLogs = async (filters = {}, page = 1, limit = 20) => {
  try {
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const queryParams = [];
    let paramCount = 1;
    
    if (filters.userId) {
      query += ` AND user_id = $${paramCount++}`;
      queryParams.push(filters.userId);
    }
    
    if (filters.action) {
      query += ` AND action = $${paramCount++}`;
      queryParams.push(filters.action);
    }
    
    if (filters.entityType) {
      query += ` AND entity_type = $${paramCount++}`;
      queryParams.push(filters.entityType);
    }
    
    if (filters.entityId) {
      query += ` AND entity_id = $${paramCount++}`;
      queryParams.push(filters.entityId);
    }
    
    if (filters.startDate) {
      query += ` AND created_at >= $${paramCount++}`;
      queryParams.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ` AND created_at <= $${paramCount++}`;
      queryParams.push(filters.endDate);
    }
    
    // Count query for pagination
    const countResult = await db.query(
      `SELECT COUNT(*) FROM (${query}) as count_query`,
      queryParams
    );
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Add pagination
    query += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    queryParams.push(limit, offset);
    
    const result = await db.query(query, queryParams);
    
    return {
      logs: result.rows,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit)
      }
    };
  } catch (error) {
    console.error('Error retrieving audit logs:', error);
    throw error;
  }
};

/**
 * Get audit logs for a specific entity
 * 
 * @param {string} entityType - Type of entity
 * @param {number} entityId - ID of the entity
 * @param {number} [limit=20] - Number of records to return
 * @returns {Promise<Array>} Audit logs for the entity
 */
const getEntityLogs = async (entityType, entityId, limit = 20) => {
  try {
    const result = await db.query(
      `SELECT * FROM audit_logs
       WHERE entity_type = $1 AND entity_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [entityType, entityId, limit]
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error retrieving entity audit logs:', error);
    throw error;
  }
};

module.exports = {
  createLog,
  getLogs,
  getEntityLogs
};
