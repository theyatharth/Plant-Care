/**
 * gardenCtrl.js
 *
 * Handles all My Garden v1 functionality:
 *  - Add / list / view / update / delete garden plants
 *  - Update care schedule frequency or toggle enabled
 *  - Mark a care task as done (recalculates next_due_at)
 *  - Get all due/overdue reminders across a user's garden
 */

const db = require('../configure/dbConfig');

// Valid values enforced by DB CHECK constraint — mirrored here for early validation
const VALID_ZONES   = ['living_room', 'balcony', 'terrace'];
const VALID_STATUSES = ['healthy', 'sick', 'dormant'];
const VALID_TASKS   = ['water', 'fertilize', 'prune'];

// Default care frequencies (days) applied when a plant is first added
const DEFAULT_SCHEDULES = [
  { task_type: 'water',     frequency_days: 7  },
  { task_type: 'fertilize', frequency_days: 14 },
  { task_type: 'prune',     frequency_days: 30 },
];

// ─────────────────────────────────────────────────────────────
// HELPER: calculate next_due_at from now + N days
// ─────────────────────────────────────────────────────────────
function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// ─────────────────────────────────────────────────────────────
// 1. ADD PLANT TO GARDEN
//    POST /api/garden/plants
//    Body: { nickname, image_url, zone, species_id?, scan_id?, notes? }
//    Auto-creates 3 default care schedules (water/fertilize/prune)
// ─────────────────────────────────────────────────────────────
exports.addPlant = async (req, res) => {
  const userId = req.user.userId;
  const { nickname, image_url, zone, species_id, scan_id, notes } = req.body;

  // --- Validation ---
  if (!nickname || !zone) {
    return res.status(400).json({ error: 'nickname and zone are required' });
  }
  if (!VALID_ZONES.includes(zone)) {
    return res.status(400).json({
      error: `Invalid zone. Must be one of: ${VALID_ZONES.join(', ')}`
    });
  }

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    // 1a. Insert the garden plant
    const plantRes = await client.query(
      `INSERT INTO garden_plants
         (user_id, species_id, scan_id, nickname, image_url, zone, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        species_id || null,
        scan_id    || null,
        nickname.trim(),
        image_url  || null,
        zone,
        notes      || null,
      ]
    );
    const plant = plantRes.rows[0];

    // 1b. Auto-create the 3 default care schedules
    const scheduleInserts = DEFAULT_SCHEDULES.map(({ task_type, frequency_days }) =>
      client.query(
        `INSERT INTO care_schedules
           (garden_plant_id, task_type, frequency_days, next_due_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [plant.id, task_type, frequency_days, daysFromNow(frequency_days)]
      )
    );
    const scheduleResults = await Promise.all(scheduleInserts);
    const schedules = scheduleResults.map(r => r.rows[0]);

    await client.query('COMMIT');

    console.log(`🌿 Plant "${nickname}" added to garden (zone: ${zone}) for user ${userId}`);

    res.status(201).json({
      success: true,
      message: 'Plant added to garden',
      plant: formatPlant(plant, schedules),
    });

  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (e) { /* silent */ }
    }
    console.error('❌ addPlant Error:', error.message);
    res.status(500).json({ error: 'Failed to add plant to garden' });
  } finally {
    if (client) client.release();
  }
};

