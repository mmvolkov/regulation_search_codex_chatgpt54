const storageKey = "regulation-search-endpoint";
const emailKey = "regulation-search-email";
const historyKey = "regulation-search-history";
const defaultEndpoint = "./regulation-proxy/search.php";
const authEndpoint = "./regulation-proxy/auth.php";
const uploadEndpoint = "./regulation-proxy/upload.php";
const collectionEndpoint = "./regulation-proxy/collection.php";
const feedbackEndpoint = "./regulation-proxy/feedback.php";
const maxHistoryItems = 8;
const maxFileSize = 20 * 1024 * 1024;
const allowedExtensions = [".docx"];

const modeButtons = document.querySelectorAll(".mode-switch__item");
const searchView = document.querySelector("#search-view");
const uploadView = document.querySelector("#upload-view");

const endpointInput = document.querySelector("#endpoint");
const emailInput = document.querySelector("#user-email");
const saveEmailButton = document.querySelector("#save-email");
const checkAccessButton = document.querySelector("#check-access");
const saveEndpointButton = document.querySelector("#save-endpoint");
const testEndpointButton = document.querySelector("#test-endpoint");
const accessStatus = document.querySelector("#access-status");
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
const answerSourceRow = answerSource ? answerSource.closest(".answer-line") : null;
const resultsNode = document.querySelector("#results");
const summaryNode = document.querySelector("#summary");
const historyList = document.querySelector("#history-list");
const resultTemplate = document.querySelector("#result-template");
const historyTemplate = document.querySelector("#history-template");
const exampleButtons = document.querySelectorAll(".example-pill");
const feedbackYes = document.querySelector("#feedback-yes");
const feedbackNo = document.querySelector("#feedback-no");
const feedbackStatus = document.querySelector("#feedback-status");

const dropzone = document.querySelector("#dropzone");
const fileInput = document.querySelector("#file-input");
const uploadStatus = document.querySelector("#upload-status");
const selectedFilesCard = document.querySelector("#selected-files-card");
const fileList = document.querySelector("#file-list");
const fileTemplate = document.querySelector("#file-template");
const clearFilesButton = document.querySelector("#clear-files");
const startIndexingButton = document.querySelector("#start-indexing");
const refreshCollectionButton = document.querySelector("#refresh-collection");
const clearCollectionButton = document.querySelector("#clear-collection");
const collectionPoints = document.querySelector("#collection-points");
const collectionStatus = document.querySelector("#collection-status");
const collectionName = document.querySelector("#collection-name");
const collectionNote = document.querySelector("#collection-note");

let selectedFiles = [];
let lastSearchContext = null;
let lastFeedbackValue = "";
const fallbackAnswerPatterns = [
  /к сожалению/i,
  /не найден[а-я\s]*информац/i,
  /не удалось найти/i,
  /ответ[а-я\s]*не найден/i,
  /в доступных регламентах не найден/i
];

function loadEndpoint() {
  const saved = localStorage.getItem(storageKey);
  endpointInput.value = saved || defaultEndpoint;
}

function loadUserEmail() {
  emailInput.value = localStorage.getItem(emailKey) || "";
  if (emailInput.value.trim()) {
    setAccessStatus("E-mail сохранён локально. Доступ ещё не проверен.", "");
  }
}

function getUserEmail() {
  return emailInput.value.trim().toLowerCase();
}

function saveUserEmail() {
  const value = getUserEmail();
  if (!value) {
    setAccessStatus("Сначала укажите рабочий e-mail.", "error");
    return false;
  }
  localStorage.setItem(emailKey, value);
  setAccessStatus("E-mail сохранён локально в браузере.", "ok");
  return true;
}

function saveEndpoint() {
  const value = endpointInput.value.trim();
  if (!value) {
    setEndpointStatus("Сначала укажите URL search proxy.", "error");
    return false;
  }

  localStorage.setItem(storageKey, value);
  setEndpointStatus("URL сохранён локально в браузере.", "ok");
  return true;
}

