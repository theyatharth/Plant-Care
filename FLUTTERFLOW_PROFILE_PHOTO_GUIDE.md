# 📸 FlutterFlow Profile Photo Integration Guide

## Complete Step-by-Step Implementation

This guide shows you exactly how to integrate profile photo upload and display in FlutterFlow.

---

## 🎯 **What You'll Build**

- **Profile Photo Upload**: Camera/gallery picker → Upload to S3
- **Profile Photo Display**: Show user's profile photo from S3
- **Default Avatar**: Show placeholder when no photo exists
- **Profile Page**: Complete profile management with photo

---

## 📋 **Prerequisites**

✅ Backend APIs are working (we just tested them)
✅ User authentication is set up in FlutterFlow
✅ JWT token is stored in App State as `authToken`

---

## 🔧 **Step 1: Create API Calls**

### 1.1 Upload Profile Photo API

1. Go to **API Calls** in FlutterFlow
2. Click **+ Add API Call**
3. **Name**: `uploadProfilePhoto`
4. **Method**: `POST`
5. **API URL**: `https://your-domain.com/api/users/profile/photo`
6. **Headers**:
   - Key: `Authorization`
   - Value: `Bearer ${FFAppState().authToken}`
   - Key: `Content-Type`
   - Value: `application/json`
7. **Body** (JSON):
   ```json
   {
     "image": "[imageBase64]"
   }
   ```
8. **Variable Name for Body**: `imageBase64` (String)
9. **Test** the API call

### 1.2 Get Profile Photo API

1. **Name**: `getProfilePhoto`
2. **Method**: `GET`
3. **API URL**: `https://your-domain.com/api/users/profile/photo`
4. **Headers**:
   - Key: `Authorization`
   - Value: `Bearer ${FFAppState().authToken}`
5. **Test** the API call

### 1.3 Get Full Profile API (Update Existing)

If you already have a `getProfile` API call, update it:

1. **Method**: `GET`
2. **API URL**: `https://your-domain.com/api/users/profile`
3. **Headers**:
   - Key: `Authorization`
   - Value: `Bearer ${FFAppState().authToken}`

---

## 🏗️ **Step 2: Create Profile Page**

### 2.1 Create New Page

1. Go to **Pages**
2. Click **+ Add Page**
3. **Name**: `ProfilePage`
4. **Page Type**: Regular Page

### 2.2 Add Initial Action

1. In **Page Settings** → **Page Lifecycle**
2. **On Page Load** → **Add Action**
3. **Action Type**: API Call
4. **API Call**: `getProfile`
5. **Update App State**: Store response in `userProfile`

---

## 📱 **Step 3: Design Profile Page Layout**

### 3.1 Main Container Structure

```
Column (MainAxis: center, CrossAxis: center)
├── Container (Profile Photo Section)
│   ├── Stack
│   │   ├── CircleAvatar (Profile Photo)
│   │   └── Positioned (Edit Button)
├── SizedBox (height: 20)
├── Text (User Name)
├── Text (User Email)
├── Text (User Phone)
└── ElevatedButton (Edit Profile)
```

### 3.2 Profile Photo Section

**Stack Widget:**

1. **Child 1 - CircleAvatar**:

   - **Radius**: 60
   - **Background Image**: Conditional
   - **Child**: Conditional (default icon when no photo)

2. **Child 2 - Positioned** (Edit Button):
   - **Right**: 0
   - **Bottom**: 0
   - **Child**: CircleAvatar
     - **Radius**: 18
     - **Background Color**: Primary color
     - **Child**: Icon (camera)

---

## 🖼️ **Step 4: Configure Profile Photo Display**

### 4.1 CircleAvatar Configuration

**Background Image (Conditional):**

**Condition**: `FFAppState().userProfile.profilePhotoUrl != null && FFAppState().userProfile.profilePhotoUrl != ""`

**If True**:

- **Image Type**: Network Image
- **Image Path**: `FFAppState().userProfile.profilePhotoUrl`

**If False**:

