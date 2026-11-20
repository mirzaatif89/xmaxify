const https = require('https');

https.get('https://www.businesslist.pk/company/244495/alee-associates-real-estate-investment-consultants', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    // Print lines containing 'web' or 'site'
    const lines = d.split('\n').filter(l => l.toLowerCase().includes('website') || l.toLowerCase().includes('fa-globe'));
    console.log("Lines with website/globe:", lines);
  });
});
