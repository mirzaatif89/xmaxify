const https = require('https');

https.get('https://www.businesslist.pk/category/estate-agents', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
}, res => {
  console.log('Status code:', res.statusCode);
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('Total length:', d.length);
    // Let's inspect titles and phones
    const companyMatches = d.match(/<h3><a href="([^"]+)">([^<]+)<\/a><\/h3>/g) || [];
    console.log('Companies found:', companyMatches.slice(0, 5));
    // Let's see if phones or details are listed
    const phoneMatches = d.match(/03\d{2}[-\s]?\d{7}/g) || [];
    console.log('Phones found directly in page:', [...new Set(phoneMatches)].slice(0, 5));
  });
});
