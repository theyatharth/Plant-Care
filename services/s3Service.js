const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require('crypto');

// Load environment variables
require('dotenv').config();

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const REGION = process.env.AWS_S3_REGION || "ap-south-1";

// Initialize S3 Client with separate S3 credentials
const s3Client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY?.trim()
  }
});

/**
 * Upload base64 image to S3
 * @param {string} base64Image - Base64 encoded image with data URI
 * @param {string} userId - User ID for organizing files
 * @returns {Promise<string>} - Public URL of uploaded image
 */
exports.uploadImage = async (base64Image, userId) => {
  try {
    console.log('🔧 S3 Upload Debug:');
    console.log('- Bucket:', BUCKET_NAME);
    console.log('- Region:', REGION);
    console.log('- S3 Access Key:', process.env.AWS_S3_ACCESS_KEY_ID?.substring(0, 8) + '...');

    if (!BUCKET_NAME) {
      throw new Error('AWS_S3_BUCKET_NAME not configured');
    }

    // Remove data URI prefix if present
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');
    console.log('- Image size:', imageBuffer.length, 'bytes');

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const fileName = `scans/${userId}/${timestamp}-${randomString}.jpg`;
    console.log('- File name:', fileName);

    // Prepare S3 upload parameters (removed ACL for now)
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: imageBuffer,
      ContentType: 'image/jpeg'
    };

    console.log('- Uploading to S3...');

    // Upload to S3
    const command = new PutObjectCommand(uploadParams);
    const result = await s3Client.send(command);

    console.log('- Upload result:', result.$metadata?.httpStatusCode);

    // Construct public URL
    const imageUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${fileName}`;

    console.log('✅ Image uploaded to S3:', imageUrl);

    return imageUrl;
  } catch (error) {
    console.error('❌ S3 Upload Error Details:');
    console.error('- Error name:', error.name);
    console.error('- Error message:', error.message);
    console.error('- Error code:', error.Code || error.$metadata?.httpStatusCode);
    console.error('- Full error:', error);
    throw new Error('Failed to upload image to S3: ' + error.message);
  }
};

/**
 * Upload profile photo to S3
 * @param {string} base64Image - Base64 encoded image with data URI
 * @param {string} userId - User ID for organizing files
 * @returns {Promise<string>} - Public URL of uploaded profile photo
 */
exports.uploadProfilePhoto = async (base64Image, userId) => {
  try {
    console.log('🔧 S3 Profile Photo Upload Debug:');
    console.log('- Bucket:', BUCKET_NAME);
    console.log('- Region:', REGION);
    console.log('- S3 Access Key:', process.env.AWS_S3_ACCESS_KEY_ID?.substring(0, 8) + '...');

    if (!BUCKET_NAME) {
      throw new Error('AWS_S3_BUCKET_NAME not configured');
    }

    // Remove data URI prefix if present
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');
    console.log('- Profile photo size:', imageBuffer.length, 'bytes');

    // Generate unique filename for profile photo
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const fileName = `profile-photos/${userId}/${timestamp}-${randomString}.jpg`;
    console.log('- Profile photo file name:', fileName);

    // Prepare S3 upload parameters
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: imageBuffer,
      ContentType: 'image/jpeg'
    };

    console.log('- Uploading profile photo to S3...');

    // Upload to S3
    const command = new PutObjectCommand(uploadParams);
    const result = await s3Client.send(command);

    console.log('- Upload result:', result.$metadata?.httpStatusCode);

    // Construct public URL
    const imageUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${fileName}`;

    console.log('✅ Profile photo uploaded to S3:', imageUrl);

    return imageUrl;
  } catch (error) {
    console.error('❌ S3 Profile Photo Upload Error Details:');
    console.error('- Error name:', error.name);
    console.error('- Error message:', error.message);
    console.error('- Error code:', error.Code || error.$metadata?.httpStatusCode);
    console.error('- Full error:', error);
    throw new Error('Failed to upload profile photo to S3: ' + error.message);
  }
};

/**
 * Get image URL from S3 key
 * @param {string} key - S3 object key
 * @returns {string} - Public URL
 */
exports.getImageUrl = (key) => {
  return `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
};