function setAccessStatus(text, kind = "") {
  accessStatus.textContent = text;
  accessStatus.className = "endpoint-status";
  if (kind) {
    accessStatus.classList.add(`endpoint-status--${kind}`);
  }
}

function setEndpointStatus(text, kind = "") {
  endpointStatus.textContent = text;
  endpointStatus.className = "endpoint-status";
  if (kind) {
    endpointStatus.classList.add(`endpoint-status--${kind}`);
  }
}

function setCollectionNote(text, kind = "") {
  collectionNote.textContent = text;
  collectionNote.className = "collection-note";
  if (kind) {
    collectionNote.classList.add(`collection-note--${kind}`);
  }
}

function setActiveView(view) {
  const isSearch = view === "search";
  searchView.hidden = !isSearch;
  uploadView.hidden = isSearch;

  for (const button of modeButtons) {
    button.classList.toggle("mode-switch__item--active", button.dataset.view === view);
  }

  if (view === "upload") {
    refreshCollectionStatus();
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

function normalizeAnswerText(text) {
  if (!text) {
    return "Текст ответа отсутствует.";
  }
  return String(text).replace(/^\s*ответ:\s*/i, "").trim() || "Текст ответа отсутствует.";
}

function parseOptionalBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function isFallbackAnswerText(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized || normalized === "текст ответа отсутствует.") {
    return true;
  }

  return fallbackAnswerPatterns.some((pattern) => pattern.test(normalized));
}

function resolveAnswerMeta(data, topHit) {
  const normalizedAnswer = normalizeAnswerText(
    data.answer ||
      topHit.raw_text ||
      topHit.text
  );
  const explicitAnswerFound = parseOptionalBoolean(data.answerFound ?? data.answer_found);
  const responseType = String(data.responseType || data.response_type || "").trim().toLowerCase();

  let answerFound = explicitAnswerFound;
  if (answerFound === null) {
    if (responseType === "answer_found") {
      answerFound = true;
    } else if (["no_answer", "zero_results"].includes(responseType)) {
      answerFound = false;
    } else {
      answerFound = !isFallbackAnswerText(normalizedAnswer);
    }
  }

  return {
    normalizedAnswer,
    answerFound,
    responseType: responseType || (answerFound ? "answer_found" : "no_answer")
  };
}

function updateCharCount() {
  charCount.textContent = `${queryInput.value.length} / 500`;
}

function setFeedback(active) {
  feedbackYes.classList.toggle("feedback-button--active", active === "yes");
  feedbackNo.classList.toggle("feedback-button--active", active === "no");
}

function setFeedbackStatus(text, kind = "") {
  feedbackStatus.textContent = text;
  feedbackStatus.className = "feedback-status";
  if (kind) {
    feedbackStatus.classList.add(`feedback-status--${kind}`);
  }
}

function resetFeedbackState() {
  lastFeedbackValue = "";
  setFeedback("");
  setFeedbackStatus("");
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
  resetFeedbackState();
  lastSearchContext = null;

  const fragments = Array.isArray(data.fragments)
    ? data.fragments
    : Array.isArray(data.hits)
      ? data.hits
      : [];

  if (fragments.length === 0) {
    setState("Совпадения не найдены. Попробуйте переформулировать вопрос.", "idle");
    summaryNode.textContent = "Поиск выполнен, но релевантные фрагменты не найдены.";
    resultsNode.innerHTML =
      '<div class="results-placeholder">Ничего не найдено. Попробуйте упростить формулировку запроса.</div>';
    return;
  }

  const topHit = fragments[0];
  const topTitle = topHit.doc_title || topHit.doc_name || "Источник не указан";
  const topCitation = topHit.citation || topHit.heading || topHit.fragment_type || "";
  const { normalizedAnswer, answerFound } = resolveAnswerMeta(data, topHit);
  answerText.textContent = normalizedAnswer;
  answerSource.textContent = answerFound ? [topTitle, topCitation].filter(Boolean).join(" / ") : "";
  if (answerSourceRow) {
    answerSourceRow.hidden = !answerFound;
  }
  showAnswer();

  const total = typeof data.total_fragments === "number" ? data.total_fragments : fragments.length;
  summaryNode.textContent = answerFound
    ? `Найдено ${total} фрагментов по запросу «${data.query}».`
    : `Найдено ${total} фрагментов, но прямой ответ по запросу «${data.query}» не найден.`;
  lastSearchContext = {
    requestId: data.requestId || data.request_id || "",
    query: data.query || "",
    answerText: normalizedAnswer,
    answerFound,
    selectedDoc: answerFound ? topTitle : "",
    selectedCitation: answerFound ? topCitation : "",
    responseReceivedAtMs: Date.now()
  };

  for (const [index, hit] of fragments.entries()) {
    const fragment = resultTemplate.content.cloneNode(true);
    fragment.querySelector(".result-item__rank").textContent = `Результат ${hit.rank || index + 1}`;
    fragment.querySelector(".result-item__score").textContent =
      typeof hit.score === "number"
        ? hit.score.toFixed(3)
        : typeof hit.rrf_score === "number"
          ? hit.rrf_score.toFixed(3)
          : "n/a";
    fragment.querySelector(".result-item__title").textContent =
      hit.doc_title || hit.doc_name || "Документ без названия";
    fragment.querySelector(".result-item__citation").textContent =
      hit.citation || hit.heading || hit.fragment_type || "Цитата не указана";
    fragment.querySelector(".result-item__text").textContent =
      hit.raw_text || hit.text || "Текст фрагмента отсутствует";
    resultsNode.append(fragment);
  }
}

async function callSearchApi({ endpoint, query, limit }) {
  const email = getUserEmail();
  const normalizedEndpoint = endpoint.trim();
  const isDispatcherEndpoint = /regulation-search-dispatch|\/webhook\//i.test(normalizedEndpoint);
  const requestBody = {
    email,
    query,
    top_k: limit,
    generate_answer: true,
    preset: "balanced"
  };

  if (isDispatcherEndpoint) {
    requestBody.action = "search";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
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
        `HTTP ${response.status}: ${response.statusText || "ошибка API"}`
    );
  }

  return payload;
}

