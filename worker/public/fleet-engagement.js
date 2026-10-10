// Public, origin-bound analytics and consented capture for Meme Lab pages.
(() => {
  if (location.origin !== 'https://memes.significanthobbies.com') return;

  const tracker = document.createElement('script');
  tracker.src = 'https://health.sassmaker.com/tracker.js';
  tracker.dataset.key = 'ahk_pub_d7493f9ad93c88fa8e6920775f312d1e6a155b23735c2593ced3df086a009a2f';
  tracker.dataset.project = 'app-import-61cfd55345d74a13bffe7db94c72ef59deb90cc945dd1b58ed4e588b6b8ee012';
  tracker.dataset.identity = 'session';
  document.head.append(tracker);

  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'meme-form') window.appHealth?.track('paired_run_started');
  }, true);

  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('#feedback [data-verdict]')) {
      window.appHealth?.track('feedback_choice_clicked');
    }
  }, true);

  if (document.querySelector('[data-subscribe], saas-maker-newsletter-capture')) return;
  const extension = document.querySelector('fleet-footer-extension') || document.createElement('fleet-footer-extension');
  const capture = document.createElement('saas-maker-newsletter-capture');
  for (const [name, value] of Object.entries({
    slot: 'capture',
    'catalog-id': 'meme-lab',
    'project-key': 'pk_87e5d159d00d86304a0c9fcf98722998f8b5bb2136c2fe2d',
    'product-name': 'Meme Lab',
    kind: 'newsletter',
    'allow-kind-selection': '',
    layout: 'compact',
    integrated: '',
    source: 'fleet-footer',
    'privacy-url': 'https://sassmaker.com/privacy',
    theme: 'light',
  })) capture.setAttribute(name, value);
  extension.append(capture);
  if (!extension.isConnected) document.body.append(extension);
  const loader = document.createElement('script');
  loader.type = 'module';
  loader.src = 'https://sassmaker.com/newsletter-capture.js';
  document.head.append(loader);
})();
