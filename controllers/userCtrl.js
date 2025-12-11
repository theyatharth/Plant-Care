const db = require('../configure/dbConfig');
const jwt = require('jsonwebtoken');
const s3Service = require('../services/s3Service');

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
      'SELECT id, email, name, phone, profile_photo_url, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
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
