<?php
// store.php
header('Content-Type: application/json');
session_start();
require_once 'db.php';

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $input['action'] ?? '';

if ($action === 'getStoreData') {
    if (!isset($_SESSION['store_id'])) { echo json_encode(['status'=>'error','message'=>'Not logged in as store.']); exit; }
    $store_id = intval($_SESSION['store_id']);
    $sres = $mysqli->prepare("SELECT * FROM stores WHERE id = ? LIMIT 1");
    $sres->bind_param('i', $store_id);
    $sres->execute();
    $r = $sres->get_result();
    if (!$r || $r->num_rows === 0) { echo json_encode(['status'=>'error','message'=>'Store not found.']); exit; }
    $s = $r->fetch_assoc();
    $sres->close();

    $pres = $mysqli->prepare("SELECT id, name, sku, price, category, stock, supplier FROM products WHERE store_id = ? ORDER BY name ASC");
    $pres->bind_param('i', $store_id);
    $inventory = [];
    if ($pres->execute()) {
        $resP = $pres->get_result();
        while ($p = $resP->fetch_assoc()) {
            $inventory[] = [
                'id'=> (int)$p['id'],
                'name'=> $p['name'],
                'sku'=> $p['sku'],
                'price'=> (float)$p['price'],
                'category'=> $p['category'],
                'stock'=> (int)$p['stock'],
                'supplier'=> $p['supplier']
            ];
        }
    }
    $pres->close();

    echo json_encode([
        'status'=>'success',
        'store'=>[
            'id'=> (int)$s['id'],
            'name'=> $s['name'],
            'address'=> $s['address'],
            'location'=> $s['location'],
            'hours'=> $s['hours'],
            'latitude'=> isset($s['latitude']) ? floatval($s['latitude']) : 0,
            'longitude'=> isset($s['longitude']) ? floatval($s['longitude']) : 0,
            'revenue'=> (float)($s['revenue'] ?? 0),
            'customers'=> (int)($s['customers'] ?? 0),
            'inventory'=> $inventory
        ]
    ]);
    exit;
}

if ($action === 'updateStoreSettings') {
    if (!isset($_SESSION['store_id'])) { echo json_encode(['status'=>'error','message'=>'Not logged in as store.']); exit; }
    $store_id = intval($_SESSION['store_id']);
    $settings = $input['settings'] ?? null;
    if (!$settings) { echo json_encode(['status'=>'error','message'=>'No settings provided.']); exit; }

    $address = $settings['address'] ?? '';
    $location = $settings['location'] ?? '';
    $hours = $settings['hours'] ?? null;
    $latitude = isset($settings['latitude']) && $settings['latitude'] !== '' ? floatval($settings['latitude']) : null;
    $longitude = isset($settings['longitude']) && $settings['longitude'] !== '' ? floatval($settings['longitude']) : null;

    // FIXED: Simplified NULL handling using prepared statements properly
    $sql = "UPDATE stores SET address = ?, location = ?, hours = ?, latitude = ?, longitude = ? WHERE id = ?";
    $stmt = $mysqli->prepare($sql);
    
    if ($stmt === false) {
        echo json_encode(['status'=>'error','message'=>'DB prepare error: '.$mysqli->error]);
        exit;
    }
    
    // Bind parameters - use correct types and handle NULL values properly
    $stmt->bind_param('sssddi', 
        $address, 
        $location, 
        $hours, 
        $latitude, 
        $longitude, 
        $store_id
    );

    if ($stmt->execute()) {
        echo json_encode(['status'=>'success','message'=>'Store settings updated.']);
    } else {
        echo json_encode(['status'=>'error','message'=>'DB error: '.$mysqli->error]);
    }
    $stmt->close();
    exit;
}

echo json_encode(['status'=>'error','message'=>'Unsupported action.']);
?>