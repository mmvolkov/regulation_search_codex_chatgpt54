const storageKey = "regulation-search-endpoint";
const loginKey = "regulation-search-login";
const historyKey = "regulation-search-history";
const modelKey = "regulation-search-chat-model";
const defaultEndpoint = "./regulation-proxy/search.php";
const defaultChatModel = "openai/gpt-4o-mini";
const allowedChatModels = ["openai/gpt-4o-mini", "openai/gpt-oss-120b"];
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
const connectButton = document.querySelector("#connect-button");
const currentLoginNode = document.querySelector("#current-login");
const accessStatus = document.querySelector("#access-status");
const endpointStatus = document.querySelector("#endpoint-status");
const saveEndpointButton = document.querySelector("#save-endpoint");
const testEndpointButton = document.querySelector("#test-endpoint");

const authModal = document.querySelector("#auth-modal");
const authForm = document.querySelector("#auth-form");
const authLoginInput = document.querySelector("#auth-login");
const authPasswordInput = document.querySelector("#auth-password");
const authModalStatus = document.querySelector("#auth-modal-status");
const authSubmitButton = document.querySelector("#auth-submit");
const authCloseButtons = document.querySelectorAll("[data-auth-close]");

const searchForm = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const limitInput = document.querySelector("#limit");
const chatModelInput = document.querySelector("#chat-model");
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
let currentUser = null;
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
  if (!endpointInput) {
    return;
  }

  const saved = localStorage.getItem(storageKey);
  endpointInput.value = saved || defaultEndpoint;
}

function loadStoredLogin() {
  const savedLogin = localStorage.getItem(loginKey) || "";
  if (authLoginInput) {
    authLoginInput.value = savedLogin;
  }
}

function loadChatModel() {
  if (!chatModelInput) {
    return;
  }

  const saved = localStorage.getItem(modelKey) || defaultChatModel;
  chatModelInput.value = allowedChatModels.includes(saved) ? saved : defaultChatModel;
}

function saveChatModel() {
  localStorage.setItem(modelKey, getChatModel());
}

function rememberLogin(login) {
  localStorage.setItem(loginKey, String(login || "").trim().toLowerCase());
}

function getStoredLogin() {
  return String(localStorage.getItem(loginKey) || "").trim().toLowerCase();
}

function isConnected() {
  return Boolean(currentUser && currentUser.authenticated !== false && currentUser.login);
}

function canUpload() {
  if (!isConnected()) {
    return false;
  }

  return Boolean(
    currentUser?.permissions?.upload ?? currentUser?.canUpload ?? false
  );
}

function canManageCollection() {
  if (!isConnected()) {
    return false;
  }

  return Boolean(
    currentUser?.permissions?.collection_clear ?? currentUser?.canManageCollection ?? false
  );
}

function getChatModel() {
  if (!chatModelInput) {
    return defaultChatModel;
  }

  const value = String(chatModelInput.value || "").trim();
  return allowedChatModels.includes(value) ? value : defaultChatModel;
}

function saveEndpoint() {
  const value = String(endpointInput?.value || "").trim();
  if (!value) {
    setEndpointStatus("Сначала укажите URL search proxy.", "error");
    return false;
  }

  localStorage.setItem(storageKey, value);
  setEndpointStatus("URL сохранён локально в браузере.", "ok");
  return true;
}

function setAccessStatus(text, kind = "") {
  if (!accessStatus) {
    return;
  }

  accessStatus.hidden = !text;
  accessStatus.textContent = text;
  accessStatus.className = "endpoint-status";
  if (kind) {
    accessStatus.classList.add(`endpoint-status--${kind}`);
  }
}

function setEndpointStatus(text, kind = "") {
  if (!endpointStatus) {
    return;
  }

  endpointStatus.textContent = text;
  endpointStatus.className = "endpoint-status";
  if (kind) {
    endpointStatus.classList.add(`endpoint-status--${kind}`);
  }
}

