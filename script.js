let map; // Leaflet map instance
let routingControl = null;
let storeLat = null, storeLng = null; // for directions
let currentUser = null;
let currentStore = null;
let currentAdmin = null;
let currentFilter = "all";
let userLocation = null; // Store user's GPS location
let radiusFilterEnabled = false;
let radiusDistanceValue = 5; // Default 5km

/* ---------- Helper functions ---------- */
async function apiPost(url, body) {
    try {
        const res = await fetch(url, {
            method: 'POST',
            credentials: 'include', // important for PHP session
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch (err) {
        console.error('API error', err);
        return { status: 'error', message: 'Network or server error' };
    }
}

/* ---------- Helper to check favorite status ---------- */
async function isFavorite(productId) {
    if (!currentUser) return false;
    const resp = await apiPost('products.php', { action: 'checkFavorite', productId });
    return resp && resp.status === 'success' && resp.isFavorite === true;
}

/* ---------- Radius Filter Functions ---------- */
function toggleRadiusFilter() {
    const checkbox = document.getElementById('radiusFilter');
    radiusFilterEnabled = checkbox.checked;
    
    console.log('🔘 Radius filter toggled:', radiusFilterEnabled);
    
    if (radiusFilterEnabled) {
        // Request location permission when enabling radius filter
        requestUserLocation();
    } else {
        updateRadiusStatus('Radius filter disabled');
        // Refresh search to show all results
        if (document.getElementById('searchResults') && !document.getElementById('searchResults').classList.contains('hidden')) {
            searchProducts();
        }
    }
}

function updateRadiusFilter() {
    const select = document.getElementById('radiusDistance');
    radiusDistanceValue = parseInt(select.value);
    
    console.log('📏 Radius distance updated:', radiusDistanceValue + 'km');
    
    if (radiusFilterEnabled && userLocation) {
        updateRadiusStatus(`Filtering stores within ${radiusDistanceValue} km`);
        // Refresh search with new radius
        if (document.getElementById('searchResults') && !document.getElementById('searchResults').classList.contains('hidden')) {
            searchProducts();
        }
    }
}

function requestUserLocation() {
    if (!navigator.geolocation) {
        updateRadiusStatus('Geolocation not supported by your browser');
        document.getElementById('radiusFilter').checked = false;
        radiusFilterEnabled = false;
        return;
    }

    updateRadiusStatus('Getting your location...');

    navigator.geolocation.getCurrentPosition(
        (position) => {
            userLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
            updateRadiusStatus(`Location found! Filtering within ${radiusDistanceValue} km`);
            console.log('📍 User location obtained:', userLocation);
            
            // Refresh search if we have results showing
            if (document.getElementById('searchResults') && !document.getElementById('searchResults').classList.contains('hidden')) {
                searchProducts();
            }
        },
        (error) => {
            let errorMessage = 'Unable to get your location. ';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage += 'Please enable location permissions in your browser settings.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage += 'Location information is unavailable.';
                    break;
                case error.TIMEOUT:
                    errorMessage += 'Location request timed out.';
                    break;
                default:
                    errorMessage += 'An unknown error occurred.';
                    break;
            }
            updateRadiusStatus(errorMessage);
            document.getElementById('radiusFilter').checked = false;
            radiusFilterEnabled = false;
            console.error('📍 Location error:', error);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );
}

function updateRadiusStatus(message) {
    const statusElement = document.getElementById('radiusStatus');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

// Haversine formula to calculate distance between two coordinates in kilometers
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance;
}

/* ---------- Hamburger Menu Toggle ---------- */
function toggleDropdownMenu() {
    const dropdownMenu = document.getElementById('dropdownMenu');
    if (dropdownMenu) {
        dropdownMenu.classList.toggle('show');
        // Update aria-expanded for accessibility
        const menuBtn = document.getElementById('menuBtn');
        if (menuBtn) {
            menuBtn.setAttribute('aria-expanded', dropdownMenu.classList.contains('show'));
        }
    }
}

function closeDropdownMenu() {
    const dropdownMenu = document.getElementById('dropdownMenu');
    if (dropdownMenu) {
        dropdownMenu.classList.remove('show');
        // Update aria-expanded
        const menuBtn = document.getElementById('menuBtn');
        if (menuBtn) {
            menuBtn.setAttribute('aria-expanded', 'false');
        }
    }
}

/* ---------- Map ---------- */
function initializeMap() {
    if (map) return;
    // Ensure map div exists
    const el = document.getElementById('map');
    if (!el) {
        console.warn('Map container (#map) not found');
        return;
    }
    map = L.map('map').setView([7.8308, 123.4350], 13); // default center for Pagadian City
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
}

function openMapModal(lat, lng, storeDetails) {
    // Parse storeDetails if it's a string (from template injection)
    if (typeof storeDetails === 'string') {
        try {
            storeDetails = JSON.parse(storeDetails);
        } catch (e) {
            console.warn('Failed to parse storeDetails:', e);
            storeDetails = {};
        }
    }

    // FIXED: Better coordinate validation
    let finalLat = Number(storeDetails?.latitude || lat);
    let finalLng = Number(storeDetails?.longitude || lng);

    // Validate coordinates - use default if invalid
    if (!isFinite(finalLat) || !isFinite(finalLng) || Math.abs(finalLat) > 90 || Math.abs(finalLng) > 180) {
        console.warn('Invalid coordinates, using default location');
        finalLat = 7.8308; // Default latitude for Pagadian City
        finalLng = 123.4350; // Default longitude for Pagadian City
    }

    // Ensure store details has basic info
    storeDetails = storeDetails || {};
    storeDetails.name = storeDetails.name || 'Unknown Store';
    storeDetails.address = storeDetails.address || 'No address available';
    storeDetails.hours = storeDetails.hours || 'No hours available';

    // Show map modal
    document.getElementById('mapModal').classList.remove('hidden');

    // Initialize map if not already done
    if (!map) {
        initializeMap();
    }

    // Update map after modal is visible to prevent sizing issues
    setTimeout(() => {
        try {
            map.invalidateSize();
        } catch (e) {
            console.warn('Map invalidateSize failed:', e);
        }

        console.log("🗺️ Mapping coordinates:", finalLat, finalLng, storeDetails);

        // Set map view and add marker
        map.setView([finalLat, finalLng], 15); // Increased zoom level for better visibility

        if (window.currentMarker) {
            map.removeLayer(window.currentMarker);
        }

        window.currentMarker = L.marker([finalLat, finalLng]).addTo(map)
            .bindPopup(`<b>${escapeHtml(storeDetails?.name || 'Store')}</b><br>${escapeHtml(storeDetails?.address || '')}`)
            .openPopup();

        // Update store details in modal
        document.getElementById('storeDetails').innerHTML = `
            <p><strong>${escapeHtml(storeDetails?.name || 'Unknown Store')}</strong></p>
            <p>${escapeHtml(storeDetails?.address || 'No address available')}</p>
            <p>Hours: ${escapeHtml(storeDetails?.hours || 'No hours available')}</p>
        `;

        // Store coordinates for directions
        storeLat = finalLat;
        storeLng = finalLng;
        clearDirections();
    }, 150);
}

/* ---------- Directions ---------- */
function getDirections() {
    if (!navigator.geolocation) {
        alert('Geolocation not supported by browser.');
        return;
    }
    if (storeLat == null || storeLng == null) {
        alert('Store location not available.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;

            if (!map) initializeMap();

            if (routingControl) {
                map.removeControl(routingControl);
                routingControl = null;
            }

            document.getElementById('directions').innerHTML = '';

            routingControl = L.Routing.control({
                waypoints: [
                    L.latLng(userLat, userLng),
                    L.latLng(storeLat, storeLng)
                ],
                routeWhileDragging: true,
                lineOptions: { styles: [{ weight: 4 }] },
                show: true,
                addWaypoints: false,
                fitSelectedRoutes: true,
                showAlternatives: false,
                createMarker: function() { return null; },
                instructionsContainer: document.getElementById('directions')
            }).addTo(map);

            document.getElementById('clearDirectionsBtn').classList.remove('hidden');
        },
        (err) => {
            console.error('Geolocation error:', err);
            alert('Unable to retrieve your location. Enable location services and try again.');
        },
        {
            enableHighAccuracy: true,   // ← HIGH accuracy
            timeout: 10000,             // 10 seconds
            maximumAge: 0               // don't use cached location
        }
    );
}

function clearDirections() {
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }
    document.getElementById('clearDirectionsBtn').classList.add('hidden');
    document.getElementById('directions').innerHTML = '';
}

/* ---------- Navigation / UI helpers ---------- */
function hideAllPages() {
    const pages = ['homePage', 'userLoginPage', 'adminLoginPage', 'customerPage', 'storeOwnerDashboard', 'adminDashboard', 'aboutPage', 'userProfileModal', 'mapModal', 'storeOwnerLogin'];
    pages.forEach(page => {
        const el = document.getElementById(page);
        if (el) el.classList.add('hidden');
    });
}

function showHomePage() {
    hideAllPages();
    const el = document.getElementById('homePage');
    if (el) el.classList.remove('hidden');
    updateUserProfileVisibility();
    closeDropdownMenu();
}

function showCustomerPage() {
    hideAllPages();
    document.getElementById('customerPage').classList.remove('hidden');
    updateUserProfileVisibility();
    closeDropdownMenu();
}

function showUserLogin() {
    hideAllPages();
    document.getElementById('userLoginPage').classList.remove('hidden');
    updateUserProfileVisibility();
    closeDropdownMenu();
}

function showStoreOwnerLogin() {
    hideAllPages();
    document.getElementById('storeOwnerLogin').classList.remove('hidden');
    updateUserProfileVisibility();
    closeDropdownMenu();
}

function showAdminLogin() {
    hideAllPages();
    document.getElementById('adminLoginPage').classList.remove('hidden');
    updateUserProfileVisibility();
    closeDropdownMenu();
}

function showAboutPage() {
    hideAllPages();
    document.getElementById('aboutPage').classList.remove('hidden');
    updateUserProfileVisibility();
    closeDropdownMenu();
}

/* ---------- User Profile Visibility Management ---------- */
function updateUserProfileVisibility() {
    const userProfileSection = document.getElementById('userProfileSection');
    if (userProfileSection) {
        if (currentUser) {
            userProfileSection.classList.remove('hidden');
        } else {
            userProfileSection.classList.add('hidden');
        }
    }
}

/* ---------- Escaping helper ---------- */
function escapeHtml(unsafe) {
    if (!unsafe && unsafe !== 0) return '';
    return String(unsafe)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

/* ---------- Search & render products (now use backend) ---------- */
async function searchProducts() {
    const query = (document.getElementById('searchInput')?.value || '').trim();
    document.getElementById('searchResults').classList.remove('hidden');
    const productList = document.getElementById('productList');
    const bestPriceSection = document.getElementById('bestPriceSection');
    productList.innerHTML = '<p class="text-center text-gray-600">Searching...</p>';
    if (bestPriceSection) {
        bestPriceSection.innerHTML = '<p class="text-center text-gray-600">Finding best price...</p>';
    }

    // DEBUG: Check if radius filter is working
    console.log('🔍 Radius Filter Status:', {
        enabled: radiusFilterEnabled,
        userLocation: userLocation,
        distance: radiusDistanceValue
    });

    // Prepare request body with radius filter data
    const body = { 
        action: 'searchProducts', 
        query: query, 
        filter: currentFilter || 'all' 
    };

    // Add radius filter parameters if enabled and location is available
    if (radiusFilterEnabled && userLocation) {
        body.userLat = userLocation.latitude;
        body.userLng = userLocation.longitude;
        body.radius = radiusDistanceValue;
        console.log('📍 Sending location to server:', {
            latitude: body.userLat,
            longitude: body.userLng,
            radius: body.radius + 'km'
        });
    } else {
        console.log('📍 Radius filter disabled or no location available');
    }

    console.log('📤 Sending request to server:', body);

    const resp = await apiPost('products.php', body);
    
    // DEBUG: Check what the server returned
    console.log('📦 Server response:', resp);
    console.log('📊 Number of products returned:', resp ? resp.length : 0);
    
    if (!resp) {
        productList.innerHTML = '<p class="text-center text-red-600">Server error.</p>';
        if (bestPriceSection) {
            bestPriceSection.innerHTML = '<p class="text-center text-red-600">Server error.</p>';
        }
        return;
    }

    // resp is expected to be an array of products (already filtered by server)
    if (Array.isArray(resp) && resp.length > 0) {
        // Render product list
        productList.innerHTML = '';
        
        // Log distances for debugging
        if (radiusFilterEnabled && userLocation) {
            console.log('📍 Distances of returned products:');
            resp.forEach(product => {
                if (product.latitude && product.longitude) {
                    const distance = calculateDistance(
                        userLocation.latitude,
                        userLocation.longitude,
                        product.latitude,
                        product.longitude
                    );
                    console.log(`   ${product.name} - ${distance.toFixed(2)} km - Store: ${product.store}`);
                }
            });
        }
        
        for (const product of resp) {
            const isFav = await isFavorite(product.id);
            const lat = product.latitude || 0;
            const lng = product.longitude || 0;
            const storeNameEsc = escapeHtml(product.store || product.store_name || '');
            
            // Calculate distance for display
            let distanceInfo = '';
            if (radiusFilterEnabled && userLocation && product.latitude && product.longitude) {
                const distance = calculateDistance(
                    userLocation.latitude,
                    userLocation.longitude,
                    product.latitude,
                    product.longitude
                );
                distanceInfo = `<p class="text-green-600 font-semibold">📍 ${distance.toFixed(1)} km away</p>`;
            }

            productList.innerHTML += `
                <div class="bg-white p-6 rounded-xl border border-gray-200 flex justify-between items-center">
                    <div>
                        <h4 class="text-lg font-bold">${escapeHtml(product.name)}</h4>
                        <p class="text-gray-600">Price: ₱${parseFloat(product.price || 0).toFixed(2)}</p>
                        <p class="text-gray-600">Category: ${escapeHtml(product.category)}</p>
                        <p class="text-gray-600">Store: ${storeNameEsc}</p>
                        ${distanceInfo}
                    </div>
                    <div class="space-x-2">
                        <button onclick="addToFavorites(${product.id})" class="px-4 py-2 bg-${isFav ? 'red' : 'pink'}-600 text-white rounded-lg hover:bg-${isFav ? 'red' : 'pink'}-700">${isFav ? '❤️ Remove from Favorites' : '🤍 Add to Favorites'}</button>
                        <button onclick='openMapModal(${Number(lat) || 0}, ${Number(lng) || 0}, ${JSON.stringify({ id: product.store_id || product.storeId || null, name: product.store || product.store_name, address: product.address, hours: product.hours, latitude: product.latitude, longitude: product.longitude })})' class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">📍 View Location</button>
                    </div>
                </div>
            `;
        }

        // Find and render best price product
        if (bestPriceSection) {
            const validProducts = resp.filter(p => p.price && parseFloat(p.price) > 0);
            if (validProducts.length > 0) {
                const bestPriceProduct = validProducts.reduce((min, p) => parseFloat(p.price) < parseFloat(min.price) ? p : min);
                const lat = bestPriceProduct.latitude || 0;
                const lng = bestPriceProduct.longitude || 0;
                const storeNameEsc = escapeHtml(bestPriceProduct.store || bestPriceProduct.store_name || '');
                
                // Calculate distance for best price product
                let bestPriceDistanceInfo = '';
                if (radiusFilterEnabled && userLocation && bestPriceProduct.latitude && bestPriceProduct.longitude) {
                    const distance = calculateDistance(
                        userLocation.latitude,
                        userLocation.longitude,
                        bestPriceProduct.latitude,
                        bestPriceProduct.longitude
                    );
                    bestPriceDistanceInfo = `<p class="text-green-700 font-semibold">📍 ${distance.toFixed(1)} km away</p>`;
                }

                bestPriceSection.innerHTML = `
                    <div class="bg-gradient-to-r from-green-100 to-green-200 p-6 rounded-xl border border-green-300 mb-6">
                        <h3 class="text-xl font-bold text-green-800 mb-4">Best Price Deal${radiusFilterEnabled ? ' (In Your Area)' : ''}</h3>
                        <div class="flex justify-between items-center">
                            <div>
                                <h4 class="text-lg font-semibold">${escapeHtml(bestPriceProduct.name)}</h4>
                                <p class="text-green-700 font-bold">Price: ₱${parseFloat(bestPriceProduct.price).toFixed(2)}</p>
                                <p class="text-gray-600">Category: ${escapeHtml(bestPriceProduct.category)}</p>
                                <p class="text-gray-600">Store: ${storeNameEsc}</p>
                                ${bestPriceDistanceInfo}
                            </div>
                            <button onclick='openMapModal(${Number(lat) || 0}, ${Number(lng) || 0}, ${JSON.stringify({ id: bestPriceProduct.store_id || bestPriceProduct.storeId || null, name: bestPriceProduct.store || bestPriceProduct.store_name, address: bestPriceProduct.address, hours: bestPriceProduct.hours, latitude: bestPriceProduct.latitude, longitude: bestPriceProduct.longitude })})' class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">📍 View Location</button>
                        </div>
                    </div>
                `;
            } else {
                bestPriceSection.innerHTML = '<p class="text-center text-gray-600">No best price available</p>';
            }
        }
    } else {
        if (radiusFilterEnabled && userLocation) {
            productList.innerHTML = `<p class="text-center text-blue-600">No products found within ${radiusDistanceValue} km of your location. Try increasing the radius or disabling the location filter.</p>`;
        } else {
            productList.innerHTML = '<p class="text-center text-gray-600">No products found</p>';
        }
        if (bestPriceSection) {
            bestPriceSection.innerHTML = '<p class="text-center text-gray-600">No best price available</p>';
        }
    }
}

/* ---------- Favorites (via backend) ---------- */
async function addToFavorites(productId) {
    if (!currentUser) {
        alert('Please login to add favorites');
        showUserLogin();
        return;
    }

    const isFav = await isFavorite(productId);
    const action = isFav ? 'removeFavorite' : 'addFavorite';
    const body = { action, productId };
    const resp = await apiPost('products.php', body);
    if (resp && resp.status === 'success') {
        alert(isFav ? 'Removed from favorites!' : 'Added to favorites!');
        // Refresh the current view
        if (document.getElementById('searchResults').querySelector('h3').textContent === 'Favorites') {
            await showFavorites();
        } else {
            await searchProducts();
        }
    } else {
        alert(resp.message || 'Could not update favorite.');
    }
}

/* ---------- Favorites Display ---------- */
async function showFavorites() {
    if (!currentUser) {
        alert('Please login to view favorites');
        showUserLogin();
        return;
    }
    
    const body = { action: 'getFavorites' };
    const resp = await apiPost('products.php', body);
    document.getElementById('searchResults').classList.remove('hidden');
    const productList = document.getElementById('productList');
    const bestPriceSection = document.getElementById('bestPriceSection');
    document.getElementById('searchResults').querySelector('h3').textContent = 'Favorites';

    // Apply radius filter to favorites if enabled
    let filteredFavorites = resp;
    if (radiusFilterEnabled && userLocation && Array.isArray(resp)) {
        filteredFavorites = resp.filter(product => {
            if (!product.latitude || !product.longitude) return false;
            const distance = calculateDistance(
                userLocation.latitude,
                userLocation.longitude,
                product.latitude,
                product.longitude
            );
            return distance <= radiusDistanceValue;
        });
        
        if (filteredFavorites.length === 0) {
            productList.innerHTML = `<p class="text-center text-blue-600">No favorites found within ${radiusDistanceValue} km of your location. Try increasing the radius or disabling the location filter.</p>`;
            if (bestPriceSection) {
                bestPriceSection.innerHTML = '<p class="text-center text-gray-600">No best price available in your area</p>';
            }
            return;
        }
    }

    if (filteredFavorites && Array.isArray(filteredFavorites) && filteredFavorites.length > 0) {
        productList.innerHTML = '';
        for (const product of filteredFavorites) {
            const isFav = await isFavorite(product.id);
            const lat = product.latitude || 0;
            const lng = product.longitude || 0;
            const storeNameEsc = escapeHtml(product.store || product.store_name || '');
            
            // Calculate distance if radius filter is enabled
            let distanceInfo = '';
            if (radiusFilterEnabled && userLocation && product.latitude && product.longitude) {
                const distance = calculateDistance(
                    userLocation.latitude,
                    userLocation.longitude,
                    product.latitude,
                    product.longitude
                );
                distanceInfo = `<p class="text-green-600 font-semibold">📍 ${distance.toFixed(1)} km away</p>`;
            }

            productList.innerHTML += `
                <div class="bg-white p-6 rounded-xl border border-gray-200 flex justify-between items-center">
                    <div>
                        <h4 class="text-lg font-bold">${escapeHtml(product.name)}</h4>
                        <p class="text-gray-600">Price: ₱${parseFloat(product.price || 0).toFixed(2)}</p>
                        <p class="text-gray-600">Category: ${escapeHtml(product.category)}</p>
                        <p class="text-gray-600">Store: ${storeNameEsc}</p>
                        ${distanceInfo}
                    </div>
                    <div class="space-x-2">
                        <button onclick="addToFavorites(${product.id})" class="px-4 py-2 bg-${isFav ? 'red' : 'pink'}-600 text-white rounded-lg hover:bg-${isFav ? 'red' : 'pink'}-700">${isFav ? '❤️ Remove from Favorites' : '🤍 Add to Favorites'}</button>
                        <button onclick='openMapModal(${Number(lat) || 0}, ${Number(lng) || 0}, ${JSON.stringify({ id: product.store_id || product.storeId || null, name: product.store || product.store_name, address: product.address, hours: product.hours, latitude: product.latitude, longitude: product.longitude })})' class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">📍 View Location</button>
                    </div>
                </div>
            `;
        }

        // Find and render best price for favorites
        if (bestPriceSection) {
            const validProducts = filteredFavorites.filter(p => p.price && parseFloat(p.price) > 0);
            if (validProducts.length > 0) {
                const bestPriceProduct = validProducts.reduce((min, p) => parseFloat(p.price) < parseFloat(min.price) ? p : min);
                const lat = bestPriceProduct.latitude || 0;
                const lng = bestPriceProduct.longitude || 0;
                const storeNameEsc = escapeHtml(bestPriceProduct.store || bestPriceProduct.store_name || '');
                
                // Calculate distance for best price product
                let bestPriceDistanceInfo = '';
                if (radiusFilterEnabled && userLocation && bestPriceProduct.latitude && bestPriceProduct.longitude) {
                    const distance = calculateDistance(
                        userLocation.latitude,
                        userLocation.longitude,
                        bestPriceProduct.latitude,
                        bestPriceProduct.longitude
                    );
                    bestPriceDistanceInfo = `<p class="text-green-700 font-semibold">📍 ${distance.toFixed(1)} km away</p>`;
                }

                bestPriceSection.innerHTML = `
                    <div class="bg-gradient-to-r from-green-100 to-green-200 p-6 rounded-xl border border-green-300 mb-6">
                        <h3 class="text-xl font-bold text-green-800 mb-4">Best Price Deal${radiusFilterEnabled ? ' (In Your Area)' : ''}</h3>
                        <div class="flex justify-between items-center">
                            <div>
                                <h4 class="text-lg font-semibold">${escapeHtml(bestPriceProduct.name)}</h4>
                                <p class="text-green-700 font-bold">Price: ₱${parseFloat(bestPriceProduct.price).toFixed(2)}</p>
                                <p class="text-gray-600">Category: ${escapeHtml(bestPriceProduct.category)}</p>
                                <p class="text-gray-600">Store: ${storeNameEsc}</p>
                                ${bestPriceDistanceInfo}
                            </div>
                            <button onclick='openMapModal(${Number(lat) || 0}, ${Number(lng) || 0}, ${JSON.stringify({ id: bestPriceProduct.store_id || bestPriceProduct.storeId || null, name: bestPriceProduct.store || bestPriceProduct.store_name, address: bestPriceProduct.address, hours: bestPriceProduct.hours, latitude: bestPriceProduct.latitude, longitude: bestPriceProduct.longitude })})' class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">📍 View Location</button>
                        </div>
                    </div>
                `;
            } else {
                bestPriceSection.innerHTML = '<p class="text-center text-gray-600">No best price available</p>';
            }
        }
    } else {
        productList.innerHTML = '<p class="text-center text-gray-600">No favorites yet</p>';
        if (bestPriceSection) {
            bestPriceSection.innerHTML = '<p class="text-center text-gray-600">No best price available</p>';
        }
    }
}

/* ---------- User Profile Functions ---------- */
async function showUserProfile() {
    if (!currentUser) {
        alert('Please login to view profile');
        showUserLogin();
        return;
    }
    
    const modal = document.getElementById('userProfileModal');
    const content = document.getElementById('userProfileContent');
    
    // Get user favorites count
    const favoritesResp = await apiPost('products.php', { action: 'getFavorites' });
    const favoritesCount = Array.isArray(favoritesResp) ? favoritesResp.length : 0;
    
    content.innerHTML = `
        <div class="space-y-6">
            <div class="bg-gradient-to-r from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200">
                <h4 class="text-xl font-bold text-blue-800 mb-4">👤 User Information</h4>
                <div class="space-y-3">
                    <p><strong>Name:</strong> ${escapeHtml(currentUser.name)}</p>
                    <p><strong>Email:</strong> ${escapeHtml(currentUser.email)}</p>
                    <p><strong>User ID:</strong> ${currentUser.id}</p>
                </div>
            </div>
            
            <div class="bg-gradient-to-r from-green-50 to-green-100 p-6 rounded-xl border border-green-200">
                <h4 class="text-xl font-bold text-green-800 mb-4">❤️ Favorites</h4>
                <p class="text-lg"><strong>Total Favorites:</strong> ${favoritesCount}</p>
                <button onclick="showFavorites()" class="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    View My Favorites
                </button>
            </div>
            
            <div class="bg-gradient-to-r from-red-50 to-red-100 p-6 rounded-xl border border-red-200">
                <h4 class="text-xl font-bold text-red-800 mb-4">⚙️ Account Actions</h4>
                <div class="space-y-3">
                    <button onclick="logoutUser()" class="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                        🚪 Logout
                    </button>
                </div>
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

function closeUserProfile() {
    document.getElementById('userProfileModal').classList.add('hidden');
}

/* ---------- Enhanced Login Functions ---------- */
async function loginUser(event) {
    event?.preventDefault();
    const email = document.getElementById('userEmail').value.trim();
    const password = document.getElementById('userPassword').value;

    if (!email || !password) {
        alert('Please enter both email and password');
        return;
    }

    try {
        const resp = await apiPost('login.php', { action: 'userLogin', email, password });
        console.log('User login response:', resp);
        
        if (resp && resp.status === 'success' && resp.user) {
            currentUser = resp.user;
            updateUserProfileVisibility();
            showCustomerPage();
            alert(`Welcome back, ${currentUser.name}!`);
            
            // Clear login form
            document.getElementById('userEmail').value = '';
            document.getElementById('userPassword').value = '';
        } else {
            alert(resp.message || 'Invalid email or password. Please try again.');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Network error. Please check your connection and try again.');
    }
}

async function loginStoreOwner(event) {
    event?.preventDefault();
    const storeName = document.getElementById('storeName').value.trim();
    const password = document.getElementById('storePassword').value;

    if (!storeName || !password) {
        alert('Please enter both store name and password');
        return;
    }

    try {
        const resp = await apiPost('login.php', { action: 'storeLogin', storeName, password });
        console.log('Store login response:', resp);

        if (resp?.status === 'success' && resp.store) {
            currentStore = resp.store;
            await showStoreOwnerDashboard();
            alert(`✅ Welcome to ${currentStore.name} Dashboard!`);
            
            // Clear login form
            document.getElementById('storeName').value = '';
            document.getElementById('storePassword').value = '';
        } else {
            alert(resp?.message || 'Invalid store name or password. Please try again.');
        }
    } catch (error) {
        console.error('Store login error:', error);
        alert('Network error. Please check your connection and try again.');
    }
}

async function loginAdmin(event) {
    event?.preventDefault();
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;

    if (!username || !password) {
        alert('Please enter both username and password');
        return;
    }

    try {
        const resp = await apiPost('login.php', { action: 'adminLogin', username, password });
        console.log('Admin login response:', resp);
        
        if (resp && resp.status === 'success' && resp.admin) {
            currentAdmin = resp.admin;
            showAdminDashboard();
            alert(`Welcome, ${currentAdmin.role}!`);
            
            // Clear login form
            document.getElementById('adminUsername').value = '';
            document.getElementById('adminPassword').value = '';
        } else {
            alert(resp.message || 'Invalid admin username or password. Please try again.');
        }
    } catch (error) {
        console.error('Admin login error:', error);
        alert('Network error. Please check your connection and try again.');
    }
}

/* ---------- Enhanced Logout Functions ---------- */
async function logoutUser() {
    try {
        const resp = await apiPost('logout.php', {});
        if (resp && resp.status === 'success') {
            currentUser = null;
            document.getElementById('userProfileModal').classList.add('hidden');
            updateUserProfileVisibility();
            showHomePage();
            alert('Logged out successfully!');
        } else {
            alert('Logout failed. Please try again.');
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Force logout even if server fails
        currentUser = null;
        document.getElementById('userProfileModal').classList.add('hidden');
        updateUserProfileVisibility();
        showHomePage();
        alert('Logged out successfully!');
    }
}

async function logoutStoreOwner() {
    try {
        const resp = await apiPost('logout.php', {});
        if (resp && resp.status === 'success') {
            currentStore = null;
            showHomePage();
            alert('Logged out successfully!');
        } else {
            alert('Logout failed. Please try again.');
        }
    } catch (error) {
        console.error('Store logout error:', error);
        // Force logout even if server fails
        currentStore = null;
        showHomePage();
        alert('Logged out successfully!');
    }
}

async function logoutAdmin() {
    try {
        const resp = await apiPost('logout.php', {});
        if (resp && resp.status === 'success') {
            currentAdmin = null;
            showHomePage();
            alert('Logged out successfully!');
        } else {
            alert('Logout failed. Please try again.');
        }
    } catch (error) {
        console.error('Admin logout error:', error);
        // Force logout even if server fails
        currentAdmin = null;
        showHomePage();
        alert('Logged out successfully!');
    }
}

/* ---------- Store Owner Dashboard Functions ---------- */
async function showStoreOwnerDashboard() {
    hideAllPages();
    document.getElementById('storeOwnerDashboard').classList.remove('hidden');

    // ensure adminDashboard overlay won't block clicks elsewhere
    const adminEl = document.getElementById('adminDashboard');
    if (adminEl) {
        adminEl.style.zIndex = 9999;
        adminEl.style.pointerEvents = 'auto';
    }

    // fetch store data from server
    const resp = await apiPost('store.php', { action: 'getStoreData' });
    console.log('STORE DATA RESPONSE (showStoreOwnerDashboard):', resp);

    // store.php returns { status: 'success', store: { ... } }
    if (resp && resp.store) {
        currentStore = resp.store;
        document.getElementById('storeNameDisplay').textContent = currentStore.name || '';
        document.getElementById('storeRevenue').textContent = `₱${(currentStore.revenue || 0).toLocaleString()}`;
        document.getElementById('storeProductCount').textContent = (currentStore.inventory || []).length;
        document.getElementById('lowStockCount').textContent = (currentStore.inventory || []).filter(p => p.stock < 10).length;
        document.getElementById('storeCustomers').textContent = currentStore.customers || 0;
    } else {
        console.warn('Could not load store data from server:', resp);
        alert('Could not load store data from server.');
    }
    showInventoryTab();
}

function showInventoryTab() {
    hideStoreTabs();
    document.getElementById('inventorySection').classList.remove('hidden');
    document.getElementById('inventoryTab').classList.add('premium-button');
    const inventory = document.getElementById('storeInventory');
    const inv = currentStore?.inventory || [];
    if (!inv.length) {
        inventory.innerHTML = '<p class="text-center text-gray-600">No products in inventory</p>';
        return;
    }
    inventory.innerHTML = inv.map(product => `
        <div class="bg-white p-4 rounded-lg border border-gray-200">
            <h4 class="font-bold">${escapeHtml(product.name)}</h4>
            <p>SKU: ${escapeHtml(product.sku)}</p>
            <p>Price: ₱${parseFloat(product.price || 0).toFixed(2)}</p>
            <p>Category: ${escapeHtml(product.category)}</p>
            <p>Stock: ${parseInt(product.stock || 0)}</p>
            <p>Supplier: ${escapeHtml(product.supplier)}</p>
            <div class="mt-2 space-x-2">
                <button onclick="editProductPrompt(${product.id})" class="px-3 py-1 bg-yellow-400 rounded">Edit</button>
                <button onclick="deleteProduct(${product.id})" class="px-3 py-1 bg-red-600 text-white rounded">Delete</button>
            </div>
        </div>
    `).join('');
}

function showAddProductTab() {
    hideStoreTabs();
    document.getElementById('addProductSection').classList.remove('hidden');
    document.getElementById('addProductTab').classList.add('premium-button');
}

function showAnalyticsTab() {
    hideStoreTabs();
    document.getElementById('analyticsSection').classList.remove('hidden');
    document.getElementById('analyticsTab').classList.add('premium-button');
    renderStoreCharts();
}

function showStoreSettingsTab() {
    hideStoreTabs();
    document.getElementById('storeSettingsSection').classList.remove('hidden');
    document.getElementById('storeSettingsTab').classList.add('premium-button');
    // populate settings (phone intentionally omitted)
    document.getElementById('storeAddress').value = currentStore.address || '';
    document.getElementById('storeLocation').value = currentStore.location || '';
    document.getElementById('storeHours').value = currentStore.hours || '';
    document.getElementById('storeLatitude').value = currentStore.latitude || '';
    document.getElementById('storeLongitude').value = currentStore.longitude || '';
}

function hideStoreTabs() {
    const sections = ['inventorySection', 'addProductSection', 'analyticsSection', 'storeSettingsSection'];
    const tabs = ['inventoryTab', 'addProductTab', 'analyticsTab', 'storeSettingsTab'];
    sections.forEach(s => document.getElementById(s)?.classList.add('hidden'));
    tabs.forEach(t => {
        const el = document.getElementById(t);
        if (el) {
            el.classList.remove('premium-button');
            el.classList.add('bg-gray-200', 'text-gray-700');
        }
    });
}

/* Add product (backend) */
async function addProduct(event) {
    event?.preventDefault();
    const product = {
        name: document.getElementById('newProductName').value,
        sku: document.getElementById('newProductSKU').value,
        price: parseFloat(document.getElementById('newProductPrice').value) || 0,
        category: document.getElementById('newProductCategory').value,
        stock: parseInt(document.getElementById('newProductStock').value) || 0,
        supplier: document.getElementById('newProductSupplier').value,
        latitude: currentStore.latitude || null,
        longitude: currentStore.longitude || null,
        address: currentStore.address || '',
        hours: currentStore.hours || ''
    };
    const resp = await apiPost('products.php', { action: 'addProduct', product });
    if (resp && resp.status === 'success') {
        alert('Product added successfully!');
        // refresh store data
        await refreshStoreData();
        showInventoryTab();
    } else {
        alert(resp.message || 'Could not add product.');
    }
}

async function editProductPrompt(productId) {
    const product = (currentStore.inventory || []).find(p => p.id == productId);
    if (!product) { alert('Product not found'); return; }
    const newName = prompt('Product name', product.name);
    if (newName === null) return;
    product.name = newName;
    // You can prompt for other fields similarly or show a modal form; keep simple:
    const resp = await apiPost('products.php', { action: 'editProduct', product });
    if (resp && resp.status === 'success') {
        alert('Product updated.');
        await refreshStoreData();
        showInventoryTab();
    } else {
        alert(resp.message || 'Could not update product.');
    }
}

async function deleteProduct(productId) {
    if (!confirm('Delete this product?')) return;
    const resp = await apiPost('products.php', { action: 'deleteProduct', productId });
    if (resp && resp.status === 'success') {
        alert('Product deleted.');
        await refreshStoreData();
        showInventoryTab();
    } else {
        alert(resp.message || 'Could not delete product.');
    }
}

async function refreshStoreData() {
    const resp = await apiPost('store.php', { action: 'getStoreData' });
    console.log('STORE DATA RESPONSE (refresh):', resp);
    if (resp && resp.store) {
        currentStore = resp.store;
    }
}

/* Update store settings (phone omitted) */
async function updateStoreSettings(event) {
    event?.preventDefault();
    const settings = {
        address: document.getElementById('storeAddress').value,
        location: document.getElementById('storeLocation').value,
        hours: document.getElementById('storeHours').value,
        latitude: parseFloat(document.getElementById('storeLatitude').value) || null,
        longitude: parseFloat(document.getElementById('storeLongitude').value) || null
    };
    const resp = await apiPost('store.php', { action: 'updateStoreSettings', settings });
    if (resp && resp.status === 'success') {
        alert('Store settings updated successfully!');
        await refreshStoreData();
    } else {
        alert(resp.message || 'Could not update store settings.');
    }
}

/* ---------- Admin UI functions (fetch server stats) ---------- */
async function showAdminDashboard() {
    hideAllPages();
    document.getElementById('adminDashboard').classList.remove('hidden');

    // ensure adminDashboard receives clicks (fix overlay issues)
    const adminEl = document.getElementById('adminDashboard');
    if (adminEl) {
        adminEl.style.zIndex = 9999;
        adminEl.style.pointerEvents = 'auto';
    }

    document.getElementById('adminNameDisplay').textContent = `${currentAdmin?.role || 'Admin'} (${currentAdmin?.username || ''})`;
    await showAdminOverview();
}

async function showAdminOverview() {
    hideAdminTabs();
    document.getElementById('adminOverviewSection').classList.remove('hidden');
    document.getElementById('adminOverviewTab').classList.add('premium-button');

    // fetch & render using centralized function
    await fetchAndRenderAdminOverview();
}

/* ---------- Admin Management: Load & Delete Users/Stores ---------- */
function hideAdminTabs() {
    const sections = ['adminOverviewSection', 'userManagementSection', 'storeManagementSection', 'systemSettingsSection'];
    const tabs = ['adminOverviewTab', 'userManagementTab', 'storeManagementTab', 'systemSettingsTab'];
    sections.forEach(section => {
        const el = document.getElementById(section);
        if (el) el.classList.add('hidden');
    });
    tabs.forEach(tab => {
        const el = document.getElementById(tab);
        if (el) {
            el.classList.remove('premium-button');
            el.classList.add('bg-gray-200', 'text-gray-700');
        }
    });
}

async function loadUsers() {
    const container = document.getElementById('usersList');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-600">Loading users...</p>';

    try {
        const res = await fetch('get_users.php', { credentials: 'include' });
        const data = await res.json();
        if (!data || data.status !== 'success') {
            container.innerHTML = `<p class="text-red-600">Unable to load users: ${data?.message || 'Server error'}</p>`;
            return;
        }

        if (!data.users.length) {
            container.innerHTML = '<p class="text-gray-600">No users found.</p>';
            return;
        }

        container.innerHTML = data.users.map(u => `
            <div class="bg-white p-4 rounded-lg border border-gray-200 flex justify-between items-center">
                <div>
                    <p class="font-bold">${escapeHtml(u.name)}</p>
                    <p class="text-sm text-gray-500">${escapeHtml(u.email)}</p>
                    <p class="text-xs text-gray-400 mt-1">Joined: ${escapeHtml(u.created_at)}</p>
                </div>
                <div>
                    <button onclick="adminDeleteUser(${u.id})" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('loadUsers error', e);
        container.innerHTML = '<p class="text-red-600">Network error while loading users.</p>';
    }
}

window.adminDeleteUser = async function (userId) {
    if (!confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) return;
    const resp = await apiPost('admin.php', { action: 'deleteUser', userId });
    if (!resp) {
        alert('Server error while deleting user.');
        return;
    }
    if (resp.status === 'success') {
        alert('User deleted.');
        // refresh user list if visible
        if (!document.getElementById('userManagementSection')?.classList.contains('hidden')) {
            await loadUsers();
        } else {
            await fetchAndRenderAdminOverview();
        }
    } else {
        alert('Error: ' + (resp.message || 'Unable to delete user.'));
    }
}

async function loadStores() {
    const container = document.getElementById('storesList');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-600">Loading stores...</p>';

    try {
        const res = await fetch('get_stores.php', { credentials: 'include' });
        const data = await res.json();
        if (!data || data.status !== 'success') {
            container.innerHTML = `<p class="text-red-600">Unable to load stores: ${data?.message || 'Server error'}</p>`;
            return;
        }

        if (!data.stores.length) {
            container.innerHTML = '<p class="text-gray-600">No stores found.</p>';
            return;
        }

        container.innerHTML = data.stores.map(s => {
            const safeName = escapeHtml(s.name).replace(/'/g, "\\'"); // Important escaping for JS
            return `
                <div class="bg-white p-4 rounded-lg border border-gray-200">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="font-bold">${escapeHtml(s.name)}</p>
                            <p class="text-sm text-gray-500">${escapeHtml(s.address || s.location || '')}</p>
                            <p class="text-xs text-gray-400 mt-1">Products and favorites will be permanently removed when this store is deleted.</p>
                        </div>
                        <div class="flex flex-col items-end space-y-2">
                            <div class="text-sm text-gray-600">Revenue: ₱${Number(s.revenue || 0).toLocaleString()}</div>
                            <button onclick="adminDeleteStore(${s.id}, '${safeName}')" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('loadStores error', e);
        container.innerHTML = '<p class="text-red-600">Network error while loading stores.</p>';
    }
}

window.adminDeleteStore = async function (storeId, storeName) {
    const confirmMsg = `Are you sure you want to permanently delete the store "${storeName}"? This will permanently delete ALL its products and any related favorites (this cannot be undone).`;
    if (!confirm(confirmMsg)) return;

    const resp = await apiPost('admin.php', { action: 'deleteStore', storeId });
    if (resp && resp.status === 'success') {
        alert('✅ Store deleted.');
        if (!document.getElementById('storeManagementSection')?.classList.contains('hidden')) {
            await loadStores();
        } else {
            await fetchAndRenderAdminOverview();
        }
    } else {
        alert('Error: ' + (resp?.message || 'Unable to delete store.'));
    }
}

function setFilter(filter) {
    currentFilter = filter;
    // Update active state of filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
        if (chip.dataset.filter === filter) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });
}

/* ---------- Placeholder chart renders (keep existing chart code) ---------- */
function renderStoreCharts() {
    // Keep original Chart.js logic for store dashboards if canvas elements exist
    try {
        // your existing store chart rendering (left intentionally lightweight)
    } catch (e) { console.warn('Chart render error', e); }
}

function renderAdminCharts() {
    try {
        // kept for compatibility if used elsewhere
    } catch (e) { console.warn('Chart render error', e); }
}

/* ---------- Admin overview fetch + chart rendering ---------- */
async function fetchAndRenderAdminOverview() {
    const resp = await apiPost('admin.php', { action: 'getAdminData' });
    if (!resp || resp.status !== 'success') {
        console.warn('Could not fetch admin data', resp);
        return;
    }

    // populate top stat indicators if present
    document.getElementById('totalStores') && (document.getElementById('totalStores').textContent = resp.totalStores ?? '0');
    document.getElementById('totalProducts') && (document.getElementById('totalProducts').textContent = resp.totalProducts ?? '0');
    document.getElementById('activeUsers') && (document.getElementById('activeUsers').textContent = resp.activeUsers ?? '0');

    // populate user list and store list if adminOverview supports it (keeps original behavior)
    if (document.getElementById('usersList') && Array.isArray(resp.users)) {
        document.getElementById('usersList').innerHTML = resp.users.map(u => `
            <div class="bg-white p-4 rounded-lg border border-gray-200">
                <p><strong>Name:</strong> ${escapeHtml(u.name)}</p>
                <p><strong>Email:</strong> ${escapeHtml(u.email)}</p>
                <p><strong>Favorites:</strong> ${u.favorites_count}</p>
            </div>
        `).join('');
    }
    if (document.getElementById('storesList') && Array.isArray(resp.stores)) {
        document.getElementById('storesList').innerHTML = resp.stores.map(s => `
            <div class="bg-white p-4 rounded-lg border border-gray-200">
                <p><strong>Name:</strong> ${escapeHtml(s.name)}</p>
                <p><strong>Address:</strong> ${escapeHtml(s.address || '')}</p>
                <p><strong>Products:</strong> ${s.product_count}</p>
                <p><strong>Revenue:</strong> ₱${(s.revenue || 0).toLocaleString()}</p>
            </div>
        `).join('');
    }

    // Render category chart if canvas exists
    const catCtx = document.getElementById('categoryChart')?.getContext('2d');
    if (catCtx && Array.isArray(resp.categories) && Array.isArray(resp.categoryCounts)) {
        new Chart(catCtx, {
            type: 'bar',
            data: {
                labels: resp.categories,
                datasets: [{
                    label: 'Products by Category',
                    data: resp.categoryCounts,
                    backgroundColor: '#3b82f6'
                }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } } }
        });
    }
}

/* ---------- Admin tab switching ---------- */
async function showUserManagement() {
    hideAdminTabs();
    document.getElementById('userManagementSection').classList.remove('hidden');
    document.getElementById('userManagementTab').classList.add('premium-button');
    await loadUsers();
}

async function showStoreManagement() {
    hideAdminTabs();
    document.getElementById('storeManagementSection').classList.remove('hidden');
    document.getElementById('storeManagementTab').classList.add('premium-button');
    await loadStores();
}

function showSystemSettings() {
    hideAdminTabs();
    document.getElementById('systemSettingsSection').classList.remove('hidden');
    document.getElementById('systemSettingsTab').classList.add('premium-button');
}

/* ---------- Initialize on load ---------- */
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already logged in via session
    (async () => {
        try {
            const res = await fetch('session.php', { credentials: 'include' });
            const data = await res.json();
            if (data.user) {
                currentUser = data.user;
                updateUserProfileVisibility();
            } else if (data.store) {
                currentStore = data.store;
            } else if (data.admin) {
                currentAdmin = data.admin;
            }
        } catch (e) {
            console.warn('Session check failed', e);
        }
    })();

    // Initialize map if needed
    initializeMap();

    // Add hamburger menu toggle
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) {
        menuBtn.addEventListener('click', toggleDropdownMenu);
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        const dropdownMenu = document.getElementById('dropdownMenu');
        const menuBtn = document.getElementById('menuBtn');
        if (dropdownMenu && menuBtn && !dropdownMenu.contains(event.target) && !menuBtn.contains(event.target)) {
            closeDropdownMenu();
        }
    });

    // FIXED: Add click handler for user profile button
    const userProfileButton = document.querySelector('#userProfileSection button');
    if (userProfileButton) {
        userProfileButton.addEventListener('click', showUserProfile);
    }

    const radiusFilter = document.getElementById('radiusFilter');
    const radiusDistance = document.getElementById('radiusDistance');
    
    if (radiusFilter) {
        radiusFilter.addEventListener('change', toggleRadiusFilter);
    }
    
    if (radiusDistance) {
        radiusDistance.addEventListener('change', updateRadiusFilter);
    }

    // Close dropdown when clicking a menu item
    const dropdownLinks = document.querySelectorAll('#dropdownMenu a');
    dropdownLinks.forEach(link => {
        link.addEventListener('click', () => {
            closeDropdownMenu();
        });
    });

    // Existing home button listener
    document.getElementById('homeBtn')?.addEventListener('click', () => {
        showHomePage();
    });

    // Add enter key support for search
    document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchProducts();
        }
    });
});