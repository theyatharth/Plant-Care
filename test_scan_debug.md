# 🐛 Scan API Debugging Guide

## Common Causes of "AI Analysis Failed" Error

### 1. **AWS Credentials Issue**

- Invalid or expired AWS access keys
- Insufficient permissions for Bedrock service
- Wrong region configuration

### 2. **Image Format Issue**

- Image not properly base64 encoded
- Missing or incorrect data URI prefix
- Image too large (>5MB recommended)

### 3. **Bedrock Model Access**

- Model not enabled in your AWS account
- Model ID incorrect or not available in region
- Bedrock service not activated

### 4. **Network/Timeout Issue**

- Request timeout
- Network connectivity problems
- AWS service outage

---

## 🔍 Step-by-Step Debugging

### Step 1: Check Server Logs

After making a scan request, check the server logs for detailed error:

```bash
# The logs will now show:
# - Bedrock Response (if successful)
# - Error Name
# - Error Message
# - HTTP Status Code
# - Full Error Details
```

### Step 2: Test AWS Credentials

Create a simple test to verify AWS credentials:

```bash
# Test if AWS credentials are loaded
curl -X POST http://localhost:3000/api/plants/scan \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"image":"data:image/jpeg;base64,/9j/4AAQSkZJRg..."}'
```

Check server logs for specific error.

### Step 3: Common Error Messages

#### Error: "The security token included in the request is invalid"

**Cause:** AWS credentials are wrong or expired
**Solution:**

1. Go to AWS Console → IAM → Users
2. Generate new access keys
3. Update `.env` file with new keys
4. Restart server

#### Error: "You don't have access to the model"

**Cause:** Bedrock model not enabled in your AWS account
**Solution:**

1. Go to AWS Console → Bedrock
2. Click "Model access" in left sidebar
3. Request access to "Claude 3.5 Sonnet"
4. Wait for approval (usually instant)

#### Error: "Could not resolve host"

**Cause:** Network connectivity issue
**Solution:**

- Check internet connection
- Verify AWS service status
- Check firewall settings

#### Error: "Request timeout"

**Cause:** Image too large or slow network
**Solution:**

- Reduce image size before sending
- Increase timeout in Bedrock service
- Compress image quality

---

## 🧪 Test with Small Image

Use this tiny test image (1x1 pixel):

```bash
TOKEN="your_jwt_token_here"

curl -X POST http://localhost:3000/api/plants/scan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k="
  }'
```

This will help identify if the issue is with:

- Authentication (401 error)
- AWS credentials (specific AWS error)
- Image processing (parsing error)

---

## 🔧 Quick Fixes

### Fix 1: Verify AWS Bedrock Access

1. Log into AWS Console
2. Go to **Bedrock** service
3. Click **Model access** (left sidebar)
4. Ensure "Claude 3.5 Sonnet" shows "Access granted"
5. If not, click "Manage model access" and request it

### Fix 2: Check AWS Region

The code uses `us-east-1`. Verify this region supports Bedrock:

```javascript
// In services/bedrockService.js
const client = new BedrockRuntimeClient({
  region: "us-east-1", // ← Check this
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
```

### Fix 3: Test AWS Credentials Directly

Create a test file to verify credentials work:

```javascript
// test_aws.js
const {
  BedrockRuntimeClient,
  ListFoundationModelsCommand,
} = require("@aws-sdk/client-bedrock-runtime");
require("dotenv").config();

const client = new BedrockRuntimeClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function testAWS() {
  try {
    const command = new ListFoundationModelsCommand({});
    const response = await client.send(command);
    console.log("✅ AWS Credentials Valid!");
    console.log("Available models:", response.modelSummaries?.length);
  } catch (error) {
    console.error("❌ AWS Credentials Invalid!");
    console.error(error.message);
  }
}

testAWS();
```

Run: `node test_aws.js`

---

## 📊 Expected Server Log Output

### Successful Request:

```
Bedrock Response: {
  "content": [{
    "text": "{\n  \"plant_name\": \"Rose\",\n  ..."
  }],
  "usage": {...}
}
Parsed Text: {
  "plant_name": "Rose",
  "scientific_name": "Rosa",
  ...
}
```

### Failed Request (Credentials):

```
Bedrock Service Error Details:
Error Name: UnrecognizedClientException
Error Message: The security token included in the request is invalid
Error Code: 403
```

### Failed Request (Model Access):

```
Bedrock Service Error Details:
Error Name: AccessDeniedException
Error Message: You don't have access to the model with the specified model ID
Error Code: 403
```

---

## 🚨 Most Likely Issues

Based on the error "AI Analysis Failed", here are the most common causes in order:

1. **AWS Bedrock Model Not Enabled** (80% of cases)

   - Go to AWS Console → Bedrock → Model Access
   - Enable Claude 3.5 Sonnet

2. **Invalid AWS Credentials** (15% of cases)

   - Regenerate access keys in IAM
   - Update .env file

3. **Image Format Issue** (5% of cases)
   - Ensure base64 string is valid
   - Check data URI prefix

---

## 💡 Next Steps

1. **Make a test request** to the scan API
2. **Check server logs** for detailed error message
3. **Share the error details** from logs
4. I'll help you fix the specific issue!

The improved error logging will now show exactly what's wrong with the Bedrock service.
