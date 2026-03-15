<?php
declare(strict_types=1);

function regulation_search_json_response(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function regulation_search_normalize_email(?string $email): string
{
    return strtolower(trim((string) $email));
}

function regulation_search_allowed_users(): array
{
    return [
        'volkovmm@outlook.com' => [
            'role' => 'admin',
            'displayName' => 'Admin Admin',
        ],
    ];
}

function regulation_search_resolve_user(?string $email): ?array
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
    $role = (string) ($record['role'] ?? 'viewer');

    return [
        'email' => $normalizedEmail,
        'role' => $role,
        'displayName' => $record['displayName'] ?? null,
        'canUpload' => in_array($role, ['admin', 'editor'], true),
        'canManageCollection' => $role === 'admin',
    ];
}

function regulation_search_require_user(?string $email, bool $needUpload = false, bool $needManageCollection = false): array
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
