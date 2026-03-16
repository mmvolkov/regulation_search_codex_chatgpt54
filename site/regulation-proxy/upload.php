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

$user = regulation_search_require_session_user(true, false);

if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
    regulation_search_json_response(400, [
        'ok' => false,
        'message' => 'File is required',
    ]);
}

$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    regulation_search_json_response(400, [
        'ok' => false,
        'message' => 'Uploaded file is invalid',
        'errorCode' => $file['error'] ?? null,
    ]);
}

$preset = trim((string) ($_POST['preset'] ?? 'balanced'));
if ($preset === '') {
    $preset = 'balanced';
}

$multipartBody = [
    'action' => 'upload',
    'login' => $user['login'],
    'password' => regulation_search_current_password(),
    'email' => $user['email'],
    'preset' => $preset,
    'file_size_bytes' => (string) ($file['size'] ?? 0),
    'mime_type' => (string) ($file['type'] ?: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    'file_sha1' => sha1_file($file['tmp_name']) ?: '',
    'file' => new CURLFile(
        $file['tmp_name'],
        $file['type'] ?: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        $file['name'] ?: 'document.docx'
    ),
];

if (isset($_POST['min_chunk_chars']) && $_POST['min_chunk_chars'] !== '') {
    $multipartBody['min_chunk_chars'] = (string) $_POST['min_chunk_chars'];
}

if (isset($_POST['max_chunk_chars']) && $_POST['max_chunk_chars'] !== '') {
    $multipartBody['max_chunk_chars'] = (string) $_POST['max_chunk_chars'];
}

$dispatcherResponse = regulation_search_request_form(regulation_search_dispatcher_url(), $multipartBody, 600);
if ($dispatcherResponse['ok']) {
    regulation_search_passthrough_response($dispatcherResponse);
}

$fallbackBody = [
    'preset' => $preset,
    'file' => new CURLFile(
        $file['tmp_name'],
        $file['type'] ?: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        $file['name'] ?: 'document.docx'
    ),
];

if (isset($_POST['min_chunk_chars']) && $_POST['min_chunk_chars'] !== '') {
    $fallbackBody['min_chunk_chars'] = (string) $_POST['min_chunk_chars'];
}

if (isset($_POST['max_chunk_chars']) && $_POST['max_chunk_chars'] !== '') {
    $fallbackBody['max_chunk_chars'] = (string) $_POST['max_chunk_chars'];
}

$fallbackResponse = regulation_search_request_form(
    regulation_search_search_api_base_url() . '/upload',
    $fallbackBody,
    600
);

if (!$fallbackResponse['ok']) {
    $message = $dispatcherResponse['error'] !== ''
        ? 'Загрузка через dispatcher не выполнена: ' . $dispatcherResponse['error']
        : 'Загрузка не выполнена.';

    if ($dispatcherResponse['statusCode'] > 0 && $dispatcherResponse['body'] !== '') {
        $message = 'Dispatcher вернул HTTP ' . $dispatcherResponse['statusCode'] . '.';
    }

    if ($fallbackResponse['error'] !== '') {
        $message .= ' Fallback upload error: ' . $fallbackResponse['error'];
    } elseif ($fallbackResponse['statusCode'] > 0) {
        $message .= ' Fallback upload HTTP ' . $fallbackResponse['statusCode'] . '.';
    }

    regulation_search_json_response(502, [
        'ok' => false,
        'error' => 'upload_failed',
        'message' => $message,
    ]);
}

regulation_search_passthrough_response($fallbackResponse);
