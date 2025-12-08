# 🔧 Production Server Debugging Guide

## Issue: Auth API works on localhost but fails on production

**Localhost:** ✅ Works - `http://localhost:3000/api/users/auth`
**Production:** ❌ Fails - `http://shcanary.platinum-infotech.com:3000/api/users/auth`

Error: `{"error": "Authentication failed"}`

---

## 🔍 Possible Causes

### 1. **Different Database Configuration**

Production server might be connecting to a different database than localhost.

### 2. **Missing Environment Variables**

Production `.env` file might be missing or have wrong values.

### 3. **Database Connection Issue**

Production server can't connect to the database.

### 4. **Database Schema Not Set Up**

Tables don't exist on production database.

### 5. **SSL/Connection Settings**

Production database requires different SSL settings.

---

## 🧪 Debugging Steps

### Step 1: Check Production Server Logs

SSH into your production server and check the logs:

```bash
# SSH to server
ssh user@shcanary.platinum-infotech.com

# Check if server is running
pm2 list
# or
ps aux | grep node

# View server logs
pm2 logs plant-care-backend
# or
tail -f /path/to/your/app/logs/error.log

# Look for the detailed error message:
# ❌ Login/Register Error:
# Error Message: ...
# Error Code: ...
```

### Step 2: Verify Environment Variables

Check if production `.env` file exists and has correct values:

```bash
# On production server
cd /path/to/your/app
cat .env

# Should have:
# DB_USER=postgres
# DB_HOST=smarthawker-devdb.cry8skcsql30.ap-south-1.rds.amazonaws.com
# DB_NAME=PlantCare
# DB_PASSWORD=Nt43XPVKbQKZkyy
# DB_PORT=5432
# JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
```

### Step 3: Test Database Connection

On production server, test if database is accessible:

```bash
# Test PostgreSQL connection
psql -h smarthawker-devdb.cry8skcsql30.ap-south-1.rds.amazonaws.com \
     -U postgres \
     -d PlantCare \
     -c "SELECT NOW();"

# If this fails, database connection is the issue
```

### Step 4: Check Database Schema

Verify tables exist on production database:

```bash
# Connect to database
psql -h smarthawker-devdb.cry8skcsql30.ap-south-1.rds.amazonaws.com \
     -U postgres \
     -d PlantCare

# Check if tables exist
\dt

# Should show:
# - users
# - plant_species
# - user_plants
# - scans

# Check users table structure
\d users

# Exit
\q
```

### Step 5: Check if UUID Extension is Enabled

```sql
-- Connect to database and run:
SELECT * FROM pg_extension WHERE extname = 'uuid-ossp';

-- If empty, enable it:
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## 🛠️ Common Fixes

### Fix 1: Database Not Set Up

If tables don't exist on production:

```bash
# On production server
cd /path/to/your/app
npm run setup-db

# Or manually:
psql -h smarthawker-devdb.cry8skcsql30.ap-south-1.rds.amazonaws.com \
     -U postgres \
     -d PlantCare \
     -f database/schema.sql
```

### Fix 2: Missing .env File

If `.env` doesn't exist on production:

```bash
# On production server
cd /path/to/your/app
nano .env

# Copy contents from your local .env
# Save and exit (Ctrl+X, Y, Enter)

# Restart server
pm2 restart plant-care-backend
```

### Fix 3: Database Connection Issue

If database connection fails, check:

1. **Firewall/Security Group:**

   - AWS RDS security group allows connections from production server IP
   - Port 5432 is open

2. **SSL Settings:**
   Update `configure/dbConfig.js` if needed:
   ```javascript
   const pool = new Pool({
     user: process.env.DB_USER,
     host: process.env.DB_HOST,
     database: process.env.DB_NAME,
     password: process.env.DB_PASSWORD,
     port: process.env.DB_PORT,
     ssl: {
       rejectUnauthorized: false,
     },
   });
   ```

### Fix 4: Wrong Database

If production is using a different database:

```bash
# Check which database it's connecting to
# Look at production .env file
cat .env | grep DB_

# Should match your RDS instance
```

---

## 🔍 Quick Test API

Test the auth endpoint with detailed logging:

```bash
# On production server, make a test request
curl -X POST http://localhost:3000/api/users/auth \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "9876543210",
    "name": "Test User",
    "email": "test@example.com"
  }'

# Check logs immediately
pm2 logs plant-care-backend --lines 50
```

---

## 📊 Expected vs Actual

### Expected Behavior (Localhost):

```json
{
  "success": true,
  "isNewUser": false,
  "token": "eyJhbGci...",
  "user": {
    "id": "uuid",
    "phone": "8209468089",
    "name": "Yatharth",
    "email": "theyatharth001@gmail.com"
  }
}
```

### Actual Behavior (Production):

```json
{
  "error": "Authentication failed"
}
```

### What to Look For in Logs:

**If database connection fails:**

```
Error Code: ECONNREFUSED
Error Message: connect ECONNREFUSED
```

**If table doesn't exist:**

```
Error Code: 42P01
Error Message: relation "users" does not exist
```

**If SSL issue:**

```
Error Code: EPROTO
Error Message: SSL connection required
```

**If wrong credentials:**

```
Error Code: 28P01
Error Message: password authentication failed
```

---

## ✅ Verification Checklist

- [ ] Production server is running
- [ ] `.env` file exists on production
- [ ] Database credentials are correct
- [ ] Database is accessible from production server
- [ ] Tables exist in production database
- [ ] UUID extension is enabled
- [ ] SSL settings are correct
- [ ] Server logs show detailed error

---

## 🚀 Quick Fix Commands

```bash
# 1. SSH to production
ssh user@shcanary.platinum-infotech.com

# 2. Navigate to app directory
cd /path/to/plant-care-backend

# 3. Check if .env exists
ls -la .env

# 4. Setup database (if needed)
npm run setup-db

# 5. Restart server
pm2 restart plant-care-backend

# 6. Check logs
pm2 logs plant-care-backend --lines 100

# 7. Test API locally on server
curl -X POST http://localhost:3000/api/users/auth \
  -H "Content-Type: application/json" \
  -d '{"phone":"9876543210","name":"Test"}'
```

---

## 📞 Next Steps

1. **SSH to production server**
2. **Check server logs** for the detailed error
3. **Share the error message** from logs
4. I'll help you fix the specific issue!

The detailed error logging will show exactly what's failing on production.
