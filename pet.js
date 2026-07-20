// ============================================
// Global click counter (via CounterAPI) + email notification (via EmailJS)
// HTML = structure, CSS = looks, JS = behavior (what happens when you click).
// ============================================

const EMAILJS_PUBLIC_KEY = "QORZHtKFzomPXpHz4";   
const EMAILJS_SERVICE_ID = "service_2rcy7it";     
const EMAILJS_TEMPLATE_ID = "template_0v6kx08";    

emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

// ------------------------------------------------------------------
// COUNTERAPI SETUP — this is what makes the count SHARED between every
// visitor, instead of resetting per-browser. CounterAPI stores the number
// on its own server; we just ask it to read or increase that number.
//
// NAMESPACE is like a folder name for your counter, so it doesn't clash
// with someone else's. Pick something unique to you — I'd suggest
// something like your GitHub username + "-lucas-cat".
// NAME is the specific counter inside that namespace.
// ------------------------------------------------------------------

const COUNTER_NAMESPACE = "lucas-vasquez-cat-website"; // <- change this to something only you would pick
const COUNTER_NAME = "pets";
const COUNTER_BASE_URL = `https://api.counterapi.dev/v1/${COUNTER_NAMESPACE}/${COUNTER_NAME}`;
 
// STEP 2: grab the two elements we need, using the "id" we gave them in HTML.
const countDisplay = document.getElementById("countDisplay");
const petButton = document.getElementById("petButton");

// ------------------------------------------------------------------
// NEW CONCEPT: fetch() + async/await
//
// fetch(url) asks another server for something over the internet — here,
// the current count. It doesn't arrive instantly, so fetch() hands back a
// "promise" (a placeholder for a value that's still on its way).
//
// "async function" + "await" is a way to write code that WAITS for that
// promise to finish before moving to the next line, so it reads top-to-bottom
// like normal code instead of nesting callbacks inside callbacks.
// ------------------------------------------------------------------

// Runs once when the page first loads: get the current count and show it,
// WITHOUT increasing it (that's why we call the plain URL, not "/up").
async function loadCurrentCount() {
  try {
    const response = await fetch(COUNTER_BASE_URL);
    const data = await response.json(); // turns the server's reply into a JS object
    countDisplay.textContent = "Pets: " + data.count;
  } catch (error) {
    console.log("Couldn't load the count:", error);
    countDisplay.textContent = "Pets: —";
  }
}

loadCurrentCount();

// Runs every time the button is clicked: tell CounterAPI to add 1,
// then show whatever total it sends back.
petButton.addEventListener("click", async function () {

  let newCount;

  try {
    const response = await fetch(COUNTER_BASE_URL + "/up");
    const data = await response.json();
    newCount = data.count;
    countDisplay.textContent = "Pets: " + newCount;
  } catch (error) {
    console.log("Couldn't update the count:", error);
    return; // stop here if the count itself failed — no point sending an email with no number
  }

  
  const templateParams = {
    message: "Lucas was just petted! Total pets: " + petCount
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

