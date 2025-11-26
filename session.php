<?php
// session.php
session_start();
header('Content-Type: application/json');

// Set cache control headers to prevent caching
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$output = [];

if (isset($_SESSION['user_id'])) {
    $output['user'] = [
        'id' => (int)$_SESSION['user_id'],
        'name' => $_SESSION['user_name'] ?? '',
        'email' => $_SESSION['user_email'] ?? ''
    ];
} elseif (isset($_SESSION['store_id'])) {
    $output['store'] = [
        'id' => (int)$_SESSION['store_id'],
        'name' => $_SESSION['store_name'] ?? ''
    ];
} elseif (isset($_SESSION['admin_id'])) {
    $output['admin'] = [
        'id' => (int)$_SESSION['admin_id'],
        'username' => $_SESSION['admin_username'] ?? '',
        'role' => $_SESSION['admin_role'] ?? ''
    ];
} else {
    $output['status'] = 'not_logged_in';
}

echo json_encode($output);
?>