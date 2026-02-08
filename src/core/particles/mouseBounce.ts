import { RenderTexture, WebGLRenderer } from 'pixi.js';
import { GPUComputeVariable } from '../../utils/GPUComputeVariable';
import mouseBounceShader from './shaders/simulation/mouseBounce.shader';

interface MouseBounceRunnerOptions {
    renderer: WebGLRenderer;
    simulation: GPUComputeVariable;
    attributesTexture: RenderTexture;
}

export const createMouseBounceRunner = (options: MouseBounceRunnerOptions) => {
    const { renderer, simulation, attributesTexture } = options;
    const mouseBounceRunner = new GPUComputeVariable({
        name: 'uBounceMovement',
        renderer: renderer,
        width: simulation.width,
        height: simulation.height,
        fragmentShader: mouseBounceShader,
        samplers: {
            uAttributes: attributesTexture,
        },
        uniforms: {
            uPhase: { value: 0, type: 'f32' },
            uMassMultiplier: { value: 0.2, type: 'f32' },
            uForceAmplitude: { value: 3.0, type: 'f32' },
            uDampAmplitude: { value: 3, type: 'f32' },
            uMousePos: { value: [0.0, 0.0], type: 'vec2<f32>' },
            uMouseForceRadius: { value: 0.06, type: 'f32' },
            uMouseForceAmplitude: { value: 4.0, type: 'f32' },
            uMouseForcePow: { value: 1.0, type: 'f32' },
            uGlobalDamping: { value: 4.5, type: 'f32' },
            dt: { value: 0, type: 'f32' },
        },
        format: 'rgba32float',
        scaleMode: 'nearest',
    });
    mouseBounceRunner.setDependencies([simulation, mouseBounceRunner]);
    mouseBounceRunner.init();
    return mouseBounceRunner;
};
