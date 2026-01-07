# NetOps 3D Digital Twin System

This directory contains the frontend for the NetOps Network Operations Digital Twin System.

## Project Structure

```
src/
├── components/          # React components
│   ├── 3d/             # 3D scene components
│   ├── ui/             # UI components
│   └── layout/           # Layout components
├── hooks/               # Custom React hooks
├── stores/              # Zustand state management
├── utils/               # Utility functions
├── types/               # TypeScript type definitions
└── assets/              # Static assets
    ├── models/          # 3D models
    └── textures/        # Textures and materials
```

## Key Technologies

- **React 18** with TypeScript
- **Three.js** for 3D rendering
- **React Three Fiber** for React integration
- **Tailwind CSS** for styling
- **Zustand** for state management

## Getting Started

```bash
npm install
npm run dev
```

## Features

- 3D network topology visualization
- Interactive device management
- Real-time status monitoring
- YAML configuration import/export
- Responsive design
