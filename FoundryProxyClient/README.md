# Foundry Proxy Client

This client tunnels your local FoundryVTT instance through a remote server, allowing your players to connect without port forwarding.

## Requirements

- [Node.js](https://nodejs.org/) v18 or higher
- FoundryVTT running locally

## Setup

1. **Install Node.js** from https://nodejs.org/

2. **Extract this folder** somewhere on your computer

3. **Open a terminal** in this folder:
   - Windows: Right-click in the folder → "Open in Terminal" 
   - Or press `Win+R`, type `cmd`, navigate to the folder

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Configure the client:**
   - Copy `.env.example` to `.env`
   - Edit `.env` and set your `AUTH_TOKEN` (provided by the admin)
   - Verify `FOUNDRY_URL` matches your Foundry setup (default: `http://localhost:30000`)

6. **Configure FoundryVTT**
  - Open your file explorer application
  - Navigate to your FoundryVTT folder
  - Open FoundryVTT/Config
  - Open options.json
  - change line 5: to be `"hostname": "34.168.219.227",`
  - Change line 10 to be `"proxyPort": "80",`
  - Save your changes
  
6. **Start FoundryVTT** on your computer

7. **Start the tunnel client:**
   ```bash
   npm start
   ```

8. You should see:
   ```
   ✓ Authentication successful! Tunnel is active.
   ```

9. **Share the server URL** with your players (e.g., `http://34.168.219.227`)

## Troubleshooting

- **"AUTH_TOKEN not set"** - Make sure you created `.env` from `.env.example`
- **"Authentication failed"** - Check your AUTH_TOKEN is correct
- **"Connection error"** - Check the SERVER_URL and your internet connection
- **Foundry not loading** - Make sure FoundryVTT is running locally first

## Stopping the Client

Press `Ctrl+C` in the terminal to stop the tunnel.