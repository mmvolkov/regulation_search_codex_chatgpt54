<?php
declare(strict_types=1);

require __DIR__ . '/access.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'DELETE') {
    regulation_search_json_response(405, [
        'ok' => false,
        'message' => 'Method not allowed',
    ]);
}

$user = regulation_search_require_session_user(false, $method === 'DELETE');

$dispatcherResponse = regulation_search_request_json(regulation_search_dispatcher_url(), [
    'action' => $method === 'DELETE' ? 'collection_clear' : 'collection_status',
    'login' => $user['login'],
    'password' => regulation_search_current_password(),
    'email' => $user['email'],
]);
if ($dispatcherResponse['ok']) {
    regulation_search_passthrough_response($dispatcherResponse);
}

$fallbackResponse = regulation_search_request_method(
    regulation_search_search_api_base_url() . '/collection',
    $method
);

if (!$fallbackResponse['ok']) {
    $message = $dispatcherResponse['error'] !== ''
        ? 'Операция collection через dispatcher не выполнена: ' . $dispatcherResponse['error']
        : 'Операция collection не выполнена.';

    if ($dispatcherResponse['statusCode'] > 0 && $dispatcherResponse['body'] !== '') {
        $message = 'Dispatcher вернул HTTP ' . $dispatcherResponse['statusCode'] . '.';
    }

    if ($fallbackResponse['error'] !== '') {
        $message .= ' Fallback collection error: ' . $fallbackResponse['error'];
    } elseif ($fallbackResponse['statusCode'] > 0) {
        $message .= ' Fallback collection HTTP ' . $fallbackResponse['statusCode'] . '.';
    }

    regulation_search_json_response(502, [
        'ok' => false,
        'error' => 'collection_failed',
        'message' => $message,
    ]);
}

regulation_search_passthrough_response($fallbackResponse);
