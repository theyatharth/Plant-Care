# FlutterFlow Integration Guide

## 🎯 Backend API Overview

Your backend is running at: `http://localhost:3000` (change to your production URL)

---

## 📋 API Endpoints Summary

### 1. Authentication APIs

#### Register User

- **Endpoint:** `POST /api/users/register`
- **Body:**

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "phone": "+1234567890"
}
```

- **Response:**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "phone": "+1234567890"
  }
}
```

#### Login

- **Endpoint:** `POST /api/users/login`
- **Body:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

- **Response:** Same as register

#### Get Profile (Protected)

- **Endpoint:** `GET /api/users/profile`
- **Headers:** `Authorization: Bearer {token}`
- **Response:**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "phone": "+1234567890",
    "created_at": "2025-12-04T10:44:53.902Z"
  }
}
```

---

### 2. Plant Encyclopedia APIs

#### Get All Plants

- **Endpoint:** `GET /api/encyclopedia?page=1&limit=20&search=rose`
- **Query Parameters:**
  - `page` (optional): Page number (default: 1)
  - `limit` (optional): Items per page (default: 20)
  - `search` (optional): Search term
- **Response:**

```json
{
  "plants": [
    {
      "id": "uuid",
      "scientific_name": "Rosa",
      "common_name": "Rose",
      "description": "Beautiful flowering plant",
      "created_at": "2025-12-04T10:44:53.902Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalPlants": 100,
    "limit": 20
  }
}
```

#### Get Single Plant

- **Endpoint:** `GET /api/encyclopedia/{plantId}`
- **Response:**

```json
{
  "plant": {
    "id": "uuid",
    "scientific_name": "Rosa",
    "common_name": "Rose",
    "description": "Beautiful flowering plant",
    "care_guide": {
      "water": "Regular watering",
      "sun": "Full sun"
    },
    "created_at": "2025-12-04T10:44:53.902Z"
  }
}
```

---

### 3. Plant Scanning APIs (Protected)

#### Scan Plant

- **Endpoint:** `POST /api/plants/scan`
- **Headers:** `Authorization: Bearer {token}`
- **Body:**

```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

- **Response:**

```json
{
  "success": true,
  "scanId": "uuid",
  "speciesId": "uuid",
  "result": {
    "plant_name": "Rose",
    "scientific_name": "Rosa",
    "description": "A beautiful flowering plant",
    "health_status": "Healthy",
    "disease_name": "None",
    "confidence": 0.95,
    "care_guide": {
      "water": "Regular watering",
      "sun": "Full sun"
    },
    "treatment": []
  }
}
```

#### Get Scan History

- **Endpoint:** `GET /api/plants/history`
- **Headers:** `Authorization: Bearer {token}`
- **Response:**

```json
{
  "scans": [
    {
      "id": "uuid",
      "created_at": "2025-12-04T10:44:53.902Z",
      "disease_name": "None",
      "is_healthy": true,
      "image_url": "s3://bucket/image_123",
      "ai_raw_response": { ... }
    }
  ]
}
```

#### Get Single Scan

- **Endpoint:** `GET /api/plants/scan/{scanId}`
- **Headers:** `Authorization: Bearer {token}`
- **Response:**

```json
{
  "scan": {
    "id": "uuid",
    "user_id": "uuid",
    "plant_id": null,
    "image_url": "s3://bucket/image_123",
    "ai_raw_response": { ... },
    "is_healthy": true,
    "disease_name": "None",
    "created_at": "2025-12-04T10:44:53.902Z"
  }
}
```

---

## 🔧 FlutterFlow Setup Steps

### Step 1: Create API Group

1. Go to **API Calls** in FlutterFlow
2. Create a new **API Group** called "PlantCareAPI"
3. Set Base URL: `https://your-backend-url.com` (or `http://localhost:3000` for testing)

### Step 2: Add Authentication APIs

#### Register API Call

- **Method:** POST
- **Endpoint:** `/api/users/register`
- **Body Type:** JSON
- **Body:**

```json
{
  "email": "[email]",
  "password": "[password]",
  "name": "[name]",
  "phone": "[phone]"
}
```

- **Response:** Parse `token` and `user` object
- **Action:** Save `token` to App State

#### Login API Call

- **Method:** POST
- **Endpoint:** `/api/users/login`
- **Body Type:** JSON
- **Body:**

```json
{
  "email": "[email]",
  "password": "[password]"
}
```

- **Response:** Parse `token` and `user` object
- **Action:** Save `token` to App State

### Step 3: Add Protected API Calls

For all protected endpoints, add this header:

- **Header Name:** `Authorization`
- **Header Value:** `Bearer [appStateToken]`

#### Get Profile

- **Method:** GET
- **Endpoint:** `/api/users/profile`
- **Headers:** `Authorization: Bearer [token]`

#### Scan Plant

- **Method:** POST
- **Endpoint:** `/api/plants/scan`
- **Headers:** `Authorization: Bearer [token]`
- **Body:**

```json
{
  "image": "[base64Image]"
}
```

#### Get History

- **Method:** GET
- **Endpoint:** `/api/plants/history`
- **Headers:** `Authorization: Bearer [token]`

### Step 4: Create App State Variables

1. **authToken** (String) - Store JWT token
2. **currentUser** (JSON) - Store user object
3. **isLoggedIn** (Boolean) - Track login status

### Step 5: Image to Base64 Conversion

In FlutterFlow, when user picks an image:

1. Use **Upload Media** action to get image
2. Convert to Base64 using Custom Code:

```dart
import 'dart:convert';
import 'dart:typed_data';

String imageToBase64(Uint8List imageBytes) {
  String base64String = base64Encode(imageBytes);
  return 'data:image/jpeg;base64,$base64String';
}
```

### Step 6: Secure Token Storage

Use **flutter_secure_storage** package:

1. Add to pubspec dependencies
2. Store token securely on login
3. Retrieve token on app start
4. Clear token on logout

---

## 📱 Recommended App Flow

### 1. Splash Screen

- Check if token exists in secure storage
- If yes → Navigate to Home
- If no → Navigate to Login

### 2. Login/Register Screen

- Email & Password fields
- Call Login/Register API
- On success: Save token → Navigate to Home

### 3. Home Screen (Tabs)

- **Scan Tab:** Camera to scan plants
- **History Tab:** List of past scans
- **Encyclopedia Tab:** Browse all plants
- **Profile Tab:** User profile

### 4. Scan Flow

1. User taps "Scan Plant"
2. Open camera/gallery
3. Convert image to base64
4. Call `/api/plants/scan` with token
5. Show loading indicator
6. Display results (plant name, health, care guide)
7. Option to save to "My Garden" (future feature)

### 5. History Screen

- Call `/api/plants/history`
- Display list of scans with:
  - Plant name (from ai_raw_response)
  - Date
  - Health status
  - Thumbnail
- Tap to view full details

### 6. Encyclopedia Screen

- Call `/api/encyclopedia` with pagination
- Search bar for filtering
- Grid/List view of plants
- Tap to view plant details

---

## 🔐 Security Best Practices

1. **Never hardcode API URLs** - Use environment variables
2. **Store tokens securely** - Use flutter_secure_storage
3. **Handle token expiry** - Implement refresh logic or re-login
4. **Validate inputs** - Check email format, password strength
5. **Use HTTPS** - Always in production
6. **Handle errors gracefully** - Show user-friendly messages

---

## 🐛 Error Handling

Common error responses:

```json
{
  "error": "Error message here"
}
```

Handle these status codes:

- **200:** Success
- **201:** Created (registration)
- **400:** Bad request (validation error)
- **401:** Unauthorized (invalid/expired token)
- **404:** Not found
- **500:** Server error

---

## 🧪 Testing Checklist

- [ ] User can register
- [ ] User can login
- [ ] Token is saved securely
- [ ] User can view profile
- [ ] User can scan plant (with camera)
- [ ] Scan results display correctly
- [ ] User can view scan history
- [ ] User can browse encyclopedia
- [ ] User can search plants
- [ ] User can logout
- [ ] App handles network errors
- [ ] App handles token expiry

---

## 📦 Required FlutterFlow Packages

1. **http** - API calls (built-in)
2. **flutter_secure_storage** - Secure token storage
3. **image_picker** - Camera/gallery access
4. **cached_network_image** - Image caching

---

## 🚀 Production Deployment

1. **Backend:**

   - Deploy to AWS/Heroku/DigitalOcean
   - Use environment variables for secrets
   - Enable HTTPS
   - Set up monitoring

2. **FlutterFlow:**
   - Update API base URL to production
   - Test all flows
   - Build and deploy to App Store/Play Store

---

## 💡 Future Enhancements

- Push notifications for plant care reminders
- Social features (share scans)
- Offline mode with local database
- Multiple language support
- Plant care calendar
- Community forum

---

## 📞 Support

If you encounter issues:

1. Check API is running: `curl http://localhost:3000/`
2. Verify token is valid
3. Check request/response in FlutterFlow debugger
4. Review backend logs for errors

Good luck with your FlutterFlow app! 🌿
