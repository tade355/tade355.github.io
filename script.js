document.getElementById('year').textContent = new Date().getFullYear();

const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});

const contactForm = document.getElementById('contactForm');
const formNote = document.getElementById('formNote');

contactForm.addEventListener('submit', (event) => {
  event.preventDefault();
  formNote.textContent = 'Thanks for reaching out — we will get back to you within one business day.';
  contactForm.reset();
});

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const staggerParents = ['cards-grid', 'why-grid', 'team-grid', 'testimonials-grid', 'pricing-grid', 'industries-grid', 'stats-grid'];
const revealEls = document.querySelectorAll(
  '.section .eyebrow, .section h2, .section-sub, .card, .why-item, .team-card, .testimonial, .pricing-card, .stat-card, .industry-chip'
);

revealEls.forEach((el) => {
  el.classList.add('reveal');
  const parent = el.parentElement;
  if (parent && staggerParents.some((cls) => parent.classList.contains(cls))) {
    const index = Array.prototype.indexOf.call(parent.children, el);
    el.style.transitionDelay = `${Math.min(index, 6) * 80}ms`;
  }
});

if (!prefersReducedMotion && 'IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  revealEls.forEach((el) => revealObserver.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('is-visible'));
}

const statNumbers = document.querySelectorAll('.stat-number');

if (!prefersReducedMotion && 'IntersectionObserver' in window) {
  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        counterObserver.unobserve(entry.target);

        const el = entry.target;
        const match = el.textContent.trim().match(/^(\d+)(.*)$/);
        if (!match) return;

        const target = parseInt(match[1], 10);
        const suffix = match[2];
        const duration = 1200;
        const start = performance.now();

        function tick(now) {
          const progress = Math.min((now - start) / duration, 1);
          el.textContent = `${Math.round(progress * target)}${suffix}`;
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    },
    { threshold: 0.4 }
  );
  statNumbers.forEach((el) => counterObserver.observe(el));
}
