<?php
header('Content-Type: application/json');
session_start();
require_once 'db.php';

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? '';

function toFloat($v){ return is_numeric($v) ? floatval($v) : 0; }
function toInt($v){ return is_numeric($v) ? intval($v) : 0; }

if ($action === 'searchProducts') {
    $query = $mysqli->real_escape_string($input['query'] ?? '');
    $filter = $mysqli->real_escape_string($input['filter'] ?? 'all');
    $userLat = isset($input['userLat']) ? floatval($input['userLat']) : null;
    $userLng = isset($input['userLng']) ? floatval($input['userLng']) : null;
    $radius = isset($input['radius']) ? floatval($input['radius']) : null;

    error_log("🎯 SEARCH REQUEST - Query: '$query', Filter: '$filter', UserLat: $userLat, UserLng: $userLng, Radius: $radius");

    $where = "1=1";
    if ($query !== '') {
        $q = $mysqli->real_escape_string($query);
        $where .= " AND (LOWER(p.name) LIKE '%$q%' OR LOWER(p.sku) LIKE '%$q%' OR LOWER(p.category) LIKE '%$q%')";
    }
    if ($filter !== 'all') {
        $filterEsc = $mysqli->real_escape_string($filter);
        $where .= " AND p.category = '$filterEsc'";
    }

    // Add radius filtering if coordinates and radius are provided
    $distanceSelect = '';
    $distanceWhere = '';
    $orderBy = 'p.name ASC';
    
    if ($userLat && $userLng && $radius) {
        // FIXED: Proper Haversine formula for MySQL
        $distanceSQL = "(
            6371 * acos(
                cos(radians($userLat)) * 
                cos(radians(s.latitude)) * 
                cos(radians(s.longitude) - radians($userLng)) + 
                sin(radians($userLat)) * 
                sin(radians(s.latitude))
            )
        )";
        
        $distanceSelect = ", $distanceSQL AS distance";
        $distanceWhere = " AND $distanceSQL <= $radius AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL AND s.latitude != 0 AND s.longitude != 0";
        $orderBy = 'distance ASC, p.name ASC';
        
        error_log("📍 RADIUS FILTER APPLIED - Distance SQL calculated");
    } else {
        error_log("📍 RADIUS FILTER NOT APPLIED");
    }

    // Build the final SQL query
    $sql = "SELECT p.*, s.name AS store, s.address, s.hours, s.latitude, s.longitude $distanceSelect
            FROM products p 
            JOIN stores s ON p.store_id = s.id
            WHERE $where $distanceWhere
            ORDER BY $orderBy
            LIMIT 200";
    
    error_log("📝 EXECUTING SQL: " . $sql);
    
    $res = $mysqli->query($sql);
    if (!$res) {
        error_log("❌ MYSQL ERROR: " . $mysqli->error);
        echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $mysqli->error]);
        exit;
    }
    
    $out = [];
    $totalResults = 0;
    while ($row = $res->fetch_assoc()) {
        $productData = [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'sku' => $row['sku'],
            'price' => (float)$row['price'],
            'category' => $row['category'],
            'stock' => (int)$row['stock'],
            'supplier' => $row['supplier'],
            'store' => $row['store'],
            'address' => $row['address'],
            'hours' => $row['hours'],
            'latitude' => isset($row['latitude']) ? floatval($row['latitude']) : null,
            'longitude' => isset($row['longitude']) ? floatval($row['longitude']) : null
        ];
        
        // Include distance if calculated
        if (isset($row['distance'])) {
            $productData['distance'] = (float)$row['distance'];
            error_log("   📍 Product '{$row['name']}' - Store: '{$row['store']}' - Distance: {$row['distance']} km");
        }
        
        $out[] = $productData;
        $totalResults++;
    }
    
    error_log("📦 SEARCH COMPLETE: $totalResults products found");
    echo json_encode($out);
    exit;
}

//missing favorites functions that are called from JavaScript
if ($action === 'checkFavorite') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'Not logged in']);
        exit;
    }
    
    $userId = (int)$_SESSION['user_id'];
    $productId = toInt($input['productId'] ?? 0);
    
    $stmt = $mysqli->prepare("SELECT id FROM favorites WHERE user_id = ? AND product_id = ?");
    $stmt->bind_param("ii", $userId, $productId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $isFavorite = $result && $result->num_rows > 0;
    echo json_encode(['status' => 'success', 'isFavorite' => $isFavorite]);
    exit;
}

if ($action === 'addFavorite') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'Not logged in']);
        exit;
    }
    
    $userId = (int)$_SESSION['user_id'];
    $productId = toInt($input['productId'] ?? 0);
    
    // Check if already favorited
    $checkStmt = $mysqli->prepare("SELECT id FROM favorites WHERE user_id = ? AND product_id = ?");
    $checkStmt->bind_param("ii", $userId, $productId);
    $checkStmt->execute();
    $checkResult = $checkStmt->get_result();
    
    if ($checkResult && $checkResult->num_rows > 0) {
        echo json_encode(['status' => 'success', 'message' => 'Already in favorites']);
        exit;
    }
    
    $stmt = $mysqli->prepare("INSERT INTO favorites (user_id, product_id) VALUES (?, ?)");
    $stmt->bind_param("ii", $userId, $productId);
    
    if ($stmt->execute()) {
        echo json_encode(['status' => 'success', 'message' => 'Added to favorites']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Failed to add favorite']);
    }
    exit;
}

if ($action === 'removeFavorite') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'Not logged in']);
        exit;
    }
    
    $userId = (int)$_SESSION['user_id'];
    $productId = toInt($input['productId'] ?? 0);
    
    $stmt = $mysqli->prepare("DELETE FROM favorites WHERE user_id = ? AND product_id = ?");
    $stmt->bind_param("ii", $userId, $productId);
    
    if ($stmt->execute()) {
        echo json_encode(['status' => 'success', 'message' => 'Removed from favorites']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Failed to remove favorite']);
    }
    exit;
}

