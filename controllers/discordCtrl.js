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
    // Check for OAuth errors
    if (error) {
      console.log('❌ Discord OAuth error:', error);
      return res.status(400).json({
        error: 'Discord authentication failed',
        details: error
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        error: 'Missing authorization code or state'
      });
    }

    // Process the callback
    const result = await discordUserService.handleDiscordCallback(code, state);

    // Return success response (you might want to redirect to your app)
    res.json({
      success: true,
      message: 'Discord account connected successfully!',
      discordUser: result.discordUser
    });

  } catch (error) {
    console.error('❌ Discord callback error:', error.message);
    res.status(500).json({
      error: 'Failed to process Discord authentication',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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