require('dotenv').config({ path: '.env.local' });
const mqtt = require('mqtt');
const { createClient } = require('@supabase/supabase-js');

// Verify mandatory system environmental bindings
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Critical Error: Missing Supabase database key credentials inside configuration environment variables.");
  process.exit(1);
}

// Connect to Cloud Database Instance using Service Role clearance
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Connect to secure MQTT Broker
const mqttClient = mqtt.connect(`mqtts://${process.env.MQTT_BROKER}`, {
  port: 8883,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
  clientId: 'node_backend_worker' // Unique client ID distinct from the ESP32
});

// Haversine Distance Formula Component
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth physical radius radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

mqttClient.on('connect', () => {
  console.log('Supabase client initialized successfully.');
  console.log('Connected to EMQX Broker.');
  mqttClient.subscribe(['bus/tap', 'bus/location']);
});

mqttClient.on('message', async (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());

    // --- TELEMETRY LOG ROUTINE ---
    if (topic === 'bus/location') {
      const { data: bus } = await supabase.from('buses').select('id').eq('esp32_device_id', data.device_id).single();
      if (bus) {
        await supabase.from('bus_locations').insert({
          bus_id: bus.id,
          lat: data.lat,
          lng: data.lng,
          speed_kmh: data.speed
        });
      }
      return;
    }

    // --- TRANSACTION AND LIFECYCLE ROUTINE ---
    if (topic === 'bus/tap') {
      const { device_id, rfid_uid, lat, lng } = data;

      // 1. Structural lookups
      const { data: passenger } = await supabase
        .from('passengers')
        .select('id, accounts(id, balance)')
        .eq('rfid_uid', rfid_uid)
        .maybeSingle();

      const { data: bus } = await supabase.from('buses').select('id').eq('esp32_device_id', device_id).maybeSingle();

      if (!passenger || !bus) {
        publishControl(device_id, false, 'out', 0, "Unrecognized Device/Card");
        return;
      }

      const passengerId = passenger.id;
      const accountId = passenger.accounts.id;
      const currentBalance = parseFloat(passenger.accounts.balance);

      // Verify active trip state records
      const { data: activeTrip } = await supabase
        .from('trips')
        .select('*')
        .eq('passenger_id', passengerId)
        .eq('status', 'in_progress')
        .order('board_time', { ascending: false })
        .maybeSingle();

      if (!activeTrip) {
        // --- TICKETING STAGE: INITIAL ENTRY (TAP-IN) ---
        if (currentBalance < 100.00) {
          publishControl(device_id, false, 'out', currentBalance, "Insufficient Funds");
          return;
        }

        await supabase.from('trips').insert({
          passenger_id: passengerId,
          bus_id: bus.id,
          board_lat: lat,
          board_lng: lng,
          status: 'in_progress'
        });

        publishControl(device_id, true, 'in', currentBalance, "Boarding Cleared");
      } else {
        // --- TICKETING STAGE: TERMINATION (TAP-OUT) ---
        
        // 15-Second software transaction double-tap protection guard
        const boardTime = new Date(activeTrip.board_time).getTime();
        const currentTime = new Date().getTime();
        const elapsedSeconds = (currentTime - boardTime) / 1000;

        if (elapsedSeconds < 15) {
          publishControl(device_id, false, 'in', currentBalance, "Already Registered In");
          return;
        }

        // Defensive GPS Fallback check
        let finalAlightLat = lat;
        let finalAlightLng = lng;

        if (finalAlightLat === 0 || finalAlightLng === 0) {
          const { data: fallbackLoc } = await supabase
            .from('bus_locations')
            .select('lat, lng')
            .eq('bus_id', bus.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (fallbackLoc) {
            finalAlightLat = parseFloat(fallbackLoc.lat);
            finalAlightLng = parseFloat(fallbackLoc.lng);
          } else {
            finalAlightLat = parseFloat(activeTrip.board_lat);
            finalAlightLng = parseFloat(activeTrip.board_lng);
          }
        }

        // Fetch Route fare metrics configuration thresholds
        const { data: config } = await supabase.from('pricing_config').select('*').eq('route_id', bus.id).maybeSingle();
        const farePerKm = config ? parseFloat(config.fare_per_km) : 10.00;
        const minFare = config ? parseFloat(config.minimum_fare) : 15.00;

        const distance = calculateDistance(activeTrip.board_lat, activeTrip.board_lng, finalAlightLat, finalAlightLng);
        let computedFare = distance * farePerKm;
        if (computedFare < minFare) computedFare = minFare;

        const finalBalance = currentBalance - computedFare;

        // Commit safe balance atomic accounting updates via Supabase RPC function
        await supabase.rpc('process_tap_out', {
          p_trip_id: activeTrip.id,
          p_passenger_id: passengerId,
          p_account_id: accountId,
          p_fare: computedFare,
          p_distance: distance,
          p_alight_lat: finalAlightLat,
          p_alight_lng: finalAlightLng,
          p_new_balance: finalBalance
        });

        publishControl(device_id, true, 'out', finalBalance, "Fare Paid Successfully");
      }
    }
  } catch (err) {
    console.error("System processing pipeline crash: ", err);
  }
});

function publishControl(deviceId, allowed, status, balance, message) {
  const payload = JSON.stringify({ device_id: deviceId, allowed, status, balance, message });
  mqttClient.publish('bus/gate/control', payload);
}