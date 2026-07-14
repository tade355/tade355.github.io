document.getElementById('year').textContent = new Date().getFullYear();

const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

const navbar = document.querySelector('.navbar');
if (navbar) {
  const updateNavbarState = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 12);
  };
  updateNavbarState();
  window.addEventListener('scroll', updateNavbarState, { passive: true });
}

const sectionLinks = Array.from(navLinks.querySelectorAll('a[href^="#"]'));
const sections = sectionLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

if (sections.length && 'IntersectionObserver' in window) {
  const setActiveLink = (id) => {
    sectionLinks.forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
    });
  };

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveLink(entry.target.id);
        }
      });
    },
    { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
  );
  sections.forEach((section) => sectionObserver.observe(section));
}

const contactForm = document.getElementById('contactForm');
const formNote = document.getElementById('formNote');

if (contactForm) {
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    formNote.textContent = 'Thanks for reaching out — we will get back to you within one business day.';
    contactForm.reset();
  });
}

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

const newsletterForm = document.getElementById('newsletterForm');
const newsletterNote = document.getElementById('newsletterNote');

if (newsletterForm) {
  newsletterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    newsletterNote.textContent = 'Thanks for subscribing!';
    newsletterForm.reset();
  });
}

const backToTop = document.getElementById('backToTop');

if (backToTop) {
  const toggleBackToTop = () => {
    backToTop.classList.toggle('visible', window.scrollY > 600);
  };
  toggleBackToTop();
  window.addEventListener('scroll', toggleBackToTop, { passive: true });
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  });
}

const supportsHover = window.matchMedia('(hover: hover)').matches;

if (!prefersReducedMotion && supportsHover) {
  document.querySelectorAll('.magnetic').forEach((btn) => {
    btn.addEventListener('mousemove', (event) => {
      const rect = btn.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });
  });
}

if (!prefersReducedMotion) {
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.className = 'btn-ripple';
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  });
}

const heroGlow = document.getElementById('heroGlow');
const heroSection = document.querySelector('.hero');

if (heroGlow && heroSection && !prefersReducedMotion && supportsHover) {
  heroSection.addEventListener('mousemove', (event) => {
    const rect = heroSection.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    heroGlow.style.setProperty('--glow-x', `${x}%`);
    heroGlow.style.setProperty('--glow-y', `${y}%`);
  });
}
