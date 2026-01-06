// Database Migration Script for Discord Integration
// Run this to update your database schema for Discord user integration
// Usage: node database/migrate_discord_integration.js

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  console.log('🚀 Starting Discord Integration Database Migration...\n');

  try {
    // Read the SQL migration file
    const sqlFile = path.join(__dirname, 'add_discord_integration.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('📄 Executing migration SQL...');

    // Execute the migration
    await pool.query(sql);

    console.log('✅ Migration completed successfully!\n');

    // Verify the changes
    console.log('🔍 Verifying migration...');

    // Check if new columns exist
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name LIKE 'discord_%'
      ORDER BY column_name;
    `);

    console.log('New Discord columns in users table:');
    columnsResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });

    // Check if new table exists
    const tableResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'discord_auth_states';
    `);

    if (tableResult.rows.length > 0) {
      console.log('✅ discord_auth_states table created successfully');

      // Check table structure
      const structureResult = await pool.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'discord_auth_states'
        ORDER BY ordinal_position;
      `);

      console.log('discord_auth_states table structure:');
      structureResult.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
      });
    } else {
      console.log('❌ discord_auth_states table not found');
    }

    // Check indexes
    const indexResult = await pool.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE tablename IN ('users', 'discord_auth_states')
      AND indexname LIKE '%discord%'
      ORDER BY tablename, indexname;
    `);

    console.log('Discord-related indexes:');
    indexResult.rows.forEach(row => {
      console.log(`  - ${row.tablename}.${row.indexname}`);
    });

    // Check existing users count
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log(`\n📊 Total users in database: ${usersResult.rows[0].count}`);

    // Check Discord connection status
    const discordUsersResult = await pool.query('SELECT COUNT(*) as count FROM users WHERE discord_connected = TRUE');
    console.log(`🔗 Users connected to Discord: ${discordUsersResult.rows[0].count}`);

    console.log('\n🎉 Migration verification completed!');
    console.log('\n📋 Next Steps:');
    console.log('1. Set up Discord Bot Application at https://discord.com/developers/applications');
    console.log('2. Update your .env file with Discord bot credentials');
    console.log('3. Configure Discord server and channels');
    console.log('4. Test Discord integration: node test_discord_user_integration.js');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('1. Check your database connection settings in .env');
    console.error('2. Make sure PostgreSQL is running');
    console.error('3. Verify database credentials and permissions');
    console.error('\nFull error:', error);
  } finally {
    await pool.end();
  }
}

// Run the migration
runMigration();