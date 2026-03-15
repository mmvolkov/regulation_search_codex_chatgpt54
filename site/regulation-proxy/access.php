<?php

function regulation_search_json_response($statusCode, array $payload)
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function regulation_search_dispatcher_url()
{
    return 'https://plequeneluera.beget.app/webhook/regulation-search-dispatch';
}

function regulation_search_forwarded_headers(array $extra = array())
{
    $headers = $extra;

    $remoteIp = '';
    if (isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $remoteIp = trim((string) $_SERVER['HTTP_X_FORWARDED_FOR']);
    } elseif (isset($_SERVER['REMOTE_ADDR'])) {
        $remoteIp = trim((string) $_SERVER['REMOTE_ADDR']);
    }
    if ($remoteIp !== '') {
        $headers[] = 'X-Forwarded-For: ' . $remoteIp;
    }

    $realIp = isset($_SERVER['REMOTE_ADDR']) ? trim((string) $_SERVER['REMOTE_ADDR']) : '';
    if ($realIp !== '') {
        $headers[] = 'X-Real-IP: ' . $realIp;
    }

    $userAgent = isset($_SERVER['HTTP_USER_AGENT']) ? trim((string) $_SERVER['HTTP_USER_AGENT']) : '';
    if ($userAgent !== '') {
        $headers[] = 'User-Agent: ' . $userAgent;
    }

    return $headers;
}

function regulation_search_normalize_email($email)
{
    return strtolower(trim((string) $email));
}

function regulation_search_allowed_users()
{
    return [
        'volkovmm@outlook.com' => [
            'role' => 'admin',
            'displayName' => 'Admin Admin',
        ],
    ];
}

function regulation_search_resolve_user($email)
{
    $normalizedEmail = regulation_search_normalize_email($email);
    if ($normalizedEmail === '') {
        return null;
    }

    $users = regulation_search_allowed_users();
    if (!isset($users[$normalizedEmail])) {
        return null;
    }

    $record = $users[$normalizedEmail];
    $role = isset($record['role']) ? (string) $record['role'] : 'viewer';

    return [
        'email' => $normalizedEmail,
        'role' => $role,
        'displayName' => isset($record['displayName']) ? $record['displayName'] : null,
        'canUpload' => in_array($role, ['admin', 'editor'], true),
        'canManageCollection' => $role === 'admin',
    ];
}

function regulation_search_require_user($email, $needUpload = false, $needManageCollection = false)
{
    $user = regulation_search_resolve_user($email);
    if ($user === null) {
        regulation_search_json_response(403, [
            'ok' => false,
            'error' => 'forbidden',
            'message' => 'Доступ разрешён только пользователям из allowlist сайта.',
        ]);
    }

    if ($needManageCollection && !$user['canManageCollection']) {
        regulation_search_json_response(403, [
            'ok' => false,
            'error' => 'forbidden',
            'message' => 'Очистка коллекции разрешена только администратору.',
        ]);
    }

    if ($needUpload && !$user['canUpload']) {
        regulation_search_json_response(403, [
            'ok' => false,
            'error' => 'forbidden',
            'message' => 'Загрузка документов разрешена только редактору или администратору.',
        ]);
    }

    return $user;
}
