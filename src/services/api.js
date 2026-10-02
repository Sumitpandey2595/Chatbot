import axios from 'axios';

// Create an axios instance
const api = axios.create({
  // Proxy handles the /api prefix in development, but we can configure base URL if needed
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
