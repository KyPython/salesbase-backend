/**
 * Migration to create permissions and user_permissions tables
 */
exports.up = async (pgm) => {
  // Create permissions table
  await pgm.createTable('permissions', {
    id: { type: 'serial', primaryKey: true },
    permission_name: { 
      type: 'varchar(100)', 
      notNull: true,
      unique: true,
      comment: 'Unique name of the permission'
    },
    description: { 
      type: 'text',
      comment: 'Description of what this permission allows'
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp')
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp')
    }
  }, {
    comment: 'Stores available permissions in the system'
  });
  
  // Create user_permissions table (junction table)
  await pgm.createTable('user_permissions', {
    id: { type: 'serial', primaryKey: true },
    user_id: { 
      type: 'integer', 
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
      comment: 'User ID from users table'
    },
    permission_id: { 
      type: 'integer', 
      notNull: true,
      references: '"permissions"',
      onDelete: 'CASCADE',
      comment: 'Permission ID from permissions table'
    },
    granted_by: { 
      type: 'integer',
      references: '"users"',
      comment: 'User ID of admin who granted this permission'
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp')
    }
  }, {
    comment: 'Associates users with their permissions'
  });
  
  // Add unique constraint to prevent duplicate permissions for a user
  await pgm.createConstraint(
    'user_permissions',
    'user_permissions_user_permission_unique',
    {
      unique: ['user_id', 'permission_id']
    }
  );
  
  // Create indexes
  await pgm.createIndex('user_permissions', 'user_id');
  await pgm.createIndex('user_permissions', 'permission_id');
  
  // Insert default permissions
  await pgm.sql(`
    INSERT INTO permissions (permission_name, description) 
    VALUES 
      ('create:leads', 'Can create new leads'),
      ('read:leads', 'Can view leads'),
      ('update:leads', 'Can update leads'),
      ('delete:leads', 'Can delete leads'),
      ('create:deals', 'Can create new deals'),
      ('read:deals', 'Can view deals'),
      ('update:deals', 'Can update deals'),
      ('delete:deals', 'Can delete deals'),
      ('create:contacts', 'Can create new contacts'),
      ('read:contacts', 'Can view contacts'),
      ('update:contacts', 'Can update contacts'),
      ('delete:contacts', 'Can delete contacts'),
      ('read:audit_logs', 'Can view audit logs'),
      ('read:users', 'Can view user accounts'),
      ('create:users', 'Can create user accounts'),
      ('update:users', 'Can update user accounts'),
      ('delete:users', 'Can delete user accounts'),
      ('assign:permissions', 'Can assign permissions to users'),
      ('export:data', 'Can export data from the system'),
      ('import:data', 'Can import data into the system')
  `);
  
  // Assign default permissions based on roles
  await pgm.sql(`
    -- Get all admin users
    WITH admin_users AS (SELECT id FROM users WHERE role = 'admin')
    
    -- Assign all permissions to admin users
    INSERT INTO user_permissions (user_id, permission_id)
    SELECT au.id, p.id
    FROM admin_users au
    CROSS JOIN permissions p;
    
    -- Get all manager users
    WITH manager_users AS (SELECT id FROM users WHERE role = 'manager')
    
    -- Assign manager-level permissions
    INSERT INTO user_permissions (user_id, permission_id)
    SELECT mu.id, p.id
    FROM manager_users mu
    CROSS JOIN permissions p
    WHERE p.permission_name NOT IN ('delete:users', 'assign:permissions');
    
    -- Get all sales users
    WITH sales_users AS (SELECT id FROM users WHERE role = 'sales')
    
    -- Assign sales-level permissions
    INSERT INTO user_permissions (user_id, permission_id)
    SELECT su.id, p.id
    FROM sales_users su
    CROSS JOIN permissions p
    WHERE p.permission_name IN (
      'create:leads', 'read:leads', 'update:leads',
      'create:deals', 'read:deals', 'update:deals',
      'create:contacts', 'read:contacts', 'update:contacts',
      'export:data'
    );
  `);
};

exports.down = async (pgm) => {
  // Drop tables and indexes
  await pgm.dropTable('user_permissions');
  await pgm.dropTable('permissions');
};
