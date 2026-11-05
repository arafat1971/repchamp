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
  const sections = ["how-it-works", "features", "modes", "hydration-widget", "faq"]
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

function initFaq() {
  const faqQuestions = document.querySelectorAll('.faq-question');
  faqQuestions.forEach((question) => {
    question.addEventListener('click', () => {
      const item = question.closest('.faq-item');
      if (!item) return;
      const isActive = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('active'));
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}

function initHydrationSimulator() {
  let waterMl = 400; // Starts at 400 ml to match the user's home screen widget screenshot
  const targetMl = 2000;

  const currentValEl = document.getElementById("widgetCurrentVal");
  const percentValEl = document.getElementById("widgetPercentVal");
  const progressFillEl = document.getElementById("widgetProgressFill");
  const petNameEl = document.getElementById("widgetPetName");
  const moodCaptionEl = document.getElementById("widgetMoodCaption");
  const pandaAvatarEl = document.getElementById("widgetPandaAvatar");

  if (!currentValEl || !progressFillEl) return;

  const updateUI = () => {
    currentValEl.textContent = `${waterMl} ml`;
    const percent = Math.min(100, Math.round((waterMl / targetMl) * 100));
    if (percentValEl) percentValEl.textContent = `${percent}% of daily goal`;
    progressFillEl.style.width = `${Math.max(6, percent)}%`;

    if (petNameEl) {
      petNameEl.innerHTML = `Champion &middot; <span>${waterMl} ml</span>`;
    }

    if (moodCaptionEl && pandaAvatarEl) {
      if (waterMl === 0) {
        moodCaptionEl.textContent = "Thirsty Panda is waiting for morning water 💧";
        pandaAvatarEl.textContent = "🥺";
      } else if (waterMl < 800) {
        moodCaptionEl.textContent = "Sip logged! Panda is smiling & refreshed 🐼";
        pandaAvatarEl.textContent = "🐼";
      } else if (waterMl < 1500) {
        moodCaptionEl.textContent = "Optimal hydration! Sharp mental focus & energy ⚡";
        pandaAvatarEl.textContent = "😎";
      } else if (waterMl < 2000) {
        moodCaptionEl.textContent = "Almost there! Muscles energized & ready to rep 💪";
        pandaAvatarEl.textContent = "✨";
      } else {
        moodCaptionEl.textContent = "🎉 Daily 2,000 ml Champion Goal Reached!";
        pandaAvatarEl.textContent = "👑";
      }
    }
  };

  document.querySelectorAll(".btn-drink").forEach((btn) => {
    btn.addEventListener("click", () => {
      const add = parseInt(btn.getAttribute("data-add") || "250", 10);
      waterMl = Math.min(3000, waterMl + add);
      updateUI();
    });
  });

  const resetBtn = document.getElementById("btnResetWater");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      waterMl = 0;
      updateUI();
    });
  }

  // Widget Style Tabs
  const styleTabs = document.querySelectorAll(".widget-style-tab");
  styleTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      styleTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const style = tab.getAttribute("data-style");
      if (style === "clean") {
        if (petNameEl) petNameEl.innerHTML = `Clean Metric Tile &middot; <span>${waterMl} ml</span>`;
        if (moodCaptionEl) moodCaptionEl.textContent = "Glanceable stats layout for active athletes";
      } else if (style === "duo") {
        if (petNameEl) petNameEl.innerHTML = `Couple Duo &middot; <span>${waterMl} ml / 1,450 ml</span>`;
        if (moodCaptionEl) moodCaptionEl.textContent = "Live shared sync: you & your partner training together";
      } else {
        if (petNameEl) petNameEl.innerHTML = `Champion &middot; <span>${waterMl} ml</span>`;
        updateUI();
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initSmoothScroll();
  initScrollSpy();
  initFaq();
  initHydrationSimulator();
});
