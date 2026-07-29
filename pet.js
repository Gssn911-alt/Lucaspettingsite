// ============================================
// Click counters (via your own Cloudflare Worker) + email notification (via EmailJS)
// "pets", "prizes", AND "catnip" all go through ONE Worker backend.
//
// EmailJS free tier only allows 2 templates + 200 sends/month, so pet
// clicks no longer send an email at all — they're pure counter clicks.
// Catnip took over the "send an email" role that pets used to have.
// ============================================

// --- EmailJS setup ---
// PUBLIC_KEY identifies your EmailJS account (safe to expose in frontend code).
// SERVICE_ID identifies which connected email inbox to send through.
// Each TEMPLATE_ID points at a specific pre-built email layout in your dashboard.
const EMAILJS_PUBLIC_KEY = "QORZHtKFzomPXpHz4";
const EMAILJS_SERVICE_ID = "service_2rcy7it";
const EMAILJS_PRIZE_TEMPLATE_ID = "template_vte0m0t";
const EMAILJS_CATNIP_TEMPLATE_ID = "template_0v6kx08";

// Must run once before any emailjs.send() call works anywhere in this file.
emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

// --- Your backend's address ---
// This is your Cloudflare Worker's URL. Every fetch() below is built by
// adding more text onto the end of this base address.
const WORKER_BASE_URL = "https://prize-counter.gersonv5005.workers.dev";

// --- Grabbing every element this script needs to read or update ---
// getElementById looks up ONE element by its id="..." attribute in the HTML.
// If any of these ids don't match your actual HTML exactly, the matching
// constant becomes null, and using it later would crash the whole script.
const countDisplay = document.getElementById("countDisplay");
const petButton = document.getElementById("petButton");
const prizeCountDisplay = document.getElementById("prizeCountDisplay");
const priceButton = document.getElementById("priceButton");
const petMessage = document.getElementById("petMessage");
const prizeMessage = document.getElementById("prizeMessage");

const catnipCountDisplay = document.getElementById("catnipCountDisplay");
const catnipButton = document.getElementById("catnipButton");
const catnipMessage = document.getElementById("catnipMessage");

// ------------------------------------------------------------------
// SHARED HELPERS — used by all three counters (pets, prizes, catnip)
// so the fetch() logic only needs to be written once, not copy-pasted
// three times.
// ------------------------------------------------------------------

// READS the current value of a counter, does NOT change it.
// Used once when the page first loads, to show real numbers instead
// of the "0" placeholders sitting in the HTML.
async function loadCount(counterName, displayElement, label) {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/${counterName}`);
    const data = await response.json(); // turns the raw reply into a JS object, e.g. { count: 7 }
    displayElement.textContent = `${label}: ${data.count}`;
  } catch (error) {
    // Runs if the Worker is unreachable, offline, or errors out
    console.log(`Couldn't load ${counterName} count:`, error);
    displayElement.textContent = `${label}: —`;
  }
}

// INCREMENTS a counter by 1 and returns the new number, so the caller
// (a button's click handler) can use that number afterward — e.g. to
// put it inside an email message.
async function incrementCount(counterName, displayElement, label) {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/${counterName}/up`, {
      method: "POST", // POST = "change something" (vs GET = "just read")
    });
    const data = await response.json();
    displayElement.textContent = `${label}: ${data.count}`;
    return data.count;
  } catch (error) {
    console.log(`Couldn't update ${counterName} count:`, error);
    return null; // signals failure back to whoever called this
  }
}

// ------------------------------------------------------------------
// PET MESSAGE — the "annoyed" warning, visible for 5 seconds then fades.
// Only ever touches #petMessage, so nothing else can interfere with it.
// ------------------------------------------------------------------

let petMessageTimer = null; // stored outside the function so it survives between clicks

function flashPetMessage(text, durationMs = 5000) {
  petMessage.textContent = text;
  petMessage.classList.add("visible"); // triggers the CSS fade-in (see layout.css .spam-message.visible)

  clearTimeout(petMessageTimer); // cancel any PREVIOUS 5-second timer still running
  petMessageTimer = setTimeout(() => {
    petMessage.classList.remove("visible");
  }, durationMs);
}

// ------------------------------------------------------------------
// PETS — BURST/SPAM LIMITER
// Blocks rapid clicking. Doesn't limit total clicks over time — only
// how FAST they can come in a row.
// ------------------------------------------------------------------

const PET_BURST_LIMIT = 1;        // only 1 click allowed...
const PET_BURST_WINDOW_MS = 1000; // ...within 1 second

let petClickTimestamps = []; // grows/shrinks as clicks come in and old ones expire

function isPetBurstSpam() {
  const now = Date.now(); // current time, as a number (ms since 1970)

  petClickTimestamps.push(now); // record this click
  // Keep only clicks from within the last second — older ones "fall off"
  petClickTimestamps = petClickTimestamps.filter(
    (timestamp) => now - timestamp <= PET_BURST_WINDOW_MS
  );

  return petClickTimestamps.length > PET_BURST_LIMIT;
}

// ------------------------------------------------------------------
// PRIZE — 15 MINUTE COOLDOWN
// Unlike pets, SPEED doesn't matter here — real TIME has to pass.
// The last claim moment is saved in localStorage, which survives page
// reloads and even closing the browser (unlike a normal variable).
// ------------------------------------------------------------------

