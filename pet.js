// ============================================
// Click counters (via your own Cloudflare Worker) + email notification (via EmailJS)
// "pets", "prizes", AND now "catnip" all go through ONE Worker backend.
// ============================================

const EMAILJS_PUBLIC_KEY = "QORZHtKFzomPXpHz4";
const EMAILJS_SERVICE_ID = "service_2rcy7it";
const EMAILJS_TEMPLATE_ID = "template_0v6kx08";
const EMAILJS_PRIZE_TEMPLATE_ID = "template_vte0m0t";

emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

const WORKER_BASE_URL = "https://prize-counter.gersonv5005.workers.dev";

const countDisplay = document.getElementById("countDisplay");
const petButton = document.getElementById("petButton");
const prizeCountDisplay = document.getElementById("prizeCountDisplay");
const priceButton = document.getElementById("priceButton");
const petMessage = document.getElementById("petMessage");
const prizeMessage = document.getElementById("prizeMessage");

// NEW — catnip elements. Same pattern as pets/prizes above.
const catnipCountDisplay = document.getElementById("catnipCountDisplay");
const catnipButton = document.getElementById("catnipButton");
const catnipMessage = document.getElementById("catnipMessage");

async function loadCount(counterName, displayElement, label) {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/${counterName}`);
    const data = await response.json();
    displayElement.textContent = `${label}: ${data.count}`;
  } catch (error) {
    console.log(`Couldn't load ${counterName} count:`, error);
    displayElement.textContent = `${label}: —`;
  }
}

async function incrementCount(counterName, displayElement, label) {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/${counterName}/up`, {
      method: "POST",
    });
    const data = await response.json();
    displayElement.textContent = `${label}: ${data.count}`;
    return data.count;
  } catch (error) {
    console.log(`Couldn't update ${counterName} count:`, error);
    return null;
  }
}

// ------------------------------------------------------------------
// PET MESSAGE — shows the "annoyed" warning for 5 seconds.
// ------------------------------------------------------------------

let petMessageTimer = null;

function flashPetMessage(text, durationMs = 5000) {
  petMessage.textContent = text;
  petMessage.classList.add("visible");
  clearTimeout(petMessageTimer);
  petMessageTimer = setTimeout(() => {
    petMessage.classList.remove("visible");
  }, durationMs);
}

// ------------------------------------------------------------------
// PETS — BURST/SPAM LIMITER
// Max 1 click allowed within 1000ms (1 second) — any 2nd click that
// fast counts as spam and gets blocked.
// ------------------------------------------------------------------

const PET_BURST_LIMIT = 1;
const PET_BURST_WINDOW_MS = 1000;

let petClickTimestamps = [];

function isPetBurstSpam() {
  const now = Date.now();
  petClickTimestamps.push(now);
  petClickTimestamps = petClickTimestamps.filter(
    (timestamp) => now - timestamp <= PET_BURST_WINDOW_MS
  );
  return petClickTimestamps.length > PET_BURST_LIMIT;
}

// ------------------------------------------------------------------
// PRIZE — 15 MINUTE COOLDOWN (localStorage-based, survives reloads)
// ------------------------------------------------------------------

const PRIZE_COOLDOWN_MS = 15 * 60 * 1000;
const PRIZE_COOLDOWN_STORAGE_KEY = "lastPrizeClaimAt";

function getPrizeCooldownRemainingMs() {
  const lastClaimRaw = localStorage.getItem(PRIZE_COOLDOWN_STORAGE_KEY);
  const lastClaimAt = lastClaimRaw ? parseInt(lastClaimRaw, 10) : 0;
  const elapsed = Date.now() - lastClaimAt;
  const remaining = PRIZE_COOLDOWN_MS - elapsed;
  return remaining > 0 ? remaining : 0;
}

function markPrizeClaimedNow() {
  localStorage.setItem(PRIZE_COOLDOWN_STORAGE_KEY, Date.now().toString());
}

function formatRemainingTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

let prizeCooldownInterval = null;

function startPrizeCooldownDisplay(justClaimed) {
  clearInterval(prizeCooldownInterval);

  function tick(isFirstTick) {
    const remaining = getPrizeCooldownRemainingMs();
    if (remaining <= 0) {
      clearInterval(prizeCooldownInterval);
      prizeMessage.classList.remove("visible");
      return;
    }
    const prefix = isFirstTick && justClaimed ? "🎉 Prize sent! " : "";
    prizeMessage.textContent = `${prefix}Next prize in ${formatRemainingTime(remaining)} ⏳`;
    prizeMessage.classList.add("visible");
  }

  tick(true);
  prizeCooldownInterval = setInterval(() => tick(false), 1000);
}

// ------------------------------------------------------------------
// CATNIP — TEST MODE FOR NOW
// This just counts clicks, same as prizes did before its cooldown was
// added. No captcha and no cooldown yet — that verification step gets
// layered on top of this later, same way prizes' cooldown got added
// after its counter was already working.
// ------------------------------------------------------------------

function flashCatnipMessage(text, durationMs = 5000) {
  catnipMessage.textContent = text;
  catnipMessage.classList.add("visible");
  setTimeout(() => {
    catnipMessage.classList.remove("visible");
  }, durationMs);
}

loadCount("pets", countDisplay, "Pets");
loadCount("prizes", prizeCountDisplay, "Prizes");
loadCount("catnip", catnipCountDisplay, "Catnip");

if (getPrizeCooldownRemainingMs() > 0) {
  startPrizeCooldownDisplay(false);
}

petButton.addEventListener("click", async function () {
  if (isPetBurstSpam()) {
    flashPetMessage("Ok 🙄 give him a break!");
    return;
  }

  const newCount = await incrementCount("pets", countDisplay, "Pets");
  if (newCount === null) return;

  const templateParams = {
    message: "Lucas was just petted! Total pets: " + newCount,
  };

  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams).then(
    function (response) {
      console.log("Email sent!", response.status);
    },
    function (error) {
      console.log("Email failed to send:", error);
    }
  );
});

priceButton.addEventListener("click", async function () {
  const remaining = getPrizeCooldownRemainingMs();

  if (remaining > 0) {
    startPrizeCooldownDisplay(false);
    return;
  }

  const newPrizeCount = await incrementCount("prizes", prizeCountDisplay, "Prizes");
  if (newPrizeCount === null) return;

  markPrizeClaimedNow();
  startPrizeCooldownDisplay(true);

  const prizeTemplateParams = {
    message: "A prize was just requested! Total prizes: " + newPrizeCount,
  };

  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_PRIZE_TEMPLATE_ID, prizeTemplateParams).then(
    function (response) {
      console.log("Prize email sent!", response.status);
    },
    function (error) {
      console.log("Prize email failed to send:", error);
    }
  );
});

catnipButton.addEventListener("click", async function () {
  const newCatnipCount = await incrementCount("catnip", catnipCountDisplay, "Catnip");
  if (newCatnipCount === null) return;

  flashCatnipMessage("🌿 Catnip logged! (captcha coming soon)");
});
