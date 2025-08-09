/**
 * Multi-Tenant Middleware and Services
 * 
 * Implements tenant isolation and management for the SalesBase application.
 * This allows hosting multiple customers on the same infrastructure while
 * keeping their data separate.
 */
const pool = require('../database');

/**
 * Tenant service for managing tenants in the system
 */
class TenantService {
  /**
   * Create a new tenant
   * 
   * @param {Object} tenantData - Tenant information
   * @param {string} tenantData.name - Name of the tenant/organization
   * @param {string} tenantData.subdomain - Subdomain for the tenant
   * @param {string} tenantData.tier - Service tier (basic, standard, premium)
   * @param {Object} [tenantData.settings] - Tenant-specific settings
   * @returns {Promise<Object>} - The created tenant
   */
  async createTenant(tenantData) {
    const client = await pool.connect();
    try {
      // Start transaction
      await client.query('BEGIN');
      
      // Create tenant record
      const tenantResult = await client.query(
        `INSERT INTO tenants (name, subdomain, tier, settings, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING *`,
        [
          tenantData.name,
          tenantData.subdomain,
          tenantData.tier || 'basic',
          JSON.stringify(tenantData.settings || {})
        ]
      );
      
      const tenant = tenantResult.rows[0];
      
      // Create schema for tenant if using schema-based isolation
      await client.query(`CREATE SCHEMA IF NOT EXISTS tenant_${tenant.id}`);
      
      // Commit transaction
      await client.query('COMMIT');
      
      return tenant;
    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error('Error creating tenant:', error);
      throw error;
    } finally {
      // Release client back to pool
      client.release();
    }
  }
  
  /**
   * Get a tenant by ID
   * 
   * @param {number} id - Tenant ID
   * @returns {Promise<Object>} - Tenant information
   */
  async getTenantById(id) {
    const result = await pool.query(
      'SELECT * FROM tenants WHERE id = $1',
      [id]
    );
    
    return result.rows[0] || null;
  }
  
  /**
   * Get a tenant by subdomain
   * 
   * @param {string} subdomain - Tenant subdomain
   * @returns {Promise<Object>} - Tenant information
   */
  async getTenantBySubdomain(subdomain) {
    const result = await pool.query(
      'SELECT * FROM tenants WHERE subdomain = $1',
      [subdomain]
    );
    
    return result.rows[0] || null;
  }
  
