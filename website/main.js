// RepChamp Website Interactive Scripts
document.addEventListener('DOMContentLoaded', () => {
  // Mobile Menu Toggle
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const navLinks = document.getElementById('navLinks');

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });
  }

  // FAQ Accordion Logic
  const faqQuestions = document.querySelectorAll('.faq-question');
  faqQuestions.forEach(question => {
    question.addEventListener('click', () => {
      const item = question.parentElement;
      const isActive = item.classList.contains('active');

      // Close all accordion items
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));

      // If clicked item was not active, open it
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });

  // Contact Form Submission Handler
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const statusDiv = document.getElementById('formStatus');
      if (statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.style.color = '#22c55e';
        statusDiv.textContent = 'Thank you! Your message has been received. We will respond within 24-48 hours.';
        contactForm.reset();
      }
    });
  }
});
