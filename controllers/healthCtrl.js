const db = require('../configure/dbConfig');

// Health check endpoint
exports.healthCheck = async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    checks: {}
  };

  // Check database connection
  try {
    const result = await db.query('SELECT NOW() as time, version() as version');
    health.checks.database = {
      status: 'connected',
      time: result.rows[0].time,
      version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]
    };
  } catch (error) {
    health.status = 'error';
    health.checks.database = {
      status: 'disconnected',
      error: error.message
    };
  }

  // Check if tables exist
  try {
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    health.checks.tables = {
      status: 'ok',
      count: tables.rows.length,
      tables: tables.rows.map(t => t.table_name)
    };
  } catch (error) {
    health.checks.tables = {
      status: 'error',
      error: error.message
    };
  }

  // Check environment variables
  health.checks.environment = {
    hasDbConfig: !!(process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER),
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasAwsKeys: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
    dbHost: process.env.DB_HOST ? process.env.DB_HOST.substring(0, 20) + '...' : 'missing',
    dbName: process.env.DB_NAME || 'missing'
  };

  const statusCode = health.status === 'ok' ? 200 : 500;
  res.status(statusCode).json(health);
};

// Database diagnostic endpoint
exports.dbDiagnostic = async (req, res) => {
  const diagnostic = {
    timestamp: new Date().toISOString(),
    tests: {}
  };

  // Test 1: Connection
  try {
    await db.query('SELECT 1');
    diagnostic.tests.connection = { status: 'pass' };
  } catch (error) {
    diagnostic.tests.connection = { status: 'fail', error: error.message };
  }

  // Test 2: Users table
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM users');
    diagnostic.tests.usersTable = {
      status: 'pass',
      userCount: parseInt(result.rows[0].count)
    };
  } catch (error) {
    diagnostic.tests.usersTable = { status: 'fail', error: error.message };
  }

  // Test 3: Plant species table
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM plant_species');
    diagnostic.tests.plantSpeciesTable = {
      status: 'pass',
      speciesCount: parseInt(result.rows[0].count)
    };
  } catch (error) {
    diagnostic.tests.plantSpeciesTable = { status: 'fail', error: error.message };
  }

  // Test 4: Scans table
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM scans');
    diagnostic.tests.scansTable = {
      status: 'pass',
      scanCount: parseInt(result.rows[0].count)
    };
  } catch (error) {
    diagnostic.tests.scansTable = { status: 'fail', error: error.message };
  }

  // Test 5: UUID extension
  try {
    await db.query("SELECT uuid_generate_v4()");
    diagnostic.tests.uuidExtension = { status: 'pass' };
  } catch (error) {
    diagnostic.tests.uuidExtension = { status: 'fail', error: error.message };
  }

  res.json(diagnostic);
};
