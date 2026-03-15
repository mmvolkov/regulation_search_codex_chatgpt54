<?php
declare(strict_types=1);

$upstreamUrl = 'https://plequeneluera.beget.app/webhook/regulation-search-dispatch';

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
    http_response_code(400);
    echo json_encode([
        'message' => 'Invalid JSON body',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$dispatcherBody = [
    'action' => 'authorize',
    'email' => trim((string) ($payload['email'] ?? '')),
];

$ch = curl_init($upstreamUrl);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($dispatcherBody, JSON_UNESCAPED_UNICODE),
    CURLOPT_HTTPHEADER => [
        'Accept: application/json',
        'Content-Type: application/json',
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 180,
]);

$responseBody = curl_exec($ch);

if ($responseBody === false) {
    $error = curl_error($ch);
    curl_close($ch);
    http_response_code(502);
    echo json_encode([
        'message' => 'Auth dispatcher request failed',
        'error' => $error,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$statusCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if (is_string($contentType) && $contentType !== '') {
    header('Content-Type: ' . $contentType);
}

http_response_code($statusCode > 0 ? $statusCode : 200);
echo $responseBody;
