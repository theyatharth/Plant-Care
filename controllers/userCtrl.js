const db = require('../configure/dbConfig');
const jwt = require('jsonwebtoken');
const s3Service = require('../services/s3Service');
const emailService = require('../services/emailService');
const validator = require('validator');

// ─────────────────────────────────────────────────────────────
// NOTIFICATION TIME HELPERS (IST ↔ UTC)
//
// notification_time is stored as UTC TIME in the DB (industry std).
// The API accepts and returns times in IST (UTC+05:30) for the app.
// Granularity: 15-minute intervals — minutes must be 00, 15, 30, or 45.
// ─────────────────────────────────────────────────────────────
const IST_OFFSET_MINUTES = 330; // UTC+05:30
const TIME_REGEX         = /^([01]\d|2[0-3]):([0-5]\d)$/;
const VALID_NOTIF_MINUTES = new Set([0, 15, 30, 45]);

/**
 * Convert "HH:MM" IST string → "HH:MM" UTC string.
 * Handles midnight wrap-around (e.g. "00:00" IST → "18:30" UTC).
 */
function istToUtc(istTimeStr) {
  const [h, m] = istTimeStr.split(':').map(Number);
  let totalMin  = h * 60 + m - IST_OFFSET_MINUTES;
  if (totalMin < 0)     totalMin += 1440; // wrap past midnight
  if (totalMin >= 1440) totalMin -= 1440;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Convert UTC TIME string ("HH:MM" or "HH:MM:SS" from Postgres) → "HH:MM" IST string.
 */
function utcToIst(utcTimeStr) {
  const parts    = utcTimeStr.substring(0, 5).split(':').map(Number);
  let   totalMin = parts[0] * 60 + parts[1] + IST_OFFSET_MINUTES;
  if (totalMin >= 1440) totalMin -= 1440;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Login or Register user (after OTP verification in FlutterFlow)
exports.loginOrRegister = async (req, res) => {
  const { phone, name, email } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Validate phone format (10 digits for Indian numbers)
  const phoneRegex = /^[6-9]\d{9}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number format. Use 10-digit Indian mobile number' });
  }

  try {
    // Check if user exists
    let userResult = await db.query(
      'SELECT id, phone, name, email, profile_photo_url, created_at FROM users WHERE phone = $1',
      [phone]
    );

    let user;
    let isNewUser = false;

    if (userResult.rows.length === 0) {
      // New user - create account
      if (!name) {
        return res.status(400).json({ error: 'Name is required for new users' });
      }

      const insertResult = await db.query(
        'INSERT INTO users (phone, name, email) VALUES ($1, $2, $3) RETURNING id, phone, name, email, profile_photo_url, created_at',
        [phone, name, email || null]
      );
      user = insertResult.rows[0];
      isNewUser = true;
    } else {
      // Existing user - login
      user = userResult.rows[0];

      // Update name/email if provided
      if (name || email) {
        const updateResult = await db.query(
          'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING id, phone, name, email, profile_photo_url, created_at',
          [name, email, user.id]
        );
        user = updateResult.rows[0];
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      isNewUser,
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        profilePhotoUrl: user.profile_photo_url,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('❌ Login/Register Error:');
    console.error('Error Message:', error.message);
    console.error('Error Code:', error.code);
    console.error('Error Detail:', error.detail);
    console.error('Full Error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, name, phone, profile_photo_url, created_at,
              notifications_enabled, notification_time
       FROM users WHERE id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const u = result.rows[0];
    res.json({
      user: {
        id:                   u.id,
        email:                u.email,
        name:                 u.name,
        phone:                u.phone,
        profilePhotoUrl:      u.profile_photo_url,
        createdAt:            u.created_at,
        notificationsEnabled: u.notifications_enabled,
        // Return time in IST so the Flutter app shows the user's local time
        notificationTime:     u.notification_time ? utcToIst(u.notification_time) : '08:00',
      },
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  const { name, email } = req.body;

  if (!name && !email) {
    return res.status(400).json({ error: 'Name or email is required' });
  }

  try {
    const result = await db.query(
      'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING id, phone, name, email, profile_photo_url, created_at',
      [name, email, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update Profile Error:', error.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Upload profile photo
exports.uploadProfilePhoto = async (req, res) => {
  const { image } = req.body;
  const userId = req.user.userId;

  console.log('📸 Profile photo upload request for user:', userId);

  if (!image) {
    return res.status(400).json({ error: "Profile photo image required" });
  }

  try {
    // Upload image to S3 in profile-photos folder
    console.log('📤 Uploading profile photo to S3...');
    const imageUrl = await s3Service.uploadProfilePhoto(image, userId);
    console.log('✅ Profile photo uploaded:', imageUrl);

    // Update user's profile photo URL in database
    const result = await db.query(
      'UPDATE users SET profile_photo_url = $1 WHERE id = $2 RETURNING id, phone, name, email, profile_photo_url, created_at',
      [imageUrl, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('✅ Profile photo URL saved to database');

    res.json({
      success: true,
      message: 'Profile photo uploaded successfully',
      profilePhotoUrl: imageUrl,
      user: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Profile Photo Upload Error:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
};

// Get profile photo URL
exports.getProfilePhoto = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT profile_photo_url FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profilePhotoUrl = result.rows[0].profile_photo_url;

    if (!profilePhotoUrl) {
      return res.json({
        success: true,
        hasProfilePhoto: false,
        profilePhotoUrl: null,
        message: 'No profile photo uploaded'
      });
    }

    res.json({
      success: true,
      hasProfilePhoto: true,
      profilePhotoUrl: profilePhotoUrl
    });

  } catch (error) {
    console.error('❌ Get Profile Photo Error:', error.message);
    res.status(500).json({ error: 'Failed to get profile photo' });
  }
};

// Request Email OTP
exports.requestEmailOTP = async (req, res) => {
  const { email } = req.body;

  console.log('📧 Email OTP request for:', email);

  if (!email || !validator.isEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    // Check rate limiting
    const canSend = await emailService.checkRateLimit(email);
    if (!canSend) {
      console.log('🚫 Rate limit exceeded for email:', email);
      return res.status(429).json({
        error: 'Too many OTP requests. Please try again later.',
        retryAfter: '1 hour'
      });
    }

    // Generate and send OTP
    const otp = emailService.generateOTP();
    console.log('🔢 Generated OTP for', email, ':', otp);

    await emailService.sendOTP(email, otp);
    await emailService.storeOTP(email, otp);

    res.json({
      success: true,
      message: 'OTP sent to your email',
      email: email,
      expiresIn: `${process.env.OTP_EXPIRY_MINUTES || 10} minutes`
    });

  } catch (error) {
    console.error('❌ Email OTP Request Error:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to send OTP',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Verify Email OTP and Login/Register
exports.verifyEmailOTP = async (req, res) => {
  const { email, otp, name } = req.body;

  console.log('🔐 Email OTP verification for:', email, 'with OTP:', otp);

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: 'OTP must be 6 digits' });
  }

  try {
    // Verify OTP
    const otpResult = await emailService.verifyOTP(email, otp);
    if (!otpResult.success) {
      console.log('❌ OTP verification failed:', otpResult.message);
      return res.status(400).json({ error: otpResult.message });
    }

    // Check if user exists
    let userResult = await db.query(
      'SELECT id, phone, name, email, profile_photo_url, created_at, email_verified, primary_login_method FROM users WHERE email = $1',
      [email]
    );

    let user;
    let isNewUser = false;

    if (userResult.rows.length === 0) {
      // New user - create account
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required for new users' });
      }

      console.log('👤 Creating new user with email:', email);
      const insertResult = await db.query(
        'INSERT INTO users (email, name, email_verified, primary_login_method) VALUES ($1, $2, $3, $4) RETURNING id, phone, name, email, profile_photo_url, created_at, email_verified, primary_login_method',
        [email, name.trim(), true, 'email']
      );
      user = insertResult.rows[0];
      isNewUser = true;
      console.log('✅ New user created with ID:', user.id);
    } else {
      // Existing user - login and mark email as verified
      console.log('👤 Existing user login with email:', email);
      await db.query(
        'UPDATE users SET email_verified = TRUE WHERE email = $1',
        [email]
      );
      user = userResult.rows[0];
      user.email_verified = true;
      console.log('✅ Existing user email verified, ID:', user.id);
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        loginMethod: 'email'
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('🎫 JWT token generated for user:', user.id);

    res.json({
      success: true,
      isNewUser,
      token,
      loginMethod: 'email',
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        profilePhotoUrl: user.profile_photo_url,
        createdAt: user.created_at,
        emailVerified: user.email_verified,
        primaryLoginMethod: user.primary_login_method
      }
    });

  } catch (error) {
    console.error('❌ Email OTP Verification Error:');
    console.error('Error Message:', error.message);
    console.error('Error Code:', error.code);
    console.error('Error Detail:', error.detail);
    console.error('Full Error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Register / update FCM device token
// POST /api/users/fcm-token
// Body: { fcmToken: string }
// Called by the Flutter app after it gets a fresh FCM registration token
// ─────────────────────────────────────────────────────────────
exports.registerFcmToken = async (req, res) => {
  const userId = req.user.userId;
  const { fcmToken } = req.body;

  if (!fcmToken || typeof fcmToken !== 'string' || fcmToken.trim() === '') {
    return res.status(400).json({ error: 'fcmToken is required and must be a non-empty string' });
  }

  try {
    await db.query(
      'UPDATE users SET fcm_token = $1 WHERE id = $2',
      [fcmToken.trim(), userId]
    );

    console.log(`📲 FCM token registered for user ${userId}`);
    res.json({ success: true, message: 'FCM token registered successfully' });

  } catch (error) {
    console.error('❌ registerFcmToken Error:', error.message);
    res.status(500).json({ error: 'Failed to register FCM token' });
  }
};

// ─────────────────────────────────────────────────────────────
// Update notification preferences (on/off + reminder time)
// PATCH /api/users/notifications
// Body: { enabled?: boolean, notification_time?: "HH:MM" (IST, 24h) }
//
// notification_time rules:
//   • Format: "HH:MM" 24-hour IST  (e.g. "09:30", "20:00")
//   • Minutes must be 00, 15, 30, or 45  (15-minute intervals)
//   • Stored as UTC internally; returned as IST in API responses
// ─────────────────────────────────────────────────────────────
exports.updateNotificationPreference = async (req, res) => {
  const userId = req.user.userId;
  const { enabled, notification_time } = req.body;

  // ── Validate `enabled` (optional field) ──────────────────────
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return res.status(400).json({ error: '"enabled" must be a boolean (true or false)' });
  }

  // ── Validate `notification_time` (optional field) ─────────────
  let utcTime = null;
  if (notification_time !== undefined) {
    if (!TIME_REGEX.test(notification_time)) {
      return res.status(400).json({
        error: 'notification_time must be HH:MM in 24-hour IST format (e.g. "09:30")',
      });
    }
    const minute = Number(notification_time.split(':')[1]);
    if (!VALID_NOTIF_MINUTES.has(minute)) {
      return res.status(400).json({
        error: 'notification_time minutes must be 00, 15, 30, or 45 (15-minute intervals only)',
      });
    }
    utcTime = istToUtc(notification_time); // convert IST → UTC before saving
  }

  // ── At least one field required ───────────────────────────────
  if (enabled === undefined && notification_time === undefined) {
    return res.status(400).json({
      error: 'Provide at least one of: enabled (boolean), notification_time (HH:MM IST)',
    });
  }

  try {
    // Build SET clause dynamically — only update fields that were sent
    const fields = [];
    const values = [];
    let i = 1;

    if (enabled !== undefined) {
      fields.push(`notifications_enabled = $${i++}`);
      values.push(enabled);
    }
    if (utcTime !== null) {
      fields.push(`notification_time = $${i++}`);
      values.push(utcTime);
    }

    values.push(userId);
    await db.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`,
      values
    );

    console.log(
      `🔔 Notification prefs updated for user ${userId}` +
      (enabled !== undefined       ? ` | enabled=${enabled}` : '') +
      (utcTime                     ? ` | time=${utcTime} UTC (${notification_time} IST)` : '')
    );

    res.json({
      success: true,
      message: 'Notification preferences updated',
      ...(enabled !== undefined           && { notificationsEnabled: enabled }),
      ...(notification_time !== undefined  && { notificationTime: notification_time }),
    });

  } catch (error) {
    console.error('❌ updateNotificationPreference Error:', error.message);
    res.status(500).json({ error: 'Failed to update notification preference' });
  }
};
