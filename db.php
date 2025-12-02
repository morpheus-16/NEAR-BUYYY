<?php
// db.php
// Single place for DB connection. Keep this included at top of API files.

$DB_HOST = 'localhost';
$DB_USER = 'root';      // change if needed
$DB_PASS = '';          // change to your password
$DB_NAME = 'nearbuy';

$mysqli = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);

// better error reporting for development (disable in production)
if ($mysqli->connect_errno) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['status'=>'error','message'=>'DB connection failed: '.$mysqli->connect_error]);
    exit;
}

$mysqli->set_charset('utf8mb4');