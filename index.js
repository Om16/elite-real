// 1. Import the Express library and others
const express = require('express');
require('dotenv').config(); // Load environment variables from .env file
const { createClient } = require('@supabase/supabase-js');
// Add this to your imports at the top
const cors = require('cors');

// 2. Create an instance of an Express application
const app = express();
// Add this after creating your Express app (after const app = express();)
app.use(cors()); // This enables CORS for all routes


// ... after const app = express();
app.use(express.json()); // This middleware allows our server to understand JSON data sent in requests

// 3. Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 4. Define the port number our server will listen on
const PORT = process.env.PORT || 3000;

// 5. Define a route to get the list of properties from Supabase
app.get('/api/properties', async (req, res) => {
  try {
    // Fetch data from the 'properties' table in Supabase
    const { data, error } = await supabase
      .from('properties')
      .select('*');

    if (error) {
      throw error;
    }

    // Send the fetched data as JSON response
    res.json(data);
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// 6. Define a route to handle booking submissions
app.post('/api/bookings', async (req, res) => {
  try {
    // Extract data from the request body (sent by the frontend form)
    const { property_id, customer_name, customer_email, booking_date, booking_time } = req.body;

    // Basic validation: check if required fields are provided
    if (!property_id || !customer_name || !customer_email || !booking_date || !booking_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Insert the new booking into the Supabase 'bookings' table
    const { data, error } = await supabase
      .from('bookings')
      .insert([
        {
          property_id: property_id,
          customer_name: customer_name,
          customer_email: customer_email,
          booking_date: booking_date,
          booking_time: booking_time
          // 'status' and 'created_at' will use their default values
        }
      ])
      .select(); // This returns the inserted row, helpful for confirmation

    if (error) {
      console.error('Supabase insertion error:', error);
      throw error;
    }

    // If successful, send back the newly created booking data
    res.status(201).json({ message: 'Booking created successfully!', booking: data[0] });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Could not create booking' });
  }
});

// 6. Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});