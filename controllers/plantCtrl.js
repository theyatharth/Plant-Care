const db = require('../configure/dbConfig');
const bedrockService = require('../services/bedrockService');
const s3Service = require('../services/s3Service');

const discordUserService = require('../services/discordUserService');

// 1. Handle Scan Request
exports.scanPlant = async (req, res) => {
  const { image } = req.body;
  const userId = req.user.userId; // From JWT token

  console.log('📸 Scan request received for user:', userId);

  if (!image) {
    return res.status(400).json({ error: "Image required" });
  }

  let client;

  try {
    // Step A: Get Intelligence from Bedrock Service
    console.log('🤖 Calling Bedrock AI service...');
    const aiResult = await bedrockService.analyzeImage(image);
    console.log('✅ AI Analysis complete:', aiResult.plant_name);

    // Get database connection
    client = await db.connect();
    await client.query('BEGIN');
    console.log('📊 Database transaction started');

    // Step B: Update Encyclopedia (Plant Species Table)
    const speciesQuery = `
      INSERT INTO plant_species (scientific_name, common_name, description, care_guide)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (scientific_name) DO UPDATE SET 
        common_name = EXCLUDED.common_name,
        description = EXCLUDED.description,
        care_guide = EXCLUDED.care_guide
      RETURNING id;
    `;
    const speciesRes = await client.query(speciesQuery, [
      aiResult.scientific_name,
      aiResult.plant_name,
      aiResult.description,
      aiResult.care_guide
    ]);
    const speciesId = speciesRes.rows[0].id;
    console.log('🌿 Plant species saved/updated:', speciesId);

    // Step C: Upload image to S3
    console.log('📤 Uploading image to S3...');
    const imageUrl = await s3Service.uploadImage(image, userId);
    console.log('✅ Image uploaded:', imageUrl);

    // Step D: Log the Scan (Scans Table)
    const scanQuery = `
      INSERT INTO scans (user_id, plant_id, image_url, ai_raw_response, is_healthy, disease_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at;
    `;

    const scanRes = await client.query(scanQuery, [
      userId,
      null, // plant_id is null (not linked to user's garden yet)
      imageUrl,
      JSON.stringify(aiResult), // Ensure it's stringified
      aiResult.health_status.toLowerCase() === 'healthy',
      aiResult.disease_name || 'None'
    ]);

    await client.query('COMMIT');
    console.log('✅ Scan saved to database:', scanRes.rows[0].id);

    res.status(200).json({
      success: true,
      scanId: scanRes.rows[0].id,
      speciesId: speciesId,
      result: aiResult,
      savedAt: scanRes.rows[0].created_at
    });

  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
      console.log('⚠️ Database transaction rolled back');
    }
    console.error("❌ Scan Controller Error:", error.message);
    console.error("Error stack:", error.stack);
    res.status(500).json({ error: error.message });
  } finally {
    if (client) {
      client.release();
      console.log('🔌 Database connection released');
    }
  }
};

// 2. Get User History
exports.getHistory = async (req, res) => {
  try {
    const userId = req.user.userId; // From JWT token

    console.log('📜 Fetching scan history for user:', userId);

    const query = `
      SELECT 
        s.id, 
        s.created_at, 
        s.disease_name, 
        s.is_healthy, 
        s.image_url,
        s.ai_raw_response,
        s.plant_id
      FROM scans s
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
    `;
    const result = await db.query(query, [userId]);

    console.log(`✅ Found ${result.rows.length} scans for user`);

    // Format the response to include parsed plant info
    const formattedScans = result.rows.map(scan => ({
      id: scan.id,
      createdAt: scan.created_at,
      isHealthy: scan.is_healthy,
      diseaseName: scan.disease_name,
      imageUrl: scan.image_url,
      plantName: scan.ai_raw_response?.plant_name || 'Unknown',
      scientificName: scan.ai_raw_response?.scientific_name || 'Unknown',
      healthStatus: scan.ai_raw_response?.health_status || 'Unknown',
      confidence: scan.ai_raw_response?.confidence || 0,
      fullResponse: scan.ai_raw_response
    }));

    res.json({
      success: true,
      count: formattedScans.length,
      scans: formattedScans
    });
  } catch (error) {
    console.error('❌ Get History Error:', error.message);
    res.status(500).json({ error: "Failed to fetch history" });
  }
};

