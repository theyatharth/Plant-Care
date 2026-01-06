const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('../configure/dbConfig');

class DiscordUserService {
  constructor() {
    this.client = null;
    this.initializeBot();
  }

  // Generate 6-digit OTP (utility method)
  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Initialize Discord bot
  async initializeBot() {
    try {
      if (!process.env.DISCORD_BOT_TOKEN) {
        console.log('⚠️ Discord bot token not configured');
        return;
      }

      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMembers
        ]
      });

      this.client.once('ready', () => {
        console.log('✅ Discord bot initialized:', this.client.user.tag);
      });

      await this.client.login(process.env.DISCORD_BOT_TOKEN);
    } catch (error) {
      console.error('❌ Discord bot initialization failed:', error.message);
    }
  }

  // Generate OAuth2 authorization URL
  async initiateDiscordAuth(userId) {
    try {
      // Generate secure state token
      const stateToken = uuidv4();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store state in database
      await db.query(
        'INSERT INTO discord_auth_states (user_id, state_token, expires_at) VALUES ($1, $2, $3)',
        [userId, stateToken, expiresAt]
      );

      // Build OAuth2 URL
      const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: 'identify guilds.join',
        state: stateToken
      });

      const authUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

      console.log('🔗 Generated Discord auth URL for user:', userId);
      return {
        authUrl,
        stateToken,
        expiresAt
      };

    } catch (error) {
      console.error('❌ Error generating Discord auth URL:', error.message);
      throw error;
    }
  }

  // Handle OAuth2 callback
  async handleDiscordCallback(code, state) {
    try {
      console.log('🔐 Processing Discord OAuth callback...');

      // Verify state token
      const stateResult = await db.query(
        'SELECT user_id FROM discord_auth_states WHERE state_token = $1 AND expires_at > NOW() AND used = FALSE',
        [state]
      );

      if (stateResult.rows.length === 0) {
        throw new Error('Invalid or expired state token');
      }

      const userId = stateResult.rows[0].user_id;

      // Mark state as used
      await db.query(
        'UPDATE discord_auth_states SET used = TRUE WHERE state_token = $1',
        [state]
      );

      // Exchange code for access token
      const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', {
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      // Get user info from Discord
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      });

      const discordUser = userResponse.data;

      // Add user to Discord server
      await this.addUserToGuild(discordUser.id, access_token);

      // Update user in database
      await db.query(`
        UPDATE users SET 
          discord_user_id = $1,
          discord_username = $2,
          discord_discriminator = $3,
          discord_avatar = $4,
          discord_access_token = $5,
          discord_refresh_token = $6,
          discord_token_expires_at = $7,
          discord_joined_at = CURRENT_TIMESTAMP,
          discord_connected = TRUE
        WHERE id = $8
      `, [
        discordUser.id,
        discordUser.username,
        discordUser.discriminator || '0000',
        discordUser.avatar,
        access_token,
        refresh_token,
        expiresAt,
        userId
      ]);

      console.log('✅ Discord account linked for user:', userId);
      console.log('Discord user:', discordUser.username);

      return {
        success: true,
        discordUser: {
          id: discordUser.id,
          username: discordUser.username,
          discriminator: discordUser.discriminator,
          avatar: discordUser.avatar
        }
      };

    } catch (error) {
      console.error('❌ Discord OAuth callback error:', error.message);
      throw error;
    }
  }

  // Add user to Discord server
  async addUserToGuild(discordUserId, accessToken) {
    try {
      if (!this.client || !process.env.DISCORD_GUILD_ID) {
        console.log('⚠️ Discord bot or guild ID not configured');
        return;
      }

      const guild = await this.client.guilds.fetch(process.env.DISCORD_GUILD_ID);

      // Check if user is already in guild
      try {
        const existingMember = await guild.members.fetch(discordUserId);
        console.log('✅ User already in Discord server:', existingMember.user.username);
        return existingMember;
      } catch (error) {
        // User not in guild, proceed to add them
      }

      // Add user to guild
      const member = await guild.members.add(discordUserId, {
        access_token: accessToken,
        nick: 'Ecofynd Plant Doctor User' // Optional nickname
      });

      console.log('✅ Added user to Discord server:', member.user.username);
      return member;

    } catch (error) {
      console.error('❌ Error adding user to Discord server:', error.message);
      // Don't throw error - user linking can still succeed
    }
  }

  // Check if user has Discord account linked
  async checkDiscordConnection(userId) {
    try {
      const result = await db.query(
        'SELECT discord_user_id, discord_username, discord_connected FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return { connected: false };
      }

      const user = result.rows[0];
      return {
        connected: user.discord_connected,
        discordUserId: user.discord_user_id,
        discordUsername: user.discord_username
      };

    } catch (error) {
      console.error('❌ Error checking Discord connection:', error.message);
      return { connected: false };
    }
  }

  // Post message as user to Discord channel
  async postAsUser(userId, scanData, userMessage = '') {
    try {
      console.log('📤 Posting to Discord as user:', userId);

      // Get user's Discord info
      const userResult = await db.query(
        'SELECT discord_user_id, discord_access_token, discord_token_expires_at FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0 || !userResult.rows[0].discord_user_id) {
        throw new Error('User not connected to Discord');
      }

      const { discord_user_id, discord_access_token, discord_token_expires_at } = userResult.rows[0];

      // Check if token is expired
      if (new Date() >= new Date(discord_token_expires_at)) {
        throw new Error('Discord token expired - user needs to reconnect');
      }

      // Determine channel ID based on plant health
      const channelId = scanData.isHealthy
        ? process.env.DISCORD_HEALTHY_CHANNEL_ID
        : process.env.DISCORD_SICK_CHANNEL_ID;

      if (!channelId) {
        throw new Error('Discord channel not configured');
      }

      // Format message content
      const messageContent = this.formatDiscordMessage(scanData, userMessage);

      // Post message using user's token
      const response = await axios.post(`https://discord.com/api/channels/${channelId}/messages`, {
        content: messageContent.content,
        embeds: messageContent.embeds
      }, {
        headers: {
          'Authorization': `Bearer ${discord_access_token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Message posted to Discord successfully');

      return {
        success: true,
        messageId: response.data.id,
        messageUrl: `https://discord.com/channels/${process.env.DISCORD_GUILD_ID}/${channelId}/${response.data.id}`,
        channelId: channelId
      };

    } catch (error) {
      console.error('❌ Error posting to Discord as user:', error.message);
      throw error;
    }
  }

  // Format message for Discord
  formatDiscordMessage(scanData, userMessage) {
    const healthEmoji = scanData.isHealthy ? '✅' : '⚠️';
    const healthText = scanData.isHealthy ? 'Healthy & Thriving!' : 'Needs Attention';

    // Main message content
    let content = `🌿 **${scanData.plantName}** - ${healthEmoji} ${healthText}\n`;

    if (userMessage) {
      content += `\n💬 "${userMessage}"\n`;
    }

    if (!scanData.isHealthy && scanData.diseaseName && scanData.diseaseName !== 'None') {
      content += `\n🦠 **Issue Detected:** ${scanData.diseaseName}`;
    }

    // Create embed for rich content
    const embed = {
      color: scanData.isHealthy ? 0x4CAF50 : 0xFF5722,
      title: `🌱 ${scanData.plantName}`,
      description: scanData.scientificName || 'Plant species information',
      fields: [
        {
          name: '🏥 Health Status',
          value: `${healthEmoji} ${healthText}`,
          inline: true
        },
        {
          name: '🎯 Confidence',
          value: `${Math.round((scanData.confidence || 0) * 100)}%`,
          inline: true
        }
      ],
      image: {
        url: scanData.imageUrl
      },
      footer: {
        text: 'Ecofynd Plant Doctor - AI Plant Analysis',
        icon_url: 'https://your-domain.com/logo.png'
      },
      timestamp: new Date().toISOString()
    };

    // Add treatment recommendations if plant is sick
    if (!scanData.isHealthy && scanData.fullResponse?.treatment) {
      const treatment = scanData.fullResponse.treatment;
      let treatmentText = '';

      if (Array.isArray(treatment)) {
        treatmentText = treatment.slice(0, 3).map(item => `• ${item}`).join('\n');
      } else if (typeof treatment === 'object') {
        treatmentText = Object.entries(treatment)
          .slice(0, 3)
          .map(([key, value]) => `• **${key}**: ${value}`)
          .join('\n');
      }

      if (treatmentText) {
        embed.fields.push({
          name: '💊 Treatment Recommendations',
          value: treatmentText,
          inline: false
        });
      }
    }

    // Add hashtags
    const hashtags = [
      '#EcofyndPlantDoctor',
      `#${scanData.plantName.replace(/\s+/g, '')}`,
      scanData.isHealthy ? '#HealthyPlants' : '#PlantSOS'
    ];

    content += `\n${hashtags.join(' ')}`;

    return {
      content: content,
      embeds: [embed]
    };
  }

  // Unlink Discord account
  async unlinkDiscordAccount(userId) {
    try {
      await db.query(`
        UPDATE users SET 
          discord_user_id = NULL,
          discord_username = NULL,
          discord_discriminator = NULL,
          discord_avatar = NULL,
          discord_access_token = NULL,
          discord_refresh_token = NULL,
          discord_token_expires_at = NULL,
          discord_joined_at = NULL,
          discord_connected = FALSE
        WHERE id = $1
      `, [userId]);

      console.log('✅ Discord account unlinked for user:', userId);
      return { success: true };

    } catch (error) {
      console.error('❌ Error unlinking Discord account:', error.message);
      throw error;
    }
  }

  // Refresh Discord access token
  async refreshDiscordToken(userId) {
    try {
      const userResult = await db.query(
        'SELECT discord_refresh_token FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0 || !userResult.rows[0].discord_refresh_token) {
        throw new Error('No refresh token available');
      }

      const refreshToken = userResult.rows[0].discord_refresh_token;

      const response = await axios.post('https://discord.com/api/oauth2/token', {
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token, refresh_token, expires_in } = response.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      // Update tokens in database
      await db.query(`
        UPDATE users SET 
          discord_access_token = $1,
          discord_refresh_token = $2,
          discord_token_expires_at = $3
        WHERE id = $4
      `, [access_token, refresh_token || refreshToken, expiresAt, userId]);

      console.log('✅ Discord token refreshed for user:', userId);
      return { success: true };

    } catch (error) {
      console.error('❌ Error refreshing Discord token:', error.message);
      throw error;
    }
  }
}

module.exports = new DiscordUserService();