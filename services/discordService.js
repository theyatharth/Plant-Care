const axios = require('axios');
require('dotenv').config();

// // Discord webhook URLs for different channels
// const DISCORD_WEBHOOKS = {
//   healthy: process.env.DISCORD_WEBHOOK_HEALTHY_PLANTS,
//   sick: process.env.DISCORD_WEBHOOK_PLANT_ISSUES,
//   general: process.env.DISCORD_WEBHOOK_GENERAL
// };

// /**
//  * Share scan result to Discord community
//  * @param {Object} scanData - Scan result data
//  * @param {Object} userData - User information
//  * @returns {Promise<Object>} - Discord post result
//  */
// exports.shareToDiscord = async (scanData, userData) => {
//   try {
//     console.log('🔗 Sharing scan to Discord community...');
//     console.log('- Plant:', scanData.plantName);
//     console.log('- Health:', scanData.healthStatus);
//     console.log('- User:', userData.name);

//     // Determine which channel to post to
//     const webhookUrl = scanData.isHealthy
//       ? DISCORD_WEBHOOKS.healthy
//       : DISCORD_WEBHOOKS.sick;

//     if (!webhookUrl) {
//       throw new Error('Discord webhook URL not configured');
//     }

//     // Create Discord embed
//     const embed = createDiscordEmbed(scanData, userData);

//     // Post to Discord
//     const response = await axios.post(webhookUrl, {
//       username: 'PlantCare Bot',
//       avatar_url: 'https://your-domain.com/plantcare-bot-avatar.png', // Optional bot avatar
//       embeds: [embed]
//     });

//     console.log('✅ Successfully shared to Discord');

//     return {
//       success: true,
//       messageId: response.data?.id,
//       channelType: scanData.isHealthy ? 'healthy' : 'sick',
//       webhookUrl: webhookUrl
//     };

//   } catch (error) {
//     console.error('❌ Discord Share Error:', error.message);
//     console.error('Error details:', error.response?.data || error);
//     throw new Error('Failed to share to Discord community: ' + error.message);
//   }
// };

// /**
//  * Create rich Discord embed for scan result
//  * @param {Object} scanData - Scan result data
//  * @param {Object} userData - User information
//  * @returns {Object} - Discord embed object
//  */
// function createDiscordEmbed(scanData, userData) {
//   // Determine embed color based on health status
//   const embedColor = scanData.isHealthy ? 0x4CAF50 : 0xFF5722; // Green for healthy, Red for sick

//   // Create health status emoji and text
//   const healthEmoji = scanData.isHealthy ? '✅' : '⚠️';
//   const healthText = scanData.isHealthy ? 'Healthy & Thriving!' : 'Needs Attention';

//   // Format confidence percentage
//   const confidencePercent = Math.round((scanData.confidence || 0) * 100);

//   // Create treatment/care recommendations
//   const recommendations = scanData.fullResponse?.treatment || scanData.fullResponse?.care_guide;
//   let recommendationText = '';

//   if (recommendations) {
//     if (Array.isArray(recommendations)) {
//       recommendationText = recommendations.map(item => `• ${item}`).join('\n');
//     } else if (typeof recommendations === 'object') {
//       recommendationText = Object.entries(recommendations)
//         .map(([key, value]) => `• **${key.charAt(0).toUpperCase() + key.slice(1)}**: ${value}`)
//         .join('\n');
//     }
//   }

//   // Create embed object
//   const embed = {
//     title: `🌿 PlantCare Community - New Scan Result`,
//     description: `A fellow plant parent needs your expertise!`,
//     color: embedColor,
//     thumbnail: {
//       url: scanData.imageUrl || 'https://your-domain.com/default-plant-icon.png'
//     },
//     fields: [
//       {
//         name: '👤 Plant Parent',
//         value: userData.name || 'Anonymous Gardener',
//         inline: true
//       },
//       {
//         name: '🌱 Plant Species',
//         value: `**${scanData.plantName}**\n*${scanData.scientificName}*`,
//         inline: true
//       },
//       {
//         name: '🏥 Health Status',
//         value: `${healthEmoji} ${healthText}`,
//         inline: true
//       }
//     ],
//     footer: {
//       text: `PlantCare AI • Confidence: ${confidencePercent}%`,
//       icon_url: 'https://your-domain.com/plantcare-logo-small.png'
//     },
//     timestamp: new Date().toISOString()
//   };