// ─────────────────────────────────────────────────────────────
// 2. GET ALL GARDEN PLANTS
//    GET /api/garden/plants
//    Query: ?zone=balcony  (optional filter)
// ─────────────────────────────────────────────────────────────
exports.getPlants = async (req, res) => {
  const userId = req.user.userId;
  const { zone } = req.query;

  // Validate zone filter if provided
  if (zone && !VALID_ZONES.includes(zone)) {
    return res.status(400).json({
      error: `Invalid zone filter. Must be one of: ${VALID_ZONES.join(', ')}`
    });
  }

  try {
    const baseQuery = `
      SELECT
        gp.*,
        ps.common_name    AS species_common_name,
        ps.scientific_name AS species_scientific_name,
        -- Aggregate care schedules as JSON array
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id',               cs.id,
              'task_type',        cs.task_type,
              'frequency_days',   cs.frequency_days,
              'last_performed_at',cs.last_performed_at,
              'next_due_at',      cs.next_due_at,
              'is_enabled',       cs.is_enabled
            )
            ORDER BY cs.task_type
          ) FILTER (WHERE cs.id IS NOT NULL),
          '[]'
        ) AS care_schedules
      FROM garden_plants gp
      LEFT JOIN plant_species ps ON gp.species_id = ps.id
      LEFT JOIN care_schedules cs ON cs.garden_plant_id = gp.id
      WHERE gp.user_id = $1
        ${zone ? 'AND gp.zone = $2' : ''}
      GROUP BY gp.id, ps.common_name, ps.scientific_name
      ORDER BY gp.created_at DESC
    `;

    const params = zone ? [userId, zone] : [userId];
    const result = await db.query(baseQuery, params);

    console.log(`🌿 Found ${result.rows.length} garden plants for user ${userId}`);

    res.json({
      success: true,
      count: result.rows.length,
      plants: result.rows.map(formatPlantRow),
    });

  } catch (error) {
    console.error('❌ getPlants Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch garden plants' });
  }
};

// ─────────────────────────────────────────────────────────────
// 3. GET SINGLE GARDEN PLANT (with care schedules)
//    GET /api/garden/plants/:plantId
// ─────────────────────────────────────────────────────────────
exports.getPlantById = async (req, res) => {
  const userId  = req.user.userId;
  const { plantId } = req.params;

  try {
    const result = await db.query(
      `SELECT
         gp.*,
         ps.common_name    AS species_common_name,
         ps.scientific_name AS species_scientific_name,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'id',               cs.id,
               'task_type',        cs.task_type,
               'frequency_days',   cs.frequency_days,
               'last_performed_at',cs.last_performed_at,
               'next_due_at',      cs.next_due_at,
               'is_enabled',       cs.is_enabled
             )
             ORDER BY cs.task_type
           ) FILTER (WHERE cs.id IS NOT NULL),
           '[]'
         ) AS care_schedules
       FROM garden_plants gp
       LEFT JOIN plant_species ps ON gp.species_id = ps.id
       LEFT JOIN care_schedules cs ON cs.garden_plant_id = gp.id
       WHERE gp.id = $1 AND gp.user_id = $2
       GROUP BY gp.id, ps.common_name, ps.scientific_name`,
      [plantId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Plant not found' });
    }

    res.json({
      success: true,
      plant: formatPlantRow(result.rows[0]),
    });

  } catch (error) {
    console.error('❌ getPlantById Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch plant' });
  }
};

