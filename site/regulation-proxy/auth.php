<?php
declare(strict_types=1);

require __DIR__ . '/access.php';

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

$user = regulation_search_resolve_user($payload['email'] ?? '');
if ($user === null) {
    regulation_search_json_response(403, [
        'ok' => false,
        'error' => 'forbidden',
        'message' => 'Пользователь не найден в allowlist сайта.',
    ]);
}

regulation_search_json_response(200, [
    'ok' => true,
    'message' => 'Доступ подтверждён.',
    'email' => $user['email'],
    'role' => $user['role'],
    'displayName' => $user['displayName'],
    'permissions' => [
        'search' => true,
        'upload' => $user['canUpload'],
        'collection_status' => true,
        'collection_clear' => $user['canManageCollection'],
    ],
]);
