const form = document.querySelector("#request-form");
const statusNode = document.querySelector("#form-status");
const requestField = document.querySelector("#request");
const submitButton = document.querySelector("#submit-button");

boot();

async function boot() {
  form.addEventListener("submit", onSubmit);
}

async function onSubmit(event) {
  event.preventDefault();

  setStatus("");
  submitButton.disabled = true;
  submitButton.textContent = "Sending...";

  const formData = new FormData(form);
  const request = `${formData.get("request") ?? ""}`.trim();
  const website = `${formData.get("website") ?? ""}`;
  const payload = buildPayload(request, website);

  try {
    const response = await fetch("/api/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Submission failed.");
    }

    if (data.mode === "github_redirect" && data.url) {
      setStatus("Redirecting to GitHub to complete the issue submission...", "success");
      window.location.assign(data.url);
      return;
    }

    form.reset();
    setStatus(`Request queued as issue #${data.number}.`, "success");
    requestField.focus();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Submission failed.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = "<span aria-hidden=\"true\">+</span>";
  }
}

function buildPayload(request, website) {
  const summary = summarizeRequest(request);

  return {
    website,
    summary,
    problem: request,
    outcome: `Ship the request described in Summary and Problem.\n\nRequested change:\n${request}`,
    constraints: "",
    successCriteria: "",
    notes: ""
  };
}

function summarizeRequest(request) {
  const normalized = request.replace(/\s+/g, " ").trim();
  const sentence = normalized.split(/[.!?](?:\s|$)/)[0] || normalized;

  if (sentence.length >= 8 && sentence.length <= 120) {
    return sentence;
  }

  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117).trimEnd()}...`;
}

function setStatus(message, tone) {
  statusNode.textContent = message;
  statusNode.className = tone ? `status-message ${tone}` : "status-message";
}
