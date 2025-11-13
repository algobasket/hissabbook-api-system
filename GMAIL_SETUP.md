# Gmail SMTP Setup Guide

This guide will help you configure Gmail SMTP for sending OTP emails in HissabBook.

## Step 1: Enable 2-Step Verification

1. Go to your Google Account settings: https://myaccount.google.com/
2. Click on **Security** in the left sidebar
3. Under "Signing in to Google", click **2-Step Verification**
4. Follow the prompts to enable 2-Step Verification for your account

## Step 2: Generate App Password

1. Go to your Google Account settings: https://myaccount.google.com/
2. Click on **Security** in the left sidebar
3. Under "Signing in to Google", click **App passwords**
   - If you don't see this option, make sure 2-Step Verification is enabled
4. Select **Mail** as the app and **Other (Custom name)** as the device
5. Enter "HissabBook" as the custom name
6. Click **Generate**
7. **Copy the 16-character password** that appears (you'll need this for the `.env` file)

## Step 3: Configure Environment Variables

Add the following variables to your `.env` file in the `hissabbook-api-system` directory:

```env
# Gmail SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-16-character-app-password
SMTP_FROM_EMAIL=your-email@gmail.com

# Alternative: You can also use GMAIL_ prefixed variables
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-character-app-password
GMAIL_FROM_EMAIL=your-email@gmail.com
```

### Important Notes:

- **SMTP_USER**: Your Gmail email address (e.g., `yourname@gmail.com`)
- **SMTP_PASSWORD**: The 16-character App Password you generated (not your regular Gmail password)
- **SMTP_PORT**: Use `587` for TLS (recommended) or `465` for SSL
- **SMTP_SECURE**: Set to `false` for port 587 (TLS) or `true` for port 465 (SSL)
- **SMTP_FROM_EMAIL**: The email address that will appear as the sender (usually your Gmail address)

## Step 4: Test the Configuration

1. Start your backend server:
   ```bash
   cd hissabbook-api-system
   npm start
   ```

2. Try sending an OTP from your frontend application

3. Check the server logs for any SMTP errors

4. Check your email inbox for the OTP code

## Troubleshooting

### Error: "Invalid login"
- Make sure you're using the **App Password**, not your regular Gmail password
- Verify that 2-Step Verification is enabled on your Google Account
- Double-check that the App Password is copied correctly (no spaces)

### Error: "Connection timeout"
- Check your firewall settings
- Verify that port 587 (or 465) is not blocked
- Try using port 465 with `SMTP_SECURE=true`

### Error: "Less secure app access"
- Gmail no longer supports "Less secure app access"
- You **must** use App Passwords with 2-Step Verification enabled

### Email not received
- Check your spam/junk folder
- Verify the recipient email address is correct
- Check server logs for any error messages
- Make sure the SMTP configuration is correct

## Security Best Practices

1. **Never commit your `.env` file** to version control
2. **Use App Passwords** instead of your regular Gmail password
3. **Enable 2-Step Verification** on your Google Account
4. **Rotate App Passwords** regularly
5. **Use environment-specific accounts** for production (not personal Gmail)

## Alternative: Use Gmail API (Recommended for Production)

For production applications, consider using the Gmail API instead of SMTP:

1. More reliable and scalable
2. Better rate limits
3. OAuth 2.0 authentication (more secure)
4. Better error handling and logging

However, SMTP is simpler to set up and sufficient for development and small-scale applications.

## Support

If you continue to have issues:
1. Check the server logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test the SMTP connection using a tool like `telnet` or `nodemailer` test script
4. Contact your system administrator if you're behind a corporate firewall


