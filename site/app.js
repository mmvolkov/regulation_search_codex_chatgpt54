const storageKey = "regulation-search-endpoint";
const historyKey = "regulation-search-history";
const defaultEndpoint = "https://plequeneluera.beget.app/webhook/regulations-search";
const maxHistoryItems = 8;
const maxFileSize = 20 * 1024 * 1024;
const allowedExtensions = [".pdf", ".docx", ".txt"];

const modeButtons = document.querySelectorAll(".mode-switch__item");
const searchView = document.querySelector("#search-view");
const uploadView = document.querySelector("#upload-view");

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

const dropzone = document.querySelector("#dropzone");
const fileInput = document.querySelector("#file-input");
const uploadStatus = document.querySelector("#upload-status");
const selectedFilesCard = document.querySelector("#selected-files-card");
const fileList = document.querySelector("#file-list");
const fileTemplate = document.querySelector("#file-template");
const clearFilesButton = document.querySelector("#clear-files");

let selectedFiles = [];

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

function setActiveView(view) {
  const isSearch = view === "search";
  searchView.hidden = !isSearch;
  uploadView.hidden = isSearch;

  for (const button of modeButtons) {
    button.classList.toggle("mode-switch__item--active", button.dataset.view === view);
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
      setActiveView("search");
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

function formatFileSize(size) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  }
  return `${Math.round(size / 1024)} КБ`;
}

function renderSelectedFiles() {
  fileList.innerHTML = "";

  if (selectedFiles.length === 0) {
    selectedFilesCard.hidden = true;
    return;
  }

  selectedFilesCard.hidden = false;

  for (const file of selectedFiles) {
    const fragment = fileTemplate.content.cloneNode(true);
    fragment.querySelector(".file-item__name").textContent = file.name;
    fragment.querySelector(".file-item__details").textContent =
      `${file.type || "application/octet-stream"} • ${formatFileSize(file.size)}`;
    fileList.append(fragment);
  }
}

function setUploadStatus(text, kind = "") {
  uploadStatus.textContent = text;
  uploadStatus.className = "upload-status";
  if (kind === "error") {
    uploadStatus.style.color = "var(--error)";
  } else if (kind === "ok") {
    uploadStatus.style.color = "var(--success)";
  } else {
    uploadStatus.style.color = "";
  }
}

function hasAllowedExtension(fileName) {
  const lower = fileName.toLowerCase();
  return allowedExtensions.some((ext) => lower.endsWith(ext));
}

function handleFiles(files) {
  const accepted = [];
  const rejected = [];

  for (const file of files) {
    if (!hasAllowedExtension(file.name)) {
      rejected.push(`${file.name}: неподдерживаемый формат`);
      continue;
    }

    if (file.size > maxFileSize) {
      rejected.push(`${file.name}: файл больше 20 МБ`);
      continue;
    }

    accepted.push(file);
  }

  if (accepted.length > 0) {
    selectedFiles = accepted;
    renderSelectedFiles();
    setUploadStatus(`Подготовлено файлов для индексации: ${accepted.length}.`, "ok");
  }

  if (rejected.length > 0 && accepted.length === 0) {
    setUploadStatus(rejected.join(" | "), "error");
  } else if (rejected.length > 0) {
    setUploadStatus(
      `Подготовлено файлов: ${accepted.length}. Некоторые файлы пропущены: ${rejected.join(" | ")}`,
      "error"
    );
  }
}

function openFilePicker() {
  fileInput.click();
}

loadEndpoint();
renderHistory();
updateCharCount();
setActiveView("search");

searchForm.addEventListener("submit", handleSearch);
saveEndpointButton.addEventListener("click", saveEndpoint);
testEndpointButton.addEventListener("click", testEndpoint);
queryInput.addEventListener("input", updateCharCount);
feedbackYes.addEventListener("click", () => setFeedback("yes"));
feedbackNo.addEventListener("click", () => setFeedback("no"));
clearFilesButton.addEventListener("click", () => {
  selectedFiles = [];
  renderSelectedFiles();
  setUploadStatus("Список очищен. Можно выбрать файлы заново.");
});

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    setActiveView(button.dataset.view);
  });
}

for (const button of exampleButtons) {
  button.addEventListener("click", () => {
    setActiveView("search");
    queryInput.value = button.dataset.query || "";
    updateCharCount();
    queryInput.focus();
  });
}

dropzone.addEventListener("click", openFilePicker);
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openFilePicker();
  }
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("is-dragover");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragover");
  handleFiles(Array.from(event.dataTransfer?.files || []));
});

fileInput.addEventListener("change", () => {
  handleFiles(Array.from(fileInput.files || []));
  fileInput.value = "";
});
