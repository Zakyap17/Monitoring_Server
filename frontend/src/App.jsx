import { useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import './index.css'

const API_BASE = '/api'

// App Component
const Gauge = ({ label, value, color, unit = '%' }) => {
  const safeValue = Math.min(Math.max(Number(value) || 0, 0), 100)
  const data = [
    { name: 'Used', value: safeValue },
    { name: 'Free', value: 100 - safeValue }
  ]
  return (
    <div className="gauge-item" style={{ height: 'auto' }}>
      <div className="gauge-label">{label}</div>
      <div style={{ width: '100%', height: '70px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="100%"
              startAngle={180} endAngle={0}
              innerRadius={30} outerRadius={40}
              paddingAngle={0} dataKey="value" stroke="none"
            >
              <Cell key="cell-0" fill={color} />
              <Cell key="cell-1" fill="rgba(255,255,255,0.05)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="gauge-value" style={{ whiteSpace: 'nowrap' }}>
        {value != null ? `${value}${unit}` : '—'}
      </div>
    </div>
  )
}

// Loading/Error indicator
const StatusDot = ({ connected }) => (
  <span style={{
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
    background: connected ? 'var(--accent-green)' : 'var(--accent-red)',
    marginRight: 6, boxShadow: connected ? '0 0 6px var(--accent-green)' : '0 0 6px var(--accent-red)'
  }} />
)

function App() {
  const [cluster, setCluster] = useState(null)
  const [history, setHistory] = useState([])
  const [vms, setVMs] = useState([])
  const [disks, setDisks] = useState([])
  const [connected, setConnected] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)

  const fetchData = async () => {
    try {
      const [clusterRes, historyRes, vmsRes, disksRes] = await Promise.all([
        fetch(`${API_BASE}/cluster/status`),
        fetch(`${API_BASE}/cluster/history`),
        fetch(`${API_BASE}/vms/status`),
        fetch(`${API_BASE}/disks/usage`)
      ])
      if (!clusterRes.ok || !historyRes.ok || !vmsRes.ok || !disksRes.ok) throw new Error('API returned error status')

      const clusterData = await clusterRes.json()
      const historyData = await historyRes.json()
      const vmsData = await vmsRes.json()
      const disksData = await disksRes.json()

      setCluster(clusterData)
      setHistory(historyData)
      setVMs(vmsData)
      setDisks(disksData)
      setConnected(true)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setConnected(false)
      setError(err.message)
    }
  }

  useEffect(() => {
    fetchData()
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="dashboard-layout">
      <main className="main-content">
        <header className="header">
          <h1 className="header-title">Monitoring Dashboard</h1>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <StatusDot connected={connected} />
            {connected ? `Live · Updated ${lastUpdated?.toLocaleTimeString()}` : (error ? `Disconnected · ${error}` : 'Connecting...')}
          </div>
        </header>

        <div className="dashboard-grid">
          {/* Server Activity Chart (full width) */}
          <div className="card chart-card">
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              SERVER ACTIVITY (Real-time CPU & Memory)
              <div style={{ display: 'flex', gap: '1rem', textTransform: 'none', fontSize: '11px' }}>
                <span style={{ color: 'var(--accent-cyan)' }}>● CPU</span>
                <span style={{ color: 'var(--accent-blue)' }}>● Memory</span>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: '180px', marginTop: '10px' }}>
              {history.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Memuat data history...</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorS1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-cyan)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--accent-cyan)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorS2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'rgba(255,255,255,0.1)' }} itemStyle={{ color: 'var(--text-main)' }} />
                    <Area type="monotone" dataKey="CPU" stroke="var(--accent-cyan)" strokeWidth={2} fillOpacity={1} fill="url(#colorS1)" />
                    <Area type="monotone" dataKey="Memory" stroke="var(--accent-blue)" strokeWidth={2} fillOpacity={1} fill="url(#colorS2)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Resource Gauges - live data */}
            <div className="gauges-container">
              <Gauge label="CPU" value={cluster?.cpu ?? '—'} color="var(--accent-blue)" />
              <Gauge label="Memory" value={cluster?.memory ?? '—'} color="var(--accent-blue)" />
              <Gauge label="Internet Speed" value={cluster?.internet ?? '—'} color="var(--accent-cyan)" unit=" Mbps" />
              <Gauge label="Temp" value={cluster?.temp ?? 'N/A'} color="var(--accent-yellow)" unit={cluster?.temp != null ? '°C' : ''} />
            </div>
          </div>

          {/* VM Status Table - live data */}
          <div className="card table-card" style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>VM STATUS</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Real-time Monitor | <span style={{ color: 'var(--text-main)' }}>Live</span>
              </div>
            </div>

            <table className="ticket-table">
              <thead>
                <tr>
                  <th>Node/ID</th>
                  <th>VM Name</th>
                  <th>Type</th>
                  <th>CPU Usage</th>
                  <th>RAM Usage</th>
                  <th style={{ textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {vms.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    {connected ? 'No VMs found' : 'Waiting for connection to backend…'}
                  </td></tr>
                ) : (
                  vms.map(vm => (
                    <tr key={vm.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{vm.id}</td>
                      <td style={{ fontWeight: 500, color: 'var(--text-main)' }}>{vm.name}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{vm.type}</td>
                      <td>{vm.cpu}</td>
                      <td>{vm.ram}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`status-badge ${vm.status.toLowerCase()}`}>{vm.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Disk Usage - Live from Proxmox */}
          <div className="card progress-card" style={{ marginTop: '1.5rem' }}>
            <div className="card-title">DISK SPACE USAGE</div>
            <div className="progress-list">
              {disks.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem' }}>Memuat data disk...</div>
              ) : (
                disks.map(disk => (
                  <div className="progress-item" key={disk.id}>
                    <div className="progress-label" style={{ width: '80px' }}>{disk.id}</div>
                    <div className="progress-bar-container">
                      <div className="progress-bar-fill" style={{ width: `${disk.usage}%` }}></div>
                    </div>
                    <div className="progress-value">{disk.usage}%</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