// ─────────────────────────────────────────────────────────────
// 4. UPDATE GARDEN PLANT
//    PATCH /api/garden/plants/:plantId
//    Body: { nickname?, image_url?, zone?, status?, notes? }
// ─────────────────────────────────────────────────────────────
exports.updatePlant = async (req, res) => {
  const userId  = req.user.userId;
  const { plantId } = req.params;
  const { nickname, image_url, zone, status, notes } = req.body;

  // Validate zone/status if provided
  if (zone && !VALID_ZONES.includes(zone)) {
    return res.status(400).json({
      error: `Invalid zone. Must be one of: ${VALID_ZONES.join(', ')}`
    });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
    });
  }

  try {
    // Build SET clause dynamically — only update fields that were sent
    const fields = [];
    const values = [];
    let i = 1;

    if (nickname  !== undefined) { fields.push(`nickname = $${i++}`);   values.push(nickname.trim()); }
    if (image_url !== undefined) { fields.push(`image_url = $${i++}`);  values.push(image_url); }
    if (zone      !== undefined) { fields.push(`zone = $${i++}`);       values.push(zone); }
    if (status    !== undefined) { fields.push(`status = $${i++}`);     values.push(status); }
    if (notes     !== undefined) { fields.push(`notes = $${i++}`);      values.push(notes); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    values.push(plantId, userId); // WHERE clause params

    const result = await db.query(
      `UPDATE garden_plants
       SET ${fields.join(', ')}
       WHERE id = $${i} AND user_id = $${i + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Plant not found' });
    }

    console.log(`✅ Garden plant ${plantId} updated`);
    res.json({
      success: true,
      plant: formatPlant(result.rows[0]),
    });

  } catch (error) {
    console.error('❌ updatePlant Error:', error.message);
    res.status(500).json({ error: 'Failed to update plant' });
  }
};

// ─────────────────────────────────────────────────────────────
// 5. DELETE GARDEN PLANT
//    DELETE /api/garden/plants/:plantId
//    (care_schedules cascade-deleted by DB constraint)
// ─────────────────────────────────────────────────────────────
exports.deletePlant = async (req, res) => {
  const userId  = req.user.userId;
  const { plantId } = req.params;

  try {
    const result = await db.query(
      `DELETE FROM garden_plants
       WHERE id = $1 AND user_id = $2
       RETURNING id, nickname`,
      [plantId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Plant not found' });
    }

    console.log(`🗑️ Garden plant "${result.rows[0].nickname}" deleted`);
    res.json({
      success: true,
      message: `"${result.rows[0].nickname}" removed from garden`,
    });

  } catch (error) {
    console.error('❌ deletePlant Error:', error.message);
    res.status(500).json({ error: 'Failed to delete plant' });
  }
};

// ─────────────────────────────────────────────────────────────
// 6. UPDATE CARE SCHEDULE
//    PATCH /api/garden/plants/:plantId/care/:scheduleId
//    Body: { frequency_days?, is_enabled? }
//    Recalculates next_due_at when frequency changes
// ─────────────────────────────────────────────────────────────
exports.updateSchedule = async (req, res) => {
  const userId      = req.user.userId;
  const { plantId, scheduleId } = req.params;
  const { frequency_days, is_enabled } = req.body;

  if (frequency_days !== undefined && (!Number.isInteger(frequency_days) || frequency_days < 1)) {
    return res.status(400).json({ error: 'frequency_days must be a positive integer' });
  }

  try {
    // Verify the plant belongs to this user before touching the schedule
    const ownerCheck = await db.query(
      'SELECT id FROM garden_plants WHERE id = $1 AND user_id = $2',
      [plantId, userId]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Plant not found' });
    }

    const fields = [];
    const values = [];
    let i = 1;

    if (frequency_days !== undefined) {
      fields.push(`frequency_days = $${i++}`);
      values.push(frequency_days);
      // Recalculate next_due_at from today using the new frequency
      fields.push(`next_due_at = $${i++}`);
      values.push(daysFromNow(frequency_days));
    }
    if (is_enabled !== undefined) {
      fields.push(`is_enabled = $${i++}`);
      values.push(Boolean(is_enabled));
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    values.push(scheduleId, plantId);
    const result = await db.query(
      `UPDATE care_schedules
       SET ${fields.join(', ')}
       WHERE id = $${i} AND garden_plant_id = $${i + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Care schedule not found' });
    }

    console.log(`✅ Care schedule ${scheduleId} updated`);
    res.json({
      success: true,
      schedule: result.rows[0],
    });

  } catch (error) {
    console.error('❌ updateSchedule Error:', error.message);
    res.status(500).json({ error: 'Failed to update care schedule' });
  }
};

// ─────────────────────────────────────────────────────────────
// 7. MARK CARE TASK AS DONE
//    POST /api/garden/plants/:plantId/care/:scheduleId/done
//    Sets last_performed_at = now, recalculates next_due_at
// ─────────────────────────────────────────────────────────────
exports.markDone = async (req, res) => {
  const userId      = req.user.userId;
  const { plantId, scheduleId } = req.params;

  try {
    // Verify ownership via garden_plants
    const ownerCheck = await db.query(
      'SELECT id FROM garden_plants WHERE id = $1 AND user_id = $2',
      [plantId, userId]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Plant not found' });
    }

    // Fetch current schedule to get frequency_days for recalculation
    const scheduleRes = await db.query(
      'SELECT * FROM care_schedules WHERE id = $1 AND garden_plant_id = $2',
      [scheduleId, plantId]
    );
    if (scheduleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Care schedule not found' });
    }

    const { frequency_days } = scheduleRes.rows[0];
    const now = new Date();
    const nextDue = daysFromNow(frequency_days);

    const result = await db.query(
      `UPDATE care_schedules
       SET last_performed_at = $1,
           next_due_at       = $2
       WHERE id = $3 AND garden_plant_id = $4
       RETURNING *`,
      [now, nextDue, scheduleId, plantId]
    );

    console.log(`✅ Care task "${result.rows[0].task_type}" marked done for plant ${plantId}`);

    res.json({
      success: true,
      message: `${result.rows[0].task_type} task marked as done`,
      schedule: result.rows[0],
    });

  } catch (error) {
    console.error('❌ markDone Error:', error.message);
    res.status(500).json({ error: 'Failed to mark task as done' });
  }
};

// ─────────────────────────────────────────────────────────────
// 8. GET DUE / OVERDUE REMINDERS
//    GET /api/garden/reminders
//    Returns all enabled tasks where next_due_at <= now
//    Useful for a dashboard badge or reminder list
// ─────────────────────────────────────────────────────────────
exports.getDueReminders = async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await db.query(
      `SELECT
         cs.id             AS schedule_id,
         cs.task_type,
         cs.frequency_days,
         cs.last_performed_at,
         cs.next_due_at,
         gp.id             AS plant_id,
         gp.nickname,
         gp.image_url,
         gp.zone,
         gp.status,
         -- Days overdue (negative = still upcoming, 0 = due today, positive = overdue)
         EXTRACT(DAY FROM (NOW() - cs.next_due_at))::INTEGER AS days_overdue
       FROM care_schedules cs
       JOIN garden_plants  gp ON cs.garden_plant_id = gp.id
       WHERE gp.user_id   = $1
         AND cs.is_enabled = TRUE
         AND cs.next_due_at <= NOW()
       ORDER BY cs.next_due_at ASC`,
      [userId]
    );

    console.log(`🔔 ${result.rows.length} due reminders for user ${userId}`);

    res.json({
      success: true,
      count: result.rows.length,
      reminders: result.rows,
    });

  } catch (error) {
    console.error('❌ getDueReminders Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
};

// ─────────────────────────────────────────────────────────────
// PRIVATE HELPERS — consistent response shape
// ─────────────────────────────────────────────────────────────

/** Format a plant row from addPlant / updatePlant (schedules already separate) */
function formatPlant(plant, schedules = []) {
  return {
    id:           plant.id,
    nickname:     plant.nickname,
    imageUrl:     plant.image_url,
    zone:         plant.zone,
    status:       plant.status,
    notes:        plant.notes,
    speciesId:    plant.species_id,
    scanId:       plant.scan_id,
    createdAt:    plant.created_at,
    updatedAt:    plant.updated_at,
    careSchedules: schedules,
  };
}

/** Format a plant row that includes aggregated care_schedules from a JOIN query */
function formatPlantRow(row) {
  return {
    id:               row.id,
    nickname:         row.nickname,
    imageUrl:         row.image_url,
    zone:             row.zone,
    status:           row.status,
    notes:            row.notes,
    speciesId:        row.species_id,
    scanId:           row.scan_id,
    speciesCommonName:     row.species_common_name     || null,
    speciesScientificName: row.species_scientific_name || null,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
    careSchedules:    row.care_schedules || [],
  };
}
