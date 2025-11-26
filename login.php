<?php
// login.php
header('Content-Type: application/json');
session_start();
require_once 'db.php';

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $input['action'] ?? '';

// Helper to send JSON responses
function send($arr) {
    echo json_encode($arr);
    exit;
}

// Helper: verify password (supports hashed and legacy plain-text)
function verify_password($provided, $stored) {
    if (!$stored) return false;
    if (strpos($stored, '$2y$') === 0 || strpos($stored, '$2a$') === 0 || strpos($stored, '$argon2') === 0) {
        return password_verify($provided, $stored);
    }
    return $stored === $provided; // Fixed: Use === for exact comparison instead of hash_equals for plain text
}

// -------------------- USER LOGIN --------------------
if ($action === 'userLogin') {
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';

    if ($email === '' || $password === '') {
        send(['status'=>'error','message'=>'Missing email or password.']);
    }

    $stmt = $mysqli->prepare("SELECT id, name, email, password FROM users WHERE email = ? LIMIT 1");
    if (!$stmt) {
        send(['status'=>'error','message'=>'Database preparation error.']);
    }
    
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $res = $stmt->get_result();

    if ($res && $res->num_rows) {
        $u = $res->fetch_assoc();
        if (verify_password($password, $u['password'])) {
            // Regenerate session ID for security
            session_regenerate_id(true);
            
            $_SESSION['user_id'] = (int)$u['id'];
            $_SESSION['user_name'] = $u['name'];
            $_SESSION['user_email'] = $u['email'];

            send(['status'=>'success','user'=>[
                'id'=> (int)$u['id'],
                'name'=> $u['name'],
                'email'=> $u['email']
            ]]);
        }
    }
    send(['status'=>'error','message'=>'Invalid email or password.']);
}

// -------------------- STORE LOGIN --------------------
if ($action === 'storeLogin') {
    $storeName = trim($input['storeName'] ?? '');
    $password = $input['password'] ?? '';

    if ($storeName === '' || $password === '') {
        send(['status'=>'error','message'=>'Missing store name or password.']);
    }

    // Case-insensitive search
    $stmt = $mysqli->prepare("SELECT * FROM stores WHERE LOWER(name) = LOWER(?) LIMIT 1");
    if (!$stmt) {
        send(['status'=>'error','message'=>'Database preparation error.']);
    }
    
    $stmt->bind_param('s', $storeName);
    $stmt->execute();
    $res = $stmt->get_result();

    if ($res && $res->num_rows) {
        $s = $res->fetch_assoc();
        if (verify_password($password, $s['password'])) {
            // Regenerate session ID for security
            session_regenerate_id(true);
            
            // Set session for store
            $_SESSION['store_id'] = (int)$s['id'];
            $_SESSION['store_name'] = $s['name'];
            $_SESSION['store_address'] = $s['address'] ?? '';
            $_SESSION['store_location'] = $s['location'] ?? '';
            $_SESSION['store_hours'] = $s['hours'] ?? '';
            $_SESSION['store_latitude'] = isset($s['latitude']) ? floatval($s['latitude']) : 0;
            $_SESSION['store_longitude'] = isset($s['longitude']) ? floatval($s['longitude']) : 0;
            $_SESSION['store_revenue'] = isset($s['revenue']) ? floatval($s['revenue']) : 0;
            $_SESSION['store_customers'] = isset($s['customers']) ? (int)$s['customers'] : 0;

            send(['status'=>'success','store'=>[
                'id'=> (int)$s['id'],
                'name'=>$s['name'],
                'address'=>$s['address'] ?? '',
                'location'=>$s['location'] ?? '',
                'hours'=>$s['hours'] ?? '',
                'latitude'=> isset($s['latitude']) ? floatval($s['latitude']) : 0,
                'longitude'=> isset($s['longitude']) ? floatval($s['longitude']) : 0,
                'revenue'=> isset($s['revenue']) ? floatval($s['revenue']) : 0,
                'customers'=> isset($s['customers']) ? (int)$s['customers'] : 0
            ]]);
        }
    }
    send(['status'=>'error','message'=>'Invalid store name or password.']);
}

// -------------------- ADMIN LOGIN --------------------
if ($action === 'adminLogin') {
    $username = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';

    if ($username === '' || $password === '') {
        send(['status'=>'error','message'=>'Missing admin username or password.']);
    }

    $stmt = $mysqli->prepare("SELECT id, username, password, role FROM admins WHERE username = ? LIMIT 1");
    if (!$stmt) {
        send(['status'=>'error','message'=>'Database preparation error.']);
    }
    
    $stmt->bind_param('s', $username);
    $stmt->execute();
    $res = $stmt->get_result();

    if ($res && $res->num_rows) {
        $a = $res->fetch_assoc();
        if (verify_password($password, $a['password'])) {
            // Regenerate session ID for security
            session_regenerate_id(true);
            
            $_SESSION['admin_id'] = (int)$a['id'];
            $_SESSION['admin_username'] = $a['username'];
            $_SESSION['admin_role'] = $a['role'] ?? 'admin';

            send(['status'=>'success','admin'=>[
                'id'=> (int)$a['id'],
                'username'=>$a['username'],
                'role'=>$a['role'] ?? 'admin'
            ]]);
        }
    }
    send(['status'=>'error','message'=>'Invalid admin username or password.']);
}

// -------------------- UNSUPPORTED ACTION --------------------
send(['status'=>'error','message'=>'Unsupported action.']);
?>