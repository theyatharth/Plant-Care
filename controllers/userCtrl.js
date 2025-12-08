const db = require('../configure/dbConfig');
const jwt = require('jsonwebtoken');

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
      'SELECT id, phone, name, email, created_at FROM users WHERE phone = $1',
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
        'INSERT INTO users (phone, name, email) VALUES ($1, $2, $3) RETURNING id, phone, name, email, created_at',
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
          'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING id, phone, name, email, created_at',
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
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Login/Register Error:', error.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, phone, created_at FROM users WHERE id = $1',
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
      'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING id, phone, name, email, created_at',
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
