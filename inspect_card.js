const https = require('https');

https.get('https://www.businesslist.pk/category/estate-agents', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    // Look at a sample listing card block
    const cardStart = d.indexOf('class="company');
    if (cardStart !== -1) {
      console.log(d.substring(cardStart, cardStart + 1500));
    }
  });
});
