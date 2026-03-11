const { Client } = require('ssh2');

let cachedTemp = null;
let lastFetch = 0;
const TTL_MS = 30000; // cache for 30 seconds

function runSSHCommand(command) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        let output = '';

        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { conn.end(); return reject(err); }
                stream.on('data', d => output += d.toString());
                stream.stderr.on('data', () => { }); // ignore stderr
                stream.on('close', () => {
                    conn.end();
                    resolve(output);
                });
            });
        }).on('error', reject).connect({
            host: process.env.PROXMOX_SSH_HOST,
            port: 22,
            username: process.env.PROXMOX_SSH_USER,
            password: process.env.PROXMOX_SSH_PASS,
            readyTimeout: 8000
        });
    });
}

/**
 * Get CPU Package temperature from Proxmox host via SSH using 'sensors -j'.
 * Caches result for 30 seconds to avoid too many SSH connections.
 * Returns temperature in °C as a number, or null if not available.
 */
async function getCPUTemperature() {
    const now = Date.now();
    if (cachedTemp !== null && (now - lastFetch) < TTL_MS) {
        return cachedTemp;
    }

    try {
        const raw = await runSSHCommand('sensors -j 2>/dev/null');
        const data = JSON.parse(raw);

        let maxTemp = null;

        for (const [adapterId, adapter] of Object.entries(data)) {
            // Focus on coretemp or CPU sensor
            if (adapterId.toLowerCase().includes('coretemp') || adapterId.toLowerCase().includes('k10temp')) {
                for (const [sensorName, sensorData] of Object.entries(adapter)) {
                    // Look for Package id or Tdie/Tctl
                    if (typeof sensorData === 'object') {
                        for (const [key, val] of Object.entries(sensorData)) {
                            if (key.endsWith('_input') && typeof val === 'number') {
                                if (maxTemp === null || val > maxTemp) maxTemp = val;
                            }
                        }
                    }
                }
            }
        }

        cachedTemp = maxTemp !== null ? Math.round(maxTemp) : null;
        lastFetch = now;
        return cachedTemp;
    } catch (err) {
        console.error('[Temperature SSH Error]', err.message);
        return null;
    }
}

module.exports = { getCPUTemperature };
