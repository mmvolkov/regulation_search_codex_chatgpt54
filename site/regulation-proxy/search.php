<?php

require __DIR__ . '/access.php';

$upstreamUrl = regulation_search_dispatcher_url();

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'message' => 'Method not allowed',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$rawBody = file_get_contents('php://input');
if ($rawBody === false || $rawBody === '') {
    http_response_code(400);
    echo json_encode([
        'message' => 'Empty request body',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    regulation_search_json_response(400, [
        'message' => 'Invalid JSON body',
    ]);
}

$email = '';
if (isset($payload['email'])) {
    $email = (string) $payload['email'];
} elseif (isset($_SERVER['HTTP_X_USER_EMAIL'])) {
    $email = (string) $_SERVER['HTTP_X_USER_EMAIL'];
}

$topK = 6;
if (isset($payload['top_k'])) {
    $topK = (int) $payload['top_k'];
} elseif (isset($payload['limit'])) {
    $topK = (int) $payload['limit'];
}

$generateAnswer = true;
if (isset($payload['generate_answer'])) {
    $generateAnswer = (bool) $payload['generate_answer'];
}

$preset = isset($payload['preset']) ? trim((string) $payload['preset']) : 'balanced';
if ($preset === '') {
    $preset = 'balanced';
}

$requestBody = [
    'action' => 'search',
    'email' => regulation_search_normalize_email($email),
    'query' => trim((string) (isset($payload['query']) ? $payload['query'] : '')),
    'top_k' => $topK,
    'generate_answer' => $generateAnswer,
    'preset' => $preset,
];

$ch = curl_init($upstreamUrl);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($requestBody, JSON_UNESCAPED_UNICODE),
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
        'message' => 'Search API request failed',
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
