const axios = require('axios');
const FormData = require('form-data');

require('dotenv').config();

const PLANTNET_API_URL = 'https://my-api.plantnet.org/v2/identify';

exports.identifyPlantWithPlantNet = async (imageBuffer) => {
  try {
    const form = new FormData();

    // Required field
    form.append('images', imageBuffer, {
      filename: 'plant.jpg',
      contentType: 'image/jpeg'
    });

    // Optional but recommended
    form.append('organs', 'leaf');

    const response = await axios.post(
      `${PLANTNET_API_URL}/all`,
      form,
      {
        params: {
          'api-key': process.env.PLANTNET_API_KEY
        },
        headers: form.getHeaders(),
        timeout: 15000
      }
    );

    return response.data;

  } catch (error) {
    console.error('❌ PlantNet API Error');

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }

    throw new Error('PlantNet identification failed');
  }
};
