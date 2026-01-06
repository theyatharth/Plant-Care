const nodemailer = require('nodemailer');
const db = require('../configure/dbConfig');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD
        }
      });
      console.log('✅ Email service initialized successfully');
    } catch (error) {
      console.error('❌ Email service initialization failed:', error.message);
    }
  }

  // Generate 6-digit OTP
  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Send OTP email
  async sendOTP(email, otp) {
    if (!this.transporter) {
      throw new Error('Email service not initialized');
    }

    const mailOptions = {
      from: {
        name: 'Ecofynd Plant Doctor',
        address: process.env.GMAIL_USER
      },
      to: email,
      subject: 'Ecofynd Plant Doctor - Your Login OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4CAF50; margin: 0;">🌱 Ecofynd Plant Doctor</h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; text-align: center;">
            <h2 style="color: #333; margin-bottom: 20px;">Login Verification Code</h2>
            <p style="color: #666; margin-bottom: 30px;">Enter this code to access your Ecofynd Plant Doctor account:</p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; border: 2px dashed #4CAF50; margin: 20px 0;">
              <h1 style="color: #4CAF50; font-size: 36px; margin: 0; letter-spacing: 5px;">${otp}</h1>
            </div>
            
            <p style="color: #999; font-size: 14px; margin-top: 30px;">
              This code will expire in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #666; font-size: 12px;">
              If you didn't request this code, please ignore this email.<br>
              This is an automated message, please do not reply.
            </p>
          </div>
        </div>
      `
    };

    console.log(`📧 Sending OTP email to: ${email}`);
    const result = await this.transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully. Message ID: ${result.messageId}`);
    return result;
  }

  // Store OTP in database
  async storeOTP(email, otp) {
    const expiresAt = new Date(Date.now() + (process.env.OTP_EXPIRY_MINUTES || 10) * 60 * 1000);

    try {
      // Clean up old OTPs for this email
      await db.query('DELETE FROM email_otp_codes WHERE email = $1', [email]);

      // Store new OTP
      const result = await db.query(
        'INSERT INTO email_otp_codes (email, otp_code, expires_at) VALUES ($1, $2, $3) RETURNING id',
        [email, otp, expiresAt]
      );

      console.log(`💾 OTP stored for email: ${email}, expires at: ${expiresAt}`);
      return result.rows[0].id;
    } catch (error) {
      console.error('❌ Error storing OTP:', error.message);
      throw error;
    }
  }

  // Verify OTP
  async verifyOTP(email, otp) {
    try {
      const result = await db.query(
        'SELECT * FROM email_otp_codes WHERE email = $1 AND otp_code = $2 AND expires_at > NOW() AND verified = FALSE',
        [email, otp]
      );

      if (result.rows.length === 0) {
        // Check if OTP exists but is expired or already used
        const expiredResult = await db.query(
          'SELECT * FROM email_otp_codes WHERE email = $1 AND otp_code = $2',
          [email, otp]
        );

        if (expiredResult.rows.length > 0) {
          const record = expiredResult.rows[0];
          if (record.verified) {
            return { success: false, message: 'OTP already used' };
          } else if (new Date() > new Date(record.expires_at)) {
            return { success: false, message: 'OTP expired' };
          }
        }

        return { success: false, message: 'Invalid OTP' };
      }

      const otpRecord = result.rows[0];

      // Check attempts
      if (otpRecord.attempts >= (process.env.MAX_OTP_ATTEMPTS || 3)) {
        return { success: false, message: 'Too many attempts. Request new OTP.' };
      }

      // Increment attempts first
      await db.query(
        'UPDATE email_otp_codes SET attempts = attempts + 1 WHERE id = $1',
        [otpRecord.id]
      );

      // Mark as verified
      await db.query(
        'UPDATE email_otp_codes SET verified = TRUE WHERE id = $1',
        [otpRecord.id]
      );

      console.log(`✅ OTP verified successfully for email: ${email}`);
      return { success: true, message: 'OTP verified successfully' };

    } catch (error) {
      console.error('❌ Error verifying OTP:', error.message);
      throw error;
    }
  }

  // Check rate limiting
  async checkRateLimit(email) {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const result = await db.query(
        'SELECT COUNT(*) FROM email_otp_codes WHERE email = $1 AND created_at > $2',
        [email, oneHourAgo]
      );

      const count = parseInt(result.rows[0].count);
      const maxRequests = parseInt(process.env.MAX_OTP_REQUESTS_PER_HOUR || 3);

      console.log(`🔒 Rate limit check for ${email}: ${count}/${maxRequests} requests in last hour`);
      return count < maxRequests;
    } catch (error) {
      console.error('❌ Error checking rate limit:', error.message);
      return false; // Fail safe - deny if error
    }
  }

  // Clean up expired OTPs (utility method)
  async cleanupExpiredOTPs() {
    try {
      const result = await db.query('DELETE FROM email_otp_codes WHERE expires_at < NOW()');
      console.log(`🧹 Cleaned up ${result.rowCount} expired OTP codes`);
      return result.rowCount;
    } catch (error) {
      console.error('❌ Error cleaning up expired OTPs:', error.message);
      throw error;
    }
  }

  // Test email configuration
  async testConnection() {
    try {
      if (!this.transporter) {
        throw new Error('Email service not initialized');
      }

      await this.transporter.verify();
      console.log('✅ Email service connection test successful');
      return true;
    } catch (error) {
      console.error('❌ Email service connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = new EmailService();