// 1. Import the Express library and others
const express = require('express');
require('dotenv').config(); // Load environment variables from .env file
const { createClient } = require('@supabase/supabase-js');
// Add this to your imports at the top
const cors = require('cors');

// 2. Create an instance of an Express application
const app = express();

// Configure CORS with specific options
const corsOptions = {
  origin: 'https://elite-real.vercel.app', // Your Vercel frontend URL
  credentials: true, // Allow credentials if needed
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

// Use CORS middleware with the specific options
app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

// ... after const app = express();
app.use(express.json()); // This middleware allows our server to understand JSON data sent in requests

// 3. Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize the Supabase Admin Client for server-side operations
// This client uses the powerful service_role key which must be kept secret and never exposed to the browser.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // This is the new env variable you added on Render
);

// 4. Define the port number our server will listen on
const PORT = process.env.PORT || 3000;

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.sendStatus(401);
  }

  try {
    // Verify the token using Supabase
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      return res.sendStatus(403);
    }
    req.user = data.user; // Add user info to the request object
    next();
  } catch (error) {
    return res.sendStatus(403);
  }
};

// 5. Define a route to get the list of properties from Supabase (Public)
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

// Define a route to handle booking submissions (Public)
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

// Dashboard API Endpoints (Protected)

// GET /api/profile - Fetch user profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('realtors')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/profile - Update user profile
app.put('/api/profile', authenticateToken, async (req, res) => {
  const { name, company_name, email } = req.body;

  try {
    const { data, error } = await supabase
      .from('realtors')
      .update({ name, company_name, email })
      .eq('id', req.user.id)
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/realtor/properties - Fetch user's properties
app.get('/api/realtor/properties', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('realtor_id', req.user.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/realtor/properties - Create a new property
app.post('/api/realtor/properties', authenticateToken, async (req, res) => {
  const { title, location, price, bedrooms, bathrooms, imageUrl, description } = req.body;

  try {
    const { data, error } = await supabase
      .from('properties')
      .insert([
        {
          title,
          location,
          price,
          bedrooms,
          bathrooms,
          imageUrl,
          description,
          realtor_id: req.user.id
        }
      ])
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/realtor/properties/:id - Update a property
app.put('/api/realtor/properties/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, location, price, bedrooms, bathrooms, imageUrl, description } = req.body;

  try {
    // Verify the property belongs to the user
    const { data: property, error: fetchError } = await supabase
      .from('properties')
      .select('realtor_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      return res.status(404).json({ error: 'Property not found' });
    }

    if (property.realtor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { data, error } = await supabase
      .from('properties')
      .update({ title, location, price, bedrooms, bathrooms, imageUrl, description })
      .eq('id', id)
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/realtor/properties/:id - Delete a property
app.delete('/api/realtor/properties/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Verify the property belongs to the user
    const { data: property, error: fetchError } = await supabase
      .from('properties')
      .select('realtor_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      return res.status(404).json({ error: 'Property not found' });
    }

    if (property.realtor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/realtor/bookings - Fetch user's bookings
app.get('/api/realtor/bookings', authenticateToken, async (req, res) => {
  try {
    // Get all property IDs for the realtor
    const { data: properties, error: propertiesError } = await supabase
      .from('properties')
      .select('id')
      .eq('realtor_id', req.user.id);

    if (propertiesError) {
      return res.status(500).json({ error: propertiesError.message });
    }

    const propertyIds = properties.map(p => p.id);

    // Get bookings for these properties
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .in('property_id', propertyIds);

    if (bookingsError) {
      return res.status(500).json({ error: bookingsError.message });
    }

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/realtor/bookings/:id - Update booking status
app.put('/api/realtor/bookings/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    // Get the booking to find the property ID
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('property_id')
      .eq('id', id)
      .single();

    if (bookingError) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify the property belongs to the user
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('realtor_id')
      .eq('id', booking.property_id)
      .single();

    if (propertyError) {
      return res.status(404).json({ error: 'Property not found' });
    }

    if (property.realtor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Update the booking status
    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
}).on('error', (err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});