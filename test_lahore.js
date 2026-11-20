const https = require('https');

async function testLahore() {
  // Lahore Bounding Box: 31.35 to 31.65 lat, 74.20 to 74.45 lon
  const query = `
  [out:json][timeout:30];
  (
    node["phone"](31.35,74.20,31.65,74.45);
    node["contact:phone"](31.35,74.20,31.65,74.45);
    way["phone"](31.35,74.20,31.65,74.45);
  );
  out tags 30;
  `;

  const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
  console.log("Querying Lahore businesses with phone numbers...");

  https.get(url, { headers: { 'User-Agent': 'PakistanClientHunter/1.0' } }, (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      try {
        const parsed = JSON.parse(raw);
        console.log(`Total businesses found with phone: ${parsed.elements.length}`);
        const noWebsite = parsed.elements.filter(e => !e.tags.website);
        console.log(`Businesses with NO website: ${noWebsite.length}`);
        noWebsite.slice(0, 8).forEach((e, idx) => {
          console.log(`${idx + 1}. ${e.tags.name || 'Business'} | Category: ${e.tags.amenity || e.tags.shop || e.tags.office || 'Commercial'} | Phone: ${e.tags.phone || e.tags['contact:phone']}`);
        });
      } catch (err) {
        console.error("Error:", err.message);
      }
    });
  }).on('error', err => console.error("Network error:", err.message));
}

testLahore();
