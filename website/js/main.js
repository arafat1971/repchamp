function initNav() {
  const nav = document.getElementById("nav");
  const toggle = document.getElementById("navToggle");
  const links = document.getElementById("navLinks");

  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 20);
  });

  toggle.addEventListener("click", () => {
    toggle.classList.toggle("active");
    links.classList.toggle("open");
  });

  links.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      toggle.classList.remove("active");
      links.classList.remove("open");
    });
  });
}

function initSmoothScroll() {
  const getScrollOffset = () => {
    const nav = document.getElementById("nav");
    return (nav?.offsetHeight ?? 72) + 20;
  };

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const href = anchor.getAttribute("href");
      if (!href || href === "#") return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();

      let offset = getScrollOffset();
      if (href === "#download") {
        const nav = document.getElementById("nav");
        offset = (nav?.offsetHeight ?? 72) + 16;
      }

      const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  });
}

function initScrollSpy() {
  const sections = ["how-it-works", "features", "modes"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const navLinks = document.querySelectorAll('.nav__links a[href^="#"]:not(.nav__cta)');
  if (!sections.length || !navLinks.length) return;

  const setActive = (id) => {
    navLinks.forEach((link) => {
      link.classList.toggle("active", link.getAttribute("href") === `#${id}`);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    },
    { rootMargin: "-40% 0px -55% 0px" }
  );

  sections.forEach((section) => observer.observe(section));
}

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initSmoothScroll();
  initScrollSpy();
});