const PRIZE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes, in milliseconds
const PRIZE_COOLDOWN_STORAGE_KEY = "lastPrizeClaimAt";

function getPrizeCooldownRemainingMs() {
  const lastClaimRaw = localStorage.getItem(PRIZE_COOLDOWN_STORAGE_KEY);
  // localStorage only stores TEXT — parseInt converts it back to a real number
  const lastClaimAt = lastClaimRaw ? parseInt(lastClaimRaw, 10) : 0;
  const elapsed = Date.now() - lastClaimAt;
  const remaining = PRIZE_COOLDOWN_MS - elapsed;
  return remaining > 0 ? remaining : 0; // never return a negative number
}

function markPrizeClaimedNow() {
  localStorage.setItem(PRIZE_COOLDOWN_STORAGE_KEY, Date.now().toString());
}

function formatRemainingTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000); // round UP so it never shows "0s" too early
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60; // % = "leftover after dividing" -> gives 0-59
  return `${minutes}m ${seconds}s`;
}

let prizeCooldownInterval = null;

// Shows a LIVE, ticking countdown (updates every second) instead of a
// one-time message. justClaimed decides whether to show "🎉 Prize sent!"
// as a one-time prefix (only true right after actually claiming one).
function startPrizeCooldownDisplay(justClaimed) {
  clearInterval(prizeCooldownInterval); // stop any PREVIOUS countdown first

  function tick(isFirstTick) {
    const remaining = getPrizeCooldownRemainingMs();

    if (remaining <= 0) {
      clearInterval(prizeCooldownInterval); // cooldown's over, stop updating
      prizeMessage.classList.remove("visible");
      return;
    }

    const prefix = isFirstTick && justClaimed ? "🎉 Prize sent! " : "";
    prizeMessage.textContent = `${prefix}Next prize in ${formatRemainingTime(remaining)} ⏳`;
    prizeMessage.classList.add("visible");
  }

  tick(true); // run once immediately - no 1-second blank delay
  prizeCooldownInterval = setInterval(() => tick(false), 1000); // then every second
}

// ------------------------------------------------------------------
// CATNIP — 5 MINUTE COOLDOWN
// Same idea as prize's cooldown, just a shorter wait and a simpler,
// one-time message instead of a live ticking countdown.
// ------------------------------------------------------------------

const CATNIP_COOLDOWN_MS = 30 * 60 * 1000; // 5 minutes
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
// PAGE LOAD — runs once, immediately, top to bottom, the moment this
// script file finishes loading.
// ------------------------------------------------------------------

// Fetch and display the REAL numbers from the Worker, replacing the
// "0" placeholders sitting in the HTML.
loadCount("pets", countDisplay, "Pets");
loadCount("prizes", prizeCountDisplay, "Prizes");
loadCount("catnip", catnipCountDisplay, "Catnip");

// If someone reloads mid-cooldown, restore the PRIZE countdown display
// immediately instead of leaving them guessing.
if (getPrizeCooldownRemainingMs() > 0) {
  startPrizeCooldownDisplay(false);
}

// FIX: this exact same check was missing for catnip before — without
// it, reloading during a catnip cooldown showed nothing until the next
// click. Now it matches prize's behavior.
if (getCatnipCooldownRemainingMs() > 0) {
  flashCatnipMessage(`⏳ Next catnip in ${formatRemainingTime(getCatnipCooldownRemainingMs())}`);
}

// ------------------------------------------------------------------
// EVENT LISTENERS — code that only runs in response to an actual click
// ------------------------------------------------------------------

// PET — counter only, no email (removed to protect your 200/month EmailJS quota).
petButton.addEventListener("click", async function () {
  if (isPetBurstSpam()) {
    flashPetMessage("Ok 🙄 give him a break!");
    return; // blocks both the counter increment AND any further code below
  }

  await incrementCount("pets", countDisplay, "Pets");
});

// PRIZE — cooldown-gated, sends an email once successfully claimed.
priceButton.addEventListener("click", async function () {
  const remaining = getPrizeCooldownRemainingMs();

  if (remaining > 0) {
    startPrizeCooldownDisplay(false); // just re-show the countdown, don't touch anything else
    return;
  }

  const newPrizeCount = await incrementCount("prizes", prizeCountDisplay, "Prizes");
  if (newPrizeCount === null) return; // Worker failed - don't start a cooldown for a prize that wasn't recorded

  markPrizeClaimedNow();
  startPrizeCooldownDisplay(true);

  const prizeTemplateParams = {
    message: "A prize was just requested! Total prizes: " + newPrizeCount,
  };

  // .then(onSuccess, onFailure) - runs one function or the other depending
  // on whether the email actually sent. Doesn't pause anything else (no await).
  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_PRIZE_TEMPLATE_ID, prizeTemplateParams).then(
    function (response) {
      console.log("Prize email sent!", response.status);
    },
    function (error) {
      console.log("Prize email failed to send:", error);
    }
  );
});

// CATNIP — cooldown-gated, sends an email once successfully claimed.
// Structurally identical to the prize handler above, just shorter cooldown
// and a simpler one-time message instead of a live countdown.
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
