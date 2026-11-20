const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const WhatsAppBot = require('./whatsapp_bot');
const { handleIncomingMessage } = require('./ai_sales_agent');

const PORT = process.env.PORT || 4000;
const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, JSON.stringify([], null, 2));

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch (e) {
    return {
      adminUsername: 'admin',
      adminPassword: 'xmaxify2026',
      agencyName: 'Xmaxify',
      yourName: 'Atif',
      yourWhatsApp: '923000000000',
      advancePercentage: '50%',
      defaultPackagePrice: '25,000 PKR',
      bankDetails: 'Meezan Bank / JazzCash',
      geminiApiKey: ''
    };
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

// Active session tokens
const validTokens = new Set();
function generateToken() {
  const token = crypto.randomBytes(24).toString('hex');
  validTokens.add(token);
  return token;
}

function isAuthorized(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return false;
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return validTokens.has(parts[1]);
  }
  return false;
}

// Initialize WhatsApp Bot
const bot = new WhatsAppBot();
bot.onMessageCallback = handleIncomingMessage;

function loadLeads() {
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveLeads(leads) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
}

function fetchPage(targetUrl) {
  return new Promise((resolve, reject) => {
    https.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = 'https://www.businesslist.pk' + redirectUrl;
        }
        return fetchPage(redirectUrl).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function cleanPhone(raw) {
  if (!raw) return null;
  let digits = raw.replace(/[^0-9]/g, '');
  if (digits.startsWith('92')) digits = '0' + digits.substring(2);
  if (digits.startsWith('0092')) digits = '0' + digits.substring(4);
  return digits;
}

function formatWhatsApp(rawPhone) {
  const cleaned = cleanPhone(rawPhone);
  if (!cleaned) return null;
  if (cleaned.startsWith('03')) {
    return '92' + cleaned.substring(1);
  }
  return null;
}

async function scrapeLeads({ city, category, onlyNoWebsite = true, maxResults = 10, pageNum = 1 }) {
  let targetUrl = '';
  if (city) {
    targetUrl = `https://www.businesslist.pk/location/${encodeURIComponent(city.toLowerCase())}/${encodeURIComponent(category)}`;
  } else {
    targetUrl = `https://www.businesslist.pk/category/${encodeURIComponent(category)}`;
  }

  if (pageNum > 1) {
    targetUrl += `/${pageNum}`;
  }

  console.log(`[Scraper] Fetching listing: ${targetUrl}`);
  const html = await fetchPage(targetUrl);

  const linkRegex = /<a\s+href="(\/company\/[0-9]+\/[^"]+)"/g;
  const links = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    if (!links.includes(match[1])) {
      links.push(match[1]);
    }
  }

  console.log(`[Scraper] Found ${links.length} business links on page ${pageNum}. Processing details...`);

  const results = [];
  for (const relLink of links) {
    if (results.length >= maxResults) break;
    try {
      const detailUrl = `https://www.businesslist.pk${relLink}`;
      const detailHtml = await fetchPage(detailUrl);

      const hasWebsite = detailHtml.includes('Website address');
      if (onlyNoWebsite && hasWebsite) {
        continue;
      }

      const nameMatch = detailHtml.match(/id="company_name">([^<]+)<\/div>/);
      const name = nameMatch ? nameMatch[1].replace(/&amp;/g, '&').replace(/&#45;/g, '-').trim() : 'Business';

      const mobileMatch = detailHtml.match(/<div class="label">Mobile phone<\/div><div class="text"><a href="tel:([^"]+)">/);
      const phoneMatch = detailHtml.match(/<div class="label">Contact number<\/div><div class="text phone"><a href="tel:([^"]+)">/);
      const mobile = mobileMatch ? mobileMatch[1].trim() : (phoneMatch ? phoneMatch[1].trim() : null);

      const addressMatch = detailHtml.match(/id="company_address">([^<]+)<\/div>/);
      const address = addressMatch ? addressMatch[1].replace(/&#45;/g, '-').replace(/<[^>]+>/g, '').trim() : (city || 'Pakistan');

      const contactMatch = detailHtml.match(/<div class="label">Contact Person<\/div>\s*([^<]+)<\/div>/);
      const managerMatch = detailHtml.match(/<div class="label">Company manager<\/div>\s*([^<]+)<\/div>/);
      const contactPerson = contactMatch ? contactMatch[1].trim() : (managerMatch ? managerMatch[1].trim() : '');

      const whatsapp = formatWhatsApp(mobile);
      const id = relLink.split('/')[2];

      results.push({
        id,
        name,
        contactPerson: contactPerson || 'Owner',
        mobile: mobile || 'N/A',
        whatsapp: whatsapp || null,
        address,
        city: city ? city.charAt(0).toUpperCase() + city.slice(1) : 'Pakistan',
        category,
        hasWebsite,
        url: detailUrl,
        status: 'New',
        scrapedAt: new Date().toISOString()
      });

      await new Promise(r => setTimeout(r, 350));
    } catch (e) {
      console.error(`[Scraper Error] ${relLink}:`, e.message);
    }
  }

  const existingLeads = loadLeads();
  let addedCount = 0;
  for (const r of results) {
    const exists = existingLeads.some(l => l.id === r.id || (r.whatsapp && l.whatsapp === r.whatsapp));
    if (!exists) {
      existingLeads.unshift(r);
      addedCount++;
    }
  }
  saveLeads(existingLeads);

  return { results, addedCount, totalSaved: existingLeads.length };
}

