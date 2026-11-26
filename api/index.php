<?php
// Servidor del sitio en un hosting con PHP y MySQL. Atiende /api/... (el
// archivo .htaccess de la raíz envía aquí esas direcciones) con las mismas
// rutas y respuestas que worker.js en Cloudflare:
//
//   GET    /api/menu/<id>          menú (público)
//   PUT    /api/menu/<id>          guardar (dueño o superadministrador)
//   DELETE /api/menu/<id>          eliminar (superadministrador)
//   GET    /api/menus              lista de menús (superadministrador)
//   POST   /api/login              { email, password } -> { token, user }
//   GET    /api/me                 usuario de la sesión
//   POST   /api/password           { current, next } cambia la propia contraseña
//   GET    /api/users              cuentas (superadministrador)
//   PUT    /api/users/<correo>     { password } crea la cuenta o cambia su contraseña
//   DELETE /api/users/<correo>     elimina la cuenta
//   POST   /api/import             primera carga de datos (ver migrar.html)
//   GET    /api/health             comprueba PHP y la conexión con MySQL
//
// La configuración (datos de MySQL y correo del superadministrador) está en
// api/config.php. Las tablas se crean solas la primera vez.
// Compatible con PHP 7.2 o superior.

const SESSION_DAYS = 30;
const MAX_MENU_BYTES = 900000;
const PBKDF2_ITERATIONS = 100000;
const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 10;

class HttpError extends Exception
{
    public $status;

    public function __construct($status, $message)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

function send_json($data, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: authorization, content-type, x-http-method-override');
    header('Access-Control-Allow-Methods: GET, PUT, POST, DELETE, OPTIONS');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function now_ms()
{
    return (int) round(microtime(true) * 1000);
}

// ---------- Configuración y base de datos ----------

function config()
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) throw new HttpError(503, 'Falta el archivo api/config.php con los datos de MySQL.');
        $config = require $file;
    }
    return $config;
}

function db()
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = config();
    if (empty($c['db_name']) || empty($c['db_user'])) throw new HttpError(503, 'Completa los datos de MySQL en api/config.php.');
    try {
        $host = empty($c['db_host']) ? 'localhost' : $c['db_host'];
        $pdo = new PDO("mysql:host=$host;dbname={$c['db_name']};charset=utf8mb4", $c['db_user'], isset($c['db_pass']) ? $c['db_pass'] : '', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        error_log('menu-digital: ' . $e->getMessage());
        throw new HttpError(503, 'No se pudo conectar con MySQL. Revisa los datos de api/config.php.');
    }
    $pdo->exec('CREATE TABLE IF NOT EXISTS menus (slug VARCHAR(60) NOT NULL PRIMARY KEY, data MEDIUMTEXT NOT NULL, updated_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $pdo->exec('CREATE TABLE IF NOT EXISTS users (email VARCHAR(120) NOT NULL PRIMARY KEY, salt VARCHAR(64) NOT NULL, hash VARCHAR(64) NOT NULL, is_super TINYINT NOT NULL DEFAULT 0, failed INT NOT NULL DEFAULT 0, locked_until BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $pdo->exec('CREATE TABLE IF NOT EXISTS settings (name VARCHAR(64) NOT NULL PRIMARY KEY, value TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    return $pdo;
}

function query($sql, $params = [])
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function get_setting($name)
{
    $value = query('SELECT value FROM settings WHERE name = ?', [$name])->fetchColumn();
    return $value === false ? null : $value;
}

// Los menús se manejan como objetos (no arrays) para que {} siga siendo {}.
function read_menu($slug)
{
    $data = query('SELECT data FROM menus WHERE slug = ?', [$slug])->fetchColumn();
    return $data === false ? null : json_decode($data);
}

function write_menu($slug, $menu)
{
    query(
        'INSERT INTO menus (slug, data, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)',
        [$slug, json_encode($menu, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), now_ms()]
    );
}

function read_user($email)
{
    $row = query('SELECT * FROM users WHERE email = ?', [$email])->fetch();
    return $row ?: null;
}

function count_users()
{
    return (int) query('SELECT COUNT(*) FROM users')->fetchColumn();
}

// ---------- Contraseñas y sesiones ----------

function b64url_encode($bytes)
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function b64url_decode($text)
{
    return base64_decode(strtr($text, '-_', '+/'));
}

function hash_password($password, $salt)
{
    return b64url_encode(hash_pbkdf2('sha256', $password, b64url_decode($salt), PBKDF2_ITERATIONS, 32, true));
}

function save_user($email, $password, $isSuper)
{
    $salt = b64url_encode(random_bytes(16));
    $hash = hash_password($password, $salt);
    query(
        'INSERT INTO users (email, salt, hash, is_super, created_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE salt = VALUES(salt), hash = VALUES(hash), failed = 0, locked_until = 0',
        [$email, $salt, $hash, $isSuper ? 1 : 0, now_ms()]
    );
    return $hash;
}

// La clave con la que se firman las sesiones se genera sola la primera vez.
function session_key()
{
    $secret = get_setting('session_secret');
    if (!$secret) {
        query('INSERT IGNORE INTO settings (name, value) VALUES (?, ?)', ['session_secret', b64url_encode(random_bytes(32))]);
        $secret = get_setting('session_secret');
    }
    return b64url_decode($secret);
}

function sign($payload)
{
    return b64url_encode(hash_hmac('sha256', $payload, session_key(), true));
}

// La sesión lleva una marca de la contraseña: al cambiarla, las sesiones
// anteriores dejan de valer.
function create_token($email, $hash)
{
    $payload = b64url_encode(json_encode(['e' => $email, 'x' => now_ms() + SESSION_DAYS * 86400000, 'p' => substr($hash, 0, 10)]));
    return $payload . '.' . sign($payload);
}

function auth_header()
{
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $key) {
        if (!empty($_SERVER[$key])) return $_SERVER[$key];
    }
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strtolower($name) === 'authorization') return $value;
        }
    }
    return '';
}

