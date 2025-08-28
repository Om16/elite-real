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


// ./index.js

// ... your existing imports and app setup ...

// Initialize the Supabase Admin Client for server-side operations
// This client uses the powerful service_role key which must be kept secret and never exposed to the browser.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // This is the new env variable you added on Render
);





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



// ./index.js

// ... your existing code ...

// POST /api/auth/login - Secure server-side login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Use the server-side admin client to sign in the user
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      console.error('Login error:', error.message);
      return res.status(401).json({ error: error.message }); // Use 401 for auth failures
    }

    // On success, return the session data (which includes the user object and access token)
    res.status(200).json(data);

  } catch (error) {
    console.error('Unexpected server error during login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});




// ./index.js

// POST /api/auth/signup - Secure server-side user registration
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, company_name } = req.body;

    // Input validation
    if (!email || !password || !company_name) {
      return res.status(400).json({ error: 'Email, password, and company name are required' });
    }

    // 1. Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm the email
    });

    if (authError) {
      console.error('Signup auth error:', authError.message);
      return res.status(400).json({ error: authError.message });
    }

    // 2. Update the user's profile in the 'realtors' table with the company name
    // The trigger automatically created the row, so we update it.
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('realtors')
      .update({ company_name: company_name })
      .eq('id', authData.user.id);

    if (profileError) {
      console.error('Signup profile update error:', profileError.message);
      // Optional: You might want to delete the auth user if the profile update fails
      return res.status(500).json({ error: 'User created but profile update failed.' });
    }

    // 3. If everything is successful, return the auth data
    res.status(201).json(authData); // 201 status for successful creation

  } catch (error) {
    console.error('Unexpected server error during signup:', error);
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