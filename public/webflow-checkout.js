// Paste this in Webflow: Page Settings > Custom Code > Before </body> tag,
// or as an embedded HTML/Script component near the form.
//
// Expects a <form id="quote-form"> with fields named:
// name, email, phone, zipCode, message, quoteItems
// quoteItems must already hold the cart array serialized via JSON.stringify(...)
// (this script forwards the string as-is, it does not build the cart itself).
// Optional error container: <div id="quote-form-error"></div>
(function () {
  const API_BASE_URL = 'https://your-api-domain.com'; // TODO: set your deployed API URL

  const form = document.querySelector('#quote-form');
  if (!form) return;

  const errorEl = document.querySelector('#quote-form-error');
  const submitBtn = form.querySelector('[type="submit"]');

  function setLoading(isLoading) {
    if (!submitBtn) return;
    submitBtn.disabled = isLoading;

    if (isLoading) {
      submitBtn.dataset.originalText =
        submitBtn.dataset.originalText || submitBtn.value || submitBtn.textContent;
      const label = 'Processing...';
      if (submitBtn.tagName === 'INPUT') submitBtn.value = label;
      else submitBtn.textContent = label;
    } else if (submitBtn.dataset.originalText) {
      if (submitBtn.tagName === 'INPUT') submitBtn.value = submitBtn.dataset.originalText;
      else submitBtn.textContent = submitBtn.dataset.originalText;
    }
  }

  function showError(message) {
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    } else {
      alert(message);
    }
  }

  function clearError() {
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    setLoading(true);

    const formData = new FormData(form);
    const payload = {
      name: formData.get('name') || '',
      email: formData.get('email') || '',
      phone: formData.get('phone') || '',
      zipCode: formData.get('zipCode') || '',
      message: formData.get('message') || '',
      quoteItems: formData.get('quoteItems') || '',
      pageUrl: window.location.href,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  });
})();