//   // Add disease information if plant is sick
//   if (!scanData.isHealthy && scanData.diseaseName && scanData.diseaseName !== 'None') {
//     embed.fields.push({
//       name: '🦠 Issue Detected',
//       value: `**${scanData.diseaseName}**`,
//       inline: false
//     });
//   }

//   // Add AI recommendations
//   if (recommendationText) {
//     embed.fields.push({
//       name: scanData.isHealthy ? '🌿 Care Tips' : '💊 Treatment Recommendations',
//       value: recommendationText.length > 1024
//         ? recommendationText.substring(0, 1021) + '...'
//         : recommendationText,
//       inline: false
//     });
//   }

//   // Add community engagement call-to-action
//   const ctaText = scanData.isHealthy
//     ? '💬 Share your experience with this beautiful plant!\n🤝 Any additional care tips for this plant parent?'
//     : '💬 Have you dealt with this issue before?\n🤝 Share your treatment experience and help a fellow gardener!';

//   embed.fields.push({
//     name: '🌟 Community Help Needed',
//     value: ctaText,
//     inline: false
//   });

//   // Add hashtags
//   const hashtags = [
//     '#PlantCare',
//     `#${scanData.plantName.replace(/\s+/g, '')}`,
//     scanData.isHealthy ? '#HealthyPlants' : '#PlantSOS'
//   ];

//   if (!scanData.isHealthy && scanData.diseaseName && scanData.diseaseName !== 'None') {
//     hashtags.push(`#${scanData.diseaseName.replace(/\s+/g, '')}`);
//   }

//   embed.fields.push({
//     name: '🏷️ Tags',
//     value: hashtags.join(' '),
//     inline: false
//   });

//   return embed;
// }

// /**
//  * Get Discord webhook health check
//  * @returns {Promise<Object>} - Webhook status
//  */
// exports.checkDiscordWebhooks = async () => {
//   const results = {};

//   for (const [channel, webhookUrl] of Object.entries(DISCORD_WEBHOOKS)) {
//     if (!webhookUrl) {
//       results[channel] = { status: 'not_configured', error: 'Webhook URL not set' };
//       continue;
//     }

//     try {
//       // Test webhook with a simple message
//       await axios.post(webhookUrl, {
//         username: 'PlantCare Bot',
//         content: 'Webhook health check - please ignore this message'
//       });

//       results[channel] = { status: 'healthy' };
//     } catch (error) {
//       results[channel] = {
//         status: 'error',
//         error: error.response?.data?.message || error.message
//       };
//     }
//   }

//   return results;
// };

exports.shareToDiscord = async (scanData, userData) => {
  try {
    const isHealthy = scanData.isHealthy;

    // 1. Choose Color (Green for Healthy, Red for Sick)
    // Green: 5763719, Red: 15158332
    const color = isHealthy ? 5763719 : 15158332;

    // 2. Format the Fields
    const fields = [
      { name: "🌿 Plant Parent", value: userData.name || "PlantCare User", inline: true },
      { name: "🌱 Plant Species", value: scanData.plantName, inline: true },
      { name: "❤️ Status", value: isHealthy ? "Healthy" : "Sick", inline: true }
    ];

    if (!isHealthy) {
      fields.push({ name: "🦠 Diagnosis", value: scanData.diseaseName || "Unknown Issue", inline: true });

      // Add top treatment if available
      if (scanData.fullResponse?.treatment && scanData.fullResponse.treatment.length > 0) {
        const mainTreatment = scanData.fullResponse.treatment[0];
        fields.push({ name: "💊 Suggested Treatment", value: mainTreatment });
      }
    }

    // Add user message if present
    if (scanData.userMessage) {
      fields.push({ name: "🗣️ Question/Note", value: scanData.userMessage });
    }

    // 3. Construct the Payload
    const payload = {
      username: "PlantCare Bot",
      avatar_url: "https://cdn-icons-png.flaticon.com/512/628/628283.png",
      content: "",
      embeds: [
        {
          title: "🌱 New Plant Scan Shared!",
          description: `A user just shared their **${scanData.plantName}**.`,
          color: color,
          fields: fields,
          image: {
            url: scanData.imageUrl // MUST be a valid https:// link
          },
          footer: {
            text: "PlantCare App • Community Scan",
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    // 4. Send to Discord
    // We use the basic webhook URL (no ?wait=true needed for fire-and-forget)
    await axios.post(process.env.DISCORD_WEBHOOK_URL, payload);

    return true;

  } catch (error) {
    console.error("Discord Webhook Error:", error.message);
    // We throw the error so the controller knows it failed
    throw new Error("Failed to connect to Discord");
  }
};