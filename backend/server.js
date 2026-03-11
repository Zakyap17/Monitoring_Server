require('dotenv').config();
const express = require('express');
const cors = require('cors');
const proxmoxService = require('./proxmoxService');

const app = express();
const PORT = process.env.PORT || 5000;

const path = require('path');

app.use(cors());
app.use(express.json());

// Serve React production build
const frontendBuild = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendBuild));

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Monitoring Backend is running' });
});

// GET /api/cluster/status - Returns CPU%, Memory%, Temperature from all nodes
app.get('/api/cluster/status', async (req, res) => {
    try {
        const data = await proxmoxService.getClusterStatus();
        res.json(data);
    } catch (error) {
        console.error('[Cluster Status Error]', error.message);
        res.status(500).json({ error: 'Failed to fetch cluster status. Check your .env credentials.' });
    }
});

// GET /api/cluster/history - Returns historical CPU and Memory usage for the chart
app.get('/api/cluster/history', async (req, res) => {
    try {
        const data = await proxmoxService.getClusterHistory();
        res.json(data);
    } catch (error) {
        console.error('[Cluster History Error]', error.message);
        res.status(500).json({ error: 'Failed to fetch cluster history.' });
    }
});

// GET /api/vms/status - Returns a list of all VMs and containers with CPU, RAM, Online/Offline
app.get('/api/vms/status', async (req, res) => {
    try {
        const data = await proxmoxService.getVMsStatus();
        res.json(data);
    } catch (error) {
        console.error('[VMs Status Error]', error.message);
        res.status(500).json({ error: 'Failed to fetch VMs status. Check your .env credentials.' });
    }
});

// GET /api/disks/usage - Returns real storage volume usage from all Proxmox nodes
app.get('/api/disks/usage', async (req, res) => {
    try {
        const data = await proxmoxService.getDiskUsage();
        res.json(data);
    } catch (error) {
        console.error('[Disk Usage Error]', error.message);
        res.status(500).json({ error: 'Failed to fetch disk usage.' });
    }
});

// Catch-all: serve React app for any non-API routes
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(frontendBuild, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Backend running → http://localhost:${PORT}`);
    console.log(`   Proxmox URL: ${process.env.PROXMOX_URL || '⚠️  Not set in .env'}`);
    console.log(`   LAN access  → http://<IP-PC-ANDA>:${PORT}`);
});
