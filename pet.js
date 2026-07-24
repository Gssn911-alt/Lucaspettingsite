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
const spamMessage = document.getElementById("spamMessage");

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
// MENSAJE FLOTANTE (genérico)
// Antes el texto de #spamMessage estaba fijo en el HTML. Ahora lo
// escribimos desde JS cada vez, porque necesitamos DOS mensajes
// distintos: uno para el spam-click y otro para el cooldown de prize.
// ------------------------------------------------------------------

let messageTimer = null;

function flashMessage(text, durationMs = 3000) {
  spamMessage.textContent = text;
  spamMessage.classList.add("visible");

  // Si ya había un mensaje mostrándose, reiniciamos el reloj para que
  // no desaparezca a la mitad mientras uno nuevo lo reemplaza.
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    spamMessage.classList.remove("visible");
  }, durationMs);
}

// ------------------------------------------------------------------
// PETS — LIMITADOR DE RÁFAGA ("rate limiter")
// Guarda el timestamp de cada click. Si hay más de PET_BURST_LIMIT
// clicks dentro de PET_BURST_WINDOW_MS milisegundos, lo consideramos
// spam y lo bloqueamos. No limita el total de clicks en el tiempo,
// solo qué tan rápido/seguido pueden venir.
// ------------------------------------------------------------------

const PET_BURST_LIMIT = 3;        // máximo 3 clicks...
const PET_BURST_WINDOW_MS = 1200; // ...en menos de 1200ms

let petClickTimestamps = [];

function isPetBurstSpam() {
  const now = Date.now();

  petClickTimestamps.push(now);
  // Nos quedamos solo con los timestamps recientes (dentro de la ventana).
  // Los viejos "se caen" solos con el paso del tiempo.
  petClickTimestamps = petClickTimestamps.filter(
    (timestamp) => now - timestamp <= PET_BURST_WINDOW_MS
  );

  return petClickTimestamps.length > PET_BURST_LIMIT;
}

// ------------------------------------------------------------------
// PRIZE — COOLDOWN DE 15 MINUTOS
// A diferencia del pet, aquí no importa la velocidad: debe pasar
// tiempo REAL desde el último premio válido. Guardamos el momento del
// último premio en localStorage (persiste aunque recargues la página
// o cierres el navegador) y lo comparamos contra "ahora" en cada click.
// ------------------------------------------------------------------

const PRIZE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutos, en milisegundos
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

loadCount("pets", countDisplay, "Pets");
loadCount("prizes", prizeCountDisplay, "Prizes");

petButton.addEventListener("click", async function () {
  if (isPetBurstSpam()) {
    flashMessage("Ok Lucas is annoyed now 🙄 give him a break!");
    return; // no cuenta el click ni manda email
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
    flashMessage(`Espera ${formatRemainingTime(remaining)} para otro premio ⏳`, 3000);
    return; // no cuenta el click ni manda email
  }

  const newPrizeCount = await incrementCount("prizes", prizeCountDisplay, "Prizes");

  if (newPrizeCount === null) return;

  // Solo marcamos el cooldown si el conteo se guardó bien en el Worker.
  markPrizeClaimedNow();

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
