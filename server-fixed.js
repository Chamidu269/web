/**
 * ============================================================
 * BUS TICKETING SYSTEM - MQTT/Supabase Server Backend
 * ============================================================
 * Handles real-time GPS telemetry and tap-in/tap-out transactions
 * via MQTT broker with Supabase as the database backend.
 * 
 * Features:
 * - GPS location updates every 10 seconds (bus/location topic)
 * - RFID tap processing with coordinate capture (bus/tap topic)
 * - Atomic transaction processing via Supabase RPC
 * - GPS fallback logic for lost signal scenarios
 * - Double-tap protection (15-second minimum gap)
 * ============================================================
 */

require('dotenv').config({ path: '.env.local' });
const mqtt = require('mqtt');
const { createClient } = require('@supabase/supabase-js');

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Critical Error: Missing Supabase database credentials");
  console.error("   Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!process.env.MQTT_BROKER || !process.env.MQTT_USER) {
  console.error("❌ Critical Error: Missing MQTT broker configuration");
  console.error("   Required env vars: MQTT_BROKER, MQTT_USER, MQTT_PASSWORD");
  process.exit(1);
}

// ============================================================
// DATABASE CLIENT INITIALIZATION
// ============================================================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('✓ Supabase client initialized');

// ============================================================
// MQTT CLIENT INITIALIZATION
// ============================================================
const mqttClient = mqtt.connect(`mqtts://${process.env.MQTT_BROKER}`, {
  port: 8883,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
  clientId: 'node_backend_worker',
  keepalive: 60,
  reconnectPeriod: 5000,
  connectTimeout: 30000,
  rejectUnauthorized: false // For development only - use proper certs in production
});

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - Starting latitude
 * @param {number} lon1 - Starting longitude
 * @param {number} lat2 - Ending latitude
 * @param {number} lon2 - Ending longitude
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Validate GPS coordinates are within reasonable bounds
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean} True if coordinates are valid
 */
function isValidGPS(lat, lng) {
  return lat !== 0 && lng !== 0 && 
         lat >= -90 && lat <= 90 && 
         lng >= -180 && lng <= 180;
}

/**
 * Publish control message back to ESP32 device
 * @param {string} deviceId - ESP32 device ID
 * @param {boolean} allowed - Access permission
 * @param {string} status - 'in' for boarding, 'out' for alighting
 * @param {number} balance - Updated account balance
 * @param {string} message - Status message for display
 */
function publishControl(deviceId, allowed, status, balance, message) {
  const payload = JSON.stringify({ 
    device_id: deviceId, 
    allowed, 
    status, 
    balance: parseFloat(balance).toFixed(2),
    message,
    timestamp: new Date().toISOString()
  });
  mqttClient.publish('bus/gate/control', payload);
  console.log(`📤 Control sent to ${deviceId}: ${message}`);
}

// ============================================================
// MQTT EVENT HANDLERS
// ============================================================

mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT Broker');
  mqttClient.subscribe(['bus/tap', 'bus/location'], (err) => {
    if (err) {
      console.error('❌ Subscription failed:', err);
    } else {
      console.log('✓ Subscribed to [bus/tap, bus/location]');
    }
  });
});

mqttClient.on('disconnect', () => {
  console.log('⚠️  Disconnected from MQTT Broker');
});

mqttClient.on('error', (err) => {
  console.error('❌ MQTT Error:', err);
});

// ============================================================
// MAIN MESSAGE HANDLER
// ============================================================

mqttClient.on('message', async (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    console.log(`\n📨 Message received on ${topic}:`, data);

    // ========== TOPIC 1: BUS LOCATION TELEMETRY ==========
    if (topic === 'bus/location') {
      await handleLocationUpdate(data);
      return;
    }

    // ========== TOPIC 2: RFID TAP EVENTS ==========
    if (topic === 'bus/tap') {
      await handleTapEvent(data);
      return;
    }

  } catch (err) {
    console.error('❌ Message processing error:', err.message);
  }
});

// ============================================================
// HANDLER: BUS LOCATION UPDATES (Every 10 seconds)
// ============================================================

