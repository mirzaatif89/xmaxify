const https = require('https');

https.get('https://www.businesslist.pk/', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const matches = d.match(/href="([^"]*category[^"]*)"/gi) || [];
    console.log('Categories found:', matches.slice(0, 15));
  });
});
