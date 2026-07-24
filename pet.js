// ============================================
// Click counters (via your own Cloudflare Worker) + email notification (via EmailJS)
// Both the "pets" counter and "prizes" counter go through ONE Worker backend.
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

// Two separate message elements now, instead of one shared #spamMessage.
// This is the fix for the "5 second message" issue — before, the prize
// cooldown's every-second update was overwriting the pet spam warning
// because they were the same paragraph. Now they physically can't collide.
const petMessage = document.getElementById("petMessage");
const prizeMessage = document.getElementById("prizeMessage");

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
// PET MESSAGE — shows the "annoyed" warning for 5 seconds, then fades.
// This ONLY touches #petMessage now, so nothing else can overwrite it.
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
// PETS — BURST/SPAM LIMITER ("rate limiter")
// Tracks the timestamp of each click. If more than PET_BURST_LIMIT
// clicks land within PET_BURST_WINDOW_MS milliseconds, we treat it as
// spam and block it — this doesn't limit total clicks over time, only
// how fast they can come in a row.
// ------------------------------------------------------------------

const PET_BURST_LIMIT = 2;        // max 3 clicks...
const PET_BURST_WINDOW_MS = 1000; // ...within 1200ms

let petClickTimestamps = [];

function isPetBurstSpam() {
  const now = Date.now();

  petClickTimestamps.push(now);
  // Keep only recent timestamps (inside the window). Old ones "fall off"
  // naturally as time passes.
  petClickTimestamps = petClickTimestamps.filter(
    (timestamp) => now - timestamp <= PET_BURST_WINDOW_MS
  );

  return petClickTimestamps.length > PET_BURST_LIMIT;
}

// ------------------------------------------------------------------
// PRIZE — 15 MINUTE COOLDOWN
// Unlike pets, speed doesn't matter here — real time has to pass since
// the last valid prize. We save the last claim moment in localStorage
// (survives page reloads and closing the browser) and compare it to
// "now" on every click.
// ------------------------------------------------------------------

const PRIZE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes, in milliseconds
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

// ------------------------------------------------------------------
// PRIZE cooldown display — updates every second, only ever touches
// #prizeMessage. It no longer competes with the pet message timer at
// all, since they're two separate elements now.
// ------------------------------------------------------------------

let prizeCooldownInterval = null;

function startPrizeCooldownDisplay(justClaimed) {
  // If a countdown was already running, restart it instead of stacking
  // two intervals at once.
  clearInterval(prizeCooldownInterval);

  function tick(isFirstTick) {
    const remaining = getPrizeCooldownRemainingMs();

    if (remaining <= 0) {
      // Cooldown is over: hide the message and stop updating.
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

loadCount("pets", countDisplay, "Pets");
loadCount("prizes", prizeCountDisplay, "Prizes");

// If someone reloads the page while a prize cooldown is still running,
// show the fixed countdown right away (justClaimed = false, since they
// didn't just claim it now — we're just continuing to inform them).
if (getPrizeCooldownRemainingMs() > 0) {
  startPrizeCooldownDisplay(false);
}

petButton.addEventListener("click", async function () {
  if (isPetBurstSpam()) {
    flashPetMessage("Ok Lucas is annoyed now 🙄 give him a break!");
    return; // blocks both the counter increment AND the email
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
    return; // no cuenta el click ni manda email
  }

  const newPrizeCount = await incrementCount("prizes", prizeCountDisplay, "Prizes");

  if (newPrizeCount === null) return;

  // Only mark the cooldown if the count actually saved successfully in the Worker.
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