async function submitFeedback(value) {
  const email = getUserEmail();
  if (!email) {
    setFeedbackStatus("Сначала укажите рабочий e-mail.", "error");
    return;
  }

  if (!lastSearchContext?.requestId) {
    setFeedbackStatus("Нужен request_id из последнего ответа, чтобы сохранить feedback.", "error");
    return;
  }

  if (lastFeedbackValue === value) {
    return;
  }

  feedbackYes.disabled = true;
  feedbackNo.disabled = true;
  setFeedbackStatus("Сохраняю отметку о полезности ответа...", "");

  try {
    const response = await fetch(feedbackEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        request_id: lastSearchContext.requestId,
        query: lastSearchContext.query,
        feedback: value,
        selected_doc: lastSearchContext.selectedDoc,
        selected_citation: lastSearchContext.selectedCitation,
        answer_text: lastSearchContext.answerText,
        clicked_after_ms: Date.now() - lastSearchContext.responseReceivedAtMs
      })
    });

    const text = await response.text();
    let payload;

    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Feedback API вернул не-JSON ответ: ${text.slice(0, 220)}`);
    }

    if (!response.ok) {
      throw new Error(
        payload?.message ||
          payload?.error ||
          `HTTP ${response.status}: ${response.statusText || "ошибка feedback API"}`
      );
    }

    lastFeedbackValue = value;
    setFeedback(value);
    setFeedbackStatus("Оценка сохранена.", "ok");
  } catch (error) {
    setFeedbackStatus(`Не удалось сохранить feedback: ${error.message}`, "error");
  } finally {
    feedbackYes.disabled = false;
    feedbackNo.disabled = false;
  }
}

async function checkAccess() {
  const email = getUserEmail();
  if (!email) {
    setAccessStatus("Сначала укажите рабочий e-mail.", "error");
    return null;
  }

  const response = await fetch(authEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email })
  });

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Auth API вернул не-JSON ответ: ${text.slice(0, 220)}`);
  }

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.error ||
        `HTTP ${response.status}: ${response.statusText || "ошибка авторизации"}`
    );
  }

  return payload;
}

