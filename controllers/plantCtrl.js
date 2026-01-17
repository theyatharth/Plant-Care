const { identifyPlantWithPlantNet } = require('../services/plantNetService');
const { normalizePlantNetResult } = require('../utils/plantNetNormalizer');
const { enrichPlantData } = require('../services/plantEnrichmentService');
const axios = require('axios');

const db = require('../configure/dbConfig');
const bedrockService = require('../services/bedrockService');
const s3Service = require('../services/s3Service');
const { applyPlantGuardrails } = require('../services/plantGuardrails');

const discordUserService = require('../services/discordUserService');


// // 1. Handle Scan Request
// exports.scanPlant = async (req, res) => {
//   const { image } = req.body;
//   const userId = req.user.userId; // From JWT token

//   console.log('📸 Scan request received for user:', userId);

//   if (!image) {
//     return res.status(400).json({ error: "Image required" });
//   }

//   let client;

//   try {
//     // 1. PARALLEL EXECUTION (Faster!)
//     // Run AI Analysis and S3 Upload at the same time.
//     // They don't depend on each other, so we save ~1-2 seconds of wait time.
//     console.log('🚀 Starting AI Analysis and S3 Upload concurrently...');

//     const [rawAIResult, imageUrl] = await Promise.all([
//       bedrockService.analyzeImage(image),
//       s3Service.uploadImage(image, userId)
//     ]);

//     // 2. Process AI Result
//     const aiResult = applyPlantGuardrails(rawAIResult);

//     // 🔹 Mark source of identification
//     aiResult.source = 'claude';

//     // 🛑 LOGIC FOR INVALID PLANTS
//     const isValidPlant = aiResult.is_plant !== false; // Default to true if missing

//     if (!isValidPlant) {
//       console.log('🚫 Gatekeeper: Image is NOT a plant.');
//       // Force values for invalid objects to ensure clean DB data
//       aiResult.plant_name = "Invalid Object";
//       aiResult.confidence = 0;
//       aiResult.care_guide = null;
//     } else {
//     // 🔹 Normalize care guide structure (prevent frontend issues)
//     aiResult.care_guide = {
//       water: aiResult.care_guide?.water ?? null,
//       sun: aiResult.care_guide?.sun ?? null,
//       soil: aiResult.care_guide?.soil ?? null,
//       fertilizer: aiResult.care_guide?.fertilizer ?? null
//     };

//     console.log('✅ AI & S3 Complete. Plant:', aiResult.plant_name);

//     // 3. NOW Start Database Transaction (Fast!)
//     client = await db.connect();
//     await client.query('BEGIN');


// // Step B: Update Encyclopedia (ONLY IF VALID PLANT)
// let speciesId = null;

// if (isValidPlant && aiResult.identification_status === 'Confirmed') {
//   const speciesQuery = `
//     INSERT INTO plant_species (scientific_name, common_name, description, care_guide)
//     VALUES ($1, $2, $3, $4)
//     ON CONFLICT (scientific_name) DO UPDATE SET 
//       common_name = EXCLUDED.common_name,
//       description = EXCLUDED.description,
//       care_guide = EXCLUDED.care_guide
//     RETURNING id;
//   `;

//   const speciesRes = await client.query(speciesQuery, [
//     aiResult.scientific_name,
//     aiResult.plant_name,
//     aiResult.description,
//     aiResult.care_guide
//   ]);
//   speciesId = speciesRes.rows[0].id;
//   console.log('🌿 Confirmed plant species saved:', speciesId);
// } else {
//   console.log('⚠️ Skipping species save (Invalid object or Uncertain ID)');
// }


//     // Step D: Log the Scan (Scans Table)
//     const scanQuery = `
//      INSERT INTO scans (
//   user_id,
//   plant_id,
//   image_url,
//   ai_raw_response,
//   is_healthy,
//   disease_name,
//   identification_status,
//   confidence
// )
// VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
// RETURNING id, created_at;


//     `;

//     const scanRes = await client.query(scanQuery, [
//       userId,
//       speciesId,
//       imageUrl,
//       JSON.stringify(aiResult),
//       aiResult.health_status?.toLowerCase() === 'healthy',
//       aiResult.disease_name || 'None',
//       isValidPlant ? (aiResult.identification_status || 'Unknown') : 'Invalid Object', // Flag in DB
//       aiResult.confidence || 0
//     ]);

