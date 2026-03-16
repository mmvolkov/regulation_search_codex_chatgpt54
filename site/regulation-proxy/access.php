<?php
declare(strict_types=1);

const REGULATION_SEARCH_SESSION_KEY = 'regulation_search_user';

regulation_search_start_session();

function regulation_search_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    if (PHP_SAPI !== 'cli' && !headers_sent()) {
        session_name('regulation_search');
        session_set_cookie_params([
            'httponly' => true,
            'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
            'samesite' => 'Lax',
        ]);
    }

    session_start();
}

function regulation_search_json_response(int $statusCode, array $payload): void
{
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function regulation_search_dispatcher_url(): string
{
    $value = getenv('REGULATION_SEARCH_DISPATCHER_URL');
    return is_string($value) && trim($value) !== ''
        ? trim($value)
        : 'https://plequeneluera.beget.app/webhook/regulation-search-dispatch';
}

function regulation_search_search_api_base_url(): string
{
    $value = getenv('REGULATION_SEARCH_API_BASE_URL');
    return is_string($value) && trim($value) !== ''
        ? rtrim(trim($value), '/')
        : 'https://plequeneluera.beget.app/search-api/api';
}

function regulation_search_auth_sheet_csv_url(): string
{
    $value = getenv('REGULATION_SEARCH_AUTH_SHEET_CSV_URL');
    return is_string($value) && trim($value) !== ''
        ? trim($value)
        : 'https://docs.google.com/spreadsheets/d/1nXNh8lNqoGyQFzXFZ9uGMYvSwavq5E0GWe-chaQJTqY/gviz/tq?tqx=out:csv&sheet=authorized_users';
}

function regulation_search_forwarded_headers(array $extra = []): array
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

function regulation_search_normalize_login(?string $login): string
{
    return strtolower(trim((string) $login));
}

function regulation_search_normalize_email(?string $value): string
{
    return regulation_search_normalize_login($value);
}

function regulation_search_row_value(array $row, array $aliases): string
{
    $normalizedAliases = [];
    foreach ($aliases as $alias) {
        $normalizedAliases[] = regulation_search_normalize_login((string) $alias);
    }

    foreach ($row as $key => $value) {
        if (in_array(regulation_search_normalize_login((string) $key), $normalizedAliases, true)) {
            return trim((string) $value);
        }
    }

    return '';
}

function regulation_search_parse_csv_rows(string $csv): array
{
    $handle = fopen('php://temp', 'r+');
    if ($handle === false) {
        throw new RuntimeException('Не удалось подготовить CSV-буфер.');
    }

    fwrite($handle, $csv);
    rewind($handle);

    $headers = fgetcsv($handle);
    if ($headers === false || $headers === null) {
        fclose($handle);
        throw new RuntimeException('Лист authorized_users пуст или недоступен.');
    }

    $normalizedHeaders = array_map(static function ($value): string {
        return trim((string) $value);
    }, $headers);

    $rows = [];
    while (($data = fgetcsv($handle)) !== false) {
        $isEmpty = true;
        foreach ($data as $cell) {
            if (trim((string) $cell) !== '') {
                $isEmpty = false;
                break;
            }
        }

        if ($isEmpty) {
            continue;
        }

        $row = [];
        foreach ($normalizedHeaders as $index => $header) {
            $row[$header] = isset($data[$index]) ? trim((string) $data[$index]) : '';
        }
        $rows[] = $row;
    }

    fclose($handle);
    return $rows;
}

function regulation_search_fetch_authorized_users(): array
{
    static $cachedRows = null;

    if ($cachedRows !== null) {
        return $cachedRows;
    }

    $ch = curl_init(regulation_search_auth_sheet_csv_url());
    curl_setopt_array($ch, [
        CURLOPT_HTTPGET => true,
        CURLOPT_HTTPHEADER => [
            'Accept: text/csv,application/octet-stream;q=0.8,*/*;q=0.5',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_FOLLOWLOCATION => true,
    ]);

    $responseBody = curl_exec($ch);
    if ($responseBody === false) {
        $error = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('Не удалось прочитать Google Sheets CSV: ' . $error);
    }

    $statusCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($statusCode < 200 || $statusCode >= 300) {
        throw new RuntimeException('Google Sheets CSV вернул HTTP ' . $statusCode . '.');
    }

    $rows = regulation_search_parse_csv_rows((string) $responseBody);
    $normalized = [];
    foreach ($rows as $row) {
        $login = regulation_search_normalize_login(regulation_search_row_value($row, [
            'login',
            'username',
            'user',
            'email',
            'e-mail',
        ]));

        if ($login === '') {
            continue;
        }

        $password = regulation_search_row_value($row, [
            'password',
            'pass',
            'pwd',
        ]);

        $displayName = regulation_search_row_value($row, [
            'display_name',
            'display name',
            'name',
            'full_name',
            'full name',
        ]);
        if ($displayName === '') {
            $displayName = $login;
        }

        $role = regulation_search_normalize_login(regulation_search_row_value($row, [
            'role',
            'user_role',
            'access_role',
        ]));
        if (!in_array($role, ['admin', 'editor', 'viewer'], true)) {
            $role = 'admin';
        }

        $activeRaw = regulation_search_normalize_login(regulation_search_row_value($row, [
            'active',
            'enabled',
            'is_active',
            'allowed',
            'status',
            'access',
        ]));
        $isActive = !in_array($activeRaw, ['0', 'false', 'no', 'n', 'inactive', 'disabled', 'blocked', 'denied'], true);

        $normalized[$login] = [
            'login' => $login,
            'password' => $password,
            'role' => $role,
            'displayName' => $displayName,
            'isActive' => $isActive,
        ];
    }

    $cachedRows = $normalized;
    return $cachedRows;
}

function regulation_search_password_matches(string $expectedPassword, string $providedPassword): bool
{
    if ($expectedPassword === '' || $providedPassword === '') {
        return false;
    }

    if (preg_match('/^\$2y\$|^\$argon2/i', $expectedPassword) === 1) {
        return password_verify($providedPassword, $expectedPassword);
    }

    return hash_equals($expectedPassword, $providedPassword);
}

function regulation_search_authenticate_locally(string $login, string $password): ?array
{
    $normalizedLogin = regulation_search_normalize_login($login);
    if ($normalizedLogin === '' || trim($password) === '') {
        return null;
    }

    $users = regulation_search_fetch_authorized_users();
    if (!isset($users[$normalizedLogin])) {
        return null;
    }

    $record = $users[$normalizedLogin];
    if (!$record['isActive']) {
        return null;
    }

    if (!regulation_search_password_matches((string) $record['password'], trim($password))) {
        return null;
    }

    return [
        'login' => $record['login'],
        'email' => $record['login'],
        'role' => $record['role'],
        'displayName' => $record['displayName'],
        'canUpload' => in_array($record['role'], ['admin', 'editor'], true),
        'canManageCollection' => $record['role'] === 'admin',
    ];
}

function regulation_search_permissions(array $user): array
{
    return [
        'search' => true,
        'upload' => !empty($user['canUpload']),
        'collection_status' => true,
        'collection_clear' => !empty($user['canManageCollection']),
        'feedback' => true,
    ];
}

function regulation_search_store_session_user(array $user, string $password): array
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        regulation_search_start_session();
    }

    if (PHP_SAPI !== 'cli' && !headers_sent()) {
        session_regenerate_id(true);
    }

    $_SESSION[REGULATION_SEARCH_SESSION_KEY] = [
        'login' => regulation_search_normalize_login((string) ($user['login'] ?? $user['email'] ?? '')),
        'email' => regulation_search_normalize_login((string) ($user['email'] ?? $user['login'] ?? '')),
        'role' => (string) ($user['role'] ?? 'viewer'),
        'displayName' => trim((string) ($user['displayName'] ?? $user['display_name'] ?? '')),
        'canUpload' => !empty($user['canUpload']) || (!empty($user['permissions']['upload'])),
        'canManageCollection' => !empty($user['canManageCollection']) || (!empty($user['permissions']['collection_clear'])),
        'password' => trim($password),
    ];

    return regulation_search_current_user() ?? [];
}

