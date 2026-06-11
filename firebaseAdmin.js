/**
 * firebaseAdmin.js
 *
 * Initialises the Firebase Admin SDK as a singleton.
 * All services that need Firebase (e.g. FCM push notifications)
 * should require this file instead of calling admin.initializeApp() themselves.
 */

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