// Background Auto-Outreach loop
let autoOutreachActive = false;
let autoOutreachStats = { sent: 0, total: 0, current: '' };

async function runAutoOutreach(leadIds, delaySec = 30) {
  if (autoOutreachActive) return;
  autoOutreachActive = true;
  bot.isAutoOutreachRunning = true;

  const leads = loadLeads();
  const targetLeads = leads.filter(l => leadIds.includes(l.id) && l.whatsapp);
  autoOutreachStats = { sent: 0, total: targetLeads.length, current: '' };

  const settings = loadSettings();
  const myName = settings.yourName || 'Atif';
  const agency = settings.agencyName || 'Xmaxify';

  for (const lead of targetLeads) {
    if (!autoOutreachActive) break;

    const ownerName = lead.contactPerson && lead.contactPerson !== 'Owner' ? lead.contactPerson : 'Bhai';
    const bizName = lead.name || 'aapka business';
    
    const pitch = `Assalam-o-Alaikum ${ownerName}!\n\nMaine Google par aapka business "${bizName}" dekha. MashaAllah aapka kaam bohot behtareen hai aur clients ke reviews bhi achhe hain.\n\nLekin notice kiya ke aapki koi Official Website nahi bani hui, jiski wajah se ${lead.city || 'Pakistan'} mein aapke competitors rozana naye customers le rahe hain jo Google par search karte hain.\n\nHumne aapke business ke liye ek mobile-friendly website ka quick sample design kiya hai. Agar aap permit karein to kya main 2 minute ka short demo WhatsApp par share karoon?\n\nShukriya,\n${myName} | ${agency}`;

    try {
      autoOutreachStats.current = `${lead.name} (${lead.whatsapp})`;
      await bot.sendMessage(lead.whatsapp, pitch);
      
      const allLeads = loadLeads();
      const idx = allLeads.findIndex(l => l.id === lead.id);
      if (idx !== -1) {
        allLeads[idx].status = 'Contacted';
        saveLeads(allLeads);
      }
      autoOutreachStats.sent++;
      console.log(`[Auto-Outreach] Sent pitch to ${lead.name} (${autoOutreachStats.sent}/${autoOutreachStats.total})`);

      const waitTime = Math.max(15, delaySec + Math.floor(Math.random() * 10 - 5)) * 1000;
      await new Promise(r => setTimeout(r, waitTime));
    } catch (err) {
      console.error(`[Auto-Outreach Failed] ${lead.name}:`, err.message);
    }
  }

  autoOutreachActive = false;
  bot.isAutoOutreachRunning = false;
}

