const discordUserService = require('../services/discordUserService');

// Initiate Discord OAuth2 authentication
exports.initiateAuth = async (req, res) => {
  const userId = req.user.userId;

  console.log('🔗 Discord auth initiation for user:', userId);

  try {
    // Check if user is already connected
    const connectionStatus = await discordUserService.checkDiscordConnection(userId);

    if (connectionStatus.connected) {
      return res.json({
        success: false,
        alreadyConnected: true,
        message: 'Discord account already connected',
        discordUsername: connectionStatus.discordUsername
      });
    }

    // Generate OAuth2 URL
    const authData = await discordUserService.initiateDiscordAuth(userId);

    res.json({
      success: true,
      authUrl: authData.authUrl,
      stateToken: authData.stateToken,
      expiresAt: authData.expiresAt,
      message: 'Please complete Discord authentication'
    });

  } catch (error) {
    console.error('❌ Discord auth initiation error:', error.message);
    res.status(500).json({
      error: 'Failed to initiate Discord authentication',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
// Handle Discord OAuth2 callback
exports.handleCallback = async (req, res) => {
  const { code, state, error } = req.query;

  console.log('🔐 Discord OAuth callback received');

  try {
    // Discord-side OAuth error
    if (error) {
      console.log('❌ Discord OAuth error:', error);
      return res.redirect(
        `plantdoctor://plantdoctor.com/discord-auth-complete?success=false&error=${encodeURIComponent(error)}`
      );
    }

    // Missing params (invalid callback)
    if (!code || !state) {
      return res.redirect(
        `plantdoctor://plantdoctor.com/discord-auth-complete?success=false&error=${encodeURIComponent(
          'Missing authorization code or state'
        )}`
      );
    }

    // Process OAuth
    const result = await discordUserService.handleDiscordCallback(code, state);

    // Success
    const redirectUrl =
      `plantdoctor://plantdoctor.com/discord-auth-complete?success=true&username=${encodeURIComponent(
        result.discordUser.username
      )}`;

    console.log('✅ Discord OAuth successful, redirecting to app');
    return res.redirect(redirectUrl);

  } catch (err) {
    console.error('❌ Discord callback error:', err.message);

    return res.redirect(
      `plantdoctor://plantdoctor.com/discord-auth-complete?success=false&error=${encodeURIComponent(
        err.message
      )}`
    );
  }
};

// Get Discord connection status
exports.getDiscordStatus = async (req, res) => {
  const userId = req.user.userId;

  try {
    const connectionStatus = await discordUserService.checkDiscordConnection(userId);

    res.json({
      connected: connectionStatus.connected,
      discordUserId: connectionStatus.discordUserId,
      discordUsername: connectionStatus.discordUsername
    });

  } catch (error) {
    console.error('❌ Get Discord status error:', error.message);
    res.status(500).json({
      error: 'Failed to get Discord status'
    });
  }
};

// Unlink Discord account
exports.unlinkAccount = async (req, res) => {
  const userId = req.user.userId;

  console.log('🔗 Discord account unlink for user:', userId);

  try {
    await discordUserService.unlinkDiscordAccount(userId);

    res.json({
      success: true,
      message: 'Discord account unlinked successfully'
    });

  } catch (error) {
    console.error('❌ Discord unlink error:', error.message);
    res.status(500).json({
      error: 'Failed to unlink Discord account',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Test Discord connection (for development)
exports.testConnection = async (req, res) => {
  console.log('🧪 Discord test endpoint called');
  try {
    // This is a simple test endpoint to verify Discord bot is working
    res.json({
      success: true,
      message: 'Discord service is running',
      botConfigured: !!process.env.DISCORD_BOT_TOKEN,
      clientConfigured: !!process.env.DISCORD_CLIENT_ID,
      guildConfigured: !!process.env.DISCORD_GUILD_ID,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Discord test error:', error.message);
    res.status(500).json({
      error: 'Discord service test failed',
      details: error.message
    });
  }
};