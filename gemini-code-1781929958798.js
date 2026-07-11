require('dotenv').config();
const mqtt = require('mqtt');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Initialize MQTT Client (TLS connection)
const mqttClient = mqtt.connect(`mqtts://${process.env.MQTT_BROKER}`, {
  port: 8883,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
});

// Helper: Haversine Formula for Distance Calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

mqttClient.on('connect', () => {
  console.log('Connected to EMQX Broker.');
  mqttClient.subscribe(['bus/tap', 'bus/location']);
});

mqttClient.on('message', async (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());

    // --- HANDLE RECURRENT GPS TRACKING ---
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

    // --- HANDLE TAP EVENT ---
    if (topic === 'bus/tap') {
      const { device_id, rfid_uid, lat, lng } = data;

      // 1. Fetch Passenger & Account details
      const { data: passenger, error: pErr } = await supabase
        .from('passengers')
        .select('id, accounts(id, balance)')
        .eq('rfid_uid', rfid_uid)
        .single();

      // 2. Fetch Bus Metadata
      const { data: bus } = await supabase.from('buses').select('id').eq('esp32_device_id', device_id).single();

      if (!passenger || !bus) {
        publishControl(device_id, false, null, 0, "Invalid Card/Bus");
        return;
      }

      const passengerId = passenger.id;
      const accountId = passenger.accounts.id;
      const currentBalance = parseFloat(passenger.accounts.balance);

      // Check for active trip (Status: in_progress)
      const { data: activeTrip } = await supabase
        .from('trips')
        .select('*')
        .eq('passenger_id', passengerId)
        .eq('status', 'in_progress')
        .order('board_time', { ascending: false })
        .maybeSingle();

      if (!activeTrip) {
        // --- PASSENGER BOARDING (TAP-IN) ---
        if (currentBalance < 100.00) {
          publishControl(device_id, false, 'out', currentBalance, "Low Balance!");
          return;
        }

        // Initialize a new trip entry
        await supabase.from('trips').insert({
          passenger_id: passengerId,
          bus_id: bus.id,
          board_lat: lat,
          board_lng: lng,
          status: 'in_progress'
        });

        publishControl(device_id, true, 'in', currentBalance, "Welcome Aboard");
      } else {
        // --- PASSENGER ALIGHTING (TAP-OUT) ---
        // Fetch pricing configs for this specific transit line
        const { data: config } = await supabase.from('pricing_config').select('*').eq('route_id', bus.id).maybeSingle();
        const farePerKm = config ? parseFloat(config.fare_per_km) : 10.00; // Fallback defaults
        const minFare = config ? parseFloat(config.minimum_fare) : 15.00;

        const distance = calculateDistance(activeTrip.board_lat, activeTrip.board_lng, lat, lng);
        let computedFare = distance * farePerKm;
        if (computedFare < minFare) computedFare = minFare;

        const finalBalance = currentBalance - computedFare;

        // Atomic Transaction: Update Accounts, close Trip, log Transaction, log Ticket
        await supabase.rpc('process_tap_out', {
          p_trip_id: activeTrip.id,
          p_passenger_id: passengerId,
          p_account_id: accountId,
          p_fare: computedFare,
          p_distance: distance,
          p_alight_lat: lat,
          p_alight_lng: lng,
          p_new_balance: finalBalance
        });

        publishControl(device_id, true, 'out', finalBalance, "Thank You!");
      }
    }
  } catch (err) {
    console.error("Error processing pipeline event:", err);
  }
});

function publishControl(deviceId, allowed, status, balance, message) {
  const payload = JSON.stringify({ device_id: deviceId, allowed, status, balance, message });
  mqttClient.publish('bus/gate/control', payload);
}