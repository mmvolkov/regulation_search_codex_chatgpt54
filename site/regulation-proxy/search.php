<?php
declare(strict_types=1);

require __DIR__ . '/access.php';

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    regulation_search_json_response(405, [
        'ok' => false,
        'message' => 'Method not allowed',
    ]);
}

$user = regulation_search_require_session_user();

$rawBody = file_get_contents('php://input');
if ($rawBody === false || $rawBody === '') {
    regulation_search_json_response(400, [
        'ok' => false,
        'message' => 'Empty request body',
    ]);
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    regulation_search_json_response(400, [
        'ok' => false,
        'message' => 'Invalid JSON body',
    ]);
}

$topK = (int) ($payload['top_k'] ?? $payload['limit'] ?? 6);
$topK = max(1, min(12, $topK));
$generateAnswer = !isset($payload['generate_answer']) || (bool) $payload['generate_answer'];
$preset = trim((string) ($payload['preset'] ?? 'balanced'));
if ($preset === '') {
    $preset = 'balanced';
}
$model = trim((string) ($payload['model'] ?? ''));
$responseLength = strtoupper(trim((string) ($payload['response_length'] ?? 'M')));
if (!in_array($responseLength, ['S', 'M', 'L'], true)) {
    $responseLength = 'M';
}
$temperature = 0.1;

$dispatcherBody = [
    'action' => 'search',
    'login' => $user['login'],
    'password' => regulation_search_current_password(),
    'email' => $user['email'],
    'query' => trim((string) ($payload['query'] ?? '')),
    'top_k' => $topK,
    'generate_answer' => $generateAnswer,
    'preset' => $preset,
    'temperature' => $temperature,
    'response_length' => $responseLength,
];
if ($model !== '') {
    $dispatcherBody['model'] = $model;
}

$dispatcherResponse = regulation_search_request_json(regulation_search_dispatcher_url(), $dispatcherBody);
if ($dispatcherResponse['ok']) {
    regulation_search_passthrough_response($dispatcherResponse);
}

$fallbackBody = [
    'query' => trim((string) ($payload['query'] ?? '')),
    'top_k' => $topK,
    'generate_answer' => $generateAnswer,
    'preset' => $preset,
    'temperature' => $temperature,
    'response_length' => $responseLength,
];
if ($model !== '') {
    $fallbackBody['model'] = $model;
}

$fallbackResponse = regulation_search_request_json(
    regulation_search_search_api_base_url() . '/search',
    $fallbackBody
);

if (!$fallbackResponse['ok']) {
    $message = $dispatcherResponse['error'] !== ''
        ? 'Поиск через dispatcher не выполнен: ' . $dispatcherResponse['error']
        : 'Поиск не выполнен.';

    if ($dispatcherResponse['statusCode'] > 0 && $dispatcherResponse['body'] !== '') {
        $message = 'Dispatcher вернул HTTP ' . $dispatcherResponse['statusCode'] . '.';
    }

    if ($fallbackResponse['error'] !== '') {
        $message .= ' Fallback search-api error: ' . $fallbackResponse['error'];
    } elseif ($fallbackResponse['statusCode'] > 0) {
        $message .= ' Fallback search-api HTTP ' . $fallbackResponse['statusCode'] . '.';
    }

    regulation_search_json_response(502, [
        'ok' => false,
        'error' => 'search_failed',
        'message' => $message,
    ]);
}

regulation_search_passthrough_response($fallbackResponse);
