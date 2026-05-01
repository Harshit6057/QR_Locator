# QR-Based Smart Tracking System

A full-stack tracking system to generate unique QR codes, track when they are scanned, capture device IP, and request exact GPS location if permission is granted.

## Features

1. **Python QR Generator**: Generates thousands of unique QR codes mapping to your deployed backend.
2. **Node.js Backend**: Express server to log scans and serve the frontend.
3. **Frontend Tracker**: Web interface shown to the person scanning the QR, prompting them to share their location.
4. **Admin Dashboard**: A secure place to view all tracking logs with direct links to Google Maps for exact GPS coordinates.
5. **Supabase Database**: Uses PostgreSQL to safely store scan logs and locations.

---

## 🛠️ Setup Instructions

### 1. Database Setup (Supabase)
1. Go to [Supabase](https://supabase.com/) and create a new project.
2. Go to the **SQL Editor** in your Supabase dashboard and run this exact query to create your table:
   ```sql
   CREATE TABLE scan_logs (
     id uuid default uuid_generate_v4() primary key,
     qr_id text not null,
     ip_address text,
     latitude double precision,
     longitude double precision,
     device_info text,
     scanned_at timestamp with time zone default timezone('utc'::text, now()) not null
   );
   ```
3. Go to **Project Settings -> API** and copy your **Project URL** and **anon public key**.

### 2. Backend Configuration
1. Open the `backend` folder.
2. Run `npm install` to install dependencies.
3. Create a `.env` file inside the `backend` folder with your Supabase credentials:
   ```env
   PORT=3000
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_KEY=your_supabase_anon_key
   ```
4. Start the server locally to test:
   ```bash
   npm start
   ```

### 3. Deploying to Render
Since Geolocation tracking **requires HTTPS**, you must deploy your backend.
1. Push this whole repository to GitHub.
2. Go to [Render](https://render.com/) and create a new **Web Service**.
3. Connect your GitHub repository.
4. Settings:
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`
5. Add your `.env` variables (`SUPABASE_URL` and `SUPABASE_KEY`) in the Render environment variables section.
6. Once deployed, copy your Render URL (e.g., `https://my-qr-tracker.onrender.com`).

### 4. Generating QR Codes
1. Make sure you have Python installed.
2. Install the QR code library:
   ```bash
   pip install qrcode[pil]
   ```
3. Run the generator script with your deployed Render URL:
   ```bash
   python qr_generator/generate.py --url https://your-render-app-url.onrender.com --count 1000
   ```
   *(This will create 1000 PNG files in the `qr_codes` folder.)*

---

## 🚀 How It Works

1. Print and attach a QR code (e.g., `item_1.png`) to an item.
2. If lost, someone scans the QR code.
3. They are taken to `https://your-render-app-url.onrender.com/track/item_1`.
4. The system immediately logs their **IP Address** and **Device Info** to Supabase.
5. The webpage asks them to "Share Location" to help the owner.
6. If they click it, their exact **GPS Latitude & Longitude** is added to the Supabase log.
7. You can view all logs by going to the Admin Dashboard: `https://your-render-app-url.onrender.com/admin`
