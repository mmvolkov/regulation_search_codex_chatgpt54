<?php

require __DIR__ . '/access.php';

$upstreamUrl = regulation_search_dispatcher_url();

header('Content-Type: application/json; charset=utf-8');

$requestMethod = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
if ($requestMethod !== 'POST') {
    regulation_search_json_response(405, [
        'message' => 'Method not allowed',
    ]);
}

$rawBody = file_get_contents('php://input');
if ($rawBody === false || $rawBody === '') {
    regulation_search_json_response(400, [
        'message' => 'Empty request body',
    ]);
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    regulation_search_json_response(400, [
        'message' => 'Invalid JSON body',
    ]);
}

$dispatcherBody = [
    'action' => 'feedback',
    'email' => regulation_search_normalize_email(isset($payload['email']) ? (string) $payload['email'] : ''),
    'request_id' => trim((string) (isset($payload['request_id']) ? $payload['request_id'] : (isset($payload['requestId']) ? $payload['requestId'] : ''))),
    'query' => trim((string) (isset($payload['query']) ? $payload['query'] : '')),
    'feedback' => trim((string) (isset($payload['feedback']) ? $payload['feedback'] : (isset($payload['answer_useful']) ? $payload['answer_useful'] : ''))),
    'feedback_reason' => trim((string) (isset($payload['feedback_reason']) ? $payload['feedback_reason'] : '')),
    'feedback_comment' => trim((string) (isset($payload['feedback_comment']) ? $payload['feedback_comment'] : '')),
    'selected_doc' => trim((string) (isset($payload['selected_doc']) ? $payload['selected_doc'] : '')),
    'selected_citation' => trim((string) (isset($payload['selected_citation']) ? $payload['selected_citation'] : '')),
    'answer_text' => trim((string) (isset($payload['answer_text']) ? $payload['answer_text'] : '')),
    'clicked_after_ms' => (string) (isset($payload['clicked_after_ms']) ? $payload['clicked_after_ms'] : ''),
];

$ch = curl_init($upstreamUrl);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($dispatcherBody, JSON_UNESCAPED_UNICODE),
    CURLOPT_HTTPHEADER => regulation_search_forwarded_headers([
        'Accept: application/json',
        'Content-Type: application/json',
    ]),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 180,
]);

$responseBody = curl_exec($ch);

if ($responseBody === false) {
    $error = curl_error($ch);
    curl_close($ch);
    regulation_search_json_response(502, [
        'message' => 'Feedback dispatcher request failed',
        'error' => $error,
    ]);
}

$statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if (is_string($contentType) && $contentType !== '') {
    header('Content-Type: ' . $contentType);
}

http_response_code($statusCode > 0 ? $statusCode : 200);
echo $responseBody;