- **Background Image**: None
- **Child**: Icon
  - **Icon**: `Icons.person`
  - **Size**: 60
  - **Color**: Grey

### 4.2 Alternative: Using Conditional Visibility

**Option A - Network Image Widget:**

- **Visible When**: `FFAppState().userProfile.profilePhotoUrl != null`
- **Image Source**: Network Image
- **Image Path**: `FFAppState().userProfile.profilePhotoUrl`
- **Width**: 120
- **Height**: 120
- **Fit**: Cover
- **Border Radius**: 60 (circular)

**Option B - Default Avatar Widget:**

- **Visible When**: `FFAppState().userProfile.profilePhotoUrl == null`
- **Widget**: Container
- **Width**: 120
- **Height**: 120
- **Decoration**: Circle with grey background
- **Child**: Icon (person, size 60)

---

## 📷 **Step 5: Implement Photo Upload**

### 5.1 Add Upload Action to Edit Button

1. **Widget**: Edit Button (CircleAvatar with camera icon)
2. **On Tap** → **Add Action**
3. **Action Type**: Upload/Download
4. **Upload Type**: Upload Media
5. **Media Type**: Photo
6. **Source**: Camera and Gallery
7. **Allow Multiple**: False
8. **Max Width**: 800 (optional, for optimization)
9. **Max Height**: 800 (optional, for optimization)

### 5.2 Chain Upload Action

After media upload, add another action:

1. **Action Type**: API Call
2. **API Call**: `uploadProfilePhoto`
3. **Set Variable**:
   - **Variable**: `imageBase64`
   - **Value**: `uploadedFilesList.first` (convert to base64)

### 5.3 Handle Upload Response

After API call, add action:

1. **Action Type**: Update App State
2. **App State Variable**: `userProfile`
3. **Update Type**: Update Specific Field
4. **Field**: `profilePhotoUrl`
5. **Value**: `uploadProfilePhotoResponse.profilePhotoUrl`

### 5.4 Show Success Message

1. **Action Type**: Show Snack Bar
2. **Message**: "Profile photo updated successfully!"
3. **Duration**: 3 seconds

---

## 🔄 **Step 6: Handle Image Conversion**

### 6.1 Convert Uploaded File to Base64

FlutterFlow needs to convert the uploaded file to base64 for your API.

**Custom Function** (if needed):

```dart
String convertToBase64(FFUploadedFile file) {
  if (file.bytes != null) {
    String base64String = base64Encode(file.bytes!);
    return 'data:image/jpeg;base64,$base64String';
  }
  return '';
}
```

**Or use FlutterFlow's built-in conversion:**

- In API call variable: `uploadedFilesList.first.bytes`
- FlutterFlow will handle base64 conversion automatically

---

## 🎨 **Step 7: Advanced UI Features**

### 7.1 Loading State During Upload

1. **Add App State Variable**: `isUploadingPhoto` (Boolean)
2. **Before API Call**: Set `isUploadingPhoto = true`
3. **After API Call**: Set `isUploadingPhoto = false`
4. **Show Loading**: Conditional CircularProgressIndicator

### 7.2 Error Handling

1. **Add App State Variable**: `uploadError` (String)
2. **On API Call Error**: Set error message
3. **Show Error**: Conditional Text widget or Snack Bar

### 7.3 Image Preview Before Upload

1. **Add App State Variable**: `selectedImage` (FFUploadedFile)
2. **After Media Upload**: Store selected image
3. **Show Preview**: Image widget with selected image
4. **Add Confirm/Cancel Buttons**

---

## 📋 **Step 8: Complete Widget Tree Example**

```
Scaffold
└── Body: SafeArea
    └── Padding (16px all sides)
        └── Column
            ├── Container (Profile Section)
            │   └── Stack
            │       ├── ClipOval
            │       │   └── Container (120x120)
            │       │       └── [Conditional Profile Image]
            │       └── Positioned (bottom: 0, right: 0)
            │           └── GestureDetector (Upload Action)
            │               └── Container (36x36, circular)
            │                   └── Icon (camera)
            ├── SizedBox (height: 24)
            ├── Text (User Name - Bold, 24px)
            ├── SizedBox (height: 8)
            ├── Text (User Email - 16px, Grey)
            ├── SizedBox (height: 4)
            ├── Text (User Phone - 16px, Grey)
            ├── SizedBox (height: 32)
            └── ElevatedButton (Edit Profile)
```

