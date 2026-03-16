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

$dispatcherBody = [
    'action' => 'feedback',
    'login' => $user['login'],
    'password' => regulation_search_current_password(),
    'email' => $user['email'],
    'request_id' => trim((string) ($payload['request_id'] ?? $payload['requestId'] ?? '')),
    'query' => trim((string) ($payload['query'] ?? '')),
    'feedback' => trim((string) ($payload['feedback'] ?? $payload['answer_useful'] ?? '')),
    'feedback_reason' => trim((string) ($payload['feedback_reason'] ?? '')),
    'feedback_comment' => trim((string) ($payload['feedback_comment'] ?? '')),
    'selected_doc' => trim((string) ($payload['selected_doc'] ?? '')),
    'selected_citation' => trim((string) ($payload['selected_citation'] ?? '')),
    'answer_text' => trim((string) ($payload['answer_text'] ?? '')),
    'clicked_after_ms' => (string) ($payload['clicked_after_ms'] ?? ''),
];

$dispatcherResponse = regulation_search_request_json(regulation_search_dispatcher_url(), $dispatcherBody);

if (!$dispatcherResponse['ok']) {
    $message = $dispatcherResponse['error'] !== ''
        ? 'Feedback dispatcher request failed: ' . $dispatcherResponse['error']
        : 'Feedback dispatcher request failed.';

    if ($dispatcherResponse['statusCode'] > 0 && $dispatcherResponse['body'] !== '') {
        $message = 'Dispatcher вернул HTTP ' . $dispatcherResponse['statusCode'] . '.';
    }

    regulation_search_json_response(502, [
        'ok' => false,
        'error' => 'feedback_failed',
        'message' => $message,
    ]);
}

regulation_search_passthrough_response($dispatcherResponse);
