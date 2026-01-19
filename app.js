const state = {
  ingredients: [],
  features: [],
  vectors: [],
  activeIndex: null,
  basket: new Set(),
};

const settings = {
  maxResults: 10,
  minOverlap: 2,
  coverageExponent: 0.5,
};

const elements = {
  loader: document.getElementById("loader"),
  grid: document.getElementById("grid"),
  ingredientCount: document.getElementById("ingredientCount"),
  featureCount: document.getElementById("featureCount"),
  ingredientList: document.getElementById("ingredientList"),
  searchInput: document.getElementById("searchInput"),
  activeIngredient: document.getElementById("activeIngredient"),
  similarMeta: document.getElementById("similarMeta"),
  similarList: document.getElementById("similarList"),
  addActiveBtn: document.getElementById("addActiveBtn"),
  basketList: document.getElementById("basketList"),
  basketMeta: document.getElementById("basketMeta"),
  suggestList: document.getElementById("suggestList"),
  clearBasketBtn: document.getElementById("clearBasketBtn"),
};

function parseCSV(text) {
  const rows = [];
  let row = [];
  let current = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(current);
    current = "";
  };

  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushCell();
    } else if (char === "\n") {
      pushCell();
      pushRow();
    } else if (char === "\r") {
      // ignore carriage returns
    } else {
      current += char;
    }
  }
  if (current.length || row.length) {
    pushCell();
    pushRow();
  }
  return rows;
}

function buildData(text) {
  const rows = parseCSV(text).filter((row) => row.length > 0);
  if (rows.length < 2) {
    throw new Error("CSV missing data rows");
  }
  const ingredients = rows[0].slice(1).map((value) => value.trim());
  const features = rows.slice(1).map((row) => (row[0] || "").trim());
  const vectors = ingredients.map((_, colIndex) => {
    const vec = [];
    for (let i = 1; i < rows.length; i += 1) {
      const raw = rows[i][colIndex + 1] ?? "";
      const value = Number.parseFloat(raw);
      vec.push(Number.isFinite(value) ? value : 0);
    }
    return vec;
  });

  return { ingredients, features, vectors };
}

function similarity(aVec, bVec) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  let overlap = 0;

  for (let i = 0; i < aVec.length; i += 1) {
    const a = aVec[i];
    const b = bVec[i];
    if (a > 0 && b > 0) {
      dot += a * b;
      normA += a * a;
      normB += b * b;
      overlap += 1;
    }
  }

  if (overlap < settings.minOverlap || dot === 0) {
    return { score: 0, overlap };
  }

  const cosine = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  const coverage = overlap / aVec.length;
  const score = cosine * Math.pow(coverage, settings.coverageExponent);

  return { score, overlap };
}

