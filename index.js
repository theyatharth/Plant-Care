const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cron = require('node-cron');
const db = require('./configure/dbConfig');

// Config
dotenv.config();

const notificationService = require('./services/notificationService');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // High limit for Base64 images

// Import Routes (CommonJS)
const userRoutes        = require('./routes/userRoutes');
const plantRoutes       = require('./routes/plantRoutes');
const encyclopediaRoutes = require('./routes/encyclopediaRoutes');
const gardenRoutes      = require('./routes/gardenRoutes');

console.log('📋 Loading Discord routes...');
try {
  const discordRoutes = require('./routes/discordRoutes');
  console.log('✅ Discord routes loaded successfully');

  console.log('📋 Registering Discord routes at /api/discord...');
  app.use('/api/discord', discordRoutes);
  console.log('✅ Discord routes registered successfully');
} catch (error) {
  console.error('❌ Error loading Discord routes:', error.message);
  console.error('Stack:', error.stack);
}

// Use Routes
app.use('/api/users',       userRoutes);
app.use('/api/plants',      require('./middleware/languageMiddleware'), plantRoutes);
app.use('/api/encyclopedia', encyclopediaRoutes);
app.use('/api/garden',      gardenRoutes);

// Health Check Routes
const healthCtrl = require('./controllers/healthCtrl');
app.get('/', (req, res) => res.send('🌿 Plant Care API is Running'));
app.get('/health', healthCtrl.healthCheck);
app.get('/diagnostic', healthCtrl.dbDiagnostic);

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Test DB Connection
  db.query('SELECT NOW()', (err, result) => {
    if (result) console.log('✅ Database Connected');
    if (err) console.error('❌ DB connection test failed:', err.message);
  });
});

// ─────────────────────────────────────────────────────────────
// Daily Care Reminder Cron — runs every day at 8:00 AM IST
// IST is UTC+5:30, so 8:00 AM IST = 02:30 UTC
// Cron format: minute hour day-of-month month day-of-week
// ─────────────────────────────────────────────────────────────
cron.schedule('30 2 * * *', async () => {
  console.log('⏰ [Cron] Daily care reminder job fired at', new Date().toISOString());
  try {
    await notificationService.broadcastDueReminders();
  } catch (err) {
    console.error('❌ [Cron] Error in daily reminder job:', err.message);
  }
}, {
  timezone: 'Asia/Kolkata', // Explicit IST timezone for clarity
});

console.log('⏰ Daily care reminder cron scheduled — fires at 8:00 AM IST every day');

