<?php
declare(strict_types=1);

require __DIR__ . '/access.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $user = regulation_search_current_user();
    if ($user === null || regulation_search_current_password() === '') {
        regulation_search_json_response(200, [
            'ok' => true,
            'authenticated' => false,
            'message' => 'Подключение ещё не выполнено.',
        ]);
    }

    regulation_search_json_response(200, [
        'ok' => true,
        'authenticated' => true,
        'message' => 'Сессия подключения активна.',
        'login' => $user['login'],
        'email' => $user['email'],
        'role' => $user['role'],
        'displayName' => $user['displayName'],
        'permissions' => $user['permissions'],
    ]);
}

if ($method === 'DELETE') {
    regulation_search_clear_session_user();
    regulation_search_json_response(200, [
        'ok' => true,
        'authenticated' => false,
        'message' => 'Подключение сброшено.',
    ]);
}

if ($method !== 'POST') {
    regulation_search_json_response(405, [
        'ok' => false,
        'message' => 'Method not allowed',
    ]);
}

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

$login = regulation_search_normalize_login((string) ($payload['login'] ?? $payload['email'] ?? ''));
$password = trim((string) ($payload['password'] ?? ''));

if ($login === '' || $password === '') {
    regulation_search_json_response(400, [
        'ok' => false,
        'error' => 'invalid_credentials',
        'message' => 'Введите логин и пароль.',
    ]);
}

$dispatcherResponse = regulation_search_request_json(regulation_search_dispatcher_url(), [
    'action' => 'authorize',
    'login' => $login,
    'password' => $password,
    'email' => $login,
]);

if ($dispatcherResponse['ok']) {
    $dispatcherPayload = json_decode((string) $dispatcherResponse['body'], true);
    if (is_array($dispatcherPayload) && !empty($dispatcherPayload['ok'])) {
        $user = regulation_search_store_session_user([
            'login' => $dispatcherPayload['login'] ?? $login,
            'email' => $dispatcherPayload['email'] ?? $login,
            'role' => $dispatcherPayload['role'] ?? 'viewer',
            'displayName' => $dispatcherPayload['displayName'] ?? $dispatcherPayload['display_name'] ?? $login,
            'permissions' => $dispatcherPayload['permissions'] ?? [],
        ], $password);

        regulation_search_json_response(200, [
            'ok' => true,
            'authenticated' => true,
            'message' => $dispatcherPayload['message'] ?? 'Доступ подтверждён.',
            'login' => $user['login'],
            'email' => $user['email'],
            'role' => $user['role'],
            'displayName' => $user['displayName'],
            'permissions' => $user['permissions'],
        ]);
    }
}

try {
    $user = regulation_search_authenticate_locally($login, $password);
} catch (RuntimeException $exception) {
    regulation_search_json_response(502, [
        'ok' => false,
        'error' => 'auth_source_unavailable',
        'message' => $exception->getMessage(),
    ]);
}

if ($user === null) {
    regulation_search_json_response(403, [
        'ok' => false,
        'error' => 'forbidden',
        'message' => 'Логин или пароль не совпадают с таблицей доступа.',
    ]);
}

$storedUser = regulation_search_store_session_user($user, $password);

regulation_search_json_response(200, [
    'ok' => true,
    'authenticated' => true,
    'message' => 'Доступ подтверждён.',
    'login' => $storedUser['login'],
    'email' => $storedUser['email'],
    'role' => $storedUser['role'],
    'displayName' => $storedUser['displayName'],
    'permissions' => $storedUser['permissions'],
]);
