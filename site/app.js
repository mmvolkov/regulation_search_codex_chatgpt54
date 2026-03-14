const storageKey = "regulation-search-endpoint";
const defaultEndpoint = "https://plequeneluera.beget.app/webhook/regulations-search";

const endpointInput = document.querySelector("#endpoint");
const saveEndpointButton = document.querySelector("#save-endpoint");
const testEndpointButton = document.querySelector("#test-endpoint");
const endpointStatus = document.querySelector("#endpoint-status");
const searchForm = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const limitInput = document.querySelector("#limit");
const submitButton = document.querySelector("#submit");
const fillExampleButton = document.querySelector("#fill-example");
const stateNode = document.querySelector("#state");
const summaryNode = document.querySelector("#summary");
const resultsNode = document.querySelector("#results");
const resultTemplate = document.querySelector("#result-template");
const exampleButtons = document.querySelectorAll(".example-pill");

function loadEndpoint() {
  const saved = localStorage.getItem(storageKey);
  endpointInput.value = saved || defaultEndpoint;
}

function saveEndpoint() {
  const value = endpointInput.value.trim();
  if (!value) {
    setEndpointStatus("Сначала укажите webhook URL.", "error");
    return;
  }

  localStorage.setItem(storageKey, value);
  setEndpointStatus("URL сохранён локально в браузере.", "ok");
}

function setEndpointStatus(text, kind = "muted") {
  endpointStatus.textContent = text;
  endpointStatus.className = `status status--${kind}`;
}

function setState(text, kind = "idle") {
  stateNode.hidden = false;
  resultsNode.hidden = true;
  stateNode.textContent = text;
  stateNode.className = `state state--${kind}`;
}

function clearState() {
  stateNode.hidden = true;
  resultsNode.hidden = false;
}

function formatScore(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "score n/a";
  }
  return `score ${value.toFixed(3)}`;
}

function formatMeta(hit) {
  const parts = [];
  if (hit.source_file) {
    parts.push(`Файл: ${hit.source_file}`);
  }
  if (hit.block_type) {
    parts.push(`Блок: ${hit.block_type}`);
  }
  if (Array.isArray(hit.section_path) && hit.section_path.length > 0) {
    parts.push(`Раздел: ${hit.section_path.join(" > ")}`);
  }
  return parts;
}

function renderResults(data) {
  resultsNode.innerHTML = "";

  if (!Array.isArray(data.hits) || data.hits.length === 0) {
    setState("Совпадения не найдены. Попробуйте упростить формулировку или изменить лимит.", "idle");
    summaryNode.textContent = "Поиск выполнен, но ничего не найдено.";
    return;
  }

  summaryNode.textContent = `Найдено ${data.count} фрагментов по запросу «${data.query}».`;

  for (const hit of data.hits) {
    const fragment = resultTemplate.content.cloneNode(true);
    fragment.querySelector(".result-card__rank").textContent = `Результат ${hit.rank}`;
    fragment.querySelector(".result-card__title").textContent =
      hit.doc_title || "Документ без названия";
    fragment.querySelector(".result-card__score").textContent = formatScore(hit.score);
    fragment.querySelector(".result-card__citation").textContent =
      hit.citation || "Цитата не указана";
    fragment.querySelector(".result-card__text").textContent =
      hit.raw_text || hit.text || "Текст фрагмента отсутствует";

    const metaNode = fragment.querySelector(".result-card__meta");
    for (const item of formatMeta(hit)) {
      const chip = document.createElement("span");
      chip.textContent = item;
      metaNode.append(chip);
    }

    resultsNode.append(fragment);
  }

  clearState();
}

async function callSearchApi({ endpoint, query, limit }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      limit,
      mode: "search"
    })
  });

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Сервис вернул не-JSON ответ: ${text.slice(0, 220)}`);
  }

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      `HTTP ${response.status}: ${response.statusText || "ошибка webhook"}`;
    throw new Error(message);
  }

  return payload;
}

async function handleSearch(event) {
  event.preventDefault();

  const endpoint = endpointInput.value.trim();
  const query = queryInput.value.trim();
  const limit = Number(limitInput.value || 6);

  if (!endpoint) {
    setState("Сначала укажите webhook URL.", "error");
    return;
  }

  if (!query) {
    setState("Введите поисковый запрос по регламентам.", "error");
    return;
  }

  saveEndpoint();
  submitButton.disabled = true;
  setState("Ищу релевантные куски регламентов, включая таблицы и важные блоки...", "loading");
  summaryNode.textContent = "Запрос выполняется...";

  try {
    const payload = await callSearchApi({ endpoint, query, limit });
    renderResults(payload);
  } catch (error) {
    setState(`Поиск не выполнен: ${error.message}`, "error");
    summaryNode.textContent = "Есть проблема с webhook или сетевым доступом.";
  } finally {
    submitButton.disabled = false;
  }
}

async function testEndpoint() {
  const endpoint = endpointInput.value.trim();
  if (!endpoint) {
    setEndpointStatus("Введите URL перед проверкой.", "error");
    return;
  }

  testEndpointButton.disabled = true;
  setEndpointStatus("Проверяю webhook тестовым запросом...", "muted");

  try {
    const payload = await callSearchApi({
      endpoint,
      query: "какие документы нужны для отчета по командировке",
      limit: 2
    });

    const count = Array.isArray(payload.hits) ? payload.hits.length : 0;
    setEndpointStatus(`Webhook отвечает. Получено результатов: ${count}.`, "ok");
  } catch (error) {
    setEndpointStatus(`Не удалось достучаться до webhook: ${error.message}`, "error");
  } finally {
    testEndpointButton.disabled = false;
  }
}

function fillExample() {
  queryInput.value = "кто согласует командировку и какие документы нужны для отчета";
  queryInput.focus();
}

loadEndpoint();

searchForm.addEventListener("submit", handleSearch);
saveEndpointButton.addEventListener("click", saveEndpoint);
testEndpointButton.addEventListener("click", testEndpoint);
fillExampleButton.addEventListener("click", fillExample);

for (const button of exampleButtons) {
  button.addEventListener("click", () => {
    queryInput.value = button.dataset.query || "";
    queryInput.focus();
  });
}
