<h1 align="center">Browser Container Manager <br/> Docker-based</h1>

[![GitHub License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)

Browser Manager is a Node.js service for orchestrating and managing containerized browser instances using Docker.

## 🚀 Features

- 🐳 Docker-based browser container management
- 🔄 Automatic container lifecycle management
- 📊 Dynamic port allocation
- 🔌 WebSocket-based communication
- 🖥️ Configurable screen resolutions
- 🔐 VNC access support
- 🏷️ Custom label support
- 🪝 Simple webhook
- 🔄 Automatic recovery and health checks

## 🛠️ Installation

1. Install the package:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Start the service:
```bash
npm start
```

## 🔧 Configuration

| Option | Description | Default |
|--------|-------------|---------|
| browserImageName | Docker image for browsers | browser-node-ts |
| browserPrefix | Prefix for container names | browser-node-instance |
| numBrowsers | Number of browser instances | 4 |
| baseBrowserPort | Starting port for browser debugging | 10222 |
| baseBrowserAppPort | Starting port for browser app | 7070 |
| baseBrowserVncPort | Starting port for VNC access | 15900 |
| resolution | Default viewport resolution | 1280x2400 |
| maxRetries | Max retry attempts for operations | 15 |
| killWaitTime | Wait time between kill attempts (ms) | 2000 |
| isSudo | Run commands with sudo | true |

> ⚠️ **Warning**: Modifying port configurations (baseBrowserPort, baseBrowserAppPort, baseBrowserVncPort) may cause compatibility issues with other services or existing setups. Ensure the ports you choose are available and don't conflict with other applications.

### Prerequisites

- Docker must be installed and running on your system
  - [Install Docker](https://docs.docker.com/get-docker/)
  - Recommended: Docker version latest
- Node.js 20 or higher
- npm 10 or higher
- At least 2GB of free RAM for running multiple browser instances
- Sufficient disk space for Docker images

## 🔧 API Reference

### Endpoints

#### Get Browser
POST /getBrowser

Request body:
```typescript
{
    sessionID: string, // Required: Unique session identifier
    leaseTime: number, // Required: Lease duration in minutes (1-60)
    browserID?: string, // Optional: Specific browser ID to request (Recommend to use )
    clientID?: string, // Optional: Client identifier
    callbackURL?: string, // Optional: Webhook URL for notifications
    fingerprintID?: string, // Optional: Browser fingerprint ID
    proxyServer?: string, // Optional: Proxy server URL
    proxyAuth?: string, // Optional: Proxy authentication (username:password)
    viewport?: { // Optional: Custom viewport settings
        width: number,
        height: number
    },
    vncMode?: "ro" | "rw", // Optional: VNC access mode (read-only/read-write)
    isPasswordProtected?: boolean // Optional: VNC password protection
}
```

#### Free Browser
POST /freeBrowser

Request body:
```typescript
{
    browserID: string // Required: Browser ID to release
}
```

#### Get All Browsers
GET /getAll

Response body:
```typescript
{
    capacity: number, // Total browser capacity
    used: number, // Currently active browsers
    browsers: Browser[] // Array of browser instances
}
```

## 🔍 Monitoring

The service provides detailed logging through Pino logger:
- Container lifecycle events
- WebSocket connections
- Error states
- Performance metrics

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Projects

- [Browser Node](https://github.com/Ajent-foundation/browser-node)
- [Tasknet Node Software](https://github.com/Ajent-foundation/tasknet-node)
---
