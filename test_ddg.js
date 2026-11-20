const https = require('https');

async function searchDuckDuckGo(query) {
  return new Promise((resolve, reject) => {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log("Searching DuckDuckGo for Pakistani businesses...");
  try {
    const html = await searchDuckDuckGo('"solar company" Lahore "03"');
    console.log("HTML length:", html.length);
    // Find phone numbers: 03xx-xxxxxxx or 03xxxxxxxxx
    const phoneRegex = /(?:(?:\+92|0092|0)?\s*3[0-9]{2}[\s\-]?[0-9]{7})/g;
    const matches = html.match(phoneRegex) || [];
    console.log("Found phone matches:", [...new Set(matches)].slice(0, 5));
  } catch(e) {
    console.error(e);
  }
}

run();
