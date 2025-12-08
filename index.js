const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Config
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // High limit for Base64 images

// Import Routes
const userRoutes = require('./routes/userRoutes');
const plantRoutes = require('./routes/plantRoutes');
const encyclopediaRoutes = require('./routes/encyclopediaRoutes');

// Use Routes
app.use('/api/users', userRoutes);
app.use('/api/plants', plantRoutes);
app.use('/api/encyclopedia', encyclopediaRoutes);

// Health Check Routes
const healthCtrl = require('./controllers/healthCtrl');
app.get('/', (req, res) => {
  res.send('🌿 Plant Care API is Running');
});
app.get('/health', healthCtrl.healthCheck);
app.get('/diagnostic', healthCtrl.dbDiagnostic);

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Test DB Connection
  const db = require('./configure/dbConfig');
  db.query('SELECT NOW()', (err, res) => {
    if (res) console.log('✅ Database Connected');
  });
});