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
const userRoutes = require('./routes/userRoutes');
const plantRoutes = require('./routes/plantRoutes');
const encyclopediaRoutes = require('./routes/encyclopediaRoutes');
const gardenRoutes = require('./routes/gardenRoutes');

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
app.use('/api/users', userRoutes);
app.use('/api/plants', require('./middleware/languageMiddleware'), plantRoutes);
app.use('/api/encyclopedia', encyclopediaRoutes);
app.use('/api/garden', gardenRoutes);

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
// Care Reminder Cron — fires every 15 minutes (UTC)
//
// Each run reads the current UTC hour + minute, then calls
// broadcastDueRemindersForTime() which notifies ONLY users whose
// notification_time preference (stored in UTC) matches right now.
//
// 15-minute granularity: fires at :00, :15, :30, :45 of every hour.
// This aligns with the 15-minute interval validation enforced in
// PATCH /api/users/notifications so no user is ever missed.
// ─────────────────────────────────────────────────────────────
cron.schedule('0,15,30,45 * * * *', async () => {
  // 1. Get the current server time
  const now = new Date();

  // 2. Force the time to convert to Indian Standard Time
  const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const istDate = new Date(istString);

  // 3. Extract the exact local hour and minute
  const localHour = istDate.getHours();
  const localMinute = istDate.getMinutes();

  console.log(`⏰ [Cron] 15-min tick at ${String(localHour).padStart(2, '0')}:${String(localMinute).padStart(2, '0')} IST`);

  try {
    // 4. Pass the local time to the database query instead of UTC
    await notificationService.broadcastDueRemindersForTime(localHour, localMinute);
  } catch (err) {
    console.error('❌ [Cron] Error in care reminder job:', err.message);
  }
});

console.log('⏰ Care reminder cron scheduled — fires every 15 minutes, matching each user\'s preferred IST time');