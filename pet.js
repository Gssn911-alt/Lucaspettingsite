// ============================================
// Click counters (via your own Cloudflare Worker) + email notification (via EmailJS)
// Both the "pets" counter and "prizes" counter go through ONE Worker backend.
// ============================================

// --- EmailJS credentials ---
// These identify WHICH EmailJS account, WHICH connected email service, and
// WHICH pre-built email template to use. Not secret in the sense of a
// password - EmailJS's public key is meant to be visible in frontend code,
// same idea as a Google Maps API key showing up in a webpage's source.
const EMAILJS_PUBLIC_KEY = "QORZHtKFzomPXpHz4";
const EMAILJS_SERVICE_ID = "service_2rcy7it";
const EMAILJS_TEMPLATE_ID = "template_0v6kx08";        // used for pet emails
const EMAILJS_PRIZE_TEMPLATE_ID = "template_vte0m0t";  // used for prize emails

// Has to run once before you can call emailjs.send() anywhere below -
// this connects your code to your specific EmailJS account.
emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

// --- Your backend's address ---
// This is the Cloudflare Worker URL from the dashboard. Every fetch() call
// below is built by sticking more text onto the end of this base URL.
const WORKER_BASE_URL = "https://prize-counter.gersonv5005.workers.dev";

// --- Grabbing elements from the HTML ---
// getElementById looks up one specific element by its id="..." attribute.
// These constants are just SHORTCUTS so the rest of the file can say
// "countDisplay" instead of "document.getElementById('countDisplay')"
// every single time.
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

// ------------------------------------------------------------------
// SHARED HELPERS — one function to READ a counter, one to INCREMENT one.
// Both pets and prizes call these same two functions instead of each
// having their own copy-pasted fetch() logic.
//
// "async function" + "await" = a way to write code that PAUSES on a line
// until a network request finishes, instead of moving on immediately.
// Without await, the code would try to read `data.count` before the
// server even replied.
// ------------------------------------------------------------------

// Just READS the current value - does not change it. Used on page load.
async function loadCount(counterName, displayElement, label) {
  try {
    // Template literal: the backticks + ${...} insert a variable's value
    // directly into a string. `${WORKER_BASE_URL}/${counterName}` becomes
    // e.g. "https://prize-counter...workers.dev/pets"
    const response = await fetch(`${WORKER_BASE_URL}/${counterName}`);
    const data = await response.json(); // turns the raw reply into a JS object, e.g. { count: 7 }
    displayElement.textContent = `${label}: ${data.count}`;
  } catch (error) {
    // Runs if the network request itself fails (site offline, Worker down, etc.)
    console.log(`Couldn't load ${counterName} count:`, error);
    displayElement.textContent = `${label}: —`;
  }
}

// INCREMENTS the counter by 1 and returns the new number, so whoever
// called this function (like the pet button) can use that number
// afterward - e.g. to put it in the email message.
async function incrementCount(counterName, displayElement, label) {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/${counterName}/up`, {
      method: "POST", // POST = "I'm changing something", vs GET = "just reading"
    });
    const data = await response.json();
    displayElement.textContent = `${label}: ${data.count}`;
    return data.count;
  } catch (error) {
    console.log(`Couldn't update ${counterName} count:`, error);
    return null; // signals failure to whoever called this function
  }
}

// ------------------------------------------------------------------
// PET MESSAGE — shows the "annoyed" warning for 5 seconds, then fades.
// This ONLY touches #petMessage now, so nothing else can overwrite it.
// ------------------------------------------------------------------

// Declared OUTSIDE the function (not inside) so its value survives between
// clicks - if it were declared inside flashPetMessage, a new empty
// petMessageTimer would be created every call and clearTimeout below would
// have nothing real to cancel.
let petMessageTimer = null;

