const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const AUTH_DIR = path.join(__dirname, 'data', 'auth_info_baileys');
const CHATS_FILE = path.join(__dirname, 'data', 'chats.json');

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, JSON.stringify({}, null, 2));

class WhatsAppBot {
  constructor(options = {}) {
    this.sock = null;
    this.qrCodeDataUrl = null;
    this.connectionStatus = 'disconnected'; // disconnected | connecting | connected
    this.userJid = null;
    this.onMessageCallback = null;
    this.isAutoOutreachRunning = false;
    this.outreachQueue = [];
    this.aiEnabled = true;
    this.logger = pino({ level: 'silent' });
  }

  loadChats() {
    try {
      return JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8'));
    } catch (e) {
      return {};
    }
  }

  saveChats(chats) {
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2), 'utf8');
  }

  logChatMessage(jid, message) {
    const chats = this.loadChats();
    const cleanJid = jid.split('@')[0];
    if (!chats[cleanJid]) {
      chats[cleanJid] = [];
    }
    chats[cleanJid].push({
      ...message,
      timestamp: new Date().toISOString()
    });
    this.saveChats(chats);
  }

  async initSocket() {
    try {
      this.connectionStatus = 'connecting';
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        logger: this.logger,
        printQRInTerminal: false,
        auth: state,
        browser: ['Pakistan Client Hunter', 'Chrome', '120.0.0']
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCodeDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
            this.connectionStatus = 'scan_needed';
            console.log('[WhatsApp] New QR code generated. Ready for scanning.');
          } catch (err) {
            console.error('[WhatsApp] QR Error:', err.message);
          }
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
          console.log('[WhatsApp] Connection closed. Reason:', lastDisconnect?.error?.message, 'Reconnecting:', shouldReconnect);
          this.connectionStatus = 'disconnected';
          this.qrCodeDataUrl = null;
          this.userJid = null;

          if (shouldReconnect) {
            setTimeout(() => this.initSocket(), 3000);
          }
        } else if (connection === 'open') {
          console.log('[WhatsApp] Successfully connected to WhatsApp!');
          this.connectionStatus = 'connected';
          this.qrCodeDataUrl = null;
          this.userJid = this.sock.user?.id || 'Connected';
        }
      });

      // Listen for incoming messages
      this.sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          if (msg.key.fromMe) continue; // Ignore messages sent by ourselves

          const senderJid = msg.key.remoteJid;
          if (!senderJid || senderJid.endsWith('@g.us')) continue; // Ignore group messages

          const messageText = 
            msg.message?.conversation || 
            msg.message?.extendedTextMessage?.text || 
            msg.message?.imageMessage?.caption || 
            '';

          if (!messageText.trim()) continue;

          console.log(`[WhatsApp Incoming] from ${senderJid}: "${messageText}"`);

          // Log user message
          this.logChatMessage(senderJid, {
            sender: 'client',
            text: messageText,
            fromMe: false
          });

          // Callback to AI Sales Agent
          if (this.onMessageCallback) {
            try {
              await this.onMessageCallback(senderJid, messageText, this);
            } catch (err) {
              console.error('[WhatsApp Callback Error]', err);
            }
          }
        }
      });

    } catch (e) {
      console.error('[WhatsApp Init Error]', e);
      this.connectionStatus = 'disconnected';
    }
  }

  async sendMessage(toJid, text) {
    if (!this.sock || this.connectionStatus !== 'connected') {
      throw new Error('WhatsApp is not connected! Please scan QR code first.');
    }

    let cleanNumber = toJid.replace(/[^0-9]/g, '');
    if (cleanNumber.startsWith('0')) cleanNumber = '92' + cleanNumber.substring(1);
    const jid = cleanNumber.includes('@s.whatsapp.net') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;

    console.log(`[WhatsApp Sending] to ${jid}: "${text.substring(0, 50)}..."`);
    await this.sock.sendMessage(jid, { text });

    this.logChatMessage(jid, {
      sender: 'me',
      text,
      fromMe: true
    });

    return true;
  }

  async logout() {
    try {
      if (this.sock) {
        await this.sock.logout();
      }
      this.sock = null;
      this.connectionStatus = 'disconnected';
      this.qrCodeDataUrl = null;
      this.userJid = null;
      // Clean auth directory
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('[WhatsApp Logout Error]', e);
    }
  }

  getStatus() {
    return {
      status: this.connectionStatus,
      qrCode: this.qrCodeDataUrl,
      userJid: this.userJid ? this.userJid.split(':')[0] : null,
      aiEnabled: this.aiEnabled,
      isAutoOutreachRunning: this.isAutoOutreachRunning,
      queueRemaining: this.outreachQueue.length
    };
  }
}

module.exports = WhatsAppBot;
