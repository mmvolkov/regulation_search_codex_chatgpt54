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

if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
    http_response_code(400);
    echo json_encode([
        'message' => 'File is required',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode([
        'message' => 'Uploaded file is invalid',
        'errorCode' => $file['error'] ?? null,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$postFields = [
    'action' => 'upload',
    'email' => trim((string) ($_POST['email'] ?? '')),
    'preset' => $_POST['preset'] ?? 'balanced',
    'file' => new CURLFile(
        $file['tmp_name'],
        $file['type'] ?: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        $file['name'] ?: 'document.docx'
    ),
];

if (isset($_POST['min_chunk_chars']) && $_POST['min_chunk_chars'] !== '') {
    $postFields['min_chunk_chars'] = (string) $_POST['min_chunk_chars'];
}

if (isset($_POST['max_chunk_chars']) && $_POST['max_chunk_chars'] !== '') {
    $postFields['max_chunk_chars'] = (string) $_POST['max_chunk_chars'];
}

$ch = curl_init($upstreamUrl);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $postFields,
    CURLOPT_HTTPHEADER => [
        'Accept: application/json',
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 600,
]);

$responseBody = curl_exec($ch);

if ($responseBody === false) {
    $error = curl_error($ch);
    curl_close($ch);
    http_response_code(502);
    echo json_encode([
        'message' => 'Upload dispatcher request failed',
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
