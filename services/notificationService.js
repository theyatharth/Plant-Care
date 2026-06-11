/**
 * notificationService.js
 *
 * Centralises all Firebase Cloud Messaging (FCM) logic for the Plant Care app.
 *
 * Exported functions:
 *  - sendToUser(userId, title, body, data)   — Send a notification to one user
 *  - sendCareReminder(reminder)              — Build and send a care-task notification
 *  - broadcastDueReminders()                 — Worker: notify ALL users with due tasks
 *                                              (called by the daily cron in index.js)
 */

const admin = require('../firebaseAdmin');
const db    = require('../configure/dbConfig');

// ─────────────────────────────────────────────────────────────
// EMOJI map for each task type
// ─────────────────────────────────────────────────────────────
const TASK_EMOJI = {
  water:     '💧',
  fertilize: '🌱',
  prune:     '✂️',
};

const TASK_LABEL = {
  water:     'watering',
  fertilize: 'fertilizing',
  prune:     'pruning',
};

// ─────────────────────────────────────────────────────────────
// 1. SEND TO ONE USER
//    Looks up the user's FCM token from the DB and sends.
//    Silently skips if the user has no token or notifications disabled.
// ─────────────────────────────────────────────────────────────
async function sendToUser(userId, title, body, data = {}) {
  try {
    const result = await db.query(
      `SELECT fcm_token, notifications_enabled
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      console.warn(`⚠️  sendToUser: user ${userId} not found`);
      return { success: false, reason: 'user_not_found' };
    }

    const { fcm_token, notifications_enabled } = result.rows[0];

    if (!notifications_enabled) {
      console.log(`🔕 Notifications disabled for user ${userId} — skipping`);
      return { success: false, reason: 'notifications_disabled' };
    }

    if (!fcm_token) {
      console.log(`📵 No FCM token for user ${userId} — skipping`);
      return { success: false, reason: 'no_fcm_token' };
    }

    const message = {
      token: fcm_token,
      notification: { title, body },
      // data values must all be strings for FCM
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: 'high',
        notification: {
          channelId: 'plant_care_reminders',
          icon: 'ic_notification',
          color: '#4CAF50',
        },
      },
      apns: {
        payload: {
          aps: { sound: 'default', badge: 1 },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ FCM sent to user ${userId} | messageId: ${response}`);
    return { success: true, messageId: response };

  } catch (error) {
    // Token is stale / unregistered — clear it so we don't retry
    if (
      error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered'
    ) {
      console.warn(`🗑️  Stale FCM token for user ${userId} — clearing`);
      await db.query('UPDATE users SET fcm_token = NULL WHERE id = $1', [userId]);
      return { success: false, reason: 'stale_token' };
    }

    console.error(`❌ FCM send error for user ${userId}:`, error.message);
    return { success: false, reason: error.message };
  }
}

// ─────────────────────────────────────────────────────────────
// 2. SEND A CARE REMINDER NOTIFICATION
//    Builds a plant-care-specific title/body from reminder fields
//    and delegates to sendToUser.
//
//    reminder: {
//      userId, nickname, task_type,
//      days_overdue (0 = due today, >0 = overdue by N days)
//    }
// ─────────────────────────────────────────────────────────────
async function sendCareReminder(reminder) {
  const { userId, nickname, task_type, days_overdue, plant_id, schedule_id } = reminder;

  const emoji = TASK_EMOJI[task_type]  || '🌿';
  const label = TASK_LABEL[task_type]  || task_type;

  let title, body;

  if (days_overdue === 0) {
    title = `${emoji} Time to ${task_type} ${nickname}!`;
    body  = `Today is the day to take care of ${nickname}. Don't forget ${label}!`;
  } else {
    title = `${emoji} ${nickname} needs ${task_type}!`;
    body  = `Your plant "${nickname}" is overdue for ${label} by ${days_overdue} day${days_overdue > 1 ? 's' : ''}.`;
  }

  return sendToUser(userId, title, body, {
    type:        'care_reminder',
    plantId:     plant_id  || '',
    scheduleId:  schedule_id || '',
    taskType:    task_type,
  });
}

// ─────────────────────────────────────────────────────────────
// 3. BROADCAST DUE REMINDERS (CRON WORKER)
//    Queries ALL due/overdue enabled care schedules across ALL users
//    who have an FCM token and notifications enabled.
//    Called once a day by the cron scheduler in index.js.
// ─────────────────────────────────────────────────────────────
async function broadcastDueReminders() {
  console.log('🔔 [Cron] Running broadcastDueReminders...');

  try {
    const result = await db.query(
      `SELECT
         cs.id                                                    AS schedule_id,
         cs.task_type,
         EXTRACT(DAY FROM (NOW() - cs.next_due_at))::INTEGER      AS days_overdue,
         gp.id                                                    AS plant_id,
         gp.nickname,
         gp.user_id,
         u.fcm_token,
         u.notifications_enabled
       FROM care_schedules cs
       JOIN garden_plants  gp ON cs.garden_plant_id = gp.id
       JOIN users          u  ON gp.user_id = u.id
       WHERE cs.is_enabled         = TRUE
         AND cs.next_due_at       <= NOW()
         AND u.fcm_token          IS NOT NULL
         AND u.notifications_enabled = TRUE
       ORDER BY cs.next_due_at ASC`
    );

    if (result.rows.length === 0) {
      console.log('✅ [Cron] No due reminders to send.');
      return { sent: 0, failed: 0 };
    }

    console.log(`📋 [Cron] ${result.rows.length} due reminder(s) found — sending notifications...`);

    let sent = 0;
    let failed = 0;

    // Fire notifications sequentially to avoid hammering FCM
    for (const row of result.rows) {
      const outcome = await sendCareReminder({
        userId:      row.user_id,
        nickname:    row.nickname,
        task_type:   row.task_type,
        days_overdue: row.days_overdue,
        plant_id:    row.plant_id,
        schedule_id: row.schedule_id,
      });

      if (outcome.success) sent++;
      else failed++;
    }

    console.log(`✅ [Cron] broadcastDueReminders done — sent: ${sent}, failed/skipped: ${failed}`);
    return { sent, failed };

  } catch (error) {
    console.error('❌ [Cron] broadcastDueReminders error:', error.message);
    throw error;
  }
}

module.exports = {
  sendToUser,
  sendCareReminder,
  broadcastDueReminders,
};
