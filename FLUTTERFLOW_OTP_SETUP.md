# 📱 FlutterFlow OTP Authentication Setup Guide

## Migration from Email/Password to Phone/OTP

---

## 🎯 Overview

**Old Flow:** Email + Password → Backend validates → Returns token
**New Flow:** Phone → Message Central OTP → Backend creates/logs in user → Returns token

---

## 🔧 Step-by-Step FlutterFlow Setup

### Step 1: Remove Old Authentication

1. Go to **App Settings** → **Authentication**
2. If you have Firebase Auth or Supabase Auth enabled, disable it
3. We'll use **Custom Authentication**

---

### Step 2: Create App State Variables

Go to **App State** and create these variables:

1. **authToken** (String)

   - Initial Value: empty string
   - Persisted: Yes (check the box)

2. **currentUser** (JSON)

   - Initial Value: `{}`
   - Persisted: Yes

3. **isLoggedIn** (Boolean)

   - Initial Value: false
   - Persisted: Yes

4. **verificationId** (String)

   - Initial Value: empty string
   - Persisted: No (temporary)

5. **userPhone** (String)
   - Initial Value: empty string
   - Persisted: No (temporary)

---

### Step 3: Set Up Message Central API Group

#### Create API Group

1. Go to **API Calls** → Click **+ Add**
2. Create **API Group** named "MessageCentral"
3. Base URL: `https://cpaas.messagecentral.com/verification/v3`

#### Add Header (for all calls in this group)

- **Header Name:** `authToken`
- **Header Value:** `YOUR_MESSAGE_CENTRAL_AUTH_TOKEN`

---

### Step 4: Create Message Central API Calls

#### API Call 1: Send OTP

**Name:** `sendOTP`
**Method:** GET
**Endpoint:** `/send`

**Query Parameters:**

- `countryCode`: `91`
- `customerId`: `C-C5E4CE89F937427`
- `flowType`: `SMS`
- `mobileNumber`: `[phoneNumber]` (variable)

**Response Path:**

- `verificationId`: `data.verificationId`

**Test with:** `9876543210`

---

#### API Call 2: Verify OTP

**Name:** `verifyOTP`
**Method:** GET
**Endpoint:** `/validateOtp`

**Query Parameters:**

- `countryCode`: `91`
- `mobileNumber`: `[phoneNumber]` (variable)
- `verificationId`: `[verificationId]` (variable)
- `customerId`: `C-C5E4CE89F937427`
- `code`: `[otpCode]` (variable)

**Response Path:**

- `verificationStatus`: `data.verificationStatus`

**Success Condition:** `verificationStatus == "VERIFICATION_COMPLETED"`

---

### Step 5: Set Up Your Backend API Group

#### Create API Group

1. Go to **API Calls** → Click **+ Add**
2. Create **API Group** named "PlantCareAPI"
3. Base URL: `http://your-backend-url.com` (or `http://localhost:3000` for testing)

---

### Step 6: Create Backend API Calls

#### API Call 1: Auth (Login/Register)

**Name:** `authUser`
**Method:** POST
**Endpoint:** `/api/users/auth`

**Body Type:** JSON
**Body:**

```json
{
  "phone": "[phoneNumber]",
  "name": "[userName]",
  "email": "[userEmail]"
}
```

**Response Paths:**

- `token`: `token`
- `user`: `user`
- `isNewUser`: `isNewUser`

---

#### API Call 2: Get Profile (Protected)

**Name:** `getProfile`
**Method:** GET
**Endpoint:** `/api/users/profile`

**Headers:**

- **Name:** `Authorization`
- **Value:** `Bearer [authToken]` (from App State)

**Response Path:**

- `user`: `user`

---

#### API Call 3: Scan Plant (Protected)

**Name:** `scanPlant`
**Method:** POST
**Endpoint:** `/api/plants/scan`

**Headers:**

- **Name:** `Authorization`
- **Value:** `Bearer [authToken]`

**Body Type:** JSON
**Body:**

```json
{
  "image": "[base64Image]"
}
```

**Response Paths:**

- `scanId`: `scanId`
- `result`: `result`

---

#### API Call 4: Get Scan History (Protected)

**Name:** `getScanHistory`
**Method:** GET
**Endpoint:** `/api/plants/history`

**Headers:**

- **Name:** `Authorization`
- **Value:** `Bearer [authToken]`

**Response Path:**

- `scans`: `scans`

---

