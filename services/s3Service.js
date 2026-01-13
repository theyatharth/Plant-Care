const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require('crypto');

// Load environment variables
require('dotenv').config();

function base64ToBuffer(base64Image) {
  const clean = base64Image.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(clean, "base64");
}

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

exports.uploadImage = async (imageInput, userId) => {
  try {
    if (!BUCKET_NAME) {
      throw new Error("AWS_S3_BUCKET_NAME not configured");
    }

    let imageBuffer;
    let mimeType = "image/jpeg";

    // Case 1: Base64 image (FlutterFlow / Claude)
    if (typeof imageInput === "string") {
      imageBuffer = base64ToBuffer(imageInput);

      const match = imageInput.match(/^data:(image\/\w+);base64,/);
      if (match) mimeType = match[1];
    }

    // Case 2: Buffer image (PlantNet)
    else if (Buffer.isBuffer(imageInput)) {
      imageBuffer = imageInput;
    }

    else {
      throw new Error("Invalid image input type");
    }

    const extMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };

    const ext = extMap[mimeType] || "jpg";

    const fileName = `scans/${userId}/${Date.now()}-${crypto
      .randomBytes(6)
      .toString("hex")}.${ext}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: imageBuffer,
        ContentType: mimeType
      })
    );

    const imageUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${fileName}`;

    console.log("✅ Image uploaded to S3:", imageUrl);

    return imageUrl;

  } catch (error) {
    console.error("❌ S3 Upload Failed:", error.message);
    throw new Error("Failed to upload image to S3: " + error.message);
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

    const { ext, mime } = detectImageType(base64Image);
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');
    console.log('- Profile photo size:', imageBuffer.length, 'bytes');

    // Generate unique filename for profile photo
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const fileName = `profile-photos/${userId}/${timestamp}-${randomString}.${ext}`;
    console.log('- Profile photo file name:', fileName);

    // Prepare S3 upload parameters
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: imageBuffer,
      ContentType: mime
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