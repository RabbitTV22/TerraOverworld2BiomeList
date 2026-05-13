const app = document.getElementById("app");
const search = document.getElementById("search");
const stats = document.getElementById("stats");
const lightbox = document.getElementById("lightbox");

let rawBase = null;
let biomes = [];
let special = [];

async function init() {
  const res = await fetch("./data/index.json");
  const data = await res.json();
  rawBase = data.rawBase;
  biomes = data.biomes || [];
  special = data.special || [];

  const totalCount =
    biomes.reduce((s, b) => s + b.images.length, 0) +
    special.reduce((s, g) => s + g.images.length, 0);
  stats.textContent = `${biomes.length} biomes / ${totalCount} images`;

  search.addEventListener("input", render);
  lightbox.addEventListener("click", () => lightbox.classList.add("hidden"));
  render();
}

function displayName(name) {
  return name.replace(/_/g, " ").replace(/\//g, " / ");
}

function render() {
  const q = search.value.toLowerCase();
  const filtered = biomes.filter((b) => b.name.includes(q));

  let html = '<div class="biome-grid">';
  for (const biome of filtered) {
    html += `
      <div class="biome-card" data-biome="${biome.name}">
        <div class="thumb">
          <img src="${biome.images[0].thumb}" loading="lazy" alt="${biome.name}" data-name="${biome.name}">
        </div>
        <div class="info">
          <div class="name" data-name="${displayName(biome.name)}"></div>
          <div class="count">${biome.images.length} image${biome.images.length !== 1 ? "s" : ""}</div>
        </div>
      </div>
      <div class="biome-expanded" data-biome="${biome.name}"></div>`;
  }
  html += "</div>";

  for (const group of special) {
    const gname = displayName(group.name);
    html += `<div class="special-section" data-special="${group.name}"><h2>${gname}</h2><div class="image-grid">`;
    for (const img of group.images) {
      html += `<img src="${img.thumb}" loading="lazy" data-original="${img.original}" alt="${img.filename}">`;
    }
    html += "</div></div>";
  }

  app.innerHTML = html;

  document.querySelectorAll(".biome-card").forEach((el) => {
    el.addEventListener("click", () => toggleBiome(el.dataset.biome));
  });

  document
    .querySelectorAll(".special-section .image-grid img")
    .forEach((img) => {
      img.addEventListener("click", () =>
        openLightbox(img.dataset.original, img.src, special[0].images),
      );
    });

  observeImages();
}

function toggleBiome(name) {
  const targetEl = document.querySelector(
    `.biome-expanded[data-biome="${name}"]`,
  );
  const card = document.querySelector(`.biome-card[data-biome="${name}"]`);
  const grid = document.querySelector(".biome-grid");

  if (!targetEl || !card || !grid) return;

  const isAlreadyOpen = targetEl.classList.contains("open");

  document
    .querySelectorAll(".biome-expanded.open")
    .forEach((el) => el.classList.remove("open"));
  document
    .querySelectorAll(".biome-card")
    .forEach((c) => c.classList.remove("active"));

  if (!isAlreadyOpen) {
    const cards = Array.from(document.querySelectorAll(".biome-card"));
    const currentTop = card.offsetTop;

    let lastInRow = card;
    for (let i = cards.indexOf(card); i < cards.length; i++) {
      if (cards[i].offsetTop === currentTop) {
        lastInRow = cards[i];
      } else {
        break;
      }
    }

    lastInRow.after(targetEl);

    targetEl.classList.add("open");
    card.classList.add("active");

    if (!targetEl.dataset.loaded) {
      const biome = biomes.find((b) => b.name === name);
      let html = '<div class="image-grid">';
      biome.images.forEach((img) => {
        html += `<img src="${img.thumb}" data-original="${img.original}" loading="lazy">`;
      });
      html += "</div>";
      targetEl.innerHTML = html;
      targetEl.dataset.loaded = "1";

      targetEl.querySelectorAll("img").forEach((img) => {
        img.addEventListener("click", () =>
          openLightbox(img.dataset.original, img.src, biome.images),
        );
      });
      observeImages();
    }

    setTimeout(() => {
      targetEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }
}

let currentGallery = [];
let currentIndex = -1;

function openLightbox(original, thumbSrc, gallery = []) {
  currentGallery = gallery;
  currentIndex = gallery.findIndex((img) => img.original === original);

  lightbox.classList.remove("hidden");
  renderLightboxContent(thumbSrc, original);
}

function renderLightboxContent(thumbSrc, original) {
  const encoded = original
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  const fullUrl = rawBase ? `${rawBase}/${encoded}` : null;
  const imgData = currentGallery[currentIndex];

  lightbox.innerHTML = `
      <div class="lb-content">
        <button class="lb-close" id="lbClose">&times;</button>

        <div class="lb-img-container">
          ${
            currentGallery.length > 1
              ? `
            <button class="lb-nav lb-prev" id="lbPrev">‹</button>
            <button class="lb-nav lb-next" id="lbNext">›</button>
          `
              : ""
          }
          <img src="${thumbSrc}" class="lb-main-img blurred" id="lbMain">
        </div>

        <div class="lb-footer">
          ${fullUrl ? `<a class="lb-link" href="${fullUrl}" target="_blank" rel="noopener">Full Resolution ↗</a>` : ""}
          <div class="lb-thumbnails">
            ${currentGallery
              .map(
                (img, i) => `
              <img src="${img.thumb}" class="lb-thumb ${i === currentIndex ? "active" : ""}" data-idx="${i}">
            `,
              )
              .join("")}
          </div>
        </div>
      </div>`;

  document.getElementById("lbClose").onclick = (e) => {
    e.stopPropagation();
    lightbox.classList.add("hidden");
  };

  if (currentGallery.length > 1) {
    document.getElementById("lbPrev").onclick = (e) => {
      e.stopPropagation();
      navigateLightbox(-1);
    };
    document.getElementById("lbNext").onclick = (e) => {
      e.stopPropagation();
      navigateLightbox(1);
    };
  }

  document.querySelectorAll(".lb-thumb").forEach((el) => {
    el.onclick = (e) => {
      e.stopPropagation();
      currentIndex = parseInt(el.dataset.idx);
      const newImg = currentGallery[currentIndex];
      renderLightboxContent(newImg.thumb, newImg.original);
    };
  });

  if (fullUrl) {
    const mainImg = document.getElementById("lbMain");
    const full = new Image();

    full.onload = () => {
      mainImg.src = full.src;
      mainImg.classList.remove("blurred");
    };

    full.src = fullUrl;

    if (full.complete) {
      mainImg.src = full.src;
      mainImg.classList.remove("blurred");
    }
  }
}

function navigateLightbox(dir) {
  currentIndex =
    (currentIndex + dir + currentGallery.length) % currentGallery.length;
  const nextImg = currentGallery[currentIndex];
  renderLightboxContent(nextImg.thumb, nextImg.original);
}

function observeImages() {
  const obs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const img = e.target;
        img.classList.add("loaded");
        obs.unobserve(img);
      }
    },
    { rootMargin: "300px" },
  );
  document
    .querySelectorAll("img:not(.loaded)")
    .forEach((img) => obs.observe(img));
}

window.addEventListener("resize", () => {
  document.querySelectorAll(".biome-expanded.open").forEach((el) => {
    el.classList.remove("open");
  });
  document.querySelectorAll(".biome-card").forEach((c) => {
    c.classList.remove("active");
  });
});

init();
