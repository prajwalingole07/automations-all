import net from 'net';

// Central dynamic port pool (3100 - 3999) to completely avoid hardcoded 3000 / 5000 / 8080 conflicts
const PORT_RANGE_START = 3100;
const PORT_RANGE_END = 3999;
const allocatedPorts = new Map<number, { jobId: string; machineId: string; allocatedAt: number }>();

export const portManager = {
  /**
   * Check if a specific TCP port is currently free on the local machine
   */
  isPortAvailable: (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => {
        resolve(false);
      });
      server.listen(port, () => {
        server.close(() => {
          resolve(true);
        });
      });
    });
  },

  /**
   * Allocate a fresh, unoccupied dynamic port for an automation job
   */
  allocatePort: async (jobId: string, machineId: string): Promise<number> => {
    // Clean up stale allocations older than 24 hours
    const now = Date.now();
    for (const [p, info] of Array.from(allocatedPorts.entries())) {
      if (now - info.allocatedAt > 86400000) {
        allocatedPorts.delete(p);
      }
    }

    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
      if (!allocatedPorts.has(port)) {
        const available = await portManager.isPortAvailable(port);
        if (available) {
          allocatedPorts.set(port, { jobId, machineId, allocatedAt: now });
          return port;
        }
      }
    }

    // Fallback pseudo-random port
    const fallbackPort = Math.floor(Math.random() * (49000 - 40000) + 40000);
    allocatedPorts.set(fallbackPort, { jobId, machineId, allocatedAt: now });
    return fallbackPort;
  },

  /**
   * Release a port after job completion or cancellation
   */
  releasePort: (port: number) => {
    allocatedPorts.delete(port);
  },

  /**
   * Get all actively allocated ports
   */
  getActiveAllocations: () => {
    return Array.from(allocatedPorts.entries()).map(([port, info]) => ({
      port,
      jobId: info.jobId,
      machineId: info.machineId,
      allocatedAt: new Date(info.allocatedAt).toISOString()
    }));
  }
};