#### API Call 5: Get Encyclopedia

**Name:** `getEncyclopedia`
**Method:** GET
**Endpoint:** `/api/encyclopedia`

**Query Parameters:**

- `page`: `[pageNumber]` (optional)
- `limit`: `20` (optional)
- `search`: `[searchTerm]` (optional)

**Response Paths:**

- `plants`: `plants`
- `pagination`: `pagination`

---

## 📱 Screen Setup

### Screen 1: Phone Input Screen

**Widgets:**

1. **TextField** (Phone Number)

   - Label: "Phone Number"
   - Keyboard Type: Phone
   - Max Length: 10
   - Validation: Must be 10 digits, starts with 6-9
   - Variable: `phoneNumberLocal` (Page State)

2. **Button** (Send OTP)
   - Text: "Send OTP"
   - On Tap Actions:
     1. **Validate Form**
     2. **API Call:** `MessageCentral.sendOTP`
        - phoneNumber: `phoneNumberLocal`
     3. **Update App State:** `verificationId` = API Response `verificationId`
     4. **Update App State:** `userPhone` = `phoneNumberLocal`
     5. **Navigate To:** OTP Verification Screen
     6. **Show Snackbar:** "OTP sent successfully"

**Validation Rules:**

```dart
// Custom validation for phone field
if (value.length != 10) {
  return 'Phone number must be 10 digits';
}
if (!RegExp(r'^[6-9]').hasMatch(value)) {
  return 'Phone must start with 6, 7, 8, or 9';
}
return null;
```

---

### Screen 2: OTP Verification Screen

**Widgets:**

1. **TextField** (OTP Code)

   - Label: "Enter OTP"
   - Keyboard Type: Number
   - Max Length: 6
   - Variable: `otpCodeLocal` (Page State)

2. **TextField** (Name) - Show if new user

   - Label: "Your Name"
   - Variable: `userNameLocal` (Page State)

3. **TextField** (Email) - Optional

   - Label: "Email (Optional)"
   - Variable: `userEmailLocal` (Page State)

4. **Button** (Verify OTP)

   - Text: "Verify & Continue"
   - On Tap Actions:
     1. **Validate Form**
     2. **API Call:** `MessageCentral.verifyOTP`
        - phoneNumber: `userPhone` (App State)
        - verificationId: `verificationId` (App State)
        - otpCode: `otpCodeLocal`
     3. **Conditional Action:** If `verificationStatus == "VERIFICATION_COMPLETED"`
        - **API Call:** `PlantCareAPI.authUser`
          - phoneNumber: `userPhone`
          - userName: `userNameLocal`
          - userEmail: `userEmailLocal`
        - **Update App State:** `authToken` = API Response `token`
        - **Update App State:** `currentUser` = API Response `user`
        - **Update App State:** `isLoggedIn` = `true`
        - **Navigate To:** Home Screen (Replace)
        - **Show Snackbar:** "Login successful!"
     4. **Else:**
        - **Show Snackbar:** "Invalid OTP. Please try again."

5. **TextButton** (Resend OTP)
   - Text: "Resend OTP"
   - On Tap: Same as "Send OTP" button from Screen 1

---

### Screen 3: Home Screen (Protected)

**Initial Actions (On Page Load):**

1. **Conditional:** If `isLoggedIn == false`
   - **Navigate To:** Phone Input Screen (Replace)

**Widgets:**

- Bottom Navigation Bar with tabs:
  - Scan
  - History
  - Encyclopedia
  - Profile

---

### Screen 4: Scan Screen

**Widgets:**

1. **Button** (Take Photo)
   - On Tap Actions:
     1. **Upload Media** → Save to `selectedImage` (Page State)
     2. **Custom Code:** Convert image to base64
     3. **API Call:** `PlantCareAPI.scanPlant`
        - base64Image: `base64ImageString`
     4. **Navigate To:** Scan Result Screen
        - Pass: `scanResult` = API Response

**Custom Code for Base64 Conversion:**

```dart
import 'dart:convert';
import 'dart:typed_data';

String imageToBase64(Uint8List imageBytes) {
  String base64String = base64Encode(imageBytes);
  return 'data:image/jpeg;base64,$base64String';
}
```

---

### Screen 5: History Screen

**Initial Actions (On Page Load):**

1. **API Call:** `PlantCareAPI.getScanHistory`
2. **Update Page State:** `scansList` = API Response `scans`

**Widgets:**

