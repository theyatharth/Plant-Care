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

module.exports = router;

