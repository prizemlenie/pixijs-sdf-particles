import hashesShader from '../utils/hashes.shader';
import simSpaceConversionShader from '../utils/simSpaceConversion.shader';
import sampleSdfShader from '../utils/sampleSdf.shader';

/**
 * Particle simulation shader with SDF-based spring-damper physics.
 *
 * Particles are attracted to their orbits (SDF-distances) using spring force.
 * Damping acts along the SDF gradient.
 */
const simulationShader = /* glsl */ `
precision highp float;

in vec2 vUV;
out vec4 finalColor;

uniform vec2 uTexSize;             // Particle texture size

uniform float dt;                  // Time since previous frame (milliseconds)
uniform float uPhase;              // Simulation phase
uniform float stiffness;           // Spring stiffness
uniform float damping;             // Damping coefficient along gradient
uniform float globalDamping;       // Global damping (exponential decay)
uniform float massMultiplier;      // Mass multiplier
uniform float orbitMultiplier;     // Orbit multiplier
uniform float orbitOffset;         // Orbit offset
uniform float sdfResolutionMultiplier; // SDF to simulation resolution ratio
uniform float tangentialNoiseAmplitude; // Tangential noise amplitude

// Movement texture (position + velocity) - ping-pong
uniform sampler2D uParticlesState;

// Attributes texture (initStart, initEnd, orbit, mass)
uniform sampler2D uAttributes;

${simSpaceConversionShader}
${hashesShader}
${sampleSdfShader}

void main() {
    // Get current particle state
    vec4 movement = texture(uParticlesState, vUV);
    vec2 position = movement.xy;  // in sim units
    vec2 velocity = movement.zw;  // in sim units/sec
    
    // Get particle attributes
    vec4 attributes = texture(uAttributes, vUV);
    float initStart = attributes.r;
    float initEnd = attributes.g;
    float orbit = attributes.b;
    float massAttr = attributes.a;
    
    // Calculate linear particle index
    vec2 particleIndex = floor(vUV * uTexSize);
    int linearIndex = int(particleIndex.y * uTexSize.x + particleIndex.x);
    
    // Select SDF texture by particle index
    int sdfIndex = linearIndex - (linearIndex / 4) * 4;  // linearIndex % 4
    
    // Sample SDF at particle position
    vec2 sdfUv = simToUv(position);
    vec3 sdfData = sampleSdf(sdfIndex, sdfUv);
    vec2 gradient = sdfData.xy;
    float sdfDistPx = sdfData.z;  // distance in SDF texture pixels
    
    // Convert distance to sim units
    // sdfDistPx - distance in SDF texture pixels
    // sdfResolutionMultiplier * uS - SDF pixels per 1 sim unit
    float sdfDistSim = sdfDistPx / (sdfResolutionMultiplier * uS);
    
    // Calculate target orbit in sim units
    float targetOrbit = orbitMultiplier * (orbit + orbitOffset);
    
    // Calculate particle mass
    float mass = max(massMultiplier * massAttr, 0.05);
    // Protection from division by zero
    mass = max(mass, 0.0001);
    
    // Normalized gradient direction
    float gradLen = length(gradient);
    vec2 gradientDir = gradLen > 0.0001 ? gradient / gradLen : vec2(0.0);
    vec2 tangentDir = vec2(-gradientDir.y, gradientDir.x);
    
    // Convert dt to seconds
    float dtSec = dt / 1000.0;
    
    // Calculate forces only if particle is active (initEnd <= uPhase)
    vec2 F_total = vec2(0.0);
    
    if (initEnd <= uPhase) {
        float tangentialNoiseMagnitude = (texture(uNoise, sdfUv * 5.0 + vec2(0.0, dtSec * 0.1)).r * 2.0 - 1.0) * tangentialNoiseAmplitude;
        // Spring force: attracts to target orbit
        // If particle is closer to surface (sdfDistSim < targetOrbit) - push along gradient
        // If particle is farther (sdfDistSim > targetOrbit) - pull against gradient
        vec2 F_spring = (targetOrbit - sdfDistSim) * stiffness * gradientDir;
        F_spring += vec2(F_spring.y, -F_spring.x) * tangentialNoiseMagnitude; // Add tangential noise
        float tangentForceSign = sdfIndex == 2 || sdfIndex == 0 ? -1.0 : 1.0; // Alternate tangential force direction for different letters
        vec2 F_tangent = vec2(gradientDir.y, -gradientDir.x) * 0.01 * tangentForceSign; // Constant magnitude tangential force, perpendicular to gradient
        // Smoothly transition from spring force to tangential when approaching orbit
        vec2 F_result = mix(F_spring, F_tangent, smoothstep(0.003, 0.001, abs(sdfDistSim - targetOrbit)));
        
        float velAlongGradient = dot(velocity, gradientDir);
        float velAlongTangent = dot(velocity, tangentDir);
        vec2 F_dampTangent = -uTangentialDamping * velAlongTangent * tangentDir;
        // Damping force along gradient
        vec2 F_damp = -damping * velAlongGradient * gradientDir;

        F_total = F_result + F_damp + F_dampTangent;
    }
    
    // Euler integration
    vec2 acceleration = F_total / mass;
    velocity += acceleration * dtSec;
    
    // Exponential global damping
    velocity *= exp(-globalDamping * dtSec);
    
    // Update position
    position += velocity * dtSec;
    
    finalColor = vec4(position, velocity);
}
`;

export default simulationShader;