async function handleLocationUpdate(data) {
  try {
    const { device_id, lat, lng, speed, hdop } = data;

    // Validate device_id exists
    if (!device_id) {
      console.warn('⚠️  Location update missing device_id');
      return;
    }

    // Lookup bus by device_id
    const { data: bus, error: busError } = await supabase
      .from('buses')
      .select('id')
      .eq('esp32_device_id', device_id)
      .single();

    if (busError || !bus) {
      console.warn(`⚠️  Bus not found for device: ${device_id}`);
      return;
    }

    // Validate GPS coordinates
    if (!isValidGPS(lat, lng)) {
      console.warn(`⚠️  Invalid GPS: lat=${lat}, lng=${lng}`);
      return;
    }

    // UPSERT location (update if exists, insert if new)
    const { error: updateError } = await supabase
      .from('bus_locations')
      .upsert({
        bus_id: bus.id,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        speed_kmh: speed ? parseFloat(speed) : null,
        hdop: hdop ? parseFloat(hdop) : null,
        updated_at: new Date().toISOString()
      }, { 
        onConflict: 'bus_id'
      });

    if (updateError) {
      console.error('❌ Location update failed:', updateError);
    } else {
      console.log(`✓ Location updated: Bus ${bus.id} -> (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
    }

  } catch (err) {
    console.error('❌ Error in handleLocationUpdate:', err.message);
  }
}

// ============================================================
// HANDLER: RFID TAP EVENTS (Boarding & Alighting)
// ============================================================

async function handleTapEvent(data) {
  try {
    const { device_id, rfid_uid, lat, lng } = data;

    console.log(`\n🚀 Processing tap event:
      Device: ${device_id}
      RFID: ${rfid_uid}
      GPS: (${lat.toFixed(6)}, ${lng.toFixed(6)})`);

    // ===== STEP 1: Lookup passenger by RFID =====
    // Normalize RFID: uppercase and trim whitespace
    const normalizedRfid = rfid_uid.trim().toUpperCase();
    
    const { data: passenger, error: passengerError } = await supabase
      .from('passengers')
      .select('id, rfid_uid')
      .eq('rfid_uid', normalizedRfid)
      .maybeSingle();

    if (passengerError || !passenger) {
      console.warn(`⚠️  Passenger not found for RFID: ${normalizedRfid}`, passengerError);
      publishControl(device_id, false, 'out', 0, "Card not registered");
      return;
    }

    // ===== STEP 2: Lookup bus by device_id =====
    const { data: bus, error: busError } = await supabase
      .from('buses')
      .select('id')
      .eq('esp32_device_id', device_id)
      .maybeSingle();

    if (!bus) {
      console.warn(`⚠️  Bus not found for device: ${device_id}`);
      publishControl(device_id, false, 'out', 0, "Bus not recognized");
      return;
    }

    const passengerId = passenger.id;

    // ===== STEP 2: Fetch account separately (more reliable than nested select) =====
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, balance')
      .eq('passenger_id', passengerId)
      .maybeSingle();

    if (accountError || !account) {
      console.warn(`⚠️  No account found for passenger: ${passengerId}`, accountError);
      publishControl(device_id, false, 'out', 0, "Account error");
      return;
    }

    const accountId = account.id;
    const currentBalance = parseFloat(account.balance || 0);

    console.log(`✓ Passenger found: ${passengerId}, Account: ${accountId}, Balance: LKR ${currentBalance.toFixed(2)}`);

    // ===== STEP 3: Check for active trip =====
    const { data: activeTrip, error: tripError } = await supabase
      .from('trips')
      .select('*')
      .eq('passenger_id', passengerId)
      .eq('status', 'in_progress')
      .order('board_time', { ascending: false })
      .maybeSingle();

    // ===== CASE 1: NO ACTIVE TRIP → BOARDING (TAP-IN) =====
    if (!activeTrip) {
      console.log('📍 State: BOARDING (TAP-IN)');

      // Check minimum balance
      if (currentBalance < 100.00) {
        console.warn(`❌ Insufficient balance: LKR ${currentBalance.toFixed(2)} < LKR 100.00`);
        publishControl(device_id, false, 'out', currentBalance, "Insufficient balance");
        return;
      }

      // Validate boarding GPS
      let boardLat = lat;
      let boardLng = lng;
      if (!isValidGPS(boardLat, boardLng)) {
        console.warn('⚠️  Invalid boarding GPS, using bus fallback');
        const { data: busLoc } = await supabase
          .from('bus_locations')
          .select('lat, lng')
          .eq('bus_id', bus.id)
          .maybeSingle();
        
        if (busLoc) {
          boardLat = parseFloat(busLoc.lat);
          boardLng = parseFloat(busLoc.lng);
          console.log(`✓ Using bus location fallback: (${boardLat.toFixed(6)}, ${boardLng.toFixed(6)})`);
        }
      }

      // Create new trip with boarding coordinates
      const { data: newTrip, error: createError } = await supabase
        .from('trips')
        .insert({
          passenger_id: passengerId,
          bus_id: bus.id,
          board_lat: parseFloat(boardLat),
          board_lng: parseFloat(boardLng),
          board_time: new Date().toISOString(),
          status: 'in_progress'
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Failed to create trip:', createError);
        publishControl(device_id, false, 'out', currentBalance, "Booking failed");
        return;
      }

      console.log(`✅ Trip created: ${newTrip.id}`);
      publishControl(device_id, true, 'in', currentBalance, "Boarding cleared");

    } 
    // ===== CASE 2: ACTIVE TRIP EXISTS → ALIGHTING (TAP-OUT) =====
    else {
      console.log('📍 State: ALIGHTING (TAP-OUT)');

      // ===== SECURITY: Double-tap protection (15 seconds minimum) =====
      const boardTime = new Date(activeTrip.board_time).getTime();
      const currentTime = new Date().getTime();
      const elapsedSeconds = (currentTime - boardTime) / 1000;

      if (elapsedSeconds < 15) {
        console.warn(`⚠️  Double-tap detected: Only ${elapsedSeconds.toFixed(1)}s elapsed`);
        publishControl(device_id, false, 'in', currentBalance, "Already boarded");
        return;
      }

      console.log(`✓ Trip duration: ${elapsedSeconds.toFixed(1)} seconds`);

      // ===== GPS FALLBACK LOGIC =====
      let finalAlightLat = lat;
      let finalAlightLng = lng;

      if (!isValidGPS(finalAlightLat, finalAlightLng)) {
        console.warn('⚠️  Invalid alighting GPS, attempting fallback...');
        
        // Try: Use latest bus location
        const { data: fallbackLoc } = await supabase
          .from('bus_locations')
          .select('lat, lng')
          .eq('bus_id', bus.id)
          .maybeSingle();

        if (fallbackLoc) {
          finalAlightLat = parseFloat(fallbackLoc.lat);
          finalAlightLng = parseFloat(fallbackLoc.lng);
          console.log(`✓ Using latest bus location: (${finalAlightLat.toFixed(6)}, ${finalAlightLng.toFixed(6)})`);
        } else {
          // Fallback: Use boarding location
          finalAlightLat = parseFloat(activeTrip.board_lat);
          finalAlightLng = parseFloat(activeTrip.board_lng);
          console.log(`✓ Using boarding location as alight: (${finalAlightLat.toFixed(6)}, ${finalAlightLng.toFixed(6)})`);
        }
      }

      // ===== FARE CALCULATION =====
      const { data: config } = await supabase
        .from('pricing_config')
        .select('fare_per_km, minimum_fare')
        .eq('route_id', bus.id)
        .maybeSingle();

      const farePerKm = config ? parseFloat(config.fare_per_km) : 10.00;
      const minFare = config ? parseFloat(config.minimum_fare) : 15.00;

      const distance = calculateDistance(
        activeTrip.board_lat, 
        activeTrip.board_lng, 
        finalAlightLat, 
        finalAlightLng
      );
      
      let computedFare = distance * farePerKm;
      if (computedFare < minFare) computedFare = minFare;

      const finalBalance = currentBalance - computedFare;

      console.log(`
      📊 Fare Calculation:
         Distance: ${distance.toFixed(3)} km
         Rate: LKR ${farePerKm.toFixed(2)}/km
         Calculated: LKR ${(distance * farePerKm).toFixed(2)}
         Minimum: LKR ${minFare.toFixed(2)}
         Final Fare: LKR ${computedFare.toFixed(2)}
         New Balance: LKR ${finalBalance.toFixed(2)}`);

      // ===== ATOMIC TRANSACTION: Call RPC function =====
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'process_tap_out',
        {
          p_trip_id: activeTrip.id,
          p_passenger_id: passengerId,
          p_account_id: accountId,
          p_fare: computedFare,
          p_distance: distance,
          p_alight_lat: finalAlightLat,
          p_alight_lng: finalAlightLng,
          p_new_balance: finalBalance
        }
      );

      if (rpcError) {
        console.error('❌ RPC function failed:', rpcError);
        publishControl(device_id, false, 'out', currentBalance, "Transaction failed");
        return;
      }

      const result = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
      
      if (!result.success) {
        console.warn(`⚠️  Transaction not processed: ${result.error}`);
        publishControl(device_id, false, 'out', currentBalance, result.error);
        return;
      }

      console.log(`✅ Transaction completed successfully`);
      publishControl(device_id, true, 'out', finalBalance, "Fare paid successfully");
    }

  } catch (err) {
    console.error('❌ Error in handleTapEvent:', err.message);
    publishControl(data.device_id || 'UNKNOWN', false, 'out', 0, "System error");
  }
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  mqttClient.end(() => {
    console.log('✓ MQTT connection closed');
    process.exit(0);
  });
});

console.log('🚀 Bus Ticketing Backend Server started');
console.log(`   MQTT Broker: ${process.env.MQTT_BROKER}`);
console.log(`   Database: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
console.log('   Waiting for messages...\n');
