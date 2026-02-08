import hashesShader from '../utils/hashes.shader';

/**
 * Particle attributes texture initialization shader.
 *
 * Each channel stores a normalized value (0..1):
 * - R: initialization start time
 * - G: initialization end time (G >= R + 0.05)
 * - B: orbit (uniform distribution)
 * - A: mass
 */
const initAttributesShader = /* glsl */ `
precision highp float;

#define MAX_INIT_PERIOD 0.1  // Maximum particle initialization duration in seconds

in vec2 vUV;
out vec4 finalColor;

uniform vec2 uTexSize;         // Particle texture size
uniform float uTotalParticles; // Total number of particles

${hashesShader}

void main() {
    // Particle index from UV coordinates
    vec2 particleIndex = floor(vUV * uTexSize);
    float linearIndex = particleIndex.y * uTexSize.x + particleIndex.x;
    vec2 seed = particleIndex + 0.5;
    
    // Initialization start time - random value in range [0, 0.95]
    // to guarantee that initEnd <= 1.0
    float initDuration = mix(0.01, MAX_INIT_PERIOD, hash(seed * 0.5)); // Random initialization duration
    float initEnd = mix(initDuration, 1.0, hash(seed * 1.5)); // Random initialization end time
    float initStart = initEnd - initDuration;
    
    // Orbit - uniform distribution in 4 groups
    // Particles with linearIndex % 4 == 0, 1, 2, 3 each group covers the full range 0..1
    float indexInGroup = floor(linearIndex / 4.0);
    float particlesPerGroup = uTotalParticles / 4.0;
    float orbit = indexInGroup / particlesPerGroup;
    // quantize orbit to 40 discrete values to reduce number of unique orbits (and thus number of unique SDF samples)
    orbit = floor(orbit * 10.0) / 10.0;
    
    // Mass - random value
    float mass = hash(seed * 3.0);
    
    finalColor = vec4(initStart, initEnd, orbit, mass);
}
`;

export default initAttributesShader;