function current_user()
{
    $header = auth_header();
    $token = strpos($header, 'Bearer ') === 0 ? substr($header, 7) : '';
    $parts = explode('.', $token);
    if (count($parts) !== 2 || $parts[0] === '' || $parts[1] === '') return null;
    if (!hash_equals(sign($parts[0]), $parts[1])) return null;
    $data = json_decode(b64url_decode($parts[0]), true);
    if (!is_array($data) || empty($data['e']) || !isset($data['x']) || $data['x'] < now_ms()) return null;
    $row = read_user($data['e']);
    if (!$row || substr($row['hash'], 0, 10) !== $data['p']) return null;
    return ['email' => $row['email'], 'isSuper' => (int) $row['is_super'] === 1];
}

function require_user()
{
    $user = current_user();
    if (!$user) throw new HttpError(401, 'La sesión no es válida o ha caducado. Vuelve a entrar.');
    return $user;
}

function require_super()
{
    $user = require_user();
    if (!$user['isSuper']) throw new HttpError(403, 'Esta acción solo la puede hacer el superadministrador.');
    return $user;
}

// ---------- Validación ----------

function clean_email($value)
{
    $email = strtolower(trim((string) $value));
    if (strlen($email) > 120 || !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) throw new HttpError(400, 'El correo no es válido.');
    return $email;
}

function text_length($text)
{
    return function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
}