  /**
   * Update a tenant's information
   * 
   * @param {number} id - Tenant ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} - Updated tenant information
   */
  async updateTenant(id, updateData) {
    // Build dynamic query based on provided fields
    const updateFields = [];
    const queryParams = [id];
    let paramIndex = 2;
    
    if (updateData.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      queryParams.push(updateData.name);
    }
    
    if (updateData.subdomain !== undefined) {
      updateFields.push(`subdomain = $${paramIndex++}`);
      queryParams.push(updateData.subdomain);
    }
    
    if (updateData.tier !== undefined) {
      updateFields.push(`tier = $${paramIndex++}`);
      queryParams.push(updateData.tier);
    }
    
    if (updateData.settings !== undefined) {
      updateFields.push(`settings = $${paramIndex++}`);
      queryParams.push(JSON.stringify(updateData.settings));
    }
    
    if (updateData.isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      queryParams.push(updateData.isActive);
    }
    
    // Add updated_at timestamp
    updateFields.push(`updated_at = NOW()`);
    
    if (updateFields.length === 0) {
      throw new Error('No fields provided for update');
    }
    
    const query = `
      UPDATE tenants
      SET ${updateFields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, queryParams);
    
    return result.rows[0];
  }
  
  /**
   * Get all tenants with optional filtering and pagination
   * 
   * @param {Object} options - Query options
   * @param {boolean} [options.includeInactive=false] - Whether to include inactive tenants
   * @param {string} [options.tier] - Filter by tier
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=20] - Results per page
   * @returns {Promise<Object>} - Tenants and pagination info
   */
  async getTenants(options = {}) {
    const {
      includeInactive = false,
      tier,
      page = 1,
      limit = 20
    } = options;
    
    const offset = (page - 1) * limit;
    const queryParams = [];
    let paramCount = 1;
    let whereClause = '';
    
    // Build WHERE clause
    const conditions = [];
    
    if (!includeInactive) {
      conditions.push(`is_active = true`);
    }
    
    if (tier) {
      conditions.push(`tier = $${paramCount++}`);
      queryParams.push(tier);
    }
    
    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }
    
    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM tenants ${whereClause}`,
      queryParams
    );
    
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);
    
    // Main query with pagination
    const query = `
      SELECT * FROM tenants
      ${whereClause}
      ORDER BY name
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await pool.query(query, queryParams);
    
    return {
      tenants: result.rows,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: totalPages
      }
    };
  }
}

/**
 * Middleware to identify and set tenant context
 */
const tenantIdentification = () => {
  return async (req, res, next) => {
    try {
      // Ways to identify tenant:
      // 1. From subdomain (e.g., tenant1.salesbase.com)
      // 2. From request header (X-Tenant-ID)
      // 3. From authenticated user's tenant association
      
      // Try to get tenant ID from header
      const tenantHeader = req.headers['x-tenant-id'];
      
      if (tenantHeader) {
        const tenantId = parseInt(tenantHeader, 10);
        if (!isNaN(tenantId)) {
          // Get tenant from database
          const tenantService = new TenantService();
          const tenant = await tenantService.getTenantById(tenantId);
          
          if (tenant && tenant.is_active) {
            req.tenant = tenant;
            next();
            return;
          }
        }
      }
      
      // Try to get tenant from subdomain
      const host = req.hostname || '';
      const subdomainMatch = host.match(/^([^.]+)\./);
      
      if (subdomainMatch) {
        const subdomain = subdomainMatch[1];
        // Skip common subdomains like 'www'
        if (subdomain !== 'www' && subdomain !== 'api') {
          const tenantService = new TenantService();
          const tenant = await tenantService.getTenantBySubdomain(subdomain);
          
          if (tenant && tenant.is_active) {
            req.tenant = tenant;
            next();
            return;
          }
        }
      }
      
      // Try to get tenant from authenticated user
      if (req.user && req.user.tenant_id) {
        const tenantService = new TenantService();
        const tenant = await tenantService.getTenantById(req.user.tenant_id);
        
        if (tenant && tenant.is_active) {
          req.tenant = tenant;
          next();
          return;
        }
      }
      
      // For paths that don't require tenant context
      const publicPaths = [
        '/health',
        '/api/auth/login',
        '/api/auth/register',
        '/api/tenants'  // For multi-tenant management
      ];
      
      if (publicPaths.some(path => req.path.startsWith(path))) {
        next();
        return;
      }
      
      // Tenant identification failed
      res.status(400).json({
        error: 'Tenant identification failed',
        message: 'Unable to determine tenant context'
      });
    } catch (error) {
      console.error('Tenant identification error:', error);
      next(error);
    }
  };
};

/**
 * Middleware to ensure tenant data isolation
 */
const tenantIsolation = () => {
  return (req, res, next) => {
    // If we have tenant context, add it to any database queries
    if (req.tenant) {
      // This is where we would typically apply tenant context
      // to database operations, typically by:
      // 1. Setting a session variable in PostgreSQL
      // 2. Adding tenant_id to all queries
      // 3. Using schema isolation
      
      // Method depends on isolation strategy
      const originalQuery = pool.query;
      
      // Override query method to add tenant filtering
      pool.query = function(text, params) {
        // For schema isolation:
        // text = text.replace(/FROM\s+([^\s,)]+)/gi, 
        //   `FROM tenant_${req.tenant.id}.$1`);
        
        // For row-level isolation, modify WHERE clause
        // This is simplified and would need more robust SQL parsing in production
        if (text.includes('WHERE')) {
          text = text.replace(
            /WHERE/i,
            `WHERE tenant_id = ${req.tenant.id} AND`
          );
        } else if (
          text.toUpperCase().includes('SELECT') && 
          !text.toUpperCase().includes('INSERT') &&
          !text.toUpperCase().includes('CREATE') &&
          !text.toUpperCase().includes('DROP')
        ) {
          // Add WHERE for SELECT statements without one
          text = `${text} WHERE tenant_id = ${req.tenant.id}`;
        }
        
        // For INSERT statements, add tenant_id
        if (text.toUpperCase().includes('INSERT INTO')) {
          // This is simplified and would need more robust SQL parsing
          const insertMatch = text.match(/INSERT INTO\s+([^\s(]+)\s*\(([^)]+)\)/i);
          if (insertMatch) {
            const table = insertMatch[1];
            let columns = insertMatch[2];
            
            // Add tenant_id to column list if not present
            if (!columns.includes('tenant_id')) {
              text = text.replace(
                /INSERT INTO\s+([^\s(]+)\s*\(([^)]+)\)/i,
                `INSERT INTO $1 ($2, tenant_id)`
              );
              
              // Add tenant_id value to VALUES
              text = text.replace(
                /VALUES\s*\(([^)]+)\)/i,
                `VALUES ($1, ${req.tenant.id})`
              );
            }
          }
        }
        
        return originalQuery.call(this, text, params);
      };
      
      // Restore original query method after the request
      res.on('finish', () => {
        pool.query = originalQuery;
      });
    }
    
    next();
  };
};

/**
 * Create migration for multi-tenant architecture
 */
const createMigration = async () => {
  const migration = `
    -- Create tenants table
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      subdomain VARCHAR(100) NOT NULL UNIQUE,
      tier VARCHAR(50) NOT NULL DEFAULT 'basic',
      settings JSONB DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Create index for subdomain lookup
    CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);
    
    -- Add tenant_id to all relevant tables
    DO $$
    DECLARE
      table_name text;
    BEGIN
      -- Add tenant_id to users table
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'tenant_id'
      ) THEN
        ALTER TABLE users ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
        CREATE INDEX idx_users_tenant ON users(tenant_id);
      END IF;
      
      -- Add tenant_id to other tables
      FOR table_name IN 
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND 
              table_name NOT IN ('tenants', 'migrations')
      LOOP
        EXECUTE format(
          'ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
           CREATE INDEX IF NOT EXISTS idx_%s_tenant ON %I(tenant_id);',
          table_name,
          table_name,
          table_name
        );
      END LOOP;
    END;
    $$;
    
    -- Create default tenant
    INSERT INTO tenants (name, subdomain, tier)
    VALUES ('Default Tenant', 'default', 'premium')
    ON CONFLICT (subdomain) DO NOTHING;
  `;
  
  return migration;
};

module.exports = {
  TenantService,
  tenantIdentification,
  tenantIsolation,
  createMigration
};