function setCollectionNote(text, kind = "") {
  if (!collectionNote) {
    return;
  }

  collectionNote.textContent = text;
  collectionNote.className = "collection-note";
  if (kind) {
    collectionNote.classList.add(`collection-note--${kind}`);
  }
}

function setAuthModalStatus(text, kind = "") {
  if (!authModalStatus) {
    return;
  }

  authModalStatus.hidden = !text;
  authModalStatus.textContent = text;
  authModalStatus.className = "endpoint-status";
  if (kind) {
    authModalStatus.classList.add(`endpoint-status--${kind}`);
  }
}

function setFeedbackStatus(text, kind = "") {
  if (!feedbackStatus) {
    return;
  }

  feedbackStatus.textContent = text;
  feedbackStatus.className = "feedback-status";
  if (kind) {
    feedbackStatus.classList.add(`feedback-status--${kind}`);
  }
}

function syncAuthUi() {
  const displayName = currentUser?.displayName || currentUser?.login || "";

  if (currentLoginNode) {
    currentLoginNode.textContent = isConnected() ? displayName : "Не подключено";
  }

  if (connectButton) {
    connectButton.textContent = isConnected() ? "Сменить пользователя" : "Подключиться";
  }

  renderSelectedFiles();

  if (clearCollectionButton) {
    clearCollectionButton.disabled = !canManageCollection();
  }
}

function openAuthModal() {
  if (!authModal) {
    return;
  }

  authModal.hidden = false;
  setAuthModalStatus("");

  if (authLoginInput) {
    authLoginInput.value = currentUser?.login || getStoredLogin();
  }

  if (authPasswordInput) {
    authPasswordInput.value = "";
  }

  if (authLoginInput && authLoginInput.value) {
    authPasswordInput?.focus();
  } else {
    authLoginInput?.focus();
  }
}

function closeAuthModal() {
  if (!authModal) {
    return;
  }

  authModal.hidden = true;
  setAuthModalStatus("");
}

function requireConnection(message) {
  setAccessStatus(message || "Сначала подключитесь по логину и паролю.", "error");
  openAuthModal();
  setAuthModalStatus(message || "Введите логин и пароль для продолжения.", "error");
  return false;
}

function setActiveView(view) {
  const isSearch = view === "search";
  if (searchView) {
    searchView.hidden = !isSearch;
  }
  if (uploadView) {
    uploadView.hidden = isSearch;
  }

  for (const button of modeButtons) {
    button.classList.toggle("mode-switch__item--active", button.dataset.view === view);
  }

  if (view === "upload") {
    refreshCollectionStatus();
  }
}

function setState(text, kind = "idle") {
  if (!stateNode || !answerContent) {
    return;
  }

  stateNode.hidden = false;
  answerContent.hidden = true;
  stateNode.textContent = text;
  stateNode.className = `state state--${kind}`;
}

function showAnswer() {
  if (!stateNode || !answerContent) {
    return;
  }

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
    data.answer || topHit.raw_text || topHit.text
  );
  const explicitAnswerFound = parseOptionalBoolean(data.answerFound ?? data.answer_found);
  const responseType = String(data.responseType || data.response_type || "")
    .trim()
    .toLowerCase();

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

function getHitScore(hit) {
  if (typeof hit.score === "number") {
    return hit.score;
  }
  if (typeof hit.rrf_score === "number") {
    return hit.rrf_score;
  }
  return null;
}

function formatScoreLabel(hit, topScore) {
  const rawScore = getHitScore(hit);
  if (rawScore === null || topScore === null || topScore <= 0) {
    return "n/a";
  }

  const relativeScore = Math.round((rawScore / topScore) * 100);
  return `${Math.max(8, Math.min(100, relativeScore))}%`;
}

function formatFragmentType(hit) {
  const normalized = String(hit.fragment_type || hit.block_type || "")
    .trim()
    .toLowerCase();

  if (normalized === "table") {
    return "Таблица";
  }
  if (normalized === "text") {
    return "Текст";
  }
  if (normalized) {
    return normalized;
  }

  return "Фрагмент";
}