//     await client.query('COMMIT');
//     console.log('✅ Scan saved to database:', scanRes.rows[0].id);

//     // 🔥 RESPONSE FOR FRONTEND
//     res.status(200).json({
//       success: true,
//       valid_plant: isValidPlant, // 👈 KEY FLAG FOR FLUTTERFLOW
//       message: isValidPlant ? "Scan Successful" : "Invalid object detected",
//       scanId: scanRes.rows[0].id,
//       speciesId: speciesId,
//       result: aiResult,
//       savedAt: scanRes.rows[0].created_at
//     });


//   }catch (error) {
//     if (client) await client.query('ROLLBACK');
//     console.error("❌ Scan Controller Error:", error.message);
//     res.status(500).json({ error: error.message });
//   } finally {
//     if (client) client.release();
//   }
//   }

// 1. Handle Scan Request
exports.scanPlant = async (req, res) => {
  const { image } = req.body;
  const userId = req.user.userId; // From JWT token

  console.log('📸 Scan request received for user:', userId);

  if (!image) {
    return res.status(400).json({ error: "Image required" });
  }

  let client = null;

  try {
    // 1. PARALLEL EXECUTION (Faster!)
    // Run AI Analysis and S3 Upload at the same time.
    console.log('🚀 Starting AI Analysis and S3 Upload concurrently...');

    const [rawAIResult, imageUrl] = await Promise.all([
      bedrockService.analyzeImage(image),
      s3Service.uploadImage(image, userId)
    ]);

    // 2. Process AI Result
    const aiResult = applyPlantGuardrails(rawAIResult);
    aiResult.source = 'claude';

    // Default to true if missing to prevent breaking older logic
    const isValidPlant = aiResult.is_plant !== false;

    // 🛑 LOGIC FOR INVALID PLANTS
    if (!isValidPlant) {
      console.log('🚫 Gatekeeper: Image is NOT a plant.');
      // Force values for invalid objects to ensure clean DB data
      aiResult.plant_name = "Invalid Object";
      aiResult.confidence = 0;
      aiResult.care_guide = null;
    } else {
      console.log('🌿 Valid plant detected:', aiResult.plant_name);
      // 🔹 Normalize care guide structure ONLY for valid plants
      aiResult.care_guide = {
        water: aiResult.care_guide?.water ?? null,
        sun: aiResult.care_guide?.sun ?? null,
        soil: aiResult.care_guide?.soil ?? null,
        fertilizer: aiResult.care_guide?.fertilizer ?? null
      };
    }

    // --- STRATEGY: SPLIT PATHS TO PREVENT HANGING ---

    // 🔴 SCENARIO A: INVALID PLANT (Fast Path - No Transaction)
    // We use a direct pool query here. It is faster and safer for logging bad data.
    if (!isValidPlant) {
      const scanQuery = `
        INSERT INTO scans (
          user_id, plant_id, image_url, ai_raw_response, 
          is_healthy, disease_name, identification_status, confidence
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, created_at;
      `;

      // Pass NULL for plant_id
      const scanRes = await db.query(scanQuery, [
        userId,
        null,
        imageUrl,
        JSON.stringify(aiResult),
        false,
        'None',
        'Invalid Object',
        0
      ]);

      console.log('✅ Invalid Scan saved successfully (Direct Query):', scanRes.rows[0].id);

      return res.status(200).json({
        success: true,
        valid_plant: false, // 👈 KEY FLAG FOR FLUTTERFLOW DIALOG
        message: "Invalid object detected",
        scanId: scanRes.rows[0].id,
        result: aiResult
      });
    }

    // 🟢 SCENARIO B: VALID PLANT (Transaction Path)
    // We only open a transaction if we are sure we need to update the encyclopedia.
    console.log('🔌 Connecting to DB for Transaction...');
    client = await db.connect();
    await client.query('BEGIN');

    // Step B: Update Encyclopedia (ONLY IF VALID PLANT)
    let speciesId = null;

    if (aiResult.identification_status === 'Confirmed' || aiResult.confidence > 0.4) {
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
      speciesId = speciesRes.rows[0].id;
      console.log('🌿 Confirmed plant species saved:', speciesId);
    } else {
      console.log('⚠️ Skipping species save (Uncertain ID)');
    }

    // Step D: Log the Scan (Scans Table)
    const scanQuery = `
     INSERT INTO scans (
        user_id, plant_id, image_url, ai_raw_response, 
        is_healthy, disease_name, identification_status, confidence
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, created_at;
    `;

    const scanRes = await client.query(scanQuery, [
      userId,
      speciesId,
      imageUrl,
      JSON.stringify(aiResult),
      aiResult.health_status?.toLowerCase() === 'healthy',
      aiResult.disease_name || 'None',
      aiResult.identification_status || 'Unknown',
      aiResult.confidence || 0
    ]);

    await client.query('COMMIT');
    console.log('✅ Valid Scan saved to database:', scanRes.rows[0].id);

    // 🔥 RESPONSE FOR FRONTEND
    res.status(200).json({
      success: true,
      valid_plant: true, // 👈 FLUTTERFLOW WILL NAVIGATE TO RESULT PAGE
      message: "Scan Successful",
      scanId: scanRes.rows[0].id,
      speciesId: speciesId,
      result: aiResult,
      savedAt: scanRes.rows[0].created_at
    });

  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (e) { console.error('Rollback failed', e); }
    }
    console.error("❌ Scan Controller Error:", error.message);
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
  s.image_url,
  s.ai_raw_response,
  s.corrected_response,
  s.is_healthy,
  s.disease_name
FROM scans s
WHERE s.user_id = $1
ORDER BY s.created_at DESC
    `;
    const result = await db.query(query, [userId]);

    console.log(`✅ Found ${result.rows.length} scans for user`);

    // // Format the response to include parsed plant info
    // const formattedScans = result.rows.map(scan => ({
    //   id: scan.id,
    //   createdAt: scan.created_at,
    //   isHealthy: scan.is_healthy,
    //   diseaseName: scan.disease_name,
    //   imageUrl: scan.image_url,
    //   plantName: scan.ai_raw_response?.plant_name || 'Unknown',
    //   scientificName: scan.ai_raw_response?.scientific_name || 'Unknown',
    //   healthStatus: scan.ai_raw_response?.health_status || 'Unknown',
    //   confidence: scan.ai_raw_response?.confidence || 0,
    //   fullResponse: scan.ai_raw_response
    // // }));
    // res.json({
    //   success: true,
    //   count: formattedScans.length,
    //   scans: formattedScans
    // });

    const formattedScans = result.rows.map(scan => {
      const response = scan.corrected_response || scan.ai_raw_response || {};

      return {
        id: scan.id,
        createdAt: scan.created_at,
        imageUrl: scan.image_url,

        plantName: response.common_name || response.plant_name || 'Unknown',
        scientificName: response.scientific_name || 'Unknown',

        healthStatus: response.health_status || 'Unknown',
        diseaseName: response.disease_name || scan.disease_name || 'None',
        isHealthy: scan.is_healthy,

        confidence: response.confidence || 0,

        careGuide: response.care_guide || null,
        treatment: response.treatment || null,

        identificationSource: response.source || 'ai',
        corrected: Boolean(scan.corrected_response),

        fullResponse: response
      };
    });

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

    const scan = result.rows[0];
    const response = scan.corrected_response || scan.ai_raw_response || {};

    res.json({
      scan: {
        id: scan.id,
        createdAt: scan.created_at,
        imageUrl: scan.image_url,

        plantName: response.common_name || response.plant_name || 'Unknown',
        scientificName: response.scientific_name || 'Unknown',

        healthStatus: response.health_status || 'Unknown',
        diseaseName: response.disease_name || scan.disease_name || 'None',
        isHealthy: scan.is_healthy,

        confidence: response.confidence || 0,
        careGuide: response.care_guide || null,
        treatment: response.treatment || null,

        identificationSource: response.source || 'ai',
        corrected: Boolean(scan.corrected_response),

        raw: response
      }
    });

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
      plantName: (scanData.ai_raw_response?.identification_status === 'Confirmed' || scanData.ai_raw_response?.plant_name)
        ? scanData.ai_raw_response.plant_name
        : 'Unidentified Plant',
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

// User Feedbback to Scan Result
exports.submitScanFeedback = async (req, res) => {
  const { scanId } = req.params;
  const { feedback } = req.body; // 'like' | 'dislike'
  const userId = req.user.userId;

  if (!['like', 'dislike'].includes(feedback)) {
    return res.status(400).json({ error: 'Invalid feedback' });
  }

  try {
    const result = await db.query(
      `
      UPDATE scans
      SET user_feedback = $1
      WHERE id = $2 AND user_id = $3
      RETURNING *
      `,
      [feedback, scanId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    res.json({
      success: true,
      feedback,
      scanId
    });
  } catch (error) {
    console.error('Feedback Error:', error.message);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
};

// PlantNet API Calling
exports.handleDislikeWithCorrection = async (req, res) => {
  const { scanId } = req.params;
  const userId = req.user.userId;

  console.log('🧪 PlantNet correction triggered for scan:', scanId);


  try {
    const scanResult = await db.query(
      `
      SELECT image_url, corrected_response
  FROM scans
  WHERE id = $1 AND user_id = $2
      `,
      [scanId, userId]
    );

    if (!scanResult.rows.length) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    // 🔥 CACHE CHECK — ADD THIS BLOCK
    if (scanResult.rows[0].corrected_response) {
      console.log('⚡ Returning cached PlantNet result');
      console.log('♻️ Using cached PlantNet correction for scan:', scanId);

      return res.json({
        source: 'cache',
        corrected: true,
        data: scanResult.rows[0].corrected_response
      });
    }

    const imageUrl = scanResult.rows[0].image_url;

    // ⬇️ Download image from S3 as buffer (REQUIRED for PlantNet)
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15000
    });

    const imageBuffer = Buffer.from(imageResponse.data);

    console.log('🧪 Image buffer size for PlantNet:', imageBuffer.length);

    // Call PlantNet
    const rawPlantNetData = await identifyPlantWithPlantNet(imageBuffer);

    const normalized = normalizePlantNetResult(rawPlantNetData);

    /**
 * 🔥 NEW STEP: Claude enrichment (disease + care)
 * PlantNet → WHAT plant
 * Claude → HEALTH, DISEASE, CARE
 */
    let enrichment = {
      health_status: "Unknown",
      disease_name: "Unknown",
      description: "Insufficient confidence for disease diagnosis",
      care_guide: null,
      treatment: []
    };

    const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

    // 👇 UPDATED: Threshold lowered from 0.6 to 0.1 (10%)
    // PlantNet scores are often low (e.g., 0.2-0.5), so 0.6 was blocking valid results.
    if (normalized.confidence >= 0.1) {
      console.log('🧠 Confidence is acceptable (' + normalized.confidence + '), triggering Claude enrichment...');
      enrichment = await enrichPlantData(
        {
          scientific_name: normalized.scientific_name,
          common_name: normalized.common_name,
          confidence: normalized.confidence
        },
        base64Image
      );
    } else {
      console.log('⚠️ Confidence too low (' + normalized.confidence + '), skipping enrichment.');
      // Optional: You could add a fallback care guide here if you want to avoid nulls completely
      // enrichment.care_guide = { water: "Water carefully.", sun: "Bright light." };
      enrichment = {
        care_guide: {
          water: "Water when topsoil is dry.",
          sun: "Bright, indirect light."
        },
        treatment: ["Monitor plant health."]
      };
    }

    // 🔗 Merge results
    const finalCorrectedResult = {
      ...normalized,
      ...enrichment,
      source: enrichment.care_guide ? 'plantnet+claude' : 'plantnet-only'
    };

    // 💾 Save enriched result
    await db.query(
      `
  UPDATE scans
  SET corrected_response = $1
  WHERE id = $2
  `,
      [finalCorrectedResult, scanId]
    );

    // 📤 Send to frontend
    res.json({
      source: 'plantnet+claude',
      corrected: true,
      data: finalCorrectedResult
    });
  } catch (error) {
    console.error('PlantNet correction failed:', error.message);
    res.status(500).json({ error: 'Plant identification failed' });
  }
};