function regulation_search_clear_session_user(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        regulation_search_start_session();
    }

    unset($_SESSION[REGULATION_SEARCH_SESSION_KEY]);
}

function regulation_search_current_user(): ?array
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        regulation_search_start_session();
    }

    $record = $_SESSION[REGULATION_SEARCH_SESSION_KEY] ?? null;
    if (!is_array($record)) {
        return null;
    }

    $login = regulation_search_normalize_login((string) ($record['login'] ?? ''));
    if ($login === '') {
        return null;
    }

    $role = (string) ($record['role'] ?? 'viewer');
    $user = [
        'login' => $login,
        'email' => regulation_search_normalize_login((string) ($record['email'] ?? $login)),
        'role' => $role,
        'displayName' => trim((string) ($record['displayName'] ?? '')) ?: $login,
        'canUpload' => !empty($record['canUpload']) || in_array($role, ['admin', 'editor'], true),
        'canManageCollection' => !empty($record['canManageCollection']) || $role === 'admin',
    ];
    $user['permissions'] = regulation_search_permissions($user);

    return $user;
}

function regulation_search_current_password(): string
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        regulation_search_start_session();
    }

    $record = $_SESSION[REGULATION_SEARCH_SESSION_KEY] ?? null;
    if (!is_array($record)) {
        return '';
    }

    return trim((string) ($record['password'] ?? ''));
}

