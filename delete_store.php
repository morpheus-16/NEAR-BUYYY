<?php
header('Content-Type: application/json');
session_start();
require_once 'db.php';

// only admin can call
if (!isset($_SESSION['admin_id'])) {
    echo json_encode(['status'=>'error','message'=>'Not logged in as admin.']);
    exit;
}

if (!isset($_GET['id'])) {
    echo json_encode(['status'=>'error','message'=>'Missing id']);
    exit;
}

$id = intval($_GET['id']);
if ($id <= 0) {
    echo json_encode(['status'=>'error','message'=>'Invalid id']);
    exit;
}

// Optionally fetch store name for logging / message
$storeName = '';
$storeRes = $mysqli->prepare("SELECT name FROM stores WHERE id = ? LIMIT 1");
$storeRes->bind_param("i", $id);
if ($storeRes->execute()) {
    $result = $storeRes->get_result();
    if ($result && $result->num_rows) {
        $storeName = $result->fetch_assoc()['name'];
    }
}
$storeRes->close();

// Use prepared statement to prevent SQL injection
$stmt = $mysqli->prepare("DELETE FROM stores WHERE id = ?");
$stmt->bind_param("i", $id);

if ($stmt->execute()) {
    echo json_encode(['status'=>'success','message'=>"Store deleted", 'store'=>$storeName]);
} else {
    echo json_encode(['status'=>'error','message'=>'DB error: '.$mysqli->error]);
}
$stmt->close();
?>