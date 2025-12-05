# 🌿 Plant Care App Backend

Backend API for a Flutter plant care application with AI-powered plant identification using AWS Bedrock.

## Features

- 🔐 User authentication (JWT)
- 🤖 AI-powered plant identification using AWS Bedrock Claude
- 📚 Plant encyclopedia
- 📜 Scan history tracking
- 🏥 Plant health analysis

## Tech Stack

- Node.js + Express
- PostgreSQL
- AWS Bedrock (Claude 3.5 Sonnet)
- JWT Authentication

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Update `.env` file with your credentials:

```env
# Database
DB_USER=your_db_user
DB_HOST=localhost
DB_NAME=plant_care_db
DB_PASSWORD=your_db_password
DB_PORT=5432

# JWT
JWT_SECRET=your_super_secret_jwt_key

# AWS Bedrock
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
```

### 3. Setup Database

```bash
# Create database
createdb plant_care_db

# Run schema
psql -d plant_care_db -f database/schema.sql
```

### 4. Run Server

```bash
# Development
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3000`

## API Endpoints

### Authentication

#### Register User

```http
POST /api/users/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "John Doe"
}
```

#### Login

```http
POST /api/users/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Get Profile (Protected)

```http
GET /api/users/profile
Authorization: Bearer <token>
```

### Plant Encyclopedia

#### Get All Plants

```http
GET /api/encyclopedia?page=1&limit=20&search=rose
```

#### Get Plant Details

```http
GET /api/encyclopedia/:id
```

### Plant Scanning (Protected)

#### Scan Plant

```http
POST /api/plants/scan
Authorization: Bearer <token>
Content-Type: application/json

{
  "image": "base64_encoded_image_string"
}
```

Response:

```json
{
  "success": true,
  "scanId": 123,
  "result": {
    "plant_name": "Rose",
    "scientific_name": "Rosa",
    "description": "...",
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

```http
GET /api/plants/history
Authorization: Bearer <token>
```

#### Get Scan Details

```http
GET /api/plants/scan/:scanId
Authorization: Bearer <token>
```

## Database Schema

### users

- id, email, password_hash, full_name, created_at, updated_at

### plant_species

- id, scientific_name, common_name, description, care_guide (JSONB), image_url, created_at, updated_at

### scans

- id, user_id, plant_id, image_url, ai_raw_response (JSONB), is_healthy, disease_name, created_at

## Security Notes

- Always use HTTPS in production
- Rotate AWS credentials regularly
- Keep JWT_SECRET secure
- Add `.env` to `.gitignore`
- Use environment-specific configs

## License

MIT
# Plant-Care
