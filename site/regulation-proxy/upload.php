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

if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
    http_response_code(400);
    echo json_encode([
        'message' => 'File is required',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$file = $_FILES['file'];
$fileError = isset($file['error']) ? $file['error'] : UPLOAD_ERR_NO_FILE;
if ($fileError !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode([
        'message' => 'Uploaded file is invalid',
        'errorCode' => isset($file['error']) ? $file['error'] : null,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$preset = isset($_POST['preset']) ? $_POST['preset'] : 'balanced';
$fileSizeBytes = isset($file['size']) ? $file['size'] : 0;
$fileType = !empty($file['type']) ? $file['type'] : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
$fileName = !empty($file['name']) ? $file['name'] : 'document.docx';

$postFields = [
    'action' => 'upload',
    'email' => regulation_search_normalize_email(isset($_POST['email']) ? (string) $_POST['email'] : ''),
    'preset' => $preset,
    'file_size_bytes' => (string) $fileSizeBytes,
    'mime_type' => (string) $fileType,
    'file_sha1' => sha1_file($file['tmp_name']) ?: '',
    'file' => new CURLFile(
        $file['tmp_name'],
        $fileType,
        $fileName
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
    CURLOPT_HTTPHEADER => regulation_search_forwarded_headers([
        'Accept: application/json',
    ]),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 600,
]);

$responseBody = curl_exec($ch);

if ($responseBody === false) {
    $error = curl_error($ch);
    curl_close($ch);
    regulation_search_json_response(502, [
        'message' => 'Upload API request failed',
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
