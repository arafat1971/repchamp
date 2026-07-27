function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const el = entry.target;
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
        observer.unobserve(el);
      });
    },
    { threshold: 0.2 }
  );

  document
    .querySelectorAll(".feature-card, .step, .mode-card")
    .forEach((el) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(24px)";
      el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
      observer.observe(el);
    });
}

function initHeroRepCounter() {
  const pushUpEl = document.getElementById("heroPushUpCounter");
  const squatEl = document.getElementById("heroSquatCounter");
  if (!pushUpEl || !squatEl) return;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function animateCount(el, from, to, duration) {
    return new Promise((resolve) => {
      const start = performance.now();
      const range = to - from;

      function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(from + range * eased);
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      }

      requestAnimationFrame(step);
    });
  }

  async function incrementCounter(el, start, intervalMs) {
    let count = start;
    el.textContent = count;

    while (true) {
      await wait(intervalMs);
      const next = count + 1;
      await animateCount(el, count, next, 220);
      count = next;
    }
  }

  incrementCounter(pushUpEl, 24, 1700);
  wait(500).then(() => incrementCounter(squatEl, 16, 1900));
}

document.addEventListener("DOMContentLoaded", () => {
  initScrollAnimations();
  initHeroRepCounter();
});
