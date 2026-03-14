const storageKey = "regulation-search-endpoint";
const historyKey = "regulation-search-history";
const defaultEndpoint = "https://plequeneluera.beget.app/webhook/regulations-search";
const maxHistoryItems = 8;

const endpointInput = document.querySelector("#endpoint");
const saveEndpointButton = document.querySelector("#save-endpoint");
const testEndpointButton = document.querySelector("#test-endpoint");
const endpointStatus = document.querySelector("#endpoint-status");
const searchForm = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const limitInput = document.querySelector("#limit");
const submitButton = document.querySelector("#submit");
const charCount = document.querySelector("#char-count");
const stateNode = document.querySelector("#state");
const answerContent = document.querySelector("#answer-content");
const answerText = document.querySelector("#answer-text");
const answerSource = document.querySelector("#answer-source");
const resultsNode = document.querySelector("#results");
const summaryNode = document.querySelector("#summary");
const historyList = document.querySelector("#history-list");
const resultTemplate = document.querySelector("#result-template");
const historyTemplate = document.querySelector("#history-template");
const exampleButtons = document.querySelectorAll(".example-pill");
const feedbackYes = document.querySelector("#feedback-yes");
const feedbackNo = document.querySelector("#feedback-no");

function loadEndpoint() {
  const saved = localStorage.getItem(storageKey);
  endpointInput.value = saved || defaultEndpoint;
}

function saveEndpoint() {
  const value = endpointInput.value.trim();
  if (!value) {
    setEndpointStatus("Сначала укажите webhook URL.", "error");
    return false;
  }

  localStorage.setItem(storageKey, value);
  setEndpointStatus("URL сохранён локально в браузере.", "ok");
  return true;
}

function setEndpointStatus(text, kind = "") {
  endpointStatus.textContent = text;
  endpointStatus.className = "endpoint-status";
  if (kind) {
    endpointStatus.classList.add(`endpoint-status--${kind}`);
  }
}

function setState(text, kind = "idle") {
  stateNode.hidden = false;
  answerContent.hidden = true;
  stateNode.textContent = text;
  stateNode.className = `state state--${kind}`;
}

function showAnswer() {
  stateNode.hidden = true;
  answerContent.hidden = false;
}

function updateCharCount() {
  charCount.textContent = `${queryInput.value.length} / 500`;
}

function setFeedback(active) {
  feedbackYes.classList.toggle("feedback-button--active", active === "yes");
  feedbackNo.classList.toggle("feedback-button--active", active === "no");
}

function getHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(historyKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistoryQuery(query) {
  const current = getHistory().filter((item) => item !== query);
  current.unshift(query);
  localStorage.setItem(historyKey, JSON.stringify(current.slice(0, maxHistoryItems)));
}

function renderHistory() {
  const items = getHistory();
  historyList.innerHTML = "";

  if (items.length === 0) {
    historyList.innerHTML =
      '<div class="history-placeholder">История запросов появится после первых поисков.</div>';
    return;
  }

  for (const query of items) {
    const fragment = historyTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".history-item");
    button.textContent = query;
    button.addEventListener("click", () => {
      queryInput.value = query;
      updateCharCount();
      queryInput.focus();
    });
    historyList.append(fragment);
  }
}

function renderResults(data) {
  resultsNode.innerHTML = "";
  setFeedback("");

  if (!Array.isArray(data.hits) || data.hits.length === 0) {
    setState("Совпадения не найдены. Попробуйте переформулировать вопрос.", "idle");
    summaryNode.textContent = "Поиск выполнен, но релевантные фрагменты не найдены.";
    resultsNode.innerHTML =
      '<div class="results-placeholder">Ничего не найдено. Попробуйте упростить формулировку запроса.</div>';
    return;
  }

  const topHit = data.hits[0];
  answerText.textContent = topHit.raw_text || topHit.text || "Текст ответа отсутствует.";
  answerSource.textContent = topHit.citation || topHit.doc_title || "Источник не указан.";
  showAnswer();

  summaryNode.textContent = `Найдено ${data.count} фрагментов по запросу «${data.query}».`;

  for (const hit of data.hits) {
    const fragment = resultTemplate.content.cloneNode(true);
    fragment.querySelector(".result-item__rank").textContent = `Результат ${hit.rank}`;
    fragment.querySelector(".result-item__score").textContent =
      typeof hit.score === "number" ? hit.score.toFixed(3) : "n/a";
    fragment.querySelector(".result-item__title").textContent =
      hit.doc_title || "Документ без названия";
    fragment.querySelector(".result-item__citation").textContent =
      hit.citation || "Цитата не указана";
    fragment.querySelector(".result-item__text").textContent =
      hit.raw_text || hit.text || "Текст фрагмента отсутствует";
    resultsNode.append(fragment);
  }
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
  } catch {
    throw new Error(`Сервис вернул не-JSON ответ: ${text.slice(0, 220)}`);
  }

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.error ||
        `HTTP ${response.status}: ${response.statusText || "ошибка webhook"}`
    );
  }

  return payload;
}

async function handleSearch(event) {
  event.preventDefault();

  const endpoint = endpointInput.value.trim();
  const query = queryInput.value.trim();
  const limit = Number(limitInput.value || 6);

  if (!endpoint) {
    setState("Сначала укажите webhook URL в настройках подключения.", "error");
    return;
  }

  if (!query) {
    setState("Введите вопрос по регламентам.", "error");
    return;
  }

  if (!saveEndpoint()) {
    return;
  }

  submitButton.disabled = true;
  setState("Выполняю поиск по регламентам и собираю подтверждающие фрагменты...", "loading");
  summaryNode.textContent = "Идёт поиск по документам.";

  try {
    const payload = await callSearchApi({ endpoint, query, limit });
    saveHistoryQuery(query);
    renderHistory();
    renderResults(payload);
  } catch (error) {
    setState(`Поиск не выполнен: ${error.message}`, "error");
    summaryNode.textContent = "Не удалось получить ответ от backend.";
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
  setEndpointStatus("Проверяю webhook тестовым запросом...", "");

  try {
    const payload = await callSearchApi({
      endpoint,
      query: "правила оформления командировки",
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

loadEndpoint();
renderHistory();
updateCharCount();

searchForm.addEventListener("submit", handleSearch);
saveEndpointButton.addEventListener("click", saveEndpoint);
testEndpointButton.addEventListener("click", testEndpoint);
queryInput.addEventListener("input", updateCharCount);
feedbackYes.addEventListener("click", () => setFeedback("yes"));
feedbackNo.addEventListener("click", () => setFeedback("no"));

for (const button of exampleButtons) {
  button.addEventListener("click", () => {
    queryInput.value = button.dataset.query || "";
    updateCharCount();
    queryInput.focus();
  });
}
