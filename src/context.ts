import { Application, Renderer } from 'pixi.js';

/**
 * Static configuration constants that don't depend on runtime.
 */
export const CONFIG = {
    /** SDF texture resolution multiplier relative to base resolution */
    sdfResolutionFactor: 0.5,
    /** Total number of particles in the simulation */
    particlesCount: 64000,
    /** Orbit distance multiplier for particle positioning */
    orbitMultiplier: 0.035,
} as const;

/**
 * Runtime application context created after PixiJS initialization.
 * Contains resolution-dependent values and coordinate conversion utilities.
 */
export interface AppContext {
    /** Base resolution captured at initialization (used for simulation space) */
    readonly baseResolution: { readonly width: number; readonly height: number };
    /** Short dimension reference for simulation units (equals baseResolution.width) */
    readonly s: number;
    /** Reference to the PixiJS application */
    readonly app: Application<Renderer>;
    /**
     * Converts screen pixel coordinates to simulation units.
     * Simulation space is centered at (0, 0) with units relative to screen width.
     */
    pxToSim: (x: number, y: number) => [number, number];
}

/**
 * Creates the application context after PixiJS app initialization.
 * This context provides resolution-aware utilities for the simulation.
 *
 * @param app - Initialized PixiJS Application
 * @returns Immutable application context
 *
 */
export function createAppContext(app: Application<Renderer>): AppContext {
    const baseResolution = Object.freeze({
        width: app.screen.width,
        height: app.screen.height,
    });

    const s = baseResolution.width;

    const pxToSim = (x: number, y: number): [number, number] => {
        const scale = app.screen.width / baseResolution.width;
        const xSim = (x - app.screen.width / 2) / scale / s;
        const ySim = (y - app.screen.height / 2) / scale / s;
        return [xSim, ySim];
    };

    return Object.freeze({
        baseResolution,
        s,
        app,
        pxToSim,
    });
}
