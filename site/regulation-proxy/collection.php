<?php

require __DIR__ . '/access.php';

$upstreamUrl = regulation_search_dispatcher_url();

header('Content-Type: application/json; charset=utf-8');

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
if ($method !== 'GET' && $method !== 'DELETE') {
    http_response_code(405);
    echo json_encode([
        'message' => 'Method not allowed',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$email = isset($_SERVER['HTTP_X_USER_EMAIL']) ? $_SERVER['HTTP_X_USER_EMAIL'] : '';

$dispatcherBody = [
    'action' => $method === 'DELETE' ? 'collection_clear' : 'collection_status',
    'email' => regulation_search_normalize_email($email),
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
        'message' => 'Collection API request failed',
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
