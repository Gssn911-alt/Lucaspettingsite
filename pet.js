// ============================================
// Click counter + email notification via EmailJS
// HTML = structure, CSS = looks, JS = behavior (what happens when you click).
// ============================================

// STEP 1: Fill these in with the three values from your EmailJS dashboard.
const EMAILJS_PUBLIC_KEY = "QORZHtKFzomPXpHz4";   // Account page
const EMAILJS_SERVICE_ID = "service_2rcy7it";     // Email Services page
const EMAILJS_TEMPLATE_ID = "template_0v6kx08";    // Email Templates page

// This connects the SDK we loaded in the <head> to your account.
emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

// STEP 2: "let" creates a variable that's allowed to change later.
// This starts at 0 and goes up by 1 every click.
let petCount = 0;

// STEP 3: grab the two elements we need, using the "id" we gave them in HTML.
const countDisplay = document.getElementById("countDisplay");
const petButton = document.getElementById("petButton");

// STEP 4: addEventListener says "when this happens, run this function."
// Here: when petButton is clicked, run the function below.
petButton.addEventListener("click", function () {

  // Update the count
  petCount = petCount + 1;

  // textContent lets us change the text of an element after the page loaded
  countDisplay.textContent = "Pets: " + petCount;

  // This object's keys must match whatever {{variable}} names you used
  // inside your EmailJS template. We only used {{message}} above, so
  // that's the only key we need to send.
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

// NOTE FOR LATER: petCount resets to 0 every time the page reloads, because
// JS variables only live in memory while the page is open. If you want the
// count to "remember" itself between visits, look up "localStorage" — it's
// a small built-in storage the browser gives each website, and it's just
// two lines to use:
//
//   localStorage.setItem("petCount", petCount);       // save a value
//   let saved = localStorage.getItem("petCount");     // read it back later
//
// Good next step once you're comfortable with the code above!