function getSimilar(index, limit = settings.maxResults) {
  const target = state.vectors[index];
  const results = [];
  for (let i = 0; i < state.ingredients.length; i += 1) {
    if (i === index) continue;
    const { score, overlap } = similarity(target, state.vectors[i]);
    if (score > 0) {
      results.push({ index: i, score, overlap });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function getGroupSuggestions(limit = settings.maxResults) {
  const selections = Array.from(state.basket);
  if (selections.length === 0) return [];

  const results = [];
  for (let i = 0; i < state.ingredients.length; i += 1) {
    if (state.basket.has(i)) continue;

    let sum = 0;
    let count = 0;
    let overlapTotal = 0;

    for (const selected of selections) {
      const { score, overlap } = similarity(state.vectors[i], state.vectors[selected]);
      if (score > 0) {
        sum += score;
        count += 1;
        overlapTotal += overlap;
      }
    }

    if (count > 0) {
      const avg = sum / count;
      const coverage = count / selections.length;
      const score = avg * Math.pow(coverage, settings.coverageExponent);
      results.push({
        index: i,
        score,
        overlap: Math.round(overlapTotal / count),
        support: count,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function formatScore(score) {
  return Math.round(score * 100);
}

function setActive(index) {
  state.activeIndex = index;
  elements.activeIngredient.textContent = state.ingredients[index];
  updateActiveButton();
  renderIngredientList();
  renderSimilarList();
}

function updateActiveButton() {
  if (state.activeIndex === null) {
    elements.addActiveBtn.disabled = true;
    elements.addActiveBtn.textContent = "Add to basket";
    return;
  }
  elements.addActiveBtn.disabled = false;
  elements.addActiveBtn.textContent = state.basket.has(state.activeIndex)
    ? "Remove from basket"
    : "Add to basket";
}

function toggleBasket(index) {
  if (state.basket.has(index)) {
    state.basket.delete(index);
  } else {
    state.basket.add(index);
  }
  renderIngredientList();
  renderBasket();
  renderSimilarList();
  renderSuggestions();
  updateActiveButton();
}

function renderIngredientList() {
  const term = elements.searchInput.value.trim().toLowerCase();
  elements.ingredientList.innerHTML = "";

  const list = state.ingredients
    .map((name, index) => ({ name, index }))
    .filter((item) => item.name.toLowerCase().includes(term));

  list.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "ingredient-item";
    li.style.setProperty("--i", idx);

    const selectBtn = document.createElement("button");
    selectBtn.className = "ingredient-select";
    if (item.index === state.activeIndex) {
      selectBtn.classList.add("active");
    }
    selectBtn.textContent = item.name;
    selectBtn.dataset.index = item.index;

    const addBtn = document.createElement("button");
    addBtn.className = "ingredient-add";
    addBtn.dataset.index = item.index;
    if (state.basket.has(item.index)) {
      addBtn.classList.add("in");
      addBtn.textContent = "Remove";
    } else {
      addBtn.textContent = "Add";
    }

    li.append(selectBtn, addBtn);
    elements.ingredientList.appendChild(li);
  });
}

function createResultItem(result, idx, listType) {
  const li = document.createElement("li");
  li.className = "result-item";
  li.style.setProperty("--i", idx);

  const line = document.createElement("div");
  line.className = "result-line";

  const nameBlock = document.createElement("div");
  const name = document.createElement("div");
  name.className = "result-name";
  name.textContent = state.ingredients[result.index];
  const meta = document.createElement("div");
  meta.className = "result-meta";

  if (listType === "group") {
    meta.textContent = `supports ${result.support} of ${state.basket.size} • avg overlap ${result.overlap}/${state.features.length}`;
  } else {
    meta.textContent = `overlap ${result.overlap}/${state.features.length}`;
  }

  nameBlock.append(name, meta);

  const actions = document.createElement("div");
  actions.className = "result-actions";

  const score = document.createElement("div");
  score.className = "result-score";
  score.textContent = formatScore(result.score);

  const btn = document.createElement("button");
  btn.className = "btn ghost small";
  btn.dataset.index = result.index;
  if (state.basket.has(result.index)) {
    btn.textContent = "Remove";
  } else {
    btn.textContent = "Add";
  }

  actions.append(score, btn);
  line.append(nameBlock, actions);

  const bar = document.createElement("div");
  bar.className = "result-bar";
  const fill = document.createElement("span");
  fill.style.width = `${Math.min(100, formatScore(result.score))}%`;
  bar.appendChild(fill);

  li.append(line, bar);
  return li;
}

function renderSimilarList() {
  elements.similarList.innerHTML = "";

  if (state.activeIndex === null) {
    elements.similarMeta.textContent = "Select an ingredient to see top matches.";
    return;
  }

  const results = getSimilar(state.activeIndex, settings.maxResults);
  if (results.length === 0) {
    elements.similarMeta.textContent = `No matches found for ${state.ingredients[state.activeIndex]}.`;
  } else {
    elements.similarMeta.textContent = `Top ${results.length} matches for ${state.ingredients[state.activeIndex]}.`;
  }

  results.forEach((result, idx) => {
    elements.similarList.appendChild(createResultItem(result, idx, "single"));
  });
}

function renderBasket() {
  elements.basketList.innerHTML = "";
  elements.clearBasketBtn.disabled = state.basket.size === 0;

  if (state.basket.size === 0) {
    elements.basketMeta.textContent = "Pick ingredients to get blend-friendly suggestions.";
    return;
  }

  elements.basketMeta.textContent = `Building suggestions from ${state.basket.size} ingredients.`;

  for (const index of state.basket) {
    const chip = document.createElement("div");
    chip.className = "basket-chip";
    chip.textContent = state.ingredients[index];

    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.dataset.index = index;

    chip.appendChild(btn);
    elements.basketList.appendChild(chip);
  }
}

function renderSuggestions() {
  elements.suggestList.innerHTML = "";
  if (state.basket.size === 0) return;

  const results = getGroupSuggestions(settings.maxResults);
  if (results.length === 0) {
    const empty = document.createElement("li");
    empty.className = "result-item";
    empty.textContent = "No strong matches yet. Add more ingredients to widen the net.";
    elements.suggestList.appendChild(empty);
    return;
  }
  results.forEach((result, idx) => {
    elements.suggestList.appendChild(createResultItem(result, idx, "group"));
  });
}

function loadData(text) {
  const { ingredients, features, vectors } = buildData(text);
  state.ingredients = ingredients;
  state.features = features;
  state.vectors = vectors;

  elements.ingredientCount.textContent = ingredients.length.toString();
  elements.featureCount.textContent = features.length.toString();

  elements.loader.classList.add("hidden");
  elements.grid.classList.remove("hidden");

  renderIngredientList();
  renderBasket();
  renderSimilarList();
  renderSuggestions();
  updateActiveButton();
}

function handleLoadError() {
  const message = elements.loader.querySelector("p");
  if (message) {
    message.textContent = "Could not load flavor-matrix.csv. Make sure it sits next to index.html.";
  }
}

async function init() {
  try {
    const response = await fetch("flavor-matrix.csv");
    if (!response.ok) throw new Error("Failed to load CSV");
    const text = await response.text();
    loadData(text);
  } catch (error) {
    handleLoadError();
  }
}

// Event listeners

elements.searchInput.addEventListener("input", renderIngredientList);

elements.ingredientList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const index = Number(button.dataset.index);
  if (Number.isNaN(index)) return;

  if (button.classList.contains("ingredient-select")) {
    setActive(index);
  } else if (button.classList.contains("ingredient-add")) {
    toggleBasket(index);
  }
});

elements.similarList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const index = Number(button.dataset.index);
  if (Number.isNaN(index)) return;
  toggleBasket(index);
});

elements.suggestList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const index = Number(button.dataset.index);
  if (Number.isNaN(index)) return;
  toggleBasket(index);
});

elements.basketList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const index = Number(button.dataset.index);
  if (Number.isNaN(index)) return;
  toggleBasket(index);
});

elements.addActiveBtn.addEventListener("click", () => {
  if (state.activeIndex !== null) {
    toggleBasket(state.activeIndex);
  }
});

elements.clearBasketBtn.addEventListener("click", () => {
  state.basket.clear();
  renderIngredientList();
  renderBasket();
  renderSimilarList();
  renderSuggestions();
});

init();
