require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn("⚠️ Supabase credentials not found in environment variables. Database logging will be disabled.");
}

// Middleware
app.use(cors());
app.use(express.json());
// Trust proxy is needed if deployed on services like Render to get the correct IP
app.set('trust proxy', true);

// Serve frontend static files
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));
// Serve dashboard static files
const dashboardPath = path.join(__dirname, '../dashboard');
app.use('/admin', express.static(dashboardPath));

// Utility function to get IP address
const getIpAddress = (req) => {
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket?.remoteAddress || 'Unknown IP';
};

// Route: Handle QR scan
app.get('/track/:id', async (req, res) => {
  const qrId = req.params.id;
  const ipAddress = getIpAddress(req);
  const userAgent = req.headers['user-agent'] || 'Unknown Device';
  
  console.log(`[SCAN] QR ID: ${qrId} | IP: ${ipAddress} | User-Agent: ${userAgent}`);

  // Log initial scan to database (without precise location yet)
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('scan_logs')
        .insert([
          { 
            qr_id: qrId, 
            ip_address: ipAddress,
            device_info: userAgent
            // scanned_at is handled by default in DB if set up correctly, or we can use the default now()
          }
        ])
        .select();

      if (error) {
        console.error("Supabase insert error:", error.message);
      } else if (data && data.length > 0) {
        // Pass the inserted log ID to the frontend so it can update the same record with GPS coords
        return res.send(renderFrontend(qrId, data[0].id));
      }
    } catch (err) {
      console.error("Database connection error:", err);
    }
  }

  // Fallback if Supabase fails or is not configured
  res.send(renderFrontend(qrId, null));
});

// Route: Save GPS location
app.post('/save-location', async (req, res) => {
  const { qrId, logId, latitude, longitude } = req.body;
  
  console.log(`[LOCATION] QR ID: ${qrId} | Lat: ${latitude} | Lng: ${longitude}`);

  if (supabase && logId) {
    try {
      const { error } = await supabase
        .from('scan_logs')
        .update({ latitude, longitude })
        .eq('id', logId);

      if (error) {
        console.error("Supabase update error:", error.message);
        return res.status(500).json({ success: false, error: 'Database update failed' });
      }
      return res.json({ success: true, message: 'Location updated successfully' });
    } catch (err) {
      console.error("Database connection error:", err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  } else if (supabase && !logId) {
    // If no logId was provided, create a new record
    const ipAddress = getIpAddress(req);
    const userAgent = req.headers['user-agent'] || 'Unknown Device';
    
    try {
      const { error } = await supabase
        .from('scan_logs')
        .insert([{ 
          qr_id: qrId, 
          ip_address: ipAddress,
          device_info: userAgent,
          latitude,
          longitude
        }]);

      if (error) {
        console.error("Supabase insert error:", error.message);
        return res.status(500).json({ success: false, error: 'Database insert failed' });
      }
      return res.json({ success: true, message: 'Location saved successfully' });
    } catch (err) {
      console.error("Database connection error:", err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  }
  
  res.json({ success: true, message: 'Location logged to console (DB not configured)' });
});

// API Route for Dashboard to fetch all logs
app.get('/api/logs', async (req, res) => {
  if (!supabase) {
    return res.json({ logs: [], error: 'Supabase not configured' });
  }
  
  try {
    const { data, error } = await supabase
      .from('scan_logs')
      .select('*')
      .order('scanned_at', { ascending: false });
      
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.json({ logs: data });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Simple template engine to inject variables into frontend
const fs = require('fs');
function renderFrontend(qrId, logId) {
  try {
    let html = fs.readFileSync(path.join(frontendPath, 'index.html'), 'utf8');
    html = html.replace('{{QR_ID}}', qrId || '');
    html = html.replace('{{LOG_ID}}', logId || '');
    return html;
  } catch (e) {
    return `<h1>Error loading frontend.</h1><p>${e.message}</p>`;
  }
}

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