if ($action === 'getFavorites') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'Not logged in']);
        exit;
    }
    
    $userId = (int)$_SESSION['user_id'];
    
    $sql = "SELECT p.*, s.name AS store, s.address, s.hours, s.latitude, s.longitude 
            FROM favorites f 
            JOIN products p ON f.product_id = p.id 
            JOIN stores s ON p.store_id = s.id 
            WHERE f.user_id = ? 
            ORDER BY p.name ASC";
    
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $favorites = [];
    while ($row = $result->fetch_assoc()) {
        $favorites[] = [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'sku' => $row['sku'],
            'price' => (float)$row['price'],
            'category' => $row['category'],
            'stock' => (int)$row['stock'],
            'supplier' => $row['supplier'],
            'store' => $row['store'],
            'address' => $row['address'],
            'hours' => $row['hours'],
            'latitude' => isset($row['latitude']) ? floatval($row['latitude']) : null,
            'longitude' => isset($row['longitude']) ? floatval($row['longitude']) : null
        ];
    }
    
    echo json_encode($favorites);
    exit;
}

/* Product management for store owners (requires session store_id) */
if ($action === 'addProduct') {
    if (!isset($_SESSION['store_id'])) { echo json_encode(['status'=>'error','message'=>'Not logged in as store.']); exit; }
    $store_id = intval($_SESSION['store_id']);
    $p = $input['product'] ?? null;
    if (!$p) { echo json_encode(['status'=>'error','message'=>'No product data.']); exit; }

    $name = $mysqli->real_escape_string($p['name'] ?? '');
    $sku = $mysqli->real_escape_string($p['sku'] ?? '');
    $price = toFloat($p['price'] ?? 0);
    $category = $mysqli->real_escape_string($p['category'] ?? '');
    $stock = toInt($p['stock'] ?? 0);
    $supplier = $mysqli->real_escape_string($p['supplier'] ?? '');
    // optionally allow coordinates & address
    $latitude = is_numeric($p['latitude'] ?? null) ? floatval($p['latitude']) : 'NULL';
    $longitude = is_numeric($p['longitude'] ?? null) ? floatval($p['longitude']) : 'NULL';
    $address = $mysqli->real_escape_string($p['address'] ?? '');
    $hours = $mysqli->real_escape_string($p['hours'] ?? '');

    $sql = "INSERT INTO products (store_id,name,sku,price,category,stock,supplier,latitude,longitude,address,hours)
            VALUES ($store_id,'$name','$sku',$price,'$category',$stock,'$supplier',".($latitude==='NULL'?'NULL':$latitude).",".($longitude==='NULL'?'NULL':$longitude).",'$address','$hours')";

    if ($mysqli->query($sql)) {
        echo json_encode(['status'=>'success','message'=>'Product added.']);
    } else {
        echo json_encode(['status'=>'error','message'=>'DB error: '.$mysqli->error]);
    }
    exit;
}

if ($action === 'editProduct') {
    if (!isset($_SESSION['store_id'])) { echo json_encode(['status'=>'error','message'=>'Not logged in as store.']); exit; }
    $store_id = intval($_SESSION['store_id']);
    $p = $input['product'] ?? null;
    if (!$p || !isset($p['id'])) { echo json_encode(['status'=>'error','message'=>'No product id.']); exit; }
    $id = toInt($p['id']);

    // ensure this product belongs to the signed-in store
    $check = $mysqli->query("SELECT id FROM products WHERE id = $id AND store_id = $store_id");
    if (!$check || $check->num_rows === 0) { echo json_encode(['status'=>'error','message'=>'Product not found or permission denied.']); exit; }

    $name = $mysqli->real_escape_string($p['name'] ?? '');
    $sku = $mysqli->real_escape_string($p['sku'] ?? '');
    $price = toFloat($p['price'] ?? 0);
    $category = $mysqli->real_escape_string($p['category'] ?? '');
    $stock = toInt($p['stock'] ?? 0);
    $supplier = $mysqli->real_escape_string($p['supplier'] ?? '');

    $sql = "UPDATE products SET
            name = '$name',
            sku = '$sku',
            price = $price,
            category = '$category',
            stock = $stock,
            supplier = '$supplier'
            WHERE id = $id AND store_id = $store_id";

    if ($mysqli->query($sql)) {
        echo json_encode(['status'=>'success','message'=>'Product updated.']);
    } else {
        echo json_encode(['status'=>'error','message'=>'DB error: '.$mysqli->error]);
    }
    exit;
}

if ($action === 'deleteProduct') {
    if (!isset($_SESSION['store_id'])) { echo json_encode(['status'=>'error','message'=>'Not logged in as store.']); exit; }
    $store_id = intval($_SESSION['store_id']);
    $productId = toInt($input['productId'] ?? 0);
    if ($productId <= 0) { echo json_encode(['status'=>'error','message'=>'Invalid product id.']); exit; }

    // check ownership
    $check = $mysqli->query("SELECT id FROM products WHERE id = $productId AND store_id = $store_id");
    if (!$check || $check->num_rows === 0) { echo json_encode(['status'=>'error','message'=>'Product not found or permission denied.']); exit; }

    if ($mysqli->query("DELETE FROM products WHERE id = $productId")) {
        echo json_encode(['status'=>'success','message'=>'Product deleted.']);
    } else {
        echo json_encode(['status'=>'error','message'=>'DB error: '.$mysqli->error]);
    }
    exit;
}

echo json_encode(['status'=>'error','message'=>'Unsupported action.']);
?>