// Request dispatcher
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Auth Endpoints
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { username, password } = JSON.parse(body || '{}');
        const settings = loadSettings();
        if (
          username === (settings.adminUsername || 'admin') &&
          password === (settings.adminPassword || 'xmaxify2026')
        ) {
          const token = generateToken();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, token }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid username or password' }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/auth/check' && req.method === 'GET') {
    const authed = isAuthorized(req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ authenticated: authed }));
    return;
  }

  // Protected API Endpoints (Require Bearer token)
  const isProtectedApi = pathname.startsWith('/api/') && pathname !== '/api/auth/login' && pathname !== '/api/auth/check';
  if (isProtectedApi && !isAuthorized(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized. Please login at /login' }));
    return;
  }

  if (pathname === '/api/leads' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadLeads()));
    return;
  }

  if (pathname === '/api/scrape' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const data = await scrapeLeads({
          city: payload.city || '',
          category: payload.category || 'estate-agents',
          onlyNoWebsite: payload.onlyNoWebsite !== false,
          maxResults: parseInt(payload.maxResults, 10) || 10,
          pageNum: parseInt(payload.pageNum, 10) || 1
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname.startsWith('/api/leads/') && req.method === 'PUT') {
    const id = pathname.split('/')[3];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const updates = JSON.parse(body || '{}');
        const leads = loadLeads();
        const index = leads.findIndex(l => l.id === id);
        if (index !== -1) {
          leads[index] = { ...leads[index], ...updates, updatedAt: new Date().toISOString() };
          saveLeads(leads);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, lead: leads[index] }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Lead not found' }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname.startsWith('/api/leads/') && req.method === 'DELETE') {
    const id = pathname.split('/')[3];
    let leads = loadLeads();
    leads = leads.filter(l => l.id !== id);
    saveLeads(leads);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // WhatsApp Endpoints
  if (pathname === '/api/whatsapp/status' && req.method === 'GET') {
    const status = bot.getStatus();
    status.autoOutreach = {
      active: autoOutreachActive,
      sent: autoOutreachStats.sent,
      total: autoOutreachStats.total,
      current: autoOutreachStats.current
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
    return;
  }

  if (pathname === '/api/whatsapp/connect' && req.method === 'POST') {
    bot.initSocket();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'WhatsApp connection initiated' }));
    return;
  }

  if (pathname === '/api/whatsapp/disconnect' && req.method === 'POST') {
    bot.logout();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Logged out of WhatsApp' }));
    return;
  }

  if (pathname === '/api/whatsapp/toggle-ai' && req.method === 'POST') {
    bot.aiEnabled = !bot.aiEnabled;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, aiEnabled: bot.aiEnabled }));
    return;
  }

  if (pathname === '/api/whatsapp/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { to, text } = JSON.parse(body || '{}');
        await bot.sendMessage(to, text);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/whatsapp/auto-outreach' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { leadIds, delaySec } = JSON.parse(body || '{}');
        runAutoOutreach(leadIds || [], delaySec || 30);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Auto-outreach started' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/whatsapp/stop-outreach' && req.method === 'POST') {
    autoOutreachActive = false;
    bot.isAutoOutreachRunning = false;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Auto-outreach stopped' }));
    return;
  }

  if (pathname === '/api/whatsapp/chats' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(bot.loadChats()));
    return;
  }

  if (pathname === '/api/settings' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadSettings()));
    return;
  }

  if (pathname === '/api/settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const updates = JSON.parse(body || '{}');
        const current = loadSettings();
        const merged = { ...current, ...updates };
        saveSettings(merged);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, settings: merged }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/export' && req.method === 'GET') {
    const leads = loadLeads();
    const headers = ['Business Name', 'Owner/Contact', 'Mobile Phone', 'WhatsApp', 'City', 'Address', 'Status', 'Has Website', 'Profile Link'];
    const rows = leads.map(l => [
      `"${(l.name || '').replace(/"/g, '""')}"`,
      `"${(l.contactPerson || '').replace(/"/g, '""')}"`,
      `"${l.mobile || ''}"`,
      `"${l.whatsapp || ''}"`,
      `"${l.city || ''}"`,
      `"${(l.address || '').replace(/"/g, '""')}"`,
      `"${l.status || 'New'}"`,
      l.hasWebsite ? 'Yes' : 'No',
      `"${l.url || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="xmaxify_website_leads.csv"'
    });
    res.end(csvContent);
    return;
  }

  // Routing Pages
  let targetFile = 'index.html';
  if (pathname === '/login') {
    targetFile = 'login.html';
  } else if (pathname === '/admin') {
    targetFile = 'admin.html';
  } else if (pathname !== '/') {
    targetFile = pathname.startsWith('/') ? pathname.substring(1) : pathname;
  }

  let filePath = path.join(__dirname, 'public', targetFile);
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(__dirname, 'public', 'index.html'), (e, html) => {
          if (e) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      }
    } else {
      let extname = path.extname(filePath);
      let contentType = 'text/html';
      if (extname === '.js') contentType = 'text/javascript';
      if (extname === '.css') contentType = 'text/css';
      if (extname === '.json') contentType = 'application/json';
      if (extname === '.png') contentType = 'image/png';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Xmaxify Public Website: http://localhost:${PORT}`);
  console.log(`🔒 Xmaxify Admin Panel:    http://localhost:${PORT}/admin`);
  console.log(`🔑 Admin Login:            http://localhost:${PORT}/login`);
  console.log(`====================================================`);
});
