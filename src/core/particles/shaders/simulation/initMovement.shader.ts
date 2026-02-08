import simSpaceConversionShader from '../utils/simSpaceConversion.shader';
import hashesShader from '../utils/hashes.shader';

/**
 * Movement texture initialization shader (position + velocity).
 */
const initMovementShader = /* glsl */ `
precision highp float;

in vec2 vUV;
out vec4 finalColor;

uniform vec2 uTexSize;         // Particle texture size

${simSpaceConversionShader}
${hashesShader}

void main() {
    // Particle index from UV coordinates
    vec2 particleIndex = floor(vUV * uTexSize);
    vec2 seed = particleIndex + 0.5;
    
    // Generate position in simulation units
    vec2 position = uvToSim(hash2(seed));
    
    // Initial velocity = 0
    vec2 velocity = vec2(0.0);
    
    finalColor = vec4(position, velocity);
}
`;

export default initMovementShader;
