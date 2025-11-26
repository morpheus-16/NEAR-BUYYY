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

// Helper: verify password (plain text comparison)
function verify_password($provided, $stored) {
    return $provided === $stored;
}

// -------------------- USER REGISTRATION --------------------
if ($action === 'userRegister') {
    $name = trim($input['name'] ?? '');
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';
    $confirmPassword = $input['confirmPassword'] ?? '';

    // Validation
    if (empty($name) || empty($email) || empty($password)) {
        send(['status'=>'error','message'=>'All fields are required.']);
    }

    if ($password !== $confirmPassword) {
        send(['status'=>'error','message'=>'Passwords do not match.']);
    }

    if (strlen($password) < 6) {
        send(['status'=>'error','message'=>'Password must be at least 6 characters long.']);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        send(['status'=>'error','message'=>'Invalid email format.']);
    }

    // Check if email already exists
    $checkStmt = $mysqli->prepare("SELECT id FROM users WHERE email = ?");
    $checkStmt->bind_param('s', $email);
    $checkStmt->execute();
    $checkResult = $checkStmt->get_result();
    
    if ($checkResult && $checkResult->num_rows > 0) {
        send(['status'=>'error','message'=>'Email already registered.']);
    }
    $checkStmt->close();

    // Create user with plain text password
    $stmt = $mysqli->prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)");
    $stmt->bind_param('sss', $name, $email, $password);

    if ($stmt->execute()) {
        // Auto-login after registration
        $userId = $stmt->insert_id;
        session_regenerate_id(true);
        
        $_SESSION['user_id'] = (int)$userId;
        $_SESSION['user_name'] = $name;
        $_SESSION['user_email'] = $email;

        send(['status'=>'success','message'=>'Registration successful!', 'user'=>[
            'id'=> (int)$userId,
            'name'=> $name,
            'email'=> $email
        ]]);
    } else {
        send(['status'=>'error','message'=>'Registration failed. Please try again.']);
    }
    $stmt->close();
}

// -------------------- STORE REGISTRATION --------------------
if ($action === 'storeRegister') {
    $name = trim($input['name'] ?? '');
    $password = $input['password'] ?? '';
    $confirmPassword = $input['confirmPassword'] ?? '';
    $address = trim($input['address'] ?? '');
    $location = trim($input['location'] ?? '');
    $hours = trim($input['hours'] ?? '6:00 AM - 10:00 PM');

    // Validation
    if (empty($name) || empty($password) || empty($address) || empty($location)) {
        send(['status'=>'error','message'=>'Store name, address, location, and password are required.']);
    }

    if ($password !== $confirmPassword) {
        send(['status'=>'error','message'=>'Passwords do not match.']);
    }

    if (strlen($password) < 6) {
        send(['status'=>'error','message'=>'Password must be at least 6 characters long.']);
    }

    // Check if store name already exists (case-insensitive)
    $checkStmt = $mysqli->prepare("SELECT id FROM stores WHERE LOWER(name) = LOWER(?)");
    $checkStmt->bind_param('s', $name);
    $checkStmt->execute();
    $checkResult = $checkStmt->get_result();
    
    if ($checkResult && $checkResult->num_rows > 0) {
        send(['status'=>'error','message'=>'Store name already exists. Please choose a different name.']);
    }
    $checkStmt->close();

    // Create store with plain text password
    $stmt = $mysqli->prepare("INSERT INTO stores (name, password, address, location, hours, revenue, customers) VALUES (?, ?, ?, ?, ?, 0, 0)");
    $stmt->bind_param('sssss', $name, $password, $address, $location, $hours);

    if ($stmt->execute()) {
        // Auto-login after registration
        $storeId = $stmt->insert_id;
        session_regenerate_id(true);
        
        $_SESSION['store_id'] = (int)$storeId;
        $_SESSION['store_name'] = $name;
        $_SESSION['store_address'] = $address;
        $_SESSION['store_location'] = $location;
        $_SESSION['store_hours'] = $hours;
        $_SESSION['store_latitude'] = 0;
        $_SESSION['store_longitude'] = 0;
        $_SESSION['store_revenue'] = 0;
        $_SESSION['store_customers'] = 0;

        send(['status'=>'success','message'=>'Store registration successful!', 'store'=>[
            'id'=> (int)$storeId,
            'name'=> $name,
            'address'=> $address,
            'location'=> $location,
            'hours'=> $hours,
            'revenue'=> 0,
            'customers'=> 0
        ]]);
    } else {
        send(['status'=>'error','message'=>'Store registration failed. Please try again.']);
    }
    $stmt->close();
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