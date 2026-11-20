const https = require('https');

async function testOverpass() {
  const query = `[out:json][timeout:25];
area["name"="Pakistan"]->.pakistan;
(
  node["amenity"="clinic"]["phone"](area.pakistan);
  node["shop"]["phone"](area.pakistan);
);
out body 10;`;

  const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
  console.log("Fetching from Overpass API...");

  https.get(url, { headers: { 'User-Agent': 'PakistanClientHunter/1.0' } }, (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      try {
        const parsed = JSON.parse(raw);
        console.log(`Success! Total returned: ${parsed.elements ? parsed.elements.length : 0}`);
        if (parsed.elements && parsed.elements.length > 0) {
          parsed.elements.forEach(el => {
            console.log(`- ${el.tags.name || 'Unnamed'}: Phone: ${el.tags.phone || el.tags['contact:phone']}, Website: ${el.tags.website || 'None'}`);
          });
        }
      } catch (err) {
        console.error("Error parsing:", err.message);
      }
    });
  }).on('error', err => console.error("Network error:", err.message));
}

testOverpass();
