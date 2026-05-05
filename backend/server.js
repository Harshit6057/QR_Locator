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

// Route: API endpoint for initial scan (used by Vercel frontend)
app.post('/api/scan', async (req, res) => {
  const { qrId } = req.body;
  if (!qrId) return res.status(400).json({ error: 'QR ID is required' });

  if (supabase) {
    try {
      // 1. Check if the QR is registered
      const { data: regData, error: regError } = await supabase
        .from('registered_items')
        .select('*')
        .eq('qr_id', qrId)
        .single();

      if (regError && regError.code !== 'PGRST116') { // PGRST116 is 'No rows found'
        throw regError;
      }

      if (!regData) {
        // QR is NOT registered. Return early so frontend can show Registration UI.
        return res.json({ success: true, registered: false });
      }

      // 2. QR is registered. Log the scan.
      const ipAddress = getIpAddress(req);
      const userAgent = req.headers['user-agent'] || 'Unknown Device';
      
      console.log(`[API SCAN] QR ID: ${qrId} | IP: ${ipAddress} | User-Agent: ${userAgent}`);

      const { data, error } = await supabase
        .from('scan_logs')
        .insert([{ qr_id: qrId, ip_address: ipAddress, device_info: userAgent }])
        .select();

      if (error) throw error;
      if (data && data.length > 0) {
        return res.json({ success: true, registered: true, logId: data[0].id });
      }
    } catch (err) {
      console.error("Database error during scan:", err);
      return res.status(500).json({ error: 'Failed to process scan' });
    }
  }

  res.json({ success: true, registered: true, logId: null, message: 'Logged without DB' });
});

// Route: Register a new QR code
app.post('/api/register', async (req, res) => {
  const { qrId, email, password, itemName, itemType } = req.body;
  if (!qrId || !email || !password || !itemName || !itemType) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (supabase) {
    try {
      // Check if already registered
      const { data: existing } = await supabase.from('registered_items').select('qr_id').eq('qr_id', qrId).single();
      if (existing) return res.status(400).json({ error: 'This QR code is already registered' });

      // Insert new registration
      const { error } = await supabase
        .from('registered_items')
        .insert([{ 
          qr_id: qrId, 
          owner_email: email.toLowerCase(), 
          owner_password: password, // In production, hash this password!
          item_name: itemName, 
          item_type: itemType 
        }]);

      if (error) throw error;
      return res.json({ success: true, message: 'Item registered successfully!' });
    } catch (err) {
      console.error("Registration error:", err);
      return res.status(500).json({ error: 'Failed to register item' });
    }
  }
  res.status(500).json({ error: 'Database not connected' });
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

// Route: Fetch scan logs for a specific user
app.post('/api/logs', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(401).json({ error: 'Unauthorized' });

  if (supabase) {
    try {
      // 1. Check for Hardcoded Super Admin
      if (email === 'admin@admin.com' && password === 'admin123') {
        const { data: allItems } = await supabase.from('registered_items').select('*');
        const { data: allLogs, error } = await supabase.from('scan_logs').select('*').order('scanned_at', { ascending: false });
        
        if (error) throw error;
        
        const enrichedLogs = allLogs.map(log => {
          const itemInfo = allItems ? allItems.find(i => i.qr_id === log.qr_id) : null;
          return {
            ...log,
            item_name: itemInfo ? itemInfo.item_name : 'Unregistered',
            item_type: itemInfo ? itemInfo.item_type : 'Unregistered'
          };
        });
        return res.json({ logs: enrichedLogs });
      }

      // 2. Standard User Authentication
      const { data: userItems, error: authError } = await supabase
        .from('registered_items')
        .select('qr_id, item_name, item_type')
        .eq('owner_email', email.toLowerCase())
        .eq('owner_password', password);

      if (authError) throw authError;
      if (!userItems || userItems.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials or no items registered' });
      }

      const userQrIds = userItems.map(item => item.qr_id);

      // 2. Fetch logs ONLY for these QR IDs
      const { data, error } = await supabase
        .from('scan_logs')
        .select('*')
        .in('qr_id', userQrIds)
        .order('scanned_at', { ascending: false });

      if (error) throw error;

      // Attach item details to the logs for the dashboard
      const enrichedLogs = data.map(log => {
        const itemInfo = userItems.find(i => i.qr_id === log.qr_id);
        return {
          ...log,
          item_name: itemInfo ? itemInfo.item_name : 'Unknown',
          item_type: itemInfo ? itemInfo.item_type : 'Unknown'
        };
      });

      return res.json({ logs: enrichedLogs });
    } catch (err) {
      console.error("Fetch logs error:", err);
      return res.status(500).json({ error: 'Failed to fetch logs' });
    }
  }
  res.json({ logs: [] });
});

// Route: Get chat messages for a specific log
app.get('/api/messages/:logId', async (req, res) => {
  const { logId } = req.params;
  if (!supabase) return res.json({ messages: [] });

  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('log_id', logId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ messages: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Route: Send a chat message
app.post('/api/messages', async (req, res) => {
  const { logId, sender, message } = req.body;
  if (!supabase || !logId) return res.status(400).json({ error: 'Invalid request' });

  try {
    const { data, error } = await supabase
      .from('messages')
      .insert([{ log_id: logId, sender, message }])
      .select();

    if (error) throw error;
    res.json({ success: true, message: data[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
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
