# 🧪 Scan History Testing Guide

## ✅ What Was Fixed

### Changes Made:

1. **Improved Error Handling** - Better logging throughout the scan process
2. **Fixed JSON Storage** - Ensured `ai_raw_response` is properly stringified
3. **Enhanced History Response** - Returns formatted, easy-to-use scan data
4. **Added Detailed Logging** - Track every step of the scan process

---

## 📊 How Scan Data is Saved

### Scan Flow:

```
1. User sends image → /api/plants/scan
   ↓
2. Bedrock AI analyzes image
   ↓
3. Save plant species to plant_species table
   ↓
4. Save scan result to scans table
   ↓
5. Return scan ID and result
```

### Database Tables:

**plant_species** (Encyclopedia)

- Stores unique plant species information
- Updated on each scan (upsert)

**scans** (History)

- Stores every scan with full AI response
- Linked to user
- Includes health status, disease info

---

## 🧪 Testing Steps

### Step 1: Test Scan API

```bash
# Get a JWT token first (login/register)
TOKEN="your_jwt_token_here"

# Make a scan request
curl -X POST http://localhost:3000/api/plants/scan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,YOUR_BASE64_IMAGE"
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "scanId": "uuid-here",
  "speciesId": "uuid-here",
  "result": {
    "plant_name": "Rose",
    "scientific_name": "Rosa",
    "description": "...",
    "health_status": "Healthy",
    "disease_name": "None",
    "confidence": 0.95,
    "care_guide": {...},
    "treatment": [...]
  },
  "savedAt": "2025-12-04T10:44:53.902Z"
}
```

**Check Server Logs:**

```
📸 Scan request received for user: uuid
🤖 Calling Bedrock AI service...
✅ AI Analysis complete: Rose
📊 Database transaction started
🌿 Plant species saved/updated: uuid
✅ Scan saved to database: uuid
🔌 Database connection released
```

---

### Step 2: Test History API

```bash
# Get scan history
curl -X GET http://localhost:3000/api/plants/history \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**

```json
{
  "success": true,
  "count": 3,
  "scans": [
    {
      "id": "uuid",
      "createdAt": "2025-12-04T10:44:53.902Z",
      "isHealthy": true,
      "diseaseName": "None",
      "imageUrl": "s3://bucket/image_123",
      "plantName": "Rose",
      "scientificName": "Rosa",
      "healthStatus": "Healthy",
      "confidence": 0.95,
      "fullResponse": {
        "plant_name": "Rose",
        "scientific_name": "Rosa",
        "description": "...",
        "health_status": "Healthy",
        "disease_name": "None",
        "confidence": 0.95,
        "care_guide": {...},
        "treatment": [...]
      }
    }
  ]
}
```

**Check Server Logs:**

```
📜 Fetching scan history for user: uuid
✅ Found 3 scans for user
```

---

### Step 3: Test Single Scan Details

```bash
# Get specific scan
curl -X GET http://localhost:3000/api/plants/scan/SCAN_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**

```json
{
  "scan": {
    "id": "uuid",
    "user_id": "uuid",
    "plant_id": null,
    "image_url": "s3://bucket/image_123",
    "ai_raw_response": {...},
    "is_healthy": true,
    "disease_name": "None",
    "created_at": "2025-12-04T10:44:53.902Z"
  }
}
```

---

## 🔍 Debugging

### If Scan Doesn't Save:

**Check Server Logs for:**

1. `📸 Scan request received` - Request reached controller
2. `🤖 Calling Bedrock AI service` - AI analysis started
3. `✅ AI Analysis complete` - AI returned result
4. `📊 Database transaction started` - DB connection established
5. `🌿 Plant species saved/updated` - Species saved
6. `✅ Scan saved to database` - Scan saved successfully

**If you see:**

- `❌ Scan Controller Error` - Check the error message
- `⚠️ Database transaction rolled back` - Something failed, check logs

### Common Issues:

#### Issue 1: "AI Analysis Failed"

**Cause:** Bedrock service error
**Solution:** Check AWS credentials and model access

#### Issue 2: Database Error

**Cause:** Schema mismatch or connection issue
**Solution:**

```bash
# Verify scans table exists
psql -d PlantCare -c "\d scans"

# Check if user exists
psql -d PlantCare -c "SELECT id FROM users WHERE phone='9876543210';"
```

#### Issue 3: Empty History

**Cause:** Scans not being saved
**Solution:**

- Check server logs during scan
- Verify user_id in JWT token matches database
- Check database directly:

```sql
SELECT * FROM scans WHERE user_id = 'your-user-uuid';
```

---

## 📱 FlutterFlow Integration

### Display Scan History

**API Call Setup:**

- **Endpoint:** `GET /api/plants/history`
- **Headers:** `Authorization: Bearer [authToken]`

**Response Binding:**

```
scans → List of Scan objects
  ├── id (String)
  ├── createdAt (DateTime)
  ├── plantName (String)
  ├── scientificName (String)
  ├── healthStatus (String)
  ├── isHealthy (Boolean)
  ├── diseaseName (String)
  ├── confidence (Double)
  └── fullResponse (JSON)
```

**ListView Widget:**

```
ListView.builder(
  items: scans,
  itemBuilder: (context, scan) {
    return ListTile(
      title: Text(scan.plantName),
      subtitle: Text(scan.scientificName),
      trailing: Icon(
        scan.isHealthy ? Icons.check_circle : Icons.warning,
        color: scan.isHealthy ? Colors.green : Colors.red
      ),
      onTap: () => navigateToScanDetails(scan.id)
    );
  }
)
```

---

## 🗄️ Database Verification

### Check Scans Table:

```sql
-- Count total scans
SELECT COUNT(*) FROM scans;

-- View recent scans
SELECT
  id,
  user_id,
  ai_raw_response->>'plant_name' as plant_name,
  is_healthy,
  disease_name,
  created_at
FROM scans
ORDER BY created_at DESC
LIMIT 10;

-- Check scans for specific user
SELECT * FROM scans WHERE user_id = 'your-user-uuid';
```

### Check Plant Species:

```sql
-- View all plant species
SELECT
  id,
  common_name,
  scientific_name,
  created_at
FROM plant_species
ORDER BY created_at DESC;
```

---

## ✅ Success Indicators

**Scan is saved successfully when you see:**

1. ✅ Response includes `scanId` and `savedAt`
2. ✅ Server logs show "Scan saved to database"
3. ✅ History API returns the new scan
4. ✅ Database query shows the scan record

---

## 🚀 Next Steps

After confirming scans are saving:

1. **Test with real images** - Use actual plant photos
2. **Test multiple scans** - Verify history accumulates
3. **Test different users** - Ensure scans are user-specific
4. **Integrate with FlutterFlow** - Display history in app
5. **Add image upload to S3** - Replace placeholder URLs

---

## 📞 Support

If scans still aren't saving:

1. Share server logs from a scan attempt
2. Share database query results
3. Share the exact error message

The detailed logging will help identify exactly where the issue is!