// 3. Get Single Scan Details
exports.getScanById = async (req, res) => {
  try {
    const { scanId } = req.params;
    const userId = req.user.userId;

    const query = `
      SELECT s.*
      FROM scans s
      WHERE s.id = $1 AND s.user_id = $2
    `;
    const result = await db.query(query, [scanId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    res.json({ scan: result.rows[0] });
  } catch (error) {
    console.error('Get Scan Error:', error);
    res.status(500).json({ error: 'Failed to fetch scan details' });
  }
};

// 4. Share Scan to Discord Community (Updated for User Authentication)
exports.shareToDiscord = async (req, res) => {
  console.log('🔗 Discord share request received');
  console.log('Request body:', req.body);
  console.log('User:', req.user);

  const { scanId, message } = req.body;
  const userId = req.user.userId;

  console.log('🔗 Discord share request for scan:', scanId, 'by user:', userId);

  if (!scanId) {
    console.log('❌ No scan ID provided');
    return res.status(400).json({ error: "Scan ID required" });
  }

  let client;

  try {
    console.log('📊 Getting database connection...');
    client = await db.connect();
    console.log('✅ Database connected');

    // Check if user has Discord account linked
    console.log('🔍 Checking Discord connection status...');
    const discordStatus = await discordUserService.checkDiscordConnection(userId);

    if (!discordStatus.connected) {
      console.log('❌ User not connected to Discord');

      // Generate Discord auth URL
      const authData = await discordUserService.initiateDiscordAuth(userId);

      return res.json({
        success: false,
        requiresDiscordAuth: true,
        authUrl: authData.authUrl,
        message: 'Please connect your Discord account to share with the community',
        stateToken: authData.stateToken
      });
    }

    console.log('✅ User connected to Discord:', discordStatus.discordUsername);

    console.log('🔍 Querying scan data...');
    const scanQuery = `
      SELECT s.*, u.name, u.email 
      FROM scans s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = $1 AND s.user_id = $2
    `;
    const scanResult = await client.query(scanQuery, [scanId, userId]);
    console.log('📊 Query result rows:', scanResult.rows.length);

    if (scanResult.rows.length === 0) {
      console.log('❌ No scan found for ID:', scanId, 'and user:', userId);
      return res.status(404).json({ error: 'Scan not found' });
    }

    const scanData = scanResult.rows[0];
    console.log('✅ Scan found:', scanData.ai_raw_response?.plant_name);

    console.log('📝 Formatting scan data...');
    // Format scan data for Discord
    const formattedScanData = {
      id: scanData.id,
      plantName: scanData.ai_raw_response?.plant_name || 'Unknown Plant',
      scientificName: scanData.ai_raw_response?.scientific_name || 'Unknown Species',
      healthStatus: scanData.ai_raw_response?.health_status || 'Unknown',
      isHealthy: scanData.is_healthy,
      diseaseName: scanData.disease_name,
      confidence: scanData.ai_raw_response?.confidence || 0,
      imageUrl: scanData.image_url,
      fullResponse: scanData.ai_raw_response,
      createdAt: scanData.created_at
    };

    console.log('✅ Data formatted - Plant:', formattedScanData.plantName, 'Health:', formattedScanData.healthStatus);

    // Post to Discord as the user
    console.log('📤 Posting to Discord as user...');
    const discordResult = await discordUserService.postAsUser(userId, formattedScanData, message);
    console.log('✅ Discord post completed:', discordResult);

    console.log('📤 Sending success response...');
    res.json({
      success: true,
      message: 'Successfully shared to Discord community!',
      discord: {
        messageId: discordResult.messageId,
        messageUrl: discordResult.messageUrl,
        channelId: discordResult.channelId
      },
      scanData: {
        plantName: formattedScanData.plantName,
        healthStatus: formattedScanData.healthStatus,
        isHealthy: formattedScanData.isHealthy
      },
      discordUser: discordStatus.discordUsername
    });
    console.log('✅ Response sent successfully');

  } catch (error) {
    console.error('❌ Discord Share Error Details:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);

    if (error.code) {
      console.error('Error code:', error.code);
    }

    // Handle specific Discord errors
    if (error.message.includes('Discord token expired')) {
      return res.status(401).json({
        error: 'Discord authentication expired',
        requiresReauth: true,
        message: 'Please reconnect your Discord account'
      });
    }

    res.status(500).json({
      error: 'Failed to share to Discord community',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (client) {
      client.release();
      console.log('🔌 Database connection released');
    }
  }
};