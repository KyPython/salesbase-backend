/**
 * Migration to create the audit_logs table for tracking user actions
 */
exports.up = async (pgm) => {
  // Create enum type for action types
  await pgm.createType('audit_action_type', ['CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'OTHER']);
  
  // Create audit_logs table
  await pgm.createTable('audit_logs', {
    id: { type: 'serial', primaryKey: true },
    user_id: { 
      type: 'integer', 
      references: '"users"', 
      onDelete: 'SET NULL',
      comment: 'The user who performed the action'
    },
    action: { 
      type: 'audit_action_type', 
      notNull: true,
      comment: 'The type of action performed'
    },
    entity_type: {
      type: 'varchar(255)',
      notNull: true,
      comment: 'The type of entity affected (e.g., "user", "lead", "deal", etc.)'
    },
    entity_id: {
      type: 'integer',
      comment: 'The ID of the entity affected'
    },
    details: {
      type: 'jsonb',
      default: '{}',
      comment: 'Additional details about the action (e.g., old and new values)'
    },
    ip_address: {
      type: 'varchar(45)',
      comment: 'IP address of the user'
    },
    user_agent: {
      type: 'text',
      comment: 'User agent of the user'
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
      comment: 'When the action was performed'
    }
  }, {
    comment: 'Tracks all user actions for auditing purposes'
  });
  
  // Create indexes for better query performance
  await pgm.createIndex('audit_logs', 'user_id');
  await pgm.createIndex('audit_logs', 'action');
  await pgm.createIndex('audit_logs', ['entity_type', 'entity_id']);
  await pgm.createIndex('audit_logs', 'created_at');
};

exports.down = async (pgm) => {
  // Drop indexes first
  await pgm.dropIndex('audit_logs', 'user_id');
  await pgm.dropIndex('audit_logs', 'action');
  await pgm.dropIndex('audit_logs', ['entity_type', 'entity_id']);
  await pgm.dropIndex('audit_logs', 'created_at');
  
  // Drop the audit_logs table
  await pgm.dropTable('audit_logs');
  
  // Drop the enum type
  await pgm.dropType('audit_action_type');
};