- **ListView** bound to `scansList`
  - Display: Plant name, date, health status
  - On Tap: Navigate to Scan Details

---

### Screen 6: Encyclopedia Screen

**Initial Actions (On Page Load):**

1. **API Call:** `PlantCareAPI.getEncyclopedia`
   - page: 1
   - limit: 20
2. **Update Page State:** `plantsList` = API Response `plants`

**Widgets:**

- **Search Bar**
  - On Submit: Call API with search term
- **GridView** bound to `plantsList`
  - Display: Plant image, common name
  - On Tap: Navigate to Plant Details

---

### Screen 7: Profile Screen

**Initial Actions (On Page Load):**

1. **API Call:** `PlantCareAPI.getProfile`
2. **Update Page State:** `userProfile` = API Response `user`

**Widgets:**

- Display user info (name, phone, email)
- **Button** (Logout)
  - On Tap Actions:
    1. **Update App State:** `authToken` = empty
    2. **Update App State:** `currentUser` = `{}`
    3. **Update App State:** `isLoggedIn` = `false`
    4. **Navigate To:** Phone Input Screen (Replace)

---

## 🔐 Security Setup

### Secure Storage for Token

FlutterFlow automatically handles secure storage when you mark App State variables as "Persisted". The `authToken` will be stored securely.

---

## 🧪 Testing Checklist

- [ ] Phone input validates correctly (10 digits, starts with 6-9)
- [ ] OTP is sent successfully
- [ ] OTP verification works
- [ ] New user registration creates account
- [ ] Existing user login works
- [ ] JWT token is saved to App State
- [ ] Protected APIs work with token
- [ ] Logout clears token and redirects to login
- [ ] App remembers login state after restart

---

## 🚨 Common Issues & Solutions

### Issue 1: "Invalid phone number format"

**Solution:** Ensure phone is exactly 10 digits and starts with 6, 7, 8, or 9

### Issue 2: OTP not received

**Solution:**

- Check Message Central credentials
- Verify phone number is correct
- Check Message Central dashboard for delivery status

### Issue 3: "Invalid or expired OTP"

**Solution:**

- OTP expires after 5-10 minutes
- Request new OTP
- Ensure verificationId matches

### Issue 4: Protected APIs return 401

**Solution:**

- Check if token is saved in App State
- Verify Authorization header format: `Bearer {token}`
- Token may have expired (30 days) - re-login

### Issue 5: Image upload fails

**Solution:**

- Ensure image is converted to base64
- Check image size (backend limit is 50MB)
- Verify base64 string includes data URI prefix

---

## 📊 API Response Examples

### Send OTP Response

```json
{
  "data": {
    "verificationId": "abc123xyz",
    "mobileNumber": "9876543210"
  }
}
```

### Verify OTP Response

```json
{
  "data": {
    "verificationStatus": "VERIFICATION_COMPLETED"
  }
}
```

### Auth Response

```json
{
  "success": true,
  "isNewUser": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "9876543210",
    "name": "John Doe",
    "email": "john@example.com",
    "createdAt": "2025-12-04T10:44:53.902Z"
  }
}
```

### Scan Plant Response

```json
{
  "success": true,
  "scanId": "uuid",
  "speciesId": "uuid",
  "result": {
    "plant_name": "Rose",
    "scientific_name": "Rosa",
    "description": "Beautiful flowering plant",
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

---

## 🎨 UI/UX Recommendations

1. **Loading States:** Show loading indicators during API calls
2. **Error Handling:** Display user-friendly error messages
3. **OTP Timer:** Show countdown timer for OTP expiry
4. **Resend OTP:** Enable after 30 seconds
5. **Offline Mode:** Show message when no internet
6. **Image Preview:** Show selected image before scanning
7. **Scan Animation:** Show analyzing animation during scan
8. **Empty States:** Show helpful messages when no data

---

## 🚀 Production Checklist

- [ ] Update backend URL to production
- [ ] Add Message Central production credentials
- [ ] Enable HTTPS for all API calls
- [ ] Test on real devices (iOS & Android)
- [ ] Add analytics tracking
- [ ] Set up crash reporting
- [ ] Add rate limiting for OTP requests
- [ ] Implement proper error logging
- [ ] Test with different phone numbers
- [ ] Verify token refresh logic

---

## 📞 Support

**Message Central Issues:** support@messagecentral.com
**Backend Issues:** Check server logs and database

Good luck with your FlutterFlow app! 🌿
