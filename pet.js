// ============================================
// Click counters (via your own Cloudflare Worker) + email notification (via EmailJS)
// "pets", "prizes", AND "catnip" all go through ONE Worker backend.
//
// EmailJS free tier only allows 2 templates + 200 sends/month, so pet
// clicks no longer send an email at all — they're pure counter clicks.
// Catnip took over the "send an email" role that pets used to have.
// ============================================

const EMAILJS_PUBLIC_KEY = "QORZHtKFzomPXpHz4";
const EMAILJS_SERVICE_ID = "service_2rcy7it";
const EMAILJS_PRIZE_TEMPLATE_ID = "template_vte0m0t";
const EMAILJS_CATNIP_TEMPLATE_ID = "template_0v6kx08";

emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

const WORKER_BASE_URL = "https://prize-counter.gersonv5005.workers.dev";

const countDisplay = document.getElementById("countDisplay");
const petButton = document.getElementById("petButton");
const prizeCountDisplay = document.getElementById("prizeCountDisplay");
const priceButton = document.getElementById("priceButton");
const petMessage = document.getElementById("petMessage");
const prizeMessage = document.getElementById("prizeMessage");

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
// Max 1 click allowed within 1000ms — any 2nd click that fast counts
// as spam and gets blocked.
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
// CATNIP — 5 MINUTE COOLDOWN (protects your EmailJS quota)
// Same pattern as the prize cooldown: real time has to pass since the
// last catnip claim, tracked in localStorage so it survives reloads.
// ------------------------------------------------------------------

const CATNIP_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes — adjust freely
const CATNIP_COOLDOWN_STORAGE_KEY = "lastCatnipClaimAt";

function getCatnipCooldownRemainingMs() {
  const lastClaimRaw = localStorage.getItem(CATNIP_COOLDOWN_STORAGE_KEY);
  const lastClaimAt = lastClaimRaw ? parseInt(lastClaimRaw, 10) : 0;
  const elapsed = Date.now() - lastClaimAt;
  const remaining = CATNIP_COOLDOWN_MS - elapsed;
  return remaining > 0 ? remaining : 0;
}

function markCatnipClaimedNow() {
  localStorage.setItem(CATNIP_COOLDOWN_STORAGE_KEY, Date.now().toString());
}

function flashCatnipMessage(text, durationMs = 5000) {
  catnipMessage.textContent = text;
  catnipMessage.classList.add("visible");
  setTimeout(() => {
    catnipMessage.classList.remove("visible");
  }, durationMs);
}

// ------------------------------------------------------------------
// Runs once, immediately, when the page loads
// ------------------------------------------------------------------

loadCount("pets", countDisplay, "Pets");
loadCount("prizes", prizeCountDisplay, "Prizes");
loadCount("catnip", catnipCountDisplay, "Catnip");

if (getPrizeCooldownRemainingMs() > 0) {
  startPrizeCooldownDisplay(false);
}

// ------------------------------------------------------------------
// EVENT LISTENERS
// ------------------------------------------------------------------

// PET BUTTON — counter only, no email. Burst-spam blocking unchanged.
petButton.addEventListener("click", async function () {
  if (isPetBurstSpam()) {
    flashPetMessage("Ok 🙄 give him a break!");
    return;
  }

  await incrementCount("pets", countDisplay, "Pets");
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
  const remaining = getCatnipCooldownRemainingMs();
  if (remaining > 0) {
    flashCatnipMessage(`⏳ Next catnip in ${formatRemainingTime(remaining)}`);
    return; // blocks both the counter increment AND the email
  }

  const newCatnipCount = await incrementCount("catnip", catnipCountDisplay, "Catnip");
  if (newCatnipCount === null) return;

  markCatnipClaimedNow();
  flashCatnipMessage("🌿 Catnip logged!");

  const catnipTemplateParams = {
    message: "Lucas just got catnip! Total catnip given: " + newCatnipCount,
  };

  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_CATNIP_TEMPLATE_ID, catnipTemplateParams).then(
    function (response) {
      console.log("Catnip email sent!", response.status);
    },
    function (error) {
      console.log("Catnip email failed to send:", error);
    }
  );
});