---

## 🔧 **Step 9: App State Variables Needed**

Create these App State variables:

1. **userProfile** (JSON)

   - Stores complete user profile data
   - Updated from `getProfile` API response

2. **authToken** (String)

   - JWT token for authentication
   - Set during login

3. **isUploadingPhoto** (Boolean) - Optional

   - Shows loading state during upload

4. **uploadError** (String) - Optional
   - Stores error messages

---

## 🧪 **Step 10: Testing Your Implementation**

### 10.1 Test Profile Photo Display

1. **Preview** your app
2. Navigate to Profile page
3. Should show default avatar (person icon)
4. Profile data should load from API

### 10.2 Test Photo Upload

1. Tap the camera/edit button
2. Select "Camera" or "Gallery"
3. Choose/take a photo
4. Should show loading indicator
5. Should update profile photo
6. Should show success message

### 10.3 Test Photo Persistence

1. Navigate away from profile page
2. Come back to profile page
3. Profile photo should still be displayed
4. Restart app - photo should persist

---

## 🐛 **Step 11: Troubleshooting**

### Issue 1: Photo Not Uploading

**Check:**

- ✅ API call has correct headers (Authorization)
- ✅ Image is converted to base64 properly
- ✅ API endpoint URL is correct
- ✅ JWT token is valid

**Debug:**

- Check API call response in FlutterFlow debugger
- Test API directly with Postman/curl

### Issue 2: Photo Not Displaying

**Check:**

- ✅ `profilePhotoUrl` field exists in App State
- ✅ Image URL starts with `https://`
- ✅ Network image widget has correct path
- ✅ Conditional logic is correct

**Debug:**

- Print `profilePhotoUrl` value to console
- Test S3 URL directly in browser

### Issue 3: Upload Fails

**Common Causes:**

- Image too large (>5MB)
- Invalid JWT token
- Network connectivity issues
- S3 permissions problem

**Solutions:**

- Add image compression before upload
- Refresh JWT token
- Add retry mechanism
- Check S3 bucket settings

---

## 🎯 **Step 12: Advanced Features (Optional)**

### 12.1 Image Compression

Add before upload:

```dart
// Compress image to reduce size
FFUploadedFile compressedImage = await compressImage(
  uploadedFilesList.first,
  quality: 70,
  maxWidth: 800,
  maxHeight: 800,
);
```

### 12.2 Multiple Photo Sources

```dart
// Show action sheet for photo source
showModalActionSheet(
  context: context,
  actions: [
    'Take Photo',
    'Choose from Gallery',
    'Remove Photo'
  ],
);
```

### 12.3 Photo Cropping

Add image cropping functionality:

```dart
// After image selection, show cropper
CroppedFile? croppedFile = await ImageCropper().cropImage(
  sourcePath: selectedImage.path,
  aspectRatio: CropAspectRatio(ratioX: 1, ratioY: 1), // Square
);
```

---

## ✅ **Final Checklist**

Before going live, verify:

- [ ] Profile photo displays correctly
- [ ] Upload functionality works
- [ ] Loading states are shown
- [ ] Error handling works
- [ ] Default avatar shows when no photo
- [ ] Photo persists after app restart
- [ ] API authentication works
- [ ] S3 URLs are accessible
- [ ] Image compression works (if implemented)
- [ ] UI looks good on different screen sizes

---

## 🚀 **You're Done!**

Your FlutterFlow app now has complete profile photo functionality:

- ✅ **Upload**: Camera/Gallery → S3 → Database
- ✅ **Display**: S3 URL → Network Image
- ✅ **Fallback**: Default avatar when no photo
- ✅ **Persistence**: Photos saved permanently

Your users can now upload and display profile photos seamlessly! 📸✨
