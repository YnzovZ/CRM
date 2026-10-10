(function () {
  var config = window.FEEDBACK_CONFIG || {};
  var summaryUrl = config.summaryUrl || "/samenvatting/";

  var form = document.getElementById("feedback");
  var scale = form.querySelector(".scale");
  var interest = document.getElementById("interest");
  var contact = document.getElementById("contact");
  var email = document.getElementById("email");
  var submit = document.getElementById("submit");
  var scoreError = document.getElementById("score-error");
  var emailError = document.getElementById("email-error");

  // Event-code uit de QR-link, bijvoorbeeld ?event=rabobank-2026
  var params = new URLSearchParams(location.search);
  var event = (params.get("event") || "onbekend").slice(0, 100);

  document.getElementById("skip").href = summaryUrl;

  for (var i = 1; i <= 10; i++) {
    var id = "score-" + i;
    var input = document.createElement("input");
    input.type = "radio";
    input.name = "score";
    input.id = id;
    input.value = String(i);
    var label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = String(i);
    scale.appendChild(input);
    scale.appendChild(label);
  }

  scale.addEventListener("change", function () { scoreError.hidden = true; });

  interest.addEventListener("change", function () {
    contact.hidden = !interest.checked;
    if (interest.checked) email.focus();
    else emailError.hidden = true;
  });

  email.addEventListener("input", function () { emailError.hidden = true; });

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var checked = form.querySelector('input[name="score"]:checked');
    if (!checked) {
      scoreError.hidden = false;
      scale.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (interest.checked && !validEmail(email.value.trim())) {
      emailError.hidden = false;
      email.focus();
      return;
    }

    // Spambot vulde het verborgen veld in: doe alsof het gelukt is.
    if (document.getElementById("website").value) {
      location.href = summaryUrl;
      return;
    }

    var payload = {
      event: event,
      score: Number(checked.value),
      reason: document.getElementById("reason").value.trim(),
      interest: interest.checked,
      name: interest.checked ? document.getElementById("name").value.trim() : "",
      organisation: interest.checked ? document.getElementById("organisation").value.trim() : "",
      email: interest.checked ? email.value.trim() : ""
    };

    submit.disabled = true;
    submit.textContent = "Even versturen...";

    send(payload).finally(function () {
      location.href = summaryUrl;
    });
  });

  function send(payload) {
    if (!config.endpoint) {
      console.log("Geen endpoint ingesteld, antwoord niet opgeslagen:", payload);
      return Promise.resolve();
    }
    // text/plain voorkomt een CORS-preflight, die Apps Script niet ondersteunt.
    var request = fetch(config.endpoint, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).catch(function () {});
    // Laat niemand langer dan 4 seconden wachten op de samenvatting.
    var timeout = new Promise(function (resolve) { setTimeout(resolve, 4000); });
    return Promise.race([request, timeout]);
  }
})();
