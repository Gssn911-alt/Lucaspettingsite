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

loadCount("pets", countDisplay,\n#prizeCountDisplay, "Pets");
loadCount("prizes", prizeCountDisplay, "Prizes");

petButton.addEventListener("click", async function () {
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
  const newPrizeCount = await incrementCount("prizes", prizeCountDisplay, "Prizes");

  if (newPrizeCount === null) return;

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
