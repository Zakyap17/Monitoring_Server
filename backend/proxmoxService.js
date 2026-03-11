const axios = require('axios');
const https = require('https');
const { getCPUTemperature } = require('./sshTemperature');

class ProxmoxService {
    constructor() {
        this.baseURL = process.env.PROXMOX_URL;
        this.user = process.env.PROXMOX_USER;
        this.tokenSecret = process.env.PROXMOX_TOKEN_SECRET;

        this.client = axios.create({
            baseURL: `${this.baseURL}/api2/json`,
            headers: {
                'Authorization': `PVEAPIToken=${this.user}=${this.tokenSecret}`
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 10000
        });
    }

    async getNodes() {
        const res = await this.client.get('/nodes');
        return res.data.data;
    }

    // Cluster status: CPU, RAM, Temperature
    async getClusterStatus() {
        const nodes = await this.getNodes();

        let totalCpuPercent = 0;
        let totalMemUsedGB = 0;
        let totalMemMaxGB = 0;
        let totalNetMbps = 0;

        for (const node of nodes) {
            const statusRes = await this.client.get(`/nodes/${node.node}/status`);
            const status = statusRes.data.data;

            totalCpuPercent += (status.cpu * 100);
            totalMemUsedGB += status.memory.used / (1024 ** 3);
            totalMemMaxGB += status.memory.total / (1024 ** 3);

            // Get netin + netout from RRD (bytes/sec) and convert to Mbps
            try {
                const rrdRes = await this.client.get(`/nodes/${node.node}/rrddata?timeframe=hour`);
                const latest = rrdRes.data.data[rrdRes.data.data.length - 1];
                if (latest?.netin != null && latest?.netout != null) {
                    const bytesPerSec = (latest.netin + latest.netout);
                    totalNetMbps += (bytesPerSec * 8) / 1_000_000;
                }
            } catch (_) { }
        }

        const avgCpu = Math.round(totalCpuPercent / nodes.length);
        const memPercent = Math.round((totalMemUsedGB / totalMemMaxGB) * 100);
        const temp = await getCPUTemperature();
        const internet = parseFloat(totalNetMbps.toFixed(1));

        return {
            cpu: avgCpu,
            memory: memPercent,
            memUsedGB: totalMemUsedGB.toFixed(1),
            memTotalGB: totalMemMaxGB.toFixed(1),
            temp,
            internet
        };
    }

    // Get 1-hour historical data for the chart (CPU and Memory)
    async getClusterHistory() {
        const nodes = await this.getNodes();
        if (nodes.length === 0) return [];

        try {
            // Fetch timeframe=hour from the first node
            const rrdRes = await this.client.get(`/nodes/${nodes[0].node}/rrddata?timeframe=hour`);
            const rrdData = rrdRes.data.data;

            // Filter out nulls and take the last 15 data points
            const validPoints = rrdData.filter(p => p.cpu != null && p.memused != null);
            const lastPoints = validPoints.slice(-15);

            const history = [];
            for (const p of lastPoints) {
                // format time as HH:MM
                const date = new Date(p.time * 1000);
                const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                history.push({
                    time,
                    CPU: parseFloat((p.cpu * 100).toFixed(1)),
                    Memory: parseFloat(((p.memused / p.memtotal) * 100).toFixed(1))
                });
            }
            return history;
        } catch (error) {
            console.error('[History Error]', error.message);
            return [];
        }
    }

    // Real disk/storage data from Proxmox
    async getDiskUsage() {
        const nodes = await this.getNodes();
        const allDisks = [];

        for (const node of nodes) {
            try {
                const storageRes = await this.client.get(`/nodes/${node.node}/storage`);
                for (const s of storageRes.data.data) {
                    if (!s.active || !s.total) continue;
                    const usedPercent = Math.round(s.used_fraction * 100);
                    const usedGB = (s.used / (1024 ** 3)).toFixed(1);
                    const totalGB = (s.total / (1024 ** 3)).toFixed(1);
                    allDisks.push({
                        id: s.storage,
                        usedGB,
                        totalGB,
                        usage: usedPercent
                    });
                }
            } catch (_) { }
        }
        return allDisks;
    }

    // All VMs and LXC containers
    async getVMsStatus() {
        const nodes = await this.getNodes();
        const allVMs = [];

        for (const node of nodes) {
            try {
                const qemuRes = await this.client.get(`/nodes/${node.node}/qemu`);
                for (const vm of qemuRes.data.data) {
                    allVMs.push({
                        id: String(vm.vmid),
                        name: vm.name || `VM-${vm.vmid}`,
                        type: 'QEMU',
                        cpu: vm.cpu ? `${(vm.cpu * 100).toFixed(1)}%` : '0%',
                        ram: vm.mem ? `${(vm.mem / (1024 ** 3)).toFixed(1)} GB` : '0 GB',
                        status: vm.status === 'running' ? 'Online' : 'Offline'
                    });
                }
            } catch (_) { }

            try {
                const lxcRes = await this.client.get(`/nodes/${node.node}/lxc`);
                for (const ct of lxcRes.data.data) {
                    allVMs.push({
                        id: String(ct.vmid),
                        name: ct.name || `CT-${ct.vmid}`,
                        type: 'LXC',
                        cpu: ct.cpu ? `${(ct.cpu * 100).toFixed(1)}%` : '0%',
                        ram: ct.mem ? `${(ct.mem / (1024 ** 3)).toFixed(1)} GB` : '0 GB',
                        status: ct.status === 'running' ? 'Online' : 'Offline'
                    });
                }
            } catch (_) { }
        }

        return allVMs.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    }
}

module.exports = new ProxmoxService();