function flashPetMessage(text, durationMs = 5000) {
  // = 5000 is a DEFAULT value - if flashPetMessage is called with only one
  // argument (no duration given), it automatically uses 5000ms (5 seconds).
  petMessage.textContent = text;
  petMessage.classList.add("visible");
  // Adding the "visible" CSS class is what actually makes it appear -
  // see .spam-message.visible in layout.css, which sets opacity/max-height.

  // If a PREVIOUS message's 5-second timer was still counting down,
  // cancel it - otherwise the old timer could hide the message early,
  // cutting off a brand new one that just started.
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

const PET_BURST_LIMIT = 1;        // (see note above the code - comment is stale)
const PET_BURST_WINDOW_MS = 1000; // (see note above the code - comment is stale)

// Array that grows/shrinks as clicks come in and old ones expire.
let petClickTimestamps = [];

function isPetBurstSpam() {
  const now = Date.now(); // current time as a number (milliseconds since 1970)

  petClickTimestamps.push(now); // record THIS click
  // .filter() rebuilds the array keeping only entries that pass the test -
  // here, "happened within the last PET_BURST_WINDOW_MS milliseconds".
  // Anything older just quietly disappears from the array.
  petClickTimestamps = petClickTimestamps.filter(
    (timestamp) => now - timestamp <= PET_BURST_WINDOW_MS
  );

  // If MORE clicks landed in the window than the limit allows, it's spam.
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
// localStorage is a small storage box built into the browser, tied to
// this exact website. Unlike a normal JS variable, it survives page
// reloads and even closing the browser entirely - it only clears if the
// user clears their browser data, or JS deletes it on purpose.

function getPrizeCooldownRemainingMs() {
  const lastClaimRaw = localStorage.getItem(PRIZE_COOLDOWN_STORAGE_KEY);
  // localStorage only stores TEXT, never numbers directly - that's why
  // parseInt(..., 10) below converts the saved string back into a real number.
  const lastClaimAt = lastClaimRaw ? parseInt(lastClaimRaw, 10) : 0;
  const elapsed = Date.now() - lastClaimAt;
  const remaining = PRIZE_COOLDOWN_MS - elapsed;
  return remaining > 0 ? remaining : 0; // never return a negative number
}

function markPrizeClaimedNow() {
  // Saves "right now" as the new last-claim time, as a string (localStorage
  // requirement) using .toString().
  localStorage.setItem(PRIZE_COOLDOWN_STORAGE_KEY, Date.now().toString());
}

function formatRemainingTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000); // round UP so it never shows "0s" while time is still left
  const minutes = Math.floor(totalSeconds / 60); // whole minutes only
  const seconds = totalSeconds % 60; // % (modulo) = "the leftover after dividing" - gives seconds 0-59
  return `${minutes}m ${seconds}s`;
}

// ------------------------------------------------------------------
// PRIZE cooldown display — updates every second, only ever touches
// #prizeMessage. It no longer competes with the pet message timer at
// all, since they're two separate elements now.
// ------------------------------------------------------------------

let prizeCooldownInterval = null;

function startPrizeCooldownDisplay(justClaimed) {
  // setInterval ids need to be cleared with clearInterval, or they keep
  // running forever in the background. This line stops any PREVIOUS
  // countdown before starting a fresh one, so you never end up with two
  // intervals both fighting to update the same text at once.
  clearInterval(prizeCooldownInterval);

  // A function declared INSIDE another function ("nested function") that
  // can see and use justClaimed and prizeMessage from the outer scope.
  function tick(isFirstTick) {
    const remaining = getPrizeCooldownRemainingMs();

    if (remaining <= 0) {
      // Cooldown is over: hide the message and stop updating.
      clearInterval(prizeCooldownInterval);
      prizeMessage.classList.remove("visible");
      return;
    }

    // Only show "🎉 Prize sent!" on the very first tick right after
    // actually claiming - every tick after that just shows the countdown.
    const prefix = isFirstTick && justClaimed ? "🎉 Prize sent! " : "";
    prizeMessage.textContent = `${prefix}Next prize in ${formatRemainingTime(remaining)} ⏳`;
    prizeMessage.classList.add("visible");
  }

  tick(true);  // run once immediately, so there's no 1-second blank delay
  prizeCooldownInterval = setInterval(() => tick(false), 1000); // then repeat every second
}

// --- Runs once, immediately, when the page/script first loads ---

loadCount("pets", countDisplay, "Pets");
loadCount("prizes", prizeCountDisplay, "Prizes");

// If someone reloads the page while a prize cooldown is still running,
// show the fixed countdown right away (justClaimed = false, since they
// didn't just claim it now — we're just continuing to inform them).
if (getPrizeCooldownRemainingMs() > 0) {
  startPrizeCooldownDisplay(false);
}

// ------------------------------------------------------------------
// EVENT LISTENERS — code that only runs in response to a click
// ------------------------------------------------------------------

petButton.addEventListener("click", async function () {
  if (isPetBurstSpam()) {
    flashPetMessage("Ok 🙄 give him a break!");
    return; // stops the function here - blocks both the counter increment AND the email
  }

  const newCount = await incrementCount("pets", countDisplay, "Pets");

  if (newCount === null) return; // stop if the Worker request itself failed

  const templateParams = {
    // This object's keys need to match variable names set up inside your
    // EmailJS template dashboard - "message" here fills in {{message}}
    // wherever you placed it in the template.
    message: "Lucas was just petted! Total pets: " + newCount,
  };

  // emailjs.send() returns a PROMISE - .then(onSuccess, onFailure) runs
  // one function if it works, the other if it doesn't. This never pauses
  // the rest of the code (no await here), it just reports the result later.
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
    // Still on cooldown - just re-show the countdown as a reminder,
    // don't touch the counter or send an email.
    startPrizeCooldownDisplay(false);
    return;
  }

  const newPrizeCount = await incrementCount("prizes", prizeCountDisplay, "Prizes");

  if (newPrizeCount === null) return; // Worker request failed - don't start a cooldown for a prize that wasn't actually recorded

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