async function uploadSingleFile(file) {
  const email = getUserEmail();
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("preset", "balanced");
  formData.append("email", email);

  const response = await fetch(uploadEndpoint, {
    method: "POST",
    body: formData
  });

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Сервис загрузки вернул не-JSON ответ: ${text.slice(0, 220)}`);
  }

  if (!response.ok) {
    throw new Error(
      payload?.detail ||
        payload?.message ||
        payload?.error ||
        `HTTP ${response.status}: ${response.statusText || "ошибка загрузки"}`
    );
  }

  return payload;
}

async function fetchCollectionStatus() {
  const email = getUserEmail();
  const response = await fetch(collectionEndpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-User-Email": email
    }
  });

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Collection API вернул не-JSON ответ: ${text.slice(0, 220)}`);
  }

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.error ||
        `HTTP ${response.status}: ${response.statusText || "ошибка collection API"}`
    );
  }

  return payload;
}

async function clearCollection() {
  const email = getUserEmail();
  const response = await fetch(collectionEndpoint, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "X-User-Email": email
    }
  });

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Collection API вернул не-JSON ответ: ${text.slice(0, 220)}`);
  }

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.error ||
        `HTTP ${response.status}: ${response.statusText || "ошибка очистки"}`
    );
  }

  return payload;
}

async function handleSearch(event) {
  event.preventDefault();

  const endpoint = endpointInput.value.trim();
  const email = getUserEmail();
  const query = queryInput.value.trim();
  const limit = Number(limitInput.value || 6);

  if (!endpoint) {
    setState("Сначала укажите URL search proxy в настройках подключения.", "error");
    return;
  }

  if (!email) {
    setState("Сначала укажите рабочий e-mail и проверьте доступ.", "error");
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
  resetFeedbackState();
  lastSearchContext = null;
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

  if (!getUserEmail()) {
    setEndpointStatus("Сначала укажите рабочий e-mail.", "error");
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
    const count = Array.isArray(payload.fragments)
      ? payload.fragments.length
      : Array.isArray(payload.hits)
        ? payload.hits.length
        : 0;
    setEndpointStatus(`API отвечает. Получено результатов: ${count}.`, "ok");
  } catch (error) {
    setEndpointStatus(`Не удалось достучаться до API: ${error.message}`, "error");
  } finally {
    testEndpointButton.disabled = false;
  }
}

async function refreshCollectionStatus() {
  if (!getUserEmail()) {
    collectionPoints.textContent = "-";
    collectionStatus.textContent = "Ожидает доступ";
    collectionName.textContent = "-";
    setCollectionNote("Сначала укажите рабочий e-mail и проверьте доступ.", "");
    return;
  }

  refreshCollectionButton.disabled = true;
  clearCollectionButton.disabled = true;
  setCollectionNote("Обновляю состояние коллекции...", "");

  try {
    const payload = await fetchCollectionStatus();
    collectionPoints.textContent =
      typeof payload.points_count === "number" ? String(payload.points_count) : "0";
    collectionStatus.textContent = payload.status || "unknown";
    collectionName.textContent = payload.name || "-";
    setCollectionNote("Статус коллекции обновлён.", "ok");
  } catch (error) {
    collectionPoints.textContent = "-";
    collectionStatus.textContent = "Ошибка";
    collectionName.textContent = "-";
    setCollectionNote(`Не удалось обновить коллекцию: ${error.message}`, "error");
  } finally {
    refreshCollectionButton.disabled = false;
    clearCollectionButton.disabled = false;
  }
}

async function handleClearCollection() {
  if (!getUserEmail()) {
    setCollectionNote("Сначала укажите рабочий e-mail и проверьте доступ.", "error");
    return;
  }

  const confirmed = window.confirm(
    "Очистить всю коллекцию? Все загруженные фрагменты будут удалены."
  );

  if (!confirmed) {
    return;
  }

  clearCollectionButton.disabled = true;
  refreshCollectionButton.disabled = true;
  setCollectionNote("Очищаю коллекцию...", "");

  try {
    await clearCollection();
    await refreshCollectionStatus();
    setCollectionNote("Коллекция очищена.", "ok");
  } catch (error) {
    setCollectionNote(`Не удалось очистить коллекцию: ${error.message}`, "error");
  } finally {
    clearCollectionButton.disabled = false;
    refreshCollectionButton.disabled = false;
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
    startIndexingButton.disabled = true;
    return;
  }

  selectedFilesCard.hidden = false;
  startIndexingButton.disabled = false;

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

async function startIndexing() {
  if (!getUserEmail()) {
    setUploadStatus("Сначала укажите рабочий e-mail и проверьте доступ.", "error");
    return;
  }

  if (selectedFiles.length === 0) {
    setUploadStatus("Сначала выберите хотя бы один DOCX-файл.", "error");
    return;
  }

  startIndexingButton.disabled = true;
  clearFilesButton.disabled = true;
  dropzone.setAttribute("aria-disabled", "true");

  const results = [];

  try {
    for (const [index, file] of selectedFiles.entries()) {
      setUploadStatus(
        `Индексация ${index + 1} из ${selectedFiles.length}: ${file.name}`,
        ""
      );
      const payload = await uploadSingleFile(file);
      const fragmentsCount = payload?.stats?.total_fragments ?? payload?.stats?.vectors_indexed ?? 0;
      results.push(`${payload.doc_name || file.name}: ${fragmentsCount} фрагментов`);
    }

    setUploadStatus(`Индексация завершена. ${results.join(" | ")}`, "ok");
    selectedFiles = [];
    renderSelectedFiles();
    await refreshCollectionStatus();
  } catch (error) {
    setUploadStatus(`Индексация не выполнена: ${error.message}`, "error");
  } finally {
    startIndexingButton.disabled = selectedFiles.length === 0;
    clearFilesButton.disabled = false;
    dropzone.removeAttribute("aria-disabled");
  }
}

loadEndpoint();
loadUserEmail();
renderHistory();
updateCharCount();
setActiveView("search");

searchForm.addEventListener("submit", handleSearch);
saveEmailButton.addEventListener("click", saveUserEmail);
checkAccessButton.addEventListener("click", async () => {
  if (!saveUserEmail()) {
    return;
  }

  checkAccessButton.disabled = true;
  setAccessStatus("Проверяю allowlist в n8n...", "");

  try {
    const payload = await checkAccess();
    const roleLabel = payload.role ? ` Роль: ${payload.role}.` : "";
    setAccessStatus(`${payload.message || "Доступ подтверждён."}${roleLabel}`, "ok");
    if (uploadView.hidden === false) {
      await refreshCollectionStatus();
    }
  } catch (error) {
    setAccessStatus(`Доступ не подтверждён: ${error.message}`, "error");
  } finally {
    checkAccessButton.disabled = false;
  }
});
saveEndpointButton.addEventListener("click", saveEndpoint);
testEndpointButton.addEventListener("click", testEndpoint);
queryInput.addEventListener("input", updateCharCount);
feedbackYes.addEventListener("click", () => submitFeedback("yes"));
feedbackNo.addEventListener("click", () => submitFeedback("no"));
clearFilesButton.addEventListener("click", () => {
  selectedFiles = [];
  renderSelectedFiles();
  setUploadStatus("Список очищен. Можно выбрать файлы заново.");
});
startIndexingButton.addEventListener("click", startIndexing);
refreshCollectionButton.addEventListener("click", refreshCollectionStatus);
clearCollectionButton.addEventListener("click", handleClearCollection);

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

refreshCollectionStatus();
