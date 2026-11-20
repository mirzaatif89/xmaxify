const https = require('https');

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
  return null; // Landline
}

async function scrapeCategory({ city, category, onlyNoWebsite = true, maxResults = 10 }) {
  const baseUrl = city 
    ? `https://www.businesslist.pk/location/${encodeURIComponent(city.toLowerCase())}/${encodeURIComponent(category)}`
    : `https://www.businesslist.pk/category/${encodeURIComponent(category)}`;
    
  console.log(`Fetching listings from: ${baseUrl}`);
  const html = await fetchPage(baseUrl);
  
  // Extract company links: href="/company/..."
  const linkRegex = /<a\s+href="(\/company\/[0-9]+\/[^"]+)"/g;
  const links = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    if (!links.includes(match[1])) {
      links.push(match[1]);
    }
  }
  
  console.log(`Found ${links.length} business links on page. Checking details...`);
  
  const leads = [];
  for (const relLink of links) {
    if (leads.length >= maxResults) break;
    try {
      const detailUrl = `https://www.businesslist.pk${relLink}`;
      const detailHtml = await fetchPage(detailUrl);
      
      const hasWebsite = detailHtml.includes('Website address');
      if (onlyNoWebsite && hasWebsite) {
        continue; // Skip if they already have a website
      }
      
      const nameMatch = detailHtml.match(/id="company_name">([^<]+)<\/div>/);
      const name = nameMatch ? nameMatch[1].trim() : 'Business';
      
      const mobileMatch = detailHtml.match(/<div class="label">Mobile phone<\/div><div class="text"><a href="tel:([^"]+)">/);
      const phoneMatch = detailHtml.match(/<div class="label">Contact number<\/div><div class="text phone"><a href="tel:([^"]+)">/);
      const mobile = mobileMatch ? mobileMatch[1].trim() : (phoneMatch ? phoneMatch[1].trim() : null);
      
      const addressMatch = detailHtml.match(/id="company_address">([^<]+)<\/div>/);
      const address = addressMatch ? addressMatch[1].replace(/&#45;/g, '-').trim() : (city || 'Pakistan');
      
      const contactMatch = detailHtml.match(/<div class="label">Contact Person<\/div>\s*([^<]+)<\/div>/);
      const managerMatch = detailHtml.match(/<div class="label">Company manager<\/div>\s*([^<]+)<\/div>/);
      const contactPerson = contactMatch ? contactMatch[1].trim() : (managerMatch ? managerMatch[1].trim() : '');
      
      const whatsapp = formatWhatsApp(mobile);
      
      leads.push({
        id: relLink.split('/')[2],
        name,
        contactPerson: contactPerson || 'Owner',
        mobile: mobile || 'N/A',
        whatsapp: whatsapp || null,
        address,
        city: city || 'Pakistan',
        category,
        hasWebsite,
        url: detailUrl
      });
      
      // Be gentle to server
      await new Promise(r => setTimeout(r, 400));
    } catch (e) {
      console.error(`Error scraping ${relLink}:`, e.message);
    }
  }
  
  return leads;
}

// Quick self-test
scrapeCategory({ city: 'lahore', category: 'estate-agents', onlyNoWebsite: true, maxResults: 3 })
  .then(res => {
    console.log("Results:\n", JSON.stringify(res, null, 2));
  })
  .catch(console.error);
