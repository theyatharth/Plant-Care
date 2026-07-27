/**
 * gardenRoutes.js
 *
 * All routes for My Garden v1 functionality.
 * All endpoints require a valid JWT (verifyToken middleware).
 *
 * Mounted at: /api/garden
 *
 * ──────────────────────────────────────────────────────
 * PLANTS
 *   POST   /api/garden/plants                                Add plant to garden
 *   GET    /api/garden/plants                                List all plants (?zone=)
 *   GET    /api/garden/plants/:plantId                       Get single plant + schedules
 *   PATCH  /api/garden/plants/:plantId                       Update plant details
 *   DELETE /api/garden/plants/:plantId                       Delete plant (cascade schedules)
 *
 * CARE SCHEDULES
 *   PATCH  /api/garden/plants/:plantId/care/:scheduleId      Update schedule (frequency/toggle)
 *   POST   /api/garden/plants/:plantId/care/:scheduleId/done Mark task done
 *
 * REMINDERS
 *   GET    /api/garden/reminders                             Get all due/overdue tasks
 *
 * NOTIFICATIONS
 *   POST   /api/garden/reminders/notify                      Manually trigger push notifications (for testing)
 * ──────────────────────────────────────────────────────
 */

const express              = require('express');
const router               = express.Router();
const gardenCtrl           = require('../controllers/gardenCtrl');
const { verifyToken }      = require('../middleware/authMiddleware');
const notificationService  = require('../services/notificationService');

// ── Plants ────────────────────────────────────────────
// NOTE: /plants/upload-image MUST be registered before /plants/:plantId
// so Express matches the literal path first (not as a plantId param)
router.post  ('/plants/upload-image', verifyToken, gardenCtrl.uploadPlantImage);

router.post  ('/plants',          verifyToken, gardenCtrl.addPlant);
router.get   ('/plants',          verifyToken, gardenCtrl.getPlants);
router.get   ('/plants/:plantId', verifyToken, gardenCtrl.getPlantById);
router.patch ('/plants/:plantId', verifyToken, gardenCtrl.updatePlant);
router.delete('/plants/:plantId', verifyToken, gardenCtrl.deletePlant);

// ── Care Schedules ────────────────────────────────────
router.patch('/plants/:plantId/care/:scheduleId',      verifyToken, gardenCtrl.updateSchedule);
router.post ('/plants/:plantId/care/:scheduleId/done', verifyToken, gardenCtrl.markDone);

// ── Reminders ─────────────────────────────────────────
router.get('/reminders', verifyToken, gardenCtrl.getDueReminders);

// ── Notification Manual Trigger (for testing) ─────────
// POST /api/garden/reminders/notify
// Fires broadcastDueReminders immediately without waiting for the cron.
// Useful for QA / testing push notifications end-to-end.
router.post('/reminders/notify', verifyToken, async (req, res) => {
  try {
    console.log(`🔔 Manual notification trigger by user ${req.user.userId}`);
    const result = await notificationService.broadcastDueReminders();
    res.json({
      success: true,
      message: 'Due reminder notifications sent',
      ...result,
    });
  } catch (error) {
    console.error('❌ Manual notify error:', error.message);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

// ── Notification Debug Diagnostic ────────────────────────
// GET /api/garden/reminders/debug
// Shows the exact DB state for the authenticated user:
//   - user notification settings (notification_time in UTC + IST, fcm_token presence)
//   - all care schedules and whether they pass each cron WHERE condition
router.get('/reminders/debug', verifyToken, async (req, res) => {
  const db = require('../configure/dbConfig');
  const userId = req.user.userId;

  try {
    // 1. User notification settings
    const userRes = await db.query(
      `SELECT
         id,
         notifications_enabled,
         notification_time                                          AS notification_time_utc,
         TO_CHAR(notification_time + INTERVAL '5 hours 30 minutes', 'HH24:MI') AS notification_time_ist,
         EXTRACT(HOUR   FROM notification_time)::INTEGER            AS utc_hour,
         EXTRACT(MINUTE FROM notification_time)::INTEGER            AS utc_minute,
         CASE WHEN fcm_token IS NOT NULL THEN 'SET (' || LEFT(fcm_token,20) || '...)' ELSE 'NULL' END AS fcm_token_status
       FROM users WHERE id = $1`,
      [userId]
    );

    // 2. All care schedules for this user (with pass/fail on each cron condition)
    const schedulesRes = await db.query(
      `SELECT
         cs.id                                                       AS schedule_id,
         cs.task_type,
         cs.is_enabled,
         cs.next_due_at,
         cs.next_due_at <= NOW()                                     AS due_condition_passes,
         gp.nickname,
         u.fcm_token IS NOT NULL                                     AS has_fcm_token,
         u.notifications_enabled,
         u.notification_time                                         AS stored_notification_time_utc,
         EXTRACT(HOUR   FROM u.notification_time)::INTEGER           AS stored_utc_hour,
         EXTRACT(MINUTE FROM u.notification_time)::INTEGER           AS stored_utc_minute,
         NOW()                                                       AS db_now
       FROM care_schedules cs
       JOIN garden_plants  gp ON cs.garden_plant_id = gp.id
       JOIN users          u  ON gp.user_id = u.id
       WHERE gp.user_id = $1
       ORDER BY cs.next_due_at ASC`,
      [userId]
    );

    const now = new Date();
    res.json({
      success:        true,
      server_utc_now: now.toISOString(),
      server_utc_hour:   now.getUTCHours(),
      server_utc_minute: now.getUTCMinutes(),
      user_settings:  userRes.rows[0] || null,
      care_schedules: schedulesRes.rows,
      hint: 'For a notification to fire, ALL must be true: is_enabled=true, due_condition_passes=true, has_fcm_token=true, notifications_enabled=true, AND stored_utc_hour/minute must equal server_utc_hour/minute',
    });
  } catch (error) {
    console.error('❌ Debug diagnostic error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

