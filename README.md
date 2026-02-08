# SDF Particle Simulation

A real-time GPU-accelerated particle simulation built with **PixiJS**. Particles dynamically orbit around text
shapes using Signed Distance Fields (SDF) and spring-damper physics.

[Demo](https://prizemlenie.github.io/pixijs-sdf-particles/)

## Features

- **65,000 particles** rendered via GPU instancing
- **SDF-based physics** — particles are attracted to text contours using distance field gradients
- **Interactive** — mouse influence pushes particles away in real-time
- **Animated sequences** — choreographed motion with smooth transitions

> **Note:** The current limit of 65k particles is chosen for visual aesthetics — more particles would make the effect too dense.

## Tech Stack

- **PixiJS 8** — WebGL2 rendering framework
- **TypeScript** — strict mode, full type safety
- **Vite** — dev server and build
- **Anime.js** — timeline-based animations

## How It Works

### Signed Distance Fields (SDF)

Each letter of the text is rasterized into a separate texture. These textures are then processed using
**Jump Flooding Algorithm (JFA)** to generate SDF textures.

The SDF stores:

- **Gradient (xy)** — direction to the nearest edge
- **Distance (z)** — distance to the nearest edge in pixels

Particles sample the SDF at their position to determine:

1. How far they are from their target orbit
2. Which direction to move (along the gradient)

### GPU Particle Simulation

The simulation operates in a **resolution-independent coordinate space** (simulation units). Particle positions and velocities are normalized relative to the screen's shorter dimension, ensuring consistent behavior across different screen sizes and aspect ratios.

Particle state is stored in floating-point textures (`rgba32float`):

- **Movement texture**: position (xy) + velocity (zw)
- **Attributes texture**: init timing, orbit distance, mass, size

Physics runs entirely on the GPU using fragment shaders with ping-pong buffering.

Forces applied:

- **Spring force** — pulls particles toward their target orbit distance
- **Damping** — velocity damping along the SDF gradient
- **Tangential noise** — subtle perpendicular movement for organic feel
- **Mouse repulsion** — interactive force from cursor position

### GPUComputeVariable

A custom abstraction for GPGPU computation in PixiJS:

```typescript
const simulation = new GPUComputeVariable({
    renderer,
    name: 'uParticlesState',
    width: 256,
    height: 256,
    format: 'rgba32float',
    fragmentShader: simulationShader,
    uniforms: {
        dt: { value: 0, type: 'f32' },
        stiffness: { value: 3.0, type: 'f32' },
    },
    samplers: {
        uSdf: sdfTexture,
    },
});

simulation.setDependencies([simulation]); // Self-dependency for ping-pong
simulation.init();

// Each frame:
simulation.uniforms.dt.value = deltaTime;
simulation.compute();
```

Features:

- Automatic ping-pong texture management
- Dependency graph between compute variables
- Auto-injection of uniform declarations into shaders
- Type-safe uniform access

## Project Structure

```
src/
├── main.ts                     # Entry point
├── context.ts                  # App context & config (immutable runtime state)
├── animations/                 # Timeline-based animations
│   ├── index.ts                # Main timeline factory
│   ├── AnimationController.ts  # Animation state & GPU sync
│   ├── beatAnimation.ts        # "Beat" effect timeline
│   └── cursorAnimation.ts      # Cursor intro animation
├── core/
│   ├── sdf/
│   │   ├── generateTextMask.ts # Text → canvas → texture
│   │   └── generateSDFTex.ts   # JFA-based SDF generation
│   └── particles/
│       ├── particlesSimulation.ts  # Physics simulation setup
│       ├── ParticlesRenderer.ts    # Instanced particle rendering
│       ├── mouseBounce.ts          # Mouse interaction layer
│       └── shaders/
│           ├── simulation/         # Compute shaders
│           └── rendering/          # Vertex/fragment shaders
└── utils/
    ├── GPUComputeVariable.ts   # GPGPU abstraction
    └── renderToRt.ts           # Fullscreen shader utilities
```

## Running Locally

```bash
npm install
npm run dev
```

Open http://localhost:8080

## Build

```bash
npm run build
```

## License

MIT
