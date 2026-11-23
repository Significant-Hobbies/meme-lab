// Source links acquire a destination only after the reader selects a record.
export function setReferenceLink(parent, href, label, { className, newTab = false } = {}) {
  let link = parent.querySelector('a[data-reference-link]');
  if (!href) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement('a');
    link.dataset.referenceLink = '';
    if (className) link.className = className;
  }
  link.href = href;
  link.textContent = label;
  if (newTab) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  } else {
    link.removeAttribute('target');
    link.removeAttribute('rel');
  }
  parent.append(link);
}
