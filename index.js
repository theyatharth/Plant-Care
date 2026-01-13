const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./configure/dbConfig');

// Config
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // High limit for Base64 images

// Import Routes (CommonJS)
const userRoutes = require('./routes/userRoutes');
const plantRoutes = require('./routes/plantRoutes');
const encyclopediaRoutes = require('./routes/encyclopediaRoutes');

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
app.use('/api/plants', plantRoutes);
app.use('/api/encyclopedia', encyclopediaRoutes);

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