function check_password($value)
{
    $password = (string) $value;
    if (text_length($password) < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
    if (text_length($password) > 200) throw new HttpError(400, 'La contraseña es demasiado larga.');
    return $password;
}

// $assoc = false devuelve objetos (para menús); true, arrays.
function read_body($assoc = true)
{
    $text = file_get_contents('php://input');
    if (strlen($text) > MAX_MENU_BYTES) throw new HttpError(413, 'El menú ocupa demasiado; prueba con un logo más ligero.');
    $data = json_decode($text, $assoc);
    if ($data === null) throw new HttpError(400, 'La petición no es válida.');
    return $data;
}

function check_menu($menu)
{
    $bad = new HttpError(400, 'El menú no tiene un formato válido.');
    if (!is_object($menu)) throw $bad;
    if (!isset($menu->name) || !is_string($menu->name) || trim($menu->name) === '' || text_length($menu->name) > 100) throw $bad;
    if (!isset($menu->categories) || !is_array($menu->categories) || count($menu->categories) > 100) throw $bad;
    foreach ($menu->categories as $category) {
        if (!is_object($category) || !isset($category->name) || !is_string($category->name)) throw $bad;
        if (!isset($category->items) || !is_array($category->items) || count($category->items) > 300) throw $bad;
    }
    if (!isset($menu->owners) || !is_array($menu->owners)) $menu->owners = [];
    if (count($menu->owners) > 20) throw $bad;
    $owners = [];
    foreach ($menu->owners as $owner) {
        if (!is_string($owner)) throw $bad;
        $owner = strtolower(trim($owner));
        if ($owner !== '') $owners[] = $owner;
    }
    $menu->owners = $owners;
}

function menu_owners($menu)
{
    return isset($menu->owners) && is_array($menu->owners) ? $menu->owners : [];
}

// ---------- Rutas ----------

function login()
{
    $body = read_body();
    $email = clean_email(isset($body['email']) ? $body['email'] : '');
    $password = (string) (isset($body['password']) ? $body['password'] : '');
    $wrong = new HttpError(401, 'Correo o contraseña incorrectos.');
    $row = read_user($email);
    if (!$row) {
        hash_password($password, 'AAAAAAAAAAAAAAAAAAAAAA'); // mismo tiempo de respuesta exista o no la cuenta
        throw $wrong;
    }
    if ((int) $row['locked_until'] > now_ms()) throw new HttpError(429, 'Demasiados intentos. Espera ' . LOCK_MINUTES . ' minutos.');
    if (!hash_equals($row['hash'], hash_password($password, $row['salt']))) {
        $failed = (int) $row['failed'] + 1;
        $lock = $failed >= MAX_FAILED_LOGINS ? now_ms() + LOCK_MINUTES * 60000 : 0;
        query('UPDATE users SET failed = ?, locked_until = ? WHERE email = ?', [$lock ? 0 : $failed, $lock, $email]);
        throw $wrong;
    }
    if ((int) $row['failed']) query('UPDATE users SET failed = 0 WHERE email = ?', [$email]);
    send_json(['token' => create_token($email, $row['hash']), 'user' => ['email' => $email, 'isSuper' => (int) $row['is_super'] === 1]]);
}

// Primera carga de datos en un sitio sin cuentas (la hace migrar.html).
// Solo la acepta el correo de config.php ('admin_email'). Si los datos traen
// esa cuenta con su contraseña cifrada, la contraseña escrita debe
// coincidir; si no, esa contraseña pasa a ser la suya.
function import_data()
{
    $body = read_body(false);
    if (count_users() > 0) throw new HttpError(409, 'Este sitio ya tiene cuentas: la importación solo se puede hacer una vez.');
    $c = config();
    $admin = strtolower(trim(isset($c['admin_email']) ? $c['admin_email'] : ''));
    if ($admin === '') throw new HttpError(503, "Escribe tu correo en 'admin_email' dentro de api/config.php.");
    $email = clean_email(isset($body->email) ? $body->email : '');
    $password = check_password(isset($body->password) ? $body->password : '');
    if ($email !== $admin) throw new HttpError(403, "Solo puede importar el correo indicado en 'admin_email' de api/config.php.");
    $menus = isset($body->menus) && is_array($body->menus) ? $body->menus : [];
    $users = isset($body->users) && is_array($body->users) ? $body->users : [];

    foreach ($users as $u) {
        if (is_object($u) && isset($u->email, $u->salt, $u->hash) && strtolower($u->email) === $email) {
            if (!hash_equals((string) $u->hash, hash_password($password, (string) $u->salt))) throw new HttpError(403, 'La contraseña no coincide con la del sitio anterior.');
        }
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        foreach ($menus as $m) {
            if (!is_object($m) || !isset($m->slug, $m->menu) || !preg_match('/^[a-z0-9-]{1,60}$/', (string) $m->slug)) continue;
            check_menu($m->menu);
            write_menu($m->slug, $m->menu);
        }
        $imported = [];
        foreach ($users as $u) {
            if (!is_object($u) || !isset($u->email, $u->salt, $u->hash)) continue;
            $userEmail = clean_email($u->email);
            query(
                'INSERT INTO users (email, salt, hash, is_super, created_at) VALUES (?, ?, ?, ?, ?)',
                [$userEmail, (string) $u->salt, (string) $u->hash, (!empty($u->isSuper) || $userEmail === $email) ? 1 : 0, isset($u->createdAt) ? (int) $u->createdAt : now_ms()]
            );
            $imported[] = $userEmail;
        }
        if (!in_array($email, $imported, true)) save_user($email, $password, true);
        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
    send_json(['ok' => true, 'menus' => count($menus), 'users' => max(1, count($imported))]);
}

function route($method, $path)
{
    if ($path === '/health' && $method === 'GET') {
        db();
        send_json(['ok' => true, 'php' => PHP_VERSION, 'accounts' => count_users()]);
    }

    if ($path === '/login' && $method === 'POST') login();

    if ($path === '/import' && $method === 'POST') import_data();

    if ($path === '/me' && $method === 'GET') send_json(['user' => require_user()]);

    if ($path === '/password' && $method === 'POST') {
        $user = require_user();
        $body = read_body();
        $row = read_user($user['email']);
        if (!hash_equals($row['hash'], hash_password((string) (isset($body['current']) ? $body['current'] : ''), $row['salt']))) {
            throw new HttpError(403, 'La contraseña actual no es correcta.');
        }
        $hash = save_user($user['email'], check_password(isset($body['next']) ? $body['next'] : ''), $user['isSuper']);
        send_json(['token' => create_token($user['email'], $hash)]);
    }

    if ($path === '/menus' && $method === 'GET') {
        require_super();
        $menus = [];
        foreach (query('SELECT slug, data FROM menus ORDER BY slug')->fetchAll() as $r) {
            $data = json_decode($r['data']);
            $menus[] = ['slug' => $r['slug'], 'name' => (isset($data->name) && $data->name !== '') ? $data->name : $r['slug']];
        }
        send_json(['menus' => $menus]);
    }

    if ($path === '/users' && $method === 'GET') {
        require_super();
        $users = [];
        foreach (query('SELECT email, is_super FROM users ORDER BY is_super DESC, email')->fetchAll() as $r) {
            $users[] = ['email' => $r['email'], 'isSuper' => (int) $r['is_super'] === 1];
        }
        send_json(['users' => $users]);
    }

    if (preg_match('#^/users/([^/]+)$#', $path, $m)) {
        $admin = require_super();
        $email = clean_email(rawurldecode($m[1]));
        $existing = read_user($email);
        if ($method === 'PUT') {
            $body = read_body();
            save_user($email, check_password(isset($body['password']) ? $body['password'] : ''), $existing ? (int) $existing['is_super'] === 1 : false);
            send_json(['ok' => true, 'created' => !$existing]);
        }
        if ($method === 'DELETE') {
            if ($email === $admin['email']) throw new HttpError(400, 'No puedes eliminar tu propia cuenta.');
            query('DELETE FROM users WHERE email = ?', [$email]);
            send_json(['ok' => true]);
        }
    }

    if (preg_match('#^/menu/([a-z0-9-]{1,60})$#', $path, $m)) {
        $slug = $m[1];
        if ($method === 'GET') {
            $menu = read_menu($slug);
            if (!$menu) send_json(['error' => 'No existe ese menú.'], 404);
            // Los correos de los dueños no son públicos: solo los recibe quien
            // puede editar este menú.
            $viewer = current_user();
            $mayEdit = $viewer && ($viewer['isSuper'] || in_array($viewer['email'], menu_owners($menu), true));
            if (!$mayEdit) unset($menu->owners);
            send_json(['menu' => $menu]);
        }
        if ($method === 'PUT') {
            $user = require_user();
            $menu = read_body(false);
            $existing = read_menu($slug);
            // Si la petición no trae la lista de dueños, se conserva la guardada.
            if (is_object($menu) && (!isset($menu->owners) || !is_array($menu->owners)) && $existing) $menu->owners = menu_owners($existing);
            check_menu($menu);
            if (!$existing && !$user['isSuper']) throw new HttpError(403, 'Solo el superadministrador puede crear menús.');
            if ($existing && !$user['isSuper']) {
                if (!in_array($user['email'], menu_owners($existing), true)) throw new HttpError(403, 'Tu cuenta no tiene permiso sobre este menú.');
                $menu->owners = menu_owners($existing); // un dueño no decide quién más edita
            }
            $menu->updatedAt = now_ms();
            write_menu($slug, $menu);
            send_json(['ok' => true]);
        }
        if ($method === 'DELETE') {
            require_super();
            query('DELETE FROM menus WHERE slug = ?', [$slug]);
            send_json(['ok' => true]);
        }
    }

    throw new HttpError(404, 'No existe esa dirección.');
}

// ---------- Arranque ----------

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: authorization, content-type, x-http-method-override');
    header('Access-Control-Allow-Methods: GET, PUT, POST, DELETE, OPTIONS');
    header('Access-Control-Max-Age: 86400');
    http_response_code(204);
    exit;
}
// Algunos hostings bloquean PUT y DELETE: la página los envía como POST con
// esta cabecera.
$override = strtoupper(isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']) ? $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] : '');
if ($method === 'POST' && ($override === 'PUT' || $override === 'DELETE')) $method = $override;

// .htaccess reescribe /api/<ruta> a api/index.php?path=<ruta>.
if (isset($_GET['path'])) {
    $path = (string) $_GET['path'];
} else {
    $uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
    $at = strpos($uri, '/api/');
    $path = $at === false ? '' : substr($uri, $at + 5);
    if (strpos($path, 'index.php') === 0) $path = substr($path, 9);
}
$path = '/' . ltrim($path, '/');

try {
    route($method, $path);
} catch (HttpError $e) {
    send_json(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log('menu-digital: ' . $e->getMessage());
    send_json(['error' => 'Error interno del servidor.'], 500);
}