function updateCharCount() {
  if (!charCount || !queryInput) {
    return;
  }

  charCount.textContent = `${queryInput.value.length} / 500`;
}

function setFeedback(active) {
  feedbackYes?.classList.toggle("feedback-button--active", active === "yes");
  feedbackNo?.classList.toggle("feedback-button--active", active === "no");
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
  if (!historyList || !historyTemplate) {
    return;
  }

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
  if (!resultsNode || !summaryNode || !resultTemplate) {
    return;
  }

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
  const topScore = getHitScore(topHit);
  const topTitle = topHit.doc_title || topHit.doc_name || "Источник не указан";
  const topCitation = topHit.citation || topHit.heading || topHit.fragment_type || "";
  const { normalizedAnswer, answerFound } = resolveAnswerMeta(data, topHit);

  if (answerText) {
    answerText.textContent = normalizedAnswer;
  }
  if (answerSource) {
    answerSource.textContent = answerFound ? [topTitle, topCitation].filter(Boolean).join(" / ") : "";
  }
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
    fragment.querySelector(".result-item__rank").textContent = String(hit.rank || index + 1);
    fragment.querySelector(".result-item__title").textContent =
      hit.doc_title || hit.doc_name || "Документ без названия";
    fragment.querySelector(".result-item__citation").textContent =
      hit.citation || hit.heading || hit.fragment_type || "Цитата не указана";
    fragment.querySelector(".result-item__type").textContent = formatFragmentType(hit);
    fragment.querySelector(".result-item__score").textContent = formatScoreLabel(hit, topScore);
    fragment.querySelector(".result-item__text").textContent =
      hit.raw_text || hit.text || "Текст фрагмента отсутствует";
    resultsNode.append(fragment);
  }
}

