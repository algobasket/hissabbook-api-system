# Cloudflare R2 Setup for API System

The API system (`hissabbook-api-system`) handles payout requests from the user-facing app. It also needs R2 configuration to upload payment screenshots.

## Important: Add R2 Variables to API System .env

The API system uses its **own** `.env` file at `hissabbook-api-system/.env`. 

You need to add the same R2 environment variables to **both** backend `.env` files:

1. `hissabbook-nodejs-backend/.env` (for admin panel)
2. `hissabbook-api-system/.env` (for user-facing app) ← **This one!**

## Add to `hissabbook-api-system/.env`:

```env
# Cloudflare R2 Configuration
R2_ENDPOINT=https://<your-account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=hissabbook
R2_PUBLIC_URL=https://pub-fbbe51b1b6804c88960b6de5aa342581.r2.dev
```

## After Adding Variables:

1. **Install dependencies:**
   ```bash
   cd hissabbook-api-system
   npm install
   ```

2. **Restart the API container:**
   ```bash
   docker restart hissabbook-api
   # or
   docker-compose restart api
   ```

3. **Test the payout form** - files should now upload to R2!

## Note

Both backends share the same R2 bucket and credentials, but they need the environment variables in their respective `.env` files because they run as separate Docker containers.

