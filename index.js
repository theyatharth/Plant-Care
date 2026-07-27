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
const appVersionRoutes  = require('./routes/appVersionRoutes');
const healthRoutes      = require('./routes/healthRoutes');

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
app.use('/api/app/version', appVersionRoutes);  // App version check & update
app.use('/api/health',      healthRoutes);       // Health / liveness check

// Root ping (kept for backwards compatibility)
app.get('/', (req, res) => res.send('🌿 Plant Care API is Running'));

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
// Care Reminder Cron — fires every 15 minutes
//
// notification_time is stored in the DB as UTC (converted from IST
// when the user saves their preference). So we must compare against
// the current UTC hour + minute — NOT the local/IST time.
//
// 15-minute granularity: fires at :00, :15, :30, :45 of every hour.
// This aligns with the 15-minute interval validation enforced in
// PATCH /api/users/notifications so no user is ever missed.
// ─────────────────────────────────────────────────────────────
cron.schedule('0,15,30,45 * * * *', async () => {
  const now = new Date();

  // notification_time is stored as UTC → always compare in UTC
  const utcHour   = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();

  console.log(`⏰ [Cron] 15-min tick at ${String(utcHour).padStart(2, '0')}:${String(utcMinute).padStart(2, '0')} UTC`);

  try {
    await notificationService.broadcastDueRemindersForTime(utcHour, utcMinute);
  } catch (err) {
    console.error('❌ [Cron] Error in care reminder job:', err.message);
  }
});

console.log('⏰ Care reminder cron scheduled — fires every 15 minutes, matching each user\'s preferred notification time (UTC)');