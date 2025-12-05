const db = require('../configure/dbConfig');
const bedrockService = require('../services/bedrockService');

// 1. Handle Scan Request
exports.scanPlant = async (req, res) => {
  const { image } = req.body;
  const userId = req.user.userId; // From JWT token

  if (!image) {
    return res.status(400).json({ error: "Image required" });
  }

  const client = await db.connect();

  try {
    // Step A: Get Intelligence from Bedrock Service
    const aiResult = await bedrockService.analyzeImage(image);

    await client.query('BEGIN');

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

    // Step C: Log the Scan (Scans Table)
    // Note: plant_id is NULL for now (not linked to user_plants yet)
    const scanQuery = `
      INSERT INTO scans (user_id, plant_id, image_url, ai_raw_response, is_healthy, disease_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `;
    // In prod, upload image to S3 here and save URL. Using placeholder for now.
    const fakeUrl = "s3://bucket/image_" + Date.now();

    const scanRes = await client.query(scanQuery, [
      userId,
      null, // plant_id is null (not linked to user's garden yet)
      fakeUrl,
      aiResult,
      aiResult.health_status.toLowerCase() === 'healthy',
      aiResult.disease_name || 'None'
    ]);

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      scanId: scanRes.rows[0].id,
      speciesId: speciesId,
      result: aiResult
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Controller Error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// 2. Get User History
exports.getHistory = async (req, res) => {
  try {
    const userId = req.user.userId; // From JWT token
    const query = `
      SELECT 
        s.id, 
        s.created_at, 
        s.disease_name, 
        s.is_healthy, 
        s.image_url,
        s.ai_raw_response
      FROM scans s
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
    `;
    const result = await db.query(query, [userId]);
    res.json({ scans: result.rows });
  } catch (error) {
    console.error('Get History Error:', error);
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