async function parseJsonResponse(response, errorPrefix) {
  const text = await response.text();
  let payload = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${errorPrefix}: ${text.slice(0, 220)}`);
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

async function requestSessionState() {
  const response = await fetch(authEndpoint, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  return parseJsonResponse(response, "Auth API вернул не-JSON ответ");
}

async function connectWithCredentials(login, password) {
  const response = await fetch(authEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      login,
      password
    })
  });

  return parseJsonResponse(response, "Auth API вернул не-JSON ответ");
}

async function callSearchApi({ endpoint, query, limit, model }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      top_k: limit,
      generate_answer: true,
      preset: "balanced",
      model
    })
  });

  return parseJsonResponse(response, "Сервис вернул не-JSON ответ");
}

async function submitFeedback(value) {
  if (!isConnected()) {
    setFeedbackStatus("Сначала подключитесь.", "error");
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
        request_id: lastSearchContext.requestId,
        query: lastSearchContext.query,
        feedback: value,
        selected_doc: lastSearchContext.selectedDoc,
        selected_citation: lastSearchContext.selectedCitation,
        answer_text: lastSearchContext.answerText,
        clicked_after_ms: Date.now() - lastSearchContext.responseReceivedAtMs
      })
    });

    const payload = await parseJsonResponse(response, "Feedback API вернул не-JSON ответ");
    lastFeedbackValue = value;
    setFeedback(value);
    setFeedbackStatus(payload.message || "Оценка сохранена.", "ok");
  } catch (error) {
    setFeedbackStatus(`Не удалось сохранить feedback: ${error.message}`, "error");
  } finally {
    feedbackYes.disabled = false;
    feedbackNo.disabled = false;
  }
}

async function uploadSingleFile(file) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("preset", "balanced");

  const response = await fetch(uploadEndpoint, {
    method: "POST",
    body: formData
  });

  return parseJsonResponse(response, "Сервис загрузки вернул не-JSON ответ");
}

async function fetchCollectionStatus() {
  const response = await fetch(collectionEndpoint, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  return parseJsonResponse(response, "Collection API вернул не-JSON ответ");
}

async function clearCollection() {
  const response = await fetch(collectionEndpoint, {
    method: "DELETE",
    headers: {
      Accept: "application/json"
    }
  });

  return parseJsonResponse(response, "Collection API вернул не-JSON ответ");
}

async function restoreSession(silent = false) {
  try {
    const payload = await requestSessionState();
    if (payload.authenticated) {
      currentUser = payload;
      rememberLogin(payload.login || payload.email || "");
      if (!silent) {
        setAccessStatus(payload.message || "Подключение активно.", "ok");
      }
    } else {
      currentUser = null;
      if (!silent) {
        setAccessStatus("", "");
      }
    }
  } catch (error) {
    currentUser = null;
    if (!silent) {
      setAccessStatus(`Не удалось восстановить подключение: ${error.message}`, "error");
    }
  }

  syncAuthUi();
  return currentUser;
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const login = String(authLoginInput?.value || "").trim().toLowerCase();
  const password = String(authPasswordInput?.value || "").trim();

  if (!login || !password) {
    setAuthModalStatus("Введите логин и пароль.", "error");
    return;
  }

  authSubmitButton.disabled = true;
  setAuthModalStatus("Проверяю логин и пароль...", "");

  try {
    const payload = await connectWithCredentials(login, password);
    currentUser = payload;
    rememberLogin(payload.login || login);
    syncAuthUi();
    closeAuthModal();
    setAccessStatus(payload.message || "Доступ подтверждён.", "ok");
    await refreshCollectionStatus();
  } catch (error) {
    setAuthModalStatus(`Не удалось подключиться: ${error.message}`, "error");
  } finally {
    authSubmitButton.disabled = false;
  }
}

async function handleSearch(event) {
  event.preventDefault();

  const endpoint = String(endpointInput?.value || "").trim();
  const query = String(queryInput?.value || "").trim();
  const limit = Number(limitInput?.value || 6);
  const model = getChatModel();

  if (!endpoint) {
    setState("Сначала укажите URL search proxy в настройках подключения.", "error");
    return;
  }

  if (!isConnected()) {
    requireConnection("Сначала подключитесь по логину и паролю.");
    setState("Сначала подключитесь по логину и паролю.", "error");
    return;
  }

  if (!query) {
    setState("Введите вопрос по регламентам.", "error");
    return;
  }

  if (!saveEndpoint()) {
    return;
  }

  saveChatModel();

  submitButton.disabled = true;
  resetFeedbackState();
  lastSearchContext = null;
  setState("Выполняю поиск по регламентам и собираю подтверждающие фрагменты...", "loading");
  summaryNode.textContent = "Идёт поиск по документам.";

  try {
    const payload = await callSearchApi({
      endpoint,
      query,
      limit: Math.max(1, Math.min(12, Math.round(limit || 6))),
      model
    });
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
  const endpoint = String(endpointInput?.value || "").trim();
  if (!endpoint) {
    setEndpointStatus("Введите URL перед проверкой.", "error");
    return;
  }

  if (!isConnected()) {
    setEndpointStatus("Сначала подключитесь по логину и паролю.", "error");
    return;
  }

  testEndpointButton.disabled = true;
  setEndpointStatus("Проверяю API тестовым запросом...", "");

  try {
    const payload = await callSearchApi({
      endpoint,
      query: "правила оформления командировки",
      limit: 2,
      model: getChatModel()
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
  if (!collectionPoints || !collectionStatus || !collectionName) {
    return;
  }

  if (!isConnected()) {
    collectionPoints.textContent = "-";
    collectionStatus.textContent = "Ожидает доступ";
    collectionName.textContent = "-";
    setCollectionNote("Сначала подключитесь по логину и паролю.", "");
    if (clearCollectionButton) {
      clearCollectionButton.disabled = true;
    }
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
    clearCollectionButton.disabled = !canManageCollection();
  }
}

async function handleClearCollection() {
  if (!isConnected()) {
    requireConnection("Сначала подключитесь по логину и паролю.");
    setCollectionNote("Сначала подключитесь по логину и паролю.", "error");
    return;
  }

  if (!canManageCollection()) {
    setCollectionNote("Очистка коллекции разрешена только администратору.", "error");
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
    clearCollectionButton.disabled = !canManageCollection();
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
  if (!fileList || !selectedFilesCard || !startIndexingButton) {
    return;
  }

  fileList.innerHTML = "";

  if (selectedFiles.length === 0) {
    selectedFilesCard.hidden = true;
    startIndexingButton.disabled = true;
    return;
  }

  selectedFilesCard.hidden = false;
  startIndexingButton.disabled = !canUpload();

  for (const file of selectedFiles) {
    const fragment = fileTemplate.content.cloneNode(true);
    fragment.querySelector(".file-item__name").textContent = file.name;
    fragment.querySelector(".file-item__details").textContent =
      `${file.type || "application/octet-stream"} • ${formatFileSize(file.size)}`;
    fileList.append(fragment);
  }
}

function setUploadStatus(text, kind = "") {
  if (!uploadStatus) {
    return;
  }

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

    if (!isConnected()) {
      setUploadStatus(
        `Файлы подготовлены (${accepted.length}). Для индексации сначала подключитесь.`,
        ""
      );
    } else if (!canUpload()) {
      setUploadStatus(
        "Файлы выбраны, но загрузка документов разрешена только редактору или администратору.",
        "error"
      );
    } else {
      setUploadStatus(`Подготовлено файлов для индексации: ${accepted.length}.`, "ok");
    }
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
  fileInput?.click();
}

async function startIndexing() {
  if (!isConnected()) {
    requireConnection("Сначала подключитесь по логину и паролю.");
    setUploadStatus("Сначала подключитесь по логину и паролю.", "error");
    return;
  }

  if (!canUpload()) {
    setUploadStatus("Загрузка документов разрешена только редактору или администратору.", "error");
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
      setUploadStatus(`Индексация ${index + 1} из ${selectedFiles.length}: ${file.name}`, "");
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
    startIndexingButton.disabled = selectedFiles.length === 0 || !canUpload();
    clearFilesButton.disabled = false;
    dropzone.removeAttribute("aria-disabled");
  }
}

loadEndpoint();
loadStoredLogin();
loadChatModel();
renderHistory();
updateCharCount();
setActiveView("search");
setAccessStatus("");
syncAuthUi();

searchForm?.addEventListener("submit", handleSearch);
connectButton?.addEventListener("click", () => {
  setAccessStatus("");
  openAuthModal();
});
authForm?.addEventListener("submit", handleAuthSubmit);
saveEndpointButton?.addEventListener("click", saveEndpoint);
testEndpointButton?.addEventListener("click", testEndpoint);
queryInput?.addEventListener("input", updateCharCount);
chatModelInput?.addEventListener("change", saveChatModel);
feedbackYes?.addEventListener("click", () => submitFeedback("yes"));
feedbackNo?.addEventListener("click", () => submitFeedback("no"));
clearFilesButton?.addEventListener("click", () => {
  selectedFiles = [];
  renderSelectedFiles();
  setUploadStatus("Список очищен. Можно выбрать файлы заново.");
});
startIndexingButton?.addEventListener("click", startIndexing);
refreshCollectionButton?.addEventListener("click", refreshCollectionStatus);
clearCollectionButton?.addEventListener("click", handleClearCollection);

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

for (const button of authCloseButtons) {
  button.addEventListener("click", closeAuthModal);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && authModal && !authModal.hidden) {
    closeAuthModal();
  }
});

dropzone?.addEventListener("click", openFilePicker);
dropzone?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openFilePicker();
  }
});

dropzone?.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-dragover");
});

dropzone?.addEventListener("dragleave", () => {
  dropzone.classList.remove("is-dragover");
});

dropzone?.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragover");
  handleFiles(Array.from(event.dataTransfer?.files || []));
});

fileInput?.addEventListener("change", () => {
  handleFiles(Array.from(fileInput.files || []));
  fileInput.value = "";
});

restoreSession(true).finally(() => {
  refreshCollectionStatus();
});
