const https = require('https');

https.get('https://www.businesslist.pk/company/242599/wadaan-enterprises', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const hasWebsite = d.includes('Website address');
    console.log("Has website:", hasWebsite);
    
    // Extract info
    const name = (d.match(/id="company_name">([^<]+)<\/div>/) || [])[1];
    const mobile = (d.match(/<div class="label">Mobile phone<\/div><div class="text"><a href="tel:([^"]+)">/) || [])[1];
    const address = (d.match(/id="company_address">([^<]+)<\/div>/) || [])[1];
    const contactPerson = (d.match(/<div class="label">Contact Person<\/div>\s*([^<]+)<\/div>/) || [])[1];
    
    console.log({
      name,
      mobile,
      address,
      contactPerson: contactPerson ? contactPerson.trim() : 'N/A',
      hasWebsite
    });
  });
});
