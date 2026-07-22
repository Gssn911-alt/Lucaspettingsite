 // ============================================
// Click counters (via your own Cloudflare Worker) + email notification (via EmailJS)
// Both the "pets" counter and "prizes" counter now go through ONE Worker backend,
// instead of pets using CounterAPI and prizes using something else.
// ============================================

const EMAILJS_PUBLIC_KEY = "QORZHtKFzomPXpHz4";
const EMAILJS_SERVICE_ID = "service_2rcy7it";
const EMAILJS_TEMPLATE_ID = "template_0v6kx08";

emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

// ------------------------------------------------------------------
// WORKER SETUP — replace <your-subdomain> with your real Worker URL.
// The Worker understands two paths: /pets and /prizes (and /pets/up,
// /prizes/up to increment). One backend, two counters.
// ------------------------------------------------------------------

const WORKER_BASE_URL = "https://prize-counter.<your-subdomain>.workers.dev";

// STEP 2: grab the elements we need from the HTML.
const countDisplay = document.getElementById("countDisplay");
const petButton = document.getElementById("petButton");
const prizeCountDisplay = document.getElementById("prizeCountDisplay");
const priceButton = document.getElementById("priceButton");

// ------------------------------------------------------------------
// SHARED HELPERS — one function to read a counter, one to increment it.
// Both pets and prizes call these same two functions instead of each
// having their own copy-pasted fetch() logic.
// ------------------------------------------------------------------

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

// Returns the new count so the caller (e.g. the pet button) can use it,
// like building the EmailJS message. Returns null if the request failed.
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

// Load both counts once when the page opens, without incrementing them.
loadCount("pets", countDisplay, "Pets");
loadCount("prizes", prizeCountDisplay, "Prizes");

// ------------------------------------------------------------------
// PET BUTTON — increments the pets counter, then emails you the total.
// ------------------------------------------------------------------

petButton.addEventListener("click", async function () {
  const newCount = await incrementCount("pets", countDisplay, "Pets");

  if (newCount === null) return; // stop here if the count itself failed

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

// ------------------------------------------------------------------
// PRIZE BUTTON — just increments the prizes counter for now (test mode).
// This is the hook you'll extend later for the dispenser + captcha logic.
// ------------------------------------------------------------------

priceButton.addEventListener("click", async function () {
  await incrementCount("prizes", prizeCountDisplay, "Prizes");
});

// ------------------------------------------------------------------
// PRIZE COUNTER — talks to your own Cloudflare Worker backend instead
// of CounterAPI, because later this Worker will also trigger the
// dispenser hardware. Same fetch()/async pattern as the pets counter above.
// ------------------------------------------------------------------

const PRIZE_API = "prize-counter.gersonv5005.workers.dev";

const priceButton = document.getElementById("priceButton");
const prizeCountDisplay = document.getElementById("prizeCountDisplay");

async function loadPrizeCount() {
  try {
    const response = await fetch(PRIZE_API);
    const data = await response.json();
    prizeCountDisplay.textContent = "Prizes: " + data.count;
  } catch (error) {
    console.log("Couldn't load prize count:", error);
    prizeCountDisplay.textContent = "Prizes: —";
  }
}

loadPrizeCount();

priceButton.addEventListener("click", async function () {
  try {
    const response = await fetch(PRIZE_API, { method: "POST" });
    const data = await response.json();
    prizeCountDisplay.textContent = "Prizes: " + data.count;
  } catch (error) {
    console.log("Couldn't update prize count:", error);
  }
});
