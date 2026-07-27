// Paste this in Webflow: Page Settings > Custom Code > Before </body> tag,
// or as an embedded HTML/Script component near the form.
//
// Expects a <form id="quote-form"> with fields named:
// name, email, phone, zipCode, message, quoteItems
// quoteItems must already hold the cart array serialized via JSON.stringify(...)
// (this script forwards the string as-is, it does not build the cart itself).
//
// Two actions share this one form:
// - The form's own submit (a <button type="submit"> inside it) pays a deposit via
//   POST /api/checkout and redirects the browser to Stripe Checkout.
// - A separate button (id="quote-email-btn", type="button" so it doesn't also submit
//   the form) emails the itemized quote instead via POST /api/quote/email — no payment,
//   no redirect. The button is optional: omit it and only the deposit flow is wired up.
//
// Optional error container: <div id="quote-form-error"></div>
// Optional success container (used by the "email me the quote" action only):
// <div id="quote-form-success"></div>
(function () {
  const API_BASE_URL = 'https://your-api-domain.com'; // TODO: set your deployed API URL

  const form = document.querySelector('#quote-form');
  if (!form) return;

  const errorEl = document.querySelector('#quote-form-error');
  const successEl = document.querySelector('#quote-form-success');
  const submitBtn = form.querySelector('[type="submit"]');
  const emailQuoteBtn = document.querySelector('#quote-email-btn');

  function setLoading(button, isLoading) {
    if (!button) return;
    button.disabled = isLoading;

    if (isLoading) {
      button.dataset.originalText =
        button.dataset.originalText || button.value || button.textContent;
      const label = 'Processing...';
      if (button.tagName === 'INPUT') button.value = label;
      else button.textContent = label;
    } else if (button.dataset.originalText) {
      if (button.tagName === 'INPUT') button.value = button.dataset.originalText;
      else button.textContent = button.dataset.originalText;
    }
  }

  function clearSuccess() {
    if (successEl) {
      successEl.textContent = '';
      successEl.style.display = 'none';
    }
  }

  function clearError() {
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  function showError(message) {
    clearSuccess();
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    } else {
      alert(message);
    }
  }

  function showSuccess(message) {
    clearError();
    if (successEl) {
      successEl.textContent = message;
      successEl.style.display = 'block';
    } else {
      alert(message);
    }
  }

  function collectDeviceInfo() {
    return {
      userAgent: navigator.userAgent || '',
      platform: navigator.platform || '',
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      screen: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    };
  }

  function buildPayload() {
    const formData = new FormData(form);
    return {
      name: formData.get('name') || '',
      email: formData.get('email') || '',
      phone: formData.get('phone') || '',
      zipCode: formData.get('zipCode') || '',
      message: formData.get('message') || '',
      quoteItems: formData.get('quoteItems') || '',
      pageUrl: window.location.href,
      device: collectDeviceInfo(),
    };
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    clearSuccess();
    setLoading(submitBtn, true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });

      const data = await response.json();

      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
      setLoading(submitBtn, false);
    }
  });

  if (emailQuoteBtn) {
    emailQuoteBtn.addEventListener('click', async () => {
      // Runs the form's native required/type validation (e.g. name, email) without
      // submitting it, since this button is type="button".
      if (!form.reportValidity()) return;

      clearError();
      clearSuccess();
      setLoading(emailQuoteBtn, true);

      try {
        const response = await fetch(`${API_BASE_URL}/api/quote/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || 'Something went wrong. Please try again.');
        }

        showSuccess("Check your inbox — we've emailed you the quote.");
      } catch (err) {
        showError(err.message || 'Something went wrong. Please try again.');
      } finally {
        setLoading(emailQuoteBtn, false);
      }
    });
  }
})();