function regulation_search_require_session_user(bool $needUpload = false, bool $needManageCollection = false): array
{
    $user = regulation_search_current_user();
    if ($user === null || regulation_search_current_password() === '') {
        regulation_search_json_response(401, [
            'ok' => false,
            'error' => 'unauthorized',
            'message' => 'Сначала подключитесь по логину и паролю.',
        ]);
    }

    if ($needManageCollection && empty($user['canManageCollection'])) {
        regulation_search_json_response(403, [
            'ok' => false,
            'error' => 'forbidden',
            'message' => 'Очистка коллекции разрешена только администратору.',
        ]);
    }

    if ($needUpload && empty($user['canUpload'])) {
        regulation_search_json_response(403, [
            'ok' => false,
            'error' => 'forbidden',
            'message' => 'Загрузка документов разрешена только редактору или администратору.',
        ]);
    }

    return $user;
}

function regulation_search_curl_request(string $url, array $options): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, $options + [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
    ]);

    $responseBody = curl_exec($ch);
    if ($responseBody === false) {
        $error = curl_error($ch);
        curl_close($ch);
        return [
            'ok' => false,
            'statusCode' => 0,
            'contentType' => 'application/json; charset=utf-8',
            'body' => '',
            'error' => $error,
        ];
    }

    $statusCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $contentType = (string) (curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'application/json; charset=utf-8');
    curl_close($ch);

    return [
        'ok' => $statusCode >= 200 && $statusCode < 300,
        'statusCode' => $statusCode,
        'contentType' => $contentType,
        'body' => (string) $responseBody,
        'error' => '',
    ];
}

function regulation_search_request_json(string $url, array $payload, int $timeout = 180): array
{
    return regulation_search_curl_request($url, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => regulation_search_forwarded_headers([
            'Accept: application/json',
            'Content-Type: application/json',
        ]),
        CURLOPT_TIMEOUT => $timeout,
    ]);
}

function regulation_search_request_form(string $url, array $payload, int $timeout = 180): array
{
    return regulation_search_curl_request($url, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => regulation_search_forwarded_headers([
            'Accept: application/json',
        ]),
        CURLOPT_TIMEOUT => $timeout,
    ]);
}

function regulation_search_request_method(string $url, string $method, int $timeout = 180): array
{
    return regulation_search_curl_request($url, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => regulation_search_forwarded_headers([
            'Accept: application/json',
        ]),
        CURLOPT_TIMEOUT => $timeout,
    ]);
}

function regulation_search_passthrough_response(array $response): void
{
    if (!headers_sent() && !empty($response['contentType'])) {
        header('Content-Type: ' . $response['contentType']);
    }
    http_response_code((int) ($response['statusCode'] ?? 200));
    echo (string) ($response['body'] ?? '');
    exit;
}
