const fs = require('fs');
const path = require('path');
const https = require('https');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');

function getSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch (e) {
    return {
      yourName: 'Atif',
      yourAgency: 'Digital Solutions',
      yourWhatsApp: '923000000000',
      defaultPackagePrice: '25,000 PKR',
      bankDetails: 'Meezan Bank / JazzCash',
      geminiApiKey: ''
    };
  }
}

function getLeads() {
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function updateLead(id, updates) {
  const leads = getLeads();
  const idx = leads.findIndex(l => l.id === id);
  if (idx !== -1) {
    leads[idx] = { ...leads[idx], ...updates, updatedAt: new Date().toISOString() };
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
  }
}

// Call Google Gemini API if user has API key configured
async function generateGeminiReply({ clientMessage, chatHistory, leadInfo, settings }) {
  const apiKey = settings.geminiApiKey;
  if (!apiKey) return null;

  const systemInstruction = `
You are ${settings.yourName || 'Atif'}, lead consultant at ${settings.yourAgency || 'Digital Solutions'}, a reputable web design & IT agency in Pakistan.
You are talking on WhatsApp to a Pakistani business owner: ${leadInfo ? leadInfo.contactPerson || 'Bhai' : 'Bhai'} of "${leadInfo ? leadInfo.name : 'their business'}".
Language: Polite, natural, persuasive Roman Urdu (e.g., "Assalam-o-Alaikum bhai", "Aap bilkul befikar rahein", "JazakAllah").

Your Core Objective:
1. Convince the business owner to get a modern website built for their business.
2. Maintain standard pricing: Total ${settings.defaultPackagePrice || '25,000 PKR'}.
3. STRICT POLICY: 50% advance (${parseInt((settings.defaultPackagePrice || '25000').replace(/[^0-9]/g, '')) / 2 || 12500} PKR) is mandatory before starting work to purchase their official .com Domain and Cloud Hosting server. The remaining 50% is paid after they inspect and approve the live website.
4. Objection Handling:
   - If they refuse advance ("pehle poora kaam karo"): Politely explain that domain and cloud server are registered in their name and cannot be refunded by the hosting company. Offer to show a 1-page free wireframe/mockup concept first so they feel 100% confident.
   - If they ask price: Give the package details (Mobile responsive, Fast, WhatsApp chat button, Google Maps listing, SEO).
   - If they agree to proceed: Give bank / JazzCash payment details.
5. Keep your responses concise (2 to 4 short sentences max). Avoid sounding like a rigid bot. Talk like a friendly, professional Pakistani IT expert.
`;

  const prompt = `
Client's Business: ${leadInfo ? leadInfo.name : 'Business'} (${leadInfo ? leadInfo.city : 'Pakistan'})
Client's Latest WhatsApp Message: "${clientMessage}"

Respond in friendly Roman Urdu to guide them towards agreeing to the website and the 50% advance:
`;

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: systemInstruction + '\n\n' + prompt }]
        }
      ]
    });

    const req = https.request(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          const reply = json.candidates?.[0]?.content?.parts?.[0]?.text;
          resolve(reply ? reply.trim() : null);
        } catch (e) {
          console.error('[Gemini API Parse Error]', e.message);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.error('[Gemini API Request Error]', err.message);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

// Built-in Smart State Machine (Works 100% offline without API key)
function generateRuleBasedReply({ clientMessage, leadInfo, settings }) {
  const msg = clientMessage.toLowerCase();
  const name = leadInfo?.contactPerson && leadInfo.contactPerson !== 'Owner' ? leadInfo.contactPerson : 'Bhai';
  const biz = leadInfo?.name || 'aapke business';
  const price = settings.defaultPackagePrice || '25,000 PKR';
  const numOnly = parseInt(price.replace(/[^0-9]/g, '')) || 25000;
  const advance = (numOnly / 2).toLocaleString() + ' PKR';
  const balance = (numOnly / 2).toLocaleString() + ' PKR';
  const myName = settings.yourName || 'Atif';
  const agency = settings.yourAgency || 'Digital Solutions';

  // 1. Greetings (Salam / Hi / Hello)
  if (msg.includes('salam') || msg.includes('slam') || msg.includes('slaam') || msg.startsWith('aoa') || msg === 'hi' || msg === 'hello') {
    return `Walaikum Assalam ${name} bhai!\n\nBohat shukriya message karne ka. Maine "${biz}" ke baare mein message kiya tha. Aaj kal har customer pehle Google par search karta hai, isliye hum aapke business ke liye ek high-speed mobile-friendly website setup kar rahe hain.\n\nKya aap chahte hain ke main aapko iska 1-page free sample design WhatsApp par dikhaoon?`;
  }

  // 2. Pricing inquiries (Kitne paise / Rate / Price / Charges / Cost)
  if (msg.includes('price') || msg.includes('rate') || msg.includes('paise') || msg.includes('charges') || msg.includes('cost') || msg.includes('package') || msg.includes('kitna') || msg.includes('kitnay')) {
    return `${name} bhai, humara standard complete business package sirf **${price}** ka hai.\n\nIsme shamil hai:\n✅ Official .com Domain & 1 Year High-Speed Cloud Hosting\n✅ Mobile, Tablet & Desktop Responsive Design\n✅ Direct WhatsApp Chat Button (customer 1-click pe rabta karega)\n✅ Google Maps & SEO Integration\n\nIska 50% advance (${advance}) domain/server activate karne ke liye hota hai, aur baqi 50% (${balance}) jab website poori live ho kar aap approve karein tab dena hota hai.\n\nKya main aapke liye sample design shuru karoon?`;
  }

  // 3. Objection on 50% Advance ("Pehle banao", "Advance nahi doonga", "Kaam ke baad paise")
  if (msg.includes('pehle') || msg.includes('pehly') || msg.includes('advance nahi') || msg.includes('baad me') || msg.includes('baad mein') || msg.includes('bad me') || msg.includes('kaam dekh kar') || msg.includes('trust')) {
    return `${name} bhai, aapki pareshani bilkul samajh sakta hoon, aaj kal log waqai fraud se darte hain.\n\nLekin fikar na karein: 50% advance hamari fees nahi hoti, balki yeh direct hosting company aur domain registry (.com) ko pay karna hota hai jo direct aapke business ke naam register hoti hai.\n\nAapki tasalli ke liye hum pehle aapko free 1-page mockup layout bana kar dikha dete hain. Jab aapko design 100% pasand aa jaye, tabhi hum official domain booking aur 50% advance invoice process karenge. Yeh kaisa rahega?`;
  }

  // 4. Portfolio / Samples ("Sample dikhao", "Kaam dikhao", "Demo", "Link")
  if (msg.includes('sample') || msg.includes('demo') || msg.includes('portfolio') || msg.includes('kaam dikhao') || msg.includes('link') || msg.includes('preview')) {
    return `${name} bhai, zaroor! Humne Pakistan bhar mein real estate, medical clinics, solar aur retail stores ke liye modern websites banayi hain.\n\nAap is link par recent designs check kar sakte hain, aur hum specially "${biz}" ke colours aur logo ke mutabiq customize karte hain.\n\nKya aapka koi logo ya preferred design style hai jo aap share karna chahein?`;
  }

  // 5. Office / Location ("Kahan se ho", "Office kahan hai", "Location")
  if (msg.includes('office') || msg.includes('location') || msg.includes('kahan') || msg.includes('address') || msg.includes('sheher') || msg.includes('city')) {
    return `${name} bhai, hamari main agency team Lahore/Islamabad mein located hai, aur hum remote IT services ke zariye poore Pakistan (Karachi, Faisalabad, Multan, Rawalpindi) mein clients ko serve karte hain.\n\nAapko office aane ki zaroorat nahi parti, daily updates staging server aur WhatsApp par share hoti hain.\n\nKya hum project ke milestones finalize karein?`;
  }

  // 6. Agreement / Yes / Payment info ("Haan bana do", "Theek hai", "Advance kahan bhejna hai", "Account details", "Send details")
  if (msg.includes('theek hai') || msg.includes('thik hai') || msg.includes('haan') || msg.includes('ok') || msg.includes('done') || msg.includes('start') || msg.includes('account') || msg.includes('bhejo') || msg.includes('send') || msg.includes('jazzcash') || msg.includes('easypaisa') || msg.includes('mizan') || msg.includes('bank')) {
    return `Zabardast ${name} bhai! Project confirm karne ke liye Milestone 1 (50% Advance: ${advance}) ki details yeh hain:\n\n📌 **Payment Details:**\nBank: Meezan Bank / HBL\nAccount Title: ${myName}\nIBAN / Account: PK00MEZN00001234567890\nJazzCash / EasyPaisa: ${settings.yourWhatsApp || '0300-XXXXXXX'}\n\nTransfer karne ke baad receipt ka screenshot yahan share kar dein taake hum aapki .com Domain aur Cloud Server foran register kar ke website development kick-off kar dein!\n\nJazakAllah!`;
  }

  // 7. Default friendly fallback
  return `Jee ${name} bhai! Maine aapki baat note kar li hai. Hum "${biz}" ke liye aisi professional website tayyar karenge jo aapke business ki credibility barhaye aur Google se naye customers laye.\n\nAapko iske baare mein koi bhi sawal ya details chahiye hon to bejhijhak poochein, main abhi guide kar deta hoon.`;
}

// Master AI Handler invoked by WhatsAppBot
async function handleIncomingMessage(senderJid, messageText, bot) {
  const cleanPhone = senderJid.replace(/[^0-9]/g, '');
  const leads = getLeads();
  const settings = getSettings();

  // Find matching lead
  let lead = leads.find(l => {
    if (!l.mobile) return false;
    const cleanL = l.mobile.replace(/[^0-9]/g, '');
    return cleanPhone.endsWith(cleanL) || cleanL.endsWith(cleanPhone);
  });

  if (lead) {
    console.log(`[AI Sales Agent] Message from identified client: ${lead.name} (${lead.contactPerson})`);
    // Update lead status
    if (lead.status === 'New' || lead.status === 'Contacted') {
      updateLead(lead.id, { status: 'Interested' });
    }
  } else {
    console.log(`[AI Sales Agent] Message from unknown number: ${cleanPhone}`);
  }

  // Check if AI auto-reply is enabled in bot
  if (!bot.aiEnabled) {
    console.log('[AI Sales Agent] AI is toggled OFF. Skipping auto-reply.');
    return;
  }

  // Simulate human reading & typing delay (3-6 seconds)
  const delayMs = 3000 + Math.floor(Math.random() * 3000);
  console.log(`[AI Sales Agent] Analyzing message... Will reply in ${(delayMs / 1000).toFixed(1)}s`);
  await new Promise(r => setTimeout(r, delayMs));

  let replyText = null;

  // Try Gemini if configured
  if (settings.geminiApiKey) {
    try {
      replyText = await generateGeminiReply({
        clientMessage: messageText,
        chatHistory: [],
        leadInfo: lead,
        settings
      });
    } catch (e) {
      console.error('[Gemini Error, falling back to rule-based]', e);
    }
  }

  // Fallback to rule-based system
  if (!replyText) {
    replyText = generateRuleBasedReply({
      clientMessage: messageText,
      leadInfo: lead,
      settings
    });
  }

  if (replyText) {
    await bot.sendMessage(senderJid, replyText);

    // If agreement detected, update status to Advance Agreed
    const lower = messageText.toLowerCase();
    if (lead && (lower.includes('theek hai') || lower.includes('done') || lower.includes('account') || lower.includes('jazzcash') || lower.includes('advance kahan'))) {
      updateLead(lead.id, { status: 'Advance Agreed' });
    }
  }
}

module.exports = {
  handleIncomingMessage,
  generateRuleBasedReply,
  generateGeminiReply
};
