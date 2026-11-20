const https = require('https');

https.get('https://www.businesslist.pk/company/244495/alee-associates-real-estate-investment-consultants', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    // Check if website is mentioned
    console.log("Has website tag?", d.includes('fa-globe') || d.includes('Website') || d.includes('website'));
    // Look for website links
    const webMatch = d.match(/https?:\/\/(?!www\.businesslist\.pk)[a-zA-Z0-9.\-\/]+/g) || [];
    console.log("External links:", webMatch.slice(0, 5));
    // Look for mobile phones
    const mobMatches = d.match(/03\d{2}[-\s]?\d{7}/g) || [];
    console.log("Mobile phones:", [...new Set(mobMatches)]);
  });
});
